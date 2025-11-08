import { Component } from "obsidian";
import { HiNote } from "../../CommentStore";
import { LicenseManager } from "../../services/LicenseManager";
import { FSRSManager } from "../services/FSRSManager";
import { 
    FlashcardState, 
    FSRS_RATING, 
    FSRSRating, 
    CardGroup,
    FlashcardProgress,
    GroupProgressState
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
    
    // 存储每个分组的学习进度和完成状态
    private groupProgress: Record<string, GroupProgressState> = {};

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
        this.completionMessage = uiState.completionMessage || null;
        
        // 初始化分组进度
        if (uiState.groupProgress) {
            this.groupProgress = { ...uiState.groupProgress };
        }
        
        // 不再需要将完成消息存储到单独的对象中，直接从 groupProgress 读取
        
        // 从分组进度中获取当前索引和翻转状态
        if (this.currentGroupName && this.groupProgress[this.currentGroupName]) {
            this.currentIndex = this.groupProgress[this.currentGroupName].currentIndex || 0;
            this.isFlipped = this.groupProgress[this.currentGroupName].isFlipped || false;
        } else {
            this.currentIndex = 0;
            this.isFlipped = false;
        }
        
        // 确保 groupProgress 是对象
        if (!uiState || !uiState.groupProgress || typeof uiState.groupProgress !== 'object') {
            this.groupProgress = {};
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
    
    public getIsActive(): boolean {
        return this.isActive;
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
        if (this.groupProgress[groupName]) {
            return this.groupProgress[groupName].completionMessage || null;
        }
        return null;
    }
    
    /**
     * 设置指定分组的完成消息
     * @param groupName 分组名称
     * @param message 完成消息或 null
     */
    public setGroupCompletionMessage(groupName: string, message: string | null) {
        // 确保分组进度对象存在
        if (!this.groupProgress[groupName]) {
            this.groupProgress[groupName] = {
                currentIndex: 0,
                isFlipped: false,
                completionMessage: null
            };
        }
        
        // 设置完成消息
        this.groupProgress[groupName].completionMessage = message;
        
        // 同步更新到 FSRSManager 的存储中
        if (this.fsrsManager) {
            const uiState = this.fsrsManager.getUIState();
            if (!uiState.groupProgress) {
                uiState.groupProgress = {};
            }
            
            // 确保分组进度对象存在
            if (!uiState.groupProgress[groupName]) {
                uiState.groupProgress[groupName] = {
                    currentIndex: 0,
                    isFlipped: false,
                    currentCardId: undefined,
                    completionMessage: undefined
                };
            }
            
            // 更新完成消息
            uiState.groupProgress[groupName].completionMessage = message;
            
            // 如果设置了完成消息，同时重置卡片状态
            if (message) {
                uiState.groupProgress[groupName].isFlipped = false;
                uiState.groupProgress[groupName].currentCardId = undefined;
            }
            
            // 更新 UI 状态
            this.fsrsManager.updateUIState(uiState);
        }
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
            
            // 获取当前分组的完成消息
            const completionMessage = this.getGroupCompletionMessage(groupName);
                
            // 创建或更新分组进度
            if (!uiState.groupProgress[groupName]) {
                uiState.groupProgress[groupName] = {
                    currentIndex: this.currentIndex,
                    isFlipped: this.isFlipped,
                    currentCardId: currentCardId,
                    completionMessage: completionMessage
                };
            } else {
                // 更新现有分组进度
                uiState.groupProgress[groupName].currentIndex = this.currentIndex;
                uiState.groupProgress[groupName].isFlipped = this.isFlipped;
                uiState.groupProgress[groupName].currentCardId = currentCardId;
                uiState.groupProgress[groupName].completionMessage = completionMessage;
            }
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
