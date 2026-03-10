import { Outlet, useLocation } from "react-router";
import { Sidebar } from "./Sidebar";
import { ThemeProvider, useThemeColors } from "./ThemeContext";
import { AssignmentProvider } from "./AssignmentContext";
import { MasterDataProvider } from "./MasterDataContext";
import { TopBar } from "./TopBar";

function LayoutInner() {
  const location = useLocation();
  const isWorkerView = location.pathname.startsWith("/worker");
  const c = useThemeColors();

  if (isWorkerView) {
    return <Outlet />;
  }

  return (
    <div className={`h-screen flex overflow-hidden ${c.bg} ${c.text}`}>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <footer className={`shrink-0 border-t px-5 py-2 text-center text-[11px] ${c.border} ${c.bgCard} ${c.textMuted}`}>
          powered by Dialog.Inc. Ⓒ 2026 All Rights Reserved.
        </footer>
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <ThemeProvider>
      <MasterDataProvider>
        <AssignmentProvider>
          <LayoutInner />
        </AssignmentProvider>
      </MasterDataProvider>
    </ThemeProvider>
  );
}
