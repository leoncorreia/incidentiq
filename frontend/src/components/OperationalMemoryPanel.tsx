import type { ContextSourcesResponse, OperationalMemoryResponse } from "@/types";
import { Brain, Cloud, Database, FileStack, History, Layers, Sparkles } from "lucide-react";

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

function layerLabel(layer: string | null | undefined): {
  label: string;
  tone: "cloud" | "local" | "fallback";
} {
  if (layer === "hydra_cloud")
    return { label: "HydraDB cloud + durable local state", tone: "cloud" };
  if (layer === "memory_fallback") return { label: "Local in-memory (fallback)", tone: "fallback" };
  return { label: "Local persistence (SQLite) · ready for HydraDB sync", tone: "local" };
}

interface Props {
  operational: OperationalMemoryResponse | null;
  contextSources: ContextSourcesResponse | null;
  cumulativeRecall: { knowledge: number; memory: number };
  lastRecall: { knowledge: number; memory: number } | null;
}

export function OperationalMemoryPanel({
  operational,
  contextSources,
  cumulativeRecall,
  lastRecall,
}: Props) {
  const layer = layerLabel(operational?.hydra_context_layer ?? contextSources?.hydra_context_layer);
  const artifacts =
    operational?.uploaded_artifact_count ?? contextSources?.uploaded_files?.length ?? 0;
  const events = operational?.total_events ?? contextSources?.total_events ?? 0;
  const tokens =
    operational?.context_tokens_estimate ?? contextSources?.context_tokens_estimate ?? 0;
  const cloud = operational?.hydra_cloud_active ?? false;
  const remoteK = operational?.hydra_remote_knowledge_items ?? 0;
  const remoteM = operational?.hydra_remote_memory_items ?? 0;
  const sessionK = cumulativeRecall.knowledge;
  const sessionM = cumulativeRecall.memory;
  const totalRecallK = remoteK + sessionK;
  const totalRecallM = remoteM + sessionM;
  const hasPriorSummary = Boolean(
    operational?.previous_root_cause || operational?.previous_mitigation_summary,
  );
  const memoryActive =
    operational?.resume_available ||
    artifacts > 0 ||
    operational?.has_analysis ||
    totalRecallK + totalRecallM > 0;

  return (
    <section className="rounded-xl border border-border/70 bg-gradient-to-b from-card via-card to-card/95 p-4 shadow-[var(--shadow-card)] ring-1 ring-border/40">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] ring-1 ring-border">
            <Brain className="h-4 w-4 text-foreground/85" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                Operational memory
              </h3>
              <span className="rounded-md bg-muted/80 px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground ring-1 ring-border/60">
                HydraDB context layer
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Persistent reasoning across uploads, analysis, and follow-up — resumes after refresh.
            </p>
          </div>
        </div>
        <div
          className={
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ring-1 ring-inset " +
            (layer.tone === "cloud"
              ? "bg-emerald-500/[0.09] text-emerald-800 ring-emerald-500/20 dark:text-emerald-400"
              : layer.tone === "fallback"
                ? "bg-amber-500/10 text-amber-900 ring-amber-500/25 dark:text-amber-400"
                : "bg-muted/90 text-muted-foreground ring-border")
          }
          title={layer.label}
        >
          {cloud ? (
            <Cloud className="h-3 w-3 opacity-90" />
          ) : (
            <Database className="h-3 w-3 opacity-80" />
          )}
          {cloud ? "Cloud connected" : "Local layer"}
        </div>
      </div>

      {memoryActive ? (
        <div className="mb-3 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2 dark:bg-emerald-500/[0.07]">
          <p className="text-[11px] font-medium text-emerald-900 dark:text-emerald-100/90">
            Operational memory active
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-emerald-900/75 dark:text-emerald-200/70">
            {artifacts} uploaded artifact{artifacts !== 1 ? "s" : ""}
            {totalRecallK > 0 || totalRecallM > 0
              ? ` · ${totalRecallK} knowledge index${totalRecallK !== 1 ? "es" : ""} · ${totalRecallM} memory object${totalRecallM !== 1 ? "s" : ""}`
              : ""}
            {operational?.has_analysis ? " · prior investigation on file" : ""}
            {hasPriorSummary ? " · previous mitigation recoverable" : ""}
            {operational?.last_analysis_at
              ? ` · last analyzed ${relativeTime(operational.last_analysis_at)}`
              : ""}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">{layer.label}</p>
      )}

      <div className="mb-3">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3 w-3" />
          Context metrics
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Artifacts and events</p>
            <p className="text-[12px] font-medium tabular-nums text-foreground">
              {artifacts} files · {events.toLocaleString()} events
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
            <p className="text-[10px] text-muted-foreground">Approx. context size</p>
            <p className="text-[12px] font-medium tabular-nums text-foreground">
              ~{tokens.toLocaleString()} tokens
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 sm:col-span-2">
            <p className="text-[10px] text-muted-foreground">Recall footprint (index + session)</p>
            <p className="text-[12px] font-medium tabular-nums text-foreground">
              {totalRecallK} knowledge chunks · {totalRecallM} operational memories
              {lastRecall && (lastRecall.knowledge > 0 || lastRecall.memory > 0) ? (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                  (last reply: {lastRecall.knowledge}k / {lastRecall.memory}m)
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      <ul className="mb-3 grid gap-2 sm:grid-cols-2">
        <li className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/35 px-3 py-2">
          <FileStack className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[11px] font-medium text-foreground">
              {artifacts} uploaded artifacts
            </p>
            <p className="text-[10px] text-muted-foreground">Parsed into investigation context</p>
          </div>
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/35 px-3 py-2">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[11px] font-medium text-foreground">
              {operational?.has_analysis ? "Prior investigation found" : "No saved analysis yet"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Last analyzed {relativeTime(operational?.last_analysis_at)}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/35 px-3 py-2 sm:col-span-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[11px] font-medium text-foreground">
              {sessionK + sessionM > 0
                ? `This session: ${sessionK} knowledge · ${sessionM} memory (chat recall)`
                : "Follow-up chat pulls HydraDB knowledge + operational memory"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Cumulative across follow-ups in this console session
            </p>
          </div>
        </li>
      </ul>

      {(operational?.previous_root_cause || operational?.previous_mitigation_summary) && (
        <div className="space-y-2 rounded-lg border border-border/55 bg-muted/25 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recovered from persistence
          </p>
          {operational.previous_root_cause ? (
            <div>
              <p className="text-[10px] font-medium text-foreground/80">Previous root cause</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground line-clamp-4">
                {operational.previous_root_cause}
              </p>
            </div>
          ) : null}
          {operational.previous_mitigation_summary ? (
            <div>
              <p className="text-[10px] font-medium text-foreground/80">Previous mitigation</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                {operational.previous_mitigation_summary}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {contextSources?.uploaded_files?.length ? (
        <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto border-t border-border/40 pt-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Recent uploads
          </p>
          {contextSources.uploaded_files.slice(-8).map((f) => (
            <li key={`${f.name}-${f.size_bytes}`} className="text-[10px] text-muted-foreground">
              <span className="font-mono text-foreground/90">{f.name}</span> · {f.kind} ·{" "}
              {f.parsed_records} rows
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
