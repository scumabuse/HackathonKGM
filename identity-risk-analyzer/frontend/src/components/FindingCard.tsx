import { ArrowUpRight } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { LEVEL_META, OBJECT_ICON } from "@/lib/risk";
import type { Entity } from "@/lib/types";
import { SpotlightCard } from "./ui/spotlight-card";
import { RiskBadge } from "./RiskBadge";

/** A top-risk object card (spotlight + tilt hover) — click opens the account drilldown. */
export function FindingCard({ entity }: { entity: Entity }) {
  const navigate = useNavigate();
  const { t, objectType, level } = useI18n();
  const meta = LEVEL_META[entity.level];
  const TypeIcon = OBJECT_ICON[entity.object_type];
  const open = () => navigate(`/accounts/${entity.object_id}`);
  return (
    <SpotlightCard
      tilt
      glow={meta.color}
      onClick={open}
      className="p-4"
      role="link"
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && open()}
      aria-label={t("common.cardAria", { name: entity.object_name, score: entity.score, level: level(entity.level) })}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-fg/10 bg-fg/[0.04]">
            <TypeIcon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-mono text-sm font-medium text-foreground">{entity.object_name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {objectType(entity.object_type)}
              {entity.tier0 && " · Tier-0"}
              {entity.enabled === false && ` · ${t("common.disabledLower")}`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold leading-none text-foreground">{entity.score}</div>
          <div className="mt-1">
            <RiskBadge level={entity.level} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">
          {entity.top_title}
          {entity.finding_count > 1 && <span className="text-foreground/70"> · {t("common.moreCount", { n: entity.finding_count - 1 })}</span>}
        </p>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
      </div>
      {entity.privilege_path && (
        <div className="mt-2 truncate font-mono text-[10.5px] text-primary/80">{entity.privilege_path.join(" → ")}</div>
      )}
    </SpotlightCard>
  );
}
