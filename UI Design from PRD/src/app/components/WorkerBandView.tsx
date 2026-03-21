import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Lock,
  Pause,
  Play,
  Send,
  Signal,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { parseTimeLabel, readDeploymentWorkers } from "./fieldDeploymentStore";
import { buildStepPlanDefaults, readProgressPlanStore, resolveStepPlanValues } from "./progressPlanStore";
import {
  buildWorkerDayTasks,
  buildWorkerSiteDeploymentData,
  getPausedMinutes,
  getTodayKey,
  getVisibleWorkerNotifications,
  getWorkerTaskLastReportedAt,
  getWorkerTaskReportedQuantity,
  getWorkerTaskSubmissionLogs,
  readWorkerProgress,
  saveWorkerProgress,
  type WorkerTaskProgressEntry,
  type WorkerTaskRecord,
} from "./workerMobileStore";

type BandScreen = "home" | "timeline" | "prep" | "input" | "feedback";

type BandTaskView = WorkerTaskRecord & {
  targetQty: number;
  plannedQty: number;
};

const BAND_FRAME_IMAGE = "/watch_bg.png";
const BAND_SCREEN_INSET_STYLE = {
  left: "6.9%",
  right: "6.9%",
  top: "18.3%",
  bottom: "18.4%",
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatBandDateTime(now: Date) {
  const date = now.toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

  const time = now.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${date} ${time}`;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}時間${rest}分`;
  }
  return `${minutes}分`;
}

function formatCount(value: number) {
  return `${Math.max(0, value).toLocaleString("ja-JP")} 件`;
}

function formatNotificationTime(value?: string) {
  if (!value) return "未送信";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未送信";
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getTaskStateMeta(taskState: WorkerTaskProgressEntry["status"]) {
  switch (taskState) {
    case "working":
      return { label: "作業中", chip: "border-emerald-400/28 bg-emerald-400/18 text-emerald-100" };
    case "paused":
      return { label: "中断中", chip: "border-amber-300/28 bg-amber-300/18 text-amber-50" };
    case "completed":
      return { label: "完了", chip: "border-cyan-300/28 bg-cyan-300/18 text-cyan-50" };
    default:
      return { label: "未開始", chip: "border-white/14 bg-white/[0.08] text-white/72" };
  }
}

function isInteractiveNavTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("button, a, input, select, textarea, [role='button']"));
}

function calculateElapsedMs(entry?: WorkerTaskProgressEntry, now = new Date()) {
  if (!entry?.startedAt) return 0;

  const startedAt = new Date(entry.startedAt).getTime();
  if (Number.isNaN(startedAt)) return 0;

  const finishedAt = entry.completedAt ? new Date(entry.completedAt).getTime() : now.getTime();
  if (Number.isNaN(finishedAt)) return 0;

  return Math.max(0, finishedAt - startedAt - getPausedMinutes(entry, now) * 60_000);
}

function estimateRemainingMinutes(targetQty: number, currentQty: number, elapsedMs: number, durationMinutes: number) {
  const safeTarget = Math.max(targetQty, 0);
  const remainingQty = Math.max(safeTarget - currentQty, 0);
  if (remainingQty === 0) return 0;

  if (currentQty > 0 && elapsedMs > 0) {
    const pacePerItemMs = elapsedMs / currentQty;
    return Math.max(1, Math.round((pacePerItemMs * remainingQty) / 60_000));
  }

  const scheduledMinutes = Math.max(durationMinutes, 1);
  return safeTarget > 0 ? Math.max(1, Math.round((scheduledMinutes * remainingQty) / safeTarget)) : scheduledMinutes;
}

function resolveSegmentTarget(plannedQty: number, scheduleStartMinutes: number, scheduleEndMinutes: number, task: WorkerTaskRecord) {
  const totalScheduleMinutes = Math.max(30, scheduleEndMinutes - scheduleStartMinutes);
  const clippedStart = Math.max(task.startMinutes, scheduleStartMinutes);
  const clippedEnd = Math.min(task.endMinutes, scheduleEndMinutes);
  const activeMinutes = Math.max(task.durationMinutes, clippedEnd - clippedStart);
  const rawTarget = plannedQty * (activeMinutes / totalScheduleMinutes);

  if (rawTarget <= 0) return 0;
  if (rawTarget >= 20) return Math.max(10, Math.round(rawTarget / 10) * 10);
  return Math.max(1, Math.round(rawTarget));
}

