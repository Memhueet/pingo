import { useState } from "react";
import { isValidIpv4 } from "../validation";
import type { Target, TargetSaveData } from "../types";
import { X, Save } from "lucide-react";

interface TargetEditorProps {
  target?: Target;
  onClose: () => void;
  onSave: (payload: TargetSaveData) => void;
}

export function TargetEditor({ target, onClose, onSave }: TargetEditorProps) {
  const [ipv4, setIpv4] = useState(target?.ipv4 ?? "");
  const [alias, setAlias] = useState(target?.alias ?? "");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modalOverlay">
    <div className="modalPanel">
        <div className="panelHeaderRow">
          <h3>{target ? "编辑目标" : "添加目标"}</h3>
          <button type="button" className="closeBtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label>
          IPv4 地址
          <input
            type="text"
            placeholder="192.168.1.1"
            value={ipv4}
            onChange={(event) => setIpv4(event.target.value)}
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
          <button onClick={onClose}>取消</button>
          <button
            onClick={() => {
              if (!isValidIpv4(ipv4)) {
                setError("Only IPv4 addresses are supported in this version.");
                return;
              }
              if (target) {
                onSave({ id: target.id, ipv4, alias: alias || ipv4 });
              } else {
                onSave({ ipv4, alias: alias || ipv4 });
              }
            }}
            className="primaryBtn"
          >
            <Save size={14} style={{ marginRight: 6 }} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}