import { App } from 'obsidian';
import { FilePathUtils } from './FilePathUtils';
import { DataValidator } from './DataValidator';
import type { FileMappingData } from './HighlightDataFormat';

export class FileMappingStore {
    private fileMapping: Map<string, string> = new Map();

    constructor(
        private app: App,
        private vaultPath: string,
        private version: string
    ) {}

    async load(): Promise<void> {
        const path = this.getMappingPath();
        if (!await this.app.vault.adapter.exists(path)) return;
        const data: FileMappingData = JSON.parse(await this.app.vault.adapter.read(path));
        if (!DataValidator.validateFileMappingData(data).valid) {
            throw new Error('HiNote file mapping is invalid. Restore the mapping before saving.');
        }
        this.fileMapping = new Map(Object.entries(data.mapping));
    }

    async save(): Promise<void> {
        const data: FileMappingData = {
            version: this.version,
            mapping: Object.fromEntries(this.fileMapping),
            lastUpdated: Date.now()
        };

        const path = this.getMappingPath();
        if (await this.app.vault.adapter.exists(path)) {
            const previous = await this.app.vault.adapter.read(path);
            if (!DataValidator.validateFileMappingData(JSON.parse(previous)).valid) {
                throw new Error('Refusing to overwrite invalid HiNote file mapping.');
            }
            await this.app.vault.adapter.write(`${path}.bak`, previous);
        }
        await this.app.vault.adapter.write(path, JSON.stringify(data, null, 2));
    }

    getMappedFiles(): string[] {
        return Array.from(this.fileMapping.keys());
    }

    set(originalPath: string, safeFileName: string): void {
        this.fileMapping.set(originalPath, safeFileName);
    }

    get(originalPath: string): string | undefined {
        return this.fileMapping.get(originalPath);
    }

    delete(originalPath: string): void {
        this.fileMapping.delete(originalPath);
    }

    async getStoragePathForFile(filePath: string): Promise<string> {
        let safeFileName = this.fileMapping.get(filePath);
        if (safeFileName) {
            if ([...this.fileMapping].some(([path, name]) => path !== filePath && name === safeFileName)) {
                throw new Error('HiNote detected shared legacy storage. Restore or separate the affected notes before editing.');
            }
            if (safeFileName.includes('/') || safeFileName.includes('\\') || !safeFileName.endsWith('.json')) {
                throw new Error('Invalid HiNote storage mapping.');
            }
        } else {
            // Keep legacy mappings intact. New records get independent storage identities.
            do {
                safeFileName = `note-${crypto.randomUUID()}.json`;
            } while ([...this.fileMapping.values()].includes(safeFileName)
                || await this.app.vault.adapter.exists(`${FilePathUtils.getHighlightsDir(this.vaultPath)}/${safeFileName}`));
            this.fileMapping.set(filePath, safeFileName);
            try {
                await this.save();
            } catch (error) {
                this.fileMapping.delete(filePath);
                throw error;
            }
        }
        return `${FilePathUtils.getHighlightsDir(this.vaultPath)}/${safeFileName}`;
    }

    private getMappingPath(): string {
        return `${FilePathUtils.getMetadataDir(this.vaultPath)}/file-mapping.json`;
    }
}
