import { FlashcardState, CardGroup } from '../types/FSRSTypes';
import { FSRSService } from './FSRSService';
import { HiNote } from '../../CommentStore';

/**
 * 闪卡工厂类，负责闪卡的创建、更新和管理
 * 所有闪卡创建相关的逻辑都应该集中在这个类中
 */
export class FlashcardFactory {
    private fsrsService: FSRSService;
    private plugin: any;

    constructor(plugin: any, fsrsService: FSRSService) {
        this.plugin = plugin;
        this.fsrsService = fsrsService;
    }
    
    /**
     * 获取存储对象
     * @private
     */
    private get storage(): any {
        return this.plugin.fsrsManager.storage;
    }

    /**
     * 创建卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 创建的卡片
     */
    public createCard(text: string, answer: string, filePath?: string): FlashcardState {
        // 使用FSRS服务创建卡片
        try {
            // 使用 initializeCard 方法创建卡片
            const card = this.fsrsService.initializeCard(text, answer, filePath);
            return card;
        } catch (err) {
            console.error('创建卡片时出错:', err);
            // 如果创建失败，再尝试一次
            try {
                return this.fsrsService.initializeCard(text, answer, filePath);
            } catch (e) {
                console.error('第二次尝试创建卡片失败:', e);
                // 如果仍然失败，则使用最简单的方式创建卡片
                const now = new Date();
                // 创建一个简单的卡片对象
                return this.fsrsService.initializeCard(text, answer, filePath);
            }
        }
    }
    
    /**
     * 添加卡片到存储中
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 添加的卡片
     */
    public addCard(text: string, answer: string, filePath?: string): FlashcardState {
        // 创建新卡片
        const card = this.createCard(text, answer, filePath);
        
        // 确保 storage.cards 存在
        if (!this.storage.cards) {
            this.storage.cards = {};
        }
        
        // 保存卡片
        this.storage.cards[card.id] = card;
        
        // 触发事件，让FSRSManager来处理保存
        try {
            this.plugin.eventManager.emitFlashcardChanged();
        } catch (err) {
            console.error('保存卡片时出错:', err);
        }
        
        return card;
    }
    
    /**
     * 根据内容查找卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 找到的卡片或null
     */
    public findCardByContent(text: string, answer: string, filePath?: string): FlashcardState | null {
        // 确保 storage.cards 存在
        if (!this.storage.cards) {
            return null;
        }
        
        // 获取所有卡片
        const allCards = Object.values(this.storage.cards) as FlashcardState[];
        
        // 查找匹配的卡片
        const matchingCard = allCards.find((card: FlashcardState) => {
            // 检查文本内容是否匹配
            const textMatch = card.text === text;
            
            // 检查答案内容是否匹配
            const answerMatch = card.answer === answer;
            
            // 检查文件路径是否匹配（如果提供了文件路径）
            const pathMatch = !filePath || card.filePath === filePath;
            
            return textMatch && answerMatch && pathMatch;
        });
        
        return matchingCard || null;
    }
    
    /**
     * 创建或更新卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 创建或更新后的卡片
     */
    public createOrUpdateCard(text: string, answer: string, filePath?: string): FlashcardState {
        try {
            // 先查找是否存在匹配的卡片
            const existingCard = this.findCardByContent(text, answer, filePath);
            
            if (existingCard) {
                // 如果存在匹配的卡片，更新它
                this.storage.cards[existingCard.id] = {
                    ...existingCard,
                    text: text,
                    answer: answer
                    // lastReview 保持不变，因为我们使用了展开运算符
                };
                
                // 触发事件，让FSRSManager来处理保存
                this.plugin.eventManager.emitFlashcardChanged();
                
                return this.storage.cards[existingCard.id];
            } else {
                // 如果不存在匹配的卡片，创建新卡片
                return this.addCard(text, answer, filePath);
            }
        } catch (err) {
            console.error('创建或更新卡片时出错:', err);
            // 如果出错，尝试创建新卡片
            return this.createCard(text, answer, filePath);
        }
    }

