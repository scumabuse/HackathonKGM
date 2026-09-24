import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { ScanProgress } from "@/components/ScanProgress";
import { pageMotion } from "@/lib/motion";
import { Sidebar } from "./Sidebar";
import { Topbar, type Chrome } from "./Topbar";

/**
 * Exactly one primary action per screen:
 *  - landing: the hero owns "Run scan", so the top bar hides it;
 *  - findings: the toolbar owns Export (filter-aware), so the top bar hides its own;
 *  - settings: "Save & re-score" is the primary, so "Run scan" steps down to secondary.
 */
const CHROME: [RegExp, Chrome][] = [
  [/^\/$/, { run: "hidden", export: true }],
  [/^\/findings/, { run: "primary", export: false }],
  [/^\/settings/, { run: "secondary", export: true }],
];
const DEFAULT_CHROME: Chrome = { run: "primary", export: true };

/** Keeps the exiting page's element while AnimatePresence plays its exit animation. */
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

export function PageShell() {
  const { pathname } = useLocation();
  const chrome = CHROME.find(([re]) => re.test(pathname))?.[1] ?? DEFAULT_CHROME;
  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar chrome={chrome} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={pathname} {...pageMotion}>
              <FrozenOutlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ScanProgress />
    </div>
  );
}
