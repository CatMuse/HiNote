import { HighlightInfo } from "../../types";
import { t } from "../../i18n";

/**
 * 不聚焦的批注输入框组件
 * 显示在高亮卡片的激活状态下，点击后才会转换为真正的输入框
 */
export class UnfocusedCommentInput {
    private container: HTMLElement;

    constructor(
        private parent: HTMLElement,
        private highlight: HighlightInfo,
        private onClick: () => void
    ) {
        this.render();
    }

    private render() {
        // 创建不聚焦的输入框容器
        this.container = this.parent.createEl("div", {
            cls: "unfocused-comment-input"
        });

        // 创建输入提示区域
        const inputArea = this.container.createEl("div", {
            cls: "unfocused-input-area",
            attr: {
                "placeholder": t("添加批注...")
            }
        });

        // 添加点击事件，点击后调用 onClick 回调
        inputArea.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onClick();
        });
    }

    /**
     * 移除不聚焦的输入框
     */
    public remove() {
        this.container.remove();
    }
    
    /**
     * 隐藏不聚焦的输入框
     */
    public hide() {
        this.container.style.display = 'none';
    }
}
