import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            className={cn(
              "flex h-9 w-full appearance-none rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-4 pr-10 py-2 text-sm text-[var(--color-text)] transition-all duration-200",
              "hover:border-[var(--color-primary)] hover:scale-[1.02]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:border-transparent",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            ref={ref}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)] pointer-events-none" />
        </div>
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
