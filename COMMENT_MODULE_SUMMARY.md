# 评论模块拆分总结

## ✅ 已创建的文件

### 1. `src/view/comment/CommentOperationManager.ts` (~280行)
**职责**: 评论的增删改操作

**主要功能**:
- ✅ `addComment()` - 添加评论
- ✅ `updateComment()` - 更新评论
- ✅ `deleteComment()` - 删除评论
- ✅ `deleteVirtualHighlight()` - 删除虚拟高亮
- ✅ `getFileForHighlight()` - 获取高亮对应的文件
- ✅ `checkHasFlashcard()` - 检查是否有关联闪卡
- ✅ `generateHighlightId()` - 生成高亮 ID

**特性**:
- 自动处理虚拟高亮的删除逻辑
- 与闪卡系统集成（检查闪卡关联）
- 触发评论更新事件
- 支持全局高亮视图和单文件视图

### 2. `src/view/comment/CommentInputManager.ts` (~90行)
**职责**: 管理评论输入框的显示和交互

**主要功能**:
- ✅ `showCommentInput()` - 显示评论输入框
- ✅ `getCurrentEditingHighlightId()` - 获取当前编辑的高亮 ID
- ✅ `clearEditingState()` - 清除编辑状态

**特性**:
- 封装 CommentInput 组件的调用
- 管理编辑状态
- 统一处理保存、删除、取消回调

## 📊 代码统计

- **新增代码**: ~370行（两个管理器）
- **预计从 CommentView.ts 移出**: ~250行
- **代码质量**: 
  - 职责清晰分离
  - 易于测试和维护
  - 可独立复用

## 🔄 集成步骤

### 1. 在 CommentView.ts 中添加导入和属性

```typescript
import { CommentOperationManager } from './view/comment/CommentOperationManager';
import { CommentInputManager } from './view/comment/CommentInputManager';

export class CommentView extends ItemView {
    // ... 其他属性
    private commentOperationManager: CommentOperationManager | null = null;
    private commentInputManager: CommentInputManager | null = null;
}
```

### 2. 在 onOpen 方法中初始化

```typescript
// 初始化评论操作管理器
this.commentOperationManager = new CommentOperationManager(
    this.app,
    this.plugin,
    this.commentStore
);

this.commentOperationManager.setCallbacks({
    onRefreshView: async () => await this.refreshView(),
    onHighlightsUpdate: (highlights) => {
        this.highlights = highlights;
    }
});

// 初始化评论输入管理器
this.commentInputManager = new CommentInputManager(this.plugin);

this.commentInputManager.setCallbacks({
    onCommentSave: async (highlight, content, existingComment) => {
        if (existingComment) {
            await this.commentOperationManager!.updateComment(highlight, existingComment.id, content);
        } else {
            await this.commentOperationManager!.addComment(highlight, content);
        }
    },
    onCommentDelete: async (highlight, commentId) => {
        await this.commentOperationManager!.deleteComment(highlight, commentId);
    },
    onCommentCancel: async (highlight) => {
        if (highlight.isVirtual && (!highlight.comments || highlight.comments.length === 0)) {
            await this.commentOperationManager!.deleteVirtualHighlight(highlight);
        }
    },
    onViewUpdate: async () => await this.updateHighlights()
});
```

### 3. 替换现有方法调用

**替换 addComment**:
```typescript
// 旧代码
await this.addComment(highlight, content);

// 新代码
if (this.commentOperationManager) {
    this.commentOperationManager.updateState({
        currentFile: this.currentFile,
        highlights: this.highlights
    });
    await this.commentOperationManager.addComment(highlight, content);
}
```

**替换 updateComment**:
```typescript
// 旧代码
await this.updateComment(highlight, commentId, content);

// 新代码
if (this.commentOperationManager) {
    this.commentOperationManager.updateState({
        currentFile: this.currentFile,
        highlights: this.highlights
    });
    await this.commentOperationManager.updateComment(highlight, commentId, content);
}
```

**替换 deleteComment**:
```typescript
// 旧代码
await this.deleteComment(highlight, commentId);

// 新代码
if (this.commentOperationManager) {
    this.commentOperationManager.updateState({
        currentFile: this.currentFile,
        highlights: this.highlights
    });
    await this.commentOperationManager.deleteComment(highlight, commentId);
}
```

**替换 showCommentInput**:
```typescript
// 旧代码
this.showCommentInput(card, highlight, existingComment);

// 新代码
if (this.commentInputManager) {
    this.commentInputManager.showCommentInput(card, highlight, existingComment);
}
```

**替换 generateHighlightId**:
```typescript
// 旧代码
const id = this.generateHighlightId(highlight);

// 新代码
const id = this.commentOperationManager?.generateHighlightId(highlight);
```

### 4. 在 onunload 中清理

```typescript
// 清理评论操作管理器
if (this.commentOperationManager) {
    this.commentOperationManager = null;
}

// 清理评论输入管理器
if (this.commentInputManager) {
    this.commentInputManager.clearEditingState();
    this.commentInputManager = null;
}
```

### 5. 同步 highlights 状态

在每次操作后，需要同步 highlights 状态：

```typescript
// 在 updateHighlights 和 updateAllHighlights 方法中
if (this.commentOperationManager) {
    this.commentOperationManager.updateState({
        currentFile: this.currentFile,
        highlights: this.highlights
    });
}
```

## 🎯 需要删除的旧代码

以下方法可以在集成完成后删除：

1. `addComment()` - 约45行
2. `updateComment()` - 约30行
3. `deleteComment()` - 约35行
4. `getFileForHighlight()` - 约22行
5. `generateHighlightId()` - 约8行
6. `checkHasFlashcard()` - 约12行
7. `showCommentInput()` - 约27行

**总计**: 约 179 行可删除

## ⚠️ 注意事项

1. **状态同步**: 确保在每次操作前调用 `updateState()` 同步状态
2. **回调处理**: 评论操作会触发视图刷新，确保回调正确设置
3. **虚拟高亮**: 取消添加评论时需要删除虚拟高亮
4. **闪卡集成**: 删除评论时需要检查闪卡关联

## 🧪 测试清单

集成完成后需要测试：

- [ ] 添加评论
- [ ] 编辑评论
- [ ] 删除评论
- [ ] 删除最后一条评论时的行为
  - [ ] 虚拟高亮被删除
  - [ ] 有闪卡的高亮保留
  - [ ] 无闪卡的高亮被删除
- [ ] 取消添加评论（虚拟高亮删除）
- [ ] 全局高亮视图中的评论操作
- [ ] 单文件视图中的评论操作
- [ ] 评论更新事件触发
- [ ] 闪卡同步

## 📈 优势

1. **职责分离**: 操作逻辑和输入管理分离
2. **易于测试**: 每个管理器可独立测试
3. **可维护性**: 代码结构清晰
4. **可扩展性**: 新增评论功能更容易
5. **状态管理**: 集中管理编辑状态
