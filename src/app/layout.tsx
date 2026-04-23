import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { SidebarNav, SidebarBrand } from "@/components/sidebar-nav";
import { HouseholdSummary } from "@/components/household-summary";
import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/demo";
import { DemoBanner } from "@/components/demo-banner";

export const dynamic = "force-dynamic";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Wallet — Open-source net-worth tracker",
  description:
    "Self-hosted personal finance tracker: accounts, investments, real estate, projections. One monthly check-in, your own database.",
  openGraph: {
    title: "Wallet — Open-source net-worth tracker",
    description: "Self-hosted. One monthly check-in. Your database, your rules.",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = DEMO_MODE
    ? null
    : await auth.api.getSession({ headers: await headers() });
  const authed = DEMO_MODE || !!session?.user;

  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        {authed ? (
          <div className="flex min-h-screen">
            <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
              <SidebarBrand />
              <SidebarNav />
              <div className="mt-auto pb-6">
                <HouseholdSummary />
              </div>
            </aside>
            <main className="flex-1 overflow-x-hidden">
              {DEMO_MODE && <DemoBanner />}
              {children}
            </main>
          </div>
        ) : (
          children
        )}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
