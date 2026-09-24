import { Check, Languages, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tip } from "@/components/ui/tooltip";
import { LANG_NAMES, LANGS, useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** RU / ҚАЗ / EN — changes the UI dictionary and the ?lang= of every API request. */
export function LangSwitcher() {
  const { t, lang, setLang } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-1.5 px-2.5 font-mono text-xs" aria-label={t("lang.label")}>
          <Languages /> {LANG_NAMES[lang].short}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>{t("lang.label")}</DropdownMenuLabel>
        {LANGS.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => setLang(l)} lang={l}>
            <span className="w-9 font-mono text-[11px] text-muted-foreground">{LANG_NAMES[l].short}</span>
            <span className="flex-1">{LANG_NAMES[l].name}</span>
            <Check className={cn("!text-primary", l !== lang && "invisible")} />
          </DropdownMenuItem>
        ))}
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
