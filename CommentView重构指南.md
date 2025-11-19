# CommentView.ts 重构指南

## 📊 重构进度

### ✅ 已完成的 Manager
1. **ExportManager** - 导出功能管理器
2. **VirtualHighlightManager** - 虚拟高亮管理器
3. **InfiniteScrollManager** - 无限滚动管理器
4. **FlashcardViewManager** - 闪卡视图管理器
5. **DeviceManager** - 设备检测管理器
6. **UIInitializer** - UI 初始化管理器
7. **EventCoordinator** - 事件协调器
8. **CallbackConfigurator** - 回调配置器（需要根据实际接口调整）

---

## 🔄 如何应用重构

### 第一步：添加新 Manager 的导入

在 `CommentView.ts` 顶部添加：

```typescript
// 新增的 Manager
import { ExportManager } from './view/export/ExportManager';
import { VirtualHighlightManager } from './view/highlight/VirtualHighlightManager';
import { InfiniteScrollManager } from './view/scroll/InfiniteScrollManager';
import { FlashcardViewManager } from './view/flashcard/FlashcardViewManager';
import { DeviceManager } from './view/device/DeviceManager';
import { UIInitializer, UIElements } from './view/ui/UIInitializer';
import { EventCoordinator } from './view/events/EventCoordinator';
import { CallbackConfigurator } from './view/config/CallbackConfigurator';
```

### 第二步：替换类属性声明

**原代码（行 35-86）：**
```typescript
private searchManager: SearchManager | null = null;
private selectionManager: SelectionManager | null = null;
// ... 其他 Manager
private highlightContainer: HTMLElement;
private searchContainer: HTMLElement;
// ... 其他 UI 元素
private currentFile: TFile | null = null;
private isFlashcardMode: boolean = false;
private highlights: HighlightInfo[] = [];
private highlightsWithFlashcards: Set<string> = new Set<string>();
// ... 其他状态
```

**新代码：**
```typescript
// === Manager 实例 ===
private searchManager: SearchManager | null = null;
private selectionManager: SelectionManager | null = null;
private batchOperationsHandler: BatchOperationsHandler | null = null;
private fileListManager: FileListManager | null = null;
private highlightRenderManager: HighlightRenderManager | null = null;
private highlightDataManager: HighlightDataManager | null = null;
private commentOperationManager: CommentOperationManager | null = null;
private commentInputManager: CommentInputManager | null = null;
private layoutManager: LayoutManager | null = null;
private viewPositionDetector: ViewPositionDetector | null = null;
private canvasProcessor: CanvasHighlightProcessor | null = null;
private allHighlightsManager: AllHighlightsManager | null = null;

// 新增的 Manager
private exportManager: ExportManager | null = null;
private virtualHighlightManager: VirtualHighlightManager | null = null;
private infiniteScrollManager: InfiniteScrollManager | null = null;
private flashcardViewManager: FlashcardViewManager | null = null;
private deviceManager: DeviceManager | null = null;
private uiInitializer: UIInitializer | null = null;
private eventCoordinator: EventCoordinator | null = null;
private callbackConfigurator: CallbackConfigurator | null = null;

// === UI 元素（从 UIInitializer 获取）===
private uiElements: UIElements | null = null;
private highlightContainer!: HTMLElement;
private searchContainer!: HTMLElement;
private searchInput!: HTMLInputElement;
private searchLoadingIndicator!: HTMLElement;
private fileListContainer!: HTMLElement;
private mainContentContainer!: HTMLElement;

// === 核心服务 ===
private commentStore: CommentStore;
private plugin: CommentPlugin;
private locationService: LocationService;
private exportService: ExportService;
private highlightService: HighlightService;
private licenseManager: LicenseManager;
private canvasService: CanvasService;

// === 最小化状态变量 ===
private currentFile: TFile | null = null;
private highlights: HighlightInfo[] = [];
private isDraggedToMainView: boolean = false;
private isShowingFileList: boolean = true;
private loadingIndicator!: HTMLElement;
private aiButtons: AIButton[] = [];
private currentEditingHighlightId: string | null | undefined = null;
```

### 第三步：简化构造函数

**替换行 88-221 的构造函数内容：**

