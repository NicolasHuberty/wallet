import { Eye, ArrowUpRight } from "lucide-react";

export function DemoBanner() {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b px-3 py-2 text-[11px] md:gap-3 md:px-6 md:py-2.5 md:text-xs"
      style={{
        background: "linear-gradient(90deg, #2B4A3B 0%, #17301F 100%)",
        borderColor: "#0f1f14",
        color: "#F5EFE3",
      }}
    >
      <div className="flex min-w-0 items-center gap-2 md:gap-2.5">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(245, 239, 227, 0.12)" }}
        >
          <Eye className="size-3" />
        </span>
        <span className="truncate">
          <span className="font-semibold">Mode démo</span>
          <span className="hidden opacity-70 sm:inline">
            {" "}· lecture seule · données simulées d&apos;un ménage belge
          </span>
          <span className="opacity-70 sm:hidden"> · lecture seule</span>
        </span>
      </div>
      <a
        href="https://wallet.huberty.pro/signup"
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors md:gap-1.5 md:px-2.5"
        style={{
          background: "#C75C2C",
          color: "#F5EFE3",
        }}
      >
        <span className="hidden sm:inline">Créer mon wallet</span>
        <span className="sm:hidden">Créer</span>
        <ArrowUpRight className="size-3" />
      </a>
    </div>
  );
}
