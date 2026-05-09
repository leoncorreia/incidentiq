import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  visible: boolean;
  rootCause?: string | null;
  mitigation?: string | null;
  followupCount?: number;
  onDismiss: () => void;
}

export function ContextRestoredBanner({ visible, rootCause, mitigation, followupCount = 0, onDismiss }: Props) {
  if (!visible) return null;

  return (
    <div className="border-b border-emerald-500/15 bg-emerald-500/[0.06] px-6 py-3 dark:bg-emerald-500/[0.08]">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">HydraDB operational context restored</p>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-300">
              Persistent investigation
            </span>
          </div>
          <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <li className="min-w-0">
              <span className="font-medium text-foreground/80">Root cause</span>
              <p className="mt-0.5 line-clamp-2">{rootCause?.trim() || "—"}</p>
            </li>
            <li className="min-w-0">
              <span className="font-medium text-foreground/80">Mitigation</span>
              <p className="mt-0.5 line-clamp-2">{mitigation?.trim() || "—"}</p>
            </li>
            <li className="min-w-0">
              <span className="font-medium text-foreground/80">Follow-ups in thread</span>
              <p className="mt-0.5">{followupCount} messages</p>
            </li>
          </ul>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0" onClick={onDismiss}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
