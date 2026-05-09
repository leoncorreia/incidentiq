import type { AnalyzeResponse, ChatMessage } from "@/types";
import { useCallback, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookMarked,
  ShieldCheck,
  Siren,
  Lightbulb,
  Loader2,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function buildRunbookMarkdown(
  data: AnalyzeResponse,
  incidentId?: string,
  incidentTitle?: string,
): string {
  const when = new Date().toISOString();
  const lines: string[] = [
    `# Incident runbook: ${incidentTitle || "Investigation"}`,
    "",
    `**Incident ID:** \`${incidentId || "n/a"}\`  `,
    `**Generated (UTC):** ${when}`,
    "",
    "## Root cause",
    "",
    data.root_cause,
    "",
    "## Blast radius",
    "",
    data.blast_radius,
    "",
  ];

  if (data.affected_services?.length) {
    lines.push("## Affected services", "");
    data.affected_services.forEach((s) => lines.push(`- \`${s}\``));
    lines.push("");
  }

  const m = data.recommended_mitigation;
  if (m) {
    lines.push(
      "## Recommended mitigation",
      "",
      "### Immediate",
      "",
      m.immediate_mitigation,
      "",
      "### Short-term",
      "",
      m.short_term_fix,
      "",
      "### Long-term",
      "",
      m.long_term_prevention,
      "",
    );
  }

  if (data.evidence?.length) {
    lines.push("## Evidence", "");
    data.evidence.forEach((e) => {
      const label = e.source || e.type || "item";
      lines.push(`- **${label}:** ${e.detail}`);
    });
    lines.push("");
  }

  lines.push("## Suggested fix", "", data.suggested_fix, "");

  return lines.join("\n");
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  incidentId?: string;
  incidentTitle?: string;
  sessionId?: string | null;
  data: AnalyzeResponse | null;
  loading?: boolean;
  error?: string | null;
  chatMessages: ChatMessage[];
  chatLoading?: boolean;
  chatError?: string | null;
  suggestedPrompts: string[];
  onSendFollowup: (message: string) => Promise<void> | void;
  /** Persist generated runbook markdown into HydraDB operational memory */
  onSyncRunbookToHydra?: (markdown: string) => Promise<void>;
  /** Lightweight similarity — service/tags overlap from backend */
  relatedIncidents?: Array<Record<string, unknown>>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Confidence</span>
        <span className="font-mono text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      {children}
    </div>
  );
}

