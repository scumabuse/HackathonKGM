import { ExternalLink } from "lucide-react";
import { mitreUrl } from "@/lib/risk";
import type { Finding } from "@/lib/types";

/** Evidence as a clean key → value list: attribute muted, value in mono. The raw AD value is on hover. */
export function EvidenceList({ evidence }: { evidence: Finding["evidence"] }) {
  return (
    <dl className="divide-y divide-line">
      {evidence.map((e, i) => (
        <div key={i} className="grid grid-cols-1 gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
          <dt className="truncate text-13 text-fg-3" title={e.attribute}>
            {e.attribute}
          </dt>
          <dd className="min-w-0 break-words font-mono text-13 text-fg" title={e.raw ? `raw: ${e.raw}` : undefined}>
            {e.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** MITRE ATT&CK technique chips — small, neutral, linked. */
export function MitreTags({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <li key={id}>
          <a
            href={mitreUrl(id)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-6 items-center gap-1 rounded-control bg-fg/[0.06] px-2 font-mono text-12 text-fg-2 transition-colors duration-fast hover:bg-fg/[0.1] hover:text-fg"
          >
            {id} <ExternalLink className="size-3" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
