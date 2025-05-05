import { FlashcardState, CardGroup } from '../types/FSRSTypes';
import { FSRSService } from './FSRSService';
import { HiNote } from '../../CommentStore';

/**
 * 闪卡工厂类，负责创建和处理闪卡
 */
export class FlashcardFactory {
    private fsrsService: FSRSService;
    private plugin: any;

    constructor(plugin: any, fsrsService: FSRSService) {
        this.plugin = plugin;
        this.fsrsService = fsrsService;
    }

    /**
     * 创建单个闪卡
     * @param text 卡片正面文本
     * @param answer 卡片背面文本
     * @param filePath 关联的文件路径
     * @returns 创建的闪卡
     */
    public createCard(text: string, answer: string, filePath?: string): FlashcardState {
        return this.fsrsService.initializeCard(text, answer, filePath);
    }

    /**
     * 从高亮创建闪卡
     * @param highlight 高亮对象
     * @returns 创建的闪卡
     */
    public createCardFromHighlight(highlight: HiNote): FlashcardState | null {
        console.log(`开始从高亮创建闪卡: ${highlight.id}`);
        console.log(`高亮内容: ${highlight.text}`);
        console.log(`文件路径: ${highlight.filePath}`);
        console.log(`评论数量: ${highlight.comments?.length || 0}`);
        
        if (!highlight) {
            console.log('高亮对象为空，不创建闪卡');
            return null;
        }
        
        // 如果没有文件路径，尝试从其他属性中获取
        if (!highlight.filePath) {
            console.log('高亮缺少文件路径，尝试从其他属性中获取');
            // 检查高亮对象的其他属性
            console.log('高亮对象属性:', Object.keys(highlight));
            
            // 如果有 path 属性，使用它
            if ((highlight as any).path) {
                highlight.filePath = (highlight as any).path;
                console.log(`使用 path 属性作为文件路径: ${highlight.filePath}`);
            } else {
                // 如果没有文件路径，使用默认值
                highlight.filePath = 'unknown.md';
                console.log('使用默认文件路径: unknown.md');
            }
        }

        let isCloze = false;
        let clozeText = highlight.text;
        let clozeAnswers: string[] = [];
        
        // 检查是否为挖空格式：{{内容}}
        const clozeRegex = /\{\{([^{}]+)\}\}/g;
        let match;
        let matchCount = 0;
        
        // 使用循环查找所有挖空
        while ((match = clozeRegex.exec(highlight.text)) !== null) {
            matchCount++;
            console.log(`检测到挖空 #${matchCount}，内容: ${match[1]}`);
            clozeAnswers.push(match[1]);
        }
        
        if (matchCount > 0) {
            console.log(`共找到 ${matchCount} 个挖空`);
            isCloze = true;
            
            // 正面隐藏内容，动态下划线长度
            clozeText = highlight.text.replace(/\{\{([^{}]+)\}\}/g, (match, p1) => '＿'.repeat(p1.length));
        } else {
            console.log('不是挖空格式');
        }
        
        // 合并所有评论作为答案
        let answer = highlight.comments?.length ? highlight.comments.map(c => c.content).join('<hr>') : '';
        console.log(`评论答案: ${answer ? answer.substring(0, 50) + '...' : '(无)'}`);
        
        // 挖空格式优先，若有则拼接答案
        if (isCloze && clozeAnswers.length > 0) {
            // 将所有挖空答案合并
            const combinedClozeAnswer = clozeAnswers.join('\n');
            answer = answer ? (answer + '<hr>' + combinedClozeAnswer) : combinedClozeAnswer;
            console.log(`最终答案(挖空): ${answer.substring(0, 50)}...`);
        }
        
        // 如果没有评论且不是挖空格式，则不创建闪卡
        if (!answer && !isCloze) {
            console.log('没有评论且不是挖空格式，不创建闪卡');
            return null;
        }
        
        // 强制创建闪卡，即使没有答案
        if (!answer && isCloze && clozeAnswers.length > 0) {
            // 将所有挖空答案合并
            answer = clozeAnswers.join('\n') || '无答案';
            console.log(`没有评论但是挖空格式，使用挖空内容作为答案: ${answer}`);
        }
        
        // 创建闪卡
        console.log('开始创建闪卡...');
        const card = this.createCard(clozeText, answer, highlight.filePath);
        
        if (card) {
            console.log(`闪卡创建成功，ID: ${card.id}`);
        } else {
            console.log('闪卡创建失败');
        }
        
        return card;
    }