export function RootCausePanel({
  incidentId,
  incidentTitle,
  sessionId: _sessionId,
  data,
  loading,
  error,
  chatMessages,
  chatLoading,
  chatError,
  suggestedPrompts,
  onSendFollowup,
  onSyncRunbookToHydra,
  relatedIncidents,
}: Props) {
  const [followup, setFollowup] = useState("");
  const [runbookOpen, setRunbookOpen] = useState(false);
  const [runbookMd, setRunbookMd] = useState("");
  const [runbookNotice, setRunbookNotice] = useState<string | null>(null);
  const [runbookHydraSyncing, setRunbookHydraSyncing] = useState(false);
  const mitigation = data?.recommended_mitigation;

  const openRunbook = useCallback(() => {
    if (!data) return;
    setRunbookMd(buildRunbookMarkdown(data, incidentId, incidentTitle));
    setRunbookNotice(null);
    setRunbookOpen(true);
  }, [data, incidentId, incidentTitle]);

  const copyRunbook = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(runbookMd);
      setRunbookNotice("Copied to clipboard.");
    } catch {
      setRunbookNotice("Could not copy — select the text manually.");
    }
  }, [runbookMd]);

  const syncRunbookToHydra = useCallback(async () => {
    if (!onSyncRunbookToHydra || !runbookMd.trim()) return;
    setRunbookHydraSyncing(true);
    setRunbookNotice(null);
    try {
      await onSyncRunbookToHydra(runbookMd);
      setRunbookNotice("Operational context synced — runbook stored in HydraDB.");
    } catch {
      setRunbookNotice("Could not sync runbook to HydraDB.");
    } finally {
      setRunbookHydraSyncing(false);
    }
  }, [onSyncRunbookToHydra, runbookMd]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-sidebar">
      <header className="shrink-0 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold">Root Cause Analysis</h2>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Persistent operational agent · follow-ups grounded in HydraDB recall
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-5 touch-pan-y">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-xs">Analyzing incident…</p>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-[color:var(--sev-critical)]/30 bg-[color:var(--sev-critical)]/5 p-4">
            <div className="flex items-center gap-2 text-[color:var(--sev-critical)]">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-medium">Analysis failed</p>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{error}</p>
          </div>
        ) : !data ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No analysis yet</p>
            <p className="max-w-[200px] text-xs text-muted-foreground">
              Ask a question and run analysis to see root cause reasoning here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <Section icon={Target} title="Root Cause">
              <p className="text-sm leading-relaxed text-foreground">
                {data.root_cause}
              </p>
              <ConfidenceBar value={data.confidence} />
            </Section>

            <section className="space-y-3 rounded-lg border border-accent/25 bg-accent/[0.04] p-3.5 shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Continue with Incident Agent
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Follow-ups use saved analysis + HydraDB recall ·{" "}
                    {incidentId ? <span className="font-mono text-foreground/90">{incidentId}</span> : "active incident"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {suggestedPrompts.slice(0, 6).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => onSendFollowup(prompt)}
                    disabled={chatLoading}
                    className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-foreground transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-2.5">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Ask evidence, rollback, or postmortem questions here — scroll below for full mitigation detail.
                  </p>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={`${msg.role}-${idx}`}
                      className={`rounded-md px-2.5 py-2 text-xs ${
                        msg.role === "user"
                          ? "ml-5 bg-muted text-foreground"
                          : "mr-5 border border-border bg-card text-foreground"
                      }`}
                    >
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{msg.role}</p>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.role === "assistant" &&
                        msg.recall &&
                        msg.recall.knowledge + msg.recall.memory > 0 && (
                          <p className="mt-2 border-t border-border/50 pt-2 text-[10px] leading-snug text-muted-foreground">
                            <span className="text-foreground/70">Context recall</span> ·{" "}
                            {msg.recall.knowledge > 0
                              ? `${msg.recall.knowledge} from uploaded knowledge`
                              : null}
                            {msg.recall.knowledge > 0 && msg.recall.memory > 0 ? " · " : null}
                            {msg.recall.memory > 0
                              ? `${msg.recall.memory} from operational memory`
                              : null}
                          </p>
                        )}
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!followup.trim() || chatLoading) return;
                  const message = followup.trim();
                  setFollowup("");
                  onSendFollowup(message);
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={followup}
                  onChange={(e) => setFollowup(e.target.value)}
                  placeholder="Ask a follow-up about this incident..."
                  className="h-8 text-xs"
                />
                <Button size="sm" className="h-8" disabled={!followup.trim() || chatLoading}>
                  {chatLoading ? "..." : "Send"}
                </Button>
              </form>
              {chatError && <p className="text-xs text-[color:var(--sev-critical)]">{chatError}</p>}
            </section>

            {mitigation && (
              <section className="space-y-3 rounded-lg border border-border bg-card p-3.5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <ShieldCheck className="h-3 w-3" />
                    Recommended Mitigation
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={openRunbook}
                  >
                    <BookMarked className="h-3.5 w-3.5" />
                    Generate Runbook
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="rounded-md border border-[color:var(--sev-critical)]/30 bg-[color:var(--sev-critical)]/5 p-2.5">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--sev-critical)]">
                      <Siren className="h-3.5 w-3.5" />
                      Immediate Mitigation
                    </p>
                    <p className="text-xs leading-relaxed text-foreground">{mitigation.immediate_mitigation}</p>
                  </div>

                  <div className="rounded-md border border-[color:var(--sev-high)]/30 bg-[color:var(--sev-high)]/10 p-2.5">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--sev-high)]">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Short-Term Fix
                    </p>
                    <p className="text-xs leading-relaxed text-foreground">{mitigation.short_term_fix}</p>
                  </div>

                  <div className="rounded-md border border-[color:var(--sev-medium)]/30 bg-[color:var(--sev-medium)]/10 p-2.5">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--sev-medium)]">
                      <Activity className="h-3.5 w-3.5" />
                      Long-Term Prevention
                    </p>
                    <p className="text-xs leading-relaxed text-foreground">{mitigation.long_term_prevention}</p>
                  </div>
                </div>
              </section>
            )}

            <Section icon={ShieldAlert} title="Blast Radius">
              <p className="text-sm text-foreground">{data.blast_radius}</p>
            </Section>

            {data.affected_services?.length > 0 && (
              <Section icon={ShieldAlert} title="Affected Services">
                <div className="flex flex-wrap gap-1.5">
                  {data.affected_services.map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {data.evidence?.length > 0 && (
              <Section icon={AlertTriangle} title="Evidence">
                <ul className="space-y-2">
                  {data.evidence.map((e, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-border bg-card p-2.5"
                    >
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {e.source || e.type || "evidence"}
                      </p>
                      <p className="mt-1 text-xs text-foreground">{e.detail}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section icon={Lightbulb} title="Suggested Fix">
              <div className="rounded-md border border-accent/20 bg-accent/5 p-3">
                <p className="text-sm leading-relaxed text-foreground">
                  {data.suggested_fix}
                </p>
              </div>
            </Section>
          </div>
        )}

        {(relatedIncidents?.length ?? 0) > 0 && (
          <section className="mt-6 rounded-lg border border-border/70 bg-card/50 p-3.5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Related past incidents
            </p>
            <p className="mb-2 text-[10px] leading-relaxed text-muted-foreground">
              Ranked from operational workspace memory and seed incidents (service · tags) — reuse mitigations across
              time.
            </p>
            <ul className="space-y-2">
              {relatedIncidents!.slice(0, 5).map((r) => (
                <li
                  key={String(r.id)}
                  className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[11px]"
                >
                  <span className="font-medium text-foreground">{String(r.title ?? r.id)}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{String(r.id)}</span>
                  {typeof r.similarity_score === "number" ? (
                    <span className="ml-2 text-[10px] text-muted-foreground">· {r.similarity_score} match</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {runbookOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="runbook-dialog-title"
          onClick={() => setRunbookOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h3 id="runbook-dialog-title" className="text-sm font-semibold">
                Generated runbook (Markdown)
              </h3>
              <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setRunbookOpen(false)}>
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
                {runbookMd}
              </pre>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
              <Button type="button" size="sm" className="h-8" onClick={() => copyRunbook()}>
                Copy
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() =>
                  downloadMarkdown(`runbook-${incidentId || "incident"}.md`, runbookMd)
                }
              >
                Download .md
              </Button>
              {onSyncRunbookToHydra && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  disabled={runbookHydraSyncing}
                  onClick={() => void syncRunbookToHydra()}
                >
                  {runbookHydraSyncing ? "Syncing…" : "Sync to HydraDB"}
                </Button>
              )}
              {runbookNotice && <span className="text-xs text-muted-foreground">{runbookNotice}</span>}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
