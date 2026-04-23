import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SidebarNav, SidebarBrand } from "@/components/sidebar-nav";
import { HouseholdSummary } from "@/components/household-summary";
import { Toaster } from "@/components/ui/sonner";

export const dynamic = "force-dynamic";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wallet — Suivi de patrimoine",
  description: "Suivi patrimonial complet : comptes, investissements, immobilier, projections.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
            <SidebarBrand />
            <SidebarNav />
            <div className="mt-auto pb-6">
              <HouseholdSummary />
            </div>
          </aside>
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
