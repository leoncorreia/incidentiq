import { CheckCircle2, MessageCircleQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  visible: boolean;
  rootCause?: string | null;
  mitigation?: string | null;
  followupCount?: number;
  /** Recent user questions from the persisted thread (demos persistence). */
  priorUserQuestions?: string[];
  onDismiss: () => void;
}

export function ContextRestoredBanner({
  visible,
  rootCause,
  mitigation,
  followupCount = 0,
  priorUserQuestions = [],
  onDismiss,
}: Props) {
  if (!visible) return null;

  const questions = priorUserQuestions.filter(Boolean).slice(-4);

  return (
    <div className="border-b border-emerald-500/15 bg-emerald-500/[0.06] px-6 py-3.5 dark:bg-emerald-500/[0.08]">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              HydraDB operational context restored
            </p>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-300">
              Persistent investigation
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Prior analysis, mitigations, uploads, and chat thread were loaded from operational
            memory. Continue where you left off or run a new analysis.
          </p>
          <ul className="grid gap-3 text-xs sm:grid-cols-3">
            <li className="min-w-0 rounded-md bg-background/40 p-2 ring-1 ring-emerald-500/10">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Root cause
              </span>
              <p className="mt-1 line-clamp-3 leading-relaxed text-foreground">
                {rootCause?.trim() || "—"}
              </p>
            </li>
            <li className="min-w-0 rounded-md bg-background/40 p-2 ring-1 ring-emerald-500/10">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Mitigation
              </span>
              <p className="mt-1 line-clamp-3 leading-relaxed text-foreground">
                {mitigation?.trim() || "—"}
              </p>
            </li>
            <li className="min-w-0 rounded-md bg-background/40 p-2 ring-1 ring-emerald-500/10">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Thread
              </span>
              <p className="mt-1 text-foreground">
                <span className="tabular-nums font-medium">{followupCount}</span> messages in
                conversation
              </p>
            </li>
          </ul>
          {questions.length > 0 ? (
            <div className="rounded-md border border-emerald-500/15 bg-background/30 p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageCircleQuestion className="h-3 w-3" />
                Previous follow-up questions
              </div>
              <ul className="space-y-1.5">
                {questions.map((q, i) => (
                  <li
                    key={`${i}-${q.slice(0, 24)}`}
                    className="text-[11px] leading-snug text-foreground/90"
                  >
                    <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">
                      {i + 1}.
                    </span>
                    <span className="line-clamp-2">{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 shrink-0 p-0"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
