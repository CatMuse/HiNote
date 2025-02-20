import { Notice, Plugin } from 'obsidian';

export class LicenseManager {
    private plugin: Plugin;
    private readonly STORAGE_KEY = 'flashcard-license';
    private readonly API_URL = 'https://hi-note-license-server.vercel.app/api';
    private licenseToken: string | null = null;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    // 仅用于测试：生成测试许可证
    async generateTestLicense(): Promise<string> {
        const deviceId = await this.generateDeviceId();
        const licenseData = `${deviceId}-flashcard`;
        return btoa(licenseData);
    }

    // 生成设备ID
    private async generateDeviceId(): Promise<string> {
        const vaultPath = (this.plugin.app.vault.adapter as any).getBasePath?.() || this.plugin.app.vault.getName();
        const encoder = new TextEncoder();
        const data = encoder.encode(vaultPath);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 激活 License
    async activateLicense(licenseKey: string): Promise<boolean> {
        try {
            const deviceId = await this.generateDeviceId();
            const response = await fetch(`${this.API_URL}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey, deviceId })
            });

            const data = await response.json();
            
            if (data.valid) {
                // 保存许可证信息
                const currentData = await this.plugin.loadData() || {};
                await this.plugin.saveData({
                    ...currentData,
                    [this.STORAGE_KEY]: {
                        key: licenseKey,
                        token: data.token,
                        features: data.features
                    }
                });
                
                this.licenseToken = data.token;
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('License activation error:', error);
            return false;
        }
    }

    // 检查是否已激活
    async isActivated(): Promise<boolean> {
        try {
            const data = await this.plugin.loadData();
            const licenseData = data?.[this.STORAGE_KEY];
            
            if (!licenseData?.token) {
                return false;
            }

            // 验证本地存储的许可证
            const deviceId = await this.generateDeviceId();
            const response = await fetch(`${this.API_URL}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${licenseData.token}`
                },
                body: JSON.stringify({
                    licenseKey: licenseData.key,
                    deviceId
                })
            });

            const result = await response.json();
            if (result.valid) {
                this.licenseToken = result.token;
                return true;
            }

            return false;
        } catch (error) {
            console.error('License verification error:', error);
            return false;
        }
    }

}
