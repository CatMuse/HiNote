import { Plugin, TFile } from "obsidian";

export interface CommentItem {
    id: string;           // 评论的唯一ID
    content: string;      // 评论内容
    createdAt: number;    // 创建时间
    updatedAt: number;    // 最后更新时间
}

export interface HighlightComment {
    id: string;           // 高亮评论的唯一ID
    text: string;         // 高亮的文本内容
    position: number;     // 在文档中的位置
    comments: CommentItem[];  // 评论列表
    createdAt: number;    // 创建时间
    updatedAt: number;    // 最后更新时间
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
        this.data[file.path][highlight.id] = highlight;
        await this.saveComments();
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
            
            // 初始化评论数组（如果不存在）
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
} 