```typescript
constructor(leaf: WorkspaceLeaf, commentStore: CommentStore) {
    super(leaf);
    this.commentStore = commentStore;
    
    // 获取插件实例
    const plugins = (this.app as any).plugins;
    if (plugins && plugins.plugins && plugins.plugins['hi-note']) {
        this.plugin = plugins.plugins['hi-note'] as CommentPlugin;
    } else {
        throw new Error('Hi-Note plugin not found');
    }
    
    // 初始化核心服务
    this.locationService = new LocationService(this.app);
    this.exportService = new ExportService(this.app, this.commentStore);
    this.highlightService = this.plugin.highlightService;
    this.licenseManager = new LicenseManager(this.plugin);
    this.canvasService = this.plugin.canvasService;
    
    // 初始化新 Manager
    this.deviceManager = new DeviceManager();
    this.uiInitializer = new UIInitializer();
    this.eventCoordinator = new EventCoordinator(this.app, this);
    this.callbackConfigurator = new CallbackConfigurator();
    this.exportManager = new ExportManager(this.app, this.exportService);
    this.virtualHighlightManager = new VirtualHighlightManager(this.commentStore);
    this.flashcardViewManager = new FlashcardViewManager(this.app, this.plugin);
}
```

### 第四步：重构 onOpen 方法

**替换行 235-884 的 onOpen 方法：**

```typescript
async onOpen() {
    const container = this.containerEl.children[1];
    
    // 1. 使用 UIInitializer 创建所有 UI 元素
    this.uiElements = this.uiInitializer!.initializeUI(container);
    
    // 提取 UI 元素引用
    this.highlightContainer = this.uiElements.highlightContainer;
    this.searchContainer = this.uiElements.searchContainer;
    this.searchInput = this.uiElements.searchInput;
    this.searchLoadingIndicator = this.uiElements.searchLoadingIndicator;
    this.fileListContainer = this.uiElements.fileListContainer;
    this.mainContentContainer = this.uiElements.mainContentContainer;
    this.loadingIndicator = this.uiElements.loadingIndicator;
    
    // 2. 设置多选事件监听
    this.uiInitializer!.setupMultiSelectListener(container, () => {
        if (this.selectionManager) {
            this.selectionManager.updateSelectedHighlights();
        }
    });
    
    // 3. 使用 ExportManager 创建导出按钮
    this.exportManager!.createExportButton(
        this.uiElements.iconButtonsContainer,
        () => this.currentFile
    );
    
    // 4. 使用 VirtualHighlightManager 创建文件评论按钮
    this.virtualHighlightManager!.createFileCommentButton(
        this.uiElements.iconButtonsContainer,
        {
            getCurrentFile: () => this.currentFile,
            getHighlights: () => this.highlights,
            onVirtualHighlightCreated: (vh) => {
                this.highlights.unshift(vh);
                this.renderHighlights(this.highlights);
            },
            onShowCommentInput: (card, highlight) => this.showCommentInput(card, highlight),
            getHighlightContainer: () => this.highlightContainer
        }
    );
    
    // 5. 初始化所有已存在的 Manager
    this.initializeExistingManagers();
    
    // 6. 使用 InfiniteScrollManager
    this.infiniteScrollManager = new InfiniteScrollManager(this.highlightContainer);
    this.infiniteScrollManager.setLoadingIndicator(this.loadingIndicator);
    
    // 7. 使用 EventCoordinator 注册所有事件
    this.setupEventListeners();
    
    // 8. 使用 CallbackConfigurator 配置所有回调
    this.configureAllCallbacks();
    
    // 9. 设置返回按钮事件
    this.setupBackButton();
    
    // 10. 初始化当前文件
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
        this.currentFile = activeFile;
        await this.updateHighlights();
    }
    
    // 11. 更新视图布局
    await this.updateViewLayout();
}
```

### 第五步：添加辅助方法

