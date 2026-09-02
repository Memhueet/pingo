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
    success: "#22c55e",
    timeout: "#ef4444",
    alert: "#f59e0b",
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
    textSecondary: "#8a4a12",
    border: "#d8caa4",
    accent: "#f97316",
    success: "#16a34a",
    timeout: "#dc2626",
    alert: "#d97706",
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
    accent: "#6366f1",
    success: "#22c55e",
    timeout: "#ef4444",
    alert: "#f59e0b",
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
    accent: "#a16207",
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
    background: "#1d2a3e",
    panelBackground: "#1d2a3e",
    cardBackground: "#1d2a3e",
    text: "#f1f5f9",
    textSecondary: "#94a3b8",
    border: "#2c3d57",
    accent: "#10b981",
    success: "#34d399",
    timeout: "#f87171",
    alert: "#fbbf24",
    shadowLight: "#2b3d59",
    shadowDark: "#101a29",
  },
  {
    id: "aurora-purple",
    name: "极光紫",
    category: "dark",
    background: "#2b2765",
    panelBackground: "#2b2765",
    cardBackground: "#2b2765",
    text: "#e0e7ff",
    textSecondary: "#a5b4fc",
    border: "#3d3a8c",
    accent: "#8b5cf6",
    success: "#34d399",
    timeout: "#f87171",
    alert: "#fbbf24",
    shadowLight: "#3c3890",
    shadowDark: "#191543",
  },
];

export const defaultTheme = themes[0];

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) || defaultTheme;
}
