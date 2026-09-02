# Pingo 变更记录

日期：2026-07-04（最近更新）

## 变更概述

本次变更对 Pingo 的 UI 布局、交互方式和数据管理进行了全面优化，参考了 VSCode 的操作逻辑，提升了用户体验。

---

## UI 布局优化

### 三栏式布局

将原有的单页面布局改为三栏式布局：

| 位置 | 内容 | 功能 |
|------|------|------|
| 左侧 | 目标列表 | 显示所有监控目标，支持独立滚动 |
| 中间 | 详情视图 | 选中目标的柱状图和统计信息 |
| 右侧 | 消息动态 | 显示最近 20 条事件日志（超时、告警、操作等） |

### 面板隐藏/显示

- 左侧目标列表和右侧消息动态面板均可通过头部按钮隐藏
- 隐藏后变为 24px 宽的切换条，可随时展开

### 面板宽度拖拽调整

- 左右面板边界各有一个 4px 宽的拖拽条
- 拖动可调整面板宽度（左侧：200px~600px，右侧：200px~500px）

---

## 目标交互优化

### 卡片点击显示详情

- 去掉每个卡片上的「详情」按钮
- 点击卡片直接选中并显示详情视图

### 右键菜单

- 去掉卡片上的 disable/edit/delete 按钮
- 右键点击卡片弹出上下文菜单：编辑、启用/禁用、删除

### 多选功能

- **Cmd + 点击**：逐个选择多个卡片
- **Shift + 点击**：范围选择连续卡片
- 选中卡片显示紫色边框高亮
- 多选后右键菜单显示批量操作：批量启用、批量禁用、批量删除

### 目标排序

- 在目标列表顶部添加「排序」下拉菜单
- 支持按 IP、添加时间、ping 延迟排序

---

## 数据管理优化

### 批量导入 IP

- 工具栏添加「批量导入」按钮
- 点击后弹出文本框，每行一个 IP（可选格式：IP,别名）
- 导入前先验证 IP 格式，错误提示用户修改
- 已存在的 IP 自动跳过
- 导入完成后提示成功条数和重复条数

### 文件管理

将原有的「打开文件」功能扩展为完整的文件管理系统：

| 菜单项 | 功能 |
|--------|------|
| 新建监测 | 创建一个新的空数据文件并切换过去 |
| 打开监测 | 选择已有 `.db` 文件，切换为当前监测数据 |
| 另存为 | 将当前数据（目标+历史）复制到新文件 |
| 清空历史数据 | 清空所有 ping 历史记录，保留目标配置 |

顶部标题栏显示当前数据文件名。

---

## 图表优化

### 柱状图着色

- 将超时数据和成功数据拆分为两个序列
- 成功：蓝色柱状图
- 超时：红色柱状图
- 拖动缩放后颜色保持正确

### 自动缩放

- 使用 ResizeObserver 监听容器宽度变化
- 面板展开/收起时图表自动调整宽度

---

## 消息动态优化

- 不再显示 ping 成功的日志
- 只显示：超时、错误、告警、操作类消息
- 最多保留最近 20 条记录

---

## 技术实现

### 后端新增命令

- `clear_history` - 清空所有 ping 历史数据
- `switch_data_file` - 切换到另一个数据文件
- `save_data_file_as` - 将当前数据另存为到新路径
- `new_data_file` - 新建一个数据文件并切换过去

### 前端新增组件

- `EventLog.tsx` - 消息动态面板

### 前端修改组件

- `App.tsx` - 主布局逻辑，新增文件管理、多选、排序等状态
- `Toolbar.tsx` - 新增「文件」下拉菜单
- `TargetCard.tsx` - 点击选中、右键菜单、多选高亮
- `TargetGrid.tsx` - 支持多选状态传入
- `LatencyChart.tsx` - 双序列着色、ResizeObserver 自动缩放

---

## 修改的文件

