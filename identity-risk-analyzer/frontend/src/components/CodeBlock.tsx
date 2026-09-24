import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";

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

/** Copyable PowerShell recommendation — text only, the tool never executes anything. The copy action is quiet. */
export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  return (
    <div className="rounded-control bg-base">
      <div className="flex items-center justify-between gap-3 py-1 pl-3 pr-1">
        <span className="truncate text-12 text-fg-3">{t("code.label")}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-12"
          aria-label={t("code.copyAria")}
          onClick={async () => {
            if (await copyText(code)) {
              setCopied(true);
              toast.success(t("code.copiedToast"), { description: t("code.copiedDesc") });
              setTimeout(() => setCopied(false), 1600);
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t("code.copied") : t("code.copy")}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap break-words px-3 pb-3 font-mono text-13 text-fg-2">
        <code>{code}</code>
      </pre>
    </div>
  );
}
