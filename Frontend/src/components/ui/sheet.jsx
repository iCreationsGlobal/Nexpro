import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useBackClosableOpen } from "@/hooks/useBackToClose"

/** Sheet root. On phones and tablets the back button closes it (see useBackToClose). */
const Sheet = ({ open, defaultOpen, onOpenChange, disableBackClose, ...props }) => {
  const [isOpen, setOpen] = useBackClosableOpen({ open, defaultOpen, onOpenChange, disableBackClose })
  return <SheetPrimitive.Root open={isOpen} onOpenChange={setOpen} {...props} />
}

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-[110] bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-[110] gap-4 border-border bg-background p-6 transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 min-w-[30vw] border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 min-w-[30vw] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

/** Full-bleed separators in sheets (p-6): extend to drawer edges */
const SHEET_SEPARATOR_FULL_BLEED =
  "[&_[role=separator]]:-mx-6 [&_[role=separator]]:w-[calc(100%+3rem)] [&_[role=separator]]:min-w-[calc(100%+3rem)] [&_hr]:-mx-6 [&_hr]:w-[calc(100%+3rem)] [&_hr]:min-w-[calc(100%+3rem)]";

const SheetContent = React.forwardRef(({ side = "right", className, children, showOverlay = true, hideClose = false, ...props }, ref) => (
  <SheetPortal>
    {showOverlay && <SheetOverlay />}
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), SHEET_SEPARATOR_FULL_BLEED, className)}
      {...props}
    >
      {children}
      {!hideClose && <SheetPrimitive.Close className="absolute right-4 top-4 rounded-full bg-muted w-8 h-8 flex items-center justify-center transition-all duration-200 hover:bg-muted/80 hover:scale-110 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none group">
        <X className="h-4 w-4 transition-transform duration-200 group-hover:rotate-[-90deg]" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>}
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 flex-shrink-0 pt-4 border-t border-border bg-background",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
