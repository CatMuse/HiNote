import { App, TFile, Component } from "obsidian";
import { HighlightCard } from "../../components/highlight/HighlightCard";
import { HighlightInfo as HiNote } from "../../types";

/**
 * 事件回调接口
 */
export interface EventCallbacks {
    onFileOpen?: (file: TFile, isInCanvas: boolean) => void;
    onFileModify?: (file: TFile, isInCanvas: boolean) => void;
    onFileCreate?: () => void;
    onFileDelete?: () => void;
    onLayoutChange?: () => void;
    onCommentInput?: (highlightId: string, text: string) => void;
}

/**
 * 事件协调器
 * 职责：
 * 1. 统一管理所有事件监听器
 * 2. 文件事件（打开、修改、创建、删除）
 * 3. 自定义事件（评论输入、多选）
 * 4. 布局变化事件
 */
export class EventCoordinator {
    private callbacks: EventCallbacks = {};
    private eventRefs: any[] = [];
    private customEventHandlers: Map<string, EventListener> = new Map();

    constructor(
        private app: App,
        private component: Component
    ) {}

    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: EventCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    /**
     * 注册所有事件监听器
     */
    registerAllEvents(
        getCurrentFile: () => TFile | null,
        isDraggedToMainView: () => boolean
    ): void {
        // 监听文档切换
        this.registerFileOpenEvent(getCurrentFile, isDraggedToMainView);

        // 监听文档修改
        this.registerFileModifyEvent(getCurrentFile, isDraggedToMainView);

        // 监听文件创建和删除
        this.registerFileCreateEvent();
        this.registerFileDeleteEvent();

        // 监听布局变化
        this.registerLayoutChangeEvent();

        // 监听评论输入事件
        this.registerCommentInputEvent();
    }

    /**
     * 注册文件打开事件
     */
    private registerFileOpenEvent(
        getCurrentFile: () => TFile | null,
        isDraggedToMainView: () => boolean
    ): void {
        const ref = this.app.workspace.on('file-open', (file) => {
            // 只在非主视图时同步文件
            if (file && !isDraggedToMainView()) {
                const activeLeaf = this.app.workspace.activeLeaf;
                const isInCanvas = activeLeaf?.getViewState()?.state?.file !== file.path && 
                                  activeLeaf?.view?.getViewType() === 'canvas';
                
                if (this.callbacks.onFileOpen) {
                    this.callbacks.onFileOpen(file, isInCanvas);
                }
            }
        });
        
        this.component.registerEvent(ref);
        this.eventRefs.push(ref);
    }

    /**
     * 注册文件修改事件
     */
    private registerFileModifyEvent(
        getCurrentFile: () => TFile | null,
        isDraggedToMainView: () => boolean
    ): void {
        const ref = this.app.vault.on('modify', (file) => {
            const currentFile = getCurrentFile();
            
            // 只在非主视图时同步文件
            if (file === currentFile && !isDraggedToMainView() && file instanceof TFile) {
                const activeLeaf = this.app.workspace.activeLeaf;
                const isInCanvas = activeLeaf?.getViewState()?.state?.file !== file.path && 
                                  activeLeaf?.view?.getViewType() === 'canvas';
                
                if (this.callbacks.onFileModify) {
                    this.callbacks.onFileModify(file, isInCanvas);
                }
            }
        });
        
        this.component.registerEvent(ref);
        this.eventRefs.push(ref);
    }

    /**
     * 注册文件创建事件
     */
    private registerFileCreateEvent(): void {
        const ref = this.app.vault.on('create', () => {
            if (this.callbacks.onFileCreate) {
                this.callbacks.onFileCreate();
            }
        });
        
        this.component.registerEvent(ref);
        this.eventRefs.push(ref);
    }

    /**
     * 注册文件删除事件
     */
    private registerFileDeleteEvent(): void {
        const ref = this.app.vault.on('delete', () => {
            if (this.callbacks.onFileDelete) {
                this.callbacks.onFileDelete();
            }
        });
        
        this.component.registerEvent(ref);
        this.eventRefs.push(ref);
    }

    /**
     * 注册布局变化事件
     */
    private registerLayoutChangeEvent(): void {
        const ref = this.app.workspace.on('layout-change', () => {
            if (this.callbacks.onLayoutChange) {
                this.callbacks.onLayoutChange();
            }
        });
        
        this.component.registerEvent(ref);
        this.eventRefs.push(ref);
    }

    /**
     * 注册评论输入事件
     */
    private registerCommentInputEvent(): void {
        const handleCommentInput = (e: CustomEvent) => {
            const { highlightId, text } = e.detail;
            
            if (this.callbacks.onCommentInput) {
                this.callbacks.onCommentInput(highlightId, text);
            }
        };

        window.addEventListener("open-comment-input", handleCommentInput as EventListener);
        this.customEventHandlers.set("open-comment-input", handleCommentInput as EventListener);
        
        this.component.register(() => {
            window.removeEventListener("open-comment-input", handleCommentInput as EventListener);
        });
    }

    /**
     * 注册键盘事件（用于多选）
     */
    registerKeyboardEvents(highlightContainer: HTMLElement): void {
        // 按住 Shift 键进行多选
        const keydownHandler = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                highlightContainer.addClass('multi-select-mode');
            }
        };

        const keyupHandler = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                highlightContainer.removeClass('multi-select-mode');
            }
        };

        this.component.registerDomEvent(document, 'keydown', keydownHandler);
        this.component.registerDomEvent(document, 'keyup', keyupHandler);
    }

    /**
     * 处理评论输入显示
     */
    handleCommentInputDisplay(
        highlightId: string,
        text: string,
        highlightContainer: HTMLElement,
        onShowCommentInput: (card: HTMLElement, highlight: HiNote) => void
    ): void {
        // 等待一下确保视图已经更新
        setTimeout(() => {
            // 移除所有卡片的选中状态
            highlightContainer.querySelectorAll('.highlight-card').forEach(card => {
                card.removeClass('selected');
            });

            // 首先尝试直接通过高亮 ID 查找卡片实例
            let cardInstance = HighlightCard.findCardInstanceByHighlightId(highlightId);
            
            // 如果没找到，尝试通过文本内容查找
            if (!cardInstance) {
                const highlightCard = Array.from(highlightContainer.querySelectorAll('.highlight-card'))
                    .find(card => {
                        const textContent = card.querySelector('.highlight-text-content')?.textContent;
                        return textContent === text;
                    });

                if (highlightCard) {
                    // 添加选中状态
                    highlightCard.addClass('selected');
                    
                    // 查找 HighlightCard 实例
                    cardInstance = HighlightCard.findCardInstanceByElement(highlightCard as HTMLElement);
                    
                    // 滚动到评论区域
                    highlightCard.scrollIntoView({ behavior: "smooth" });
                }
            }
            
            // 如果找到了卡片实例，显示评论输入框
            if (cardInstance) {
                cardInstance.showCommentInput();
            }
        }, 100);
    }

    /**
     * 销毁事件协调器
     */
    destroy(): void {
        // 清理自定义事件监听器
        this.customEventHandlers.forEach((handler, eventName) => {
            window.removeEventListener(eventName, handler);
        });
        this.customEventHandlers.clear();
        
        // 清理事件引用
        this.eventRefs = [];
        this.callbacks = {};
    }
}
