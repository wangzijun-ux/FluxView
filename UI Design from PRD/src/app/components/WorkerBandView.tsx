import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Lock,
  MapPin,
  Pause,
  Play,
  Plus,
  Signal,
} from "lucide-react";

type BandScreen = "timeline" | "prep" | "input" | "feedback";
type TaskState = "waiting" | "working" | "paused" | "done";

type TaskItem = {
  id: string;
  process: string;
  area: string;
  start: string;
  end: string;
  targetQty: number;
};

type NoticeItem = {
  id: string;
  title: string;
  body: string;
  at: string;
  unread: boolean;
  priority?: boolean;
  blocking?: boolean;
};

const TASKS: TaskItem[] = [
  { id: "t1", process: "入荷検品", area: "A-01", start: "08:30", end: "09:10", targetQty: 120 },
  { id: "t2", process: "棚入れ", area: "A-03", start: "09:15", end: "09:55", targetQty: 80 },
  { id: "t3", process: "ピッキング", area: "B-02", start: "10:00", end: "10:50", targetQty: 150 },
  { id: "t4", process: "補充搬送", area: "B-04", start: "11:00", end: "11:35", targetQty: 60 },
  { id: "t5", process: "出荷仕分け", area: "C-01", start: "13:00", end: "13:45", targetQty: 90 },
  { id: "t6", process: "返品確認", area: "D-02", start: "14:00", end: "14:35", targetQty: 45 },
  { id: "t7", process: "午後棚卸", area: "E-01", start: "15:00", end: "15:50", targetQty: 110 },
];

const DEMO_NOTICES: NoticeItem[] = [
  {
    id: "n1",
    title: "移動指示",
    body: "配置変更がありました。完了後は B-02 ではなく C-01 に移動してください。",
    at: "09:15",
    unread: true,
    priority: true,
    blocking: true,
  },
  {
    id: "n2",
    title: "安全確認",
    body: "B レーンでフォークリフト通行あり。横断前に停止確認。",
    at: "08:50",
    unread: true,
  },
  {
    id: "n3",
    title: "進捗共有",
    body: "午前の入荷便は予定比 +12%。ピッキング優先で進めてください。",
    at: "09:40",
    unread: false,
  },
  {
    id: "n4",
    title: "休憩案内",
    body: "11:50 から休憩です。現工程の切りが良いところで離脱してください。",
    at: "10:20",
    unread: true,
  },
];

const DEMO_TASK_INDEX = 2;
const DEMO_TASK_STATE: TaskState = "working";
const DEMO_QUANTITY = 96;
const DEMO_BATTERY = 64;
const DEMO_SIGNAL = 88;
const DEMO_ACCUMULATED_ACTIVE_MS = 17 * 60 * 1000;
const DEMO_ACTIVE_SINCE_OFFSET_MS = 6 * 60 * 1000;
const BAND_FRAME_IMAGE = "/watch_bg.png";
const BAND_SCREEN_INSET_STYLE = {
  left: "6.9%",
  right: "6.9%",
  top: "18.3%",
  bottom: "18.4%",
} as const;

