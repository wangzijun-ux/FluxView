import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Delete,
  KeyRound,
  LogIn,
  LogOut,
  Megaphone,
  Minus,
  Pause,
  Play,
  Plus,
  Send,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import { readDeploymentWorkers } from "./fieldDeploymentStore";
import { processColorClasses } from "./processStore";
import { readUsersFromStorage, type User } from "./userStore";
import {
  buildWorkerDayTasks,
  buildWorkerSiteDeploymentData,
  clearWorkerAuthSession,
  getPausedMinutes,
  getWorkerTaskLastReportedAt,
  getWorkerTaskReportedQuantity,
  getWorkerTaskSubmissionLogs,
  getTodayKey,
  getVisibleWorkerNotifications,
  pickFallbackWorkerId,
  readWorkerAuthSession,
  readWorkerProgress,
  resolveDemoWorkerId,
  saveWorkerAuthSession,
  saveWorkerProgress,
  saveWorkerSession,
  type WorkerAuthSession,
  type WorkerTaskProgressEntry,
} from "./workerMobileStore";

const DEMO_PASSWORD = "1234";

interface WorkerLoginUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  status: "active" | "inactive" | "locked";
}

function formatTimeRange(startTime: string, endTime: string) {
  return `${startTime} - ${endTime}`;
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;
  if (hours > 0) return `${hours}時間${restMinutes}分`;
  return `${restMinutes}分`;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatCount(value: number) {
  return `${value.toLocaleString("ja-JP")}件`;
}

function getTaskStatusClass(status: WorkerTaskProgressEntry["status"]) {
  switch (status) {
    case "working":
      return "bg-emerald-500/15 text-emerald-500";
    case "paused":
      return "bg-amber-500/15 text-amber-500";
    case "completed":
      return "bg-slate-500/15 text-slate-500";
    default:
      return "bg-blue-500/15 text-blue-500";
  }
}

function getTaskStatusLabel(status: WorkerTaskProgressEntry["status"]) {
  switch (status) {
    case "working":
      return "稼働中";
    case "paused":
      return "中断中";
    case "completed":
      return "完了";
    default:
      return "未着手";
  }
}

function formatTaskDuration(minutes: number) {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;
  if (hours > 0) return `${hours}時間${restMinutes}分`;
  return `${restMinutes}分`;
}

function formatTaskCount(value: number) {
  return `${value.toLocaleString("ja-JP")}件`;
}

function formatHourBalance(minutes: number) {
  return `${(Math.max(0, minutes) / 60).toFixed(1)}h`;
}

export function WorkerView() {
  const [searchParams] = useSearchParams();
  const c = useThemeColors();
  const {
    shippers,
    sites,
    processes,
    workflows,
    selectedSiteId,
    setSelectedSiteId,
  } = useMasterData();
  const workerUsers = useMemo<User[]>(
    () => readUsersFromStorage().filter((user) => user.status !== "locked"),
    [],
  );
  const loginUsers = useMemo<WorkerLoginUser[]>(
    () =>
      workerUsers.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
      })),
    [workerUsers],
  );
  const [now, setNow] = useState(new Date());
  const [authSession, setAuthSession] = useState<WorkerAuthSession | null>(null);
  const [workerId, setWorkerId] = useState("");
  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState(DEMO_PASSWORD);
  const [loginError, setLoginError] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState("");
  const [taskProgress, setTaskProgress] = useState<Record<string, WorkerTaskProgressEntry>>({});
  const [progressKey, setProgressKey] = useState("");
  const [currentScreen, setCurrentScreen] = useState<"list" | "input">("list");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timerId);
  }, []);

  const deploymentWorkers = useMemo(() => readDeploymentWorkers(), []);
  const workerMap = useMemo(() => new Map(deploymentWorkers.map((worker) => [worker.id, worker])), [deploymentWorkers]);
  const siteName = sites.find((site) => site.id === selectedSiteId)?.name ?? "拠点未選択";
  const loginSiteOptions = useMemo(
    () =>
      Array.from(
        sites.reduce((map, site) => {
          if (!map.has(site.name)) map.set(site.name, { id: site.id, name: site.name });
          return map;
        }, new Map<string, { id: string; name: string }>()),
      ).map(([, site]) => site),
    [sites],
  );
  const siteData = useMemo(
    () => buildWorkerSiteDeploymentData(selectedSiteId, sites, workflows, shippers, processes),
    [selectedSiteId, sites, workflows, shippers, processes],
  );
  const fallbackWorkerId = useMemo(() => pickFallbackWorkerId(siteData), [siteData]);
  const requestedWorkerId = searchParams.get("workerId");

  useEffect(() => {
    const stored = readWorkerAuthSession();
    if (stored && workerMap.has(stored.workerId)) {
      setAuthSession(stored);
      setWorkerId(stored.workerId);
      setLoginUserId(stored.userId);
      setLoginPassword(DEMO_PASSWORD);
      return;
    }
    setAuthSession(null);
    setWorkerId("");
    setLoginUserId((prev) => prev || loginUsers[0]?.id || "");
    setLoginPassword(DEMO_PASSWORD);
  }, [loginUsers, workerMap]);

  useEffect(() => {
    if (!authSession || authSession.siteId === selectedSiteId) return;
    const nextSession = { ...authSession, siteId: selectedSiteId };
    setAuthSession(nextSession);
    saveWorkerAuthSession(nextSession);
    saveWorkerSession({ workerId: nextSession.workerId, siteId: selectedSiteId });
  }, [authSession, selectedSiteId]);

  const currentWorker = authSession
    ? workerMap.get(workerId) ?? workerMap.get(authSession.workerId) ?? workerMap.get(fallbackWorkerId) ?? null
    : null;
  const currentUserDetail = authSession
    ? workerUsers.find((user) => user.id === authSession.userId) ?? null
    : null;
  const todayKey = getTodayKey(now);

  const tasks = useMemo(
    () => (currentWorker ? buildWorkerDayTasks(siteData, currentWorker.id) : []),
    [siteData, currentWorker],
  );

  useEffect(() => {
    if (!authSession || !currentWorker) return;
    const stored = readWorkerProgress(todayKey, currentWorker.id);
    const normalized = Object.fromEntries(
      tasks.map((task) => [task.id, stored[task.id] ?? { status: "pending" as const }]),
    );
    setTaskProgress(normalized);
    setProgressKey(`${todayKey}:${currentWorker.id}`);
  }, [authSession, todayKey, currentWorker, tasks]);

  useEffect(() => {
    if (!authSession || !currentWorker || progressKey !== `${todayKey}:${currentWorker.id}`) return;
    saveWorkerProgress(todayKey, currentWorker.id, taskProgress);
  }, [authSession, taskProgress, todayKey, currentWorker, progressKey]);

  useEffect(() => {
    if (!selectedTaskId) return;
    if (tasks.some((task) => task.id === selectedTaskId)) return;
    setSelectedTaskId(null);
  }, [selectedTaskId, tasks]);

  const notifications = useMemo(
    () =>
      currentWorker
        ? getVisibleWorkerNotifications({
            siteId: selectedSiteId,
            workerId: currentWorker.id,
            siteName,
            now,
          })
        : [],
    [selectedSiteId, currentWorker, siteName, now],
  );

  const primaryAnnouncement = notifications.find((notification) => notification.type === "announce") ?? null;
  const latestChangeNotification = notifications.find((notification) => notification.type !== "announce") ?? null;
  const showAnnouncement = Boolean(primaryAnnouncement && primaryAnnouncement.id !== dismissedAnnouncementId);

  const completedCount = tasks.filter((task) => (taskProgress[task.id]?.status ?? "pending") === "completed").length;
  const completedMinutes = tasks.reduce((sum, task) => {
    if ((taskProgress[task.id]?.status ?? "pending") !== "completed") return sum;
    return sum + task.durationMinutes;
  }, 0);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const updateTaskStatus = (taskId: string, status: WorkerTaskProgressEntry["status"]) => {
    const nowIso = new Date().toISOString();
    setTaskProgress((prev) => {
      const current = prev[taskId] ?? { status: "pending" as const };
      const nextEntry: WorkerTaskProgressEntry = {
        ...current,
        status,
      };

      if (status === "working") {
        nextEntry.startedAt = current.startedAt ?? nowIso;
        if (current.status === "paused" && current.pauseStartedAt) {
          nextEntry.totalPausedMinutes = getPausedMinutes(current);
          nextEntry.pauseStartedAt = undefined;
        }
      }

      if (status === "paused" && current.status !== "paused") {
        nextEntry.pauseStartedAt = nowIso;
      }

      if (status === "completed") {
        nextEntry.completedAt = nowIso;
        if (current.status === "paused" && current.pauseStartedAt) {
          nextEntry.totalPausedMinutes = getPausedMinutes(current);
          nextEntry.pauseStartedAt = undefined;
        }
      }

      return {
        ...prev,
        [taskId]: nextEntry,
      };
    });
  };

  const updateTaskQuantity = (taskId: string, nextQuantity: number) => {
    setTaskProgress((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        status: prev[taskId]?.status ?? "working",
        draftQuantity: Math.max(0, nextQuantity),
      },
    }));
  };

  const submitTaskQuantity = (taskId: string) => {
    const nowIso = new Date().toISOString();
    setTaskProgress((prev) => {
      const current = prev[taskId] ?? { status: "working" as const };
      const draftQuantity = Math.max(0, Number(current.draftQuantity ?? 0));
      if (draftQuantity <= 0) return prev;

      const submissionLogs = [
        ...getWorkerTaskSubmissionLogs(current),
        {
          id: `${taskId}:${nowIso}`,
          quantity: draftQuantity,
          submittedAt: nowIso,
        },
      ];

      return {
        ...prev,
        [taskId]: {
          ...current,
          status: current.status === "pending" ? "working" : current.status,
          startedAt: current.startedAt ?? nowIso,
          draftQuantity: 0,
          submissionLogs,
          reportedQuantity: getWorkerTaskReportedQuantity({ ...current, submissionLogs }),
          lastReportedAt: nowIso,
        },
      };
    });
  };

  const completeTask = (taskId: string) => {
    const nowIso = new Date().toISOString();
    setTaskProgress((prev) => {
      const current = prev[taskId] ?? { status: "pending" as const };
      const draftQuantity = Math.max(0, Number(current.draftQuantity ?? 0));
      const nextSubmissionLogs = [...getWorkerTaskSubmissionLogs(current)];

      if (draftQuantity > 0) {
        nextSubmissionLogs.push({
          id: `${taskId}:${nowIso}`,
          quantity: draftQuantity,
          submittedAt: nowIso,
        });
      }

      const nextEntry: WorkerTaskProgressEntry = {
        ...current,
        status: "completed",
        startedAt: current.startedAt ?? nowIso,
        completedAt: nowIso,
        draftQuantity: 0,
        submissionLogs: nextSubmissionLogs,
        reportedQuantity: getWorkerTaskReportedQuantity({ ...current, submissionLogs: nextSubmissionLogs }),
        lastReportedAt:
          draftQuantity > 0
            ? nowIso
            : getWorkerTaskLastReportedAt({ ...current, submissionLogs: nextSubmissionLogs }),
      };

      if (current.status === "paused" && current.pauseStartedAt) {
        nextEntry.totalPausedMinutes = getPausedMinutes(current);
        nextEntry.pauseStartedAt = undefined;
      }

      return {
        ...prev,
        [taskId]: nextEntry,
      };
    });
  };

  const getTaskDraftQuantity = (taskId: string) => Math.max(0, Number(taskProgress[taskId]?.draftQuantity ?? 0));
  const changeTaskQuantity = (taskId: string, delta: number) => {
    const currentQuantity = getTaskDraftQuantity(taskId);
    updateTaskQuantity(taskId, currentQuantity + delta);
  };

  const appendTaskQuantityDigit = (taskId: string, digit: string) => {
    const currentQuantity = String(getTaskDraftQuantity(taskId));
    const normalized = currentQuantity === "0" ? digit : `${currentQuantity}${digit}`;
    updateTaskQuantity(taskId, Number(normalized));
  };

  const backspaceTaskQuantity = (taskId: string) => {
    const currentQuantity = String(getTaskDraftQuantity(taskId));
    const nextValue = currentQuantity.length <= 1 ? 0 : Number(currentQuantity.slice(0, -1));
    updateTaskQuantity(taskId, nextValue);
  };

  const activeInputTask = tasks.find((task) => {
    const status = taskProgress[task.id]?.status ?? "pending";
    return status === "working" || status === "paused";
  }) ?? null;

  const selectedInputTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const displayInputTask = selectedInputTask ?? activeInputTask;

  useEffect(() => {
    if (currentScreen !== "input") return;
    if (displayInputTask) return;
    setCurrentScreen("list");
    setSelectedTaskId(null);
  }, [currentScreen, displayInputTask]);

  const activeInputStatus = displayInputTask ? (taskProgress[displayInputTask.id]?.status ?? "pending") : "pending";
  const activeInputQuantity = displayInputTask ? getTaskDraftQuantity(displayInputTask.id) : 0;
  const activeInputReportedQuantity = displayInputTask
    ? getWorkerTaskReportedQuantity(taskProgress[displayInputTask.id])
    : 0;
  const activeInputSubmissionCount = displayInputTask
    ? getWorkerTaskSubmissionLogs(taskProgress[displayInputTask.id]).length
    : 0;
  const activeInputUpdatedAt = displayInputTask
    ? getWorkerTaskLastReportedAt(taskProgress[displayInputTask.id])
    : undefined;
  const quickQuantityButtons = [1, 5, 10, 50];
  const keypadButtons = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "backspace"] as const;
  const stageClass = c.isDark
    ? "bg-[#0d0f16] lg:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.2),_transparent_28%),linear-gradient(180deg,#020617_0%,#0b1120_100%)]"
    : "bg-slate-100 lg:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(180deg,#f8fafc_0%,#dbe4f0_100%)]";
  const deviceFrameClass = c.isDark
    ? "lg:border-slate-700/80 lg:bg-slate-950 lg:shadow-[0_36px_90px_rgba(2,6,23,0.72)]"
    : "lg:border-slate-900 lg:bg-slate-900 lg:shadow-[0_36px_90px_rgba(15,23,42,0.3)]";

  const renderDeviceShell = (content: ReactNode) => (
    <div className={`min-h-screen ${stageClass} lg:flex lg:items-center lg:justify-center lg:px-6 lg:py-10`}>
      <div className="relative w-full lg:max-w-[430px]">
        <div className="pointer-events-none absolute inset-6 hidden rounded-[56px] bg-cyan-400/10 blur-3xl lg:block" />
        <div className="pointer-events-none absolute -left-[4px] top-28 hidden h-16 w-[4px] rounded-r-full bg-slate-700/80 lg:block" />
        <div className="pointer-events-none absolute -left-[4px] top-52 hidden h-24 w-[4px] rounded-r-full bg-slate-700/80 lg:block" />
        <div className="pointer-events-none absolute -right-[4px] top-40 hidden h-28 w-[4px] rounded-l-full bg-slate-700/80 lg:block" />
        <div className={`relative w-full overflow-hidden lg:mx-auto lg:h-[900px] lg:rounded-[46px] lg:border-[10px] ${deviceFrameClass}`}>
          <div className="pointer-events-none absolute left-1/2 top-3 z-30 hidden h-7 w-40 -translate-x-1/2 rounded-full bg-slate-950 shadow-[0_4px_16px_rgba(0,0,0,0.45)] lg:block" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 hidden h-1.5 w-28 -translate-x-1/2 rounded-full bg-white/30 lg:block" />
          {content}
        </div>
      </div>
    </div>
  );
  const handleWorkerLogin = (event: React.FormEvent) => {
    event.preventDefault();
    const selectedUser = loginUsers.find((user) => user.id === loginUserId);
    if (!selectedUser) {
      setLoginError("ログインするユーザーを選択してください。");
      return;
    }
    if (loginPassword !== DEMO_PASSWORD) {
      setLoginError("パスワードが正しくありません。");
      return;
    }

    const resolvedWorkerId =
      requestedWorkerId && workerMap.has(requestedWorkerId) ? requestedWorkerId : resolveDemoWorkerId(selectedUser.id);
    const nextSession = {
      userId: selectedUser.id,
      userName: selectedUser.name,
      userEmail: selectedUser.email,
      workerId: resolvedWorkerId,
      siteId: selectedSiteId,
      loggedInAt: new Date().toISOString(),
    } satisfies WorkerAuthSession;

    setLoginError("");
    setAuthSession(nextSession);
    setWorkerId(resolvedWorkerId);
    setCurrentScreen("list");
    setSelectedTaskId(null);
    setDismissedAnnouncementId("");
    saveWorkerAuthSession(nextSession);
    saveWorkerSession({ workerId: resolvedWorkerId, siteId: selectedSiteId });
  };

  const handleWorkerLogout = () => {
    clearWorkerAuthSession();
    setAuthSession(null);
    setWorkerId("");
    setTaskProgress({});
    setProgressKey("");
    setNotificationOpen(false);
    setDismissedAnnouncementId("");
    setSelectedTaskId(null);
    setCurrentScreen("list");
    setLoginPassword(DEMO_PASSWORD);
    setLoginError("");
  };

  if (!authSession) {
    return renderDeviceShell(
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-8 lg:h-full lg:min-h-0 lg:max-w-none lg:px-6 lg:py-10">
          <div className={`w-full rounded-[28px] border px-5 py-6 shadow-xl ${c.bgCard} ${c.borderCard}`}>
            <div className="mb-5 flex justify-center">
              <img
                src="/logo-light.png"
                alt="FluxView Logo"
                className="h-9 w-auto"
                style={{ filter: c.isDark ? "brightness(0) invert(1)" : "none" }}
              />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`text-[12px] font-semibold ${c.textMuted}`}>WORKER DEMO LOGIN</div>
                <div className={`mt-1 text-[24px] font-semibold ${c.textPrimary}`}>作業者ログイン</div>
              </div>
            </div>

            <form onSubmit={handleWorkerLogin} className="mt-6 space-y-4">
              <label className="block">
                <div className={`mb-1.5 text-[12px] font-medium ${c.textSecondary}`}>拠点</div>
                <select
                  value={selectedSiteId}
                  onChange={(event) => setSelectedSiteId(event.target.value)}
                  className={`h-12 w-full rounded-2xl border px-4 pr-3 text-[14px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                >
                  {loginSiteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className={`mb-1.5 text-[12px] font-medium ${c.textSecondary}`}>ユーザー</div>
                <div className="relative">
                  <UserRound className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${c.textMuted}`} />
                  <select
                    value={loginUserId}
                    onChange={(event) => setLoginUserId(event.target.value)}
                    className={`h-12 w-full rounded-2xl border pl-10 pr-3 text-[14px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                  >
                    {loginUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} / {user.email}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="block">
                <div className={`mb-1.5 text-[12px] font-medium ${c.textSecondary}`}>パスワード</div>
                <div className="relative">
                  <KeyRound className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${c.textMuted}`} />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="1234"
                    className={`h-12 w-full rounded-2xl border pl-10 pr-3 text-[14px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                  />
                </div>
              </label>

              {loginError ? <div className="text-[12px] font-medium text-rose-500">{loginError}</div> : null}

              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#155DFC] px-4 text-[14px] font-semibold text-white"
              >
                <LogIn className="h-4 w-4" />
                ログインして作業開始</button>
            </form>
          </div>
        </div>,
    );
  }

  return renderDeviceShell(
      <>
      <div className={`relative mx-auto flex min-h-screen w-full max-w-md flex-col ${c.bgCard} lg:h-full lg:min-h-0 lg:max-w-none lg:overflow-hidden lg:rounded-[36px] lg:pt-7`}>
        <header className={`sticky top-0 z-20 border-b px-5 py-4 ${c.bgCard} ${c.border}`}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleWorkerLogout}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
            >
              <LogOut className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1 text-center">
              <div className={`truncate text-[15px] font-semibold ${c.textPrimary}`}>{currentUserDetail?.name ?? currentWorker?.name ?? "作業者"}</div>
              <div className={`truncate text-[12px] ${c.textSecondary}`}>{siteName}</div>
            </div>

            <button
              type="button"
              onClick={() => setNotificationOpen(true)}
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
            >
              <Bell className="h-5 w-5" />
              {notifications.length > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {Math.min(notifications.length, 9)}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        <main className={`flex flex-1 flex-col px-5 ${currentScreen === "input" ? "overflow-hidden py-3" : "overflow-y-auto py-5"}`}>
          {currentScreen === "list" ? (
            <section className="mt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className={`text-[18px] font-semibold ${c.textPrimary}`}>今日の担当タスク</h2>
                  <div className={`text-[12px] ${c.textMuted}`}>現在の担当と次の予定を、見やすいカードで確認できます。</div>
                </div>
                {activeInputTask ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTaskId(activeInputTask.id);
                      setCurrentScreen("input");
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#155DFC] px-3 py-2 text-[12px] font-semibold text-white"
                  >
                    入力を再開
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {tasks.length === 0 ? (
                <div className={`rounded-3xl border px-4 py-8 text-center ${c.bgCard} ${c.borderCard}`}>
                  <div className={`text-[15px] font-semibold ${c.textPrimary}`}>今日の担当タスクはありません</div>
                  <div className={`mt-2 text-[13px] ${c.textSecondary}`}>配置が更新されると、ここに担当予定が表示されます。</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task, index) => {
                    const tone = processColorClasses[task.color] ?? processColorClasses.cyan;
                    const status = taskProgress[task.id]?.status ?? "pending";
                    const nextTask = tasks[index + 1] ?? null;
                    const reportedQuantity = getWorkerTaskReportedQuantity(taskProgress[task.id]);
                    const submissionCount = getWorkerTaskSubmissionLogs(taskProgress[task.id]).length;
                    const lastReportedAt = getWorkerTaskLastReportedAt(taskProgress[task.id]);
                    const isCurrentSlot =
                      status === "working" ||
                      status === "paused" ||
                      (status !== "completed" && task.startMinutes <= currentMinutes && currentMinutes < task.endMinutes);
                    const elapsedMinutes = isCurrentSlot
                      ? currentMinutes - task.startMinutes
                      : currentMinutes >= task.endMinutes
                        ? task.durationMinutes
                        : 0;
                    const progressPercent =
                      status === "completed"
                        ? 100
                        : Math.min(100, Math.max(0, Math.round((elapsedMinutes / Math.max(task.durationMinutes, 1)) * 100)));
                    const remainingMinutes =
                      status === "completed"
                        ? 0
                        : isCurrentSlot
                          ? Math.max(task.endMinutes - currentMinutes, 0)
                          : task.durationMinutes;
                    const cardClass = c.isDark
                      ? "bg-[#232320] border-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.28)]"
                      : "bg-white border-slate-200 shadow-[0_14px_34px_rgba(15,23,42,0.08)]";
                    const blockClass = c.isDark ? "bg-[#2a313f] border-[#35517a]" : "bg-slate-50 border-slate-200";
                    const metricClass = c.isDark ? "bg-[#1d1d1a] border-white/6" : "bg-slate-50 border-slate-200";
                    const emptyBlockClass = c.isDark ? "border-amber-500/60 bg-[#2a2416]" : "border-amber-300 bg-amber-50";

                    return (
                      <article
                        key={task.id}
                        className={`rounded-[26px] border px-4 py-4 ${status === "completed" ? "opacity-85" : ""} ${cardClass}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[15px] font-semibold ${tone.bg} ${tone.border} ${tone.text}`}>
                              {task.processName.slice(0, 1)}
                            </div>
                            <div className="min-w-0">
                              <div className={`truncate text-[20px] font-semibold ${c.textPrimary}`}>{task.processName}</div>
                              <div className={`truncate text-[12px] ${c.textSecondary}`}>
                                {task.workflowName}・{task.shipperName}
                              </div>
                              <div className={`mt-0.5 text-[12px] ${c.textMuted}`}>残 {formatHourBalance(remainingMinutes)}</div>
                            </div>
                          </div>
                          <div className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${getTaskStatusClass(status)}`}>
                            {getTaskStatusLabel(status)}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${c.bgSurface} ${c.textSecondary}`}>{task.workflowName}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tone.bg} ${tone.text}`}>{task.siteName}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${c.bgSurface} ${c.textMuted}`}>No.{task.order}</span>
                        </div>

                        <div className={`mt-4 rounded-[18px] border px-4 py-3 ${blockClass}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`text-[11px] font-medium ${c.textMuted}`}>現在の担当</div>
                              <div className={`mt-1 truncate text-[16px] font-semibold ${c.textPrimary}`}>{task.processName}</div>
                              <div className={`mt-1 truncate text-[12px] ${tone.text}`}>{task.shipperName}</div>
                            </div>
                            <div className="text-right">
                              <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{formatTimeRange(task.startTime, task.endTime)}</div>
                              <div className={`mt-1 text-[11px] ${c.textMuted}`}>{formatTaskDuration(task.durationMinutes)}</div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-center py-2">
                          <div className={`h-px flex-1 ${c.isDark ? "bg-white/10" : "bg-slate-200"}`} />
                          <ChevronRight className={`mx-2 h-4 w-4 rotate-90 ${c.textMuted}`} />
                          <div className={`h-px flex-1 ${c.isDark ? "bg-white/10" : "bg-slate-200"}`} />
                        </div>

                        {nextTask ? (
                          <div className={`rounded-[18px] border px-4 py-3 ${c.isDark ? "border-white/10 bg-[#252523]" : "border-slate-200 bg-white/90"}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`text-[11px] font-medium ${c.textMuted}`}>次の担当</div>
                                <div className={`mt-1 truncate text-[16px] font-semibold ${c.textPrimary}`}>{nextTask.processName}</div>
                                <div className={`mt-1 truncate text-[12px] ${c.textSecondary}`}>{nextTask.shipperName}</div>
                              </div>
                              <div className={`shrink-0 text-[13px] font-semibold ${c.textPrimary}`}>
                                {formatTimeRange(nextTask.startTime, nextTask.endTime)}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className={`rounded-[18px] border border-dashed px-4 py-4 text-center ${emptyBlockClass}`}>
                            <div className={`text-[12px] font-medium ${c.textSecondary}`}>次の配置なし</div>
                            <div className={`mt-1 text-[12px] ${c.textMuted}`}>このタスクの後は空き時間です</div>
                          </div>
                        )}

                        <div className="mt-4">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className={c.textSecondary}>時間進捗</span>
                            <span className={`font-semibold ${c.textPrimary}`}>{progressPercent}%</span>
                          </div>
                          <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${c.isDark ? "bg-white/10" : "bg-slate-200"}`}>
                            <div
                              className={`h-full rounded-full ${status === "paused" ? "bg-amber-400" : status === "completed" ? "bg-emerald-400" : "bg-[#8bb3ff]"}`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2.5">
                          <div className={`rounded-[16px] border px-3 py-3 ${metricClass}`}>
                            <div className={`text-[11px] ${c.textMuted}`}>送信累計</div>
                            <div className={`mt-1 text-[18px] font-semibold ${c.textPrimary}`}>{formatTaskCount(reportedQuantity)}</div>
                          </div>
                          <div className={`rounded-[16px] border px-3 py-3 ${metricClass}`}>
                            <div className={`text-[11px] ${c.textMuted}`}>送信回数</div>
                            <div className={`mt-1 text-[18px] font-semibold ${c.textPrimary}`}>{submissionCount}回</div>
                          </div>
                          <div className={`rounded-[16px] border px-3 py-3 ${metricClass}`}>
                            <div className={`text-[11px] ${c.textMuted}`}>最終送信</div>
                            <div className={`mt-1 text-[16px] font-semibold ${lastReportedAt ? c.textPrimary : c.textMuted}`}>
                              {lastReportedAt ? formatNotificationTime(lastReportedAt) : "ー"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                          {status === "completed" ? (
                            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-500">
                              <CheckCircle2 className="h-4 w-4" />
                              完了済み
                            </div>
                          ) : (
                            <div className={`text-[12px] ${c.textSecondary}`}>
                              {isCurrentSlot ? "現在このタスクを担当中です" : "開始前のタスクです"}
                            </div>
                          )}

                          {status === "completed" ? null : status === "working" || status === "paused" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTaskId(task.id);
                                setCurrentScreen("input");
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl bg-[#155DFC] px-4 py-3 text-[13px] font-semibold text-white"
                            >
                              入力を開く
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                updateTaskStatus(task.id, "working");
                                setSelectedTaskId(task.id);
                                setCurrentScreen("input");
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl bg-[#155DFC] px-4 py-3 text-[13px] font-semibold text-white"
                            >
                              <Play className="h-4 w-4" />
                              このタスクを開始
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {!showAnnouncement && latestChangeNotification && currentScreen === "list" ? (
            <section className="mt-4">
              <div className={`rounded-3xl border px-4 py-4 ${c.bgCard} ${c.borderCard}`}>
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-amber-500/10 p-2 text-amber-500">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{latestChangeNotification.title}</div>
                    <div className={`mt-1 text-[13px] leading-6 ${c.textSecondary}`}>{latestChangeNotification.message}</div>
                    <div className={`mt-2 text-[11px] ${c.textMuted}`}>
                      配信時刻 {formatNotificationTime(latestChangeNotification.deliverAt)}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {currentScreen === "input" && displayInputTask ? (
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentScreen("list")}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-[13px] font-medium ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  タスク一覧に戻る</button>
              </div>
              <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border ${c.borderCard} ${c.bgCard} shadow-xl`}>
                <div className={`border-b px-4 py-3 ${c.isDark ? "bg-cyan-500/10" : "bg-cyan-50"} ${c.borderCard}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`text-[12px] font-semibold ${c.isDark ? "text-cyan-300" : "text-cyan-700"}`}>入力パネル</div>
                      <div className={`mt-1 text-[18px] font-semibold ${c.textPrimary}`}>{displayInputTask.processName}</div>
                      <div className={`mt-1 text-[12px] ${c.textSecondary}`}>{displayInputTask.shipperName}</div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      activeInputStatus === "working"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-amber-500/15 text-amber-500"
                    }`}>
                      {activeInputStatus === "working" ? "稼働中" : "中断中"}
                    </div>
                  </div>
                  <div className={`mt-2 flex items-center gap-2 text-[12px] ${c.textSecondary}`}>
                    <Clock3 className="h-4 w-4" />
                    <span>{formatTimeRange(displayInputTask.startTime, displayInputTask.endTime)}</span>
                    <span className={c.textMuted}>/ {formatDuration(displayInputTask.durationMinutes)}</span>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
                  <div className={`rounded-[24px] border px-3 py-3 text-center ${c.bgSurface} ${c.borderCard}`}>
                    <div className={`text-[12px] ${c.textMuted}`}>今回送信数</div>
                    <div className={`mt-2 text-[38px] font-semibold leading-none tabular-nums ${c.textPrimary}`}>
                      {activeInputQuantity.toLocaleString("ja-JP")}
                    </div>
                    <div className={`mt-2 text-[13px] ${c.textSecondary}`}>件</div>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${c.bgCard} ${c.textSecondary}`}>
                        累計 {formatCount(activeInputReportedQuantity)}
                      </div>
                      <div className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${c.bgCard} ${c.textSecondary}`}>
                        送信 {activeInputSubmissionCount} 回
                    </div>
                    <div className={`mt-2 text-[11px] ${c.textMuted}`}>
                      {activeInputUpdatedAt ? `最終送信 ${formatNotificationTime(activeInputUpdatedAt)}` : "まだ送信していません"}
                    </div>
                  </div>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {quickQuantityButtons.map((value) => (
                      <button
                        key={value}
                        type="button"
                        disabled={activeInputStatus !== "working"}
                        onClick={() => changeTaskQuantity(displayInputTask.id, value)}
                        className={`min-h-[44px] rounded-2xl border text-[15px] font-semibold transition ${
                          activeInputStatus === "working"
                            ? `${c.bgCard} ${c.borderCard} ${c.textPrimary}`
                            : `${c.bgSurface} ${c.borderCard} ${c.textMuted}`
                        }`}
                      >
                        +{value}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 grid w-full grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
                    <button
                      type="button"
                      aria-label="1件減らす"
                      disabled={activeInputStatus !== "working"}
                      onClick={() => changeTaskQuantity(displayInputTask.id, -1)}
                        className={`inline-flex min-h-[48px] w-[44px] items-center justify-center rounded-2xl border transition ${
                        activeInputStatus === "working"
                          ? `${c.bgCard} ${c.borderCard} ${c.textPrimary}`
                          : `${c.bgSurface} ${c.borderCard} ${c.textMuted}`
                      }`}
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={activeInputQuantity}
                      disabled={activeInputStatus !== "working"}
                      onChange={(event) => updateTaskQuantity(displayInputTask.id, Number(event.target.value || 0))}
                        className={`min-h-[48px] min-w-0 w-full rounded-2xl border px-3 text-center text-[20px] font-semibold tabular-nums outline-none ${
                        activeInputStatus === "working"
                          ? `${c.bgCard} ${c.borderCard} ${c.textPrimary}`
                          : `${c.bgSurface} ${c.borderCard} ${c.textMuted}`
                      }`}
                    />
                    <button
                      type="button"
                      aria-label="1件増やす"
                      disabled={activeInputStatus !== "working"}
                      onClick={() => changeTaskQuantity(displayInputTask.id, 1)}
                        className={`inline-flex min-h-[48px] w-[44px] items-center justify-center rounded-2xl border transition ${
                        activeInputStatus === "working"
                          ? `${c.bgCard} ${c.borderCard} ${c.textPrimary}`
                          : `${c.bgSurface} ${c.borderCard} ${c.textMuted}`
                      }`}
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {keypadButtons.map((buttonKey) => (
                      <button
                        key={buttonKey}
                        type="button"
                        aria-label={buttonKey === "backspace" ? "1桁削除" : buttonKey + " を入力"}
                        disabled={activeInputStatus !== "working"}
                        onClick={() => {
                          if (buttonKey === "backspace") {
                            backspaceTaskQuantity(displayInputTask.id);
                            return;
                          }
                          appendTaskQuantityDigit(displayInputTask.id, buttonKey);
                        }}
                        className={`min-h-[48px] rounded-[18px] border text-[20px] font-semibold transition ${
                          activeInputStatus === "working"
                            ? `${c.bgCard} ${c.borderCard} ${c.textPrimary}`
                            : `${c.bgSurface} ${c.borderCard} ${c.textMuted}`
                        }`}
                      >
                        {buttonKey === "backspace" ? <Delete className="mx-auto h-5 w-5" /> : buttonKey}
                      </button>
                    ))}
                  </div>

                  <div className="mt-auto grid grid-cols-3 gap-2 pt-2">
                    {activeInputStatus === "working" ? (
                      <button
                        type="button"
                        onClick={() => updateTaskStatus(displayInputTask.id, "paused")}
                        className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-amber-500 px-3 text-[12px] font-semibold text-white"
                      >
                        <Pause className="h-4 w-4" />
                        作業を中断
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateTaskStatus(displayInputTask.id, "working")}
                        className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[#155DFC] px-3 text-[12px] font-semibold text-white"
                      >
                        <Play className="h-4 w-4" />
                        {activeInputStatus === "paused" ? "作業を再開" : "作業を開始"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={activeInputStatus !== "working" || activeInputQuantity <= 0}
                      onClick={() => submitTaskQuantity(displayInputTask.id)}
                      className={`inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-3 text-[12px] font-semibold ${
                        activeInputStatus === "working" && activeInputQuantity > 0
                          ? "bg-[#155DFC] text-white"
                          : `${c.bgSurface} ${c.textMuted}`
                      }`}
                    >
                      <Send className="h-4 w-4" />
                      送信
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        completeTask(displayInputTask.id);
                        setSelectedTaskId(null);
                        setCurrentScreen("list");
                      }}
                      className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 text-[12px] font-semibold text-white"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {activeInputQuantity > 0 ? "送信して完了" : "完了"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

        </main>
      </div>

      {showAnnouncement && primaryAnnouncement ? (
        <div className="absolute inset-0 z-40 bg-black/40 px-5 py-8 lg:rounded-[36px]">
          <div className="mx-auto flex h-full w-full items-center">
            <div className={`w-full rounded-[28px] border px-5 py-5 shadow-2xl ${c.bgCard} ${c.borderCard}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-500">
                  <Megaphone className="h-6 w-6" />
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedAnnouncementId(primaryAnnouncement.id)}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5">
                <div className={`text-[13px] font-semibold text-violet-500`}>{primaryAnnouncement.title}</div>
                <div className={`mt-3 text-[20px] font-semibold leading-8 ${c.textPrimary}`}>作業開始前に最新のお知らせを確認してください</div>
                <div className={`mt-3 text-[14px] leading-7 ${c.textSecondary}`}>{primaryAnnouncement.message}</div>
                <div className={`mt-4 text-[12px] ${c.textMuted}`}>配信時刻 {formatNotificationTime(primaryAnnouncement.deliverAt)}</div>
              </div>

              <button
                type="button"
                onClick={() => setDismissedAnnouncementId(primaryAnnouncement.id)}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#155DFC] px-4 py-3 text-[14px] font-semibold text-white"
              >
                確認して進む
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notificationOpen ? (
        <div className="absolute inset-0 z-50 bg-black/40 lg:rounded-[36px]">
          <div className={`absolute inset-x-0 bottom-0 w-full rounded-t-[32px] border px-5 pb-8 pt-5 ${c.bgCard} ${c.borderCard}`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className={`text-[18px] font-semibold ${c.textPrimary}`}>通知</div>
                <div className={`mt-1 text-[12px] ${c.textSecondary}`}>全体連絡と最新の変更通知を表示します。</div>
              </div>
              <button
                type="button"
                onClick={() => setNotificationOpen(false)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className={`rounded-3xl border px-4 py-8 text-center ${c.bgSurface} ${c.borderCard}`}>
                  <div className={`text-[14px] font-semibold ${c.textPrimary}`}>通知はありません</div>
                  <div className={`mt-2 text-[12px] ${c.textSecondary}`}>新しい通知が届くとここに表示されます。</div>
                </div>
              ) : (
                notifications.map((notification) => (
                  <article key={notification.id} className={`rounded-3xl border px-4 py-4 ${c.bgSurface} ${c.borderCard}`}>
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-2xl p-2 ${
                          notification.type === "announce"
                            ? "bg-violet-500/10 text-violet-500"
                            : notification.type === "reminder"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-blue-500/10 text-blue-500"
                        }`}
                      >
                        {notification.type === "announce" ? (
                          <Megaphone className="h-5 w-5" />
                        ) : notification.type === "reminder" ? (
                          <ShieldAlert className="h-5 w-5" />
                        ) : (
                          <Bell className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{notification.title}</div>
                        <div className={`mt-1 text-[13px] leading-6 ${c.textSecondary}`}>{notification.message}</div>
                        <div className={`mt-2 text-[11px] ${c.textMuted}`}>{formatNotificationTime(notification.deliverAt)}</div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>,
  );
}



