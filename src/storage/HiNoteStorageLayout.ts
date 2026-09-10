import { App } from 'obsidian';
import { FilePathUtils } from './FilePathUtils';

export async function ensureHiNoteDirectoryStructure(app: App, vaultPath: string): Promise<void> {
    const directories = [
        FilePathUtils.getHiNoteDir(vaultPath),
        FilePathUtils.getHighlightsDir(vaultPath),
        FilePathUtils.getFlashcardsDir(vaultPath),
        FilePathUtils.getMetadataDir(vaultPath)
    ];

    for (const dir of directories) {
        if (!await app.vault.adapter.exists(dir)) await app.vault.adapter.mkdir(dir);
    }
}

/** Recover only unambiguous legacy mappings; never guess paths from underscores. */
export async function detectHighlightFilesFromStorage(
    app: App,
    vaultPath: string,
    onMappingDetected: (originalPath: string, safeFileName: string) => void
): Promise<string[]> {
    const highlightsDir = FilePathUtils.getHighlightsDir(vaultPath);
    const files = await app.vault.adapter.list(highlightsDir);
    const candidates = new Map<string, string[]>();
    for (const file of app.vault.getMarkdownFiles()) {
        const name = FilePathUtils.toSafeFileName(file.path);
        candidates.set(name, [...(candidates.get(name) || []), file.path]);
    }
    const recovered: string[] = [];
    for (const path of files.files) {
        if (!path.endsWith('.json')) continue;
        const name = path.slice(path.lastIndexOf('/') + 1);
        const matches = candidates.get(name) || [];
        if (matches.length !== 1) {
            throw new Error('HiNote cannot safely recover a storage mapping. Restore file-mapping.json from backup.');
        }
        recovered.push(matches[0]);
        onMappingDetected(matches[0], name);
    }
    return recovered;
}