function createDemoNotices() {
  return DEMO_NOTICES.map((notice) => ({ ...notice }));
}

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
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseTaskMinutes(task: TaskItem) {
  const [startHour, startMinute] = task.start.split(":").map(Number);
  const [endHour, endMinute] = task.end.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

function estimateRemainingMinutes(task: TaskItem, quantity: number, elapsedMs: number) {
  const remainingQty = Math.max(task.targetQty - quantity, 0);
  if (remainingQty === 0) return 0;

  if (quantity > 0 && elapsedMs > 0) {
    const pacePerItemMs = elapsedMs / quantity;
    return Math.max(1, Math.round((pacePerItemMs * remainingQty) / 60000));
  }

  const scheduledMinutes = Math.max(parseTaskMinutes(task), 1);
  return Math.max(1, Math.round((scheduledMinutes * remainingQty) / task.targetQty));
}

function getTaskStateMeta(taskState: TaskState) {
  switch (taskState) {
    case "working":
      return { label: "作業中", chip: "border-emerald-400/28 bg-emerald-400/18 text-emerald-100" };
    case "paused":
      return { label: "休憩中", chip: "border-amber-300/28 bg-amber-300/18 text-amber-50" };
    case "done":
      return { label: "完了", chip: "border-cyan-300/28 bg-cyan-300/18 text-cyan-50" };
    default:
      return { label: "開始前", chip: "border-white/14 bg-white/[0.08] text-white/72" };
  }
}

function isInteractiveNavTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("button, a, input, select, textarea, [role='button']"));
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
  const [screen, setScreen] = useState<BandScreen>("timeline");
  const [now, setNow] = useState(new Date());
  const [taskIndex, setTaskIndex] = useState(DEMO_TASK_INDEX);
  const [taskState, setTaskState] = useState<TaskState>(DEMO_TASK_STATE);
  const [quantity, setQuantity] = useState(DEMO_QUANTITY);
  const [battery, setBattery] = useState(DEMO_BATTERY);
  const [signal, setSignal] = useState(DEMO_SIGNAL);
  const [notices, setNotices] = useState<NoticeItem[]>(createDemoNotices);
  const [directiveVisible, setDirectiveVisible] = useState(false);
  const [dayCompleted, setDayCompleted] = useState(false);
  const [activeSinceMs, setActiveSinceMs] = useState<number | null>(() =>
    DEMO_TASK_STATE === "working" ? Date.now() - DEMO_ACTIVE_SINCE_OFFSET_MS : null,
  );
  const [accumulatedActiveMs, setAccumulatedActiveMs] = useState(DEMO_ACCUMULATED_ACTIVE_MS);
  const [completeHoldProgress, setCompleteHoldProgress] = useState(0);
  const completeHoldTimer = useRef<number | null>(null);
  const navSwipeStartX = useRef<number | null>(null);
  const navSwipeStartY = useRef<number | null>(null);
  const timelineListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const batteryTimer = window.setInterval(() => {
      setBattery((current) => Math.max(24, current - (Math.random() > 0.92 ? 1 : 0)));
      setSignal((current) => clamp(current + (Math.random() > 0.5 ? 3 : -4), 60, 100));
    }, 30_000);

    return () => window.clearInterval(batteryTimer);
  }, []);

  useEffect(() => {
    if (screen !== "feedback") return;

    const timeoutId = window.setTimeout(() => {
      const isLastTask = taskIndex >= TASKS.length - 1;

      if (isLastTask) {
        setDayCompleted(true);
        setScreen("timeline");
        return;
      }

      setTaskIndex((current) => current + 1);
      setTaskState("waiting");
      setQuantity(0);
      setAccumulatedActiveMs(0);
      setActiveSinceMs(null);
      setScreen("timeline");
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [screen, taskIndex]);

  useEffect(() => {
    const priorityNotice = notices.find((notice) => notice.priority && notice.blocking && notice.unread);
    if (screen === "input" && priorityNotice) {
      setDirectiveVisible(true);
    }
  }, [screen, notices]);

  useEffect(() => {
    return () => {
      if (completeHoldTimer.current !== null) {
        window.clearInterval(completeHoldTimer.current);
      }
    };
  }, []);

  const currentTask = TASKS[Math.min(taskIndex, TASKS.length - 1)];
  const nextTask = taskIndex < TASKS.length - 1 ? TASKS[taskIndex + 1] : null;
  const completedCount = dayCompleted ? TASKS.length : taskIndex;
  const unreadCount = notices.filter((notice) => notice.unread).length;
  const priorityNotice = notices.find((notice) => notice.priority && notice.unread) ?? null;
  const taskMeta = getTaskStateMeta(taskState);
  const elapsedMs = accumulatedActiveMs + (taskState === "working" && activeSinceMs ? now.getTime() - activeSinceMs : 0);
  const progressRate = clamp(Math.round((quantity / currentTask.targetQty) * 100), 0, 100);
  const remainingEstimate = estimateRemainingMinutes(currentTask, quantity, elapsedMs);
  const nextMoveHint = progressRate >= 90 && nextTask ? `次は ${nextTask.area} へ移動です` : "";

  const openPrep = () => {
    if (dayCompleted) return;
    setScreen("prep");
  };

  const startWork = () => {
    if (dayCompleted) return;

    if (taskState !== "working") {
      setTaskState("working");
      setActiveSinceMs(Date.now());
    }

    setScreen("input");
  };

  const pauseWork = () => {
    if (taskState !== "working") return;

    if (activeSinceMs !== null) {
      setAccumulatedActiveMs((current) => current + (Date.now() - activeSinceMs));
    }

    setActiveSinceMs(null);
    setTaskState("paused");
    setScreen("prep");
  };

  const resumeWork = () => {
    if (taskState !== "paused") return;
    setTaskState("working");
    setActiveSinceMs(Date.now());
  };

  const updateQuantity = (delta: number) => {
    if (taskState !== "working") return;
    setQuantity((current) => clamp(current + delta, 0, currentTask.targetQty));
  };

  const completeTask = () => {
    if (activeSinceMs !== null) {
      setAccumulatedActiveMs((current) => current + (Date.now() - activeSinceMs));
    }

    setActiveSinceMs(null);
    setTaskState("done");
    setQuantity(currentTask.targetQty);
    setCompleteHoldProgress(0);
    setDirectiveVisible(false);
    setScreen("feedback");
  };

  const cancelCompleteHold = () => {
    if (completeHoldTimer.current !== null) {
      window.clearInterval(completeHoldTimer.current);
      completeHoldTimer.current = null;
    }
    setCompleteHoldProgress(0);
  };

  const startCompleteHold = () => {
    if (taskState !== "working") return;
    cancelCompleteHold();

    const startedAt = Date.now();
    completeHoldTimer.current = window.setInterval(() => {
      const progress = clamp(((Date.now() - startedAt) / 900) * 100, 0, 100);
      setCompleteHoldProgress(progress);

      if (progress >= 100) {
        cancelCompleteHold();
        completeTask();
      }
    }, 40);
  };

  const resetDemo = () => {
    setScreen("timeline");
    setTaskIndex(DEMO_TASK_INDEX);
    setTaskState(DEMO_TASK_STATE);
    setQuantity(DEMO_QUANTITY);
    setBattery(DEMO_BATTERY);
    setSignal(DEMO_SIGNAL);
    setNotices(createDemoNotices());
    setDirectiveVisible(false);
    setDayCompleted(false);
    setAccumulatedActiveMs(DEMO_ACCUMULATED_ACTIVE_MS);
    setActiveSinceMs(DEMO_TASK_STATE === "working" ? Date.now() - DEMO_ACTIVE_SINCE_OFFSET_MS : null);
    cancelCompleteHold();
  };

  const acknowledgePriorityNotice = () => {
    const selected = notices.find((notice) => notice.priority && notice.unread);
    if (!selected) {
      setDirectiveVisible(false);
      return;
    }

    setNotices((current) =>
      current.map((notice) => (notice.id === selected.id ? { ...notice, unread: false } : notice)),
    );
    setDirectiveVisible(false);
  };

  const openTaskFromList = (index: number) => {
    if (index > taskIndex || dayCompleted) return;
    if (index === taskIndex) {
      setScreen("prep");
    }
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
    if (screen === "prep") {
      if (direction === "right") {
        setScreen("timeline");
      } else {
        startWork();
      }
      return;
    }

    if (screen === "input") {
      if (direction === "right") {
        setScreen("prep");
      } else if (taskState === "paused") {
        resumeWork();
      }
    }
  };

  const navigateVertical = (direction: "up" | "down") => {
    if (screen !== "timeline" || dayCompleted) return;
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
                    aria-label="全体連絡"
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
                    <span>{unreadCount}</span>
                  </button>
                  <div className="inline-flex h-6 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 text-slate-400">
                    <Signal className="h-3 w-3" />
                    <span>{signal}%</span>
                  </div>
                </div>
              </div>

              <div
                className="mt-2.5 flex min-h-0 flex-1 flex-col rounded-[26px] border border-white/10 bg-white/[0.04] px-2.5 py-2.5"
                onPointerDown={screen !== "timeline" && screen !== "feedback" ? handleNavPointerDown : undefined}
                onPointerUp={screen !== "timeline" && screen !== "feedback" ? handleNavPointerUp : undefined}
                onPointerCancel={screen !== "timeline" && screen !== "feedback" ? resetNavSwipe : undefined}
              >
                {screen === "timeline" ? (
                  dayCompleted ? (
                    <div className="flex h-full flex-col justify-center rounded-[24px] border border-emerald-400/18 bg-emerald-400/10 px-4 py-4 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/16">
                        <CheckCircle2 className="h-9 w-9 text-emerald-200" />
                      </div>
                      <div className="mt-4 text-[24px] font-semibold tracking-[-0.04em] text-white">本日の作業完了</div>
                      <div className="mt-2 text-[12px] leading-6 text-emerald-50/80">
                        全 {TASKS.length} 工程が完了しました。
                        <br />
                        お疲れ様でした。
                      </div>
                      <button
                        type="button"
                        onClick={resetDemo}
                        className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.08] text-[12px] font-semibold text-white"
                      >
                        もう一度デモ
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between text-[10px] tracking-[0.18em] text-slate-400">
                        <span>TODAY TASKS</span>
                        <span>{completedCount} / {TASKS.length} 完了</span>
                      </div>

                      <div ref={timelineListRef} className="no-scrollbar mt-2.5 flex-1 space-y-2 overflow-y-auto pr-1">
                        {TASKS.map((task, index) => {
                          const isDone = index < taskIndex;
                          const isCurrent = index === taskIndex;
                          const isLocked = index > taskIndex;
                          const cardTone = isCurrent
                            ? "border-cyan-400/18 bg-cyan-400/10 text-white"
                            : isDone
                              ? "border-emerald-400/14 bg-emerald-400/8 text-white/76"
                              : "border-white/8 bg-white/[0.04] text-slate-300";

                          return (
                            <button
                              key={task.id}
                              type="button"
                              disabled={isLocked}
                              onClick={() => openTaskFromList(index)}
                              className={`w-full rounded-[20px] border px-3 py-3 text-left transition ${cardTone} ${
                                isLocked ? "cursor-not-allowed opacity-60" : ""
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-black/20 text-[11px] font-semibold">
                                  {isDone ? <Check className="h-4 w-4" /> : isLocked ? <Lock className="h-4 w-4" /> : index + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className={`truncate font-semibold ${isCurrent ? "text-[15px]" : "text-[13px]"}`}>
                                      {task.process}
                                    </div>
                                    <span className="text-[10px] text-slate-400">{task.start}</span>
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                                    <span>{task.area}</span>
                                    <span>{task.end}</span>
                                  </div>

                                  {isCurrent ? (
                                    <div className="mt-2.5">
                                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>{taskMeta.label}</span>
                                        <span>
                                          {quantity} / {task.targetQty}
                                        </span>
                                      </div>
                                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8">
                                        <div
                                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                                          style={{ width: `${Math.max(6, progressRate)}%` }}
                                        />
                                      </div>
                                      <div className="mt-2 text-[10px] text-cyan-100/74">タップして開始前画面へ</div>
                                    </div>
                                  ) : null}

                                  {!isCurrent ? (
                                    <div className="mt-2 text-[10px] text-slate-400">
                                      {isDone ? "完了済み" : "ロック中"}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                    </div>
                  )
                ) : null}

                {screen === "prep" ? (
                  <div className="flex h-full flex-col gap-2.5">
                    <div>
                      <div className="text-[10px] tracking-[0.18em] text-slate-400">START CHECK</div>
                      <div className="mt-1 text-[20px] font-semibold leading-tight text-white">{currentTask.process}</div>
                    </div>

                    <div className="grid gap-2">
                      <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                        <div className="text-[10px] tracking-[0.16em] text-slate-400">作業エリア</div>
                        <div className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white">
                          <MapPin className="h-4 w-4 text-cyan-200" />
                          {currentTask.area}
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                        <div className="text-[10px] tracking-[0.16em] text-slate-400">予定 / 目標</div>
                        <div className="mt-1 text-[13px] font-semibold text-white">
                          {currentTask.start} - {currentTask.end} / {currentTask.targetQty} 件
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={startWork}
                      className={`flex min-h-[156px] flex-1 flex-col items-center justify-center rounded-[26px] px-4 text-center ${
                        taskState === "paused"
                          ? "bg-[linear-gradient(180deg,#f59e0b_0%,#d97706_100%)] shadow-[0_0_40px_rgba(245,158,11,0.24)]"
                          : "bg-[linear-gradient(180deg,#12b6ff_0%,#0b63ff_100%)] shadow-[0_0_40px_rgba(14,165,233,0.26)]"
                      }`}
                    >
                      {taskState === "paused" ? (
                        <Pause className="h-8 w-8 text-white" />
                      ) : (
                        <Play className="h-8 w-8 text-white" />
                      )}
                      <div className="mt-3 text-[26px] font-semibold tracking-[-0.06em] text-white">
                        {taskState === "paused" ? "中断中" : "作業開始"}
                      </div>
                      <div
                        className={`mt-1.5 text-[10px] tracking-[0.14em] ${
                          taskState === "paused" ? "text-amber-50/88" : "text-cyan-50/82"
                        }`}
                      >
                        {taskState === "paused" ? "タップでもう一度開始" : "タップで実績入力へ"}
                      </div>
                    </button>
                  </div>
                ) : null}

                {screen === "input" ? (
                  taskState === "paused" ? (
                    <div className="flex h-full flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[10px] tracking-[0.18em] text-slate-400">BREAK</div>
                          <div className="mt-1 text-[18px] font-semibold text-white">休憩・離席中</div>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${taskMeta.chip}`}>
                          {taskMeta.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                          <div className="text-[10px] tracking-[0.16em] text-slate-400">現在数</div>
                          <div className="mt-1 text-[20px] font-semibold text-white">{quantity}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                          <div className="text-[10px] tracking-[0.16em] text-slate-400">経過時間</div>
                          <div className="mt-1 text-[20px] font-semibold text-white">{formatElapsed(elapsedMs)}</div>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col justify-center rounded-[24px] border border-amber-300/18 bg-amber-300/10 px-4 py-3.5 text-center">
                        <Pause className="mx-auto h-9 w-9 text-amber-100" />
                        <div className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-white">入力を停止しています</div>
                        <div className="mt-1.5 text-[11px] leading-5 text-amber-50/78">
                          再開するとこの画面に戻り、
                          <br />
                          そのまま入力を続けられます。
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={resumeWork}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(180deg,#12b6ff_0%,#0b63ff_100%)] text-[13px] font-semibold text-white"
                      >
                        <Play className="h-4 w-4" />
                        再開
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] tracking-[0.18em] text-slate-400">WORKING NOW</div>
                          <div className="mt-0.5 text-[17px] font-semibold leading-tight text-white">{currentTask.process}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{currentTask.area}</div>
                        </div>
                        <button
                          type="button"
                          onClick={pauseWork}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[16px] border border-white/10 bg-white/[0.05] px-3 text-[11px] font-semibold text-white"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          中断
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-2.5 py-2">
                          <div className="text-[9px] tracking-[0.14em] text-slate-400">完了数</div>
                          <div className="mt-0.5 text-[18px] font-semibold leading-none text-white">{quantity}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-2.5 py-2">
                          <div className="text-[9px] tracking-[0.14em] text-slate-400">目標</div>
                          <div className="mt-0.5 text-[18px] font-semibold leading-none text-white">{currentTask.targetQty}</div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-2.5 py-2">
                          <div className="text-[9px] tracking-[0.14em] text-slate-400">経過</div>
                          <div className="mt-0.5 text-[15px] font-semibold leading-none text-white">{formatElapsed(elapsedMs)}</div>
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-white/10 bg-white/[0.05] px-3 py-2">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>完了見込み</span>
                          <span>あと約 {remainingEstimate} 分</span>
                        </div>
                        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                            style={{ width: `${Math.max(6, progressRate)}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-[46px_1fr_46px] items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(10)}
                          className="inline-flex h-[52px] items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-[11px] font-semibold text-white"
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQuantity(1)}
                          className="inline-flex h-[84px] items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,#18c3a0_0%,#12a66d_100%)] text-[28px] font-semibold text-white shadow-[0_0_40px_rgba(16,185,129,0.25)]"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQuantity(-1)}
                          className="inline-flex h-[52px] items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-[10px] font-semibold text-white"
                        >
                          訂正
                        </button>
                      </div>

                      {nextMoveHint ? (
                        <div className="rounded-[18px] border border-amber-300/20 bg-amber-300/12 px-3 py-2 text-[10px] font-medium text-amber-50">
                          {nextMoveHint}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onPointerDown={startCompleteHold}
                        onPointerUp={cancelCompleteHold}
                        onPointerLeave={cancelCompleteHold}
                        onPointerCancel={cancelCompleteHold}
                        className="relative mt-auto overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.05] px-4 py-2 text-left"
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-blue-600 transition-[width] duration-75"
                          style={{ width: `${completeHoldProgress}%` }}
                        />
                        <div className="relative flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] tracking-[0.18em] text-slate-300">COMPLETE REPORT</div>
                            <div className="mt-0.5 text-[13px] font-semibold text-white">長押しで完了報告</div>
                          </div>
                          <div className="text-[11px] font-medium text-white/72">{Math.round(completeHoldProgress)}%</div>
                        </div>
                      </button>
                    </div>
                  )
                ) : null}

                {screen === "feedback" ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-300/26 bg-emerald-300/12">
                      <CheckCircle2 className="h-12 w-12 text-emerald-200" />
                    </div>
                    <div className="mt-5 text-[28px] font-semibold tracking-[-0.06em] text-white">お疲れ様でした！</div>
                    <div className="mt-2 text-[12px] leading-6 text-slate-300">
                      {currentTask.process} の実績を保存しました。
                    </div>
                    <div className="mt-5 h-1.5 w-28 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
                    </div>
                  </div>
                ) : null}
              </div>

              {screen === "input" || screen === "feedback" ? (
                <div className="mt-2 text-center text-[9px] tracking-[0.14em] text-slate-500">
                  {screen === "input"
                    ? taskState === "paused"
                      ? "右滑で戻る / 左滑で再開"
                      : "右滑で開始前へ"
                    : "完了フィードバック"}
                </div>
              ) : null}

              {directiveVisible && priorityNotice ? (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/88 px-3">
                  <div className="w-full rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(180deg,#0b1322_0%,#05070d_100%)] px-4 py-5 shadow-[0_0_44px_rgba(14,165,233,0.20)]">
                    <div className="text-[10px] tracking-[0.2em] text-cyan-100/74">全体連絡 / 割り込み</div>
                    <div className="mt-3 text-[25px] font-semibold leading-tight text-white">{priorityNotice.title}</div>
                    <div className="mt-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3 text-[13px] leading-6 text-slate-200">
                      {priorityNotice.body}
                    </div>
                    <div className="mt-2 text-[10px] tracking-[0.14em] text-slate-400">{priorityNotice.at}</div>
                    <button
                      type="button"
                      onClick={acknowledgePriorityNotice}
                      className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#12b6ff_0%,#0b63ff_100%)] text-[13px] font-semibold text-white"
                    >
                      了解
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
                  aria-label="左へ移動"
                  onClick={() => navigateHorizontal("right")}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-300/70 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.97]"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-slate-300/70 bg-[radial-gradient(circle_at_top,#0f172a_0%,#1e293b_100%)] text-[10px] font-semibold tracking-[0.14em] text-slate-200">
                  SWIPE
                </div>
                <button
                  type="button"
                  aria-label="右へ移動"
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
            <div className="mt-2 text-[10px] tracking-[0.14em] text-slate-500">下のボタンで滑动を模拟</div>
          </div>
        </div>
      </div>
    </div>
  );
}
