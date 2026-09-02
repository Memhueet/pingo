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
}

export const themes: Theme[] = [
  {
    id: "pure-white",
    name: "纯净白",
    category: "light",
    background: "#ffffff",
    panelBackground: "#f8fafc",
    cardBackground: "rgba(255, 255, 255, 0.85)",
    text: "#1e293b",
    textSecondary: "#64748b",
    border: "#e2e8f0",
    accent: "#3b82f6",
    success: "#22c55e",
    timeout: "#ef4444",
    alert: "#f59e0b",
  },
  {
    id: "sunrise",
    name: "晨曦黄",
    category: "light",
    background: "#fffbeb",
    panelBackground: "#fef3c7",
    cardBackground: "rgba(255, 251, 235, 0.9)",
    text: "#78350f",
    textSecondary: "#92400e",
    border: "#fed7aa",
    accent: "#f97316",
    success: "#16a34a",
    timeout: "#dc2626",
    alert: "#d97706",
  },
  {
    id: "gray-blue",
    name: "灰调蓝",
    category: "neutral",
    background: "#f1f5f9",
    panelBackground: "#e2e8f0",
    cardBackground: "rgba(241, 245, 249, 0.9)",
    text: "#334155",
    textSecondary: "#64748b",
    border: "#cbd5e1",
    accent: "#6366f1",
    success: "#22c55e",
    timeout: "#ef4444",
    alert: "#f59e0b",
  },
  {
    id: "amber-brown",
    name: "琥珀棕",
    category: "neutral",
    background: "#fdf8f3",
    panelBackground: "#f5ebe0",
    cardBackground: "rgba(253, 248, 243, 0.9)",
    text: "#4c3a21",
    textSecondary: "#785538",
    border: "#d4c4b0",
    accent: "#a16207",
    success: "#15803d",
    timeout: "#b91c1c",
    alert: "#d97706",
  },
  {
    id: "deep-black",
    name: "深邃黑",
    category: "dark",
    background: "#0f172a",
    panelBackground: "#1e293b",
    cardBackground: "rgba(30, 41, 59, 0.85)",
    text: "#f1f5f9",
    textSecondary: "#94a3b8",
    border: "#334155",
    accent: "#10b981",
    success: "#34d399",
    timeout: "#f87171",
    alert: "#fbbf24",
  },
  {
    id: "aurora-purple",
    name: "极光紫",
    category: "dark",
    background: "#1e1b4b",
    panelBackground: "#312e81",
    cardBackground: "rgba(49, 46, 129, 0.85)",
    text: "#e0e7ff",
    textSecondary: "#a5b4fc",
    border: "#4c1d95",
    accent: "#8b5cf6",
    success: "#34d399",
    timeout: "#f87171",
    alert: "#fbbf24",
  },
];

export const defaultTheme = themes[0];

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) || defaultTheme;
}