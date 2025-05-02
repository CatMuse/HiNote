import { Component } from "obsidian";
import { HiNote } from "../../CommentStore";
import { LicenseManager } from "../../services/LicenseManager";
import { FSRSManager } from "../services/FSRSManager";
import { 
    FlashcardState, 
    FSRS_RATING, 
    FSRSRating, 
    CardGroup,
    FlashcardProgress
} from "../types/FSRSTypes";
import { t } from "../../i18n";

import { FlashcardRenderer } from "./FlashcardRenderer";
import { FlashcardOperations } from "./FlashcardOperations";
import { FlashcardGroupManager } from "./FlashcardGroupManager";
import { FlashcardProgressManager } from "./FlashcardProgress";
import { FlashcardUtils } from "./FlashcardUtils";

/**
 * 闪卡组件，整合所有闪卡相关功能
 */
export class FlashcardComponent extends Component {
    // 核心属性
    private progressContainer: HTMLElement | null = null;
    private container: HTMLElement;
    private currentIndex: number = 0;
    private isFlipped: boolean = false;
    private cards: FlashcardState[] = [];
    private isActive: boolean = false;
    private licenseManager: LicenseManager;
    private fsrsManager: FSRSManager;
    private currentCard: FlashcardState | null = null;
    private currentGroupName: string = 'All cards';
    private app: any;
    private boundHandleKeyDown: (e: KeyboardEvent) => void;
    private completionMessage: string | null = null;
    
    // 存储每个分组的完成状态
    private groupCompletionMessages: Record<string, string | null> = {};
    
    // 存储每个分组的学习进度
    private groupProgress: Record<string, { currentIndex: number, isFlipped: boolean }> = {};

    // 评分按钮配置
    private readonly ratingButtons = [
        { label: t('Again'), rating: FSRS_RATING.AGAIN, key: '1', ratingText: 'again', stability: 0.1 },
        { label: t('Hard'), rating: FSRS_RATING.HARD, key: '2', ratingText: 'hard', stability: 0.5 },
        { label: t('Good'), rating: FSRS_RATING.GOOD, key: '3', ratingText: 'good', stability: 2 },
        { label: t('Easy'), rating: FSRS_RATING.EASY, key: '4', ratingText: 'easy', stability: 4 }
    ];
    
    // 子组件
    public renderer: FlashcardRenderer;
    public operations: FlashcardOperations;
    public groupManager: FlashcardGroupManager;
    public progressManager: FlashcardProgressManager;
    public utils: FlashcardUtils;

    constructor(container: HTMLElement, plugin: any) {
        super();
        this.container = container;
        this.app = plugin.app;
        this.fsrsManager = plugin.fsrsManager;
        
        // 初始化子组件
        this.renderer = new FlashcardRenderer(this);
        this.operations = new FlashcardOperations(this);
        this.groupManager = new FlashcardGroupManager(this);
        this.progressManager = new FlashcardProgressManager(this);
        this.utils = new FlashcardUtils(this);
        
        // 加载 UI 状态
        const uiState = this.fsrsManager.getUIState();
        this.currentGroupName = uiState.currentGroupName || 'All cards';
        this.currentIndex = uiState.currentIndex || 0;
        this.isFlipped = uiState.isFlipped || false;
        this.completionMessage = uiState.completionMessage || null;
        this.groupCompletionMessages = uiState.groupCompletionMessages || {};
        this.groupProgress = uiState.groupProgress || {};
        
        // 初始化事件处理
        this.boundHandleKeyDown = this.operations.handleKeyDown.bind(this.operations);
    }
    
    /**
     * 设置许可证管理器
     * @param licenseManager 许可证管理器
     */
    public setLicenseManager(licenseManager: LicenseManager) {
        this.licenseManager = licenseManager;
    }
    
    /**
     * 设置卡片列表
     * @param highlights 高亮列表
     */
    public setCards(cards: FlashcardState[]) {
        // 直接设置卡片列表，不再自动创建闪卡
        this.cards = cards;
    }
    
    /**
     * 清理组件
     */
    public cleanup() {
        document.removeEventListener('keydown', this.boundHandleKeyDown);
    }
    
