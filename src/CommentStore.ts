import { Plugin, TFile, MarkdownView, Editor } from "obsidian";

export interface CommentItem {
    id: string;           // 评论的唯一ID
    content: string;      // 评论内容
    createdAt: number;    // 创建时间
    updatedAt: number;    // 最后更新时间
}

export interface HighlightComment {
    id: string;           
    text: string;         
    position: number;     
    paragraphId: string;  // 新增：段落的唯一ID
    comments: CommentItem[];  
    createdAt: number;    
    updatedAt: number;    
}

export interface FileComments {
    [highlightId: string]: HighlightComment;
}

export interface CommentsData {
    [filePath: string]: FileComments;
}

export class CommentStore {
    private plugin: Plugin;
    private data: CommentsData = {};
    private comments: Map<string, HighlightComment[]> = new Map();
    private commentCache: Map<string, HighlightComment[]> = new Map();
    private maxCacheSize: number = 100;
    private readonly PERFORMANCE_THRESHOLD = 100; // 毫秒

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async loadComments() {
        const data = await this.plugin.loadData();
        this.data = data?.comments || {};
    }

    async saveComments() {
        await this.plugin.saveData({
            comments: this.data
        });
    }

    getFileComments(file: TFile): HighlightComment[] {
        const comments = this.data[file.path] || {};
        return Object.values(comments).sort((a, b) => a.position - b.position);
    }

    async addComment(file: TFile, highlight: HighlightComment) {
        if (!this.data[file.path]) {
            this.data[file.path] = {};
        }
        
        // 确保 highlight 包含 paragraphId
        if (!highlight.paragraphId) {
            // 获取当前的 MarkdownView 和 Editor
            const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            const editor = view?.editor as Editor;
            
            if (editor) {
                const doc = editor.getValue();
                if (doc) {
                    const paragraphs = doc.split(/\n\n+/);
                    let offset = 0;
                    for (const paragraph of paragraphs) {
                        if (offset <= highlight.position && offset + paragraph.length >= highlight.position) {
                            highlight.paragraphId = this.generateParagraphId(paragraph, offset);
                            break;
                        }
                        offset += paragraph.length + 2;
                    }
                }
            }
            
            if (!highlight.paragraphId) {
                highlight.paragraphId = `p-${Date.now()}`; // fallback ID
            }
        }
        
        this.data[file.path][highlight.id] = highlight;
        await this.saveComments();
    }

    // 新增：生成段落ID的辅助方法
    private generateParagraphId(text: string, position: number): string {
        // 1. 清理文本
        const cleanText = text.trim()
            .toLowerCase()
            .replace(/[^\w\s]/g, '');
        
        // 2. 提取关键特征
        const words = cleanText.split(/\s+/);
        const firstWord = words[0] || '';
        const lastWord = words[words.length - 1] || '';
        const textLength = cleanText.length;
        const positionRange = Math.floor(position / 500) * 500;
        
        // 3. 组合特征生成ID
        return `p-${firstWord}-${lastWord}-${textLength}-${positionRange}`;
    }

    async updateComment(file: TFile, highlightId: string, commentContent: string) {
        if (this.data[file.path]?.[highlightId]) {
            const highlight = this.data[file.path][highlightId];
            // 创建新的评论
            const newComment: CommentItem = {
                id: `comment-${Date.now()}`,
                content: commentContent,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            // 初化评论数组（如果不存在）
            if (!highlight.comments) {
                highlight.comments = [];
            }
            
            // 添加新评论
            highlight.comments.push(newComment);
            highlight.updatedAt = Date.now();
            await this.saveComments();
        }
    }

    async removeComment(file: TFile, highlightId: string) {
        if (this.data[file.path]?.[highlightId]) {
            delete this.data[file.path][highlightId];
            if (Object.keys(this.data[file.path]).length === 0) {
                delete this.data[file.path];
            }
            await this.saveComments();
        }
    }

    // 清理不存在的文件的评论
    async cleanupComments(existingFiles: Set<string>) {
        let changed = false;
        for (const filePath of Object.keys(this.data)) {
            if (!existingFiles.has(filePath)) {
                delete this.data[filePath];
                changed = true;
            }
        }
        if (changed) {
            await this.saveComments();
        }
    }

    // 只加载可视区域的评论
    loadVisibleComments(visibleParagraphIds: string[]) {
        const currentFile = this.plugin.app.workspace.getActiveFile();
        if (!currentFile) return;

        visibleParagraphIds.forEach(paragraphId => {
            const comments = this.getCommentsByParagraphId(currentFile, paragraphId);
            this.commentCache.set(paragraphId, comments);
        });

        this.pruneCache();
    }

    private pruneCache() {
        if (this.commentCache.size > this.maxCacheSize) {
            // 删除最早/最少使用的缓存
            const entriesToDelete = Array.from(this.commentCache.keys())
                .slice(0, this.commentCache.size - this.maxCacheSize);
            entriesToDelete.forEach(key => this.commentCache.delete(key));
        }
    }

    // 批量更新评论
    batchUpdateComments(updates: Array<{id: string, comment: HighlightComment}>) {
        const batch = new Map<string, HighlightComment[]>();
        updates.forEach(({id, comment}) => {
            if (!batch.has(id)) {
                batch.set(id, []);
            }
            batch.get(id)?.push(comment);
        });
        
        batch.forEach((comments, id) => {
            this.comments.set(id, comments);
        });
    }

    private checkPerformance(operation: () => void) {
        const start = performance.now();
        operation();
        const duration = performance.now() - start;
        
        if (duration > this.PERFORMANCE_THRESHOLD) {
            console.warn(`Performance warning: Operation took ${duration}ms`);
        }
    }

    // 新增：根据段落ID获取评论
    getCommentsByParagraphId(file: TFile, paragraphId: string): HighlightComment[] {
        const fileComments = this.data[file.path] || {};
        return Object.values(fileComments).filter(
            highlight => highlight.paragraphId === paragraphId
        ).sort((a, b) => a.position - b.position);
    }

    // 新增：检查段落是否有评论
    hasParagraphComments(file: TFile, paragraphId: string): boolean {
        const comments = this.getCommentsByParagraphId(file, paragraphId);
        return comments.length > 0;
    }

    async clearAllComments() {
        this.data = {};
        await this.saveComments();
    }
} 