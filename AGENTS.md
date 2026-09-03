# AGENTS.md — Pingo 工程约定

本文件是 AI Agent 在本仓库工作时的行为规则。README.md 偏向使用者视角；本文件聚焦开发约定，二者冲突时以本文件为准。

## 项目概述

Pingo 是基于 **Tauri 2 + React 19 + TypeScript + Rust** 的轻量级桌面 IPv4 延迟监控工具：调度系统 `ping` 命令采集延迟，柱状图实时展示，数据落盘 SQLite。项目文档、注释与提交信息统一使用中文。

## 常用命令

```bash
npm install                                      # 安装前端依赖
npm run tauri dev                                # 启动桌面应用（开发模式）
npm run dev                                      # 仅启动前端开发服务器（无后端）
npm test                                         # 前端测试（Vitest run 模式）
npm run build                                    # tsc 类型检查 + vite 构建
cargo test --manifest-path src-tauri/Cargo.toml  # Rust 测试
npm run tauri build                              # 生产构建（桌面安装包）
```

任何改动完成后、宣称完成之前，必须实际运行覆盖所改代码的测试并确认通过：

- 改前端 → `npm test` + `npm run build`（验证类型）
- 改 Rust → `cargo test --manifest-path src-tauri/Cargo.toml`
- 改两端交互（新增/修改 Tauri 命令）→ 两套都跑

已知误报：`npm test` 中 uPlot 在 jsdom 下存在固有的 unhandled error，测试全部通过时不要把它当成回归去"修复"。

## 架构与边界

前后端经由 Tauri 命令层通信，方向严格单向：**React 组件 → `src/api/tauri.ts`（命令封装）→ Rust `commands.rs` → 各 Rust 模块**。

前端 `src/`：

- `api/tauri.ts` — 后端命令的唯一封装入口。组件不得直接调用 `invoke`，新增后端命令时必须先在此封装并补类型。
- `state/usePingoStore.ts` — 全局状态与采样聚合逻辑，是前端的核心业务层。
- `components/` — UI 组件。`GlassCard`/`GlassButton` 是通用视觉容器，其余组件对应一个界面区域（Toolbar / TargetGrid / TargetCard / DetailPanel / LatencyChart / EventLog / TargetEditor / SettingsPanel）。
- `themes.ts` + `styles.css` — 主题定义与设计令牌。颜色、圆角、阴影一律使用 CSS 变量，禁止在组件里写死色值；新增主题时在 `themes.ts` 补全变量集。
- `types.ts` — 共享类型；`validation.ts` — IPv4 校验；`utils/stats.ts` — 延迟统计。
- `__tests__/` — Vitest 测试，配套 `setup.ts`。

后端 `src-tauri/src/`：

- `commands.rs` — 所有 `#[tauri::command]` 的定义处，新命令必须在此注册并同步更新 `lib.rs` 的 `invoke_handler` 与 `capabilities/` 权限。
- `scheduler.rs` — ping 调度器（并发采集的核心）。
- `ping/` — `command.rs` 调系统 ping、`parser.rs` 解析输出；解析逻辑的测试样本放 `fixtures/`（Windows 中文输出依赖 `encoding_rs` 解码，改解析器时注意覆盖）。
- `storage.rs` — SQLite（rusqlite bundled）；`config.rs` — 配置；`models.rs` — 数据模型；`error.rs` — 错误定义。

新增跨端数据结构时，`src/types.ts` 与 `src-tauri/src/models.rs` 必须成对修改，字段名保持 camelCase↔snake_case 映射一致（Rust 侧用 serde rename）。

## UI 约定

- 桌面应用审美遵循"简约反装饰"：克制用色、亮暗主题下都要可读，弹窗、字体、圆角遵循现有设计令牌基准（详见 `docs/ui-design.md` 与 `docs/ui-naming-guide.md`）。
- 阴影不得与遮罩模糊叠加（弹窗去掉凸起阴影是有意为之，勿"改回"）。
- 面板显隐采用 VS Code 式顶栏按钮交互；目标卡片以 IP 为主标识。
- 需防误触：涉及删除/清空历史等破坏性操作要有确认；WebView 默认右键菜单已禁用，勿重新放开。

## 提交规范

- 小粒度提交：一个独立需求或 bug 修复单独成一笔，完成一项提交一项，不相干改动不合并。
- 提交信息用中文，格式为 `<type>: <摘要>`，type 取 `feat` / `fix` / `style` / `refactor` / `docs` / `test` / `chore`；多要点时在正文逐行列出。
- 示例：`feat: 顶栏新增全局统计（目标/启用/告警/平均延迟）`。

## 其他

- 设计与变更文档放 `docs/superpowers/specs/` 与 `docs/superpowers/plans/`，命名 `YYYY-MM-DD-<主题>.md`。
- 数据文件（`pingo-history` 的 SQLite）是用户数据，调试时不得修改或删除仓库外的用户数据文件。
