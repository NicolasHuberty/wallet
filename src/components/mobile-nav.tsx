"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import {
  LayoutDashboard,
  Wallet,
  ClipboardCheck,
  Receipt,
  TrendingUp,
  Home,
  CircleDollarSign,
  LineChart,
  History,
  Settings,
  MoreHorizontal,
  Menu,
  ChevronRight,
  X,
  Coins,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  short?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

/* -----------------------------------------------------------
 * Navigation taxonomy
 * ---------------------------------------------------------
 * Primary mobile tabs = the 4 destinations used most often,
 * plus a "Plus" tab that opens a sheet with the secondary
 * pages. "Plus" is the only non-route in the bar.
 * ----------------------------------------------------------*/
const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
  { href: "/accounts", label: "Comptes", icon: Wallet },
  { href: "/check-in", label: "Check-in", icon: ClipboardCheck },
  { href: "/expenses", label: "Dépenses", icon: Receipt },
];

const SECONDARY: NavItem[] = [
  { href: "/investments", label: "Investissements", icon: TrendingUp },
  { href: "/real-estate", label: "Immobilier", icon: Home },
  { href: "/charges", label: "Frais one-shot", icon: CircleDollarSign },
  { href: "/projections", label: "Projections", icon: LineChart },
  { href: "/banking", label: "Banques", icon: Building2 },
  { href: "/snapshots", label: "Historique", icon: History },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

/* Quick title map used by the top bar. Keyed by the first segment of
 * the path so nested routes (e.g. /accounts/abc) still read correctly. */
const TITLE_BY_SEGMENT: Record<string, string> = {
  dashboard: "Tableau de bord",
  accounts: "Comptes",
  "check-in": "Check-in mensuel",
  expenses: "Dépenses & revenus",
  charges: "Frais one-shot",
  investments: "Investissements",
  "real-estate": "Immobilier",
  projections: "Projections",
  banking: "Banques",
  snapshots: "Historique",
  settings: "Paramètres",
  onboarding: "Bienvenue",
};

function titleFromPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  return TITLE_BY_SEGMENT[seg ?? ""] ?? "Wallet";
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/* -----------------------------------------------------------
 * Shared bottom sheet (base-ui dialog with a "bottom" side)
 * ---------------------------------------------------------*/
function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Backdrop
          className="fixed inset-0 z-[60] bg-black/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm"
        />
        <SheetPrimitive.Popup
          className={cn(
            "mobile-nav-motion fixed inset-x-0 bottom-0 z-[61] flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-popover text-popover-foreground shadow-2xl",
            "transition duration-200 ease-out",
            "data-starting-style:translate-y-full data-ending-style:translate-y-full"
          )}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="h-1 w-10 rounded-full bg-foreground/15" />
          </div>
          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <SheetPrimitive.Title className="text-base font-semibold tracking-tight">
              {title}
            </SheetPrimitive.Title>
            <SheetPrimitive.Close
              className="tap-target inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Fermer"
            >
              <X className="size-5" strokeWidth={1.75} />
            </SheetPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
            {children}
          </div>
        </SheetPrimitive.Popup>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

function SideSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Backdrop className="fixed inset-0 z-[60] bg-black/30 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm" />
        <SheetPrimitive.Popup
          className={cn(
            "mobile-nav-motion fixed inset-y-0 right-0 z-[61] flex w-[86%] max-w-sm flex-col overflow-hidden border-l border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl",
            "transition duration-200 ease-out",
            "data-starting-style:translate-x-full data-ending-style:translate-x-full"
          )}
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <SheetPrimitive.Title className="text-base font-semibold tracking-tight text-sidebar-foreground">
              {title}
            </SheetPrimitive.Title>
            <SheetPrimitive.Close
              className="tap-target inline-flex items-center justify-center rounded-full text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
              aria-label="Fermer"
            >
              <X className="size-5" strokeWidth={1.75} />
            </SheetPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </SheetPrimitive.Popup>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

/* -----------------------------------------------------------
 * Bottom tab bar — the primary mobile navigation surface
 * ---------------------------------------------------------*/
function BottomTab({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mobile-nav-motion group relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition-colors duration-200 ease-out",
        active ? "text-foreground" : "text-muted-foreground active:text-foreground"
      )}
    >
      {/* Pill backdrop for the active tab — scales in on change. */}
      <span
        aria-hidden
        className={cn(
          "mobile-nav-motion pointer-events-none absolute inset-x-2 top-1 bottom-1 rounded-xl bg-accent/0 transition-all duration-200 ease-out",
          active && "bg-accent/70"
        )}
      />
      <span
        className={cn(
          "mobile-nav-motion relative flex size-7 items-center justify-center transition-transform duration-200 ease-out",
          active ? "scale-[1.06]" : "scale-100"
        )}
      >
        <Icon
          className={cn(
            "size-[22px] transition-[stroke-width,color] duration-200 ease-out",
            active ? "text-foreground" : "text-muted-foreground"
          )}
          strokeWidth={active ? 2.25 : 1.75}
        />
      </span>
      <span
        className={cn(
          "relative max-w-full truncate tracking-tight transition-colors duration-200",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {item.short ?? item.label}
      </span>
    </Link>
  );
}

function PlusTab({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={active}
      className={cn(
        "mobile-nav-motion relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition-colors duration-200 ease-out",
        active ? "text-foreground" : "text-muted-foreground active:text-foreground"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mobile-nav-motion pointer-events-none absolute inset-x-2 top-1 bottom-1 rounded-xl bg-accent/0 transition-all duration-200 ease-out",
          active && "bg-accent/70"
        )}
      />
      <span
        className={cn(
          "mobile-nav-motion relative flex size-7 items-center justify-center transition-transform duration-200 ease-out",
          active ? "scale-[1.06]" : "scale-100"
        )}
      >
        <MoreHorizontal
          className={cn("size-[22px] transition-[stroke-width] duration-200 ease-out")}
          strokeWidth={active ? 2.25 : 1.75}
        />
      </span>
      <span className="relative tracking-tight">Plus</span>
    </button>
  );
}

/* -----------------------------------------------------------
 * Brand row used inside the right drawer header
 * ---------------------------------------------------------*/
function DrawerBrand() {
  return (
    <div className="flex items-center gap-2.5 px-5 pb-2">
      <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Coins className="size-5" strokeWidth={2} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-sidebar-foreground">Patrimoine</span>
        <span className="text-xs text-sidebar-foreground/60">Suivi du net</span>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------
 * Public API — the full mobile app shell
 * ---------------------------------------------------------*/
export function MobileNav({
  summary,
  showDemoOffset = false,
}: {
  /** Rendered <HouseholdSummary /> (server component) shown inside the right drawer. */
  summary?: React.ReactNode;
  /** When the demo banner is present, shift the top bar down by its height. */
  showDemoOffset?: boolean;
}) {
  const pathname = usePathname();
  const [plusOpen, setPlusOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Close sheets on navigation.
  const lastPath = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setPlusOpen(false);
      setDrawerOpen(false);
    }
  }, [pathname]);

  const title = titleFromPath(pathname);
  const secondaryActive = SECONDARY.some((s) => isActive(pathname, s.href));

  return (
    <>
      {/* Slim top bar — sticky, shows current page + menu */}
      <header
        className={cn(
          "mobile-topbar-shadow sticky z-40 flex items-center gap-2 border-b border-border/70 bg-background/85 px-3 supports-backdrop-filter:backdrop-blur md:hidden",
          // Stacked under the demo banner when present; otherwise pinned to top.
          showDemoOffset ? "top-0" : "top-0"
        )}
        style={{
          height: "calc(var(--mobile-top-h) + env(safe-area-inset-top, 0px))",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <Link
          href="/dashboard"
          aria-label="Accueil"
          className="tap-target -ml-2 flex items-center justify-center rounded-full text-foreground"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar text-sidebar-primary-foreground">
            <Coins className="size-[18px]" strokeWidth={2} />
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {title}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Menu du ménage"
          className="tap-target -mr-2 inline-flex items-center justify-center rounded-full text-foreground/80 transition-colors hover:text-foreground"
        >
          <Menu className="size-[22px]" strokeWidth={1.75} />
        </button>
      </header>

      {/* Bottom tab bar — fixed, above safe-area */}
      <nav
        aria-label="Navigation principale"
        className={cn(
          "mobile-nav-motion fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 supports-backdrop-filter:backdrop-blur md:hidden"
        )}
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div
          className="flex items-stretch justify-between px-1"
          style={{ height: "var(--mobile-nav-h)" }}
        >
          {PRIMARY.map((item) => (
            <BottomTab
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
          <PlusTab active={plusOpen || secondaryActive} onClick={() => setPlusOpen(true)} />
        </div>
      </nav>

      {/* "Plus" bottom sheet — secondary destinations */}
      <BottomSheet open={plusOpen} onOpenChange={setPlusOpen} title="Plus">
        <ul className="flex flex-col px-1 py-1">
          {SECONDARY.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch
                  onClick={() => setPlusOpen(false)}
                  className={cn(
                    "mobile-nav-motion flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-200 ease-out",
                    active
                      ? "bg-accent/70 text-foreground"
                      : "text-foreground/90 hover:bg-accent/40 active:bg-accent/60"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
                      active
                        ? "bg-background text-foreground ring-1 ring-border"
                        : "bg-muted/70 text-foreground/80"
                    )}
                  >
                    <Icon
                      className="size-[20px]"
                      strokeWidth={active ? 2.25 : 1.75}
                    />
                  </span>
                  <span className="flex-1 text-[15px] font-medium tracking-tight">
                    {item.label}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.75} />
                </Link>
              </li>
            );
          })}
        </ul>
      </BottomSheet>

      {/* Right drawer — household summary + settings + logout */}
      <SideSheet open={drawerOpen} onOpenChange={setDrawerOpen} title="Ménage">
        <DrawerBrand />
        {summary && <div className="px-3 pt-2">{summary}</div>}
        <div className="mt-4 border-t border-sidebar-border/60" />
        <ul className="flex flex-col gap-0.5 p-3">
          <li>
            <Link
              href="/settings"
              prefetch
              onClick={() => setDrawerOpen(false)}
              className={cn(
                "mobile-nav-motion flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors duration-200",
                isActive(pathname, "/settings")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Settings className="size-4" strokeWidth={1.75} />
              <span>Paramètres</span>
            </Link>
          </li>
        </ul>
      </SideSheet>
    </>
  );
}
