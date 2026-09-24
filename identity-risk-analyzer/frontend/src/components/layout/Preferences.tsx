import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { LANG_NAMES, LANGS, useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** RU / ҚАЗ / EN — a quiet pill: switches the UI dictionary and the ?lang= of every API request. */
export function LangSwitcher() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="mr-1 flex h-8 items-center rounded-full bg-fg/[0.05] p-0.5" role="radiogroup" aria-label={t("lang.label")}>
      {LANGS.map((l) => (
        <Tip key={l} content={LANG_NAMES[l].name}>
          <button
            type="button"
            role="radio"
            aria-checked={lang === l}
            lang={l}
            onClick={() => setLang(l)}
            className={cn(
              "h-7 rounded-full px-2.5 text-12 font-semibold transition-colors duration-fast",
              lang === l ? "bg-raised text-fg shadow-panel" : "text-fg-3 hover:text-fg",
            )}
          >
            {LANG_NAMES[l].short}
          </button>
        </Tip>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const Icon = theme === "dark" ? Moon : Sun;
  return (
    <Tip content={`${t("theme.label")}: ${t(theme === "dark" ? "theme.dark" : "theme.light")}`}>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={t("theme.toggle")}>
        <Icon />
      </Button>
    </Tip>
  );
}
