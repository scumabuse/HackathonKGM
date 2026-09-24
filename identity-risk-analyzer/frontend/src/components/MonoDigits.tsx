/** Renders a localized phrase ("72 находки", "56 событий", "7 мс") with only the numbers in monospace. */
export function MonoDigits({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\d[\d  .,]*\d|\d)/);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-mono">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </span>
  );
}
