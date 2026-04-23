"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Home,
  Receipt,
  LineChart,
  Settings,
  Coins,
  History,
  CircleDollarSign,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/check-in", label: "Mise à jour mensuelle", icon: ClipboardCheck },
  { href: "/accounts", label: "Comptes", icon: Wallet },
  { href: "/investments", label: "Investissements", icon: TrendingUp },
  { href: "/real-estate", label: "Immobilier", icon: Home },
  { href: "/expenses", label: "Dépenses & revenus", icon: Receipt },
  { href: "/charges", label: "Frais one-shot", icon: CircleDollarSign },
  { href: "/projections", label: "Projections", icon: LineChart },
  { href: "/snapshots", label: "Historique", icon: History },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <div className="mt-auto" />
      <Link
        href="/settings"
        className={cn(
          "mt-6 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          pathname.startsWith("/settings")
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <Settings className="size-4" strokeWidth={1.75} />
        <span>Paramètres</span>
      </Link>
    </nav>
  );
}

export function SidebarBrand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-5 py-5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Coins className="size-5" strokeWidth={2} />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-sidebar-foreground">Patrimoine</span>
        <span className="text-xs text-sidebar-foreground/60">Suivi du net</span>
      </div>
    </Link>
  );
}
