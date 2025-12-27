# HiNote 插件架构文档

## 架构概览

HiNote 插件采用分层架构设计，职责清晰分离：

```
┌─────────────────────────────────────────────────────────┐
│                  业务逻辑层 (Service)                     │
├─────────────────────────────────────────────────────────┤
│  HighlightManager                                        │
│  • 高亮的增删改查业务逻辑                                 │
│  • 数据验证与清理                                         │
│  • 事件触发协调                                           │
│  • 调用 Repository 层                                    │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              数据访问层 (Repository)                      │
├─────────────────────────────────────────────────────────┤
│  HighlightRepository                                     │
│  • 内存缓存管理                                           │
│  • 数据格式转换                                           │
│  • 调用 DataManager 持久化                               │
│  • 提供统一的数据访问接口                                 │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                存储层 (Storage/DAO)                       │
├─────────────────────────────────────────────────────────┤
│  HiNoteDataManager                                       │
│  • 纯粹的文件系统操作                                     │
│  • 数据序列化/反序列化                                    │
│  • 文件路径映射                                           │
│  • 不包含业务逻辑                                         │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  兼容层 (Adapter)                         │
├─────────────────────────────────────────────────────────┤
│  CommentStore                                            │
│  • 保持向后兼容的 API                                     │
│  • 委托给新架构层处理                                     │
│  • 不包含实际业务逻辑                                     │
└─────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. HighlightManager (业务逻辑层)

**位置**: `src/services/HighlightManager.ts`

**职责**:
- 处理高亮的业务逻辑（添加、删除、更新）
- 数据验证和清理（孤立数据检查和清理）
- 事件触发协调
- 协调多个服务和仓储

**主要方法**:
```typescript
async addHighlight(file: TFile, highlight: HiNote): Promise<HiNote>
async removeHighlight(file: TFile, highlight: HiNote): Promise<boolean>
async getFileHighlights(file: TFile): Promise<HiNote[]>
async findHighlights(file: TFile, highlight: { text: string; position?: number }): Promise<HiNote[]>
async checkOrphanedDataCount(): Promise<{ orphanedHighlights: number; affectedFiles: number }>
async cleanOrphanedData(): Promise<{ removedHighlights: number; affectedFiles: number }>
```

### 2. HighlightRepository (数据访问层)

**位置**: `src/repositories/HighlightRepository.ts`

**职责**:
- 管理高亮数据的内存缓存
- 协调数据持久化操作
- 提供统一的数据访问接口
- 数据格式转换

**主要方法**:
```typescript
async initialize(): Promise<void>
async getFileHighlights(filePath: string): Promise<HiNote[]>
async saveFileHighlights(filePath: string, highlights: HiNote[]): Promise<void>
async deleteFileHighlights(filePath: string): Promise<void>
getCachedHighlights(filePath: string): HiNote[] | null
findHighlightById(highlightId: string): HiNote | null
```

### 3. HiNoteDataManager (存储层)

**位置**: `src/storage/HiNoteDataManager.ts`

**职责**:
- 纯粹的文件系统操作
- 数据序列化/反序列化
- 文件路径映射管理
- **不包含业务逻辑**

**主要方法**:
```typescript
async initialize(): Promise<void>
async getFileHighlights(filePath: string): Promise<HiNote[]>
async saveFileHighlights(filePath: string, highlights: HiNote[]): Promise<void>
async deleteFileHighlights(filePath: string): Promise<void>
async handleFileRename(oldPath: string, newPath: string): Promise<void>
```

### 4. CommentStore (兼容层)

**位置**: `src/CommentStore.ts`

**职责**:
- 保持向后兼容的 API
- 委托给新架构层处理
- 不包含实际业务逻辑

**状态**: 已重构为兼容层，所有方法委托给 `HighlightManager` 和 `HighlightRepository`

## 数据流

### 添加高亮流程

```
用户操作
  ↓
CommentStore.addComment()
  ↓
HighlightManager.addHighlight()
  ↓ (生成 ID、设置时间戳)
HighlightRepository.saveFileHighlights()
  ↓ (更新缓存)
HiNoteDataManager.saveFileHighlights()
  ↓ (写入文件系统)
EventManager.emitHighlightUpdate()
```

### 查询高亮流程

```
用户操作
  ↓
CommentStore.getFileComments()
  ↓
HighlightRepository.getCachedHighlights()
  ↓ (从缓存返回，无需读取文件)
返回结果
```

## 职责划分表

| 层级 | 类名 | 职责 | 示例方法 |
|------|------|------|----------|
| **业务层** | `HighlightManager` | 业务逻辑、数据验证、事件协调 | `addHighlight`, `cleanOrphanedData` |
| **仓储层** | `HighlightRepository` | 内存缓存、数据转换、统一访问接口 | `getCachedHighlights`, `saveFileHighlights` |
| **存储层** | `HiNoteDataManager` | 文件系统操作、序列化/反序列化 | `readFile`, `writeFile` |
| **兼容层** | `CommentStore` | 向后兼容 API | `addComment`, `getFileComments` |
| **工具层** | `DataValidator` | 数据格式验证 | `validateHighlightData` |
| **服务层** | `HighlightService` | 高亮提取、搜索、索引 | `extractHighlights`, `searchHighlights` |

## 重构优势

### 1. 职责清晰
- 每个类只负责一件事
- 符合单一职责原则 (SRP)
- 易于理解和维护

### 2. 易于测试
- 每层可以独立测试
- 可以 mock 依赖层
- 测试覆盖率更高

### 3. 易于扩展
- 添加新功能只需修改对应层
- 不会影响其他层
- 符合开闭原则 (OCP)

### 4. 性能优化
- Repository 层统一管理缓存
- 减少不必要的文件读取
- 提高响应速度

### 5. 向后兼容
- `CommentStore` 保持原有 API
- 现有代码无需修改
- 渐进式迁移

## 迁移指南

### 对于新代码

推荐直接使用新架构：

```typescript
// 获取服务实例
const manager = plugin.initManager.highlightManager;
const repository = plugin.initManager.highlightRepository;

// 添加高亮
await manager.addHighlight(file, highlight);

// 查询高亮
const highlights = await manager.getFileHighlights(file);

// 清理孤立数据
const result = await manager.cleanOrphanedData();
```

### 对于现有代码

现有代码无需修改，`CommentStore` 已重构为兼容层：

```typescript
// 这些方法仍然可用，内部委托给新架构
await commentStore.addComment(file, highlight);
const highlights = commentStore.getFileComments(file);
await commentStore.cleanOrphanedData();
```

## 未来优化方向

1. **事务支持**: 添加事务机制，确保数据一致性
2. **批量操作**: 优化批量操作性能
3. **缓存策略**: 实现更智能的缓存失效策略
4. **错误处理**: 统一错误处理和重试机制
5. **性能监控**: 添加性能监控和日志

## 相关文档

- [重构历史](./REFACTORING_HISTORY.md)
- [API 文档](./API.md)
- [开发指南](./DEVELOPMENT.md)
