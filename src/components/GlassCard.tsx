interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  cornerRadius?: number;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<Element, MouseEvent>) => void;
  onContextMenu?: (e: React.MouseEvent<Element, MouseEvent>) => void;
  selected?: boolean;
  multiSelected?: boolean;
}

export function GlassCard({
  children,
  className = "",
  cornerRadius = 12,
  style,
  onClick,
  onContextMenu,
  selected = false,
  multiSelected = false,
}: GlassCardProps) {
  const getBorderStyle = () => {
    if (multiSelected) return "1px solid rgba(147, 51, 234, 0.5)";
    if (selected) return "1px solid rgba(37, 99, 235, 0.5)";
    return "1px solid rgba(255,255,255,0.5)";
  };

  const getShadowStyle = () => {
    if (multiSelected) return "0 0 0 2px rgba(147, 51, 234, 0.4), 0 4px 16px rgba(147, 51, 234, 0.15)";
    if (selected) return "0 0 0 2px rgba(37, 99, 235, 0.4), 0 4px 16px rgba(37, 99, 235, 0.15)";
    return "0 4px 20px rgba(31,41,55,0.08)";
  };

  return (
    <div
      className={`glassCard ${className}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(248,250,252,0.8) 100%)",
        backdropFilter: "blur(15px)",
        WebkitBackdropFilter: "blur(15px)",
        borderRadius: cornerRadius,
        border: getBorderStyle(),
        boxShadow: getShadowStyle(),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