function buildBandTasks(siteData: ReturnType<typeof buildWorkerSiteDeploymentData>, dateKey: string, workerId: string) {
  const dayPlans = readProgressPlanStore()[dateKey] ?? {};
  const planByStepId = new Map<string, { planned: number; startMinutes: number; endMinutes: number }>();

  siteData.workflowViews.forEach((workflow, workflowIndex) => {
    workflow.steps.forEach((step, stepIndex) => {
      const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph);
      const resolved = resolveStepPlanValues(dayPlans, step.id, {
        planned: defaults.planned,
        startTime: step.startTime,
        targetEndTime: step.targetEndTime,
      });
      planByStepId.set(step.id, {
        planned: resolved.planned,
        startMinutes: parseTimeLabel(resolved.startTime),
        endMinutes: Math.max(parseTimeLabel(resolved.startTime) + 30, parseTimeLabel(resolved.targetEndTime)),
      });
    });
  });

  return buildWorkerDayTasks(siteData, workerId).map((task) => {
    const stepPlan = planByStepId.get(task.stepId);
    const plannedQty = stepPlan?.planned ?? 0;
    const targetQty = stepPlan
      ? resolveSegmentTarget(plannedQty, stepPlan.startMinutes, stepPlan.endMinutes, task)
      : Math.max(1, Math.round(task.durationMinutes));

    return {
      ...task,
      plannedQty,
      targetQty,
    } satisfies BandTaskView;
  });
}

function BandShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-[304px] py-4 sm:w-[320px]">
      <div className="pointer-events-none absolute inset-x-10 bottom-8 h-9 rounded-full bg-black/18 blur-2xl" />

      <div className="relative z-10 aspect-[1001/2503] w-full drop-shadow-[0_32px_60px_rgba(15,23,42,0.22)]">
        <img
          src={BAND_FRAME_IMAGE}
          alt=""
          aria-hidden="true"
          className="pointer-events-none h-full w-full select-none object-contain"
        />

        <div
          className="absolute overflow-hidden rounded-[13%] bg-transparent text-white"
          style={BAND_SCREEN_INSET_STYLE}
        >
          <div className="pointer-events-none absolute inset-x-7 top-2 h-1 rounded-full bg-white/8" />
          <div className="pointer-events-none absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-black/80" />
          <div className="pointer-events-none absolute left-3 right-3 top-2 h-20 rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.02)_45%,transparent)]" />
          <div className="pointer-events-none absolute -left-10 top-20 h-24 w-24 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-10 bottom-18 h-24 w-24 rounded-full bg-orange-400/10 blur-3xl" />

          <div className="relative flex h-full w-full flex-col px-3.5 py-3.5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkerBandView() {
  const [searchParams] = useSearchParams();
  const { shippers, sites, processes, workflows, selectedSiteId } = useMasterData();
  const [screen, setScreen] = useState<BandScreen>("home");
  const [now, setNow] = useState(new Date());
  const [signal, setSignal] = useState(88);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<string[]>([]);
  const [directiveVisible, setDirectiveVisible] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeCodeError, setEmployeeCodeError] = useState("");
  const [activeWorkerId, setActiveWorkerId] = useState<string | null>(null);
  const [initializedWorker, setInitializedWorker] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<Record<string, WorkerTaskProgressEntry>>({});
  const [progressKey, setProgressKey] = useState("");
  const navSwipeStartX = useRef<number | null>(null);
  const navSwipeStartY = useRef<number | null>(null);
  const timelineListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const signalTimer = window.setInterval(() => {
      setSignal((current) => clamp(current + (Math.random() > 0.5 ? 3 : -4), 64, 100));
    }, 30_000);

    return () => window.clearInterval(signalTimer);
  }, []);

  const workerMap = useMemo(() => {
    const workers = readDeploymentWorkers();
    return new Map(workers.map((worker) => [worker.id, worker]));
  }, []);
  const siteName = sites.find((site) => site.id === selectedSiteId)?.name ?? "拠点未選択";
  const siteData = useMemo(
    () => buildWorkerSiteDeploymentData(selectedSiteId, sites, workflows, shippers, processes),
    [selectedSiteId, sites, workflows, shippers, processes],
  );
  const requestedWorkerId = searchParams.get("workerId");
  const initialWorkerId = useMemo(() => {
    if (requestedWorkerId && workerMap.has(requestedWorkerId)) return requestedWorkerId;
    return null;
  }, [requestedWorkerId, workerMap]);

  useEffect(() => {
    if (initializedWorker) return;
    if (initialWorkerId && workerMap.has(initialWorkerId)) {
      setActiveWorkerId(initialWorkerId);
      setScreen("timeline");
    } else {
      setScreen("home");
    }
    setInitializedWorker(true);
  }, [initialWorkerId, initializedWorker, workerMap]);

  const currentWorker = activeWorkerId ? workerMap.get(activeWorkerId) ?? null : null;
  const todayKey = getTodayKey(now);

  const tasks = useMemo(
    () => (currentWorker ? buildBandTasks(siteData, todayKey, currentWorker.id) : []),
    [siteData, todayKey, currentWorker],
  );

  useEffect(() => {
    if (!currentWorker) {
      setSelectedTaskId(null);
      setTaskProgress({});
      setProgressKey("");
      return;
    }

    const stored = readWorkerProgress(todayKey, currentWorker.id);
    const normalized = Object.fromEntries(
      tasks.map((task) => [task.id, stored[task.id] ?? { status: "pending" as const }]),
    );
    setTaskProgress(normalized);
    setProgressKey(`${todayKey}:${currentWorker.id}`);
  }, [todayKey, currentWorker, tasks]);

  useEffect(() => {
    if (!currentWorker || progressKey !== `${todayKey}:${currentWorker.id}`) return;
    saveWorkerProgress(todayKey, currentWorker.id, taskProgress);
  }, [currentWorker, progressKey, taskProgress, todayKey]);

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(null);
      if (!currentWorker) {
        setScreen("home");
      } else if (screen !== "home") {
        setScreen("timeline");
      }
      return;
    }

    if (selectedTaskId && tasks.some((task) => task.id === selectedTaskId)) return;

    const activeTask = tasks.find((task) => {
      const status = taskProgress[task.id]?.status ?? "pending";
      return status === "working" || status === "paused";
    });
    const pendingTask = tasks.find((task) => (taskProgress[task.id]?.status ?? "pending") === "pending");

    setSelectedTaskId(activeTask?.id ?? pendingTask?.id ?? tasks[0]?.id ?? null);
  }, [currentWorker, screen, selectedTaskId, taskProgress, tasks]);

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
    [currentWorker, now, selectedSiteId, siteName],
  );

  const pendingNotices = useMemo(
    () => notifications.filter((notice) => !dismissedNoticeIds.includes(notice.id)),
    [dismissedNoticeIds, notifications],
  );
  const priorityNotice = pendingNotices.find((notice) => notice.type !== "announce") ?? pendingNotices[0] ?? null;

  useEffect(() => {
    if (screen !== "input" || !priorityNotice) return;
    if (priorityNotice.type === "announce") return;
    setDirectiveVisible(true);
  }, [priorityNotice, screen]);

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
    setScreen("feedback");
  };

  useEffect(() => {
    if (screen !== "feedback") return;

    const timeoutId = window.setTimeout(() => {
      const nextTask = tasks.find((task) => (taskProgress[task.id]?.status ?? "pending") !== "completed");
      setSelectedTaskId(nextTask?.id ?? null);
      setScreen("timeline");
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [screen, taskProgress, tasks]);

  const getTaskDraftQuantity = (taskId: string) => Math.max(0, Number(taskProgress[taskId]?.draftQuantity ?? 0));
  const changeTaskQuantity = (taskId: string, delta: number) => {
    updateTaskQuantity(taskId, getTaskDraftQuantity(taskId) + delta);
  };

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTaskStatus = selectedTask ? (taskProgress[selectedTask.id]?.status ?? "pending") : "pending";

  useEffect(() => {
    if (!selectedTask) return;
    if (screen === "prep" && selectedTaskStatus !== "pending") {
      setScreen(selectedTaskStatus === "completed" ? "timeline" : "input");
    }
    if (screen === "input" && selectedTaskStatus === "pending") {
      setScreen("prep");
    }
  }, [screen, selectedTask, selectedTaskStatus]);

  const activeTaskCount = tasks.filter((task) => {
    const status = taskProgress[task.id]?.status ?? "pending";
    return status === "working" || status === "paused";
  }).length;
  const completedCount = tasks.filter((task) => (taskProgress[task.id]?.status ?? "pending") === "completed").length;
  const dayCompleted = tasks.length > 0 && completedCount === tasks.length;
  const taskMeta = getTaskStateMeta(selectedTaskStatus);
  const selectedReportedQty = selectedTask ? getWorkerTaskReportedQuantity(taskProgress[selectedTask.id]) : 0;
  const selectedDraftQty = selectedTask ? getTaskDraftQuantity(selectedTask.id) : 0;
  const selectedDisplayQty = selectedReportedQty + selectedDraftQty;
  const selectedElapsedMs = selectedTask ? calculateElapsedMs(taskProgress[selectedTask.id], now) : 0;
  const selectedProgressRate = selectedTask?.targetQty
    ? clamp(Math.round((selectedDisplayQty / selectedTask.targetQty) * 100), 0, 100)
    : 0;
  const remainingEstimate = selectedTask
    ? estimateRemainingMinutes(selectedTask.targetQty, selectedDisplayQty, selectedElapsedMs, selectedTask.durationMinutes)
    : 0;
  const selectedSubmissionCount = selectedTask ? getWorkerTaskSubmissionLogs(taskProgress[selectedTask.id]).length : 0;
  const selectedLastReportedAt = selectedTask ? getWorkerTaskLastReportedAt(taskProgress[selectedTask.id]) : undefined;
  const nextPendingTask = selectedTask
    ? tasks.find(
        (task) =>
          task.id !== selectedTask.id
          && task.startMinutes >= selectedTask.startMinutes
          && (taskProgress[task.id]?.status ?? "pending") === "pending",
      )
    : null;

  useEffect(() => {
    if (!currentWorker || !dayCompleted || screen !== "timeline") return;

    const timeoutId = window.setTimeout(() => {
      setActiveWorkerId(null);
      setSelectedTaskId(null);
      setDirectiveVisible(false);
      setDismissedNoticeIds([]);
      setEmployeeCode("");
      setEmployeeCodeError("");
      setScreen("home");
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [currentWorker, dayCompleted, screen]);

  const submitEmployeeCode = () => {
    const normalized = employeeCode.trim().toUpperCase();
    if (!normalized) {
      setEmployeeCodeError("社員番号を入力してください。");
      return;
    }

    const numericCode = Number(normalized.replace(/\D/g, ""));
    const matchedWorker = Array.from(workerMap.values()).find((worker) => {
      const userId = worker.userId?.toUpperCase() ?? "";
      const workerId = worker.id.toUpperCase();
      const workerUserNumber = Number(userId.replace(/\D/g, ""));

      return userId === normalized
        || workerId === normalized
        || (
          Number.isFinite(numericCode)
          && numericCode > 0
          && Number.isFinite(workerUserNumber)
          && workerUserNumber === numericCode
        );
    });

    if (!matchedWorker) {
      setEmployeeCodeError("該当する社員番号が見つかりません。");
      return;
    }

    setEmployeeCode("");
    setEmployeeCodeError("");
    setDismissedNoticeIds([]);
    setDirectiveVisible(false);
    setSelectedTaskId(null);
    setActiveWorkerId(matchedWorker.id);
    setScreen("timeline");
  };

  const openTask = (task: BandTaskView) => {
    const status = taskProgress[task.id]?.status ?? "pending";
    if (status === "completed") return;
    setSelectedTaskId(task.id);
    setScreen(status === "pending" ? "prep" : "input");
  };

  const startSelectedTask = () => {
    if (!selectedTask) return;
    if (selectedTaskStatus === "completed") return;
    if (selectedTaskStatus === "pending") {
      updateTaskStatus(selectedTask.id, "working");
    }
    setScreen("input");
  };

  const acknowledgePriorityNotice = () => {
    if (!priorityNotice) {
      setDirectiveVisible(false);
      return;
    }

    setDismissedNoticeIds((current) => (current.includes(priorityNotice.id) ? current : [...current, priorityNotice.id]));
    setDirectiveVisible(false);
  };

  const resetNavSwipe = () => {
    navSwipeStartX.current = null;
    navSwipeStartY.current = null;
  };

  const handleNavPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (screen === "timeline" || screen === "feedback") return;
    if (isInteractiveNavTarget(event.target)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    navSwipeStartX.current = event.clientX;
    navSwipeStartY.current = event.clientY;
  };

  const handleNavPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (navSwipeStartX.current === null || navSwipeStartY.current === null) return;

    const deltaX = event.clientX - navSwipeStartX.current;
    const deltaY = event.clientY - navSwipeStartY.current;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetNavSwipe();

    if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    navigateHorizontal(deltaX > 0 ? "right" : "left");
  };

  const navigateHorizontal = (direction: "left" | "right") => {
    if (!selectedTask) return;

    if (screen === "prep") {
      if (direction === "right") {
        setScreen("timeline");
      } else {
        startSelectedTask();
      }
      return;
    }

    if (screen === "input") {
      if (direction === "right") {
        setScreen(selectedTaskStatus === "pending" ? "prep" : "timeline");
      } else if (selectedTaskStatus === "paused") {
        updateTaskStatus(selectedTask.id, "working");
      }
    }
  };

  const navigateVertical = (direction: "up" | "down") => {
    if (screen !== "timeline") return;
    timelineListRef.current?.scrollBy({
      top: direction === "down" ? 140 : -140,
      behavior: "smooth",
    });
  };

  const pageBackground = "bg-[radial-gradient(circle_at_top,#ffffff_0%,#f1f3f8_46%,#dfe4ee_100%)]";

  return (
    <div className={`min-h-screen overflow-hidden ${pageBackground}`}>
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.72),transparent_48%)]" />

        <div className="relative z-10 flex flex-col items-center">
          <BandShell>
            <div className="relative flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between text-[9px] font-medium tracking-[0.14em] text-slate-400">
                <span>{formatBandDateTime(now)}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="通知を表示"
                    onClick={() => {
                      if (priorityNotice) setDirectiveVisible(true);
                    }}
                    className={`inline-flex h-6 min-w-[38px] items-center justify-center gap-1 rounded-full border px-1.5 ${
                      priorityNotice
                        ? "border-cyan-300/30 bg-cyan-300/12 text-cyan-100"
                        : "border-white/10 bg-white/[0.04] text-slate-400"
                    }`}
                  >
                    <Bell className="h-3 w-3" />
                    <span>{pendingNotices.length}</span>
                  </button>
                  <div className="inline-flex h-6 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 text-slate-400">
                    <Signal className="h-3 w-3" />
                    <span>{signal}%</span>
                  </div>
                </div>
              </div>

              <div
                className="mt-2.5 flex min-h-0 flex-1 flex-col rounded-[26px] border border-white/10 bg-white/[0.04] px-2.5 py-2.5"
                onPointerDown={screen === "prep" || screen === "input" ? handleNavPointerDown : undefined}
                onPointerUp={screen === "prep" || screen === "input" ? handleNavPointerUp : undefined}
                onPointerCancel={screen === "prep" || screen === "input" ? resetNavSwipe : undefined}
              >
                {screen === "home" ? (
                  <div className="flex h-full flex-col justify-center">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.05] px-4 py-5 text-center">
                      <div className="text-[10px] tracking-[0.18em] text-slate-400">待機中</div>
                      <div className="mt-3 text-[22px] font-semibold tracking-[-0.05em] text-white">社員番号入力</div>
                      <div className="mt-2 text-[11px] leading-5 text-slate-300">
                        作業開始前に社員番号を入力してください。
                      </div>
                      <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 px-3 py-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoFocus
                          value={employeeCode}
                          onChange={(event) => {
                            setEmployeeCode(event.target.value);
                            if (employeeCodeError) setEmployeeCodeError("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              submitEmployeeCode();
                            }
                          }}
                          placeholder="例: U006"
                          className="h-12 w-full rounded-[16px] border border-white/10 bg-white/[0.08] px-3 text-center text-[20px] font-semibold tracking-[0.12em] text-white outline-none placeholder:text-slate-500"
                        />
                        {employeeCodeError ? (
                          <div className="mt-2 text-[10px] leading-5 text-rose-200">{employeeCodeError}</div>
                        ) : (
                          <div className="mt-2 text-[10px] leading-5 text-slate-400">社員番号または worker ID を入力</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={submitEmployeeCode}
                        className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#12b6ff_0%,#0b63ff_100%)] text-[13px] font-semibold text-white"
                      >
                        工程一覧へ進む
                      </button>
                    </div>
                  </div>
                ) : null}

                {screen === "timeline" ? (
                  dayCompleted ? (
                    <div className="flex h-full flex-col justify-center rounded-[24px] border border-emerald-400/18 bg-emerald-400/10 px-4 py-4 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/16">
                        <CheckCircle2 className="h-9 w-9 text-emerald-200" />
                      </div>
                      <div className="mt-4 text-[24px] font-semibold tracking-[-0.04em] text-white">本日の作業完了</div>
                      <div className="mt-2 text-[12px] leading-6 text-emerald-50/80">
                        全 {tasks.length} 工程が完了しました。
                        <br />
                        3秒後に社員番号入力へ戻ります。
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] tracking-[0.18em] text-slate-400">今日の工程</div>
                          <div className="mt-1 text-[15px] font-semibold text-white">{currentWorker?.name ?? "作業者未選択"}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{siteName}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
                          <div className="text-[9px] tracking-[0.14em] text-slate-400">完了 / 稼働中</div>
                          <div className="mt-1 text-[14px] font-semibold text-white">{completedCount} / {activeTaskCount}</div>
                        </div>
                      </div>

                      <div ref={timelineListRef} className="no-scrollbar mt-2.5 flex-1 space-y-2 overflow-y-auto pr-1">
                        {tasks.length === 0 ? (
                          <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.04] px-4 text-center">
                            <Lock className="h-8 w-8 text-slate-500" />
                            <div className="mt-3 text-[14px] font-semibold text-white">担当工程はありません</div>
                            <div className="mt-1 text-[10px] leading-5 text-slate-400">
                              現場配置で担当工程が設定されると、ここに表示されます。
                            </div>
                          </div>
                        ) : (
                          tasks.map((task) => {
                            const status = taskProgress[task.id]?.status ?? "pending";
                            const stateMeta = getTaskStateMeta(status);
                            const reportedQty = getWorkerTaskReportedQuantity(taskProgress[task.id]);
                            const draftQty = getTaskDraftQuantity(task.id);
                            const displayQty = reportedQty + draftQty;
                            const progressRate = task.targetQty > 0
                              ? clamp(Math.round((displayQty / task.targetQty) * 100), 0, 100)
                              : 0;
                            const isSelected = task.id === selectedTaskId;

                            return (
                              <button
                                key={task.id}
                                type="button"
                                disabled={status === "completed"}
                                onClick={() => openTask(task)}
                                className={`w-full rounded-[20px] border px-3 py-3 text-left transition ${
                                  isSelected ? "border-cyan-400/18 bg-cyan-400/10" : "border-white/8 bg-white/[0.04]"
                                } ${status === "completed" ? "cursor-default opacity-80" : ""}`}
                              >
                                <div className="flex items-start gap-2.5">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-black/20 text-[11px] font-semibold text-white">
                                    {status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : task.order}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="truncate text-[14px] font-semibold text-white">{task.processName}</div>
                                        <div className="mt-0.5 truncate text-[10px] text-slate-400">{task.shipperName}</div>
                                      </div>
                                      <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${stateMeta.chip}`}>
                                        {stateMeta.label}
                                      </span>
                                    </div>

                                    <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                                      <Clock3 className="h-3.5 w-3.5" />
                                      <span>{task.startTime} - {task.endTime}</span>
                                      <span>/ {formatDuration(task.durationMinutes)}</span>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-slate-300">
                                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1">
                                        送信累計 {formatCount(reportedQty)}
                                      </span>
                                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1">
                                        送信 {getWorkerTaskSubmissionLogs(taskProgress[task.id]).length} 回
                                      </span>
                                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1">
                                        目安 {formatCount(task.targetQty)}
                                      </span>
                                    </div>

                                    {(displayQty > 0 || status !== "pending") ? (
                                      <div className="mt-2.5">
                                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                                          <span>{displayQty} / {task.targetQty}</span>
                                          <span>{progressRate}%</span>
                                        </div>
                                        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/8">
                                          <div
                                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                                            style={{ width: `${displayQty > 0 ? Math.max(6, progressRate) : 0}%` }}
                                          />
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )
                ) : null}

                {screen === "prep" && selectedTask ? (
                  <div className="flex h-full flex-col gap-2.5">
                      <div>
                        <div className="text-[10px] tracking-[0.18em] text-slate-400">開始確認</div>
                      <div className="mt-1 text-[20px] font-semibold leading-tight text-white">{selectedTask.processName}</div>
                      <div className="mt-1 text-[11px] text-slate-400">{selectedTask.shipperName}</div>
                    </div>

                    <div className="grid gap-2">
                      <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                        <div className="text-[10px] tracking-[0.16em] text-slate-400">時間帯 / 目安件数</div>
                        <div className="mt-1 text-[13px] font-semibold text-white">
                          {selectedTask.startTime} - {selectedTask.endTime} / {selectedTask.targetQty} 件
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                        <div className="text-[10px] tracking-[0.16em] text-slate-400">累計送信 / 回数</div>
                        <div className="mt-1 text-[13px] font-semibold text-white">
                          {selectedReportedQty} 件 / {selectedSubmissionCount} 回
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={startSelectedTask}
                      className="flex min-h-[156px] flex-1 flex-col items-center justify-center rounded-[26px] bg-[linear-gradient(180deg,#12b6ff_0%,#0b63ff_100%)] px-4 text-center shadow-[0_0_40px_rgba(14,165,233,0.26)]"
                    >
                      <Play className="h-8 w-8 text-white" />
                      <div className="mt-3 text-[26px] font-semibold tracking-[-0.06em] text-white">作業開始</div>
                      <div className="mt-1.5 text-[10px] tracking-[0.14em] text-cyan-50/82">
                        左スワイプでも開始できます
                      </div>
                    </button>
                  </div>
                ) : null}

                {screen === "input" && selectedTask ? (
                  selectedTaskStatus === "paused" ? (
                    <div className="flex h-full flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] tracking-[0.18em] text-slate-400">中断中</div>
                          <div className="mt-1 text-[18px] font-semibold text-white">作業を中断しています</div>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${taskMeta.chip}`}>
                          {taskMeta.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                          <div className="text-[10px] tracking-[0.16em] text-slate-400">送信累計</div>
                          <div className="mt-1 text-[20px] font-semibold text-white">{selectedReportedQty}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                          <div className="text-[10px] tracking-[0.16em] text-slate-400">経過時間</div>
                          <div className="mt-1 text-[20px] font-semibold text-white">{formatElapsed(selectedElapsedMs)}</div>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col justify-center rounded-[24px] border border-amber-300/18 bg-amber-300/10 px-4 py-3.5 text-center">
                        <Pause className="mx-auto h-9 w-9 text-amber-100" />
                        <div className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-white">再開待ちです</div>
                        <div className="mt-1.5 text-[11px] leading-5 text-amber-50/78">
                          そのまま再開すると、モバイル端末と同じ進捗に続きで戻れます。
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateTaskStatus(selectedTask.id, "working")}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(180deg,#12b6ff_0%,#0b63ff_100%)] text-[13px] font-semibold text-white"
                      >
                        <Play className="h-4 w-4" />
                        作業再開
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] tracking-[0.18em] text-slate-400">作業中</div>
                          <div className="mt-0.5 truncate text-[17px] font-semibold leading-tight text-white">{selectedTask.processName}</div>
                          <div className="mt-0.5 truncate text-[10px] text-slate-400">{selectedTask.shipperName}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateTaskStatus(selectedTask.id, "paused")}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[16px] border border-white/10 bg-white/[0.05] px-3 text-[11px] font-semibold text-white"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          中断
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-2.5 py-2">
                          <div className="text-[9px] tracking-[0.14em] text-slate-400">今回送信</div>
                          <div className="mt-0.5 text-[18px] font-semibold leading-none text-white">{selectedDraftQty}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-2.5 py-2">
                          <div className="text-[9px] tracking-[0.14em] text-slate-400">送信累計</div>
                          <div className="mt-0.5 text-[18px] font-semibold leading-none text-white">{selectedReportedQty}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-2.5 py-2">
                          <div className="text-[9px] tracking-[0.14em] text-slate-400">経過</div>
                          <div className="mt-0.5 text-[15px] font-semibold leading-none text-white">{formatElapsed(selectedElapsedMs)}</div>
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>{selectedDisplayQty} / {selectedTask.targetQty}</span>
                          <span>残り目安 {remainingEstimate} 分</span>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                            style={{ width: `${selectedDisplayQty > 0 ? Math.max(6, selectedProgressRate) : 0}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-[46px_1fr_46px] items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => changeTaskQuantity(selectedTask.id, 10)}
                          className="inline-flex h-[52px] items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-[11px] font-semibold text-white"
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          onClick={() => changeTaskQuantity(selectedTask.id, 1)}
                          className="inline-flex h-[84px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#18c3a0_0%,#12a66d_100%)] text-[28px] font-semibold text-white shadow-[0_0_40px_rgba(16,185,129,0.25)]"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => changeTaskQuantity(selectedTask.id, -1)}
                          className="inline-flex h-[52px] items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-[10px] font-semibold text-white"
                        >
                          -1
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={selectedDraftQty <= 0}
                          onClick={() => submitTaskQuantity(selectedTask.id)}
                          className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[20px] text-[12px] font-semibold ${
                            selectedDraftQty > 0
                              ? "bg-[linear-gradient(180deg,#06b6d4_0%,#0284c7_100%)] text-white"
                              : "border border-white/10 bg-white/[0.05] text-slate-500"
                          }`}
                        >
                          <Send className="h-4 w-4" />
                          送信
                        </button>
                        <button
                          type="button"
                          onClick={() => completeTask(selectedTask.id)}
                          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(180deg,#34d399_0%,#10b981_100%)] text-[12px] font-semibold text-white"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {selectedDraftQty > 0 ? "送信して完了" : "完了"}
                        </button>
                      </div>

                      <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2 text-[10px] text-slate-300">
                        <div className="flex items-center justify-between gap-2">
                          <span>最新送信 {formatNotificationTime(selectedLastReportedAt)}</span>
                          <span>送信 {selectedSubmissionCount} 回</span>
                        </div>
                        {nextPendingTask ? (
                          <div className="mt-1 text-cyan-100/78">
                            次工程 {nextPendingTask.processName} / {nextPendingTask.startTime}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                ) : null}

                {screen === "feedback" && selectedTask ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-300/26 bg-emerald-300/12">
                      <CheckCircle2 className="h-12 w-12 text-emerald-200" />
                    </div>
                    <div className="mt-5 text-[28px] font-semibold tracking-[-0.06em] text-white">送信完了</div>
                    <div className="mt-2 text-[12px] leading-6 text-slate-300">
                      {selectedTask.processName} の進捗を保存しました。
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400">累計 {selectedReportedQty + selectedDraftQty} 件</div>
                    <div className="mt-5 h-1.5 w-28 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
                    </div>
                  </div>
                ) : null}
              </div>

              {(screen === "input" || screen === "feedback") && selectedTask ? (
                <div className="mt-2 text-center text-[9px] tracking-[0.14em] text-slate-500">
                  {screen === "input"
                    ? selectedTaskStatus === "paused"
                      ? "左で再開 / 右で一覧へ"
                      : "送信ログはモバイル端末と共通です"
                    : "完了後に一覧へ戻ります"}
                </div>
              ) : null}

              {directiveVisible && priorityNotice ? (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/88 px-3">
                  <div className="w-full rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(180deg,#0b1322_0%,#05070d_100%)] px-4 py-5 shadow-[0_0_44px_rgba(14,165,233,0.20)]">
                    <div className="text-[10px] tracking-[0.2em] text-cyan-100/74">通知 / 共通ストア</div>
                    <div className="mt-3 text-[25px] font-semibold leading-tight text-white">{priorityNotice.title}</div>
                    <div className="mt-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3 text-[13px] leading-6 text-slate-200">
                      {priorityNotice.message}
                    </div>
                    <div className="mt-2 text-[10px] tracking-[0.14em] text-slate-400">
                      {formatNotificationTime(priorityNotice.deliverAt)}
                    </div>
                    <button
                      type="button"
                      onClick={acknowledgePriorityNotice}
                      className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#12b6ff_0%,#0b63ff_100%)] text-[13px] font-semibold text-white"
                    >
                      確認して閉じる
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </BandShell>

          <div className="mt-4 flex flex-col items-center">
            <div className="rounded-[28px] border border-black/8 bg-white/70 px-4 py-3 shadow-[0_18px_40px_rgba(31,41,55,0.12)] backdrop-blur">
              <div className="grid grid-cols-3 grid-rows-3 gap-2">
                <div />
                <button
                  type="button"
                  aria-label="上へスクロール"
                  onClick={() => navigateVertical("up")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-300/70 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.97]"
                >
                  <ChevronUp className="h-5 w-5" />
                </button>
                <div />

                <button
                  type="button"
                  aria-label="右へ移動"
                  onClick={() => navigateHorizontal("right")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-300/70 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.97]"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-300/70 bg-[radial-gradient(circle_at_top,#0f172a_0%,#1e293b_100%)] text-[10px] font-semibold tracking-[0.14em] text-slate-200">
                  操作
                </div>
                <button
                  type="button"
                  aria-label="左へ移動"
                  onClick={() => navigateHorizontal("left")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-300/70 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.97]"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>

                <div />
                <button
                  type="button"
                  aria-label="下へスクロール"
                  onClick={() => navigateVertical("down")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-300/70 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.97]"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
                <div />
              </div>
            </div>
            <div className="mt-2 text-[10px] tracking-[0.14em] text-slate-500">上下ボタンで一覧を確認</div>
          </div>
        </div>
      </div>
    </div>
  );
}