### 后端（Rust）

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/storage.rs` | 新增 `clear_samples()`、`db_path()` 方法 |
| `src-tauri/src/scheduler.rs` | 新增 `data_path` 字段，支持运行时切换 |
| `src-tauri/src/commands.rs` | 新增 `clear_history`、`switch_data_file`、`save_data_file_as`、`new_data_file` 命令 |
| `src-tauri/src/lib.rs` | 注册新命令，更新初始化逻辑 |

### 前端（TypeScript/React）

| 文件 | 修改内容 |
|------|----------|
| `src/App.tsx` | 三栏布局、文件管理、多选、排序、右键菜单 |
| `src/components/Toolbar.tsx` | 文件菜单、排序下拉 |
| `src/components/TargetCard.tsx` | 点击选中、右键菜单、多选高亮 |
| `src/components/TargetGrid.tsx` | 支持多选状态 |
| `src/components/LatencyChart.tsx` | 双序列着色、自动缩放 |
| `src/components/EventLog.tsx` | 新建消息动态面板 |
| `src/api/tauri.ts` | 新增 API 封装 |
| `src/styles.css` | 三栏布局、拖拽条、右键菜单、多选样式 |

---

## 2026-07-04 新增变更

### Bug 修复

#### 1. 批量导入目标时别名未生效
- **问题**：批量导入目标时，指定的别名被忽略，所有目标的别名都为空字符串
- **原因**：`handleBatchImport` 函数只提取了 IP 部分，别名被丢弃
- **修复**：正确解析 `IP,别名` 格式，支持别名中包含逗号的情况，将解析后的 IP 和别名一起传递给 `saveTarget` 函数
- **修改文件**：`src/App.tsx`

#### 2. 清空历史数据后数据库文件大小未变化
- **问题**：点击清空历史数据后，SQLite 数据库文件大小没有减小
- **原因**：SQLite 的 DELETE 操作不会立即释放磁盘空间（文件会产生"空洞"）
- **修复**：在 `clear_samples` 函数中添加 `VACUUM` 命令，回收删除数据占用的空间
- **修改文件**：`src-tauri/src/storage.rs`

### 功能改进

#### 3. 柱状图自动缩放
- **问题**：详情图表面板的柱状图高度固定，没有依据窗口自动缩放
- **修复**：
  - 使用 ResizeObserver 监听父容器尺寸变化
  - 将图表高度设为容器可用高度减去图例高度
  - 将图例移到图表外部，避免挤压图表内容
  - 修改布局使图表能够填充剩余空间
- **修改文件**：`src/components/LatencyChart.tsx`、`src/components/DetailPanel.tsx`、`src/styles.css`

#### 4. 排序功能优化
- **改进**：
  - 将排序控件从工具栏移到目标列表顶部
  - 添加升序/降序独立按键（↑/↓）
  - 支持双向排序（从小到大/从大到小）
  - 排序状态通过按钮高亮显示
- **修改文件**：`src/App.tsx`、`src/components/TargetGrid.tsx`、`src/components/Toolbar.tsx`、`src/styles.css`

#### 5. Ping 状态可视化
- **改进**：
  - 当 Ping 运行时，toolbar 显示清新淡雅的绿色渐变背景
  - 添加光效流动动画，从左向右循环移动
  - 底部边框颜色同步变为绿色
- **实现方式**：
  - 使用 CSS `::before` 伪元素创建光效条
  - 通过 `@keyframes` 动画控制光效条的水平移动
  - 使用 `linear-gradient` 创建渐变背景
- **修改文件**：`src/components/Toolbar.tsx`、`src/styles.css`

### 修改的文件（2026-07-04）

#### 后端（Rust）

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/storage.rs` | 在 `clear_samples()` 中添加 `VACUUM` 命令 |

#### 前端（TypeScript/React）

| 文件 | 修改内容 |
|------|----------|
| `src/App.tsx` | 修复批量导入别名解析，添加排序方向状态 |
| `src/components/Toolbar.tsx` | 添加 Ping 运行状态样式类 |
| `src/components/TargetGrid.tsx` | 添加排序控件（下拉框 + 方向按键） |
| `src/components/LatencyChart.tsx` | 实现图表高度自适应，外部图例 |
| `src/components/DetailPanel.tsx` | 添加 chartContainer 包装器 |
| `src/styles.css` | 添加排序控件样式、图表自适应样式、Ping 状态动画样式 |

---

## 2026-07-04 玻璃态 UI 优化

### UI 风格升级

