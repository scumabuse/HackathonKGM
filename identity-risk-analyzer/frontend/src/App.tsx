import { MotionConfig } from "motion/react";
import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { ScanProvider } from "./lib/scan";
import { useTheme } from "./lib/theme";

/** Providers that need the router context (ScanProvider navigates after a scan). */
export default function App() {
  const { theme } = useTheme();
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <ScanProvider>
          <Outlet />
          <Toaster
            theme={theme}
            position="bottom-right"
            richColors
            toastOptions={{ className: "!rounded-xl !border-fg/10 !bg-popover" }}
          />
        </ScanProvider>
      </TooltipProvider>
    </MotionConfig>
  );
}
