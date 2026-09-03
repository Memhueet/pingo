# Pingo UI 元素命名指南

## 概述

本文档定义了 Pingo 应用中各 UI 元素的标准命名，方便后续沟通时准确描述需要修改的位置。

---

## 整体布局结构

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

---

## 详细元素命名

### 1. 顶部工具栏 (Toolbar)

| 元素名称 | 说明 | 代码位置 |
|---------|------|---------|
| 顶部工具栏 | 应用最上方的功能栏 | [Toolbar.tsx](../src/components/Toolbar.tsx) |
| 添加目标按钮 | 新建单个目标 | `GlassButton` with Plus icon |
| 批量导入按钮 | 导入多个目标 | `GlassButton` with Upload icon |
| 文件管理菜单 | 新建/打开/另存为数据文件 | Toolbar 中的文件操作按钮 |
| 设置按钮 | 打开设置面板 | `GlassButton` with Settings icon |
| 启动/停止按钮 | 控制全局 ping 状态 | Toolbar 中的主控制按钮 |
| Ping 状态动画 | 运行时的渐变流动效果 | Toolbar 背景样式 |

### 2. 左侧目标网格 (TargetGrid)

| 元素名称 | 说明 | 代码位置 |
|---------|------|---------|
| 目标网格 | 左侧展示所有目标的区域 | [TargetGrid.tsx](../src/components/TargetGrid.tsx) |
| 目标卡片 | 单个目标的卡片展示 | [TargetCard.tsx](../src/components/TargetCard.tsx) |
| 空状态提示 | 没有目标时的提示文字 | TargetGrid 中的 `emptyState` |
| 浮动操作按钮 | 左下角的快捷操作按钮组 | `floatingActions` |
| 排序方向按钮 | 升序/降序切换 | `GlassButton` with ArrowUpDown icon |
| 右键菜单 | 右键点击卡片弹出的菜单 | `contextMenu` |

### 3. 目标卡片内容 (TargetCard)

目标卡片为三行布局，IP 为主标识：

| 元素名称 | 说明 |
|---------|------|
| IP 地址 | 目标的 IPv4 地址，第一行主位，行尾为状态圆点 |
| 别名 | 用户自定义的目标名称，第二行 |
| 延迟 | 最近采样的平均延迟，第三行右对齐 |
| 状态圆点 | 在线/超时/告警的颜色标识，随 IP 显示 |
| 停用置灰 | 停用目标整卡置灰并固定沉底 |

### 4. 中间详情面板 (DetailPanel)

| 元素名称 | 说明 | 代码位置 |
|---------|------|---------|
| 详情面板 | 选中目标后的详情展示区域 | [DetailPanel.tsx](../src/components/DetailPanel.tsx) |
| 详情头部 | 目标名称和统计摘要 | `detailHeader` |
| 延迟图表 | 柱状图展示延迟历史 | [LatencyChart.tsx](../src/components/LatencyChart.tsx) |
| 图表图例 | 成功/超时的图例说明 | uPlot legend |
| 光标提示 | 鼠标悬停时的数据展示 | uPlot cursor |

### 5. 右侧消息动态 (EventLog)

| 元素名称 | 说明 | 代码位置 |
|---------|------|---------|
| 消息动态 | 实时显示 ping 事件和告警 | [EventLog.tsx](../src/components/EventLog.tsx) |
| 日志条目 | 单条消息记录 | `logEntry` |
| 日志类型 | success/timeout/error/info | 日志的颜色和类型标识 |

### 6. 设置面板 (SettingsPanel)

设置面板为固定高度弹窗，含常规/外观/关于三个标签页：

| 元素名称 | 说明 |
|---------|------|
| 设置面板 | 配置全局参数的弹窗，固定高度 580px，代码见 [SettingsPanel.tsx](../src/components/SettingsPanel.tsx) |
| 常规页 | 排序方式、ping 间隔、ping 超时、历史保留天数、告警阈值、失败退避间隔（每档可编辑） |
| 外观页 | 主题选择、别名颜色、IP 地址颜色 |
| 关于页 | 项目介绍、GitHub 链接、版本号、致谢图标 |
| 保存按钮 | 无改动时置灰（dirty check） |

### 7. 目标编辑器 (TargetEditor)

| 元素名称 | 说明 | 代码位置 |
|---------|------|---------|
| 目标编辑器 | 添加/编辑目标的弹窗 | [TargetEditor.tsx](../src/components/TargetEditor.tsx) |
| IP 输入框 | IPv4 地址输入 |
| 别名输入框 | 目标别名输入 |

---

## 常用表述示例

```
"修改详情面板中图例的位置"
"调整目标卡片的大小"
"修改顶部工具栏的背景颜色"
"修复消息动态中重复的告警提示"
"调整延迟图表的高度"
"修改设置面板中的默认值"
"添加目标编辑器的验证提示"
"修改浮动操作按钮的样式"
"调整目标网格的布局间距"
"修复右键菜单的显示位置"
```

---

## 颜色命名

界面颜色均通过主题令牌（`--theme-*` CSS 变量）引用，具体色值由 `src/themes.ts` 按主题定义：

| 颜色用途 | 令牌 | 说明 |
|---------|------|------|
| 在线/成功 | `--theme-success` | ping 成功 |
| 超时 | `--theme-timeout` | ping 超时 |
| 告警状态 | `--theme-alert` | 连续超时告警 |
| 信息/强调 | `--theme-accent` | 普通消息、交互焦点 |
| 图表成功柱 | `--theme-chartSuccess` | 每主题单独设计 |
| 图表超时柱 | `--theme-chartTimeout` | 经 `theme` prop 传入 uPlot |
| 主文字/次要文字 | `--theme-text` / `--theme-textSecondary` | 正文与辅助信息 |
