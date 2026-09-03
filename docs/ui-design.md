# Pingo UI 设计文档

## 概述

本文档定义 Pingo 应用的 UI 设计规范：新拟态视觉体系、设计令牌、主题系统、组件架构与交互模式。实现以 `src/styles.css` 与 `src/themes.ts` 为准，本文与其冲突时以代码为准。

---

## 设计原则：新拟态（Neumorphism / Soft UI）

1. **单色表面**：背景与元素同色（`--theme-background` = `--theme-panelBackground` = `--theme-cardBackground`），不使用半透明表面。
2. **光影塑形**：立体感仅由双向阴影塑造——左上高光 `--theme-shadowLight` + 右下暗影 `--theme-shadowDark`：
   - 凸起（raised）：静止的卡片、按钮、弹窗，使用 `--shadow-raised-sm / -raised / -raised-lg`；
   - 凹陷（inset）：输入井、按下态，使用 `--shadow-inset / -inset-sm`。
3. **禁止项**：半透明表面、背景模糊、硬边框装饰。唯一例外是弹窗遮罩 `.modalOverlay`（半透明 + 轻模糊，用于聚焦弹窗），以及 `color-mix` 混黑阴影等派生色。
4. **对比度**：正文文字与背景对比目标 ≥ 4.5:1；暗色主题使用浅强调色时，强调色上的文字用深色（`accentText` 令牌）。
5. **克制用色**：大面积使用主题表面色，强调色只用于交互焦点与关键状态，不用作大面积装饰。

---

## 设计令牌（`:root`）

### 基础令牌

| 令牌名称 | 值 | 用途 |
|---------|-----|------|
| `--radius-sm` | `8px` | 小按钮、输入框 |
| `--radius-md` | `10px` | 按钮、卡片内元素 |
| `--radius-lg` | `14px` | 卡片、下拉菜单 |
| `--radius-xl` | `16px` | 模态框、详情面板 |
| `--radius-2xl` | `22px` | 欢迎卡片 |
| `--spacing-xs` … `--spacing-2xl` | `4 / 8 / 12 / 16 / 24 / 32px` | 间距阶梯 |
| `--font-family` | Inter, system-ui | 全局字体 |
| `--font-size-xs` … `--font-size-4xl` | `10 / 12 / 13 / 14 / 16 / 18 / 22 / 36px` | 字号阶梯 |
| `--font-weight-normal / medium / semibold` | `400 / 500 / 600` | 字重 |
| `--transition-fast` | `0.15s ease` | 快速过渡（面板拖拽） |
| `--transition-normal` | `0.2s ease` | 标准过渡（悬停、动画） |
| `--z-index-dropdown / -panel / -modal` | `100 / 200 / 1000` | 下拉 / 面板 / 弹窗层级 |

### 新拟态光影组合

```css
--shadow-raised-sm:  3px 3px 7px var(--theme-shadowDark), -3px -3px 7px var(--theme-shadowLight);
--shadow-raised:     6px 6px 14px …（同上比例放大）;
--shadow-raised-lg: 10px 10px 24px …;
--shadow-inset:      inset 3px 3px 7px dark, inset -3px -3px 7px light;
--shadow-inset-sm:   inset 2px 2px 5px dark, inset -2px -2px 5px light;
--accent-soft: color-mix(in srgb, var(--theme-accent) 12%, transparent);
--accent-ring: color-mix(in srgb, var(--theme-accent) 55%, transparent);
```

### 主题变量（`--theme-*`）

`:root` 内置纯净白回退值，运行时由 `themes.ts` 的主题对象逐键覆写：
`background、panelBackground、cardBackground、text、textSecondary、border、accent、accentText、success、timeout、alert、chartSuccess、chartTimeout、chartAxis、chartGrid、shadowLight、shadowDark`。

界面颜色一律使用 `var(--theme-*)`，禁止在组件样式里写死色值。

---

## 主题系统

### 主题列表

