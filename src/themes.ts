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
    shadowLight: "#fff8e8",
    shadowDark: "#c5b48c",
  },
  {
    id: "gray-blue",
    name: "灰调蓝",
    category: "neutral",
    background: "#d7dee9",
    panelBackground: "#d7dee9",
    cardBackground: "#d7dee9",
    text: "#334155",
    textSecondary: "#4d5c74",
    border: "#bac5d6",
    accent: "#4f46e5",
    accentText: "#ffffff",
    success: "#16a34a",
    timeout: "#dc2626",
    alert: "#b45309",
    shadowLight: "#f2f6fb",
    shadowDark: "#9fadc2",
  },
  {
    id: "amber-brown",
    name: "琥珀棕",
    category: "neutral",
    background: "#e6dac4",
    panelBackground: "#e6dac4",
    cardBackground: "#e6dac4",
    text: "#4c3a21",
    textSecondary: "#6e5233",
    border: "#cfc0a2",
    accent: "#854d0e",
    accentText: "#ffffff",
    success: "#15803d",
    timeout: "#b91c1c",
    alert: "#d97706",
    shadowLight: "#fdf6ea",
    shadowDark: "#b2a081",
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
    shadowLight: "#322b5b",
    shadowDark: "#171335",
  },
];

export const defaultTheme = themes[0];

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) || defaultTheme;
}
