export function renderHiCardPageHeader(
    container: HTMLElement,
    title: string,
    description: string
): HTMLElement {
    const header = container.createDiv({ cls: 'hicard-page-header' });
    const copy = header.createDiv({ cls: 'hicard-page-heading' });
    copy.createEl('h2', { text: title });
    copy.createEl('p', { text: description });
    return header.createDiv({ cls: 'hicard-page-actions' });
}
