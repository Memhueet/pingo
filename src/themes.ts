export interface Theme {
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

/**
 * 新拟态（Neumorphism）主题：表面统一为单色中间调，
 * 立体感完全由 shadowLight / shadowDark 双向柔和阴影塑造，
 * 禁止半透明表面与背景模糊。
 * 对比度基准：正文/次要文字对背景 ≥ 4.5:1；亮色主题的状态色取深色变体，
 * 暗色主题的状态色取浅色变体，保证两套主题下均可读。
 */
export const themes: Theme[] = [
  {
    id: "pure-white",
    name: "纯净白",
    category: "light",
    background: "#e0e5ec",
    panelBackground: "#e0e5ec",
    cardBackground: "#e0e5ec",
    text: "#1e293b",
    textSecondary: "#4f5e76",
    border: "#cdd6e3",
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
    panelBackground: "#ece2c9",
    cardBackground: "#ece2c9",
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
    panelBackground: "#cdd8e6",
    cardBackground: "#cdd8e6",
    text: "#24344d",
    textSecondary: "#4a5c7c",
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
    panelBackground: "#58805d",
    cardBackground: "#58805d",
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
    panelBackground: "#1c1f26",
    cardBackground: "#1c1f26",
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
    panelBackground: "#252041",
    cardBackground: "#252041",
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
