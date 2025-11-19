import { Platform } from 'obsidian';

/**
 * 设备管理器
 * 职责：
 * 1. 检测设备类型（移动端、桌面端）
 * 2. 检测屏幕尺寸
 * 3. 提供响应式布局支持
 * 4. 统一管理设备相关状态
 */
export class DeviceManager {
    private isMobileView: boolean = false;
    private isSmallScreen: boolean = false;
    private resizeObserver: ResizeObserver | null = null;
    private onDeviceChangeCallback: ((deviceInfo: DeviceInfo) => void) | null = null;

    constructor() {
        this.updateDeviceInfo();
    }

    /**
     * 设置设备变化回调
     */
    setOnDeviceChange(callback: (deviceInfo: DeviceInfo) => void): void {
        this.onDeviceChangeCallback = callback;
    }

    /**
     * 开始监听屏幕尺寸变化
     */
    startWatching(element: HTMLElement): void {
        // 使用 ResizeObserver 监听元素尺寸变化
        this.resizeObserver = new ResizeObserver(() => {
            const oldIsMobile = this.isMobileView;
            const oldIsSmallScreen = this.isSmallScreen;
            
            this.updateDeviceInfo();
            
            // 如果设备信息发生变化，触发回调
            if (oldIsMobile !== this.isMobileView || oldIsSmallScreen !== this.isSmallScreen) {
                if (this.onDeviceChangeCallback) {
                    this.onDeviceChangeCallback(this.getDeviceInfo());
                }
            }
        });
        
        this.resizeObserver.observe(element);
    }

    /**
     * 停止监听
     */
    stopWatching(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    /**
     * 更新设备信息
     */
    private updateDeviceInfo(): void {
        this.isMobileView = this.checkIfMobile();
        this.isSmallScreen = this.checkIfSmallScreen();
    }

    /**
     * 检测是否为移动设备
     */
    private checkIfMobile(): boolean {
        return Platform.isMobile;
    }

    /**
     * 检测是否为小屏幕设备（宽度小于768px）
     */
    private checkIfSmallScreen(): boolean {
        return window.innerWidth < 768;
    }

    /**
     * 获取当前设备信息
     */
    getDeviceInfo(): DeviceInfo {
        return {
            isMobile: this.isMobileView,
            isSmallScreen: this.isSmallScreen,
            isDesktop: !this.isMobileView,
            isLargeScreen: !this.isSmallScreen
        };
    }

    /**
     * 是否为移动设备
     */
    isMobile(): boolean {
        return this.isMobileView;
    }

    /**
     * 是否为小屏幕
     */
    isSmall(): boolean {
        return this.isSmallScreen;
    }

    /**
     * 是否为桌面设备
     */
    isDesktop(): boolean {
        return !this.isMobileView;
    }

    /**
     * 是否为大屏幕
     */
    isLarge(): boolean {
        return !this.isSmallScreen;
    }

    /**
     * 销毁设备管理器
     */
    destroy(): void {
        this.stopWatching();
        this.onDeviceChangeCallback = null;
    }
}

/**
 * 设备信息接口
 */
export interface DeviceInfo {
    isMobile: boolean;
    isSmallScreen: boolean;
    isDesktop: boolean;
    isLargeScreen: boolean;
}
