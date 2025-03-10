import { Notice, Plugin } from 'obsidian';

export class LicenseManager {
    private plugin: Plugin;
    private readonly STORAGE_KEY = 'flashcard-license';
    private readonly DEVICE_ID_KEY = 'device-id';
    private readonly API_URL = 'https://hi-note-license-server-production.up.railway.app';
    private readonly FEATURES = ['flashcard'];
    private readonly VERIFICATION_INTERVAL_DAYS = 7; // 验证间隔天数
    private licenseToken: string | null = null;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    // 生成设备ID
    private async generateDeviceId(): Promise<string> {
        try {
            // 首先尝试从存储中获取设备 ID
            const data = await this.plugin.loadData() || {};
            if (data[this.DEVICE_ID_KEY]) {
                return data[this.DEVICE_ID_KEY];
            }
            
            // 如果没有存储的设备 ID，则生成一个新的
            // 主要使用相对稳定的因素
            // 获取保存路径信息
            const adapter = this.plugin.app.vault.adapter;
            // 使用更安全的方式获取路径信息
            let vaultPath = this.plugin.app.vault.getName();
            // 尝试使用 adapter 的其他属性或方法获取更多信息
            if (adapter && 'basePath' in adapter) {
                vaultPath = (adapter as any).basePath + '/' + vaultPath;
            }
            const platform = navigator.platform || '';
            
            // 组合因素 (减少变化频繁的因素)
            const deviceInfo = [vaultPath, platform].join('|');
            
            // 使用 SHA-256 哈希
            const encoder = new TextEncoder();
            const data2 = encoder.encode(deviceInfo);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data2);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const deviceId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // 存储生成的设备 ID
            await this.saveDeviceId(deviceId);
            
            return deviceId;
        } catch (error) {

            // 如果出错，回退到简单的 vault 路径哈希
            const vaultPath = this.plugin.app.vault.getName();
            const encoder = new TextEncoder();
            const data = encoder.encode(vaultPath);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const deviceId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // 存储生成的设备 ID
            await this.saveDeviceId(deviceId);
            
            return deviceId;
        }
    }
    
    // 保存设备 ID
    private async saveDeviceId(deviceId: string): Promise<void> {
        const currentData = await this.plugin.loadData() || {};
        await this.plugin.saveData({
            ...currentData,
            [this.DEVICE_ID_KEY]: deviceId
        });
    }

    // 激活 License
    async activateLicense(licenseKey: string): Promise<boolean> {
        try {

            const deviceId = await this.generateDeviceId();

            const url = `${this.API_URL}/api/verify`;

            const requestBody = { licenseKey, deviceId };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Origin': 'app://obsidian.md',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                credentials: 'include',
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {

                throw new Error(`Server response failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (data.valid) {
                // 保存许可证信息
                const currentData = await this.plugin.loadData() || {};
                await this.plugin.saveData({
                    ...currentData,
                    [this.STORAGE_KEY]: {
                        key: licenseKey,
                        token: data.token,
                        features: data.features,
                        deviceId: deviceId, // 保存当前设备 ID
                        lastVerified: Date.now()
                    }
                });
                
                this.licenseToken = data.token;
                return true;
            }

            return false;
        } catch (error) {

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            return false;
        }
    }

    // 检查特定功能是否已激活
    async isFeatureEnabled(feature: string): Promise<boolean> {
        const data = await this.plugin.loadData();
        const licenseData = data?.[this.STORAGE_KEY];
        return licenseData?.features?.includes(feature) || false;
    }

    // 检查是否已激活
    async isActivated(): Promise<boolean> {
        try {
            const data = await this.plugin.loadData();
            const licenseData = data?.[this.STORAGE_KEY];
            
            // 如果本地没有许可证信息，直接返回 false
            if (!licenseData?.token) {
                return false;
            }

            // 检查是否需要重新验证
            const shouldVerify = this.shouldVerifyLicense(licenseData.lastVerified);
            
            // 如果需要重新验证，则向服务器发送验证请求
            if (shouldVerify) {
                return this.verifyWithServer(licenseData);
            }

            // 如果已经有 licenseToken，直接返回 true
            if (this.licenseToken) {
                return true;
            }

            // 设置 licenseToken
            this.licenseToken = licenseData.token;
            return true;
        } catch (error) {

            return false;
        }
    }

    // 检查是否需要重新验证许可证
    private shouldVerifyLicense(lastVerified?: number): boolean {
        if (!lastVerified) return true;
        
        const now = Date.now();
        const daysSinceLastVerification = (now - lastVerified) / (1000 * 60 * 60 * 24);
        
        return daysSinceLastVerification >= this.VERIFICATION_INTERVAL_DAYS;
    }

    // 向服务器验证许可证
    private async verifyWithServer(licenseData: any): Promise<boolean> {
        try {
            const deviceId = await this.generateDeviceId();
            
            // 检查当前设备 ID 是否与激活时的设备 ID 不同
            const activationDeviceId = licenseData.deviceId;
            const isDeviceChanged = activationDeviceId && activationDeviceId !== deviceId;
            
            const response = await fetch(`${this.API_URL}/api/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'app://obsidian.md',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${licenseData.token}`
                },
                mode: 'cors',
                credentials: 'include',
                body: JSON.stringify({
                    licenseKey: licenseData.key,
                    deviceId,
                    isDeviceChanged // 告知服务器设备已更改
                })
            });

            if (!response.ok) {
                // 如果服务器返回错误，但我们有本地令牌，仍然允许使用
                // 这样在网络问题时用户仍能使用插件
                if (this.licenseToken) {
                    return true;
                }
                return false;
            }

            const result = await response.json();
            if (result.valid) {
                // 更新验证时间、token 和设备 ID
                const currentData = await this.plugin.loadData() || {};
                await this.plugin.saveData({
                    ...currentData,
                    [this.STORAGE_KEY]: {
                        ...licenseData,
                        token: result.token || licenseData.token,
                        deviceId: deviceId, // 更新设备 ID
                        lastVerified: Date.now()
                    }
                });
                
                this.licenseToken = result.token || licenseData.token;
                return true;
            }
            
            return false;
        } catch (error) {

            // 如果服务器验证失败，但有本地token，仍然允许使用
            // 这样可以确保在网络问题时用户仍能使用插件
            return !!this.licenseToken;
        }
    }
}
