import { useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/risk";
import type { Dashboard } from "@/lib/types";
import { ChartCard, DataTable, TooltipBox } from "./ChartCard";

const ACCENT = "hsl(var(--primary))";

/** Penalty per category (0–20 cap each). One measure -> one hue; the track shows the cap. */
export function CategoryBar({ scores, matrix }: { scores: Dashboard["category_scores"]; matrix: Dashboard["category_matrix"] }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { t, category } = useI18n();
  const data = CATEGORIES.map((c) => {
    const m = matrix.find((x) => x.category === c);
    return { category: c, label: category(c), penalty: scores[c] ?? 0, findings: m?.total ?? 0, m };
  });

  return (
    <ChartCard
      title={t("charts.penalty")}
      subtitle={t("charts.penaltySub")}
      chart={
        <div className="h-[200px]">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }} barCategoryGap={10}>
              <XAxis type="number" domain={[0, 20]} hide />
              <YAxis
                type="category"
                dataKey="label"
                width={104}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                    <TooltipBox
                      title={d.label}
                      rows={[
                        { key: ACCENT, label: t("charts.penaltyLabel"), value: `−${d.penalty} / 20` },
                        { label: t("charts.findings"), value: d.findings },
                        { label: t("charts.onCritical"), value: d.m?.Critical ?? 0 },
                      ]}
                    />
                  );
                }}
              />
              <Bar
                dataKey="penalty"
                fill={ACCENT}
                barSize={14}
                radius={[0, 4, 4, 0]}
                background={{ fill: "hsl(var(--muted))", radius: 4 } as object}
                isAnimationActive={!reduce}
                animationDuration={1000}
                cursor="pointer"
                onClick={(d) => navigate(`/findings?category=${(d as unknown as { category: string }).category}`)}
              >
                <LabelList
                  dataKey="penalty"
                  position="right"
                  formatter={(v: number) => `−${v}`}
                  style={{ fill: "hsl(var(--foreground))", fontSize: 12, fontFamily: "JetBrains Mono" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <DataTable
          head={[t("charts.category"), t("charts.penaltyLabel"), t("charts.findings"), t("levels.Critical"), t("levels.High")]}
          rows={data.map((d) => [d.label, `−${d.penalty}`, d.findings, d.m?.Critical ?? 0, d.m?.High ?? 0])}
        />
      }
    />
  );
}
