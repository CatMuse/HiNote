import { Component, type Workspace } from 'obsidian';

/** Bind editor events to workspace documents, even when enabled in Settings. */
export function registerSelectionToolbarDocuments(
    owner: Component,
    workspace: Workspace,
    bind: (scope: Component, doc: Document) => void
): void {
    const scopes = new Map<Document, Component>();
    let disposed = false;
    const attach = (doc: Document): void => {
        if (disposed || scopes.has(doc)) return;
        const scope = owner.addChild(new Component());
        scopes.set(doc, scope);
        bind(scope, doc);
    };
    const scan = (): void => {
        attach(workspace.containerEl.ownerDocument);
        workspace.iterateAllLeaves(leaf => attach(leaf.view.containerEl.ownerDocument));
    };
    owner.register(() => {
        disposed = true;
        scopes.clear();
    });
    owner.registerEvent(workspace.on('window-open', (_workspaceWindow, win) => attach(win.document)));
    owner.registerEvent(workspace.on('window-close', (_workspaceWindow, win) => {
        const scope = scopes.get(win.document);
        if (scope) owner.removeChild(scope);
        scopes.delete(win.document);
    }));
    scan();
    workspace.onLayoutReady(scan);
}
