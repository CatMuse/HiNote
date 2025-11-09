# 重构第一阶段：统一数据模型和 Repository 模式

## 🎯 目标

1. 统一 `HiNote`、`HighlightInfo`、`OptimizedHighlight` 三个重复的数据结构
2. 实现 Repository 模式统一数据访问
3. 提取通用工具类消除重复代码
4. 建立清晰的数据流架构

## 📋 任务清单

### Task 1: 创建统一的领域模型 (2-3 天)

#### 1.1 定义核心领域模型

创建 `src/domain/models/Highlight.ts`:

```typescript
/**
 * 高亮领域模型 - 核心业务对象
 */
export class Highlight {
    constructor(
        public readonly id: string,
        public readonly text: string,
        public readonly position: number,
        public readonly createdAt: number,
        private _updatedAt: number,
        private _backgroundColor?: string,
        private _blockId?: string,
        private _isCloze?: boolean,
        private _paragraphOffset?: number,
        private _comments: Comment[] = []
    ) {}

    // Getters
    get updatedAt(): number { return this._updatedAt; }
    get backgroundColor(): string | undefined { return this._backgroundColor; }
    get blockId(): string | undefined { return this._blockId; }
    get isCloze(): boolean { return this._isCloze || false; }
    get paragraphOffset(): number | undefined { return this._paragraphOffset; }
    get comments(): readonly Comment[] { return this._comments; }
    get hasComments(): boolean { return this._comments.length > 0; }
    get isFlashcard(): boolean { return this._isCloze; }

    // 业务方法
    addComment(comment: Comment): void {
        this._comments.push(comment);
        this._updatedAt = Date.now();
    }

    removeComment(commentId: string): boolean {
        const index = this._comments.findIndex(c => c.id === commentId);
        if (index === -1) return false;
        
        this._comments.splice(index, 1);
        this._updatedAt = Date.now();
        return true;
    }

    updateComment(commentId: string, content: string): boolean {
        const comment = this._comments.find(c => c.id === commentId);
        if (!comment) return false;
        
        comment.updateContent(content);
        this._updatedAt = Date.now();
        return true;
    }

    setBackgroundColor(color: string): void {
        this._backgroundColor = color;
        this._updatedAt = Date.now();
    }

    setBlockId(blockId: string): void {
        this._blockId = blockId;
        this._updatedAt = Date.now();
    }

    toggleCloze(): void {
        this._isCloze = !this._isCloze;
        this._updatedAt = Date.now();
    }

    // 工厂方法
    static create(text: string, position: number, options?: {
        backgroundColor?: string;
        blockId?: string;
        isCloze?: boolean;
        paragraphOffset?: number;
    }): Highlight {
        const id = IdGenerator.generate();
        const now = Date.now();
        
        return new Highlight(
            id,
            text,
            position,
            now,
            now,
            options?.backgroundColor,
            options?.blockId,
            options?.isCloze,
            options?.paragraphOffset
        );
    }

    // 克隆方法
    clone(): Highlight {
        return new Highlight(
            this.id,
            this.text,
            this.position,
            this.createdAt,
            this._updatedAt,
            this._backgroundColor,
            this._blockId,
            this._isCloze,
            this._paragraphOffset,
            this._comments.map(c => c.clone())
        );
    }
}

/**
 * 评论领域模型
 */
export class Comment {
    constructor(
        public readonly id: string,
        private _content: string,
        public readonly createdAt: number,
        private _updatedAt: number
    ) {}

    get content(): string { return this._content; }
    get updatedAt(): number { return this._updatedAt; }

    updateContent(content: string): void {
        this._content = content;
        this._updatedAt = Date.now();
    }

    static create(content: string): Comment {
        const id = IdGenerator.generate();
        const now = Date.now();
        return new Comment(id, content, now, now);
    }

    clone(): Comment {
        return new Comment(this.id, this._content, this.createdAt, this._updatedAt);
    }
}
```

#### 1.2 定义 DTO (Data Transfer Object)

创建 `src/domain/dto/HighlightDTO.ts`:

```typescript
/**
 * 高亮数据传输对象 - 用于序列化和网络传输
 */
export interface HighlightDTO {
    id: string;
    text: string;
    position: number;
    created: number;
    updated: number;
    backgroundColor?: string;
    blockId?: string;
    isCloze?: boolean;
    paragraphOffset?: number;
    comments?: CommentDTO[];
}

export interface CommentDTO {
    id: string;
    content: string;
    created: number;
    updated: number;
}

/**
 * 文件高亮数据 - 存储格式
 */
export interface FileHighlightsDTO {
    version: string;
    lastModified: number;
    highlights: Record<string, HighlightDTO>;
}
```

