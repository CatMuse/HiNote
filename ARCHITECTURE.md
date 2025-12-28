# HiNote 插件架构文档

## 项目结构

```
src/
├── core/                      # 核心组件
│   ├── HiNoteView.ts         # 主视图（协调器）
│   └── HighlightDecorator.ts # 编辑器高亮装饰器
│
├── services/                  # 业务逻辑层
│   ├── HighlightService.ts   # 高亮提取和索引
│   ├── HighlightManager.ts   # 高亮业务逻辑
│   ├── EventManager.ts       # 事件管理
│   ├── ChatService.ts        # 聊天服务
│   ├── ExportService.ts      # 导出服务
│   ├── CanvasService.ts      # Canvas 处理
│   ├── WindowManager.ts      # 窗口管理
│   ├── InitializationManager.ts # 初始化管理
│   └── ai/                   # AI 服务
│
├── repositories/              # 数据访问层
│   ├── HighlightRepository.ts # 高亮数据仓储（缓存）
│   └── IHighlightRepository.ts
│
├── storage/                   # 持久化层
│   ├── HiNoteDataManager.ts  # 数据存储管理
│   ├── DataValidator.ts      # 数据验证
│   └── FilePathUtils.ts      # 文件路径工具
│
├── views/                     # 视图层
│   ├── managers/             # 视图管理器（集中）
│   │   ├── AllHighlightsManager.ts
│   │   ├── HighlightDataManager.ts
│   │   ├── SearchManager.ts
│   │   └── FileListManager.ts
│   ├── chat/                 # 聊天视图
│   ├── highlight/            # 高亮视图组件
│   ├── comment/              # 评论组件
│   ├── layout/               # 布局管理
│   └── ...
│
├── components/                # UI 组件
│   ├── comment/              # 评论相关组件
│   ├── highlight/            # 高亮卡片组件
│   └── AIButton.ts
│
├── flashcard/                 # 闪卡功能模块
│   ├── components/
│   ├── services/
│   ├── settings/
│   └── types/
│
├── settings/                  # 设置管理
├── utils/                     # 工具函数
├── i18n/                      # 国际化
└── types.ts                   # 全局类型定义
```

## 命名规范

### Manager vs Service vs Handler

#### Service（服务层）
**位置**: `src/services/`
**职责**: 核心业务逻辑，无状态或最小状态
**特征**:
- 提供可复用的业务功能
- 不依赖 UI 状态
- 可以被多个 Manager 使用

**示例**:
- `HighlightService` - 提取和索引高亮
- `ChatService` - 处理聊天逻辑
- `ExportService` - 导出功能
- `CanvasService` - Canvas 文件处理

#### Manager（管理器）
**位置**: `src/services/` 或 `src/views/managers/`
**职责**: 管理状态和协调多个服务
**特征**:
- 维护状态
- 协调多个 Service
- 处理生命周期

**分类**:
1. **业务 Manager** (`src/services/`)
   - `HighlightManager` - 管理高亮业务逻辑
   - `EventManager` - 管理事件
   - `WindowManager` - 管理窗口状态

2. **视图 Manager** (`src/views/managers/`)
   - `AllHighlightsManager` - 管理全局高亮视图
   - `SearchManager` - 管理搜索状态
   - `FileListManager` - 管理文件列表

#### Handler（处理器）
**位置**: `src/view/*/`
**职责**: 处理特定类型的事件或操作
**特征**:
- 专注于单一职责
- 通常是无状态的
- 处理特定的用户交互

**示例**:
- `ChatMessageHandler` - 处理聊天消息
- `ChatDragHandler` - 处理拖拽操作
- `BatchOperationsHandler` - 处理批量操作

### 当前命名问题

1. ✅ **Service** - 命名一致，职责清晰
2. ⚠️ **Manager** - 分散在两个位置（services/ 和 views/managers/）
3. ⚠️ **Handler** - 数量较少，使用不一致

### 建议的命名规则

```
Service  → 业务逻辑，无状态
Manager  → 状态管理，协调器
Handler  → 事件处理，单一职责
Helper   → 辅助工具类
Utils    → 纯函数工具
```

## 数据流向

```
用户操作
   ↓
HiNoteView (协调器)
   ↓
Manager (状态管理)
   ↓
Service (业务逻辑)
   ↓
Repository (缓存层)
   ↓
DataManager (存储层)
   ↓
文件系统
```

## 缓存策略

### HighlightRepository（内存缓存）
- **初始化**: 异步加载所有文件列表
- **读取**: 优先从缓存读取，未命中时从存储层加载
- **写入**: Write-through（同时更新缓存和持久化）
- **失效**: 文件修改/删除时清除对应缓存

### 数据加载流程

1. **插件启动**
   ```
   InitializationManager.initialize()
     → HighlightRepository.initialize()
       → 加载文件列表（同步）
       → 异步加载每个文件的数据
   ```

2. **打开文件**
   ```
   onFileOpen
     → updateHighlights()
       → HighlightDataManager.loadFileHighlights()
         → getFileHighlights() (缓存未命中时自动加载)
   ```

3. **全局视图**
   ```
   updateAllHighlights()
     → AllHighlightsManager.updateAllHighlights()
       → getFileHighlights() (确保数据加载)
   ```

## 最佳实践

1. **避免使用 getCachedHighlights** - 除非在同步上下文中（如装饰器）
2. **优先使用 getFileHighlights** - 自动处理缓存未命中
3. **添加空值检查** - 防止缓存未加载时出错
4. **使用 async/await** - 确保数据加载完成

