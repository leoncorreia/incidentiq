import type { Incident, Severity } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

const sevStyles: Record<Severity, string> = {
  critical:
    "bg-[color:var(--sev-critical)]/10 text-[color:var(--sev-critical)] ring-[color:var(--sev-critical)]/20",
  high: "bg-[color:var(--sev-high)]/10 text-[color:var(--sev-high)] ring-[color:var(--sev-high)]/20",
  medium:
    "bg-[color:var(--sev-medium)]/15 text-[color:var(--sev-medium)] ring-[color:var(--sev-medium)]/25",
  low: "bg-[color:var(--sev-low)]/10 text-[color:var(--sev-low)] ring-[color:var(--sev-low)]/20",
  "SEV-1":
    "bg-[color:var(--sev-critical)]/10 text-[color:var(--sev-critical)] ring-[color:var(--sev-critical)]/20",
  "SEV-2":
    "bg-[color:var(--sev-high)]/10 text-[color:var(--sev-high)] ring-[color:var(--sev-high)]/20",
  "SEV-3":
    "bg-[color:var(--sev-medium)]/15 text-[color:var(--sev-medium)] ring-[color:var(--sev-medium)]/25",
  "SEV-4":
    "bg-[color:var(--sev-low)]/10 text-[color:var(--sev-low)] ring-[color:var(--sev-low)]/20",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
        sevStyles[severity],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {severity}
    </span>
  );
}

function normalizeSeverity(value: string): Severity {
  const raw = value.toLowerCase();
  if (raw === "critical" || value === "SEV-1") return "SEV-1";
  if (raw === "high" || value === "SEV-2") return "SEV-2";
  if (raw === "medium" || value === "SEV-3") return "SEV-3";
  return "SEV-4";
}

function fmtTime(ts: string) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

interface Props {
  incidents: Incident[];
  activeId?: string;
  onSelect: (i: Incident) => void;
  loading?: boolean;
  /** When true, list is user-created investigations only (no bundled demo rows). */
  workspaceMode?: boolean;
  onCreateInvestigation?: () => void;
  /** Per-incident hint from backend operational-memory (lightweight). */
  memoryHints?: Record<string, { resumeAvailable: boolean }>;
  /** Failed GET /incidents (shown in sidebar so the list isn’t mysteriously empty). */
  loadError?: string | null;
}

export function IncidentList({
  incidents,
  activeId,
  onSelect,
  loading,
  workspaceMode,
  onCreateInvestigation,
  memoryHints,
  loadError,
}: Props) {
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold">Incidents</h2>
          <p className="text-xs text-muted-foreground">
            {workspaceMode ? `${incidents.length} open` : `${incidents.length} active`}
          </p>
        </div>
        {workspaceMode && onCreateInvestigation && (
          <Button
            size="sm"
            className="h-8 shrink-0 gap-1 px-2.5 text-xs"
            onClick={() => onCreateInvestigation()}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {loadError && !loading ? (
          <div className="mx-3 mt-3 rounded-lg border border-[color:var(--sev-critical)]/35 bg-[color:var(--sev-critical)]/5 p-3 text-left">
            <p className="text-xs font-medium text-[color:var(--sev-critical)]">
              Could not load incidents
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{loadError}</p>
          </div>
        ) : null}
        {loading && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}
        {!loading && incidents.length === 0 && (
          <div className="px-5 py-8 text-left text-sm text-muted-foreground">
            {workspaceMode ? (
              <>
                <p className="font-medium text-foreground">No investigations yet</p>
                <p className="mt-2 text-xs leading-relaxed">
                  Workspace mode only lists investigations created here. Start one, or open the
                  guided demo with bundled seed incidents.
                </p>
                {onCreateInvestigation && (
                  <Button
                    className="mt-4 h-9 w-full gap-1.5 text-xs"
                    onClick={() => onCreateInvestigation()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New investigation
                  </Button>
                )}
                <Button asChild variant="outline" className="mt-2 h-9 w-full text-xs" size="sm">
                  <Link to="/console">Open demo (seed data)</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">No seed incidents</p>
                <p className="mt-2 text-xs leading-relaxed">
                  The API returned an empty list for demo mode. Confirm{" "}
                  <span className="font-mono">GET /incidents?demo=true</span> and{" "}
                  <span className="font-mono">backend/data/incidents.json</span>.
                </p>
                <Button asChild variant="outline" className="mt-4 h-9 w-full text-xs" size="sm">
                  <Link to="/console">Retry</Link>
                </Button>
              </>
            )}
          </div>
        )}
        {!loading && incidents.length > 0 ? (
          <ul className="space-y-1.5 p-2">
            {incidents.map((inc) => {
              const active = inc.id === activeId;
              const mem = memoryHints?.[inc.id]?.resumeAvailable;
              return (
                <li key={inc.id}>
                  <div
                    className={cn(
                      "group relative flex gap-1 rounded-lg transition-colors",
                      active
                        ? "bg-card shadow-[var(--shadow-card)] ring-1 ring-border/60"
                        : "hover:bg-muted/60",
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelect(inc)}
                      className="min-w-0 flex-1 px-3 py-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-medium leading-snug">{inc.title}</p>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <SeverityBadge severity={normalizeSeverity(inc.severity)} />
                          {mem ? (
                            <span
                              className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-400"
                              title="Operational memory: analysis, uploads, or HydraDB state exists for this incident"
                            >
                              Memory available
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {inc.service}
                        </span>
                        <span>·</span>
                        <span>{fmtTime(inc.started_at || inc.timestamp || "")}</span>
                      </div>
                    </button>
                    {mem ? (
                      <div className="flex shrink-0 flex-col justify-center pr-2">
                        <button
                          type="button"
                          onClick={() => onSelect(inc)}
                          className="rounded-md border border-emerald-500/25 bg-emerald-500/[0.07] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900 shadow-sm transition hover:bg-emerald-500/15 dark:text-emerald-300"
                          title="Reload analysis, chat, and mitigations from operational memory"
                        >
                          Resume
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