    /**
     * 从高亮创建闪卡
     * @param highlight 高亮对象
     * @returns 创建的闪卡
     */
    public createCardFromHighlight(highlight: HiNote): FlashcardState | null {
        try {
            if (!highlight) {
                console.log('高亮对象为空，不创建闪卡');
                return null;
            }
            
            console.log(`开始从高亮创建闪卡: ${highlight.id}`);
            console.log(`高亮内容: ${highlight.text}`);
            console.log(`文件路径: ${highlight.filePath}`);
            console.log(`评论数量: ${highlight.comments?.length || 0}`);
            
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
        } catch (err) {
            console.error('处理高亮对象时出错:', err);
            return null;
        }
        
        // 检查是否为挖空格式（例如：{{内容}})
        const clozeRegex = /\{\{([^{}]+)\}\}/g;
        let isCloze = false;
        let clozeText = highlight.text || '';
        let clozeAnswers: string[] = [];
        let match;
        
        // 如果文本中包含挖空格式，处理挖空格式
        while ((match = clozeRegex.exec(clozeText)) !== null) {
            isCloze = true;
            // 提取挖空内容
            const clozeContent = match[1];
            clozeAnswers.push(clozeContent);
        }
        
        // 如果是挖空格式，将挖空内容替换为 HTML 标签
        let text = clozeText;
        if (isCloze) {
            // 使用正则表达式替换挖空内容为 HTML 标签
            text = clozeText.replace(clozeRegex, (match, content) => {
                // 创建与挖空内容等长的空白，并用 span 标签包裹
                // 添加 flashcard-cloze 类，样式在 styles.css 中定义
                return `<span class="flashcard-cloze">${'\u00A0'.repeat(content.length)}</span>`;
            });
        } else {
            text = highlight.text || '';
        }
        
        // 使用高亮的评论作为卡片背面
        let answer = highlight.comments?.map(c => {
            // 安全地获取评论内容，只使用 content 属性
            return c.content || '';
        }).join('\n') || '';
        
        // 如果没有评论但是挖空格式，直接使用挖空内容作为答案
        if (!answer && isCloze && clozeAnswers.length > 0) {
            answer = clozeAnswers.join('\n');
        }
        
        // 如果仍然没有答案，添加一个提示
        if (!answer) {
            answer = '请添加答案';
            console.log('警告: 创建了没有答案的卡片，添加了提示文本');
        }
        
        // 创建卡片
        try {
            return this.createCard(text, answer, highlight.filePath);
        } catch (err) {
            console.error('从高亮创建卡片时出错:', err);
            return null;
        }
    }

    // 标签提取功能已移除，不再支持标签筛选
    
    /**
     * 删除卡片
     * @param cardId 要删除的卡片ID
     * @returns 是否删除成功
     */
    public deleteCard(cardId: string): boolean {
        try {
            if (!this.storage.cards || !this.storage.cards[cardId]) {
                return false;
            }
            
            // 删除卡片
            delete this.storage.cards[cardId];
            
            // 触发事件，让FSRSManager来处理保存
            this.plugin.eventManager.emitFlashcardChanged();
            
            return true;
        } catch (err) {
            console.error('删除卡片时出错:', err);
            return false;
        }
    }
    
    /**
     * 根据文件路径获取卡片
     * @param filePath 文件路径
     * @returns 该文件下的卡片列表
     */
    public getCardsByFile(filePath: string): FlashcardState[] {
        if (!this.storage.cards) {
            return [];
        }
        
        return Object.values(this.storage.cards)
            .filter((card: any) => card.filePath === filePath) as FlashcardState[];
    }
    
    /**
     * 删除指定文件路径下的卡片
     * @param filePath 文件路径
     * @param text 可选，特定的高亮文本
     * @param answer 可选，特定的评论内容
     * @returns 删除的卡片数量
     */
    public deleteCardsByContent(filePath: string, text?: string, answer?: string): number {
        const cards = this.getCardsByFile(filePath);
        let deletedCount = 0;
        
        for (const card of cards) {
            if (!text && !answer || // 如果没有指定text和answer，删除该文件的所有卡片
                (text && card.text === text) || // 如果指定了text，匹配text
                (answer && card.answer === answer)) { // 如果指定了answer，匹配answer
                if (this.deleteCard(card.id)) {
                    deletedCount++;
                }
            }
        }
        
        return deletedCount;
    }
    
