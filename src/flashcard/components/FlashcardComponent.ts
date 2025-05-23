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
    private currentGroupName: string = '';
    private currentGroupId: string = '';
    private app: any;
    private completionMessage: string | null = null;
    
    // 存储每个分组的完成状态
    private groupCompletionMessages: Record<string, string | null> = {};
    
    // 存储每个分组的学习进度
    private groupProgress: Record<string, { currentIndex: number, isFlipped: boolean, currentCardId?: string }> = {};

    // 评分按钮配置
    private readonly ratingButtons = [
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
        
        // 初始化属性
        this.groupCompletionMessages = {};
        this.groupProgress = {};
        
        // 加载 UI 状态
        const uiState = this.fsrsManager.getUIState() || {};
        
        // 设置当前分组名称
        this.currentGroupName = uiState.currentGroupName || '';
        
        // 设置当前分组 ID
        if (this.currentGroupName) {
            const group = this.fsrsManager.getCardGroups().find((g: any) => g.name === this.currentGroupName);
            if (group) {
                this.currentGroupId = group.id;
            } else {
                this.currentGroupId = '';
            }
        } else {
            this.currentGroupId = '';
        }
        
        // 设置其他状态
        this.currentIndex = uiState.currentIndex || 0;
        this.isFlipped = uiState.isFlipped || false;
        this.completionMessage = uiState.completionMessage || null;
        
        // 确保 groupCompletionMessages 和 groupProgress 是对象
        if (uiState && 'groupCompletionMessages' in uiState && uiState.groupCompletionMessages && typeof uiState.groupCompletionMessages === 'object') {
            this.groupCompletionMessages = { ...uiState.groupCompletionMessages };
        } else {
            this.groupCompletionMessages = {};
        }
        
        if (uiState && 'groupProgress' in uiState && uiState.groupProgress && typeof uiState.groupProgress === 'object') {
            this.groupProgress = { ...uiState.groupProgress };
        } else {
            this.groupProgress = {};
        }
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
        // 键盘事件监听器已移除
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
        // 键盘事件监听器已移除
    }
    
    /**
     * 销毁组件
     */
    public destroy() {
        // 键盘事件监听器已移除
        this.container.removeClass('flashcard-mode');
        this.container.empty();
    }
    
    // Getter/Setter 方法
    
    public getContainer(): HTMLElement {
        return this.container;
    }
    
    public getApp(): any {
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
        // 更新分组 ID
        if (groupName) {
            const group = this.fsrsManager.getCardGroups().find((g: any) => g.name === groupName);
            if (group) {
                this.currentGroupId = group.id;
            } else {
                this.currentGroupId = '';
            }
        } else {
            this.currentGroupId = '';
        }
    }
    
    public getCurrentGroupId(): string {
        return this.currentGroupId;
    }
    
    public setCurrentGroupId(groupId: string) {
        this.currentGroupId = groupId;
        // 更新分组名称
        if (groupId) {
            const group = this.fsrsManager.getCardGroups().find((g: any) => g.id === groupId);
            this.currentGroupName = group ? group.name : '';
        } else {
            this.currentGroupName = '';
        }
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
        // 获取当前分组
        const groupName = this.getCurrentGroupName();
        
        // 获取 UI 状态
        const uiState = this.fsrsManager.getUIState();
        
        // 更新基本 UI 状态
        uiState.currentGroupName = groupName;
        uiState.currentIndex = this.currentIndex;
        uiState.isFlipped = this.isFlipped;
        uiState.completionMessage = this.completionMessage;
        
        // 确保分组进度存在
        if (!uiState.groupProgress) {
            uiState.groupProgress = {};
        }
        
        // 只有在有分组名称时才保存分组进度
        if (groupName) {
            // 保存当前分组的进度
            const currentCardId = this.cards.length > 0 && this.currentIndex < this.cards.length ? 
                this.cards[this.currentIndex].id : undefined;
                
            uiState.groupProgress[groupName] = {
                currentIndex: this.currentIndex,
                isFlipped: this.isFlipped,
                currentCardId: currentCardId // 保存当前卡片ID
            };
            
            // 确保分组完成消息存在
            if (!uiState.groupCompletionMessages) {
                uiState.groupCompletionMessages = {};
            }
            
            // 保存分组完成消息
            uiState.groupCompletionMessages[groupName] = this.getGroupCompletionMessage(groupName);
        }
        
        // 保存 UI 状态
        this.fsrsManager.updateUIState(uiState);
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