    /**
     * 激活组件
     */
    public activate() {
        this.isActive = true;
        
        // 刷新卡片列表
        this.operations.refreshCardList();
        
        // 渲染界面
        this.renderer.render();
    }
    
    /**
     * 渲染激活界面
     */
    public renderActivation() {
        this.renderer.renderActivation();
    }
    
    /**
     * 停用组件
     */
    public deactivate() {
        this.isActive = false;
        this.container.empty();
        this.container.removeClass('flashcard-mode');
        document.removeEventListener('keydown', this.boundHandleKeyDown);
    }
    
    /**
     * 销毁组件
     */
    public destroy() {
        document.removeEventListener('keydown', this.boundHandleKeyDown);
        this.container.removeClass('flashcard-mode');
        this.container.empty();
    }
    
    // Getter/Setter 方法
    
    public getContainer(): HTMLElement {
        return this.container;
    }
    
    public getApp(): any {
        return { app: this.app };
    }
    
    public getFsrsManager(): FSRSManager {
        return this.fsrsManager;
    }
    
    public getLicenseManager(): LicenseManager {
        return this.licenseManager;
    }
    
    public getCards(): FlashcardState[] {
        return this.cards;
    }
    
    public getCurrentIndex(): number {
        return this.currentIndex;
    }
    
    public setCurrentIndex(index: number) {
        this.currentIndex = index;
    }
    
    public isCardFlipped(): boolean {
        return this.isFlipped;
    }
    
    public setCardFlipped(flipped: boolean) {
        this.isFlipped = flipped;
    }
    
    public getCurrentGroupName(): string {
        return this.currentGroupName;
    }
    
    public setCurrentGroupName(groupName: string) {
        this.currentGroupName = groupName;
    }
    
    public getCompletionMessage(): string | null {
        return this.completionMessage;
    }
    
    public setCompletionMessage(message: string | null) {
        this.completionMessage = message;
    }
    
    public getGroupCompletionMessage(groupName: string): string | null {
        return this.groupCompletionMessages[groupName] || null;
    }
    
    public setGroupCompletionMessage(groupName: string, message: string | null) {
        this.groupCompletionMessages[groupName] = message;
    }
    
    public getGroupProgress(groupName?: string): { currentIndex: number, isFlipped: boolean } | null {
        const name = groupName || this.currentGroupName;
        return this.groupProgress[name] || null;
    }
    
    public isComponentActive(): boolean {
        return this.isActive;
    }
    
    public getProgressContainer(): HTMLElement | null {
        return this.progressContainer;
    }
    
    public setProgressContainer(container: HTMLElement) {
        this.progressContainer = container;
    }
    
    public getBoundHandleKeyDown(): (e: KeyboardEvent) => void {
        return this.boundHandleKeyDown;
    }
    
    public setBoundHandleKeyDown(handler: (e: KeyboardEvent) => void) {
        this.boundHandleKeyDown = handler;
    }
    
    public getRatingButtons() {
        return this.ratingButtons;
    }
    
    // 代理方法，用于简化调用
    
    public flipCard() {
        this.operations.flipCard();
    }
    
    public nextCard() {
        this.operations.nextCard();
    }
    
    public rateCard(rating: FSRSRating) {
        this.operations.rateCard(rating);
    }
    
    public refreshCardList() {
        this.operations.refreshCardList();
    }
    
    public setupKeyboardShortcuts() {
        this.operations.setupKeyboardShortcuts();
    }
    
    public saveState() {
        this.progressManager.saveState();
    }
    
    public updateProgress() {
        this.progressManager.updateProgress();
    }
    
    public getRenderer(): FlashcardRenderer {
        return this.renderer;
    }
    
    public getOperations(): FlashcardOperations {
        return this.operations;
    }
    
    public getGroupManager(): FlashcardGroupManager {
        return this.groupManager;
    }
    
    public getProgressManager(): FlashcardProgressManager {
        return this.progressManager;
    }
    
    public getUtils(): FlashcardUtils {
        return this.utils;
    }
}
