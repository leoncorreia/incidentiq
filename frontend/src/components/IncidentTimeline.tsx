import type { TimelineEvent } from "@/types";
import { Clock } from "lucide-react";

interface Props {
  events: TimelineEvent[];
  loading?: boolean;
}

export function IncidentTimeline({ events, loading }: Props) {
  const displayTime = (ev: TimelineEvent) => ev.time || ev.timestamp || "unknown";

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Timeline</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </header>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No timeline events yet.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-5">
          {events.map((ev, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-foreground ring-4 ring-background" />
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-foreground">{ev.event}</p>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {displayTime(ev)}
                </span>
              </div>
              {ev.service && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {ev.service}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