#### 1.3 实现 Mapper

创建 `src/domain/mappers/HighlightMapper.ts`:

```typescript
import { Highlight, Comment } from '../models/Highlight';
import { HighlightDTO, CommentDTO } from '../dto/HighlightDTO';

/**
 * 高亮映射器 - 负责领域模型和 DTO 之间的转换
 */
export class HighlightMapper {
    /**
     * 领域模型 → DTO
     */
    static toDTO(highlight: Highlight): HighlightDTO {
        return {
            id: highlight.id,
            text: highlight.text,
            position: highlight.position,
            created: highlight.createdAt,
            updated: highlight.updatedAt,
            backgroundColor: highlight.backgroundColor,
            blockId: highlight.blockId,
            isCloze: highlight.isCloze,
            paragraphOffset: highlight.paragraphOffset,
            comments: highlight.comments.map(c => this.commentToDTO(c))
        };
    }

    /**
     * DTO → 领域模型
     */
    static fromDTO(dto: HighlightDTO): Highlight {
        const comments = (dto.comments || []).map(c => this.commentFromDTO(c));
        
        return new Highlight(
            dto.id,
            dto.text,
            dto.position,
            dto.created,
            dto.updated,
            dto.backgroundColor,
            dto.blockId,
            dto.isCloze,
            dto.paragraphOffset,
            comments
        );
    }

    /**
     * 批量转换 DTO → 领域模型
     */
    static fromDTOs(dtos: HighlightDTO[]): Highlight[] {
        return dtos.map(dto => this.fromDTO(dto));
    }

    /**
     * 批量转换 领域模型 → DTO
     */
    static toDTOs(highlights: Highlight[]): HighlightDTO[] {
        return highlights.map(h => this.toDTO(h));
    }

    // 评论转换
    private static commentToDTO(comment: Comment): CommentDTO {
        return {
            id: comment.id,
            content: comment.content,
            created: comment.createdAt,
            updated: comment.updatedAt
        };
    }

    private static commentFromDTO(dto: CommentDTO): Comment {
        return new Comment(dto.id, dto.content, dto.created, dto.updated);
    }

    /**
     * 兼容旧格式 (HiNote) → 新格式
     */
    static fromLegacyHiNote(hiNote: any): Highlight {
        const comments = (hiNote.comments || []).map((c: any) => 
            new Comment(c.id, c.content, c.createdAt, c.updatedAt)
        );

        return new Highlight(
            hiNote.id,
            hiNote.text,
            hiNote.position,
            hiNote.createdAt,
            hiNote.updatedAt,
            hiNote.backgroundColor,
            hiNote.blockId || hiNote.paragraphId, // 兼容旧字段
            hiNote.isCloze,
            hiNote.paragraphOffset,
            comments
        );
    }

    /**
     * 新格式 → 兼容旧格式 (用于过渡期)
     */
    static toLegacyHiNote(highlight: Highlight): any {
        return {
            id: highlight.id,
            text: highlight.text,
            position: highlight.position,
            blockId: highlight.blockId,
            comments: highlight.comments.map(c => ({
                id: c.id,
                content: c.content,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            })),
            createdAt: highlight.createdAt,
            updatedAt: highlight.updatedAt,
            backgroundColor: highlight.backgroundColor,
            isCloze: highlight.isCloze,
            paragraphOffset: highlight.paragraphOffset
        };
    }
}
```

### Task 2: 实现 Repository 模式 (2-3 天)

#### 2.1 定义 Repository 接口

创建 `src/domain/repositories/IHighlightRepository.ts`:

```typescript
import { Highlight } from '../models/Highlight';

/**
 * 高亮仓储接口 - 定义数据访问契约
 */
export interface IHighlightRepository {
    /**
     * 根据 ID 查找高亮
     */
    findById(id: string): Promise<Highlight | null>;

    /**
     * 根据文件路径查找所有高亮
     */
    findByFile(filePath: string): Promise<Highlight[]>;

    /**
     * 查找所有高亮
     */
    findAll(): Promise<Map<string, Highlight[]>>;

    /**
     * 保存高亮
     */
    save(filePath: string, highlight: Highlight): Promise<void>;

    /**
     * 批量保存
     */
    saveAll(filePath: string, highlights: Highlight[]): Promise<void>;

    /**
     * 删除高亮
     */
    delete(filePath: string, highlightId: string): Promise<boolean>;

    /**
     * 删除文件的所有高亮
     */
    deleteByFile(filePath: string): Promise<void>;

    /**
     * 更新文件路径 (文件重命名时)
     */
    updateFilePath(oldPath: string, newPath: string): Promise<void>;

    /**
     * 检查高亮是否存在
     */
    exists(id: string): Promise<boolean>;

    /**
     * 获取所有文件路径
     */
    getAllFilePaths(): Promise<string[]>;

    /**
     * 清除缓存
     */
    clearCache(): void;
}
```

