import { createFileRoute } from "@tanstack/react-router";
import App from "@/App";

export const Route = createFileRoute("/console")({
  validateSearch: (raw: Record<string, unknown>) => ({
    demo:
      raw.demo === true ||
      raw.demo === 1 ||
      raw.demo === "1" ||
      String(raw.demo).toLowerCase() === "true",
  }),
  head: () => ({
    meta: [
      { title: "Console — IncidentIQ" },
      { name: "description", content: "Analyze incidents with AI-driven root cause reasoning." },
    ],
  }),
  component: App,
});
