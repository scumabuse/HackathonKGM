import { createBrowserRouter, Link } from "react-router-dom";
import App from "./App";
import { PageShell } from "./components/layout/PageShell";
import { useI18n } from "./lib/i18n";
import AccountDetail from "./pages/AccountDetail";
import Dashboard from "./pages/Dashboard";
import Findings from "./pages/Findings";
import PlatformHome from "./pages/PlatformHome";
import Settings from "./pages/Settings";

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="py-24 text-center">
      <div className="font-display text-5xl font-semibold text-primary">404</div>
      <p className="mt-3 text-muted-foreground">{t("states.pageNotFound")}</p>
      <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
        {t("states.backHome")}
      </Link>
    </div>
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
