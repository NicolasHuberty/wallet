"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

/**
 * Responsive modal primitive:
 *  - Mobile (< `md`):   bottom sheet (slide-up, drag handle, swipe-to-close)
 *  - Desktop (>= `md`): centered dialog
 *
 * Built on top of `@base-ui/react` Dialog → we keep ESC / focus trap / aria
 * semantics. The mode switch is pure CSS media queries so both form-factors
 * render correctly before any JS has hydrated.
 *
 * Backwards-compatibility: accepts an optional `side` prop so legacy call
 * sites that used the old shadcn-style side sheet keep working. On mobile
 * `bottom` is always used.
 */

type SheetMode = "auto" | "sheet" | "dialog";

// ---------------------------------------------------------------------------
// Root / Trigger / Close / Portal / Overlay
// ---------------------------------------------------------------------------

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

type SheetContentProps = SheetPrimitive.Popup.Props & {
  /** Force a display mode. Defaults to `auto` (sheet on mobile, dialog on desktop). */
  mode?: SheetMode;
  /** Desktop max-width tailwind modifier, e.g. `md:max-w-lg`. */
  desktopSize?: string;
  /** Hides the floating close "X" in the corner. */
  showCloseButton?: boolean;
  /**
   * Legacy/compatibility side-sheet support.
   * If set to `left` or `right`, the content slides in from that edge on every
   * viewport. `bottom` is always used on mobile when `mode = "auto"`.
   */
  side?: "left" | "right" | "bottom";
};

function SheetContent({
  className,
  children,
  mode = "auto",
  desktopSize = "md:max-w-lg",
  showCloseButton = true,
  side,
  ...props
}: SheetContentProps) {
  const popupRef = React.useRef<HTMLDivElement | null>(null);
  const mergedRef = useMergedRef(popupRef, props.ref);

  // Forced side-sheet mode (legacy). Keeps the old API alive.
  if (side === "left" || side === "right") {
    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Popup
          data-slot="sheet-content"
          data-side={side}
          className={cn(
            "fixed inset-y-0 z-50 flex w-full max-w-md flex-col gap-4 border-border bg-popover p-0 text-sm text-popover-foreground shadow-xl transition-transform duration-200 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0",
            side === "right" &&
              "right-0 border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
            side === "left" &&
              "left-0 border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && <CornerCloseButton />}
        </SheetPrimitive.Popup>
      </SheetPortal>
    );
  }

  // "auto" | "sheet" | "dialog"
  // On mobile (< md) → bottom sheet; on md+ → centered dialog.
  // Classes are tailored so the same node flips form-factor without JS.
  const mobileSheet =
    mode === "dialog"
      ? // Dialog-only: act as centered modal at every size.
        "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-1.5rem)] max-w-[28rem] rounded-2xl max-h-[90vh] data-[starting-style]:scale-95 data-[ending-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
      : // Mobile: anchored to the bottom, slides up.
        "fixed inset-x-0 bottom-0 w-full max-h-[90vh] rounded-t-2xl data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full";

  const desktopDialog =
    mode === "sheet"
      ? "" // keep bottom-sheet behavior on every viewport
      : // md+ : reset positioning back to centered modal.
        cn(
          "md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[calc(100%-2rem)] md:rounded-2xl md:max-h-[85vh]",
          "md:data-[starting-style]:translate-x-[-50%] md:data-[starting-style]:translate-y-[-48%] md:data-[starting-style]:scale-[0.97] md:data-[starting-style]:opacity-0",
          "md:data-[ending-style]:translate-x-[-50%] md:data-[ending-style]:translate-y-[-48%] md:data-[ending-style]:scale-[0.97] md:data-[ending-style]:opacity-0",
          desktopSize,
        );

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        ref={mergedRef}
        className={cn(
          "z-50 flex flex-col overflow-hidden border border-border bg-popover text-sm text-popover-foreground shadow-2xl outline-none",
          "transition-transform duration-[260ms] ease-out will-change-transform",
          "motion-reduce:transition-none",
          mobileSheet,
          desktopDialog,
          className,
        )}
        {...props}
      >
        {/* Drag handle — visible only when in bottom-sheet form */}
        {mode !== "dialog" && (
          <DragHandle popupRef={popupRef} showOnDesktop={mode === "sheet"} />
        )}
        {children}
        {showCloseButton && <CornerCloseButton />}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function CornerCloseButton() {
  return (
    <SheetPrimitive.Close
      data-slot="sheet-close"
      render={
        <Button
          variant="ghost"
          className="absolute top-2 right-2 rounded-full"
          size="icon-sm"
        />
      }
    >
      <XIcon />
      <span className="sr-only">Fermer</span>
    </SheetPrimitive.Close>
  );
}

// ---------------------------------------------------------------------------
// Drag handle + swipe-to-dismiss
// ---------------------------------------------------------------------------

function DragHandle({
  popupRef,
  showOnDesktop,
}: {
  popupRef: React.MutableRefObject<HTMLDivElement | null>;
  showOnDesktop?: boolean;
}) {
  const startY = React.useRef<number | null>(null);
  const dragging = React.useRef(false);
  const currentDelta = React.useRef(0);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only react to primary pointer (finger / left mouse).
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startY.current = e.clientY;
    dragging.current = true;
    currentDelta.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const el = popupRef.current;
    if (el) el.style.transition = "none";
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || startY.current == null) return;
    const dy = Math.max(0, e.clientY - startY.current);
    currentDelta.current = dy;
    const el = popupRef.current;
    if (el) el.style.transform = `translateY(${dy}px)`;
  }

  function finish(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    const el = popupRef.current;
    if (!el) return;
    const height = el.getBoundingClientRect().height || 600;
    const shouldDismiss = currentDelta.current > Math.min(140, height * 0.25);
    el.style.transition = "";
    if (shouldDismiss) {
      // Find the Close button and trigger it — lets the Dialog state machine
      // handle focus restoration and animation.
      const closeBtn = el.querySelector<HTMLElement>(
        "[data-slot=sheet-close]",
      );
      el.style.transform = "";
      closeBtn?.click();
    } else {
      el.style.transform = "";
    }
    startY.current = null;
    currentDelta.current = 0;
  }

  return (
    <div
      data-slot="sheet-drag-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      className={cn(
        "sticky top-0 z-10 flex shrink-0 cursor-grab touch-none items-center justify-center bg-popover pt-2 pb-1 active:cursor-grabbing",
        !showOnDesktop && "md:hidden",
      )}
      aria-hidden="true"
    >
      <span className="h-1 w-9 rounded-full bg-border" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout parts
// ---------------------------------------------------------------------------

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 px-4 pt-2 pb-3 text-left md:px-5 md:pt-4",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Scrollable body. Use inside a <SheetContent> to get the correct flex layout
 * with a sticky header + sticky footer.
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "flex-1 overflow-y-auto overscroll-contain px-4 pb-4 md:px-5",
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        // Sticky on mobile, honoring safe-area inset for notch phones.
        "sticky bottom-0 z-10 mt-auto flex flex-col-reverse gap-2 border-t border-border bg-popover/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)] backdrop-blur supports-backdrop-filter:bg-popover/80 md:flex-row md:justify-end md:px-5 md:pb-3",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-semibold leading-tight text-foreground md:text-lg",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-xs text-muted-foreground md:text-sm", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function useMergedRef<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return React.useCallback((node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refs);
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
