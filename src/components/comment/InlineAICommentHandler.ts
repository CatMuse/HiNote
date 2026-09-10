import { Notice, setIcon } from "obsidian";
import { t } from "../../i18n";
import { AIServiceManager } from "../../services/ai";
import { HighlightInfo, CommentItem } from "../../types/highlight";
import type CommentPlugin from "../../../main";

interface InlineAICommentHandlerOptions {
    plugin: CommentPlugin;
    highlight: HighlightInfo;
    existingComment?: CommentItem;
    getTextarea: () => HTMLTextAreaElement;
    getActionHint: () => HTMLElement | undefined;
    resizeTextarea: () => void;
}

export class InlineAICommentHandler {
    private isProcessing = false;
    private originalContent = "";

    constructor(private options: InlineAICommentHandlerOptions) {}

    isGenerating(): boolean {
        return this.isProcessing;
    }

    async generate(): Promise<void> {
        const textarea = this.options.getTextarea();
        const userPrompt = textarea.value.trim();

        if (!userPrompt) {
            new Notice(t("Please enter AI instruction"));
            return;
        }

        if (this.isProcessing) {
            return;
        }

        this.originalContent = userPrompt;

        try {
            this.setLoading(true);

            const aiService = new AIServiceManager(this.options.plugin.settings.ai);
            const response = await aiService.generateResponse(
                userPrompt,
                this.options.highlight.text || "",
                this.options.existingComment?.content || ""
            );

            textarea.value = response;
            this.options.resizeTextarea();
            new Notice(t("AI response generated"));
        } catch (error) {
            console.error("AI内联生成失败:", error);
            textarea.value = this.originalContent;
            const message = error instanceof Error ? error.message : String(error);
            new Notice(t(`AI generation failed: ${message}`));
        } finally {
            this.setLoading(false);
        }
    }

    private setLoading(loading: boolean): void {
        this.isProcessing = loading;

        const textarea = this.options.getTextarea();
        const actionHint = this.options.getActionHint();

        if (loading) {
            textarea.disabled = true;
            textarea.setCssProps({ opacity: "0.6" });
            this.showLoadingHint(actionHint);
            return;
        }

        textarea.disabled = false;
        textarea.setCssProps({ opacity: "1" });
        this.hideLoadingHint(actionHint);
    }

    private showLoadingHint(actionHint?: HTMLElement): void {
        if (!actionHint) return;

        const deleteLink = actionHint.querySelector(".hi-note-delete-link") as HTMLElement;
        if (deleteLink) {
            deleteLink.setCssProps({ visibility: "hidden" });
        }

        const loadingHint = actionHint.querySelector(".ai-loading-hint");
        if (!loadingHint) {
            const hintEl = actionHint.createSpan({
                cls: "ai-loading-hint"
            });

            const loadingIcon = hintEl.createSpan({
                cls: "ai-loading-icon"
            });
            setIcon(loadingIcon, "loader");
        }
    }

    private hideLoadingHint(actionHint?: HTMLElement): void {
        if (!actionHint) return;

        actionHint.querySelector(".ai-loading-hint")?.remove();

        const deleteLink = actionHint.querySelector(".hi-note-delete-link") as HTMLElement;
        if (deleteLink) {
            deleteLink.setCssProps({ visibility: "" });
        }
    }
}