| 主题 ID | 名称 | 分类 | 基调 |
|---------|------|------|------|
| `pure-white` | 纯净白 | light | 雾蓝白表面，蓝强调 |
| `sunrise` | 晨曦黄 | light | 暖纸黄表面，橘强调 |
| `gray-blue` | 灰调蓝 | neutral | 冷灰蓝表面，深海蓝强调 |
| `grass-green` | 鲜草绿 | neutral | 深焙森林绿表面，琥珀强调（参照 caffeel neutral 配色） |
| `deep-black` | 深邃黑 | dark | 石墨黑表面，天蓝强调 |
| `aurora-purple` | 极光紫 | dark | 深紫表面，浅紫强调 |

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
  /** 强调色底色上的文字颜色：亮色主题用白，暗色主题的浅强调色配深色文字 */
  accentText: string;
  success: string;
  timeout: string;
  alert: string;
  /** 图表：成功延迟柱色（每主题单独设计，可与状态色不同） */
  chartSuccess: string;
  /** 图表：超时柱色 */
  chartTimeout: string;
  /** 图表：坐标轴与刻度文字色 */
  chartAxis: string;
  /** 图表：网格线色 */
  chartGrid: string;
  /** 新拟态：左上光源高光色 */
  shadowLight: string;
  /** 新拟态：右下暗影色 */
  shadowDark: string;
}
```

新增主题时必须补全全部令牌，并保证亮暗两套语境下文字均可读。

### 实现机制

1. **存储**：外观配置（`themeId`、`aliasColor`、`ipv4Color`）是**应用级配置**，保存在 WebView 的 localStorage（`src/state/usePingoStore.ts` 的 `loadAppearance` / `saveAppearance`），不随数据文件走；数据文件内虽也存有一份，但加载时会被应用级值覆盖。功能类设置（间隔、超时、保留天数、阈值、退避）随数据文件存储。
2. **应用**：`App.tsx` 的 effect 遍历主题对象写入 `--theme-*` CSS 变量；同时调用 `getCurrentWindow().setTheme()` 将系统标题栏设为对应深/浅色（Windows 原生装饰跟随）。
3. **图表**：`LatencyChart` 接收 `theme` prop，坐标轴/网格/柱色取 `chartAxis / chartGrid / chartSuccess / chartTimeout`；切换主题时以 `theme.id` 为 key 重挂载，确保 uPlot 以新配色重绘。
4. **开始页**：启动首帧同步读取应用级外观，欢迎页（未打开数据文件时）即呈现上次主题，无闪白。

---

## 组件架构

### 基础组件

| 组件 | 路径 | 说明 |
|-----|------|------|
| `GlassCard` | `src/components/GlassCard.tsx` | 新拟态卡片容器（历史名称保留），支持选中/多选状态 |
| `GlassButton` | `src/components/GlassButton.tsx` | 新拟态按钮：静止凸起（raised），按下转凹陷（inset），primary/secondary/danger 变体 |

### 布局组件

| 组件 | 路径 | 说明 |
|-----|------|------|
| `Toolbar` | `src/components/Toolbar.tsx` | 顶部工具栏：文件操作、全局统计（目标/启用/告警/平均延迟，窗口居中）、开始/停止 Ping、左右面板切换；开始页隐藏文件与 Ping 按钮 |
| `TargetGrid` | `src/components/TargetGrid.tsx` | 目标网格容器，含浮动操作按钮组与排序控制 |
| `DetailPanel` | `src/components/DetailPanel.tsx` | 详情面板，展示选中目标的统计与延迟图表 |
| `EventLog` | `src/components/EventLog.tsx` | 消息动态面板，实时显示事件日志 |

### 功能组件

| 组件 | 路径 | 说明 |
|-----|------|------|
| `TargetCard` | `src/components/TargetCard.tsx` | 目标卡片，三行布局：IP（主标识，含状态圆点）/ 别名 / 延迟（右对齐）；停用目标整卡置灰并固定沉底 |
| `LatencyChart` | `src/components/LatencyChart.tsx` | 延迟柱状图（uPlot），配色逐主题令牌化 |
| `SettingsPanel` | `src/components/SettingsPanel.tsx` | 设置弹窗（常规/外观/关于三标签页，固定高度防切换跳变） |
| `TargetEditor` | `src/components/TargetEditor.tsx` | 目标添加/编辑弹窗（`<form>` 提交，回车即保存） |

---

## 布局系统

### 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│        Toolbar（文件菜单 · 全局统计 · 开始/停止 · 面板切换）      │
├─────────────┬─────────────────────────┬─────────────────────┤
│             │                         │                     │
│  TargetGrid │      DetailPanel        │    EventLog         │
│  (目标网格)  │      (详情面板)          │    (消息动态)        │
│             │                         │                     │
│  + 浮动按钮  │   + LatencyChart        │                     │
│             │   + 统计信息             │                     │
└─────────────┴─────────────────────────┴─────────────────────┘
```

