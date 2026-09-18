import { moment } from 'obsidian';
import en from './en';
import zh from './zh';

const translations: Record<string, Record<string, string>> = { en, zh };
export type TranslationParameters = Record<string, string | number>;

export function getLanguage(): 'en' | 'zh' {
    return moment.locale().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Match a stable key first; user content is substituted once, never translated. */
export function t(key: string, parameters?: TranslationParameters): string {
    const dictionary = translations[getLanguage()];
    const translated = Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : key;
    if (!parameters) return translated;
    return translated.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name: string) =>
        Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder);
}

export function getDateLocale(): string {
    const locale = moment.locale().replace(/_/g, '-');
    if (getLanguage() === 'zh') return /tw|hk|hant/i.test(locale) ? 'zh-TW' : 'zh-CN';
    return /^en(?:-|$)/i.test(locale) ? locale : 'en';
}

export function formatDate(value: number | Date, options?: Intl.DateTimeFormatOptions): string {
    return new Date(value).toLocaleDateString(getDateLocale(), options);
}

export function formatDateTime(value: number | Date): string {
    return new Date(value).toLocaleString(getDateLocale());
}
