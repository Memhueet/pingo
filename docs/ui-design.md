# Pingo UI 设计文档

## 概述

本文档定义了 Pingo 应用的完整 UI 设计规范，包括设计令牌、组件架构、布局系统和交互模式。

---

## 设计令牌（Design Tokens）

### 颜色系统

| 令牌名称 | 值 | 用途 |
|---------|-----|------|
| `--color-primary` | `#2563eb` | 主色调，用于强调和交互元素 |
| `--color-primary-hover` | `#1d4ed8` | 主色调悬停状态 |
| `--color-primary-dark` | `#1e40af` | 主色调深色变体 |
| `--color-primary-light` | `rgba(37, 99, 235, 0.1)` | 主色调浅色背景 |
| `--color-success` | `#16a34a` | 成功状态色 |
| `--color-warning` | `#ea580c` | 警告/超时状态色 |
| `--color-danger` | `#dc2626` | 危险/错误状态色 |
| `--color-danger-light` | `rgba(220, 38, 38, 0.08)` | 危险色浅色背景 |
| `--color-info` | `#6b7280` | 信息/禁用状态色 |
| `--color-text-primary` | `#1f2933` | 主要文字颜色 |
| `--color-text-secondary` | `#405166` | 次要文字颜色 |
| `--color-text-muted` | `#65758b` | 弱化文字颜色 |
| `--color-text-light` | `#94a3b8` | 最浅色文字 |
| `--color-bg-primary` | `#e8edf3` | 主背景色 |
| `--color-bg-secondary` | `#f6f8fb` | 次要背景色 |
| `--color-bg-card` | `rgba(255, 255, 255, 0.7)` | 卡片背景（玻璃态） |
| `--color-bg-card-hover` | `rgba(255, 255, 255, 0.8)` | 卡片悬停背景 |
| `--color-bg-blur` | `rgba(255, 255, 255, 0.95)` | 模态框背景 |
| `--color-border` | `rgba(255, 255, 255, 0.5)` | 卡片边框 |
| `--color-border-muted` | `rgba(216, 224, 232, 0.5)` | 输入框/分割线边框 |
| `--color-border-focus` | `#2563eb` | 焦点状态边框 |
| `--color-shadow` | `rgba(31, 41, 55, 0.08)` | 基础阴影 |
| `--color-shadow-hover` | `rgba(31, 41, 55, 0.12)` | 悬停阴影 |
| `--color-shadow-lg` | `rgba(31, 41, 55, 0.15)` | 大阴影 |
| `--color-shadow-xl` | `rgba(31, 41, 55, 0.2)` | 超大阴影 |

### 主题颜色变量

| 变量名 | 默认值 | 用途 |
|-------|--------|------|
| `--theme-background` | `#ffffff` | 主题背景色 |
| `--theme-panelBackground` | `#f8fafc` | 面板背景色 |
| `--theme-cardBackground` | `rgba(255, 255, 255, 0.85)` | 卡片背景色 |
| `--theme-text` | `#1e293b` | 主文字颜色 |
| `--theme-textSecondary` | `#64748b` | 次要文字颜色 |
| `--theme-border` | `#e2e8f0` | 边框颜色 |
| `--theme-accent` | `#3b82f6` | 主题强调色 |
| `--theme-success` | `#22c55e` | 成功状态色 |
| `--theme-timeout` | `#ef4444` | 超时状态色 |
| `--theme-alert` | `#f59e0b` | 告警状态色 |

### 间距系统

| 令牌名称 | 值 | 用途 |
|---------|-----|------|
| `--spacing-xs` | `4px` | 极小间距 |
| `--spacing-sm` | `8px` | 小间距 |
| `--spacing-md` | `12px` | 中等间距 |
| `--spacing-lg` | `16px` | 大间距 |
| `--spacing-xl` | `24px` | 超大间距 |
| `--spacing-2xl` | `32px` | 极大间距 |

### 圆角系统

| 令牌名称 | 值 | 用途 |
|---------|-----|------|
| `--radius-sm` | `6px` | 小按钮、输入框 |
| `--radius-md` | `8px` | 按钮、卡片内元素 |
| `--radius-lg` | `12px` | 卡片、下拉菜单 |
| `--radius-xl` | `16px` | 模态框、详情面板 |
| `--radius-2xl` | `20px` | 欢迎卡片 |

### 字体系统

| 令牌名称 | 值 | 用途 |
|---------|-----|------|
| `--font-family` | Inter, system-ui | 全局字体 |
| `--font-size-xs` | `10px` | 极小文字（标签） |
| `--font-size-sm` | `12px` | 小文字（统计数据） |
| `--font-size-md` | `13px` | 中等文字（正文） |
| `--font-size-lg` | `14px` | 大文字（按钮、标题） |
| `--font-size-xl` | `16px` | 超大文字（副标题） |
| `--font-size-2xl` | `18px` | 极大文字（面板标题） |
| `--font-size-3xl` | `22px` | 页面标题 |
| `--font-size-4xl` | `36px` | 欢迎页标题 |
| `--font-weight-normal` | `400` | 常规字重 |
| `--font-weight-medium` | `500` | 中等字重 |
| `--font-weight-semibold` | `600` | 半粗体 |

