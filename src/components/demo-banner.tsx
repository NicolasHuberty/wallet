import { Eye, ArrowUpRight } from "lucide-react";

export function DemoBanner() {
  return (
    <div
      className="flex items-center justify-between gap-3 border-b px-6 py-2.5 text-xs"
      style={{
        background: "linear-gradient(90deg, #2B4A3B 0%, #17301F 100%)",
        borderColor: "#0f1f14",
        color: "#F5EFE3",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(245, 239, 227, 0.12)" }}
        >
          <Eye className="size-3" />
        </span>
        <span className="truncate">
          <span className="font-semibold">Mode démo</span>
          <span className="opacity-70"> · lecture seule · données simulées d&apos;un ménage belge</span>
        </span>
      </div>
      <a
        href="https://wallet.huberty.pro/signup"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors"
        style={{
          background: "#C75C2C",
          color: "#F5EFE3",
        }}
      >
        Créer mon wallet <ArrowUpRight className="size-3" />
      </a>
    </div>
  );
}
