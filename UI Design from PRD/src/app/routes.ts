import { createBrowserRouter } from "react-router";
import { Dashboard } from "./components/Dashboard";
import { MasterManagement } from "./components/MasterManagement";
import { WorkflowManagement } from "./components/WorkflowManagement";
import { WorkPerformance } from "./components/WorkPerformance";
import { DispatchManagement } from "./components/DispatchManagement";
import { CostAnalysis } from "./components/CostAnalysis";
import { NotificationManagement } from "./components/NotificationManagement";
import { SettingsPage } from "./components/SettingsPage";
import { UserManagement } from "./components/UserManagement";
import { LiveCommand } from "./components/LiveCommand";
import { SubmissionRecords } from "./components/SubmissionRecords";
import { ProcessSummary } from "./components/ProcessSummary";
import { AttendanceManagement } from "./components/AttendanceManagement";
import { ProtectedLayout, ProtectedLogin, ProtectedWorkerBandView, ProtectedWorkerView } from "./components/ProtectedDemoViews";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: ProtectedLogin,
  },
  {
    path: "/",
    Component: ProtectedLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "master-management", Component: MasterManagement },
      { path: "workflow-management", Component: WorkflowManagement },
      { path: "live-command", Component: LiveCommand },
      { path: "submission-records", Component: SubmissionRecords },
      { path: "process-summary", Component: ProcessSummary },
      { path: "attendance", Component: AttendanceManagement },
      { path: "performance", Component: WorkPerformance },
      { path: "dispatch", Component: DispatchManagement },
      { path: "cost-analysis", Component: CostAnalysis },
      { path: "notifications", Component: NotificationManagement },
      { path: "user-management", Component: UserManagement },
      { path: "settings", Component: SettingsPage },
      { path: "worker", Component: ProtectedWorkerView },
      { path: "worker-band", Component: ProtectedWorkerBandView },
    ],
  },
]);
