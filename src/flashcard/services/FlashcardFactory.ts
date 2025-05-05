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
        if (!highlight || !highlight.filePath) return null;

        let isCloze = false;
        let clozeText = highlight.text;
        let clozeAnswer = '';
        
        // 检查是否为挖空格式：{{内容}}
        const clozeMatch = highlight.text.match(/\{\{([^{}]+)\}\}/);
        if (clozeMatch) {
            isCloze = true;
            clozeAnswer = clozeMatch[1];
            // 正面隐藏内容，动态下划线长度
            clozeText = highlight.text.replace(/\{\{([^{}]+)\}\}/g, (match, p1) => '＿'.repeat(p1.length));
        }
        
        // 合并所有评论作为答案
        let answer = highlight.comments?.length ? highlight.comments.map(c => c.content).join('<hr>') : '';
        
        // 挖空格式优先，若有则拼接答案
        if (isCloze) {
            answer = answer ? (answer + '<hr>' + clozeAnswer) : clozeAnswer;
        }
        
        // 如果没有评论且不是挖空格式，则不创建闪卡
        if (!answer && !isCloze) return null;
        
        // 创建闪卡
        return this.createCard(clozeText, answer, highlight.filePath);
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
        const filteredFiles: any[] = [];
        const filterText = group.filter.toLowerCase();
        
        // 检查是否有文件相关的过滤条件
        const hasFileFilter = (
            filterText.includes('path:') || 
            filterText.includes('[[') || 
            filterText.includes('.md') ||
            // 检查是否包含文件夹路径格式
            /[\\\/]/.test(filterText)
        );
        
        if (hasFileFilter) {
            // 文件路径筛选 - path: 前缀
            if (filterText.includes('path:')) {
                const pathMatches = [...filterText.matchAll(/path:([^\s]+)/g)];
                if (pathMatches.length > 0) {
                    for (const match of pathMatches) {
                        const pathFilter = match[1];
                        for (const file of allFiles) {
                            if (file.path.toLowerCase().includes(pathFilter) && 
                                highlightService.shouldProcessFile(file) &&
                                !filteredFiles.includes(file)) {
                                filteredFiles.push(file);
                            }
                        }
                    }
                }
            }
            
            // Wiki 链接格式 [[文件名]]
            if (filterText.includes('[[')) {
                const wikiMatches = [...filterText.matchAll(/\[\[([^\]]+)\]\]/g)];
                if (wikiMatches.length > 0) {
                    for (const match of wikiMatches) {
                        const fileName = match[1].toLowerCase();
                        for (const file of allFiles) {
                            // 检查文件名（不含扩展名）或完整路径
                            const fileNameWithoutExt = file.basename.toLowerCase();
                            if ((fileNameWithoutExt === fileName || 
                                 file.path.toLowerCase().includes(fileName)) && 
                                highlightService.shouldProcessFile(file) &&
                                !filteredFiles.includes(file)) {
                                filteredFiles.push(file);
                            }
                        }
                    }
                }
            }
            
            // 如果以上条件都没有匹配到文件，尝试直接用过滤文本匹配文件路径
            if (filteredFiles.length === 0) {
                const filterParts = filterText.split(/\s+/);
                for (const file of allFiles) {
                    if (highlightService.shouldProcessFile(file)) {
                        // 检查文件路径是否包含任何过滤部分
                        const filePath = file.path.toLowerCase();
                        if (filterParts.some(part => filePath.includes(part))) {
                            filteredFiles.push(file);
                        }
                    }
                }
            }
        } else {
            // 如果没有文件相关的过滤条件，使用所有文件
            filteredFiles.push(...allFiles.filter((file: any) => highlightService.shouldProcessFile(file)));
        }
        
        return filteredFiles;
    }

    /**
     * 筛选有效的高亮
     * @private
     */
    private filterValidHighlights(fileHighlights: any[], group: CardGroup): any[] {
        // 初始筛选：只处理有评论的高亮或挖空格式的高亮
        let validHighlights = fileHighlights.filter((h: any) => 
            !h.isVirtual && (h.comments?.length > 0 || /\{\{([^{}]+)\}\}/.test(h.text))
        );
        
        // 标签筛选
        if (group.filter.includes('tag:')) {
            const tagFilters = [...group.filter.matchAll(/tag:([^\s]+)/g)].map(m => m[1]);
            if (tagFilters.length > 0) {
                validHighlights = validHighlights.filter((highlight: any) => {
                    const highlightTags = this.extractTagsFromText(highlight.text);
                    const commentTags = highlight.comments?.flatMap((c: any) => 
                        this.extractTagsFromText(c.content)
                    ) || [];
                    const allTags = [...highlightTags, ...commentTags];
                    
                    // 检查是否包含任一标签
                    return tagFilters.some(tag => allTags.includes(tag));
                });
            }
        }
        
        // 关键词筛选（如果没有特定的文件或标签筛选器）
        const hasFileFilter = (
            group.filter.toLowerCase().includes('path:') || 
            group.filter.toLowerCase().includes('[[') || 
            group.filter.toLowerCase().includes('.md') ||
            /[\\\/]/.test(group.filter.toLowerCase())
        );
        
        if (!group.filter.includes('tag:') && !hasFileFilter) {
            const keywords = group.filter.toLowerCase().split(/\s+/).filter(k => k.length > 0);
            if (keywords.length > 0) {
                validHighlights = validHighlights.filter((highlight: any) => {
                    const text = highlight.text.toLowerCase();
                    const comments = highlight.comments?.map((c: any) => c.content.toLowerCase()).join(' ') || '';
                    const content = text + ' ' + comments;
                    
                    // 检查是否包含所有关键词
                    return keywords.every(keyword => content.includes(keyword));
                });
            }
        }
        
        return validHighlights;
    }
}
