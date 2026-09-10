import { Notice } from "obsidian";
import { t } from "../../../i18n";
import type { FlashcardComponentContext } from "../FlashcardComponentContext";

export class FlashcardActivationRenderer {
    constructor(
        private component: FlashcardComponentContext,
        private renderMainView: () => void
    ) {}

    public render(): void {
        if (!this.component.getIsActive()) {
            return;
        }

        const container = this.component.getContainer();
        container.empty();
        container.addClass("flashcard-mode");

        const activationContainer = container.createDiv({
            cls: "flashcard-activation-container"
        });

        activationContainer.createDiv({
            cls: "flashcard-activation-header",
            text: t("Activate HiCard")
        });

        const description = activationContainer.createDiv({
            cls: "flashcard-activation-description"
        });
        description.createSpan({ text: t("Enter your license key to activate HiCard feature.") + " " });
        description.createEl("br");
        description.createSpan({ text: t("Get your license key from") + " " });

        const locale = (window as Window & { moment?: { locale(): string } }).moment?.locale() || "en";
        const websiteUrl = locale.startsWith("zh")
            ? "https://www.hinote.vip/index.html"
            : "https://www.hinote.vip/en.html";

        const link = description.createEl("a", {
            text: t("HiNote official website"),
            cls: "external-link",
            href: websiteUrl
        });
        link.setAttr("target", "_blank");
        link.setAttr("rel", "noopener noreferrer");

        const inputContainer = activationContainer.createDiv({
            cls: "flashcard-activation-input-container"
        });

        const input = inputContainer.createEl("input", {
            cls: "flashcard-activation-input",
            type: "text",
            placeholder: t("Enter license key")
        });

        const button = inputContainer.createEl("button", {
            cls: "flashcard-activation-button",
            text: t("Activate")
        });

        button.addEventListener("click", () => {
            void this.activate(input);
        });
    }

    private async activate(input: HTMLInputElement): Promise<void> {
        const licenseKey = input.value.trim();
        if (!licenseKey) {
            new Notice(t("Please enter a license key"));
            return;
        }

        const activated = await this.component.getLicenseManager().activateLicense(licenseKey);
        if (activated) {
            new Notice(t("HiCard activated successfully!"));
            this.renderMainView();
        } else {
            new Notice(t("Invalid license key"));
        }
    }
}
