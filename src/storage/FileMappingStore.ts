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
        try {
            const content = await this.app.vault.adapter.read(this.getMappingPath());
            const data: FileMappingData = JSON.parse(content);

            const validation = DataValidator.validateFileMappingData(data);
            if (!validation.valid) {
                console.warn('文件映射数据验证失败:', validation.errors);
                return;
            }

            this.fileMapping = new Map(Object.entries(data.mapping));
        } catch {
            this.fileMapping = new Map();
        }
    }

    async save(): Promise<void> {
        const data: FileMappingData = {
            version: this.version,
            mapping: Object.fromEntries(this.fileMapping),
            lastUpdated: Date.now()
        };

        await this.app.vault.adapter.write(this.getMappingPath(), JSON.stringify(data, null, 2));
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

    getStoragePathForFile(filePath: string): string {
        let safeFileName = this.fileMapping.get(filePath);

        if (!safeFileName) {
            safeFileName = FilePathUtils.toSafeFileName(filePath);
            this.fileMapping.set(filePath, safeFileName);
            this.save().catch(console.error);
        }

        return `${FilePathUtils.getHighlightsDir(this.vaultPath)}/${safeFileName}`;
    }

    private getMappingPath(): string {
        return `${FilePathUtils.getMetadataDir(this.vaultPath)}/file-mapping.json`;
    }
}
