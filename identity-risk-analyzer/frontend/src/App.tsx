import { MotionConfig } from "motion/react";
import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { ScanProvider } from "./lib/scan";
import { useTheme } from "./lib/theme";
import { TourProvider } from "./lib/tour";

/** Providers that need the router context (ScanProvider navigates after a scan). */
export default function App() {
  const { theme } = useTheme();
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <ScanProvider>
          <TourProvider>
            <Outlet />
          </TourProvider>
          {/* neutral toasts: status is carried by the icon + text, not by colored backgrounds */}
          <Toaster
            theme={theme}
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "!rounded-card !border-0 !bg-overlay !text-fg !shadow-overlay !font-sans",
                description: "!text-fg-2",
              },
            }}
          />
        </ScanProvider>
      </TooltipProvider>
    </MotionConfig>
  );
}