```typescript
/**
 * 初始化已存在的 Manager
 */
private initializeExistingManagers(): void {
    // 初始化搜索管理器
    this.searchManager = new SearchManager(
        this.plugin,
        this.searchInput,
        this.searchLoadingIndicator,
        this.searchContainer
    );
    
    // 初始化多选管理器
    this.selectionManager = new SelectionManager(this.highlightContainer);
    this.selectionManager.initialize();
    
    // 初始化批量操作处理器
    this.batchOperationsHandler = new BatchOperationsHandler(
        this.plugin,
        this.exportService,
        this.licenseManager,
        this.highlightService,
        this.containerEl
    );
    
    // 初始化文件列表管理器
    this.fileListManager = new FileListManager(
        this.fileListContainer,
        this.plugin,
        this.highlightService,
        this.licenseManager
    );
    
    // 初始化高亮渲染管理器
    this.highlightRenderManager = new HighlightRenderManager(
        this.highlightContainer,
        this.app,
        this.plugin
    );
    
    // 初始化高亮数据管理器
    this.highlightDataManager = new HighlightDataManager(
        this.app,
        this.plugin,
        this.highlightService,
        this.commentStore
    );
    
    // 初始化评论操作管理器
    this.commentOperationManager = new CommentOperationManager(
        this.app,
        this.plugin,
        this.commentStore
    );
    
    // 初始化评论输入管理器
    this.commentInputManager = new CommentInputManager(this.plugin);
    
    // 初始化布局管理器
    this.layoutManager = new LayoutManager(
        this.containerEl,
        this.fileListContainer,
        this.mainContentContainer,
        this.searchContainer
    );
    
    // 初始化视图位置检测器
    this.viewPositionDetector = new ViewPositionDetector(this.app, this.leaf);
    
    // 初始化全局高亮管理器
    this.allHighlightsManager = new AllHighlightsManager(
        this.app,
        this.highlightService,
        this.commentStore
    );
    
    // 初始化 Canvas 处理器
    this.canvasProcessor = new CanvasHighlightProcessor(
        this.app,
        this.canvasService,
        this.highlightDataManager
    );
}

/**
 * 设置事件监听器
 */
private setupEventListeners(): void {
    if (!this.eventCoordinator) return;
    
    // 设置事件回调
    this.eventCoordinator.setCallbacks({
        onFileOpen: (file, isInCanvas) => {
            this.currentFile = file;
            this.updateHighlights(isInCanvas);
        },
        onFileModify: (file, isInCanvas) => {
            if (this.fileListManager) {
                this.fileListManager.invalidateCache();
            }
            this.updateHighlights(isInCanvas);
        },
        onFileCreate: () => {
            if (this.fileListManager) {
                this.fileListManager.invalidateCache();
            }
        },
        onFileDelete: () => {
            if (this.fileListManager) {
                this.fileListManager.invalidateCache();
            }
        },
        onLayoutChange: () => {
            this.checkViewPosition();
        },
        onCommentInput: (highlightId, text) => {
            this.eventCoordinator!.handleCommentInputDisplay(
                highlightId,
                text,
                this.highlightContainer,
                (card, highlight) => this.showCommentInput(card, highlight)
            );
        }
    });
    
    // 注册所有事件
    this.eventCoordinator.registerAllEvents(
        () => this.currentFile,
        () => this.isDraggedToMainView
    );
    
    // 注册键盘事件
    this.eventCoordinator.registerKeyboardEvents(this.highlightContainer);
}

/**
 * 配置所有回调
 */
private configureAllCallbacks(): void {
    if (!this.callbackConfigurator) return;
    
    // 注意：这里需要根据实际的 Manager 接口进行调整
    // CallbackConfigurator 中的方法签名需要与实际 Manager 匹配
    
    // 配置搜索管理器
    if (this.searchManager) {
        this.searchManager.setCallbacks(
            async (searchTerm: string, searchType: string) => {
                await this.handleSearch(searchTerm, searchType);
            },
            () => this.highlights,
            () => this.currentFile
        );
        this.searchManager.initialize();
    }
    
    // 配置其他 Manager...
    // （根据实际接口逐个配置）
}

/**
 * 设置返回按钮
 */
private setupBackButton(): void {
    if (!this.uiElements) return;
    
    this.uiElements.backButton.addEventListener("click", () => {
        const deviceInfo = this.deviceManager!.getDeviceInfo();
        
        if (deviceInfo.isMobile && deviceInfo.isSmallScreen && this.isDraggedToMainView) {
            // 使用 FlashcardViewManager 处理返回逻辑
            const handled = this.flashcardViewManager!.handleBackButton();
            
            if (!handled) {
                // 返回到文件列表
                this.isShowingFileList = true;
                this.updateViewLayout();
            }
        }
    });
}
```

