import { TFile, App } from 'obsidian';
import { HighlightInfo } from '../../types';
import { HiNote } from '../../CommentStore';
import { HighlightService } from '../../services/HighlightService';
import { CommentStore } from '../../CommentStore';
import { IdGenerator } from '../../utils/IdGenerator';
import CommentPlugin from '../../../main';

/**
 * 高亮数据管理器
 * 负责高亮数据的加载、处理和匹配
 */
export class HighlightDataManager {
    private app: App;
    private plugin: CommentPlugin;
    private highlightService: HighlightService;
    private commentStore: CommentStore;
    
    constructor(
        app: App,
        plugin: CommentPlugin,
        highlightService: HighlightService,
        commentStore: CommentStore
    ) {
        this.app = app;
        this.plugin = plugin;
        this.highlightService = highlightService;
        this.commentStore = commentStore;
    }
    
    /**
     * 加载单个文件的高亮数据
     */
    async loadFileHighlights(file: TFile): Promise<HighlightInfo[]> {
        // 检查文件是否应该被处理
        if (!this.highlightService.shouldProcessFile(file)) {
            return [];
        }

        const content = await this.app.vault.read(file);
        const highlights = this.highlightService.extractHighlights(content, file);
        
        // 获取已存储的评论
        const storedComments = this.commentStore.getFileComments(file);
        
        // 合并高亮和评论数据
        return this.mergeHighlightsWithComments(highlights, storedComments, file);
    }
    
    /**
     * 加载所有文件的高亮数据
     */
    async loadAllHighlights(searchTerm: string = '', searchType: string = ''): Promise<HighlightInfo[]> {
        const allHighlights: HighlightInfo[] = [];
        
        // 如果是路径搜索，先获取所有高亮然后按路径过滤
        if (searchType === 'path') {
            const highlightResults = await this.highlightService.getAllHighlights();
            
            // 创建所有文件的批注映射
            const fileCommentsMap = new Map<string, HiNote[]>();
            
            // 获取所有文件
            const allFiles = this.app.vault.getMarkdownFiles();
            
            // 预先加载所有文件的批注
            for (const file of allFiles) {
                const fileComments = this.commentStore.getFileComments(file);
                if (fileComments && fileComments.length > 0) {
                    fileCommentsMap.set(file.path, fileComments);
                }
            }
            
            // 处理所有高亮
            for (const { file, highlights } of highlightResults) {
                // 如果有搜索词，先检查文件路径是否匹配
                if (searchTerm && !file.path.toLowerCase().includes(searchTerm.toLowerCase())) {
                    continue;
                }
                
                // 获取当前文件的所有批注
                const fileComments = fileCommentsMap.get(file.path) || [];
                
                // 合并高亮和评论
                const mergedHighlights = this.mergeHighlightsWithComments(highlights, fileComments, file);
                allHighlights.push(...mergedHighlights);
            }
        } else {
            // 常规全局搜索
            const highlightResults = await this.highlightService.getAllHighlights();
            
            for (const { file, highlights } of highlightResults) {
                const fileComments = this.commentStore.getFileComments(file);
                const mergedHighlights = this.mergeHighlightsWithComments(highlights, fileComments, file);
                
                // 如果有搜索词，过滤高亮
                if (searchTerm) {
                    const filtered = mergedHighlights.filter(h => 
                        h.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        h.comments?.some(c => c.content.toLowerCase().includes(searchTerm.toLowerCase()))
                    );
                    allHighlights.push(...filtered);
                } else {
                    allHighlights.push(...mergedHighlights);
                }
            }
        }
        
        return allHighlights;
    }
    
    /**
     * 合并高亮和评论数据
     */
    private mergeHighlightsWithComments(
        highlights: HighlightInfo[],
        storedComments: HiNote[],
        file: TFile
    ): HighlightInfo[] {
        // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
        const usedCommentIds = new Set<string>();
        
        // 合并高亮和评论数据
        const mergedHighlights = highlights.map(highlight => {
            // 1. 首先尝试精确匹配
            let storedComment = storedComments.find(c => {
                if (usedCommentIds.has(c.id)) return false;
                
                const textMatch = c.text === highlight.text;
                if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return textMatch;
            });
            
            // 2. 如果精确匹配失败，尝试使用位置匹配
            if (!storedComment && highlight.position !== undefined) {
                storedComment = storedComments.find(c => 
                    !usedCommentIds.has(c.id) && 
                    c.position !== undefined && 
                    highlight.position !== undefined &&
                    Math.abs(c.position - highlight.position) < 50
                );
            }
            
            // 3. 如果位置匹配也失败，尝试使用模糊文本匹配（基于相似度）
            if (!storedComment) {
                const candidates = storedComments.filter(c => !usedCommentIds.has(c.id));
                // 查找文本最相似的评论
                let bestMatch: HiNote | undefined;
                let bestSimilarity = 0.8; // 最低相似度阈值
                
                for (const candidate of candidates) {
                    const similarity = this.calculateSimilarity(highlight.text, candidate.text);
                    if (similarity > bestSimilarity) {
                        bestSimilarity = similarity;
                        bestMatch = candidate;
                    }
                }
                
                storedComment = bestMatch;
            }
            
            // 如果找到匹配的评论，标记为已使用并合并数据
            if (storedComment) {
                usedCommentIds.add(storedComment.id);
                
                return {
                    ...highlight,
                    id: storedComment.id,
                    comments: storedComment.comments,
                    createdAt: storedComment.createdAt,
                    updatedAt: storedComment.updatedAt
                };
            }

            return highlight;
        });

        // 添加虚拟高亮到列表最前面，但只添加那些还没有被使用过的
        const virtualHighlights = storedComments
            .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id));
        
        // 检查是否已经存在相同内容的虚拟高亮
        const uniqueVirtualHighlights = virtualHighlights.filter(vh => {
            return !mergedHighlights.some(h => h.text === vh.text);
        });
        
        // 将这些虚拟高亮添加到列表
        return [...uniqueVirtualHighlights, ...mergedHighlights];
    }
    
    /**
     * 计算两个字符串的相似度（简单的 Levenshtein 距离）
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const len1 = str1.length;
        const len2 = str2.length;
        
        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;
        
        const matrix: number[][] = [];
        
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        
        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        return 1 - distance / maxLen;
    }
    
    /**
     * 标记高亮为全局搜索结果
     */
    markAsGlobalSearch(highlights: HighlightInfo[], isGlobal: boolean = true): HighlightInfo[] {
        return highlights.map(h => ({
            ...h,
            isGlobalSearch: isGlobal
        }));
    }
    
    /**
     * 标记高亮为 Canvas 来源
     */
    markAsCanvasSource(highlights: HighlightInfo[], canvasFile: TFile): HighlightInfo[] {
        return highlights.map(h => ({
            ...h,
            isFromCanvas: true,
            isGlobalSearch: true,
            canvasSource: canvasFile.path
        }));
    }
}
