import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useBackClosableOpen } from "@/hooks/useBackToClose"

/**
 * Dialog root. On phones and tablets the back button closes it (see useBackToClose);
 * pass `disableBackClose` for dialogs whose open state lives in the URL.
 */
const Dialog = ({ open, defaultOpen, onOpenChange, disableBackClose, ...props }) => {
  const [isOpen, setOpen] = useBackClosableOpen({ open, defaultOpen, onOpenChange, disableBackClose })
  return <DialogPrimitive.Root open={isOpen} onOpenChange={setOpen} {...props} />
}

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[110] bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(({ className, children, onInteractOutside, onEscapeKeyDown, ...props }, ref) => {
  const handleInteractOutside = (e) => {
    if (onInteractOutside) {
      onInteractOutside(e);
    } else {
      // Default: prevent closing on outside click
      e.preventDefault();
    }
  };

  const handleEscapeKeyDown = (e) => {
    if (onEscapeKeyDown) {
      onEscapeKeyDown(e);
    }
  };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Mobile & Desktop: flex column so DialogBody scrolls; header/footer fixed; content scrolls behind footer
          "fixed z-[110] flex flex-col w-full border border-border bg-background duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          // Phones: bottom sheet (like the native app's form sheets), clear of the home indicator
          "inset-x-0 bottom-0 top-auto w-[100vw] h-[94dvh] max-h-[94dvh] overflow-hidden rounded-t-2xl rounded-b-none pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] gap-0",
          "max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom",
          // Desktop: centered modal
          "sm:inset-auto sm:left-[50%] sm:top-[2.5vh] sm:translate-x-[-50%] sm:translate-y-0 sm:h-auto",
          "sm:w-[var(--modal-w)] sm:min-w-[min(90vw,20rem)] sm:min-h-[var(--modal-min-h)] sm:max-h-[var(--modal-max-h)] sm:rounded-lg sm:pt-8 sm:pb-6 sm:gap-0",
          "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
          "sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
          "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
          className
        )}
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-[max(1rem,env(safe-area-inset-right))] sm:right-4 rounded-full bg-muted w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center transition-all duration-200 hover:bg-muted/80 hover:scale-110 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none group min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px]">
          <X className="h-5 w-5 sm:h-4 sm:w-4 transition-transform duration-200 group-hover:rotate-[-90deg]" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left flex-shrink-0 px-4 sm:px-6 pt-1 pb-1 sm:pb-2",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

/** Full-bleed separator: extends to modal edges when inside DialogBody */
const SEPARATOR_FULL_BLEED =
  "[&_[role=separator]]:-mx-4 [&_[role=separator]]:w-[calc(100%+2rem)] [&_[role=separator]]:min-w-[calc(100%+2rem)] sm:[&_[role=separator]]:-mx-6 sm:[&_[role=separator]]:w-[calc(100%+3rem)] sm:[&_[role=separator]]:min-w-[calc(100%+3rem)] [&_hr]:-mx-4 [&_hr]:w-[calc(100%+2rem)] [&_hr]:min-w-[calc(100%+2rem)] sm:[&_hr]:-mx-6 sm:[&_hr]:w-[calc(100%+3rem)] sm:[&_hr]:min-w-[calc(100%+3rem)]";

/**
 * Scrollable body for form modals. Wrap form content between DialogHeader and DialogFooter in DialogBody
 * so only this region scrolls when content is long; header and footer stay fixed.
 * Inner wrapper has horizontal padding and full-bleed separators so dividers hit edge-to-edge.
 */
const DialogBody = React.forwardRef(({ className, children, ...rest }, ref) => (
  <div
    ref={ref}
    className={cn("flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1", className)}
    {...rest}
  >
    <div className={cn("px-4 sm:px-6 py-2", SEPARATOR_FULL_BLEED)}>
      {children}
    </div>
  </div>
))
DialogBody.displayName = "DialogBody"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      // Fixed at bottom; content scrolls behind; stack on mobile, row on desktop
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2 flex-shrink-0 px-4 sm:px-6 pt-4 pb-1 sm:pt-5 sm:pb-2 border-t border-border bg-background",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
