import { SearchX } from "lucide-react";
import { createBrowserRouter, Link } from "react-router-dom";
import App from "./App";
import { PageShell } from "./components/layout/PageShell";
import { StateBlock } from "./components/States";
import { useI18n } from "./lib/i18n";
import AccountDetail from "./pages/AccountDetail";
import Dashboard from "./pages/Dashboard";
import Findings from "./pages/Findings";
import PlatformHome from "./pages/PlatformHome";
import Settings from "./pages/Settings";

function NotFound() {
  const { t } = useI18n();
  return (
    <StateBlock icon={SearchX} title="404" text={t("states.pageNotFound")}>
      <Link to="/" className="text-13 text-fg-2 transition-colors duration-fast hover:text-fg">
        {t("states.backHome")}
      </Link>
    </StateBlock>
  );
}

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        element: <PageShell />,
        children: [
          { path: "/", element: <PlatformHome /> },
          { path: "/dashboard", element: <Dashboard /> },
          { path: "/findings", element: <Findings /> },
          { path: "/accounts/:objectId", element: <AccountDetail /> },
          { path: "/settings", element: <Settings /> },
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);
