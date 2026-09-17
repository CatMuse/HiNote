import type { SecretStorage } from 'obsidian';
import { t } from '../../i18n';

/** Resolve only explicit Keychain references. Never fall back to legacy plaintext. */
export function readApiKey(secrets: Pick<SecretStorage, 'getSecret'>, id?: string): string {
    const value = id ? secrets.getSecret(id) : null;
    if (!value?.trim()) {
        throw new Error(t('API key unavailable. Select or create a Keychain secret in HiNote settings on this device.'));
    }
    return value;
}