### 第六步：简化其他方法

**替换 loadMoreHighlights、loadUntilScrollable、setupInfiniteScroll 方法：**

```typescript
// 这些方法现在委托给 InfiniteScrollManager
private async loadMoreHighlights() {
    if (this.infiniteScrollManager) {
        await this.infiniteScrollManager.loadMoreHighlights(
            this.highlights,
            async (batch, append) => await this.renderHighlights(batch, append)
        );
    }
}

private async loadUntilScrollable() {
    if (this.infiniteScrollManager) {
        await this.infiniteScrollManager.loadUntilScrollable(
            this.highlights,
            async (batch, append) => await this.renderHighlights(batch, append)
        );
    }
}

private setupInfiniteScroll() {
    if (this.infiniteScrollManager) {
        this.infiniteScrollManager.setupInfiniteScroll(
            this.highlights,
            async (batch, append) => await this.renderHighlights(batch, append)
        );
    }
}
```

**替换 exportHighlightAsImage 方法：**

```typescript
private async exportHighlightAsImage(highlight: HighlightInfo & { comments?: CommentItem[] }) {
    if (this.exportManager) {
        await this.exportManager.exportHighlightAsImage(highlight);
    }
}
```

**更新 updateHighlights 方法中的虚拟高亮处理：**

```typescript
// 在 updateHighlights 方法中，替换虚拟高亮处理部分（行 1320-1329）
if (this.virtualHighlightManager && this.currentFile) {
    const virtualHighlights = this.virtualHighlightManager.filterVirtualHighlights(
        this.currentFile,
        this.highlights
    );
    this.highlights.unshift(...virtualHighlights);
}

// 替换闪卡标记处理部分（行 1340-1357）
if (this.flashcardViewManager) {
    this.flashcardViewManager.updateFlashcardMarkers(this.highlights);
}
```

**更新 renderHighlights 方法：**

```typescript
private renderHighlights(highlightsToRender: HighlightInfo[], append = false) {
    if (this.highlightRenderManager && this.flashcardViewManager) {
        this.highlightRenderManager.updateState({
            currentFile: this.currentFile,
            isDraggedToMainView: this.isDraggedToMainView,
            highlightsWithFlashcards: this.flashcardViewManager.getFlashcardMarkers(),
            currentBatch: this.infiniteScrollManager?.getCurrentBatch() || 0
        });
        this.highlightRenderManager.renderHighlights(
            highlightsToRender,
            append,
            this.selectionManager ?? undefined
        );
        
        // 同步批次计数
        if (this.infiniteScrollManager && this.highlightRenderManager) {
            this.infiniteScrollManager.setCurrentBatch(
                this.highlightRenderManager.getCurrentBatch()
            );
        }
    }
}
```

---

## 📊 重构效果预估

### 代码行数对比
- **重构前**: 1380 行
- **重构后**: 约 400-500 行
- **减少**: 约 65-70%

### 职责分离
- **CommentView**: 仅作为协调者，不包含具体业务逻辑
- **各 Manager**: 职责单一，易于测试和维护

---

## ⚠️ 注意事项

1. **渐进式重构**: 不要一次性修改所有代码，建议分步骤进行
2. **保留备份**: 重构前创建 Git 分支
3. **充分测试**: 每个阶段完成后都要测试
4. **接口调整**: CallbackConfigurator 需要根据实际 Manager 接口调整

---

## 🔧 下一步行动

1. 创建 Git 分支: `git checkout -b refactor/comment-view`
2. 按照上述步骤逐步重构
3. 每完成一个阶段就提交一次
4. 全面测试所有功能
5. 合并到主分支

---

## 📝 总结

通过这次重构，CommentView.ts 将从一个 1380 行的巨型类变成一个职责清晰、易于维护的协调者类。所有具体的业务逻辑都被拆分到独立的 Manager 中，每个 Manager 都遵循单一职责原则，代码质量和可维护性将得到显著提升。
