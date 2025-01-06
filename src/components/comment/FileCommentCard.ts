import { FileComment } from "../../types";
import { t } from "../../i18n";
import { CommentInput } from "./CommentInput";

export class FileCommentCard {
    private container: HTMLElement;

    constructor(
        parentEl: HTMLElement,
        private comment: FileComment,
        private options: {
            onEdit: (comment: FileComment) => Promise<void>;
            onDelete: (comment: FileComment) => Promise<void>;
        }
    ) {
        this.container = parentEl.createEl("div", {
            cls: "highlight-card file-comment-card"
        });

        this.render();
    }

    private render() {
        const content = this.container.createEl("div", {
            cls: "highlight-content"
        });

        // 评论内容
        const commentEl = content.createEl("div", {
            cls: "highlight-comment"
        });

        commentEl.createEl("div", {
            cls: "highlight-comment-content",
            text: this.comment.content
        });

        // 底部信息
        const footer = commentEl.createEl("div", {
            cls: "highlight-comment-footer"
        });

        // 时间
        footer.createEl("span", {
            cls: "highlight-comment-time",
            text: window.moment(this.comment.updatedAt).fromNow()
        });

        // 操作按钮
        const actions = footer.createEl("div", {
            cls: "highlight-comment-actions"
        });

        // 编辑按钮
        const editButton = actions.createEl("button", {
            cls: "highlight-comment-action",
            attr: { "aria-label": t("Edit") }
        });
        editButton.addEventListener("click", () => {
            this.showEditInput();
        });

        // 删除按钮
        const deleteButton = actions.createEl("button", {
            cls: "highlight-comment-action",
            attr: { "aria-label": t("Delete") }
        });
        deleteButton.addEventListener("click", async () => {
            await this.options.onDelete(this.comment);
        });
    }

    private showEditInput() {
        const input = new CommentInput(
            this.container,
            { text: "", position: 0, paragraphOffset: 0 }, // 虚拟的 HighlightInfo
            { 
                id: this.comment.id,
                content: this.comment.content,
                createdAt: this.comment.createdAt,
                updatedAt: this.comment.updatedAt
            },
            {
                onSave: async (content: string) => {
                    await this.options.onEdit({ ...this.comment, content });
                },
                onCancel: () => {
                    this.render();
                },
                onDelete: async () => {
                    await this.options.onDelete(this.comment);
                }
            }
        );
        input.show();
    }

    public getElement(): HTMLElement {
        return this.container;
    }
}
