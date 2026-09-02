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
  const variantStyles = {
    primary: {
      background: "linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(238,245,255,0.9) 100%)",
      border: "1px solid rgba(255,255,255,0.6)",
      color: "#1d4ed8",
      boxShadow: "0 4px 16px rgba(37,99,235,0.15)",
    },
    secondary: {
      background: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(248,250,252,0.8) 100%)",
      border: "1px solid rgba(255,255,255,0.5)",
      color: "#243447",
      boxShadow: "0 2px 8px rgba(31,41,55,0.08)",
    },
    danger: {
      background: "linear-gradient(135deg, rgba(255,245,245,0.8) 0%, rgba(255,230,230,0.9) 100%)",
      border: "1px solid rgba(255,200,200,0.6)",
      color: "#dc2626",
      boxShadow: "0 4px 16px rgba(220,38,38,0.15)",
    },
  };

  const isIconOnly = !children;

  const baseStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: isIconOnly ? 0 : 6,
    padding: isIconOnly ? "8px" : "8px 16px",
    width: isIconOnly ? "36px" : undefined,
    height: isIconOnly ? "36px" : undefined,
    cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: 8,
    fontWeight: 500,
    fontSize: 13,
    margin: 0,
    verticalAlign: "middle",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    transition: "all 0.2s ease",
    outline: "none",
    ...variantStyles[variant],
    ...style,
  };

  if (disabled) {
    baseStyles.opacity = 0.5;
    baseStyles.pointerEvents = "none";
  }

  return (
    <button
      type={type}
      className={`glassBtn ${className}`}
      onClick={onClick}
      style={baseStyles}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}
