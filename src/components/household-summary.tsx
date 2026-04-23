import { getPrimaryHousehold, getHouseholdMembers, getNetWorth, getCurrentUser } from "@/lib/queries";
import { formatEUR } from "@/lib/format";
import { LogoutButton } from "./logout-button";
import { DEMO_MODE } from "@/lib/demo";

export async function HouseholdSummary() {
  const user = await getCurrentUser();
  if (!user) return null;

  const h = await getPrimaryHousehold();
  const members = await getHouseholdMembers(h.id);
  const { netWorth } = await getNetWorth(h.id);
  return (
    <div className="mx-3 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 p-3">
      <div className="text-xs uppercase tracking-wider text-sidebar-foreground/50">Ménage</div>
      <div className="mt-0.5 text-sm font-medium text-sidebar-foreground">{h.name}</div>
      {members.length > 0 && (
        <div className="mt-2 flex -space-x-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex size-7 items-center justify-center rounded-full border-2 border-sidebar text-[11px] font-medium text-white"
              style={{ backgroundColor: m.color }}
              title={m.name}
            >
              {m.name.charAt(0)}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 border-t border-sidebar-border/60 pt-3">
        <div className="text-xs uppercase tracking-wider text-sidebar-foreground/50">Net worth</div>
        <div className="numeric mt-0.5 text-lg font-semibold text-sidebar-foreground">{formatEUR(netWorth)}</div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-sidebar-border/60 pt-3">
        <div className="min-w-0 text-[11px] text-sidebar-foreground/60">
          <div className="truncate">{user.email}</div>
        </div>
        {!DEMO_MODE && <LogoutButton />}
      </div>
    </div>
  );
}
