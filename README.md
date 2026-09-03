# Pingo

Pingo 是一个基于 **Tauri + Rust** 构建的轻量级桌面监控工具，用于检测 IPv4 地址的可达性与延迟，并以柱状图实时呈现网络质量。

> 说明：本项目 99.9% 的代码由 AI Agent 生成，过程中使用的 Agent 包括 Codex、CodeBuddy、Qoder、Trae 和 Zcode。

## 功能特性

### 核心功能
- IPv4 地址可达性检测
- 实时延迟监控（柱状图展示）
- 目标管理（添加、编辑、启用/禁用、删除）
- 连续超时告警
- 历史数据保留与清理

### 交互体验（参考 VSCode）
- **三栏式布局**：左侧目标列表、中间详情视图、右侧消息动态
- **顶栏全局统计**：目标总数、启用数、告警数、平均延迟，窗口居中展示
- **面板隐藏/显示**：左右面板可随时收起
- **面板宽度拖拽**：拖动边界调整面板宽度
- **卡片点击显示详情**：点击卡片直接查看延迟图表
- **右键菜单**：编辑、启用/禁用、删除
- **多选操作**：Cmd(Meta)+点击逐个选择，Shift+点击范围选择，支持批量启用/禁用/删除
- **目标排序**：按 IP、添加时间、延迟排序，支持升/降序切换
- **批量导入**：多行 IP（可选别名）一次性导入

### 主题与外观
- **六套内置主题**：纯净白、晨曦黄、灰调蓝、鲜草绿、深邃黑、极光紫（覆盖亮色 / 中性 / 暗色）
- **新拟态质感**（Neumorphism / Soft UI）：全局单色表面，立体感由左上高光 + 右下暗影双向阴影塑造
- **一键切换**：基于 CSS 变量动态切换，无需刷新；图表柱色、坐标轴、网格逐主题单独设计
- **自定义颜色**：可分别设置别名与 IPv4 文本颜色
- **外观跟随应用**：主题等外观配置保存在应用本身（而非数据文件），启动时开始页即呈现上次主题；窗口标题栏深浅色同步跟随主题（Windows 原生装饰）

### 设置
- **常规**：排序方式、Ping 间隔/超时、历史保留天数、告警阈值、失败退避阶梯（逐档可视化编辑）
- **外观**：主题选择、自定义文字颜色
- **关于**：项目介绍、GitHub 地址、版本号与技术栈致谢
- 无改动时保存按钮置灰；目标编辑器回车即保存，批量导入 Ctrl/⌘+Enter 确认

### 文件管理
- **新建监测**：在任意目录创建新的数据文件
- **打开监测**：切换到已有的数据文件
- **另存为**：将当前数据复制到新文件
- **清空历史数据**：保留目标配置，仅清空历史记录

## 项目结构

```
Pingo/
├── src/                        # 前端代码（React + TypeScript）
│   ├── api/
│   │   └── tauri.ts            # Tauri 后端命令封装
│   ├── components/             # UI 组件
│   │   ├── Toolbar.tsx         # 顶部工具栏（文件菜单、开始/停止）
│   │   ├── TargetGrid.tsx      # 目标列表网格 + 浮动操作按钮
│   │   ├── TargetCard.tsx      # 单个目标卡片
│   │   ├── DetailPanel.tsx     # 详情视图面板
│   │   ├── LatencyChart.tsx    # 延迟柱状图（uPlot）
│   │   ├── EventLog.tsx        # 消息动态面板
│   │   ├── TargetEditor.tsx    # 目标添加/编辑弹窗（回车保存）
│   │   ├── SettingsPanel.tsx   # 设置弹窗（常规/外观/关于，固定高度）
│   │   ├── GlassCard.tsx       # 新拟态卡片容器
│   │   └── GlassButton.tsx     # 新拟态按钮
│   ├── state/
│   │   └── usePingoStore.ts    # 前端状态与采样聚合逻辑
│   ├── utils/
│   │   └── stats.ts            # 延迟统计计算
│   ├── __tests__/              # 前端单元测试（Vitest）
│   ├── App.tsx                 # 主应用组件（含主题应用逻辑）
│   ├── main.tsx                # 入口文件
│   ├── themes.ts               # 主题定义
│   ├── types.ts                # TypeScript 类型定义
│   ├── validation.ts           # IPv4 校验
│   └── styles.css              # 全局样式（设计令牌 + 主题变量）
├── src-tauri/                  # 后端代码（Rust）
│   ├── src/
│   │   ├── ping/               # Ping 执行与输出解析
│   │   │   ├── command.rs      # 调用系统 ping 命令
│   │   │   ├── parser.rs       # 解析 ping 输出
│   │   │   └── mod.rs
│   │   ├── fixtures/           # ping 输出测试样本
│   │   ├── commands.rs         # Tauri 命令定义
│   │   ├── scheduler.rs        # Ping 调度器
│   │   ├── storage.rs          # SQLite 存储（rusqlite）
│   │   ├── config.rs           # 配置管理
│   │   ├── models.rs           # 数据模型
│   │   ├── error.rs            # 错误处理
│   │   ├── lib.rs              # 库入口
│   │   └── main.rs             # 主函数
│   ├── Cargo.toml              # Rust 依赖
│   └── tauri.conf.json         # Tauri 配置
├── docs/                       # 设计与规范文档
├── index.html                  # HTML 模板
├── package.json                # 前端依赖与脚本
├── vite.config.ts              # Vite 配置
└── tsconfig.json               # TypeScript 配置
```

## 数据存储

监控数据以 SQLite 数据库文件保存。用户可通过「文件」菜单在任意位置新建或打开数据文件（文件名包含 `pingo-history`），便于按项目或时间归档、迁移。

设置分两层存储：

- **功能设置**（Ping 间隔/超时、历史保留天数、告警阈值、失败退避、排序方式）随数据文件保存，每个监测档案可以有独立参数；
- **外观配置**（主题、别名/IP 文字颜色）保存在应用本身，与数据文件无关，切换文件、重新启动均保持上次外观。

## 开发环境

- Node.js 18+（建议 LTS）
- Rust 工具链（stable）
- 各平台编译依赖：参见 [Tauri 官方前置要求](https://tauri.app/start/prerequisites/)

```bash
# 安装依赖
npm install

# 启动桌面应用（开发模式）
npm run tauri dev

# 仅启动前端开发服务器
npm run dev
```

## 测试

```bash
# 前端测试（Vitest）
npm test

# Rust 测试
cargo test --manifest-path src-tauri/Cargo.toml
```

## 构建

```bash
# 构建生产版本（桌面安装包）
npm run tauri build
```

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite |
| 桌面框架 | Tauri 2 |
| 后端 | Rust + Tokio |
| 存储 | SQLite（rusqlite，bundled） |
| 图表 | uPlot |
| 图标 | lucide-react |

## 设计文档

- [UI 设计文档](docs/ui-design.md)
- [UI 元素命名指南](docs/ui-naming-guide.md)
- [设计规范](docs/superpowers/specs/2026-06-18-pingo-design.zh-CN.md)
- [变更记录](docs/superpowers/specs/2026-06-28-pingo-changes.md)

## License

本项目基于 [MIT License](LICENSE) 开源。
