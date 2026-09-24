import { bandFor, type Band } from "./risk";
import type { AnalysisSettings, Category, Finding, RiskLevel } from "./types";

/**
 * Client-side mirror of backend/app/core/risk_engine.py + the aggregation in pipeline.py, used by the
 * "what if" simulator. Pure model: nothing is written to AD or to the backend. With nothing removed it
 * reproduces the stored scan exactly (same formulas, same rounding), which the simulator shows as "now".
 *
 *   object score  = min(100, round(100 · (1 − Π(1 − wᵢ)) · k))
 *   domain score  = 100 − round(Σ_c 20 · (1 − e^(−S_c / τ))),   S_c = Σ wᵢ·kᵢ over the category's findings
 */
const PENALTY_CAP = 20;
const CATEGORIES: Category[] = ["Stale", "Privileged", "Passwords", "Service", "Config"];

const roundHalfUp = (x: number) => Math.floor(x + 0.5 + 1e-9);

export type ScoringParams = Pick<AnalysisSettings, "levels" | "score_tau">;

export interface Outcome {
  score: number;
  band: Band;
  objects: number;
  findings: number;
  levels: Record<RiskLevel, number>;
  penalties: Record<Category, number>;
  /** modelled Object Risk Score per object still at risk (absent = no findings left) */
  scores: Map<string, number>;
}

export function levelFor(score: number, levels: ScoringParams["levels"]): RiskLevel {
  if (score >= levels.critical) return "Critical";
  if (score >= levels.high) return "High";
  if (score >= levels.medium) return "Medium";
  return "Low";
}

/** Re-score the scan as if every finding of the `removed` rules were fixed. */
export function simulate(findings: Finding[], params: ScoringParams, removed: ReadonlySet<string> = new Set()): Outcome {
  const kept = removed.size ? findings.filter((f) => !removed.has(f.rule_id)) : findings;

  const objects = new Map<string, { k: number; rules: Map<string, number> }>();
  const sums = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const f of kept) {
    const o = objects.get(f.object_id) ?? { k: f.k, rules: new Map() };
    o.rules.set(f.rule_id, f.rule_weight);
    objects.set(f.object_id, o);
    sums[f.category] += Math.max(0, f.rule_weight * f.k);
  }

  const levels: Record<RiskLevel, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const scores = new Map<string, number>();
  for (const [id, o] of objects) {
    let remaining = 1;
    for (const w of o.rules.values()) remaining *= 1 - w;
    const s = Math.max(0, Math.min(100, roundHalfUp(100 * (1 - remaining) * o.k)));
    levels[levelFor(s, params.levels)] += 1;
    scores.set(id, s);
  }

  const raw = CATEGORIES.map((c) => (sums[c] > 0 ? PENALTY_CAP * (1 - Math.exp(-sums[c] / params.score_tau)) : 0));
  const score = Math.max(0, Math.min(100, 100 - roundHalfUp(raw.reduce((a, b) => a + b, 0))));
  const penalties = Object.fromEntries(CATEGORIES.map((c, i) => [c, Math.round(raw[i] * 10) / 10])) as Record<Category, number>;

  return { score, band: bandFor(score), objects: objects.size, findings: kept.length, levels, penalties, scores };
}

export interface RuleImpact {
  rule_id: string;
  category: Category;
  findings: number;
  objects: number;
  /** domain-score points gained if only this rule's findings were fixed */
  gain: number;
  /** objects that would drop off the risk list entirely */
  cleared: number;
}

/** Every rule that fired in the scan, with the effect of fixing it alone. Heaviest gain first. */
export function ruleImpacts(findings: Finding[], params: ScoringParams): RuleImpact[] {
  const base = simulate(findings, params);
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) byRule.set(f.rule_id, [...(byRule.get(f.rule_id) ?? []), f]);
  return [...byRule.entries()]
    .map(([rule_id, fs]) => {
      const after = simulate(findings, params, new Set([rule_id]));
      return {
        rule_id,
        category: fs[0].category,
        findings: fs.length,
        objects: new Set(fs.map((f) => f.object_id)).size,
        gain: after.score - base.score,
        cleared: base.objects - after.objects,
      };
    })
    .sort((a, b) => b.gain - a.gain || b.cleared - a.cleared || b.findings - a.findings || a.rule_id.localeCompare(b.rule_id));
}
