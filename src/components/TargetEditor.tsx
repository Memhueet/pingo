import { useState } from "react";
import { isValidAddress } from "../validation";
import type { Target, TargetSaveData } from "../types";
import { X, Save } from "lucide-react";

interface TargetEditorProps {
  target?: Target;
  onClose: () => void;
  onSave: (payload: TargetSaveData) => void;
}

export function TargetEditor({ target, onClose, onSave }: TargetEditorProps) {
  const [addressInput, setAddressInput] = useState(target?.address ?? "");
  const [alias, setAlias] = useState(target?.alias ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    // 粘贴的地址可能带首尾空白：校验与保存都用去除后的值，
    // state 保持原样以免 trim 干扰输入过程
    const address = addressInput.trim();
    if (!isValidAddress(address)) {
      setError("请输入有效的 IPv4 或 IPv6 地址");
      return;
    }
    if (target) {
      onSave({ id: target.id, address, alias: alias || address });
    } else {
      onSave({ address, alias: alias || address });
    }
  }

  return (
    <div className="modalOverlay">
    <div className="modalPanel">
        <div className="panelHeaderRow">
          <h3>{target ? "编辑目标" : "添加目标"}</h3>
          <button type="button" className="closeBtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {/* 输入框内按回车即提交保存 */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <label>
            IP 地址
            <input
              type="text"
              placeholder="192.168.1.1 或 2001:db8::1"
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
            />
          </label>
          <label>
            别名 (可选)
            <input
              type="text"
              placeholder="Router"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
            />
          </label>
          {error ? <div className="formError">{error}</div> : null}
          <div className="panelActions">
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primaryBtn">
              <Save size={14} style={{ marginRight: 6 }} />
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
