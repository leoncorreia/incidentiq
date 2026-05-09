import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from "reactflow";
import type { GraphEdge, GraphNode } from "@/types";
import { GitBranch } from "lucide-react";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const FAILURE_PATH = ["api-gateway", "payments-service", "postgres"];

function isFailureEdge(e: GraphEdge): boolean {
  if (e.failure) return true;
  const i = FAILURE_PATH.indexOf(e.source);
  return i !== -1 && FAILURE_PATH[i + 1] === e.target;
}

function nodeStatusClass(status?: string, onPath?: boolean) {
  if (status === "failed" || onPath) {
    return "border-[color:var(--sev-critical)]/40 bg-[color:var(--sev-critical)]/5 text-foreground";
  }
  if (status === "degraded") {
    return "border-[color:var(--sev-high)]/40 bg-[color:var(--sev-high)]/5 text-foreground";
  }
  return "border-border bg-card text-foreground";
}

export function CausalGraph({ nodes, edges }: Props) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const rfNodes: Node[] = nodes.map((n, i) => {
      const onPath = FAILURE_PATH.includes(n.id);
      return {
        id: n.id,
        position: { x: (i % cols) * 200, y: Math.floor(i / cols) * 110 },
        data: { label: n.label || n.id },
        type: "default",
        className: `!rounded-lg !border !px-3 !py-2 !text-xs !font-medium !shadow-sm ${nodeStatusClass(
          n.status,
          onPath,
        )}`,
      };
    });
    const rfEdges: Edge[] = edges.map((e, i) => {
      const fail = isFailureEdge(e);
      return {
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: fail,
        style: {
          stroke: fail ? "var(--sev-critical)" : "var(--border)",
          strokeWidth: fail ? 2 : 1.5,
        },
        labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: fail ? "var(--sev-critical)" : "var(--muted-foreground)",
        },
      };
    });
    return { rfNodes, rfEdges };
  }, [nodes, edges]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Causal Graph</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Highlighted: api-gateway → payments-service → postgres
        </span>
      </header>
      <div className="h-[360px] bg-background">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Run analysis to view causal graph.
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            panOnDrag
          >
            <Background gap={16} size={1} color="var(--border)" />
            <Controls
              showInteractive={false}
              className="!rounded-md !border !border-border !bg-card !shadow-sm"
            />
          </ReactFlow>
        )}
      </div>
    </section>
  );
}
