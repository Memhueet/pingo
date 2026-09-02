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

| 元素名称 | 说明 |
|---------|------|
| IP 地址 | 目标的 IPv4 地址 |
| 别名 | 用户自定义的目标名称 |
| 平均延迟 | 最近采样的平均延迟值 |
| 最大延迟 | 最近采样的最大延迟值 |
| 超时次数 | 超时的 ping 次数 |
| 状态指示 | 成功/超时/告警的颜色标识 |
| 启用开关 | 控制目标是否参与 ping |

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

| 元素名称 | 说明 | 代码位置 |
|---------|------|---------|
| 设置面板 | 配置全局参数的弹窗 | [SettingsPanel.tsx](../src/components/SettingsPanel.tsx) |
| ping 间隔 | 每次 ping 的间隔秒数 |
| ping 超时 | 单个 ping 的超时秒数 |
| 历史保留天数 | 数据保留期限 |
| 告警阈值 | 连续超时多少次触发告警 |

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

| 颜色用途 | 代码 | 说明 |
|---------|------|------|
| 成功状态 | `#2563eb` | 蓝色，ping 成功 |
| 超时状态 | `#dc2626` | 红色，ping 超时 |
| 告警状态 | `#dc2626` | 红色，连续超时 |
| 信息状态 | `#6b7280` | 灰色，普通消息 |