未打开数据文件时显示欢迎页（选择新建工作空间或打开数据文件）。

### 响应式规则

- 左侧面板宽度：200px - 600px（拖拽边界调整）
- 右侧面板宽度：200px - 500px（拖拽边界调整）
- 面板可通过顶栏按钮完全隐藏（VS Code 式交互）
- 弹窗最大宽度：90vw；设置弹窗固定高度 580px，切换标签页不跳变

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

WebView 默认右键菜单已禁用（防误触 Reload），勿重新放开。

### 浮动按钮组

位于 TargetGrid 底部（sticky），从左到右：

| 按钮 | 图标 | 变体 | 功能 |
|-----|------|------|------|
| 添加目标 | Plus | primary | 打开目标编辑器 |
| 批量导入 | Upload | secondary | 打开批量导入弹窗 |
| 排序方向 | ArrowUpDown | secondary | 切换升序/降序 |
| 设置 | Settings | secondary | 打开设置面板 |

### 键盘快捷

| 场景 | 按键 | 行为 |
|-----|------|------|
| 目标编辑器 | Enter | 保存（`<form>` 提交） |
| 批量导入 | Ctrl/⌘ + Enter | 确认导入（裸 Enter 需保留换行，故用组合键） |

### 设置面板标签页

| 标签页 | 内容 |
|-------|------|
| 常规 | 排序方式、Ping 间隔、Ping 超时、历史保留天数、告警阈值、失败退避阶梯（逐档可视化编辑） |
| 外观 | 主题选择、别名颜色、IP 地址颜色 |
| 关于 | 项目介绍、GitHub 链接、版本号、技术栈致谢图标 |

设置弹窗无改动时保存按钮置灰（dirty check），避免空写数据库。

### 模态框交互

- 通过确定/保存、取消、右上角关闭按钮关闭；点击遮罩不关闭。
- 删除目标、清空历史等破坏性操作必须有确认。

---

## 状态指示

### 目标状态

| 状态 | 表现 |
|-----|------|
| 在线 | 状态圆点 `--theme-success` |
| 超时 | 状态圆点/延迟值 `--theme-timeout` |
| 告警 | `--theme-alert`，脉冲动画 |
| 停用 | 整卡置灰，固定排序列表底部 |

### 日志类型（EventLog）

| 类型 | 文字颜色 |
|-----|------|
| success | `--theme-success` |
| timeout | `--theme-alert` |
| error | `--theme-timeout` |
| info | `--theme-accent` |

---

## 代码规范

### CSS

- 扁平 BEM 风格类名（如 `.targetCard`、`.detailHeader`、`.eventLogEntry`）。
- 颜色一律使用 `var(--theme-*)` 与令牌化阴影，禁止写死色值（例外：弹窗遮罩 rgba、`color-mix` 派生色）。
- 间距、圆角、字号、过渡使用 `:root` 令牌，不写魔数。

### 组件

- TypeScript 接口定义 Props；事件处理器 `onAction` 命名。
- 统计计算统一走 `src/utils/stats.ts`，不在组件内重复实现。
- 性能：`useMemo` 缓存排序结果，右键菜单缓存目标查找，`ResizeObserver` 监听图表容器。

---

## 文件结构

```
src/
├── components/
│   ├── GlassCard.tsx          # 新拟态卡片容器
│   ├── GlassButton.tsx        # 新拟态按钮
│   ├── TargetCard.tsx         # 目标卡片（三行布局）
│   ├── TargetGrid.tsx         # 目标网格 + 浮动按钮组
│   ├── DetailPanel.tsx        # 详情面板
│   ├── LatencyChart.tsx       # 延迟图表（uPlot，主题令牌配色）
│   ├── EventLog.tsx           # 消息动态
│   ├── Toolbar.tsx            # 顶部工具栏（文件/统计/开始停止/面板切换）
│   ├── SettingsPanel.tsx      # 设置弹窗（常规/外观/关于）
│   └── TargetEditor.tsx       # 目标编辑器（回车保存）
├── state/
│   └── usePingoStore.ts       # 状态聚合 + 外观应用级存储（loadAppearance/saveAppearance）
├── utils/
│   └── stats.ts               # 统计计算工具
├── themes.ts                  # 主题配置定义（6 套，完整令牌集）
├── App.tsx                    # 主应用（主题应用、标题栏同步、开始页）
├── styles.css                 # 全局样式（新拟态令牌 + 主题变量）
└── types.ts                   # TypeScript 类型定义
```