### 过渡与模糊

| 令牌名称 | 值 | 用途 |
|---------|-----|------|
| `--transition-fast` | `0.15s ease` | 快速过渡（resize） |
| `--transition-normal` | `0.2s ease` | 标准过渡（悬停、动画） |
| `--backdrop-blur-sm` | `blur(10px)` | 轻微模糊 |
| `--backdrop-blur-md` | `blur(15px)` | 中等模糊 |
| `--backdrop-blur-lg` | `blur(20px)` | 强模糊 |

### Z-index 层级

| 令牌名称 | 值 | 用途 |
|---------|-----|------|
| `--z-index-dropdown` | `100` | 下拉菜单 |
| `--z-index-panel` | `200` | 工具栏、面板 |
| `--z-index-modal` | `1000` | 模态框、右键菜单 |

---

## 主题系统

### 主题列表

| 主题 ID | 名称 | 分类 | 图标 | 主色调 |
|---------|------|------|------|--------|
| `pure-white` | 纯净白 | 明亮 | ☀️ | 蓝色系 |
| `dawn-yellow` | 晨曦黄 | 明亮 | ☀️ | 暖黄色系 |
| `grey-blue` | 灰调蓝 | 中性 | ☁️ | 冷灰色系 |
| `amber-brown` | 琥珀棕 | 中性 | ☁️ | 棕黄色系 |
| `deep-black` | 深邃黑 | 夜间 | 🌙 | 深色绿调 |
| `aurora-purple` | 极光紫 | 夜间 | 🌙 | 深紫色调 |

### 主题配置结构

```typescript
interface Theme {
  id: string;
  name: string;
  category: "light" | "neutral" | "dark";
  background: string;
  panelBackground: string;
  cardBackground: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  success: string;
  timeout: string;
  alert: string;
}
```

### 主题实现机制

1. **存储方式**：主题 ID 保存在后端数据库（与别名颜色、IP 颜色相同方式）
2. **应用方式**：通过 `useEffect` 监听 `settings.themeId` 变化，动态设置 CSS 变量
3. **切换效果**：切换主题时，界面平滑过渡，所有使用 `--theme-*` 变量的元素自动更新

### 主题预览设计

每个主题卡片包含：
- **实时预览**：显示颜色圆点和卡片预览
- **主题名称**：中文名称
- **分类标识**：☀️ 明亮 / ☁️ 中性 / 🌙 夜间
- **选中状态**：勾选标记

---

## 组件架构

### 基础组件

| 组件 | 路径 | 说明 |
|-----|------|------|
| `GlassCard` | `src/components/GlassCard.tsx` | 玻璃态卡片容器，支持选中/多选状态 |
| `GlassButton` | `src/components/GlassButton.tsx` | 玻璃态按钮，支持三种变体（primary/secondary/danger） |

### 布局组件

| 组件 | 路径 | 说明 |
|-----|------|------|
| `Toolbar` | `src/components/Toolbar.tsx` | 顶部工具栏，包含文件操作和启动/停止控制 |
| `TargetGrid` | `src/components/TargetGrid.tsx` | 目标网格容器，包含浮动操作按钮和排序控制 |
| `DetailPanel` | `src/components/DetailPanel.tsx` | 详情面板，展示选中目标的统计和图表 |
| `EventLog` | `src/components/EventLog.tsx` | 消息动态面板，实时显示事件日志 |

### 功能组件

| 组件 | 路径 | 说明 |
|-----|------|------|
| `TargetCard` | `src/components/TargetCard.tsx` | 单个目标卡片，展示状态和统计 |
| `LatencyChart` | `src/components/LatencyChart.tsx` | 延迟图表，使用 uPlot 实现 |
| `SettingsPanel` | `src/components/SettingsPanel.tsx` | 设置面板模态框（含标签页分组） |
| `TargetEditor` | `src/components/TargetEditor.tsx` | 目标编辑模态框 |

### 工具函数

| 文件 | 路径 | 说明 |
|-----|------|------|
| `stats.ts` | `src/utils/stats.ts` | 统一统计计算逻辑（平均延迟、最大延迟、超时率等） |
| `themes.ts` | `src/themes.ts` | 主题配置定义（6套皮肤） |

---

## 布局系统