    /**
     * 从标签文本中提取标签
     * @param text 包含标签的文本
     * @returns 提取的标签数组
     */
    public extractTagsFromText(text: string): string[] {
        if (!text) return [];
        
        const tagRegex = /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g;
        const matches = [...text.matchAll(tagRegex)];
        
        return matches.map(match => match[1]);
    }

    /**
     * 根据分组条件生成闪卡
     * @param group 分组对象
     * @param addCardCallback 添加卡片的回调函数
     * @returns 新创建的卡片数量
     */
    public async generateCardsForGroup(
        group: CardGroup, 
        addCardCallback: (card: FlashcardState, groupId: string) => void
    ): Promise<number> {
        if (!group) return 0;
        
        // 获取所有文件
        const allFiles = this.plugin.app.vault.getMarkdownFiles();
        const highlightService = this.plugin.highlightService;
        const commentStore = this.plugin.commentStore;
        
        // 根据分组过滤条件筛选文件
        const filteredFiles = this.filterFilesByGroupCriteria(group, allFiles, highlightService);
        
        // 计数新创建的卡片
        let newCardsCount = 0;
        
        // 遍历所有文件，获取高亮/评论
        for (const file of filteredFiles) {
            const fileHighlights = commentStore.getFileComments(file as any);
            
            // 筛选有效的高亮
            const validHighlights = this.filterValidHighlights(fileHighlights, group);
            
            // 为每个符合条件的高亮/评论创建闪卡
            for (const highlight of validHighlights) {
                // 确保高亮对象有正确的文件路径
                if (!highlight.filePath && file) {
                    highlight.filePath = file.path;
                    console.log(`设置高亮文件路径: ${highlight.filePath}`);
                }
                
                const newCard = this.createCardFromHighlight(highlight);
                if (newCard && newCard.id) {
                    // 使用回调函数添加卡片到分组
                    addCardCallback(newCard, group.id);
                    newCardsCount++;
                }
            }
        }
        
        return newCardsCount;
    }

    /**
     * 根据分组条件筛选文件
     * @private
     */
    private filterFilesByGroupCriteria(group: CardGroup, allFiles: any[], highlightService: any): any[] {
        // 简化筛选逻辑，使用所有文件
        console.log(`开始筛选文件，分组条件: ${group.filter}`);
        
        // 如果有指定文件路径，尝试匹配
        const filteredFiles: any[] = [];
        const filterText = group.filter.toLowerCase();
        
        // 尝试按文件路径匹配
        if (filterText.length > 0) {
            for (const file of allFiles) {
                if (highlightService.shouldProcessFile(file)) {
                    const filePath = file.path.toLowerCase();
                    // 如果文件路径包含过滤文本的任何部分，添加到筛选结果中
                    if (filePath.includes(filterText) || filterText.includes(file.basename.toLowerCase())) {
                        filteredFiles.push(file);
                    }
                }
            }
        }
        
        // 如果没有匹配到文件，使用所有文件
        if (filteredFiles.length === 0) {
            console.log('没有匹配到文件，使用所有文件');
            filteredFiles.push(...allFiles.filter((file: any) => highlightService.shouldProcessFile(file)));
        } else {
            console.log(`匹配到 ${filteredFiles.length} 个文件`);
        }
        
        return filteredFiles;
    }

    /**
     * 筛选有效的高亮
     * @private
     */
    private filterValidHighlights(fileHighlights: any[], group: CardGroup): any[] {
        // 简化筛选逻辑，只保留基本的格式检查
        console.log(`开始筛选高亮，文件包含 ${fileHighlights.length} 个高亮`);
        
        // 只处理有评论的高亮或挖空格式的高亮
        const validHighlights = fileHighlights.filter((h: any) => 
            !h.isVirtual && (h.comments?.length > 0 || /\{\{([^{}]+)\}\}/.test(h.text))
        );
        
        console.log(`筛选后保留 ${validHighlights.length} 个有效高亮`);
        return validHighlights;
    }
}
