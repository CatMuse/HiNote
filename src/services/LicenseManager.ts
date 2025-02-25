import { Notice, Plugin } from 'obsidian';

export class LicenseManager {
    private plugin: Plugin;
    private readonly STORAGE_KEY = 'flashcard-license';
    private readonly API_URL = 'https://hi-note-license-server-production.up.railway.app';
    private readonly FEATURES = ['flashcard'];
    private licenseToken: string | null = null;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
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
            console.log('Activating license with key:', licenseKey);
            const deviceId = await this.generateDeviceId();
            console.log('Generated device ID:', deviceId);
            
            const url = `${this.API_URL}/api/verify`;
            console.log('Making request to:', url);
            
            const requestBody = { licenseKey, deviceId };
            console.log('Request body:', requestBody);
            
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
                console.error('Server response not ok:', response.status, response.statusText);
                throw new Error(`Server response failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Server response:', data);
            
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
            
            console.log('License validation failed');
            return false;
        } catch (error) {
            console.error('License activation error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error details:', errorMessage);
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

            // 如果已经有 licenseToken，直接返回 true
            if (this.licenseToken) {
                return true;
            }

            // 设置 licenseToken
            this.licenseToken = licenseData.token;
            return true;

            // 注释掉服务器验证部分，因为在激活时已经验证过了
            /* const deviceId = await this.generateDeviceId();
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
            } */
        } catch (error) {
            console.error('License verification error:', error);
            return false;
        }
    }

}