### 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│                      Toolbar (顶部工具栏)                    │
├─────────────┬─────────────────────────┬─────────────────────┤
│             │                         │                     │
│  TargetGrid │      DetailPanel        │    EventLog         │
│  (目标网格)  │      (详情面板)          │    (消息动态)        │
│             │                         │                     │
│  + 浮动按钮  │   + LatencyChart        │                     │
│             │   + 统计信息             │                     │
└─────────────┴─────────────────────────┴─────────────────────┘
```

### 响应式规则

- 左侧面板宽度：200px - 600px（可拖拽调整）
- 右侧面板宽度：200px - 500px（可拖拽调整）
- 面板可通过切换按钮完全隐藏
- 模态框最大宽度：90vw

---

## 交互模式

### 选择模式

| 操作 | 行为 |
|-----|------|
| 左键单击 | 选中单个目标 |
| Meta/Ctrl + 单击 | 添加到多选集 |
| Shift + 单击 | 选择连续范围 |

### 右键菜单

| 场景 | 菜单项 |
|-----|------|
| 单目标 | 编辑、启用/禁用、删除 |
| 多目标 | 批量启用、批量禁用、批量删除 |

### 浮动按钮组

位于 TargetGrid 底部，包含 4 个按钮（从左到右）：

| 按钮 | 图标 | 变体 | 功能 |
|-----|------|------|------|
| 添加目标 | Plus | primary | 打开目标编辑器 |
| 批量导入 | Upload | secondary | 打开批量导入面板 |
| 排序方向 | ArrowUpDown | secondary | 切换升序/降序 |
| 设置 | Settings | secondary | 打开设置面板 |

按钮组使用 `sticky` 定位，始终浮动在目标网格面板底部。

### 设置面板标签页

设置面板使用标签页分组，避免内容过长：

| 标签页 | 图标 | 内容 |
|-------|------|------|
| 常规 | Sliders | 排序方式、Ping 间隔、Ping 超时、历史保留天数、告警阈值 |
| 外观 | Palette | 主题皮肤选择、别名颜色、IP 地址颜色 |

### 模态框交互

所有模态框（目标编辑器、设置面板、批量导入）的关闭方式：

| 关闭方式 | 说明 |
|---------|------|
| 确定/保存按钮 | 确认操作后自动关闭 |
| 取消按钮 | 放弃操作并关闭 |
| 关闭图标 (X) | 点击右上角关闭按钮 |

**注意**：点击模态框外部区域不会关闭窗口，必须通过上述按钮操作。

---

## 状态指示

### 目标状态

| 状态 | 图标 | 颜色 | 动画 |
|-----|------|------|------|
| 启用 | ✅ CheckCircle | `--theme-success` | 无 |
| 禁用 | ❌ XCircle | `--theme-textSecondary` | 无 |
| 告警 | ⚠️ AlertCircle | `--theme-alert` | 脉冲动画 |

### 日志类型

| 类型 | 颜色 |
|-----|------|
| success | `--theme-success` |
| timeout | `--theme-timeout` |
| error | `--theme-accent` |
| info | `--theme-textSecondary` |

---

## Ping 运行状态

当 Ping 监控运行时，工具栏显示：
- 渐变背景：绿色主题
- 流动动画：从左向右的光泽效果
- 文字颜色：白色

---

## 代码规范

### CSS 命名规范

- 使用 BEM 风格的类名（如 `.targetCard`, `.targetCardBody`）
- 所有硬编码值替换为设计令牌
- 避免使用 `!important`（除特殊情况）
- 界面颜色使用 `--theme-*` 变量，支持主题切换

### 组件规范

- 使用 TypeScript 接口定义 Props
- 事件处理器命名：`onAction` 格式
- 计算逻辑提取到工具函数或自定义 Hooks
- 避免组件间重复逻辑（使用 `utils/stats.ts` 统一计算）

### 性能优化

- 右键菜单中缓存目标查找结果，避免重复 `find` 操作
- 使用 `useMemo` 缓存排序后的目标列表
- 使用 `ResizeObserver` 监听图表容器大小变化

---

## 文件结构

```
src/
├── components/
│   ├── GlassCard.tsx          # 玻璃态卡片
│   ├── GlassButton.tsx        # 玻璃态按钮
│   ├── TargetCard.tsx         # 目标卡片
│   ├── TargetGrid.tsx         # 目标网格
│   ├── DetailPanel.tsx        # 详情面板
│   ├── LatencyChart.tsx       # 延迟图表
│   ├── EventLog.tsx           # 消息动态
│   ├── Toolbar.tsx            # 顶部工具栏
│   ├── SettingsPanel.tsx      # 设置面板（含标签页）
│   └── TargetEditor.tsx       # 目标编辑器
├── utils/
│   └── stats.ts               # 统计计算工具
├── themes.ts                  # 主题配置定义
├── App.tsx                    # 主应用组件（含主题应用逻辑）
├── styles.css                 # 全局样式（含设计令牌和主题变量）
└── types.ts                   # TypeScript 类型定义
```

---

## 设计原则

1. **玻璃态设计**：使用 `backdrop-filter: blur()` 实现毛玻璃效果
2. **统一间距**：所有间距使用设计令牌，保持视觉一致性
3. **状态反馈**：悬停、选中、禁用等状态有明确的视觉反馈
4. **响应式布局**：支持面板拖拽调整和隐藏
5. **性能优先**：避免不必要的重渲染和重复计算
6. **可访问性**：按钮有 `title` 属性，图标按钮有文字说明
7. **主题可切换**：支持多套皮肤，使用 CSS 变量实现动态切换
8. **模态框优化**：使用标签页分组设置项，避免内容过长