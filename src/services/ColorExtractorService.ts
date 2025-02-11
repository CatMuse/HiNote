import { HighlightInfo } from '../types';

export class ColorExtractorService {
    // 颜色格式的正则表达式
    private static readonly COLOR_PATTERNS = [
        // RGB/RGBA 格式
        /rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*[0-9.]+)?\)/,
        // HEX 格式
        /#[0-9a-fA-F]{3,8}/,
        // CSS 变量
        /var\(--[^)]+\)/
    ];

    // 从 HTML 标签的 style 属性中提取颜色
    extractColorFromStyle(style: string): string | null {
        if (!style) return null;
        
        const bgColorMatch = style.match(
            /background(?:-color)?:\s*((?:rgba?\(.*?\)|#[0-9a-fA-F]{3,8}|var\(--[^)]+\)))/
        );
        
        return bgColorMatch ? bgColorMatch[1] : null;
    }

    // 从 HTML 元素中提取颜色
    extractColorFromElement(element: string): string | null {
        // 提取 style 属性
        const styleMatch = element.match(/style=["']([^"']*)["']/);
        if (!styleMatch) return null;
        
        return this.extractColorFromStyle(styleMatch[1]);
    }
}
