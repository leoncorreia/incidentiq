import { Button } from "@/components/ui/button";
import { Link2, Sparkles, Upload } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface Props {
  onAnalyze?: () => void;
  analyzing?: boolean;
  onUploadClick?: () => void;
  onConnectClick?: () => void;
  /** HydraDB / operational memory status line */
  memorySubtitle?: string | null;
}

export function TopNav({ onAnalyze, analyzing, onUploadClick, onConnectClick, memorySubtitle }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex max-w-[min(100vw-12rem,28rem)] items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
              <span className="text-[11px] font-bold">IQ</span>
            </div>
            <span className="shrink-0 text-sm font-semibold tracking-tight">IncidentIQ</span>
            {memorySubtitle ? (
              <span
                className="truncate rounded-md border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
                title={memorySubtitle}
              >
                {memorySubtitle}
              </span>
            ) : null}
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {["Incidents", "Workflow", "Context"].map((l, i) => (
              <a
                key={l}
                href="#"
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (i === 0
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {l}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onUploadClick} className="h-8 gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            Upload Context
          </Button>
          <Button size="sm" variant="outline" onClick={onConnectClick} className="h-8 gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Connect Sources
          </Button>
          <Button
            size="sm"
            onClick={onAnalyze}
            disabled={analyzing}
            className="h-8 gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {analyzing ? "Analyzing…" : "Analyze Incident"}
          </Button>
        </div>
      </div>
    </header>
  );
}
