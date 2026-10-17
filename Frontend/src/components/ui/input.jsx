import * as React from "react"

import { cn } from "@/lib/utils"
import { inputFontSizeClass } from "@/lib/inputFontSize"

const Input = React.forwardRef(({ className, type, onFocus, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        inputFontSizeClass(className),
        // Mobile: larger touch target (min 44px height)
        "min-h-[44px] md:min-h-[40px]",
        className
      )}
      ref={ref}
      onFocus={(e) => {
        if (type === "number") {
          e.target.select();
        }
        onFocus?.(e);
      }}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
