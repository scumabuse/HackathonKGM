import { Languages, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";
import { LANG_NAMES, LANGS, useI18n, type Lang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/** RU / ҚАЗ / EN — a quiet utility: switches the UI dictionary and the ?lang= of every API request. */
export function LangSwitcher() {
  const { t, lang, setLang } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-1.5 px-2.5" aria-label={t("lang.label")}>
          <Languages />
          <span className="font-mono text-12">{LANG_NAMES[lang].short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t("lang.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
          {LANGS.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              <span className="w-8 font-mono text-12 text-fg-3">{LANG_NAMES[l].short}</span>
              {LANG_NAMES[l].name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