#### 2.2 实现 Repository

创建 `src/domain/repositories/HighlightRepository.ts`:

```typescript
import { IHighlightRepository } from './IHighlightRepository';
import { Highlight } from '../models/Highlight';
import { HighlightMapper } from '../mappers/HighlightMapper';
import { HiNoteDataManager } from '../../storage/HiNoteDataManager';

/**
 * 高亮仓储实现 - 负责数据持久化和缓存
 */
export class HighlightRepository implements IHighlightRepository {
    // 内存缓存: filePath -> Highlight[]
    private cache = new Map<string, Highlight[]>();
    
    // ID 索引: highlightId -> filePath (用于快速查找)
    private idIndex = new Map<string, string>();
    
    // 脏标记: 记录哪些文件需要保存
    private dirtyFiles = new Set<string>();

    constructor(private dataManager: HiNoteDataManager) {}

    async findById(id: string): Promise<Highlight | null> {
        // 先从索引查找文件路径
        const filePath = this.idIndex.get(id);
        if (!filePath) {
            // 索引中没有，需要全量搜索
            await this.buildIndex();
            const path = this.idIndex.get(id);
            if (!path) return null;
            return this.findById(id); // 递归查找
        }

        // 从缓存或存储中获取
        const highlights = await this.findByFile(filePath);
        return highlights.find(h => h.id === id) || null;
    }

    async findByFile(filePath: string): Promise<Highlight[]> {
        // 检查缓存
        if (this.cache.has(filePath)) {
            return this.cache.get(filePath)!;
        }

        // 从存储加载
        const dtos = await this.dataManager.getFileHighlights(filePath);
        const highlights = HighlightMapper.fromDTOs(dtos);

        // 更新缓存和索引
        this.cache.set(filePath, highlights);
        highlights.forEach(h => this.idIndex.set(h.id, filePath));

        return highlights;
    }

    async findAll(): Promise<Map<string, Highlight[]>> {
        const filePaths = await this.dataManager.getAllHighlightFiles();
        const result = new Map<string, Highlight[]>();

        for (const filePath of filePaths) {
            const highlights = await this.findByFile(filePath);
            if (highlights.length > 0) {
                result.set(filePath, highlights);
            }
        }

        return result;
    }

    async save(filePath: string, highlight: Highlight): Promise<void> {
        // 获取当前文件的所有高亮
        const highlights = await this.findByFile(filePath);
        
        // 查找是否已存在
        const index = highlights.findIndex(h => h.id === highlight.id);
        
        if (index >= 0) {
            // 更新
            highlights[index] = highlight;
        } else {
            // 新增
            highlights.push(highlight);
        }

        // 更新缓存
        this.cache.set(filePath, highlights);
        this.idIndex.set(highlight.id, filePath);
        
        // 标记为脏
        this.dirtyFiles.add(filePath);

        // 立即保存 (或者可以延迟批量保存)
        await this.flush(filePath);
    }

    async saveAll(filePath: string, highlights: Highlight[]): Promise<void> {
        // 更新缓存
        this.cache.set(filePath, highlights);
        
        // 更新索引
        highlights.forEach(h => this.idIndex.set(h.id, filePath));
        
        // 标记为脏
        this.dirtyFiles.add(filePath);

        // 保存
        await this.flush(filePath);
    }

    async delete(filePath: string, highlightId: string): Promise<boolean> {
        const highlights = await this.findByFile(filePath);
        const index = highlights.findIndex(h => h.id === highlightId);
        
        if (index === -1) return false;

        // 删除
        highlights.splice(index, 1);
        
        // 更新缓存
        this.cache.set(filePath, highlights);
        this.idIndex.delete(highlightId);
        
        // 标记为脏
        this.dirtyFiles.add(filePath);

        // 保存
        await this.flush(filePath);
        return true;
    }

    async deleteByFile(filePath: string): Promise<void> {
        // 清除索引
        const highlights = this.cache.get(filePath) || [];
        highlights.forEach(h => this.idIndex.delete(h.id));

        // 清除缓存
        this.cache.delete(filePath);
        this.dirtyFiles.delete(filePath);

        // 删除存储
        await this.dataManager.deleteFileHighlights(filePath);
    }

    async updateFilePath(oldPath: string, newPath: string): Promise<void> {
        // 获取旧路径的数据
        const highlights = await this.findByFile(oldPath);
        
        if (highlights.length === 0) return;

        // 更新缓存
        this.cache.delete(oldPath);
        this.cache.set(newPath, highlights);

        // 更新索引
        highlights.forEach(h => this.idIndex.set(h.id, newPath));

        // 保存到新路径
        await this.saveAll(newPath, highlights);

        // 删除旧路径
        await this.deleteByFile(oldPath);
    }

    async exists(id: string): Promise<boolean> {
        return this.idIndex.has(id) || (await this.findById(id)) !== null;
    }

    async getAllFilePaths(): Promise<string[]> {
        return await this.dataManager.getAllHighlightFiles();
    }

    clearCache(): void {
        this.cache.clear();
        this.idIndex.clear();
        this.dirtyFiles.clear();
    }

    /**
     * 刷新脏数据到存储
     */
    private async flush(filePath?: string): Promise<void> {
        const paths = filePath ? [filePath] : Array.from(this.dirtyFiles);

        for (const path of paths) {
            const highlights = this.cache.get(path);
            if (!highlights) continue;

            const dtos = HighlightMapper.toDTOs(highlights);
            await this.dataManager.saveFileHighlights(path, dtos);
            
            this.dirtyFiles.delete(path);
        }
    }

    /**
     * 批量刷新所有脏数据
     */
    async flushAll(): Promise<void> {
        await this.flush();
    }

    /**
     * 构建 ID 索引
     */
    private async buildIndex(): Promise<void> {
        const allHighlights = await this.findAll();
        
        this.idIndex.clear();
        for (const [filePath, highlights] of allHighlights) {
            highlights.forEach(h => this.idIndex.set(h.id, filePath));
        }
    }
}
```

