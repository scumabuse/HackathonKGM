import { Check, Copy, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts (e.g. http://<lan-ip>)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Copyable PowerShell recommendation. Text only — the tool never executes anything. */
export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-xl border border-fg/[0.08] bg-inset">
      <div className="flex items-center justify-between border-b border-fg/[0.06] px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <TerminalSquare className="size-3.5" /> {t("code.label")}
        </span>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(code)) {
              setCopied(true);
              toast.success(t("code.copiedToast"), { description: t("code.copiedDesc") });
              setTimeout(() => setCopied(false), 1600);
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-fg/10 hover:text-foreground"
          aria-label={t("code.copyAria")}
        >
          {copied ? <Check className="size-3.5 text-risk-fg-low" /> : <Copy className="size-3.5" />}
          {copied ? t("code.copied") : t("code.copy")}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[12.5px] leading-relaxed text-code">
        <code>{code}</code>
      </pre>
    </div>
  );
}
