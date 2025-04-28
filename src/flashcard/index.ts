/**
 * Flashcard 模块入口文件
 * 导出所有公共 API
 */

// 导出类型
export * from './types/FSRSTypes';
export * from './types/FlashcardTypes';

// 导出服务
export { FSRSManager } from './services/FSRSManager';
export { FSRSService } from './services/FSRSService';

// 导出组件
export { FlashcardComponent } from './components/FlashcardComponent';

// 导出设置
export { FlashcardSettingsTab } from './settings/FlashcardSettingsTab';
