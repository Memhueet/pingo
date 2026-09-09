interface ConfirmDialogProps {
  title: string;
  message: string;
  /** 危险操作按钮的文案，如"删除"/"清空" */
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 破坏性操作的全局确认弹窗：标准文字标题栏 + 说明文案 + 取消/危险操作按钮。
 * 仅通过两个按钮关闭，不响应点击遮罩与 Escape（与仓库弹窗规范一致）。
 */
export function ConfirmDialog({
  title,
  message,
  confirmText = "确认",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="modalOverlay">
      <div className="modalPanel">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="panelActions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="dangerBtn" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
