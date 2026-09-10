import { App, Component } from "obsidian";
import { LicenseManager } from "../../services/LicenseManager";
import { FSRSManager } from "../services/FSRSManager";
import { 
    FlashcardState, 
    FSRS_RATING, 
    FSRSRating, 
    GroupProgressState
} from "../types/FSRSTypes";
import { t } from "../../i18n";

import { FlashcardRenderer } from "./FlashcardRenderer";
import {
    FlashcardOperations,
    FlashcardGroupManager,
    FlashcardProgressManager,
    FlashcardUtils
} from "./controllers";
import type CommentPlugin from "../../../main";
import type { FlashcardRatingButton } from "./FlashcardComponentContext";
import {
    findGroupIdByName,
    findGroupNameById,
    getGroupCompletionMessage,
    loadFlashcardUIState,
    saveFlashcardUIState,
    setGroupCompletionMessage
} from "./FlashcardUIState";

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
    private currentGroupName: string = '';
    private currentGroupId: string = '';
    private app: App;
    private plugin: CommentPlugin;
    private completionMessage: string | null = null;
    
    // 存储每个分组的学习进度和完成状态
    private groupProgress: Record<string, GroupProgressState> = {};

    // 评分按钮配置
    private readonly ratingButtons: FlashcardRatingButton[] = [
        { label: t('Again'), rating: FSRS_RATING.AGAIN, key: '1', ratingText: 'again' },
        { label: t('Hard'), rating: FSRS_RATING.HARD, key: '2', ratingText: 'hard' },
        { label: t('Good'), rating: FSRS_RATING.GOOD, key: '3', ratingText: 'good' },
        { label: t('Easy'), rating: FSRS_RATING.EASY, key: '4', ratingText: 'easy' }
    ];
    
    // 子组件
    public renderer: FlashcardRenderer;
    public operations: FlashcardOperations;
    public groupManager: FlashcardGroupManager;
    public progressManager: FlashcardProgressManager;
    public utils: FlashcardUtils;

    constructor(container: HTMLElement, plugin: CommentPlugin) {
        super();
        this.container = container;
        this.plugin = plugin;
        this.app = plugin.app;
        this.fsrsManager = plugin.fsrsManager;
        
        // 初始化子组件
        this.renderer = new FlashcardRenderer(this);
        this.operations = new FlashcardOperations(this);
        this.groupManager = new FlashcardGroupManager(this);
        this.progressManager = new FlashcardProgressManager(this);
        this.utils = new FlashcardUtils(this);
        
        const uiState = loadFlashcardUIState(this.fsrsManager);
        this.currentGroupName = uiState.currentGroupName;
        this.currentGroupId = uiState.currentGroupId;
        this.currentIndex = uiState.currentIndex;
        this.isFlipped = uiState.isFlipped;
        this.completionMessage = uiState.completionMessage;
        this.groupProgress = uiState.groupProgress;
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
        this.groupManager.dispose();
        // 键盘事件监听器已移除
    }
    
    /**
     * 激活组件
     */
    public async activate() {
        this.isActive = true;
        
        // 检查许可证状态
        if (this.licenseManager) {
            const isActivated = await this.licenseManager.isActivated();
            const isFeatureEnabled = isActivated ? await this.licenseManager.isFeatureEnabled('flashcard') : false;
            
            if (isActivated && isFeatureEnabled) {
                // 已激活且启用了闪卡功能，刷新卡片列表
                this.operations.refreshCardList();
                
                // 渲染功能界面
                this.renderer.render();
                return;
            }
        }
        
        // 未激活或未启用闪卡功能，显示激活界面
        this.renderer.renderActivation();
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
        this.groupManager.dispose();
        this.isActive = false;
        this.container.empty();
        this.container.removeClass('flashcard-mode');
        // 键盘事件监听器已移除
    }
    
    /**
     * 销毁组件
     */
    public destroy() {
        this.groupManager.dispose();
        // 键盘事件监听器已移除
        this.container.removeClass('flashcard-mode');
        this.container.empty();
    }
    
    // Getter/Setter 方法
    
    public getContainer(): HTMLElement {
        return this.container;
    }

    public getPlugin(): CommentPlugin {
        return this.plugin;
    }
    
    public getIsActive(): boolean {
        return this.isActive;
    }
    
    public getApp(): App {
        return this.app;
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
        this.currentGroupId = findGroupIdByName(this.fsrsManager, groupName);
    }
    
    public getCurrentGroupId(): string {
        return this.currentGroupId;
    }
    
    public setCurrentGroupId(groupId: string) {
        this.currentGroupId = groupId;
        this.currentGroupName = findGroupNameById(this.fsrsManager, groupId);
    }
    
    /**
     * 获取全局完成消息
     * @returns 完成消息或 null
     */
    public getCompletionMessage(): string | null {
        return this.completionMessage;
    }
    
    /**
     * 设置全局完成消息
     * @param message 完成消息或 null
     */
    public setCompletionMessage(message: string | null) {
        this.completionMessage = message;
    }
    
    /**
     * 获取指定分组的完成消息
     * @param groupName 分组名称
     * @returns 完成消息或 null
     */
    public getGroupCompletionMessage(groupName: string): string | null {
        return getGroupCompletionMessage(this.groupProgress, groupName);
    }
    
    /**
     * 设置指定分组的完成消息
     * @param groupName 分组名称
     * @param message 完成消息或 null
     */
    public setGroupCompletionMessage(groupName: string, message: string | null) {
        setGroupCompletionMessage(this.fsrsManager, this.groupProgress, groupName, message);
    }
    
    public getGroupProgress(groupName?: string): GroupProgressState | null {
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
    
    // 键盘快捷键相关方法已移除
    
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
    
    // 键盘快捷键设置方法已移除
    
    /**
     * 保存当前状态
     * 优化版本：直接在组件中处理状态保存，确保所有状态都被正确保存
     */
    public saveState() {
        saveFlashcardUIState(this.fsrsManager, {
            currentGroupName: this.currentGroupName,
            completionMessage: this.completionMessage,
            cards: this.cards,
            currentIndex: this.currentIndex,
            isFlipped: this.isFlipped,
            groupProgress: this.groupProgress
        });
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
