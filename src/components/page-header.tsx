import { cn } from "@/lib/utils";

/**
 * PageHeader.
 *
 * On desktop: the classic padded header row with big title + action.
 * On mobile: the sticky top bar already shows the page title, so we
 * collapse the title size and tighten spacing — subtitle + action
 * remain first-class citizens.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 border-b border-border",
        "px-4 pb-4 pt-4 md:gap-4 md:px-8 md:pb-6 md:pt-8",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {/* Title: large on desktop, muted/medium on mobile to avoid
         *  duplicating the sticky mobile top bar. */}
        <h1 className="hidden text-2xl font-semibold tracking-tight md:block">
          {title}
        </h1>
        <h1 className="md:hidden text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
