import type { ContextSourcesResponse, OperationalMemoryResponse } from "@/types";
import { Brain, Cloud, Database, FileStack, History, Sparkles } from "lucide-react";

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function layerLabel(layer: string | null | undefined): { label: string; tone: "cloud" | "local" | "fallback" } {
  if (layer === "hydra_cloud") return { label: "HydraDB cloud + local state", tone: "cloud" };
  if (layer === "memory_fallback") return { label: "Local in-memory (fallback)", tone: "fallback" };
  return { label: "Local persistence (SQLite)", tone: "local" };
}

interface Props {
  operational: OperationalMemoryResponse | null;
  contextSources: ContextSourcesResponse | null;
  cumulativeRecall: { knowledge: number; memory: number };
  lastRecall: { knowledge: number; memory: number } | null;
}

export function OperationalMemoryPanel({ operational, contextSources, cumulativeRecall, lastRecall }: Props) {
  const layer = layerLabel(operational?.hydra_context_layer ?? contextSources?.hydra_context_layer);
  const artifacts = operational?.uploaded_artifact_count ?? contextSources?.uploaded_files?.length ?? 0;
  const events = operational?.total_events ?? contextSources?.total_events ?? 0;
  const tokens = operational?.context_tokens_estimate ?? contextSources?.context_tokens_estimate ?? 0;
  const cloud = operational?.hydra_cloud_active ?? false;
  const remoteK = operational?.hydra_remote_knowledge_items ?? 0;
  const remoteM = operational?.hydra_remote_memory_items ?? 0;

  return (
    <section className="rounded-xl border border-border/80 bg-gradient-to-b from-card to-card/95 p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/5 ring-1 ring-border">
            <Brain className="h-4 w-4 text-foreground/80" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Operational memory</h3>
            <p className="text-[11px] text-muted-foreground">HydraDB context layer · long-running investigations</p>
          </div>
        </div>
        <div
          className={
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ring-1 ring-inset " +
            (layer.tone === "cloud"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20"
              : layer.tone === "fallback"
                ? "bg-amber-500/10 text-amber-800 dark:text-amber-400 ring-amber-500/25"
                : "bg-muted text-muted-foreground ring-border")
          }
          title={layer.label}
        >
          {cloud ? <Cloud className="h-3 w-3" /> : <Database className="h-3 w-3" />}
          {cloud ? "Cloud active" : "Local layer"}
        </div>
      </div>

      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">{layer.label}</p>

      <ul className="mb-4 grid gap-2 sm:grid-cols-2">
        <li className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
          <FileStack className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[11px] font-medium text-foreground">{artifacts} uploaded artifacts</p>
            <p className="text-[10px] text-muted-foreground">Ingested into operational context</p>
          </div>
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[11px] font-medium text-foreground">
              {operational?.has_analysis ? "Prior investigation on file" : "No saved analysis yet"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Last analyzed {relativeTime(operational?.last_analysis_at)}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[11px] font-medium text-foreground">
              {cumulativeRecall.knowledge + cumulativeRecall.memory > 0
                ? `${cumulativeRecall.knowledge} knowledge · ${cumulativeRecall.memory} memory chunks (session)`
                : "Recall activates on follow-up chat"}
            </p>
            {lastRecall && (lastRecall.knowledge > 0 || lastRecall.memory > 0) ? (
              <p className="text-[10px] text-muted-foreground">
                Last message: {lastRecall.knowledge} knowledge · {lastRecall.memory} memory
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground">Grounded on HydraDB when cloud is configured</p>
            )}
          </div>
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
          <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[11px] font-medium text-foreground">
              ~{tokens.toLocaleString()} tokens · {events.toLocaleString()} events
            </p>
            <p className="text-[10px] text-muted-foreground">Approximate context footprint</p>
          </div>
        </li>
      </ul>

      {(remoteK > 0 || remoteM > 0) && (
        <p className="mb-3 text-[10px] text-muted-foreground">
          HydraDB index: {remoteK} knowledge objects · {remoteM} memory objects for this incident.
        </p>
      )}

      {(operational?.previous_root_cause || operational?.previous_mitigation_summary) && (
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Recovered summary</p>
          {operational.previous_root_cause ? (
            <p className="text-xs leading-relaxed text-foreground line-clamp-3">{operational.previous_root_cause}</p>
          ) : null}
          {operational.previous_mitigation_summary ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
              <span className="font-medium text-foreground/80">Mitigation: </span>
              {operational.previous_mitigation_summary}
            </p>
          ) : null}
        </div>
      )}

      {contextSources?.uploaded_files?.length ? (
        <ul className="mt-3 max-h-24 space-y-1 overflow-y-auto border-t border-border/40 pt-3">
          {contextSources.uploaded_files.slice(-6).map((f) => (
            <li key={`${f.name}-${f.size_bytes}`} className="text-[10px] text-muted-foreground">
              <span className="font-mono text-foreground/90">{f.name}</span> · {f.kind} · {f.parsed_records} rows
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
