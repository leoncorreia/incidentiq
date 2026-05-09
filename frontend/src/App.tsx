import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { TopNav } from "@/components/TopNav";
import { IncidentList } from "@/components/IncidentList";
import { QueryBar } from "@/components/QueryBar";
import { IncidentTimeline } from "@/components/IncidentTimeline";
import { CausalGraph } from "@/components/CausalGraph";
import { RootCausePanel } from "@/components/RootCausePanel";
import { OperationalMemoryPanel } from "@/components/OperationalMemoryPanel";
import { ContextRestoredBanner } from "@/components/ContextRestoredBanner";
import {
  analyzeIncident,
  createWorkspaceIncident,
  getContextSources,
  getIncidents,
  getOperationalMemory,
  getRelatedIncidents,
  persistRunbookToHydra,
  sendIncidentChatMessage,
  startIncidentChat,
  uploadIncidentContext,
} from "@/lib/api";
import type {
  AnalyzeResponse,
  ChatMessage,
  ChatMessageResponse,
  ChatStartResponse,
  ContextSourcesResponse,
  Incident,
  OperationalMemoryResponse,
  RelatedIncidentsResponse,
} from "@/types";
import { AlertCircle, CheckCircle2, Cloud, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const consoleRouteApi = getRouteApi("/console");

const DEMO_QUERY = "Why did latency spike at 2:17 PM?";
const CONNECTOR_NAMES = ["Datadog", "Grafana", "Kubernetes", "CloudWatch", "PagerDuty", "GitHub Deploys"];

function hydraSessionKey(incidentId: string) {
  return `incidentiq-hydra-session-${incidentId}`;
}

function mapConversationHistory(rows: Array<{ role: string; content: string }> | undefined): ChatMessage[] {
  return (rows ?? []).map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: m.content,
  }));
}

function hasRemoteHydradbResume(resume: ChatStartResponse["hydradb_resume"]): boolean {
  if (!resume || typeof resume !== "object") return false;
  return Boolean(
    resume.hydra_cloud && (resume.knowledge != null || resume.memories != null),
  );
}

