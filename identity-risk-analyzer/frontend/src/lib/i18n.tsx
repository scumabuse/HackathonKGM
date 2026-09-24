import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en, { type Dict, type Plural } from "@/locales/en";
import kk from "@/locales/kk";
import ru from "@/locales/ru";
import { setApiLang } from "./api";
import type { Category, ObjectType, RiskLevel } from "./types";

export type Lang = "ru" | "kk" | "en";
export const LANGS: Lang[] = ["ru", "kk", "en"];
const DICTS: Record<Lang, Dict> = { ru, kk, en };
const LOCALES: Record<Lang, string> = { ru: "ru-RU", kk: "kk-KZ", en: "en-GB" };
/** Each language named in itself — the switcher shows these regardless of the current UI language. */
export const LANG_NAMES: Record<Lang, Dict["lang"]> = { ru: ru.lang, kk: kk.lang, en: en.lang };

// Dotted key paths of the dictionary: string leaves for t(), plural leaves for tp().
type StringKeys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends Plural ? never : StringKeys<T[K], `${P}${K}.`>;
}[keyof T & string];
type PluralKeys<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? never : T[K] extends Plural ? `${P}${K}` : PluralKeys<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = StringKeys<Dict>;
export type TPluralKey = PluralKeys<Dict>;
type Vars = Record<string, string | number>;

function lookup(dict: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
}

// Chrome ships trimmed ICU data for kk-KZ (months render as "M09"), so Kazakh dates are formatted by hand (CLDR style).
const KK_MONTHS = ["қаң.", "ақп.", "нау.", "сәу.", "мам.", "мау.", "шіл.", "там.", "қыр.", "қаз.", "қар.", "жел."];
const pad = (n: number) => String(n).padStart(2, "0");
const kkDate = (d: Date) => `${pad(d.getDate())} ${KK_MONTHS[d.getMonth()]}`;
const kkDateTime = (d: Date) => `${d.getFullYear()} ж. ${kkDate(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function readLang(): Lang {
  const l = document.documentElement.lang; // set before first paint by index.html
  return l === "kk" || l === "en" ? l : "ru";
}

interface I18nCtx {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
  tp: (key: TPluralKey, n: number, vars?: Vars) => string;
  level: (l: RiskLevel) => string;
  category: (c: Category) => string;
  objectType: (o: ObjectType) => string;
  trigger: (tr: string) => string;
  fmtDate: (iso: string | null | undefined) => string;
  fmtDateTime: (iso: string | null | undefined) => string;
  timeAgo: (iso: string | null | undefined) => string;
  num: (n: number, decimals?: number) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  setApiLang(lang); // synchronous so the very first queries already carry ?lang=

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem("ira.lang", lang);
    } catch {
      /* storage unavailable — keep the choice for this session only */
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const value = useMemo<I18nCtx>(() => {
    const dict = DICTS[lang];
    const locale = LOCALES[lang];
    const rules = new Intl.PluralRules(locale);
    const t = (key: TKey, vars?: Vars) => {
      const v = lookup(dict, key) ?? lookup(en, key);
      return typeof v === "string" ? interpolate(v, vars) : key;
    };
    const tp = (key: TPluralKey, n: number, vars?: Vars) => {
      const forms = (lookup(dict, key) ?? lookup(en, key)) as Plural | undefined;
      if (!forms) return key;
      const cat = rules.select(n) as keyof Plural;
      return interpolate(forms[cat] ?? forms.other, { n, ...vars });
    };
    const date = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions) => {
      if (!iso) return "—";
      const d = new Date(iso);
      if (lang === "kk") return opts.hour ? kkDateTime(d) : kkDate(d);
      return d.toLocaleString(locale, opts);
    };
    return {
      lang,
      locale,
      setLang,
      t,
      tp,
      level: (l) => dict.levels[l],
      category: (c) => dict.categories[c],
      objectType: (o) => dict.objectTypes[o],
      trigger: (tr) => (dict.triggers as Record<string, string>)[tr] ?? tr,
      fmtDate: (iso) => date(iso, { month: "short", day: "2-digit" }),
      fmtDateTime: (iso) => date(iso, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
      timeAgo: (iso) => {
        if (!iso) return "—";
        const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
        if (s < 45) return t("time.justNow");
        const m = Math.round(s / 60);
        if (m < 60) return t("time.minAgo", { n: m });
        const h = Math.round(m / 60);
        if (h < 36) return t("time.hAgo", { n: h });
        return tp("time.daysAgo", Math.round(h / 24));
      },
      num: (n, decimals = 0) => n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}
