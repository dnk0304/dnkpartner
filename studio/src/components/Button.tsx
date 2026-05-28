import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-50 active:scale-95 hover:scale-105",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] rounded-full",
        gradient:
          "text-white hover:opacity-90 shadow-md hover:shadow-lg rounded-full",
        playful:
          "text-white hover:opacity-90 shadow-lg rounded-full border-2 border-transparent",
        cta:
          "text-white hover:opacity-90 shadow-md hover:shadow-lg animate-glow rounded-full",
        outline:
          "border-2 border-[var(--color-border)] bg-transparent text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-primary)] rounded-full",
        ghost:
          "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] rounded-lg",
        secondary:
          "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-full",
        destructive:
          "bg-[var(--color-error)] text-white hover:opacity-90 shadow-md rounded-full",
        success:
          "bg-[var(--color-success)] text-white hover:opacity-90 shadow-md rounded-full",
        link:
          "text-[var(--color-primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-5 py-2",
        sm: "h-8 px-4 text-xs",
        lg: "h-11 px-7",
        icon: "h-9 w-9 rounded-full",
        "icon-sm": "h-8 w-8 rounded-full",
        "icon-lg": "h-12 w-12 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, style, ...props }, ref) => {
    // Apply gradient backgrounds inline for gradient variants
    const gradientStyle = variant === "gradient" 
      ? { background: "var(--gradient-button)", ...style }
      : variant === "playful"
      ? { background: "var(--gradient-playful)", ...style }
      : variant === "cta"
      ? { background: "var(--gradient-cta)", ...style }
      : style

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={gradientStyle}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