### Task 3: 提取通用工具类 (1-2 天)

#### 3.1 文件工具类

创建 `src/utils/FileUtils.ts`:

```typescript
import { App, TFile, TFolder } from 'obsidian';

export class FileUtils {
    /**
     * 安全读取文件
     */
    static async readFile(app: App, path: string): Promise<string | null> {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) return null;
        
        try {
            return await app.vault.cachedRead(file);
        } catch (error) {
            console.error(`Failed to read file: ${path}`, error);
            return null;
        }
    }

    /**
     * 安全写入文件
     */
    static async writeFile(app: App, path: string, content: string): Promise<boolean> {
        try {
            const file = app.vault.getAbstractFileByPath(path);
            
            if (file && file instanceof TFile) {
                await app.vault.modify(file, content);
            } else {
                await app.vault.create(path, content);
            }
            return true;
        } catch (error) {
            console.error(`Failed to write file: ${path}`, error);
            return false;
        }
    }

    /**
     * 检查文件是否存在
     */
    static fileExists(app: App, path: string): boolean {
        const file = app.vault.getAbstractFileByPath(path);
        return file instanceof TFile;
    }

    /**
     * 检查是否为 Markdown 文件
     */
    static isMarkdownFile(file: TFile): boolean {
        return file.extension === 'md';
    }

    /**
     * 获取文件的 TFile 对象
     */
    static getFile(app: App, path: string): TFile | null {
        const file = app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    }

    /**
     * 确保目录存在
     */
    static async ensureDir(app: App, path: string): Promise<void> {
        try {
            await app.vault.adapter.mkdir(path);
        } catch (error) {
            // 目录可能已存在，忽略错误
        }
    }

    /**
     * 删除文件
     */
    static async deleteFile(app: App, path: string): Promise<boolean> {
        try {
            const file = app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                await app.vault.delete(file);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`Failed to delete file: ${path}`, error);
            return false;
        }
    }
}
```

#### 3.2 类型守卫

创建 `src/utils/TypeGuards.ts`:

```typescript
import { TFile, MarkdownView, View } from 'obsidian';

/**
 * 检查是否为 TFile
 */
export function isTFile(file: any): file is TFile {
    return file instanceof TFile;
}

/**
 * 检查是否为 MarkdownView
 */
export function isMarkdownView(view: any): view is MarkdownView {
    return view instanceof MarkdownView && view.editor !== undefined;
}

/**
 * 检查是否为有效的高亮文本
 */
export function isValidHighlightText(text: string): boolean {
    return text.trim().length > 0 && text.length < 10000;
}

/**
 * 检查是否为有效的文件路径
 */
export function isValidFilePath(path: string): boolean {
    return path.length > 0 && !path.includes('..') && !path.startsWith('/');
}
```

#### 3.3 事件总线增强

