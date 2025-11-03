# 批量删除高亮功能重构说明

## 重构日期
2025-11-03

## 问题描述

### 原始问题
批量删除多个高亮卡片时,只能删除第一个,其余的删除失败。

### 根本原因
1. **文件多次修改导致位置失效**: 在循环中每删除一个高亮就修改一次文件内容,第一次修改后文件内容改变,导致后续高亮的 `position` 信息失效
2. **职责混乱**: UI组件(`HighlightCard`)承担了数据操作职责,批量操作依赖单个卡片实例
3. **临时实例泄漏**: 为执行数据操作创建临时`HighlightCard`实例但未清理,造成内存泄漏
4. **性能问题**: 重复的文件读写和DOM操作

## 重构方案

### 核心思路
将批量删除逻辑从UI层(`HighlightCard`)移到数据服务层(`HighlightService`),实现:
- 按文件分组处理
- 按位置从后往前删除(避免位置失效)
- 一次性读写文件(提升性能)
- 清晰的职责分离

### 修改文件

#### 1. `/src/services/HighlightService.ts`
**新增方法:**
- `batchRemoveHighlightMarks()`: 批量删除高亮标记的公共方法
- `removeHighlightMarkFromContent()`: 从内容中移除单个高亮标记的私有方法
- `escapeRegExp()`: 转义正则表达式特殊字符的工具方法

**实现要点:**
```typescript
// 按文件分组
const highlightsByFile = new Map<string, typeof highlights>();

// 对每个文件,按位置从后往前排序
const sortedHighlights = [...fileHighlights].sort((a, b) => {
    return (b.position ?? Infinity) - (a.position ?? Infinity);
});

// 读取文件一次
let content = await this.app.vault.read(file);

// 依次删除每个高亮(从后往前)
for (const highlight of sortedHighlights) {
    content = this.removeHighlightMarkFromContent(content, highlight);
}

// 写入文件一次
await this.app.vault.modify(file, content);
```

#### 2. `/src/view/selection/BatchOperationsHandler.ts`
**修改内容:**
- 添加 `HighlightService` 依赖
- 重写 `performDeleteSelectedHighlights()` 方法

**新的批量删除流程:**
```
1. 删除所有闪卡(如果存在)
   ↓
2. 批量删除文件中的高亮标记(调用 HighlightService.batchRemoveHighlightMarks)
   ↓
3. 从 CommentStore 中删除数据
   ↓
4. 清理 DOM 和卡片实例
   ↓
5. 触发事件通知
```

#### 3. `/src/CommentView.ts`
**修改内容:**
- 在创建 `BatchOperationsHandler` 时传入 `highlightService` 参数

#### 4. `/main.ts`
**修改内容:**
- 将 `commentStore` 从 `private` 改为 `public`,以便 `BatchOperationsHandler` 可以访问

## 技术亮点

### 1. 按位置从后往前删除
```typescript
// 降序排序,从文件末尾开始删除
const sortedHighlights = [...fileHighlights].sort((a, b) => {
    const posA = a.position ?? Infinity;
    const posB = b.position ?? Infinity;
    return posB - posA; // 降序
});
```
**优势**: 删除后面的内容不会影响前面内容的位置

### 2. 精确定位 + 容错机制
```typescript
// 如果有位置信息,在位置附近精确查找
if (typeof highlight.position === 'number') {
    const startPos = Math.max(0, position - 10);
    const endPos = Math.min(content.length, position + highlightText.length + 50);
    const searchRange = content.substring(startPos, endPos);
    // 在范围内查找匹配
}

// 如果精确定位失败,使用正则表达式全局查找
const patterns = [
    new RegExp(`==\\s*(${escapedText})\\s*==`),
    new RegExp(`<mark[^>]*>(${escapedText})</mark>`),
    // ...
];
```

### 3. 按文件分组处理
```typescript
// 按文件分组,避免对同一文件多次读写
const highlightsByFile = new Map<string, typeof highlights>();
for (const highlight of highlights) {
    if (!highlightsByFile.has(highlight.filePath)) {
        highlightsByFile.set(highlight.filePath, []);
    }
    highlightsByFile.get(highlight.filePath)!.push(highlight);
}
```

### 4. 清晰的错误处理
```typescript
try {
    content = this.removeHighlightMarkFromContent(content, highlight);
    successCount++;
} catch (error) {
    console.error(`[HighlightService] 删除高亮失败:`, highlight.text, error);
    failedCount++;
}
```

## 性能改进

### 之前
- 删除N个高亮 = 读写文件N次
- 每次删除都触发DOM操作
- 创建临时UI组件实例

### 之后
- 删除N个高亮 = 按文件分组,每个文件只读写1次
- 批量收集后统一清理DOM
- 直接操作数据,不创建UI组件

**性能提升**: 对于10个高亮,文件IO从10次降到1次,提升约10倍

## 向后兼容性

- 保持了原有的单个删除功能(`HighlightCard.handleDeleteHighlight`)不变
- 只修改了批量删除的实现
- 所有接口和事件保持兼容

## 测试建议

### 测试场景
1. **基本功能**: 选中多个高亮,执行批量删除,验证所有高亮都被删除
2. **同一文件**: 在同一文件中选中多个高亮,验证都能正确删除
3. **跨文件**: 在不同文件中选中多个高亮,验证都能正确删除
4. **包含闪卡**: 选中有闪卡的高亮,验证闪卡也被删除
5. **位置相近**: 选中位置相近的高亮,验证不会误删
6. **特殊字符**: 选中包含特殊字符的高亮,验证正则转义正确
7. **错误恢复**: 模拟部分删除失败,验证错误提示和已删除部分的处理

### 性能测试
- 测试删除10个、50个、100个高亮的耗时
- 监控内存使用情况
- 验证文件IO次数

## 未来改进方向

1. **事务性支持**: 实现批量操作的原子性,失败时可回滚
2. **撤销功能**: 支持批量删除的撤销操作
3. **进度提示**: 对大量删除操作显示进度条
4. **批量编辑**: 扩展到其他批量操作(如批量修改颜色、批量移动等)

## 总结

这次重构解决了批量删除只能删一个的bug,同时:
- ✅ 提升了性能(减少文件IO)
- ✅ 改善了架构(职责分离)
- ✅ 修复了内存泄漏
- ✅ 增强了错误处理
- ✅ 保持了向后兼容

代码质量和用户体验都得到了显著提升。
