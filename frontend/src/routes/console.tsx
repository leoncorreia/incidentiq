import { createFileRoute } from "@tanstack/react-router";
import App from "@/App";

/**
 * Seed incidents from `/incidents?demo=true` unless the URL sets `demo=false`.
 * Defaulting to seed data avoids an empty list when the workspace has no rows (common in preview/prod builds where `import.meta.env.DEV` is false).
 */
function searchDemoFlag(raw: Record<string, unknown>): boolean {
  const v = raw.demo;
  const explicitFalse = v === false || v === 0 || v === "0" || String(v).toLowerCase() === "false";
  if (explicitFalse) return false;
  return true;
}

export const Route = createFileRoute("/console")({
  validateSearch: (raw: Record<string, unknown>) => ({
    demo: searchDemoFlag(raw),
  }),
  head: () => ({
    meta: [
      { title: "Console — IncidentIQ" },
      { name: "description", content: "Analyze incidents with AI-driven root cause reasoning." },
    ],
  }),
  component: App,
});