创建 `src/utils/EventBus.ts`:

```typescript
type EventHandler = (...args: any[]) => void;

/**
 * 增强的事件总线
 */
export class EventBus {
    private handlers = new Map<string, Set<EventHandler>>();

    /**
     * 注册事件监听器
     */
    on(event: string, handler: EventHandler): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        
        this.handlers.get(event)!.add(handler);
        
        // 返回取消注册函数
        return () => this.off(event, handler);
    }

    /**
     * 批量注册事件
     */
    onMultiple(events: string[], handler: EventHandler): () => void {
        const unsubscribers = events.map(event => this.on(event, handler));
        
        // 返回批量取消函数
        return () => unsubscribers.forEach(unsub => unsub());
    }

    /**
     * 注册一次性监听器
     */
    once(event: string, handler: EventHandler): void {
        const wrappedHandler = (...args: any[]) => {
            handler(...args);
            this.off(event, wrappedHandler);
        };
        
        this.on(event, wrappedHandler);
    }

    /**
     * 取消事件监听器
     */
    off(event: string, handler: EventHandler): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.handlers.delete(event);
            }
        }
    }

    /**
     * 触发事件
     */
    emit(event: string, ...args: any[]): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(...args);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * 清除所有监听器
     */
    clear(): void {
        this.handlers.clear();
    }

    /**
     * 清除指定事件的所有监听器
     */
    clearEvent(event: string): void {
        this.handlers.delete(event);
    }

    /**
     * 获取事件的监听器数量
     */
    listenerCount(event: string): number {
        return this.handlers.get(event)?.size || 0;
    }
}
```

### Task 4: 迁移现有代码 (3-4 天)

#### 4.1 更新 CommentStore 使用 Repository

```typescript
// 旧代码
export class CommentStore {
    private comments: Map<string, HiNote[]> = new Map();
    
    async loadComments() {
        const highlightFiles = await this.dataManager.getAllHighlightFiles();
        for (const filePath of highlightFiles) {
            const highlights = await this.dataManager.getFileHighlights(filePath);
            this.comments.set(filePath, highlights);
        }
    }
}

// 新代码
export class CommentStore {
    constructor(
        private repository: IHighlightRepository,
        // ... 其他依赖
    ) {}
    
    async loadComments() {
        // Repository 内部处理缓存和加载
        await this.repository.findAll();
    }
    
    async getFileComments(filePath: string): Promise<Highlight[]> {
        return await this.repository.findByFile(filePath);
    }
    
    async addHighlight(filePath: string, text: string, position: number): Promise<Highlight> {
        const highlight = Highlight.create(text, position);
        await this.repository.save(filePath, highlight);
        return highlight;
    }
}
```

## 📊 预期成果

### 代码质量
- ✅ 统一数据模型，消除 3 个重复接口
- ✅ 清晰的数据访问层
- ✅ 减少 500+ 行重复代码
- ✅ 提升类型安全性

### 性能
- ✅ 智能缓存减少文件读取
- ✅ 索引加速查找操作
- ✅ 批量操作优化

### 可维护性
- ✅ 职责清晰分离
- ✅ 易于测试
- ✅ 易于扩展

## 🧪 测试计划

### 单元测试
```typescript
describe('HighlightRepository', () => {
    it('should cache highlights after first load', async () => {
        const repo = new HighlightRepository(mockDataManager);
        await repo.findByFile('test.md');
        await repo.findByFile('test.md'); // 应该从缓存读取
        
        expect(mockDataManager.getFileHighlights).toHaveBeenCalledTimes(1);
    });
    
    it('should update index when saving highlight', async () => {
        const repo = new HighlightRepository(mockDataManager);
        const highlight = Highlight.create('test', 0);
        
        await repo.save('test.md', highlight);
        const found = await repo.findById(highlight.id);
        
        expect(found).toBe(highlight);
    });
});
```

## 📝 迁移检查清单

- [ ] 创建领域模型 (Highlight, Comment)
- [ ] 创建 DTO 和 Mapper
- [ ] 实现 Repository 接口和实现
- [ ] 创建通用工具类
- [ ] 更新 CommentStore 使用 Repository
- [ ] 更新 HighlightService 使用新模型
- [ ] 更新 CommentView 使用新模型
- [ ] 更新 HighlightCard 使用新模型
- [ ] 添加单元测试
- [ ] 性能测试
- [ ] 向后兼容性测试
- [ ] 文档更新

## 🚀 下一步

完成第一阶段后，进入第二阶段：
- 拆分 CommentView
- 简化 HighlightCard
- 优化事件处理

预计时间: 2-3 周
