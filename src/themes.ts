export interface Theme {
  id: string;
  name: string;
  category: "light" | "neutral" | "dark";
  /** 面板表面：顶栏与三块工作台面板的填充，明度居中 */
  background: string;
  /** 缝隙基座：窗体底色，自面板间细缝露出，三层中最深 */
  panelBackground: string;
  /** 内容表面：详情壳、卡片、按钮等浮起元素，三层中最亮 */
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

/**
 * 新拟态（Neumorphism）主题：VS Code 式浮动工作台 + 三层同色相不透明
 * 表面按明度分层——panelBackground 为窗体缝隙底色（最深层），
 * background 为顶栏与工作台面板填充（居中），cardBackground 为
 * 详情壳/卡片/按钮等内容面（最亮）；面板间以细缝分隔、面板层不投影，
 * 元素层立体感由 shadowLight / shadowDark 双向柔和阴影塑造，
 * 禁止半透明表面与背景模糊。
 * 分层约束：shadowLight 必须亮于 cardBackground、shadowDark 必须深于 panelBackground；
 * 正文/次要文字对三层表面的对比度 ≥ 4.5:1（鲜草绿为中性参照主题，按其参照基准放宽）。
 * 亮色主题的状态色取深色变体，暗色主题的状态色取浅色变体，保证两套主题下均可读。
 */
export const themes: Theme[] = [
  {
    id: "pure-white",
    name: "纯净白",
    category: "light",
    background: "#e0e5ec",
    panelBackground: "#d2d9e3",
    cardBackground: "#ebeef3",
    text: "#1e293b",
    textSecondary: "#4f5e76",
    border: "#c6d0de",
    accent: "#3b82f6",
    accentText: "#ffffff",
    success: "#16a34a",
    timeout: "#dc2626",
    alert: "#d97706",
    chartSuccess: "#3b82f6",
    chartTimeout: "#ef4444",
    chartAxis: "#64748b",
    chartGrid: "#dde4ed",
    shadowLight: "#ffffff",
    shadowDark: "#a3b1c6",
  },
  {
    id: "sunrise",
    name: "晨曦黄",
    category: "light",
    background: "#ece2c9",
    panelBackground: "#e6d9b8",
    cardBackground: "#f1e9d6",
    text: "#78350f",
    textSecondary: "#7d5423",
    border: "#d8caa4",
    accent: "#ea580c",
    accentText: "#ffffff",
    success: "#15803d",
    timeout: "#dc2626",
    alert: "#b45309",
    chartSuccess: "#0f766e",
    chartTimeout: "#dc2626",
    chartAxis: "#8a6a3e",
    chartGrid: "#ded1b2",
    shadowLight: "#fff8e8",
    shadowDark: "#c5b48c",
  },
  {
    id: "gray-blue",
    name: "灰调蓝",
    category: "neutral",
    background: "#cdd8e6",
    panelBackground: "#c1cfe0",
    cardBackground: "#d7e0eb",
    text: "#24344d",
    textSecondary: "#435675",
    border: "#b3c2d6",
    accent: "#0369a1",
    accentText: "#ffffff",
    success: "#15803d",
    timeout: "#dc2626",
    alert: "#b45309",
    chartSuccess: "#0369a1",
    chartTimeout: "#dc2626",
    chartAxis: "#52678a",
    chartGrid: "#bccadb",
    shadowLight: "#edf3fb",
    shadowDark: "#a6b7cc",
  },
  {
    // 参照 caffeel neutral「中性·深焙地基」配色：oklch(0.56 0.07 148) 森林绿地面，
    // 近白暖绿文字，琥珀升为交互主色配深墨字；次要文字较参照提亮一档适配小字号
    id: "grass-green",
    name: "鲜草绿",
    category: "neutral",
    background: "#58805d",
    panelBackground: "#517555",
    cardBackground: "#5a835f",
    text: "#f2f3e9",
    textSecondary: "#dee0cd",
    border: "#6a846a",
    accent: "#cc9b49",
    accentText: "#2f2509",
    success: "#96ce9d",
    timeout: "#ff6467",
    alert: "#e5c057",
    chartSuccess: "#96ce9d",
    chartTimeout: "#ff6467",
    chartAxis: "#dee0cd",
    chartGrid: "#527256",
    shadowLight: "#6a926e",
    shadowDark: "#44684b",
  },
  {
    id: "deep-black",
    name: "深邃黑",
    category: "dark",
    background: "#1c1f26",
    panelBackground: "#17191f",
    cardBackground: "#21252d",
    text: "#e8ebf0",
    textSecondary: "#9aa4b2",
    border: "#2a303b",
    accent: "#38bdf8",
    accentText: "#0b2537",
    success: "#4ade80",
    timeout: "#f87171",
    alert: "#fbbf24",
    chartSuccess: "#38bdf8",
    chartTimeout: "#f87171",
    chartAxis: "#8b95a5",
    chartGrid: "#262c37",
    shadowLight: "#262b35",
    shadowDark: "#121419",
  },
  {
    id: "aurora-purple",
    name: "极光紫",
    category: "dark",
    background: "#252041",
    panelBackground: "#1f1b37",
    cardBackground: "#2a244a",
    text: "#eae7fb",
    textSecondary: "#b3abd6",
    border: "#362f5e",
    accent: "#a78bfa",
    accentText: "#251b4d",
    success: "#4ade80",
    timeout: "#f87171",
    alert: "#fbbf24",
    chartSuccess: "#2dd4bf",
    chartTimeout: "#fb7185",
    chartAxis: "#a79ed1",
    chartGrid: "#312a5b",
    shadowLight: "#322b5b",
    shadowDark: "#171335",
  },
];

export const defaultTheme = themes[0];

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) || defaultTheme;
}
