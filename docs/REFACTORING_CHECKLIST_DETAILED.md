# 激进重构详细清单

## 📋 文件修改清单（按优先级排序）

### 阶段 1: 完成核心文件（已开始）

#### 1.1 PreviewWidgetRenderer ⏳ 进行中
**文件**: `src/view/preview/PreviewWidgetRenderer.ts`
**状态**: 构造函数已更新，需要更新方法内部
**需要修改的地方**:
- [ ] Line 97: `this.commentStore.getCommentsByBlockId` → `this.highlightRepository.findHighlightsByBlockId`
- [ ] Line 106: `this.commentStore.getHiNotes` → 使用 `this.highlightRepository.getCachedHighlights` + 过滤逻辑
- [ ] Line 109: 添加 null 检查

#### 1.2 HighlightDecorator ⏳ 进行中
**文件**: `src/HighlightDecorator.ts`
**状态**: 部分已更新
**已完成**:
- ✅ 构造函数更新
- ✅ ViewPlugin 类内部的 highlightRepository 引用
- ✅ getCommentsForHighlight 方法更新

**无需修改**: 其他部分已经正确

---

### 阶段 2: 更新主视图类

#### 2.1 HiNoteView ⭐ 重要
**文件**: `src/HiNoteView.ts`
**预计行数**: ~1153 行
**需要修改**:
- [ ] Line 5: 导入语句 `import { CommentStore, HiNote, CommentItem }` → `import { HighlightInfo as HiNote, CommentItem }`
- [ ] 添加导入: `import { HighlightManager } from './services/HighlightManager'`
- [ ] 添加导入: `import { HighlightRepository } from './repositories/HighlightRepository'`
- [ ] 构造函数参数: `commentStore: CommentStore` → `highlightManager: HighlightManager, highlightRepository: HighlightRepository`
- [ ] 所有 `this.commentStore` 引用改为 `this.highlightManager` 或 `this.highlightRepository`

---

### 阶段 3: 更新管理器类（按依赖顺序）

#### 3.1 VirtualHighlightManager
**文件**: `src/view/highlight/VirtualHighlightManager.ts`
**需要修改**:
- [ ] 导入: `CommentStore` → `HighlightManager`
- [ ] 构造函数参数
- [ ] `commentStore.addComment` → `highlightManager.addHighlight`

#### 3.2 HighlightDataManager
**文件**: `src/view/highlight/HighlightDataManager.ts`
**需要修改**:
- [ ] 导入语句
- [ ] 构造函数参数: `commentStore: CommentStore` → `highlightRepository: HighlightRepository`
- [ ] `commentStore.getFileComments` → `highlightRepository.getCachedHighlights`

#### 3.3 CommentOperationManager
**文件**: `src/view/comment/CommentOperationManager.ts`
**需要修改**:
- [ ] 导入语句
- [ ] 构造函数参数: `commentStore: CommentStore` → `highlightManager: HighlightManager`
- [ ] `commentStore.removeComment` → `highlightManager.removeHighlight`

#### 3.4 AllHighlightsManager
**文件**: `src/view/allhighlights/AllHighlightsManager.ts`
**需要修改**:
- [ ] 导入语句
- [ ] 构造函数参数
- [ ] 所有 commentStore 方法调用

#### 3.5 ExportService
**文件**: `src/services/ExportService.ts`
**需要修改**:
- [ ] 导入: `CommentStore` → `HighlightRepository`
- [ ] 构造函数参数
- [ ] 数据获取方法

#### 3.6 HighlightService
**文件**: `src/services/HighlightService.ts`
**需要修改**:
- [ ] `findMatchingHighlight` 方法的参数: `commentStore: CommentStore` → `highlightRepository: HighlightRepository`
- [ ] 方法内部调用更新

---

### 阶段 4: 更新组件类

#### 4.1 CommentWidget
**文件**: `src/components/comment/CommentWidget.ts`
**需要修改**:
- [ ] 类型导入: `from "../../CommentStore"` → `from "../../types"`

#### 4.2 CommentWidgetHelper
**文件**: `src/components/comment/CommentWidgetHelper.ts`
**需要修改**:
- [ ] 类型导入

---

### 阶段 5: 批量更新类型导入（15个文件）

这些文件只需要更新导入语句，不需要修改逻辑：

```typescript
// 旧的
import { HiNote } from '../CommentStore';
import { HiNote, CommentItem } from '../../CommentStore';

// 新的
import { HighlightInfo as HiNote } from '../types';
import { HighlightInfo as HiNote, CommentItem } from '../../types';
```

**文件列表**:
- [ ] `src/flashcard/components/FlashcardComponent.ts`
- [ ] `src/flashcard/components/FlashcardUtils.ts`
- [ ] `src/flashcard/services/FlashcardFactory.ts`
- [ ] `src/utils/DataMigration.ts`
- [ ] `src/utils/HighlightMatcher.ts`
- [ ] `src/repositories/IHighlightRepository.ts`
- [ ] `src/repositories/HighlightRepository.ts`
- [ ] `src/storage/DataValidator.ts`
- [ ] `src/storage/HiNoteDataManager.ts`
- [ ] `src/view/config/CallbackConfigurator.ts`
- [ ] `src/view/highlight/HighlightFlashcardManager.ts`
- [ ] `src/view/events/EventCoordinator.ts`
- [ ] `src/templates/ExportModal.ts`
- [ ] `src/services/HighlightManager.ts`

---

### 阶段 6: 清理工作

#### 6.1 删除 CommentStore
**文件**: `src/CommentStore.ts`
- [ ] 删除整个文件

#### 6.2 删除废弃方法
**文件**: `src/storage/HiNoteDataManager.ts`
- [ ] 删除 `cleanOrphanedHighlights()` 方法（Line 290-308）

---

### 阶段 7: 测试和修复

- [ ] 运行 `npm run build`
- [ ] 修复所有编译错误
- [ ] 在 Obsidian 中测试基本功能
- [ ] 测试高亮添加/删除
- [ ] 测试评论添加/删除
- [ ] 测试文件重命名
- [ ] 测试数据清理

---

## 🎯 当前进度

- ✅ 已完成: 3/40+ 文件
- ⏳ 进行中: 2 文件
- ⏸️ 待处理: 35+ 文件

---

## 📝 修改模式总结

### 模式 1: 只更新类型导入
```typescript
// 旧
import { HiNote } from '../CommentStore';
// 新
import { HighlightInfo as HiNote } from '../types';
```

### 模式 2: 更新构造函数（Manager 类）
```typescript
// 旧
constructor(commentStore: CommentStore) {
    this.commentStore = commentStore;
}
// 新
constructor(highlightManager: HighlightManager) {
    this.highlightManager = highlightManager;
}
```

### 模式 3: 更新方法调用
```typescript
// 旧
await this.commentStore.addComment(file, highlight);
// 新
await this.highlightManager.addHighlight(file, highlight);

// 旧
const highlights = this.commentStore.getFileComments(file);
// 新
const highlights = this.highlightRepository.getCachedHighlights(file.path) || [];
```

---

## 🚀 开始执行

准备好了吗？我们从第一个文件开始！
