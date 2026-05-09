import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ArrowRight } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function QueryBar({ value, onChange, onSubmit, loading, disabled }: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!loading && !disabled) onSubmit();
      }}
      className="rounded-xl border border-border bg-card p-1.5 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center gap-2">
        <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask a question about this incident…"
          className="h-10 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="sm"
          disabled={loading || disabled || !value.trim()}
          className="h-9 gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
          Analyze
        </Button>
      </div>
    </form>
  );
}
