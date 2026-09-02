import type { LucideIcon } from "lucide-react";

interface GlassButtonProps {
  children?: React.ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
  title?: string;
}

export function GlassButton({
  children,
  icon: Icon,
  onClick,
  className = "",
  variant = "secondary",
  disabled = false,
  style,
  type = "button",
  title,
}: GlassButtonProps) {
  const isIconOnly = !children;
  const classes = [
    "glassBtn",
    variant,
    isIconOnly ? "iconOnly" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      style={style}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}
