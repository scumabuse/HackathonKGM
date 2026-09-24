import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { ScanProgress } from "@/components/ScanProgress";
import { Backdrop } from "@/components/ui/backdrop";
import { useI18n, type TKey } from "@/lib/i18n";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const TITLES: [RegExp, TKey][] = [
  [/^\/$/, "titles.home"],
  [/^\/dashboard/, "titles.dashboard"],
  [/^\/findings/, "titles.findings"],
  [/^\/accounts\//, "titles.account"],
  [/^\/settings/, "titles.settings"],
];

/** Keeps the exiting page's element while AnimatePresence plays its exit animation. */
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

export function PageShell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const title = t(TITLES.find(([re]) => re.test(pathname))?.[1] ?? "titles.fallback");
  return (
    <div className="flex min-h-screen">
      <Backdrop />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <FrozenOutlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ScanProgress />
    </div>
  );
}
