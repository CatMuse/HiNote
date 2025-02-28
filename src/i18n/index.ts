import { moment } from 'obsidian';
import en from './en';
import zh from './zh';

const translations: { [key: string]: any } = {
    en,
    zh
};

export function t(key: string): string {
    // 获取 Obsidian 当前语言
    const locale = moment.locale();
    // 如果是中文环境，使用中文翻译
    const currentTranslations = locale.startsWith('zh') ? translations.zh : translations.en;
    
    // 直接获取翻译
    const translation = currentTranslations[key];
    if (translation) {
        return translation;
    }

    return key;
}
