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
  const classes = [
    "glassCard",
    className,
    selected ? "selected" : "",
    multiSelected ? "multiSelected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        borderRadius: cornerRadius,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