    /**
     * 更新卡片内容（用于高亮文本或批注更新时）
     * @param text 更新的文本内容
     * @param answer 更新的答案内容
     * @param filePath 文件路径
     */
    public updateCardContent(text: string, answer: string, filePath?: string): void {
        if (!filePath || !this.storage.cards) {
            return;
        }
        
        // 获取指定文件的所有卡片
        const cardsInFile = Object.values(this.storage.cards).filter((card: any) => 
            card.filePath === filePath
        ) as FlashcardState[];
        
        // 如果提供了文本，更新匹配文本的卡片
        if (text) {
            const cardsWithText = cardsInFile.filter(card => card.text.includes(text));
            
            cardsWithText.forEach(card => {
                // 更新卡片文本，保留其他属性不变
                this.storage.cards[card.id] = {
                    ...card,
                    text: text // 使用新文本替换
                };
            });
        }
        
        // 如果提供了答案，更新匹配答案的卡片
        if (answer) {
            const cardsWithAnswer = cardsInFile.filter(card => card.answer.includes(answer));
            
            cardsWithAnswer.forEach(card => {
                // 更新卡片答案，保留其他属性不变
                this.storage.cards[card.id] = {
                    ...card,
                    answer: answer // 使用新答案替换
                };
            });
        }
        
        // 触发事件，让FSRSManager来处理保存
        try {
            this.plugin.eventManager.emitFlashcardChanged();
        } catch (err) {
            console.error('更新卡片内容时出错:', err);
        }
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
        
        try {
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
        } catch (err) {
            console.error('生成分组卡片时出错:', err);
            return 0;
        }
    }

    /**
     * 根据分组条件筛选文件
     * @private
     * @param group 分组对象
     * @param allFiles 所有文件
     * @param highlightService 高亮服务
     * @returns 筛选后的文件列表
     */
    private filterFilesByGroupCriteria(group: CardGroup, allFiles: any[], highlightService: any): any[] {
        try {
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
            
            // 如果没有匹配到文件，返回空数组，避免处理大量不相关文件
            if (filteredFiles.length === 0) {
                // 检查过滤条件是否为空
                if (filterText.length > 0) {
                    console.log(`没有匹配到文件，过滤条件: "${group.filter}"，返回空数组`);
                    // 返回空数组，不再使用所有文件作为兜底
                    return [];
                } else {
                    // 如果过滤条件为空，则使用所有可处理的文件
                    console.log('过滤条件为空，使用所有可处理的文件');
                    filteredFiles.push(...allFiles.filter((file: any) => highlightService.shouldProcessFile(file)));
                }
            } else {
                console.log(`匹配到 ${filteredFiles.length} 个文件`);
            }
            
            return filteredFiles;
        } catch (err) {
            console.error('筛选文件时出错:', err);
            return [];
        }
    }

    /**
     * 筛选有效的高亮
     * @private
     * @param fileHighlights 文件高亮列表
     * @param group 分组对象
     * @returns 筛选后的高亮列表
     */
    private filterValidHighlights(fileHighlights: any[], group: CardGroup): any[] {
        try {
            // 简化筛选逻辑，只保留基本的格式检查
            console.log(`开始筛选高亮，文件包含 ${fileHighlights?.length || 0} 个高亮`);
            
            if (!fileHighlights || fileHighlights.length === 0) {
                return [];
            }
            
            // 只处理有评论的高亮或挖空格式的高亮
            const validHighlights = fileHighlights.filter((h: any) => 
                !h.isVirtual && (h.comments?.length > 0 || /\{\{([^{}]+)\}\}/g.test(h.text))
            );
            
            console.log(`筛选后保留 ${validHighlights.length} 个有效高亮`);
            return validHighlights;
        } catch (err) {
            console.error('筛选高亮时出错:', err);
            return [];
        }
    }
}
