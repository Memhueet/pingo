import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// 桌面应用禁用 WebView 默认右键菜单（Reload / 检查元素等浏览器入口），
// 避免误触刷新造成监控状态与事件日志的困惑；文本输入框保留系统编辑菜单，
// 目标卡片的自定义右键菜单自行 preventDefault，不受此处影响。
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.closest("input, textarea") || target.isContentEditable)) {
    return;
  }
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
