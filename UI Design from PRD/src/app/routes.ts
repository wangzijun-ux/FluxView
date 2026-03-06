import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { ProcessBuilder } from "./components/ProcessBuilder";
import { StaffManagement } from "./components/StaffManagement";
import { SchedulePlanner } from "./components/SchedulePlanner";
import { DispatchManagement } from "./components/DispatchManagement";
import { CostAnalysis } from "./components/CostAnalysis";
import { NotificationManagement } from "./components/NotificationManagement";
import { SettingsPage } from "./components/SettingsPage";
import { UserManagement } from "./components/UserManagement";
import { WorkerView } from "./components/WorkerView";
import { LiveCommand } from "./components/LiveCommand";
import { ProcessSummary } from "./components/ProcessSummary";
import { Login } from "./components/Login";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: "process-builder", Component: ProcessBuilder },
      { path: "live-command", Component: LiveCommand },
      { path: "process-summary", Component: ProcessSummary },
      { path: "staff", Component: StaffManagement },
      { path: "schedule", Component: SchedulePlanner },
      { path: "dispatch", Component: DispatchManagement },
      { path: "cost-analysis", Component: CostAnalysis },
      { path: "notifications", Component: NotificationManagement },
      { path: "user-management", Component: UserManagement },
      { path: "settings", Component: SettingsPage },
      { path: "worker", Component: WorkerView },
    ],
  },
]);