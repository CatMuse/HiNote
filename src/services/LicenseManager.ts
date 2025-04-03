import { Notice, Plugin, requestUrl } from 'obsidian';

export class LicenseManager {
    private plugin: Plugin;
    private readonly STORAGE_KEY = 'flashcard-license';
    private readonly VAULT_ID_KEY = 'vault-id';
    private readonly API_URL = 'https://hi-note-license-server-production.up.railway.app';
    private readonly FEATURES = ['flashcard'];
    private readonly VERIFICATION_INTERVAL_DAYS = 7; // 验证间隔天数
    private licenseToken: string | null = null;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    // 生成Vault ID（笔记库唯一标识符）
    private async generateVaultId(): Promise<string> {
        try {
            // 首先尝试从存储中获取Vault ID
            const data = await this.plugin.loadData() || {};
            if (data[this.VAULT_ID_KEY]) {
                return data[this.VAULT_ID_KEY];
            }
            
            // 如果没有存储的Vault ID，则生成一个新的
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
            const vaultInfo = [vaultPath, platform].join('|');
            
            // 使用 SHA-256 哈希
            const encoder = new TextEncoder();
            const data2 = encoder.encode(vaultInfo);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data2);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const vaultId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // 存储生成的Vault ID
            await this.saveVaultId(vaultId);
            
            return vaultId;
        } catch (error) {

            // 如果出错，回退到简单的 vault 路径哈希
            const vaultPath = this.plugin.app.vault.getName();
            const encoder = new TextEncoder();
            const data = encoder.encode(vaultPath);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const vaultId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // 存储生成的Vault ID
            await this.saveVaultId(vaultId);
            
            return vaultId;
        }
    }
    
    // 保存Vault ID
    private async saveVaultId(vaultId: string): Promise<void> {
        const currentData = await this.plugin.loadData() || {};
        await this.plugin.saveData({
            ...currentData,
            [this.VAULT_ID_KEY]: vaultId
        });
    }

    // 激活 License
    async activateLicense(licenseKey: string): Promise<boolean> {
        try {

            const vaultId = await this.generateVaultId();

            const url = `${this.API_URL}/api/verify`;

            // 使用vaultId但在API请求中仍保持deviceId字段名称以兼容服务器
            const requestBody = { licenseKey, deviceId: vaultId };

            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = response.json;

            if (data.valid) {
                // 保存许可证信息
                const currentData = await this.plugin.loadData() || {};
                await this.plugin.saveData({
                    ...currentData,
                    [this.STORAGE_KEY]: {
                        key: licenseKey,
                        token: data.token,
                        features: data.features,
                        vaultId: vaultId, // 保存当前Vault ID
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
            const vaultId = await this.generateVaultId();
            
            // 检查当前Vault ID 是否与激活时的Vault ID 不同
            const activationVaultId = licenseData.vaultId;
            const isVaultChanged = activationVaultId && activationVaultId !== vaultId;
            
            const response = await requestUrl({
                url: `${this.API_URL}/api/verify`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${licenseData.token}`
                },
                body: JSON.stringify({
                    licenseKey: licenseData.key,
                    deviceId: vaultId, // 使用旧字段名以兼容服务器
                    isDeviceChanged: isVaultChanged // 使用旧字段名以兼容服务器
                })
            });

            const result = response.json;
            
            if (!result) {
                // 如果服务器返回错误，但我们有本地令牌，仍然允许使用
                // 这样在网络问题时用户仍能使用插件
                if (this.licenseToken) {
                    return true;
                }
                return false;
            }
            if (result.valid) {
                // 更新验证时间、token 和设备 ID
                const currentData = await this.plugin.loadData() || {};
                await this.plugin.saveData({
                    ...currentData,
                    [this.STORAGE_KEY]: {
                        ...licenseData,
                        token: result.token || licenseData.token,
                        vaultId: vaultId, // 更新Vault ID
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
