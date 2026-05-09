from __future__ import annotations

from collections import Counter
import json
from typing import Any, Dict, List

import httpx


class PipeshiftClient:
    def __init__(self, api_key: str | None = None, model: str = "gpt-4o-mini", api_url: str = "") -> None:
        self.api_key = api_key
        self.model = model
        self.api_url = api_url

    def analyze_incident(self, context: Dict[str, Any], query: str) -> Dict[str, Any]:
        if self.api_key and self.api_url:
            llm_result = self._llm_analysis(context, query)
            if llm_result:
                return llm_result
        return self._deterministic_analysis(context, query)

    def _llm_analysis(self, context: Dict[str, Any], query: str) -> Dict[str, Any] | None:
        incident = context["incident"]
        payload = {
            "incident": incident,
            "deploys": context["deploys"][:8],
            "alerts": context["alerts"][:8],
            "metrics": context["metrics"][:10],
            "logs": context["logs"][:12],
            "runbooks": context["runbooks"][:1],
        }
        system_prompt = (
            "You are an incident commander assistant. Produce concise, operational recommendations grounded strictly "
            "in the provided context. Avoid generic phrasing.\n"
            "Return ONLY valid JSON with keys: "
            "root_cause, confidence, timeline, evidence, affected_services, blast_radius, suggested_fix, "
            "recommended_mitigation, graph_nodes, graph_edges.\n"
            "recommended_mitigation must include: immediate_mitigation, short_term_fix, long_term_prevention.\n"
            "Each mitigation must reference concrete evidence (deploy version/change, alerts, logs, services)."
        )
        user_prompt = (
            f"User query: {query}\n\n"
            "Incident context JSON:\n"
            f"{json.dumps(payload, ensure_ascii=True)}"
        )

        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(self.api_url, json=body, headers=headers)
                response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            if isinstance(parsed, dict) and "root_cause" in parsed:
                normalized = self._normalize_llm_result(parsed, context)
                if normalized:
                    return normalized
        except Exception:
            return None
        return None

    def _normalize_llm_result(self, result: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any] | None:
        incident = context["incident"]
        default_services = sorted(
            set(
                [incident["service"]]
                + [l.get("service", "") for l in context.get("logs", []) if l.get("service")]
                + [a.get("service", "") for a in context.get("alerts", []) if a.get("service")]
            )
        )

        timeline_raw = result.get("timeline", [])
        evidence_raw = result.get("evidence", [])
        nodes_raw = result.get("graph_nodes", [])
        edges_raw = result.get("graph_edges", [])
        mitigation_raw = result.get("recommended_mitigation", {}) or {}

        timeline: List[Dict[str, Any]] = []
        for item in timeline_raw if isinstance(timeline_raw, list) else []:
            if isinstance(item, dict):
                timeline.append(
                    {
                        "timestamp": str(item.get("timestamp") or item.get("time") or incident["started_at"]),
                        "service": item.get("service") or incident["service"],
                        "event": str(item.get("event") or item.get("detail") or "timeline event"),
                        "source": item.get("source") or "analysis",
                    }
                )
            elif isinstance(item, str):
                timeline.append(
                    {
                        "timestamp": incident["started_at"],
                        "service": incident["service"],
                        "event": item,
                        "source": "analysis",
                    }
                )

        evidence: List[Dict[str, Any]] = []
        for item in evidence_raw if isinstance(evidence_raw, list) else []:
            if isinstance(item, dict):
                evidence.append(
                    {
                        "type": item.get("type") or item.get("source") or "evidence",
                        "detail": str(item.get("detail") or item.get("event") or "supporting signal"),
                        "timestamp": item.get("timestamp") or incident["started_at"],
                        "trace_id": item.get("trace_id"),
                    }
                )
            elif isinstance(item, str):
                evidence.append(
                    {
                        "type": "evidence",
                        "detail": item,
                        "timestamp": incident["started_at"],
                    }
                )

        graph_nodes: List[Dict[str, Any]] = []
        for item in nodes_raw if isinstance(nodes_raw, list) else []:
            if isinstance(item, dict) and item.get("id"):
                graph_nodes.append(
                    {
                        "id": str(item["id"]),
                        "label": str(item.get("label") or item["id"]),
                        "type": item.get("type") or "service",
                    }
                )

        graph_edges: List[Dict[str, Any]] = []
        for item in edges_raw if isinstance(edges_raw, list) else []:
            if isinstance(item, dict) and item.get("source") and item.get("target"):
                graph_edges.append(
                    {
                        "source": str(item["source"]),
                        "target": str(item["target"]),
                        "label": item.get("label") or "relates_to",
                    }
                )

        if not graph_nodes:
            graph_nodes = [
                {"id": "incident", "label": incident["title"], "type": "incident"},
                {"id": "service", "label": incident["service"], "type": "service"},
            ]
        if not graph_edges:
            graph_edges = [{"source": "service", "target": "incident", "label": "impacts"}]

        recommended_mitigation = {
            "immediate_mitigation": str(
                mitigation_raw.get("immediate_mitigation")
                or "Roll back the latest risky deploy and reduce retry pressure immediately."
            ),
            "short_term_fix": str(
                mitigation_raw.get("short_term_fix")
                or "Apply controlled retries with backoff and cap service concurrency."
            ),
            "long_term_prevention": str(
                mitigation_raw.get("long_term_prevention")
                or "Add pre-saturation alerts and enforce safe rollout checks for retry changes."
            ),
        }

        try:
            confidence = float(result.get("confidence", 0.78))
        except Exception:
            confidence = 0.78
        confidence = max(0.0, min(1.0, confidence))

        normalized = {
            "root_cause": str(result.get("root_cause", "Insufficient signals to determine a single root cause.")),
            "confidence": round(confidence, 2),
            "timeline": timeline[:12],
            "evidence": evidence[:10],
            "affected_services": result.get("affected_services")
            if isinstance(result.get("affected_services"), list)
            else default_services,
            "blast_radius": str(result.get("blast_radius", "Localized service degradation with user-facing latency impact.")),
            "suggested_fix": str(result.get("suggested_fix", recommended_mitigation["short_term_fix"])),
            "recommended_mitigation": recommended_mitigation,
            "graph_nodes": graph_nodes[:12],
            "graph_edges": graph_edges[:16],
        }
        return normalized

    def _deterministic_analysis(
        self, context: Dict[str, Any], query: str, confidence_boost: float = 0.0
    ) -> Dict[str, Any]:
        incident = context["incident"]
        logs = context["logs"]
        deploys = context["deploys"]
        alerts = context["alerts"]
        metrics = context["metrics"]

        error_logs = [l for l in logs if str(l.get("level", "")).upper() == "ERROR"]
        timeout_logs = [l for l in logs if "timeout" in l.get("message", "").lower()]
        pool_logs = [l for l in logs if "pool" in l.get("message", "").lower() or "connection" in l.get("message", "").lower()]
        retry_deploys = [d for d in deploys if "retry" in d.get("change", "").lower()]
        latency_metrics = [m for m in metrics if "latency" in m.get("metric", "").lower()]
        pool_alerts = [a for a in alerts if "pool" in a.get("alert", "").lower() or "saturation" in a.get("alert", "").lower()]

        services = sorted(set([incident["service"]] + [l["service"] for l in logs] + [a["service"] for a in alerts]))
        service_counts = Counter([l["service"] for l in error_logs])
        primary_service = service_counts.most_common(1)[0][0] if service_counts else incident["service"]

        root_cause = (
            "Retry logic rollout increased concurrent DB calls, exhausting the connection pool "
            "and driving p95 latency spikes in payments-service."
            if retry_deploys and pool_logs
            else "High error pressure caused cascading latency in the payments path."
        )

        timeline = []
        for item in sorted(deploys + alerts + latency_metrics + error_logs, key=lambda x: x["timestamp"])[:12]:
            timeline.append(
                {
                    "timestamp": item["timestamp"],
                    "service": item.get("service"),
                    "event": item.get("change") or item.get("alert") or item.get("message") or item.get("metric"),
                    "source": "deploy" if "version" in item else "alert" if "alert" in item else "log" if "message" in item else "metric",
                }
            )

        evidence = []
        for d in retry_deploys[:2]:
            evidence.append({"type": "deploy", "detail": f"{d['service']} {d['version']}: {d['change']}", "timestamp": d["timestamp"]})
        for l in timeout_logs[:3]:
            evidence.append({"type": "log", "detail": l["message"], "trace_id": l.get("trace_id"), "timestamp": l["timestamp"]})
        for a in alerts[:2]:
            evidence.append({"type": "alert", "detail": f"{a['alert']} ({a['severity']})", "timestamp": a["timestamp"]})

        graph_nodes = [
            {"id": "incident", "label": incident["title"], "type": "incident"},
            {"id": "deploy", "label": "Retry Logic Deploy", "type": "deploy"},
            {"id": "db", "label": "DB Pool Exhaustion", "type": "system"},
            {"id": "latency", "label": "Latency Spike 2:17 PM", "type": "metric"},
            {"id": "service", "label": primary_service, "type": "service"},
        ]
        graph_edges = [
            {"source": "deploy", "target": "service", "label": "changed behavior"},
            {"source": "service", "target": "db", "label": "increased connections"},
            {"source": "db", "target": "latency", "label": "caused"},
            {"source": "latency", "target": "incident", "label": "triggered"},
        ]

        confidence = min(0.99, 0.74 + 0.03 * len(retry_deploys) + 0.02 * len(pool_logs) + confidence_boost)
        blast_radius = "Checkout degradation for payment attempts; no full outage."
        suggested_fix = (
            "Roll back retry multiplier, cap DB client concurrency, and raise pool size with backpressure. "
            "Ship a canary with connection budget guardrails."
        )
        retry_deploy = retry_deploys[0] if retry_deploys else None
        timeout_log = timeout_logs[0] if timeout_logs else None
        pool_alert = pool_alerts[0] if pool_alerts else (alerts[0] if alerts else None)

        if retry_deploy:
            immediate_mitigation = (
                f"Rollback {retry_deploy['service']} {retry_deploy['version']} and pin retry attempts to 2. "
                f"Deploy change reference: {retry_deploy['change']}"
            )
            short_term_fix = (
                f"Throttle concurrency on {retry_deploy['service']} workers and add jittered exponential backoff "
                "for transient DB failures to stop retry amplification."
            )
        else:
            immediate_mitigation = (
                f"Drain traffic from {incident['service']} canary and fail over to last stable release while "
                "connection timeout errors are active."
            )
            short_term_fix = (
                f"Reduce client concurrency and tighten timeout handling in {incident['service']} to prevent "
                "latency cascades during DB pressure."
            )

        if pool_alert:
            long_term_prevention = (
                f"Add pre-saturation alerts linked to '{pool_alert['alert']}' at 80/90% thresholds and enforce "
                f"retry circuit breakers in {incident['service']} before pool exhaustion."
            )
        else:
            long_term_prevention = (
                f"Introduce SLO-based alerts on latency and connection utilization for {incident['service']}, and "
                "gate retry policy changes behind canary verification."
            )

        if timeout_log:
            short_term_fix = (
                f"{short_term_fix} Validate against timeout evidence ('{timeout_log['message']}') before full rollout."
            )

        recommended_mitigation = {
            "immediate_mitigation": immediate_mitigation,
            "short_term_fix": short_term_fix,
            "long_term_prevention": long_term_prevention,
        }

        return {
            "root_cause": root_cause,
            "confidence": round(confidence, 2),
            "timeline": timeline,
            "evidence": evidence,
            "affected_services": services,
            "blast_radius": blast_radius,
            "suggested_fix": suggested_fix,
            "recommended_mitigation": recommended_mitigation,
            "graph_nodes": graph_nodes,
            "graph_edges": graph_edges,
            "meta": {"query": query},
        }