#### 1. 玻璃态风格应用
- **新增组件**：
  - `GlassButton.tsx` - 封装玻璃态（毛玻璃）效果的按钮组件，支持 primary/secondary/danger 三种变体，支持图标显示
  - `GlassCard.tsx` - 封装玻璃态（毛玻璃）效果的卡片组件，用于面板和卡片容器
- **应用范围**：
  - Toolbar 按钮
  - TargetCard 卡片
  - DetailPanel 详情面板
  - EventLog 事件日志面板
  - TargetEditor 目标编辑弹窗
  - SettingsPanel 设置面板

#### 2. 图标系统
- **安装**：`lucide-react` 图标库
- **应用**：为所有按钮添加图标（播放/停止、文件夹、加号、上传、设置、保存、关闭等）
- **效果**：提升视觉美感和用户体验

#### 3. 悬浮按钮组
- **设计**：将功能按钮（添加目标、批量导入、排序、设置）移到目标列表底部，作为悬浮按钮组
- **特性**：
  - 纯图标显示，鼠标悬停显示标题提示
  - 按钮固定为 36x36px 正方形
  - 使用 `justify-content: space-around` 等距排列
  - 使用 `clamp(4px, 3%, 12px)` 实现响应式间距
  - 面板缩小时自动减小间距

### 弹窗风格统一

#### 4. 弹窗样式标准化
- **统一方案**：将所有弹窗（添加目标、批量导入、设置）改为相同的模态框风格
- **特点**：
  - 使用 `modalOverlay` + `batchImportPanel` 结构
  - 点击外部可关闭
  - 统一的输入框样式
  - 统一的按钮样式（取消 + 确认/保存）

### 功能增强

#### 5. 外观设置功能
- **新增设置项**：
  - 别名颜色：自定义 TargetCard 中别名的字体颜色
  - IP 地址颜色：自定义 TargetCard 中 IP 地址的字体颜色
- **交互方式**：
  - 颜色选择器（可视化选择）
  - 十六进制输入框（手动输入）
- **持久化**：颜色设置保存到配置文件，重启后恢复

#### 6. 设置面板升级
- **排序方式**：将排序方式选择从目标列表顶部移到设置面板
- **排序方向**：保留在目标列表底部的悬浮按钮组中

### Bug 修复

#### 7. 文件菜单遮挡问题
- **问题**：文件按钮菜单点击打开后，菜单内容被 detail 面板盖住
- **原因**：z-index 层级问题，工具栏层级低于内容区域
- **修复**：给 `.topBar` 设置 `z-index: 200`，给 `.mainContent` 设置 `z-index: 10`

#### 8. 悬浮按钮布局问题
- **问题**：悬浮按钮组有白色背景容器，影响视觉效果
- **修复**：移除容器背景（`background: transparent`），按钮直接悬浮显示

### 修改的文件（玻璃态 UI）

#### 后端（Rust）

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/models.rs` | `AppSettings` 添加 `alias_color`、`ipv4_color` 字段 |
| `src-tauri/src/storage.rs` | 加载和保存设置时包含颜色字段 |

#### 前端（TypeScript/React）

| 文件 | 修改内容 |
|------|----------|
| `src/types.ts` | `AppSettings` 添加 `aliasColor`、`ipv4Color` 字段 |
| `src/App.tsx` | 更新默认设置、传递颜色设置给组件 |
| `src/components/GlassButton.tsx` | 新建玻璃态按钮组件 |
| `src/components/GlassCard.tsx` | 新建玻璃态卡片组件 |
| `src/components/Toolbar.tsx` | 使用 GlassButton，添加图标 |
| `src/components/TargetGrid.tsx` | 添加悬浮按钮组，传递颜色设置 |
| `src/components/TargetCard.tsx` | 使用 GlassCard，应用颜色设置 |
| `src/components/TargetEditor.tsx` | 改为模态框风格 |
| `src/components/SettingsPanel.tsx` | 添加外观设置区域，改为模态框风格 |
| `src/components/DetailPanel.tsx` | 使用 GlassCard |
| `src/components/EventLog.tsx` | 使用 GlassCard |
| `src/styles.css` | 添加玻璃态样式、悬浮按钮样式、颜色选择器样式 |
