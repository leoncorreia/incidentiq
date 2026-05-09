import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Brain,
  GitBranch,
  ListTree,
  Sparkles,
  ShieldAlert,
  Target,
  Lightbulb,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IncidentIQ — Root cause production incidents with long-context AI" },
      {
        name: "description",
        content:
          "IncidentIQ reads logs, deploys, alerts, metrics, and runbooks to reconstruct incident timelines and explain what actually happened.",
      },
      {
        property: "og:title",
        content: "IncidentIQ — Root cause production incidents with long-context AI",
      },
      {
        property: "og:description",
        content:
          "Reconstruct incident timelines and explain what actually happened with long-context AI.",
      },
    ],
  }),
  component: Landing,
});

function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background">
            <span className="text-[11px] font-bold">IQ</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">IncidentIQ</span>
        </Link>
        <div className="w-20" aria-hidden />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,oklch(0.62_0.18_268/0.08),transparent_70%)]"
      />
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-20 text-center">
        <div className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-[var(--shadow-card)]">
          <Sparkles className="h-3 w-3 text-accent" />
          Long-context incident intelligence
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-5xl font-semibold tracking-tight text-foreground md:text-6xl">
          Root cause production incidents with long-context AI
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
          IncidentIQ reads logs, deploys, alerts, metrics, and runbooks to
          reconstruct incident timelines and explain what actually happened.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="h-11 gap-1.5 px-5">
            <Link to="/console">
              Launch Console
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 gap-1.5 px-5">
            <Link to="/console" search={{ demo: true }}>
              View Demo
              <Sparkles className="h-4 w-4 text-accent" />
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No credit card required · Demo uses seed data; uploads replace it for that incident
        </p>

        <div className="mt-16">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <div
        aria-hidden
        className="absolute -inset-x-10 -top-10 bottom-0 rounded-[2rem] bg-gradient-to-b from-foreground/5 to-transparent blur-2xl"
      />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-20px_oklch(0_0_0/0.18)]">
        <div className="flex items-center gap-1.5 border-b border-border bg-sidebar px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="ml-3 font-mono text-[11px] text-muted-foreground">
            incidentiq.app/console
          </span>
        </div>
        <div className="grid grid-cols-[1fr_320px]">
          {/* Timeline */}
          <div className="border-r border-border p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTree className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Timeline</h3>
              </div>
              <span className="rounded-full bg-[color:var(--sev-critical)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--sev-critical)] ring-1 ring-inset ring-[color:var(--sev-critical)]/20">
                Critical
              </span>
            </div>
            <ol className="relative space-y-4 border-l border-border pl-5">
              {[
                { t: "14:14", e: "Deploy: payments-service v2.18.0", s: "ci/cd" },
                { t: "14:17", e: "p99 latency spike on /checkout", s: "api-gateway" },
                { t: "14:18", e: "Postgres connection pool saturated", s: "postgres" },
                { t: "14:21", e: "Auto-rollback initiated", s: "ci/cd" },
              ].map((ev, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-foreground ring-4 ring-card" />
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm">{ev.e}</p>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {ev.t}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{ev.s}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Root cause panel */}
          <div className="bg-sidebar p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Root Cause</h3>
            </div>
            <p className="text-sm leading-relaxed">
              Connection pool exhaustion in payments-service after v2.18.0
              deploy raised default pool size below required concurrency.
            </p>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Confidence</span>
                <span className="font-mono text-foreground">92%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[92%] rounded-full bg-foreground" />
              </div>
            </div>
            <div className="mt-5">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Affected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {["api-gateway", "payments-service", "postgres"].map((s) => (
                  <span
                    key={s}
                    className="rounded-md bg-muted px-2 py-1 font-mono text-[11px]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-5 rounded-md border border-accent/20 bg-accent/5 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <Lightbulb className="h-3 w-3" /> Suggested fix
              </div>
              <p className="text-xs leading-relaxed">
                Restore pool size to 50 in payments-service config and add a
                pool-saturation alert at 80%.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const features = [
  {
    icon: Brain,
    title: "Long-context incident reasoning",
    desc: "Reads the full picture — logs, deploys, alerts, metrics, runbooks — to reason across signals a single dashboard can't connect.",
  },
  {
    icon: ListTree,
    title: "Timeline + evidence reconstruction",
    desc: "Rebuilds a precise sequence of events with the supporting evidence inline, so on-call engineers stop digging through tabs.",
  },
  {
    icon: GitBranch,
    title: "Causal graph of affected services",
    desc: "Maps the failure path across services and dependencies, highlighting where the incident originated and how it spread.",
  },
];

function Features() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Why IncidentIQ
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Stop guessing. Start understanding.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for platform and SRE teams who need answers in minutes, not hours.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[0_8px_30px_-8px_oklch(0_0_0/0.12)]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background">
                <f.icon className="h-4 w-4 text-foreground" />
              </div>
              <h3 className="mt-4 text-base font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,oklch(0.62_0.18_268/0.10),transparent_70%)]"
          />
          <div className="relative">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
              Try a real incident in the console
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Launch the console to bring your own files, or open the guided demo with
              preloaded incident data.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="h-11 gap-1.5 px-5">
                <Link to="/console">
                  Launch Console
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 gap-1.5 px-5">
                <Link to="/console" search={{ demo: true }}>
                  View Demo
                  <Sparkles className="h-4 w-4 text-accent" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />
          © {new Date().getFullYear()} IncidentIQ
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <a href="#" className="hover:text-foreground">Privacy</a>
          <a href="#" className="hover:text-foreground">Terms</a>
          <a href="#" className="hover:text-foreground">Status</a>
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />
      <Hero />
      <Features />
      <CtaBand />
      <Footer />
    </div>
  );
}
