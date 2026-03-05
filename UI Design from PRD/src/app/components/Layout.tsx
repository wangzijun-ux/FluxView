import { Outlet, useLocation } from "react-router";
import { Sidebar } from "./Sidebar";
import { ThemeProvider, useThemeColors } from "./ThemeContext";

function LayoutInner() {
  const location = useLocation();
  const isWorkerView = location.pathname.startsWith("/worker");
  const c = useThemeColors();

  if (isWorkerView) {
    return <Outlet />;
  }

  return (
    <div className={`h-screen flex ${c.bg} ${c.text}`}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export function Layout() {
  return (
    <ThemeProvider>
      <LayoutInner />
    </ThemeProvider>
  );
}