export default function App() {
  const { demo } = consoleRouteApi.useSearch();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | undefined>();
  const [query, setQuery] = useState(() => (demo ? DEMO_QUERY : ""));

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [contextSources, setContextSources] = useState<ContextSourcesResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadArea, setShowUploadArea] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [connectors, setConnectors] = useState<Array<{ name: string; status: "Connected" | "Syncing"; lastSynced: string }>>([]);
  const [memoryBanner, setMemoryBanner] = useState("Incident memory · HydraDB context layer");
  const [relatedIncidents, setRelatedIncidents] = useState<RelatedIncidentsResponse | null>(null);
  const [operationalMemory, setOperationalMemory] = useState<OperationalMemoryResponse | null>(null);
  const [cumulativeRecall, setCumulativeRecall] = useState({ knowledge: 0, memory: 0 });
  const [lastRecall, setLastRecall] = useState<{ knowledge: number; memory: number } | null>(null);
  const [memoryHints, setMemoryHints] = useState<Record<string, { resumeAvailable: boolean }>>({});
  const [contextBanner, setContextBanner] = useState<{
    visible: boolean;
    rootCause?: string | null;
    mitigation?: string | null;
    followupCount: number;
  } | null>(null);

  const analysisCache = useRef(new Map<string, AnalyzeResponse>());

  useEffect(() => {
    const raw = localStorage.getItem("incidentiq-connectors");
    if (raw) {
      try {
        setConnectors(JSON.parse(raw));
        return;
      } catch {
        // ignore parse error and set defaults
      }
    }
    setConnectors(CONNECTOR_NAMES.map((name) => ({ name, status: "Syncing", lastSynced: "Never" })));
  }, []);

  const refreshContextSources = useCallback(async (incidentId: string) => {
    try {
      const ctx = await getContextSources(incidentId);
      setContextSources(ctx);
      if (ctx.hydra_context_layer === "sqlite") {
        setMemoryBanner((b) =>
          b.toLowerCase().includes("sqlite") ? b : `${b} · Operational context synced`,
        );
      }
    } catch {
      setContextSources(null);
    }
  }, []);

  const loadOperationalMemory = useCallback(async (incidentId: string) => {
    try {
      const om = await getOperationalMemory(incidentId, true);
      setOperationalMemory(om);
    } catch {
      setOperationalMemory(null);
    }
  }, []);

  const applyContextRestoredBanner = useCallback((started: ChatStartResponse) => {
    const la = started.latest_analysis as AnalyzeResponse | null | undefined;
    const hist = started.conversation_history?.length ?? 0;
    if (started.has_analysis || hist > 0 || hasRemoteHydradbResume(started.hydradb_resume)) {
      setContextBanner({
        visible: true,
        rootCause: la?.root_cause,
        mitigation: la?.recommended_mitigation?.immediate_mitigation,
        followupCount: hist,
      });
      window.setTimeout(() => setContextBanner(null), 14000);
    } else {
      setContextBanner(null);
    }
  }, []);

  useEffect(() => {
    setQuery(demo ? DEMO_QUERY : "");
  }, [demo]);

  useEffect(() => {
    setCumulativeRecall({ knowledge: 0, memory: 0 });
    setLastRecall(null);
  }, [activeId]);

  useEffect(() => {
    let cancel = false;
    if (!incidents.length) return;
    (async () => {
      const entries = await Promise.all(
        incidents.map(async (inc) => {
          try {
            const om = await getOperationalMemory(inc.id, false);
            return [inc.id, { resumeAvailable: om.resume_available }] as const;
          } catch {
            return [inc.id, { resumeAvailable: false }] as const;
          }
        }),
      );
      if (!cancel) setMemoryHints(Object.fromEntries(entries));
    })();
    return () => {
      cancel = true;
    };
  }, [incidents]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const list = await getIncidents({ demo });
        if (cancel) return;
        setIncidents(list);
        if (demo && list.length) {
          const demoId = list.find((i) => i.id === "inc_001")?.id ?? list[0].id;
          setActiveId(demoId);
          try {
            const saved = localStorage.getItem(hydraSessionKey(demoId));
            const started = await startIncidentChat({
              incident_id: demoId,
              session_id: saved || undefined,
            });
            if (cancel) return;
            localStorage.setItem(hydraSessionKey(demoId), started.session_id);
            setSessionId(started.session_id);
            setSuggestedPrompts(started.suggested_prompts);
            setMemoryBanner(started.hydra_context_status || "Incident memory · HydraDB");
            setChatMessages(mapConversationHistory(started.conversation_history));
            if (started.latest_analysis) {
              analysisCache.current.set(demoId, started.latest_analysis as AnalyzeResponse);
              setAnalysis(started.latest_analysis as AnalyzeResponse);
            }
            applyContextRestoredBanner(started);
            await refreshContextSources(demoId);
            await loadOperationalMemory(demoId);
          } catch (e) {
            if (!cancel) setChatError(e instanceof Error ? e.message : String(e));
          }
        }
      } catch (e) {
        if (!cancel) setIncidentsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancel) setLoadingIncidents(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [refreshContextSources, demo, applyContextRestoredBanner, loadOperationalMemory]);

  const activeIncident = useMemo(
    () => incidents.find((i) => i.id === activeId),
    [incidents, activeId],
  );

  useEffect(() => {
    let cancel = false;
    if (!activeId) {
      setRelatedIncidents(null);
      return;
    }
    (async () => {
      try {
        const rel = await getRelatedIncidents(activeId);
        if (!cancel) setRelatedIncidents(rel);
      } catch {
        if (!cancel) setRelatedIncidents(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [activeId]);

  const handleSelect = useCallback(async (inc: Incident) => {
    setActiveId(inc.id);
    setAnalysisError(null);
    setChatError(null);
    const cached = analysisCache.current.get(inc.id);
    setAnalysis(cached ?? null);
    try {
      const saved = localStorage.getItem(hydraSessionKey(inc.id));
      const started = await startIncidentChat({
        incident_id: inc.id,
        session_id: saved || undefined,
      });
      localStorage.setItem(hydraSessionKey(inc.id), started.session_id);
      setSessionId(started.session_id);
      setSuggestedPrompts(started.suggested_prompts);
      setMemoryBanner(
        started.hydra_context_status || "Previous investigation context loaded · HydraDB",
      );
      setChatMessages(mapConversationHistory(started.conversation_history));
      applyContextRestoredBanner(started);
      if (started.latest_analysis) {
        analysisCache.current.set(inc.id, started.latest_analysis as AnalyzeResponse);
        setAnalysis(started.latest_analysis as AnalyzeResponse);
      } else {
        setAnalysis(cached ?? null);
      }
      await refreshContextSources(inc.id);
      await loadOperationalMemory(inc.id);
      try {
        const om = await getOperationalMemory(inc.id, false);
        setMemoryHints((h) => ({ ...h, [inc.id]: { resumeAvailable: om.resume_available } }));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setChatError(e instanceof Error ? e.message : String(e));
      setSessionId(null);
      setSuggestedPrompts([]);
      setChatMessages([]);
    }
  }, [refreshContextSources, applyContextRestoredBanner, loadOperationalMemory]);

  const handleResumeFromHydra = useCallback(async () => {
    if (!activeIncident) return;
    await handleSelect(activeIncident);
  }, [activeIncident, handleSelect]);

  const handleCreateInvestigation = useCallback(async () => {
    if (demo) return;
    setIncidentsError(null);
    try {
      const inc = await createWorkspaceIncident();
      setIncidents((prev) => [inc, ...prev]);
      await handleSelect(inc);
    } catch (e) {
      setIncidentsError(e instanceof Error ? e.message : String(e));
    }
  }, [demo, handleSelect]);

  const handleAnalyze = useCallback(async () => {
    if (!activeId || !query.trim()) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      let sid = sessionId;
      if (!sid) {
        const saved = localStorage.getItem(hydraSessionKey(activeId));
        const started = await startIncidentChat({
          incident_id: activeId,
          session_id: saved || undefined,
        });
        sid = started.session_id;
        localStorage.setItem(hydraSessionKey(activeId), started.session_id);
        setSessionId(started.session_id);
        setSuggestedPrompts(started.suggested_prompts);
      }
      const res = await analyzeIncident({
        incident_id: activeId,
        query: query.trim(),
        session_id: sid || undefined,
      });
      if (res.session_id) {
        setSessionId(res.session_id);
        localStorage.setItem(hydraSessionKey(activeId), res.session_id);
      }
      setMemoryBanner(res.hydra_context_status || "HydraDB · analysis persisted to operational memory");
      analysisCache.current.set(activeId, res);
      setAnalysis(res);
      if (res.conversation_history?.length) {
        setChatMessages(mapConversationHistory(res.conversation_history));
      }
      await refreshContextSources(activeId);
      await loadOperationalMemory(activeId);
      try {
        const om = await getOperationalMemory(activeId, false);
        setMemoryHints((h) => ({ ...h, [activeId]: { resumeAvailable: om.resume_available } }));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }, [activeId, query, sessionId, refreshContextSources, loadOperationalMemory]);

  const handleSendFollowup = useCallback(
    async (message: string) => {
      if (!sessionId || !message.trim()) return;
      setChatLoading(true);
      setChatError(null);
      setChatMessages((prev) => [...prev, { role: "user", content: message.trim() }]);
      try {
        const response: ChatMessageResponse = await sendIncidentChatMessage({
          session_id: sessionId,
          message: message.trim(),
        });
        const rk = response.recall_knowledge_chunks ?? 0;
        const rm = response.recall_memory_chunks ?? 0;
        setCumulativeRecall((p) => ({ knowledge: p.knowledge + rk, memory: p.memory + rm }));
        setLastRecall({ knowledge: rk, memory: rm });
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.answer,
            recall: rk + rm > 0 ? { knowledge: rk, memory: rm } : undefined,
          },
        ]);
        if (activeId) void loadOperationalMemory(activeId);
      } catch (e) {
        setChatError(e instanceof Error ? e.message : String(e));
      } finally {
        setChatLoading(false);
      }
    },
    [sessionId, activeId, loadOperationalMemory],
  );

  const handleFilesUpload = useCallback(
    async (files: FileList | null) => {
      if (!activeId || !files || files.length === 0) return;
      setUploading(true);
      setUploadError(null);
      try {
        await uploadIncidentContext(activeId, Array.from(files));
        await refreshContextSources(activeId);
        await loadOperationalMemory(activeId);
        try {
          const om = await getOperationalMemory(activeId, false);
          setMemoryHints((h) => ({ ...h, [activeId]: { resumeAvailable: om.resume_available } }));
        } catch {
          /* ignore */
        }
        setShowUploadArea(false);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
      }
    },
    [activeId, refreshContextSources, loadOperationalMemory],
  );

  const handleSyncRunbook = useCallback(
    async (markdown: string) => {
      if (!activeId) return;
      await persistRunbookToHydra(activeId, markdown, sessionId);
    },
    [activeId, sessionId],
  );

  const connectSource = useCallback((name: string) => {
    const updated = connectors.map((c) =>
      c.name === name ? { ...c, status: "Connected" as const, lastSynced: new Date().toLocaleTimeString() } : c,
    );
    setConnectors(updated);
    localStorage.setItem("incidentiq-connectors", JSON.stringify(updated));
  }, [connectors]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopNav
        onAnalyze={handleAnalyze}
        analyzing={analyzing}
        onUploadClick={() => setShowUploadArea((v) => !v)}
        onConnectClick={() => setShowConnectors(true)}
        memorySubtitle={memoryBanner}
      />

      {contextBanner && (
        <ContextRestoredBanner
          visible={contextBanner.visible}
          rootCause={contextBanner.rootCause}
          mitigation={contextBanner.mitigation}
          followupCount={contextBanner.followupCount}
          onDismiss={() => setContextBanner(null)}
        />
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr_380px] overflow-hidden">
        <IncidentList
          incidents={incidents}
          activeId={activeId}
          onSelect={handleSelect}
          loading={loadingIncidents}
          workspaceMode={!demo}
          onCreateInvestigation={!demo ? handleCreateInvestigation : undefined}
          memoryHints={memoryHints}
        />

        <main className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-border bg-background px-6 py-4">
            {activeIncident ? (
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">
                    {activeIncident.title}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{activeIncident.id}</span>
                    {" · "}
                    {activeIncident.service}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  title="Reload session, analysis, and chat from operational memory"
                  onClick={() => void handleResumeFromHydra()}
                >
                  Resume investigation
                </Button>
              </div>
            ) : (
              <h1 className="mb-3 text-lg font-semibold tracking-tight text-muted-foreground">
                Select an incident
              </h1>
            )}
            <QueryBar
              value={query}
              onChange={setQuery}
              onSubmit={handleAnalyze}
              loading={analyzing}
              disabled={!activeId}
            />
            {showUploadArea && (
              <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Upload className="h-3.5 w-3.5" />
                  Upload Context for <span className="font-mono text-foreground">{activeId || "incident"}</span>
                </div>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-border bg-background px-4 py-6 text-center text-xs text-muted-foreground hover:bg-muted/40">
                  Drag and drop files or click to upload logs/deploys/alerts/runbooks/metrics
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFilesUpload(e.target.files)}
                  />
                </label>
                {uploading && <p className="mt-2 text-xs text-muted-foreground">Parsing and loading context...</p>}
                {uploadError && <p className="mt-2 text-xs text-[color:var(--sev-critical)]">{uploadError}</p>}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {incidentsError && (
              <div className="flex items-start gap-2 rounded-lg border border-[color:var(--sev-critical)]/30 bg-[color:var(--sev-critical)]/5 p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 text-[color:var(--sev-critical)]" />
                <div>
                  <p className="font-medium">Could not load incidents</p>
                  <p className="text-xs text-muted-foreground">{incidentsError}</p>
                </div>
              </div>
            )}
            <OperationalMemoryPanel
              operational={operationalMemory}
              contextSources={contextSources}
              cumulativeRecall={cumulativeRecall}
              lastRecall={lastRecall}
            />
            <section className="rounded-xl border border-border/80 bg-card/80 p-3.5 shadow-[var(--shadow-soft)]">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Event mix
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {Object.entries(contextSources?.counts || {}).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border/50 bg-background/50 px-2 py-1.5">
                    <span className="text-muted-foreground">{k}</span>{" "}
                    <span className="font-medium text-foreground">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-border/40 pt-3">
                <p className="mb-1 text-[10px] text-muted-foreground">Connected connectors</p>
                <div className="flex flex-wrap gap-1.5">
                  {connectors
                    .filter((c) => c.status === "Connected")
                    .map((c) => (
                      <span key={c.name} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        {c.name}
                      </span>
                    ))}
                  {connectors.every((c) => c.status !== "Connected") ? (
                    <span className="text-[10px] text-muted-foreground">None — use Upload Context for demo data</span>
                  ) : null}
                </div>
              </div>
            </section>
            <IncidentTimeline
              events={analysis?.timeline ?? []}
              loading={analyzing}
            />
            <CausalGraph
              nodes={analysis?.graph_nodes ?? []}
              edges={analysis?.graph_edges ?? []}
            />
          </div>
        </main>

        <div className="min-h-0 h-full min-w-0">
          <RootCausePanel
            incidentId={activeId}
            incidentTitle={activeIncident?.title}
            sessionId={sessionId}
            data={analysis}
            loading={analyzing}
            error={analysisError}
            chatMessages={chatMessages}
            chatLoading={chatLoading}
            chatError={chatError}
            suggestedPrompts={suggestedPrompts}
            onSendFollowup={handleSendFollowup}
            onSyncRunbookToHydra={handleSyncRunbook}
            relatedIncidents={relatedIncidents?.related}
          />
        </div>
      </div>
      {showConnectors && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Connect Sources</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowConnectors(false)}>Close</Button>
            </div>
            <div className="space-y-2">
              {connectors.map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-md border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">Last synced: {c.lastSynced}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{c.status}</span>
                    <Button
                      size="sm"
                      className="h-7"
                      onClick={() => connectSource(c.name)}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      Connect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
