/** Fixed page backdrop: faint console grid + slow aurora glows (21st.dev "aurora background" look). */
export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <div className="grid-bg absolute inset-0" />
      {/* glows are dimmer on the light theme (--aurora-strength) */}
      <div className="absolute inset-0" style={{ opacity: "var(--aurora-strength)" }}>
      <div className="absolute -left-40 -top-48 h-[520px] w-[720px] animate-aurora rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.14),transparent)] blur-3xl" />
      <div
        className="absolute -right-48 top-24 h-[480px] w-[640px] animate-aurora rounded-full bg-[radial-gradient(closest-side,hsl(258_80%_62%/0.10),transparent)] blur-3xl"
        style={{ animationDelay: "-7s" }}
      />
      <div
        className="absolute bottom-[-260px] left-1/3 h-[420px] w-[680px] animate-aurora rounded-full bg-[radial-gradient(closest-side,hsl(200_90%_50%/0.08),transparent)] blur-3xl"
        style={{ animationDelay: "-12s" }}
      />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background)/0.75))]" />
    </div>
  );
}
