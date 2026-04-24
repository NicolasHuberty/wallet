import { getPrimaryHousehold, getHouseholdMembers, getNetWorth, getCurrentUser } from "@/lib/queries";
import { formatEUR } from "@/lib/format";
import { LogoutButton } from "./logout-button";
import { DEMO_MODE } from "@/lib/demo";
import { cn } from "@/lib/utils";

/**
 * Household summary card.
 *
 * Rendered in two places:
 *  - desktop sidebar bottom (`variant="sidebar"`, default)
 *  - mobile right-drawer sheet (`variant="sheet"`) — slightly
 *    more generous spacing and a larger avatar row.
 */
export async function HouseholdSummary({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "sheet";
} = {}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const h = await getPrimaryHousehold();
  const members = await getHouseholdMembers(h.id);
  const { netWorth } = await getNetWorth(h.id);
  const sheet = variant === "sheet";

  return (
    <div
      className={cn(
        "rounded-xl border border-sidebar-border/60 bg-sidebar-accent/40",
        sheet ? "p-4" : "mx-3 p-3"
      )}
    >
      <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/50">
        Ménage
      </div>
      <div
        className={cn(
          "mt-0.5 font-medium text-sidebar-foreground",
          sheet ? "text-base" : "text-sm"
        )}
      >
        {h.name}
      </div>
      {members.length > 0 && (
        <div className={cn("flex -space-x-2", sheet ? "mt-3" : "mt-2")}>
          {members.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex items-center justify-center rounded-full border-2 border-sidebar font-medium text-white",
                sheet ? "size-9 text-xs" : "size-7 text-[11px]"
              )}
              style={{ backgroundColor: m.color }}
              title={m.name}
            >
              {m.name.charAt(0)}
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "border-t border-sidebar-border/60",
          sheet ? "mt-4 pt-4" : "mt-3 pt-3"
        )}
      >
        <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/50">
          Net worth
        </div>
        <div
          className={cn(
            "numeric mt-0.5 font-semibold text-sidebar-foreground",
            sheet ? "text-2xl" : "text-lg"
          )}
        >
          {formatEUR(netWorth)}
        </div>
      </div>
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-t border-sidebar-border/60",
          sheet ? "mt-4 pt-4" : "mt-3 pt-3"
        )}
      >
        <div className="min-w-0 text-[11px] text-sidebar-foreground/60">
          <div className="truncate">{user.email}</div>
        </div>
        {!DEMO_MODE && <LogoutButton />}
      </div>
    </div>
  );
}
