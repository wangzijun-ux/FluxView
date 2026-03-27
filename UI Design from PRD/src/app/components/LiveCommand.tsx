import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import {
  DEFAULT_QUALIFICATION_ICON_KEY,
  DEFAULT_SKILL_ICON_KEY,
  getCapabilityToneClasses,
  getMasterIconOption,
  type MasterIconKey,
} from "./masterIconOptions";
import {
  buildBaseDeploymentSnapshot,
  buildDeploymentWorkflows,
  buildSiteScope,
  cloneSnapshot,
  createSeededDeploymentSnapshots,
  createTimeSlots,
  materializeSnapshot,
  parseTimeLabel,
  readDeploymentWorkers,
  readFieldDeploymentSnapshots,
  writeFieldDeploymentSnapshots,
  type AssignmentSnapshot,
  type DeploymentWorker,
  type DeploymentStep,
} from "./fieldDeploymentStore";
import { buildStepPlanDefaults, readProgressPlanStore, resolveStepPlanValues } from "./progressPlanStore";
import {
  buildReportedQuantityMap,
  buildWorkerSubmissionRecords,
  getTodayKey,
  pushAssignmentChangeNotifications,
} from "./workerMobileStore";
import { resolveWorkerShiftForDate } from "./attendanceStore";

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const TIME_INTERVAL_OPTIONS = [
  { value: 15, label: "15分" },
  { value: 30, label: "30分" },
  { value: 60, label: "1時間" },
] as const;

type TimeInterval = (typeof TIME_INTERVAL_OPTIONS)[number]["value"];
type BoardView = "card" | "table";
const CARD_PER_ROW_OPTIONS = [3, 4, 5] as const;
type CardsPerRow = (typeof CARD_PER_ROW_OPTIONS)[number];

function floorToInterval(totalMinutes: number, intervalMinutes: number) {
  const safeInterval = Math.max(5, intervalMinutes);
  return Math.floor(Math.max(0, totalMinutes) / safeInterval) * safeInterval;
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function findNearestTimeLabel(timeLabels: string[], targetMinutes: number) {
  if (timeLabels.length === 0) return "";

  return timeLabels.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(parseTimeLabel(nearest) - targetMinutes);
    const candidateDistance = Math.abs(parseTimeLabel(candidate) - targetMinutes);
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, timeLabels[0]);
}

function findTimeLabelAtOrAfter(timeLabels: string[], targetMinutes: number) {
  return timeLabels.find((timeLabel) => parseTimeLabel(timeLabel) >= targetMinutes) ?? timeLabels[timeLabels.length - 1] ?? "";
}

function findTimeLabelAtOrBefore(timeLabels: string[], targetMinutes: number) {
  for (let index = timeLabels.length - 1; index >= 0; index -= 1) {
    if (parseTimeLabel(timeLabels[index]) <= targetMinutes) return timeLabels[index];
  }
  return timeLabels[0] ?? "";
}

function calculateRequiredHeadcount(planned: number, uph: number, startTime: string, targetEndTime: string, fallback: number) {
  if (planned <= 0) return 0;
  const durationMinutes = parseTime(targetEndTime) - parseTime(startTime);
  if (durationMinutes <= 0 || uph <= 0) return Math.max(1, fallback);
  return Math.max(1, Math.ceil(planned / (uph * (durationMinutes / 60))));
}

function calculateRequiredPersonHours(planned: number, uph: number) {
  if (planned <= 0 || uph <= 0) return 0;
  return Number((planned / uph).toFixed(1));
}

type StatusTone = "on_track" | "delayed" | "not_started" | "done";

function isClockValue(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function calculateStepEta(params: {
  planned: number;
  actual: number;
  assignedCount: number;
  uph: number;
  startTime: string;
  selectedTime: string;
  selectedDate: string;
  todayKey: string;
}) {
  const { planned, actual, assignedCount, uph, startTime, selectedTime, selectedDate, todayKey } = params;
  if (planned <= 0) return "未設定";
  if (actual >= planned) return "完了";
  if (assignedCount <= 0 || uph <= 0) return "-";

  const startMinutes = parseTime(startTime);
  const selectedMinutes = selectedTime ? parseTime(selectedTime) : startMinutes;
  const referenceMinutes = selectedDate > todayKey ? startMinutes : Math.max(selectedMinutes, startMinutes);
  const hourlyCapacity = assignedCount * uph * 0.82;
  if (hourlyCapacity <= 0) return "-";

  const remaining = Math.max(planned - actual, 0);
  return formatTime(Math.min(referenceMinutes + (remaining / hourlyCapacity) * 60, 24 * 60 - 1));
}

function resolveStepStatus(params: {
  planned: number;
  actual: number;
  startTime: string;
  targetEndTime: string;
  eta: string;
  selectedTime: string;
  selectedDate: string;
  todayKey: string;
}) {
  const { planned, actual, startTime, targetEndTime, eta, selectedTime, selectedDate, todayKey } = params;
  if (planned <= 0) return "not_started" satisfies StatusTone;
  if (actual >= planned) return "done" satisfies StatusTone;
  if (selectedDate > todayKey) return "not_started" satisfies StatusTone;
  if (selectedDate < todayKey) return "delayed" satisfies StatusTone;

  const selectedMinutes = selectedTime ? parseTime(selectedTime) : parseTime(startTime);
  const startMinutes = parseTime(startTime);
  const targetMinutes = parseTime(targetEndTime);

  if (selectedMinutes <= startMinutes && actual === 0) return "not_started" satisfies StatusTone;
  if (isClockValue(eta) && parseTime(eta) > targetMinutes) return "delayed" satisfies StatusTone;
  if (selectedMinutes > targetMinutes && actual < planned) return "delayed" satisfies StatusTone;
  return "on_track" satisfies StatusTone;
}

function mergeStatuses(statuses: StatusTone[]) {
  if (statuses.length === 0) return "not_started" satisfies StatusTone;
  if (statuses.every((status) => status === "done")) return "done" satisfies StatusTone;
  if (statuses.some((status) => status === "delayed")) return "delayed" satisfies StatusTone;
  if (statuses.every((status) => status === "not_started")) return "not_started" satisfies StatusTone;
  return "on_track" satisfies StatusTone;
}

function resolveGroupEta(values: string[], plannedTotal: number, actualTotal: number) {
  if (plannedTotal <= 0) return "未設定";
  if (actualTotal >= plannedTotal) return "完了";

  const etaCandidates = values.filter(isClockValue);
  if (etaCandidates.length > 0) {
    return etaCandidates.reduce((latest, value) => (parseTime(value) > parseTime(latest) ? value : latest));
  }

  if (values.includes("未設定")) return "未設定";
  return "-";
}

function statusConfig(status: StatusTone) {
  switch (status) {
    case "done":
      return { label: "完了", className: "bg-emerald-500/10 text-emerald-500" };
    case "delayed":
      return { label: "遅延", className: "bg-amber-500/10 text-amber-500" };
    case "not_started":
      return { label: "未着手", className: "bg-slate-500/10 text-slate-500" };
    default:
      return { label: "進行中", className: "bg-cyan-500/10 text-cyan-500" };
  }
}

function hashString(value: string) {
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getWorkflowCardTone(seed: string, isDark: boolean) {
  const tones = [
    {
      surface: isDark ? "border-sky-400/20 bg-sky-500/10" : "border-sky-200 bg-sky-50/80",
      badge: isDark ? "border-sky-400/25 bg-sky-400/15 text-sky-200" : "border-sky-200 bg-sky-100 text-sky-700",
      metric: isDark ? "border-sky-400/15 bg-slate-950/40" : "border-sky-100 bg-white/90",
      progress: "bg-sky-500",
      link: isDark ? "text-sky-200" : "text-sky-700",
    },
    {
      surface: isDark ? "border-emerald-400/20 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50/80",
      badge: isDark ? "border-emerald-400/25 bg-emerald-400/15 text-emerald-200" : "border-emerald-200 bg-emerald-100 text-emerald-700",
      metric: isDark ? "border-emerald-400/15 bg-slate-950/40" : "border-emerald-100 bg-white/90",
      progress: "bg-emerald-500",
      link: isDark ? "text-emerald-200" : "text-emerald-700",
    },
    {
      surface: isDark ? "border-violet-400/20 bg-violet-500/10" : "border-violet-200 bg-violet-50/80",
      badge: isDark ? "border-violet-400/25 bg-violet-400/15 text-violet-200" : "border-violet-200 bg-violet-100 text-violet-700",
      metric: isDark ? "border-violet-400/15 bg-slate-950/40" : "border-violet-100 bg-white/90",
      progress: "bg-violet-500",
      link: isDark ? "text-violet-200" : "text-violet-700",
    },
    {
      surface: isDark ? "border-amber-400/20 bg-amber-500/10" : "border-amber-200 bg-amber-50/80",
      badge: isDark ? "border-amber-400/25 bg-amber-400/15 text-amber-200" : "border-amber-200 bg-amber-100 text-amber-700",
      metric: isDark ? "border-amber-400/15 bg-slate-950/40" : "border-amber-100 bg-white/90",
      progress: "bg-amber-500",
      link: isDark ? "text-amber-200" : "text-amber-700",
    },
    {
      surface: isDark ? "border-rose-400/20 bg-rose-500/10" : "border-rose-200 bg-rose-50/80",
      badge: isDark ? "border-rose-400/25 bg-rose-400/15 text-rose-200" : "border-rose-200 bg-rose-100 text-rose-700",
      metric: isDark ? "border-rose-400/15 bg-slate-950/40" : "border-rose-100 bg-white/90",
      progress: "bg-rose-500",
      link: isDark ? "text-rose-200" : "text-rose-700",
    },
  ] as const;

  return tones[hashString(seed) % tones.length];
}

function formatWorkerShiftLabel(workerId: string, workerName: string, dateKey: string) {
  const shift = resolveWorkerShiftForDate(workerId, dateKey) ?? resolveWorkerShiftForDate(workerName, dateKey);
  if (!shift) return "シフト未設定";
  if (shift.isOff) return "シフト休み";
  return `シフト ${shift.start} - ${shift.end}`;
}

function getWorkerStatusMeta(status: DeploymentWorker["status"]) {
  switch (status) {
    case "break":
      return {
        label: "休憩中",
        dotClass: "bg-amber-400",
        badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-500",
      };
    case "absent":
      return {
        label: "離席",
        dotClass: "bg-slate-400",
        badgeClass: "border-slate-500/20 bg-slate-500/10 text-slate-500",
      };
    default:
      return {
        label: "稼働中",
        dotClass: "bg-emerald-400",
        badgeClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
      };
  }
}

type DragState = {
  workerId: string;
  fromStepId: string | null;
};

type PlacementAlertState =
  | {
      message: string;
      tone: "warning" | "info";
      title?: string;
      details?: string[];
    }
  | null;

type AreaAssignmentSnapshot = Record<string, string>;

type CapabilityItem = {
  id: string;
  name: string;
  iconKey?: MasterIconKey;
};

type ProcessShipperRow = {
  workflowId: string;
  shipperId: string;
  shipperName: string;
  workflowName: string;
  stepIds: string[];
  assignedCount: number;
  assignedWorkers: Array<{
    id: string;
    workerId: string;
    sourceStepId: string | null;
  }>;
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
  startTime: string;
  targetEndTime: string;
  planned: number;
  actual: number;
  remaining: number;
  requiredPersonHours: number;
  eta: string;
  status: StatusTone;
  manuals: string[];
  cautions: string[];
};

type ProcessView = {
  areaId: string;
  areaName: string;
  areaDescription: string;
  processId: string;
  processName: string;
  description: string;
  startTime: string;
  targetEndTime: string;
  planned: number;
  actual: number;
  remaining: number;
  assignedCount: number;
  requiredHeadcount: number;
  assignedWorkers: Array<{
    id: string;
    workerId: string;
    sourceStepId: string | null;
  }>;
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
  manuals: string[];
  cautions: string[];
  targetStepId: string | null;
  shipperRows: ProcessShipperRow[];
};

type AreaView = {
  areaId: string;
  areaName: string;
  areaDescription: string;
  processViews: ProcessView[];
  assignedCount: number;
  requiredHeadcount: number;
};

type WorkflowCardView = {
  workflowId: string;
  workflowName: string;
  shipperId: string;
  shipperName: string;
  rows: Array<{
    areaView: AreaView;
    processView: ProcessView;
    row: ProcessShipperRow;
  }>;
  planned: number;
  actual: number;
  remaining: number;
  assignedCount: number;
  requiredPersonHours: number;
  status: StatusTone;
  areaNames: string[];
  processNames: string[];
};

type WorkerPoolSlot = {
  id: string;
  workerId: string;
  splitCount: number;
  worker: DeploymentWorker;
};

type RightTab = "staff" | "adjustments";

type AdjustmentListItem = {
  id: string;
  workerId: string;
  workerName: string;
  effectiveTime: string;
  previousAssignment: string;
  nextAssignment: string;
};

const FIELD_DEPLOYMENT_AREA_ASSIGNMENT_STORAGE_PREFIX = "fluxview-field-deployment-area-assignments-v1";

function buildAreaAssignmentStorageKey(siteId: string, dateKey?: string) {
  const scopeKey = siteId || "default";
  return dateKey
    ? `${FIELD_DEPLOYMENT_AREA_ASSIGNMENT_STORAGE_PREFIX}:${scopeKey}:${dateKey}`
    : `${FIELD_DEPLOYMENT_AREA_ASSIGNMENT_STORAGE_PREFIX}:${scopeKey}`;
}

function readAreaAssignmentSnapshots(siteId: string, dateKey?: string) {
  if (typeof window === "undefined") return {};

  try {
    const datedRaw = window.localStorage.getItem(buildAreaAssignmentStorageKey(siteId, dateKey));
    if (datedRaw) {
      const parsed = JSON.parse(datedRaw);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, AreaAssignmentSnapshot>;
      }
    }

    if (dateKey && dateKey === toDateInput(new Date())) {
      const fallbackRaw = window.localStorage.getItem(buildAreaAssignmentStorageKey(siteId));
      if (fallbackRaw) {
        const parsed = JSON.parse(fallbackRaw);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, AreaAssignmentSnapshot>;
        }
      }
    }
  } catch {
    return {};
  }

  return {};
}

function writeAreaAssignmentSnapshots(siteId: string, dateKey: string, snapshots: Record<string, AreaAssignmentSnapshot>) {
  if (typeof window === "undefined") return;

  const payload = JSON.stringify(snapshots);
  window.localStorage.setItem(buildAreaAssignmentStorageKey(siteId, dateKey), payload);

  if (dateKey === toDateInput(new Date())) {
    window.localStorage.setItem(buildAreaAssignmentStorageKey(siteId), payload);
  }
}

function buildAreaAssignmentKey(stepId: string, workerId: string) {
  return `${stepId}::${workerId}`;
}

function normalizeSnapshotsForTimeLabels(
  sourceSnapshots: Record<string, AssignmentSnapshot>,
  targetTimeLabels: string[],
  steps: DeploymentStep[],
  fallbackSnapshots: Record<string, AssignmentSnapshot> = {},
) {
  const emptySnapshot = materializeSnapshot({}, steps);
  const sourceEntries = Object.entries(sourceSnapshots)
    .map(([timeLabel, snapshot]) => ({
      minutes: parseTimeLabel(timeLabel),
      snapshot: materializeSnapshot(snapshot, steps),
    }))
    .sort((left, right) => left.minutes - right.minutes);

  let sourceIndex = 0;
  let lastSnapshot: AssignmentSnapshot | null = null;

  return Object.fromEntries(
    targetTimeLabels.map((timeLabel) => {
      const targetMinutes = parseTimeLabel(timeLabel);

      while (sourceIndex < sourceEntries.length && sourceEntries[sourceIndex].minutes <= targetMinutes) {
        lastSnapshot = sourceEntries[sourceIndex].snapshot;
        sourceIndex += 1;
      }

      const fallbackSnapshot = fallbackSnapshots[timeLabel] ?? emptySnapshot;
      return [timeLabel, cloneSnapshot(lastSnapshot ?? fallbackSnapshot)];
    }),
  ) as Record<string, AssignmentSnapshot>;
}

function normalizeAreaAssignmentsForTimeLabels(
  sourceSnapshots: Record<string, AreaAssignmentSnapshot>,
  targetTimeLabels: string[],
  fallbackSnapshots: Record<string, AreaAssignmentSnapshot> = {},
) {
  const sourceEntries = Object.entries(sourceSnapshots)
    .map(([timeLabel, snapshot]) => ({
      minutes: parseTimeLabel(timeLabel),
      snapshot: { ...snapshot },
    }))
    .sort((left, right) => left.minutes - right.minutes);

  let sourceIndex = 0;
  let lastSnapshot: AreaAssignmentSnapshot | null = null;

  return Object.fromEntries(
    targetTimeLabels.map((timeLabel) => {
      const targetMinutes = parseTimeLabel(timeLabel);

      while (sourceIndex < sourceEntries.length && sourceEntries[sourceIndex].minutes <= targetMinutes) {
        lastSnapshot = sourceEntries[sourceIndex].snapshot;
        sourceIndex += 1;
      }

      return [timeLabel, { ...(lastSnapshot ?? fallbackSnapshots[timeLabel] ?? {}) }];
    }),
  ) as Record<string, AreaAssignmentSnapshot>;
}

function resolveStepAreas(
  step: DeploymentStep,
  siteLayoutAreaMap: Map<string, Array<{ id: string; name: string; description: string }>>,
) {
  const siteAreas = siteLayoutAreaMap.get(step.siteId) ?? [];
  const areaById = new Map(siteAreas.map((area, index) => [area.id, { ...area, sortOrder: index }]));
  const uniqueAreaIds = Array.from(new Set((step.layoutAreaIds ?? []).filter(Boolean)));

  if (uniqueAreaIds.length === 0) {
    return [
      {
        areaId: `unassigned:${step.siteId}`,
        areaName: "未設定エリア",
        areaDescription: "この業務には区域が設定されていません。",
        sortOrder: Number.MAX_SAFE_INTEGER - 1,
      },
    ];
  }

  return uniqueAreaIds.map((areaId) => {
    const area = areaById.get(areaId);
    if (area) {
      return {
        areaId: area.id,
        areaName: area.name,
        areaDescription: area.description || "区域説明は未設定です。",
        sortOrder: area.sortOrder,
      };
    }

    return {
      areaId,
      areaName: "未登録エリア",
      areaDescription: "拠点詳細で定義されていない区域です。",
      sortOrder: Number.MAX_SAFE_INTEGER,
    };
  });
}

function resolveAssignedAreaId(params: {
  stepId: string;
  workerId: string;
  areaAssignments: AreaAssignmentSnapshot | undefined;
  stepLookup: Map<string, DeploymentStep>;
  stepAreaEntriesMap: Map<string, ReturnType<typeof resolveStepAreas>>;
}) {
  const { stepId, workerId, areaAssignments, stepLookup, stepAreaEntriesMap } = params;
  const step = stepLookup.get(stepId);
  if (!step) return null;

  const areaEntries = stepAreaEntriesMap.get(stepId) ?? [];
  const explicitAreaId = areaAssignments?.[buildAreaAssignmentKey(stepId, workerId)];
  if (explicitAreaId && areaEntries.some((entry) => entry.areaId === explicitAreaId)) {
    return explicitAreaId;
  }

  return areaEntries[0]?.areaId ?? null;
}

function findAssignedStepIds(snapshot: AssignmentSnapshot, workerId: string) {
  return Object.entries(snapshot)
    .filter(([, slots]) => slots.includes(workerId))
    .map(([stepId]) => stepId)
    .sort((left, right) => left.localeCompare(right, "ja"));
}

function buildAssignmentLabel(stepIds: string[], stepLookup: Map<string, DeploymentStep>) {
  if (stepIds.length === 0) return "未配置";

  const labels = Array.from(
    new Set(
      stepIds
        .map((stepId) => stepLookup.get(stepId)?.processName ?? "")
        .filter(Boolean),
    ),
  );

  return labels.length > 0 ? labels.join(" / ") : "未配置";
}

function countWorkerAssignments(snapshot: AssignmentSnapshot) {
  const counts = new Map<string, number>();

  Object.values(snapshot).forEach((workerIds) => {
    workerIds.forEach((workerId) => {
      counts.set(workerId, (counts.get(workerId) ?? 0) + 1);
    });
  });

  return counts;
}

function buildWorkerMaxAssignmentCountMap(snapshots: Record<string, AssignmentSnapshot>, minMinutes = 0) {
  const maxCounts = new Map<string, number>();

  Object.entries(snapshots).forEach(([timeLabel, snapshot]) => {
    if (parseTimeLabel(timeLabel) < minMinutes) return;
    countWorkerAssignments(snapshot).forEach((count, workerId) => {
      maxCounts.set(workerId, Math.max(maxCounts.get(workerId) ?? 0, count));
    });
  });

  return maxCounts;
}

function buildAdjustmentListItems(params: {
  timeLabels: string[];
  draftSnapshots: Record<string, AssignmentSnapshot>;
  savedSnapshots: Record<string, AssignmentSnapshot>;
  workers: DeploymentWorker[];
  stepLookup: Map<string, DeploymentStep>;
}) {
  const { timeLabels, draftSnapshots, savedSnapshots, workers, stepLookup } = params;
  const items: AdjustmentListItem[] = [];

  timeLabels.forEach((timeLabel, index) => {
    const currentSnapshot = draftSnapshots[timeLabel] ?? {};
    const savedSnapshot = savedSnapshots[timeLabel] ?? {};
    const previousCurrent = index > 0 ? draftSnapshots[timeLabels[index - 1]] ?? {} : {};
    const previousSaved = index > 0 ? savedSnapshots[timeLabels[index - 1]] ?? {} : {};

    workers.forEach((worker) => {
      const currentStepIds = findAssignedStepIds(currentSnapshot, worker.id);
      const savedStepIds = findAssignedStepIds(savedSnapshot, worker.id);
      const currentLabel = buildAssignmentLabel(currentStepIds, stepLookup);
      const savedLabel = buildAssignmentLabel(savedStepIds, stepLookup);
      if (currentLabel === savedLabel) return;

      const previousCurrentLabel = buildAssignmentLabel(findAssignedStepIds(previousCurrent, worker.id), stepLookup);
      const previousSavedLabel = buildAssignmentLabel(findAssignedStepIds(previousSaved, worker.id), stepLookup);
      if (index > 0 && previousCurrentLabel === currentLabel && previousSavedLabel === savedLabel) return;

      items.push({
        id: `${worker.id}:${timeLabel}:${savedLabel}:${currentLabel}`,
        workerId: worker.id,
        workerName: worker.name,
        effectiveTime: timeLabel,
        previousAssignment: savedLabel,
        nextAssignment: currentLabel,
      });
    });
  });

  return items.sort(
    (left, right) =>
      parseTime(left.effectiveTime) - parseTime(right.effectiveTime) ||
      left.workerName.localeCompare(right.workerName, "ja") ||
      left.nextAssignment.localeCompare(right.nextAssignment, "ja"),
  );
}

function WorkerCard({
  worker,
  subtitle,
  shiftLabel,
  splitCount = 1,
  muted = false,
  draggable = true,
  onDragStart,
  onDragEnd,
  onSplit,
  qualificationItems,
  skillItems,
  c,
}: {
  worker: DeploymentWorker;
  subtitle?: string;
  shiftLabel: string;
  splitCount?: number;
  muted?: boolean;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onSplit?: (workerId: string) => void;
  qualificationItems: CapabilityItem[];
  skillItems: CapabilityItem[];
  c: ReturnType<typeof useThemeColors>;
}) {
  const qualificationToneClasses = getCapabilityToneClasses("qualification");
  const skillToneClasses = getCapabilityToneClasses("skill");
  const statusMeta = getWorkerStatusMeta(worker.status);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const hoverCardRef = useRef<HTMLDivElement | null>(null);
  const [isHoverCardVisible, setIsHoverCardVisible] = useState(false);
  const [hoverCardPosition, setHoverCardPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isHoverCardVisible) return;

    const updateHoverCardPosition = () => {
      const triggerElement = triggerRef.current;
      if (!triggerElement) return;

      const triggerRect = triggerElement.getBoundingClientRect();
      const hoverCardRect = hoverCardRef.current?.getBoundingClientRect();
      const cardWidth = hoverCardRect?.width ?? 260;
      const cardHeight = hoverCardRect?.height ?? 220;
      const viewportPadding = 12;
      const gap = 10;

      let left = triggerRect.left + triggerRect.width / 2 - cardWidth / 2;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - cardWidth - viewportPadding));

      let top = triggerRect.bottom + gap;
      if (top + cardHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - cardHeight - gap);
      }

      setHoverCardPosition({ top, left });
    };

    updateHoverCardPosition();
    window.addEventListener("resize", updateHoverCardPosition);
    window.addEventListener("scroll", updateHoverCardPosition, true);

    return () => {
      window.removeEventListener("resize", updateHoverCardPosition);
      window.removeEventListener("scroll", updateHoverCardPosition, true);
    };
  }, [isHoverCardVisible, qualificationItems.length, skillItems.length, subtitle]);

  return (
    <div
      ref={triggerRef}
      className="relative shrink-0"
      onMouseEnter={() => setIsHoverCardVisible(true)}
      onMouseLeave={() => setIsHoverCardVisible(false)}
      onFocusCapture={() => setIsHoverCardVisible(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsHoverCardVisible(false);
        }
      }}
    >
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onContextMenu={(event) => {
          if (!onSplit) return;
          event.preventDefault();
          event.stopPropagation();
          onSplit(worker.id);
        }}
        tabIndex={0}
        aria-label={`${worker.name} / ${shiftLabel}`}
        className={[
          "relative inline-flex h-12 w-12 items-center justify-center rounded-full border shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
          muted ? `${c.borderCard} ${c.bgSurface}` : `${c.borderCard} ${c.bgPanel}`,
          draggable ? "cursor-grab active:cursor-grabbing hover:-translate-y-0.5" : "",
        ].join(" ")}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm ${worker.color} ${
            muted ? "opacity-75" : ""
          }`}
        >
          {worker.initials}
        </div>
        <span
          aria-hidden="true"
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 ${c.isDark ? "border-slate-900" : "border-white"} ${statusMeta.dotClass}`}
        />
        {splitCount > 1 && (
          <span
            className={`absolute -right-2 -top-2 inline-flex min-w-[32px] items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${
              c.isDark ? "border-sky-300/30 bg-sky-500 text-white" : "border-sky-200 bg-sky-500 text-white"
            }`}
          >
            1/{splitCount}
          </span>
        )}
      </div>

      {isHoverCardVisible && hoverCardPosition && createPortal(
        <div
          ref={hoverCardRef}
          className={`pointer-events-none fixed z-[120] w-[260px] rounded-2xl border p-3 text-left shadow-2xl ${c.bgCard} ${c.borderCard}`}
          style={{ top: hoverCardPosition.top, left: hoverCardPosition.left }}
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm ${worker.color}`}>
              {worker.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm font-semibold ${c.textPrimary}`}>{worker.name}</div>
              <div className={`mt-0.5 text-xs ${c.textSecondary}`}>{shiftLabel}</div>
              <div className={`mt-1 text-[11px] ${c.textMuted}`}>{worker.id}</div>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}>
              {statusMeta.label}
            </span>
          </div>

          {subtitle && (
            <div className={`mt-3 rounded-xl px-2.5 py-2 text-[11px] leading-5 ${c.bgSurface} ${c.textSecondary}`}>
              {subtitle}
            </div>
          )}

          {skillItems.length > 0 || qualificationItems.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {qualificationItems.length > 0 && (
                <div>
                  <div className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${c.textMuted}`}>資格</div>
                  <div className="flex flex-wrap gap-1.5">
                    {qualificationItems.map((item) => {
                      const iconOption = getMasterIconOption(item.iconKey, DEFAULT_QUALIFICATION_ICON_KEY);
                      const Icon = iconOption.icon;
                      return (
                        <span
                          key={item.id}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${qualificationToneClasses.surfaceClass}`}
                        >
                          <Icon className={`h-3 w-3 ${qualificationToneClasses.accentClass}`} />
                          <span className={qualificationToneClasses.accentClass}>{item.name}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {skillItems.length > 0 && (
                <div>
                  <div className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${c.textMuted}`}>スキル</div>
                  <div className="flex flex-wrap gap-1.5">
                    {skillItems.map((item) => {
                      const iconOption = getMasterIconOption(item.iconKey, DEFAULT_SKILL_ICON_KEY);
                      const Icon = iconOption.icon;
                      return (
                        <span
                          key={item.id}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${skillToneClasses.surfaceClass}`}
                        >
                          <Icon className={`h-3 w-3 ${skillToneClasses.accentClass}`} />
                          <span className={skillToneClasses.accentClass}>{item.name}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={`mt-3 text-[11px] ${c.textMuted}`}>登録済みの資格・スキルはありません</div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function LiveCommand() {
  const c = useThemeColors();
  const { sites, shippers, qualifications, skills, processes, workflows, selectedSiteId } = useMasterData();
  const qualificationToneClasses = getCapabilityToneClasses("qualification");
  const skillToneClasses = getCapabilityToneClasses("skill");
  const deploymentWorkers = useMemo(() => readDeploymentWorkers(), []);

  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [timeInterval, setTimeInterval] = useState<TimeInterval>(30);
  const [boardView, setBoardView] = useState<BoardView>("card");
  const [cardsPerRow, setCardsPerRow] = useState<CardsPerRow>(4);
  const [selectedTime, setSelectedTime] = useState("");
  const [keyword, setKeyword] = useState("");
  const [rightTab, setRightTab] = useState<RightTab>("staff");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [placementAlert, setPlacementAlert] = useState<PlacementAlertState>(null);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, AssignmentSnapshot>>({});
  const [draftSnapshots, setDraftSnapshots] = useState<Record<string, AssignmentSnapshot>>({});
  const [savedAreaAssignments, setSavedAreaAssignments] = useState<Record<string, AreaAssignmentSnapshot>>({});
  const [draftAreaAssignments, setDraftAreaAssignments] = useState<Record<string, AreaAssignmentSnapshot>>({});
  const [workerSplitOverrides, setWorkerSplitOverrides] = useState<Record<string, number>>({});
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const snapshotScopeRef = useRef("");

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!placementAlert) return;
    const timerId = window.setTimeout(() => setPlacementAlert(null), 4000);
    return () => window.clearTimeout(timerId);
  }, [placementAlert]);

  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const qualificationMap = useMemo(
    () => new Map(qualifications.map((qualification) => [qualification.id, qualification.name])),
    [qualifications],
  );
  const skillMap = useMemo(() => new Map(skills.map((skill) => [skill.id, skill.name])), [skills]);
  const qualificationDetailMap = useMemo(
    () => new Map(qualifications.map((qualification) => [qualification.id, qualification])),
    [qualifications],
  );
  const skillDetailMap = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const workerMap = useMemo(() => new Map(deploymentWorkers.map((worker) => [worker.id, worker])), [deploymentWorkers]);
  const workerNameMap = useMemo(
    () => new Map(deploymentWorkers.map((worker) => [worker.id, { id: worker.id, name: worker.name }])),
    [deploymentWorkers],
  );
  const qualificationItemsForIds = (ids: string[]) =>
    ids.map((id) => {
      const item = qualificationDetailMap.get(id);
      return {
        id,
        name: item?.name ?? id,
        iconKey: item?.iconKey,
      } satisfies CapabilityItem;
    });
  const skillItemsForIds = (ids: string[]) =>
    ids.map((id) => {
      const item = skillDetailMap.get(id);
      return {
        id,
        name: item?.name ?? id,
        iconKey: item?.iconKey,
      } satisfies CapabilityItem;
    });
  const workerShiftLabelMap = useMemo(
    () => new Map(deploymentWorkers.map((worker) => [worker.id, formatWorkerShiftLabel(worker.id, worker.name, selectedDate)])),
    [deploymentWorkers, selectedDate],
  );

  const scopedWorkflows = useMemo(
    () => workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)),
    [workflows, siteScope.siteIds],
  );
  const workflowViews = useMemo(
    () => buildDeploymentWorkflows(scopedWorkflows, shippers, sites, processes),
    [scopedWorkflows, shippers, sites, processes],
  );
  const siteLayoutAreaMap = useMemo(
    () =>
      new Map(
        sites.map((site) => [
          site.id,
          (site.layoutAreas ?? []).map((area) => ({
            id: area.id,
            name: area.name,
            description: area.description,
          })),
        ]),
      ),
    [sites],
  );
  const steps = useMemo(() => workflowViews.flatMap((workflow) => workflow.steps), [workflowViews]);
  const deploymentStepMap = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps]);
  const stepAreaEntriesMap = useMemo(
    () => new Map(steps.map((step) => [step.id, resolveStepAreas(step, siteLayoutAreaMap)])),
    [steps, siteLayoutAreaMap],
  );
  const stepMap = useMemo(
    () =>
      new Map(
        steps.map((step) => [
          step.id,
          {
            workflowName: step.workflowName,
            processName: step.processName,
          },
        ]),
      ),
    [steps],
  );

  const timeLabels = useMemo(
    () => createTimeSlots(timeInterval),
    [timeInterval],
  );

  useEffect(() => {
    if (selectedTime && timeLabels.includes(selectedTime)) return;
    const fallbackMinutes = selectedTime
      ? parseTimeLabel(selectedTime)
      : floorToInterval(now.getHours() * 60 + now.getMinutes(), timeInterval);
    const nearest = findNearestTimeLabel(timeLabels, fallbackMinutes);
    setSelectedTime(nearest);
  }, [selectedTime, timeLabels, now, timeInterval]);

  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container || !selectedTime) return;

    const target = container.querySelector<HTMLElement>(`[data-time-label="${selectedTime}"]`);
    if (!target) return;

    const nextLeft = Math.max(0, target.offsetLeft - container.clientWidth / 2 + target.clientWidth / 2);
    container.scrollTo({ left: nextLeft, behavior: "auto" });
  }, [selectedTime, timeLabels]);

  const seededSnapshots = useMemo(() => {
    if (steps.length === 0) return {};
    const baseSnapshot = buildBaseDeploymentSnapshot(steps, deploymentWorkers);
    return createSeededDeploymentSnapshots(timeLabels, steps, deploymentWorkers, baseSnapshot);
  }, [steps, timeLabels, deploymentWorkers]);
  const seededAreaAssignments = useMemo(
    () => Object.fromEntries(timeLabels.map((timeLabel) => [timeLabel, {}])) as Record<string, AreaAssignmentSnapshot>,
    [timeLabels],
  );

  const snapshotScopeKey = useMemo(
    () => `${siteScope.storageScopeKey}::${selectedDate}::${steps.map((step) => step.id).join("|")}`,
    [siteScope.storageScopeKey, selectedDate, steps],
  );

  useEffect(() => {
    if (steps.length === 0) {
      setSavedSnapshots({});
      setDraftSnapshots({});
      setSavedAreaAssignments({});
      setDraftAreaAssignments({});
      setWorkerSplitOverrides({});
      snapshotScopeRef.current = snapshotScopeKey;
      return;
    }

    if (snapshotScopeRef.current !== snapshotScopeKey) {
      const stored = readFieldDeploymentSnapshots(siteScope.storageScopeKey, selectedDate);
      const storedAreaAssignments = readAreaAssignmentSnapshots(siteScope.storageScopeKey, selectedDate);
      const nextSnapshots =
        Object.keys(stored).length > 0
          ? normalizeSnapshotsForTimeLabels(stored, timeLabels, steps, seededSnapshots)
          : seededSnapshots;
      const nextAreaAssignments =
        Object.keys(storedAreaAssignments).length > 0
          ? normalizeAreaAssignmentsForTimeLabels(storedAreaAssignments, timeLabels, seededAreaAssignments)
          : seededAreaAssignments;

      setSavedSnapshots(nextSnapshots);
      setDraftSnapshots(nextSnapshots);
      setSavedAreaAssignments(nextAreaAssignments);
      setDraftAreaAssignments(nextAreaAssignments);
      setWorkerSplitOverrides({});
      setPlacementAlert(null);
      snapshotScopeRef.current = snapshotScopeKey;
      return;
    }

    setSavedSnapshots((prev) => normalizeSnapshotsForTimeLabels(prev, timeLabels, steps, seededSnapshots));
    setDraftSnapshots((prev) => normalizeSnapshotsForTimeLabels(prev, timeLabels, steps, seededSnapshots));
    setSavedAreaAssignments((prev) => normalizeAreaAssignmentsForTimeLabels(prev, timeLabels, seededAreaAssignments));
    setDraftAreaAssignments((prev) => normalizeAreaAssignmentsForTimeLabels(prev, timeLabels, seededAreaAssignments));
  }, [snapshotScopeKey, siteScope.storageScopeKey, selectedDate, steps, timeLabels, seededSnapshots, seededAreaAssignments]);

  const records = useMemo(
    () =>
      buildWorkerSubmissionRecords({
        dateKey: selectedDate,
        selectedSiteId,
        sites,
        workflows,
        shippers,
        processes,
      }),
    [selectedDate, selectedSiteId, sites, workflows, shippers, processes],
  );
  const reportedQuantityMap = useMemo(() => buildReportedQuantityMap(records), [records]);
  const planStore = useMemo(() => readProgressPlanStore(), []);
  const dayPlans = planStore[selectedDate];
  const todayKey = getTodayKey();

  const stepMetrics = useMemo(() => {
    return new Map(
      workflowViews.flatMap((workflow, workflowIndex) =>
        workflow.steps.map((step, stepIndex) => {
          const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph);
          const plan = resolveStepPlanValues(dayPlans, step.id, {
            planned: defaults.planned,
            startTime: step.startTime,
            targetEndTime: step.targetEndTime,
          });
          const actual = reportedQuantityMap.get(step.id) ?? 0;
          const assignedCount = (draftSnapshots[selectedTime]?.[step.id] ?? []).filter(Boolean).length;
          const requiredHeadcount = calculateRequiredHeadcount(
            plan.planned,
            step.uph,
            plan.startTime,
            plan.targetEndTime,
            step.headcount,
          );
          const requiredPersonHours = calculateRequiredPersonHours(plan.planned, step.uph);
          const eta = calculateStepEta({
            planned: plan.planned,
            actual,
            assignedCount,
            uph: step.uph,
            startTime: plan.startTime,
            selectedTime,
            selectedDate,
            todayKey,
          });
          const status = resolveStepStatus({
            planned: plan.planned,
            actual,
            startTime: plan.startTime,
            targetEndTime: plan.targetEndTime,
            eta,
            selectedTime,
            selectedDate,
            todayKey,
          });

          return [
            step.id,
            {
              startTime: plan.startTime,
              targetEndTime: plan.targetEndTime,
              planned: plan.planned,
              actual,
              remaining: Math.max(plan.planned - actual, 0),
              assignedCount,
              requiredHeadcount,
              requiredPersonHours,
              eta,
              status,
            },
          ] as const;
        }),
      ),
    );
  }, [workflowViews, dayPlans, reportedQuantityMap, draftSnapshots, selectedTime, selectedDate, todayKey]);

  const currentSnapshot = draftSnapshots[selectedTime] ?? materializeSnapshot({}, steps);
  const currentAreaAssignments = draftAreaAssignments[selectedTime] ?? {};
  const currentWorkerAssignmentCounts = useMemo(() => countWorkerAssignments(currentSnapshot), [currentSnapshot]);
  const splitBaselineMinutes = selectedTime ? parseTimeLabel(selectedTime) : 0;
  const maxWorkerAssignmentCounts = useMemo(
    () => buildWorkerMaxAssignmentCountMap(draftSnapshots, splitBaselineMinutes),
    [draftSnapshots, splitBaselineMinutes],
  );
  const effectiveWorkerSplitCounts = useMemo(
    () =>
      new Map(
        deploymentWorkers.map((worker) => [
          worker.id,
          Math.max(workerSplitOverrides[worker.id] ?? 1, maxWorkerAssignmentCounts.get(worker.id) ?? 1),
        ]),
      ),
    [deploymentWorkers, workerSplitOverrides, maxWorkerAssignmentCounts],
  );

  const getAssignedAreaId = (stepId: string, workerId: string, areaAssignments: AreaAssignmentSnapshot | undefined) =>
    resolveAssignedAreaId({
      stepId,
      workerId,
      areaAssignments,
      stepLookup: deploymentStepMap,
      stepAreaEntriesMap,
    });

  const processViews = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const groupMap = new Map<string, DeploymentStep[]>();

    steps.forEach((step) => {
      const haystack = `${step.processName} ${step.description} ${step.manual} ${step.caution}`.toLowerCase();
      if (normalizedKeyword && !haystack.includes(normalizedKeyword)) return;

      const group = groupMap.get(step.processId) ?? [];
      group.push(step);
      groupMap.set(step.processId, group);
    });

    return Array.from(groupMap.entries())
      .map(([processId, groupedSteps]) => {
        const metricsList = groupedSteps.map((step) => {
          const metrics = stepMetrics.get(step.id);
          return {
            step,
            startTime: metrics?.startTime ?? step.startTime,
            targetEndTime: metrics?.targetEndTime ?? step.targetEndTime,
            planned: metrics?.planned ?? 0,
            actual: metrics?.actual ?? 0,
            remaining: metrics?.remaining ?? 0,
            assignedCount: metrics?.assignedCount ?? 0,
            requiredHeadcount: metrics?.requiredHeadcount ?? step.headcount,
            requiredPersonHours: metrics?.requiredPersonHours ?? calculateRequiredPersonHours(metrics?.planned ?? 0, step.uph),
            eta: metrics?.eta ?? "-",
            status: metrics?.status ?? "not_started",
            shortage: Math.max((metrics?.requiredHeadcount ?? step.headcount) - (metrics?.assignedCount ?? 0), 0),
          };
        });
        const sortedMetricsList = [...metricsList].sort(
          (left, right) =>
            parseTime(left.startTime) - parseTime(right.startTime) ||
            left.step.id.localeCompare(right.step.id, "ja"),
        );

        const targetStepId =
          [...sortedMetricsList]
            .sort(
              (left, right) =>
                right.shortage - left.shortage ||
                parseTime(left.startTime) - parseTime(right.startTime) ||
                left.step.id.localeCompare(right.step.id, "ja"),
            )[0]?.step.id ?? sortedMetricsList[0]?.step.id ?? null;

        const shipperGroupMap = new Map<string, typeof sortedMetricsList>();
        sortedMetricsList.forEach((item) => {
          const group = shipperGroupMap.get(`${item.step.workflowId}:${item.step.shipperId}`) ?? [];
          group.push(item);
          shipperGroupMap.set(`${item.step.workflowId}:${item.step.shipperId}`, group);
        });

        const shipperRows = Array.from(shipperGroupMap.values())
          .map((items) => {
            const startTime = items.reduce(
              (earliest, item) => (parseTime(item.startTime) < parseTime(earliest) ? item.startTime : earliest),
              items[0]?.startTime ?? "-",
            );
            const targetEndTime = items.reduce(
              (latest, item) => (parseTime(item.targetEndTime) > parseTime(latest) ? item.targetEndTime : latest),
              items[0]?.targetEndTime ?? "-",
            );
            const planned = items.reduce((sum, item) => sum + item.planned, 0);
            const actual = items.reduce((sum, item) => sum + item.actual, 0);
            const remaining = items.reduce((sum, item) => sum + item.remaining, 0);

            return {
              workflowId: items[0]?.step.workflowId ?? "",
              shipperId: items[0]?.step.shipperId ?? "",
              shipperName: items[0]?.step.shipperName ?? "未設定荷主",
              workflowName: items[0]?.step.workflowName ?? "未設定業務フロー",
              stepIds: items.map((item) => item.step.id),
              assignedCount: items.reduce((sum, item) => sum + item.assignedCount, 0),
              assignedWorkers: items.flatMap((item) =>
                (currentSnapshot[item.step.id] ?? []).map((workerId, index) => ({
                  id: `${processId}:${items[0]?.step.shipperId ?? "shipper"}:${item.step.id}:${workerId}:${index}`,
                  workerId,
                  sourceStepId: item.step.id,
                })),
              ),
              requiredQualificationIds: Array.from(new Set(items.flatMap((item) => item.step.requiredQualificationIds))),
              requiredSkillIds: Array.from(new Set(items.flatMap((item) => item.step.requiredSkillIds))),
              startTime,
              targetEndTime,
              planned,
              actual,
              remaining,
              requiredPersonHours: Number(items.reduce((sum, item) => sum + item.requiredPersonHours, 0).toFixed(1)),
              eta: resolveGroupEta(items.map((item) => item.eta), planned, actual),
              status: mergeStatuses(items.map((item) => item.status)),
              manuals: Array.from(new Set(items.map((item) => item.step.manual.trim()).filter(Boolean))),
              cautions: Array.from(new Set(items.map((item) => item.step.caution.trim()).filter(Boolean))),
            } satisfies ProcessShipperRow;
          })
          .sort(
            (left, right) =>
              parseTime(left.startTime) - parseTime(right.startTime) ||
              left.shipperName.localeCompare(right.shipperName, "ja"),
          );

        return {
          processId,
          processName: sortedMetricsList[0]?.step.processName ?? "未設定業務",
          description: sortedMetricsList[0]?.step.description ?? "",
          startTime: sortedMetricsList[0]?.startTime ?? "-",
          targetEndTime: sortedMetricsList.reduce((latest, item) => {
            return parseTime(item.targetEndTime) > parseTime(latest) ? item.targetEndTime : latest;
          }, sortedMetricsList[0]?.targetEndTime ?? "-"),
          planned: sortedMetricsList.reduce((sum, item) => sum + item.planned, 0),
          actual: sortedMetricsList.reduce((sum, item) => sum + item.actual, 0),
          remaining: sortedMetricsList.reduce((sum, item) => sum + item.remaining, 0),
          assignedCount: sortedMetricsList.reduce((sum, item) => sum + item.assignedCount, 0),
          requiredHeadcount: sortedMetricsList.reduce((sum, item) => sum + item.requiredHeadcount, 0),
          assignedWorkers: sortedMetricsList.flatMap((item) =>
            (currentSnapshot[item.step.id] ?? []).map((workerId, index) => ({
              id: `${processId}:${item.step.id}:${workerId}:${index}`,
              workerId,
              sourceStepId: item.step.id,
            })),
          ),
          requiredQualificationIds: Array.from(new Set(sortedMetricsList.flatMap((item) => item.step.requiredQualificationIds))),
          requiredSkillIds: Array.from(new Set(sortedMetricsList.flatMap((item) => item.step.requiredSkillIds))),
          manuals: Array.from(new Set(sortedMetricsList.map((item) => item.step.manual.trim()).filter(Boolean))),
          cautions: Array.from(new Set(sortedMetricsList.map((item) => item.step.caution.trim()).filter(Boolean))),
          targetStepId,
          shipperRows,
        } satisfies ProcessView;
      })
      .sort((left, right) => left.processName.localeCompare(right.processName, "ja"));
  }, [steps, keyword, stepMetrics, currentSnapshot]);
  const areaViews = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const groupedByArea = new Map<
      string,
      {
        areaId: string;
        areaName: string;
        areaDescription: string;
        sortOrder: number;
        steps: DeploymentStep[];
      }
    >();

    steps.forEach((step) => {
      resolveStepAreas(step, siteLayoutAreaMap).forEach((areaEntry) => {
        const haystack = `${areaEntry.areaName} ${step.processName} ${step.shipperName} ${step.description} ${step.manual} ${step.caution}`.toLowerCase();
        if (normalizedKeyword && !haystack.includes(normalizedKeyword)) return;

        const key = `${step.siteId}:${areaEntry.areaId}`;
        const bucket = groupedByArea.get(key) ?? {
          areaId: areaEntry.areaId,
          areaName: areaEntry.areaName,
          areaDescription: areaEntry.areaDescription,
          sortOrder: areaEntry.sortOrder,
          steps: [],
        };
        bucket.steps.push(step);
        groupedByArea.set(key, bucket);
      });
    });

    return Array.from(groupedByArea.values())
      .map((areaGroup) => {
        const processGroupMap = new Map<string, DeploymentStep[]>();

        areaGroup.steps.forEach((step) => {
          const bucket = processGroupMap.get(step.processId) ?? [];
          bucket.push(step);
          processGroupMap.set(step.processId, bucket);
        });

        const processViews = Array.from(processGroupMap.entries())
          .map(([processId, groupedSteps]) => {
            const metricsList = groupedSteps.map((step) => {
              const metrics = stepMetrics.get(step.id);
              return {
                step,
                startTime: metrics?.startTime ?? step.startTime,
                targetEndTime: metrics?.targetEndTime ?? step.targetEndTime,
                planned: metrics?.planned ?? 0,
                actual: metrics?.actual ?? 0,
                remaining: metrics?.remaining ?? 0,
                assignedCount: metrics?.assignedCount ?? 0,
                requiredHeadcount: metrics?.requiredHeadcount ?? step.headcount,
                requiredPersonHours: metrics?.requiredPersonHours ?? calculateRequiredPersonHours(metrics?.planned ?? 0, step.uph),
                eta: metrics?.eta ?? "-",
                status: metrics?.status ?? "not_started",
                shortage: Math.max((metrics?.requiredHeadcount ?? step.headcount) - (metrics?.assignedCount ?? 0), 0),
              };
            });

            const sortedMetricsList = [...metricsList].sort(
              (left, right) =>
                parseTime(left.startTime) - parseTime(right.startTime) ||
                left.step.id.localeCompare(right.step.id, "ja"),
            );

            const targetStepId =
              [...sortedMetricsList]
                .sort(
                  (left, right) =>
                    right.shortage - left.shortage ||
                    parseTime(left.startTime) - parseTime(right.startTime) ||
                    left.step.id.localeCompare(right.step.id, "ja"),
                )[0]?.step.id ?? sortedMetricsList[0]?.step.id ?? null;

            const shipperGroupMap = new Map<string, typeof sortedMetricsList>();
            sortedMetricsList.forEach((item) => {
              const bucket = shipperGroupMap.get(`${item.step.workflowId}:${item.step.shipperId}`) ?? [];
              bucket.push(item);
              shipperGroupMap.set(`${item.step.workflowId}:${item.step.shipperId}`, bucket);
            });

            const shipperRows = Array.from(shipperGroupMap.values())
              .map((items) => {
                const startTime = items.reduce(
                  (earliest, item) => (parseTime(item.startTime) < parseTime(earliest) ? item.startTime : earliest),
                  items[0]?.startTime ?? "-",
                );
                const targetEndTime = items.reduce(
                  (latest, item) => (parseTime(item.targetEndTime) > parseTime(latest) ? item.targetEndTime : latest),
                  items[0]?.targetEndTime ?? "-",
                );
                const planned = items.reduce((sum, item) => sum + item.planned, 0);
                const actual = items.reduce((sum, item) => sum + item.actual, 0);
                const remaining = items.reduce((sum, item) => sum + item.remaining, 0);
                const assignedWorkers = items.flatMap((item) =>
                  (currentSnapshot[item.step.id] ?? [])
                    .filter((workerId) => getAssignedAreaId(item.step.id, workerId, currentAreaAssignments) === areaGroup.areaId)
                    .map((workerId, index) => ({
                      id: `${areaGroup.areaId}:${processId}:${items[0]?.step.shipperId ?? "shipper"}:${item.step.id}:${workerId}:${index}`,
                      workerId,
                      sourceStepId: item.step.id,
                    })),
                );

                return {
                  workflowId: items[0]?.step.workflowId ?? "",
                  shipperId: items[0]?.step.shipperId ?? "",
                  shipperName: items[0]?.step.shipperName ?? "未設定荷主",
                  workflowName: items[0]?.step.workflowName ?? "未設定業務フロー",
                  stepIds: items.map((item) => item.step.id),
                  assignedCount: assignedWorkers.length,
                  assignedWorkers,
                  requiredQualificationIds: Array.from(new Set(items.flatMap((item) => item.step.requiredQualificationIds))),
                  requiredSkillIds: Array.from(new Set(items.flatMap((item) => item.step.requiredSkillIds))),
                  startTime,
                  targetEndTime,
                  planned,
                  actual,
                  remaining,
                  requiredPersonHours: Number(items.reduce((sum, item) => sum + item.requiredPersonHours, 0).toFixed(1)),
                  eta: resolveGroupEta(items.map((item) => item.eta), planned, actual),
                  status: mergeStatuses(items.map((item) => item.status)),
                  manuals: Array.from(new Set(items.map((item) => item.step.manual.trim()).filter(Boolean))),
                  cautions: Array.from(new Set(items.map((item) => item.step.caution.trim()).filter(Boolean))),
                } satisfies ProcessShipperRow;
              })
              .sort(
                (left, right) =>
                  parseTime(left.startTime) - parseTime(right.startTime) ||
                  left.shipperName.localeCompare(right.shipperName, "ja"),
              );
            const assignedWorkers = sortedMetricsList.flatMap((item) =>
              (currentSnapshot[item.step.id] ?? [])
                .filter((workerId) => getAssignedAreaId(item.step.id, workerId, currentAreaAssignments) === areaGroup.areaId)
                .map((workerId, index) => ({
                  id: `${areaGroup.areaId}:${processId}:${item.step.id}:${workerId}:${index}`,
                  workerId,
                  sourceStepId: item.step.id,
                })),
            );

            return {
              areaId: areaGroup.areaId,
              areaName: areaGroup.areaName,
              areaDescription: areaGroup.areaDescription,
              processId,
              processName: sortedMetricsList[0]?.step.processName ?? "未設定業務",
              description: sortedMetricsList[0]?.step.description ?? "",
              startTime: sortedMetricsList[0]?.startTime ?? "-",
              targetEndTime: sortedMetricsList.reduce(
                (latest, item) => (parseTime(item.targetEndTime) > parseTime(latest) ? item.targetEndTime : latest),
                sortedMetricsList[0]?.targetEndTime ?? "-",
              ),
              planned: sortedMetricsList.reduce((sum, item) => sum + item.planned, 0),
              actual: sortedMetricsList.reduce((sum, item) => sum + item.actual, 0),
              remaining: sortedMetricsList.reduce((sum, item) => sum + item.remaining, 0),
              assignedCount: assignedWorkers.length,
              requiredHeadcount: sortedMetricsList.reduce((sum, item) => sum + item.requiredHeadcount, 0),
              assignedWorkers,
              requiredQualificationIds: Array.from(new Set(sortedMetricsList.flatMap((item) => item.step.requiredQualificationIds))),
              requiredSkillIds: Array.from(new Set(sortedMetricsList.flatMap((item) => item.step.requiredSkillIds))),
              manuals: Array.from(new Set(sortedMetricsList.map((item) => item.step.manual.trim()).filter(Boolean))),
              cautions: Array.from(new Set(sortedMetricsList.map((item) => item.step.caution.trim()).filter(Boolean))),
              targetStepId,
              shipperRows,
            } satisfies ProcessView;
          })
          .sort((left, right) => left.processName.localeCompare(right.processName, "ja"));

        return {
          areaId: areaGroup.areaId,
          areaName: areaGroup.areaName,
          areaDescription: areaGroup.areaDescription,
          processViews,
          assignedCount: processViews.reduce((sum, processView) => sum + processView.assignedCount, 0),
          requiredHeadcount: processViews.reduce((sum, processView) => sum + processView.requiredHeadcount, 0),
          sortOrder: areaGroup.sortOrder,
        };
      })
      .filter((areaView) => areaView.processViews.length > 0)
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.areaName.localeCompare(right.areaName, "ja"),
      );
  }, [steps, keyword, stepMetrics, currentSnapshot, currentAreaAssignments, siteLayoutAreaMap]);
  const shipperCardViews = useMemo(
    () =>
      areaViews.flatMap((areaView) =>
        areaView.processViews.flatMap((processView) =>
          processView.shipperRows.map((row) => ({
            areaView,
            processView,
            row,
          })),
        ),
      ),
    [areaViews],
  );
  const workflowCardViews = useMemo(() => {
    const grouped = new Map<string, WorkflowCardView>();

    shipperCardViews.forEach(({ areaView, processView, row }) => {
      const key = row.workflowId || `${row.workflowName}:${row.shipperId}`;
      const current = grouped.get(key);

      if (current) {
        current.rows.push({ areaView, processView, row });
        current.planned += row.planned;
        current.actual += row.actual;
        current.remaining += row.remaining;
        current.assignedCount += row.assignedCount;
        current.requiredPersonHours = Number((current.requiredPersonHours + row.requiredPersonHours).toFixed(1));
        current.status = mergeStatuses([current.status, row.status]);
        if (!current.areaNames.includes(areaView.areaName)) current.areaNames.push(areaView.areaName);
        if (!current.processNames.includes(processView.processName)) current.processNames.push(processView.processName);
        return;
      }

      grouped.set(key, {
        workflowId: row.workflowId,
        workflowName: row.workflowName,
        shipperId: row.shipperId,
        shipperName: row.shipperName,
        rows: [{ areaView, processView, row }],
        planned: row.planned,
        actual: row.actual,
        remaining: row.remaining,
        assignedCount: row.assignedCount,
        requiredPersonHours: row.requiredPersonHours,
        status: row.status,
        areaNames: [areaView.areaName],
        processNames: [processView.processName],
      });
    });

    return Array.from(grouped.values())
      .map((workflowCard) => ({
        ...workflowCard,
        rows: [...workflowCard.rows].sort(
          (left, right) =>
            left.areaView.areaName.localeCompare(right.areaView.areaName, "ja") ||
            left.processView.processName.localeCompare(right.processView.processName, "ja") ||
            parseTime(left.row.startTime) - parseTime(right.row.startTime) ||
            left.row.shipperName.localeCompare(right.row.shipperName, "ja"),
        ),
        areaNames: [...workflowCard.areaNames].sort((left, right) => left.localeCompare(right, "ja")),
        processNames: [...workflowCard.processNames].sort((left, right) => left.localeCompare(right, "ja")),
      }))
      .sort(
        (left, right) =>
          left.workflowName.localeCompare(right.workflowName, "ja") ||
          left.shipperName.localeCompare(right.shipperName, "ja"),
      );
  }, [shipperCardViews]);
  const availableWorkerSlots = useMemo(
    () =>
      deploymentWorkers.flatMap((worker) => {
        const splitCount = effectiveWorkerSplitCounts.get(worker.id) ?? 1;
        const assignedCount = currentWorkerAssignmentCounts.get(worker.id) ?? 0;
        const remainingSlots = Math.max(splitCount - assignedCount, 0);

        return Array.from({ length: remainingSlots }, (_, index) => ({
          id: `${worker.id}:slot:${index + 1}:${splitCount}`,
          workerId: worker.id,
          splitCount,
          worker,
        })) satisfies WorkerPoolSlot[];
      }),
    [deploymentWorkers, effectiveWorkerSplitCounts, currentWorkerAssignmentCounts],
  );
  const activeWorkers = availableWorkerSlots.filter((slot) => slot.worker.status === "active");
  const standbyWorkers = availableWorkerSlots.filter((slot) => slot.worker.status !== "active");
  const canDeleteSplit =
    dragState !== null && (effectiveWorkerSplitCounts.get(dragState.workerId) ?? 1) > 1;
  const changedTimeLabels = useMemo(
    () =>
      new Set(
        timeLabels.filter((timeLabel) => {
          const draft = JSON.stringify(draftSnapshots[timeLabel] ?? {});
          const saved = JSON.stringify(savedSnapshots[timeLabel] ?? {});
          const draftArea = JSON.stringify(draftAreaAssignments[timeLabel] ?? {});
          const savedArea = JSON.stringify(savedAreaAssignments[timeLabel] ?? {});
          return draft !== saved || draftArea !== savedArea;
        }),
      ),
    [timeLabels, draftSnapshots, savedSnapshots, draftAreaAssignments, savedAreaAssignments],
  );
  const hasUnsavedChanges = changedTimeLabels.size > 0;
  const adjustmentItems = useMemo(
    () =>
      buildAdjustmentListItems({
        timeLabels,
        draftSnapshots,
        savedSnapshots,
        workers: deploymentWorkers,
        stepLookup: deploymentStepMap,
      }),
    [timeLabels, draftSnapshots, savedSnapshots, deploymentWorkers, deploymentStepMap],
  );

  const getRequirementWarningLines = (workerId: string, targetSteps: DeploymentStep[]) => {
    const worker = workerMap.get(workerId);
    if (!worker) return [];

    const missingQualifications = Array.from(
      new Set(
        targetSteps.flatMap((step) =>
          step.requiredQualificationIds
            .filter((id) => !worker.qualificationIds.includes(id))
            .map((id) => qualificationMap.get(id) ?? id),
        ),
      ),
    );
    const missingSkills = Array.from(
      new Set(
        targetSteps.flatMap((step) =>
          step.requiredSkillIds
            .filter((id) => !worker.skillIds.includes(id))
            .map((id) => skillMap.get(id) ?? id),
        ),
      ),
    );

    const warnings: string[] = [];
    if (missingQualifications.length > 0) warnings.push(`不足資格: ${missingQualifications.join(" / ")}`);
    if (missingSkills.length > 0) warnings.push(`不足スキル: ${missingSkills.join(" / ")}`);
    return warnings;
  };

  const getRequirementWarning = (workerId: string, step: DeploymentStep) =>
    getRequirementWarningLines(workerId, [step]).join(" / ");

  const getRequirementWarningForSteps = (workerId: string, targetSteps: DeploymentStep[]) => {
    return getRequirementWarningLines(workerId, targetSteps).join(" / ");
  };

  const splitWorker = (workerId: string) => {
    const worker = workerMap.get(workerId);
    if (!worker) return;

    const nextSplitCount = (effectiveWorkerSplitCounts.get(workerId) ?? 1) + 1;
    setWorkerSplitOverrides((prev) => ({
      ...prev,
      [workerId]: nextSplitCount,
    }));
    setPlacementAlert({
      tone: "info",
      message: `${worker.name} を 1/${nextSplitCount} で表示できるようにしました。`,
    });
  };

  const deleteWorkerSplit = (workerId: string, sourceStepId: string | null) => {
    const worker = workerMap.get(workerId);
    const currentSplitCount = effectiveWorkerSplitCounts.get(workerId) ?? 1;
    if (!worker || currentSplitCount <= 1) return;

    if (sourceStepId && selectedTime) {
      const nextSnapshots = { ...draftSnapshots };
      const nextAreaAssignments = { ...draftAreaAssignments };
      const selectedMinutes = parseTimeLabel(selectedTime);

      timeLabels.forEach((timeLabel) => {
        if (parseTimeLabel(timeLabel) < selectedMinutes) return;
        const sourceSnapshot = nextSnapshots[timeLabel] ?? materializeSnapshot({}, steps);
        const nextSnapshot = cloneSnapshot(sourceSnapshot);
        nextSnapshot[sourceStepId] = (nextSnapshot[sourceStepId] ?? []).filter(
          (assignedWorkerId) => assignedWorkerId !== workerId,
        );
        nextSnapshots[timeLabel] = materializeSnapshot(nextSnapshot, steps);

        const currentAreaSnapshot = { ...(nextAreaAssignments[timeLabel] ?? {}) };
        delete currentAreaSnapshot[buildAreaAssignmentKey(sourceStepId, workerId)];
        nextAreaAssignments[timeLabel] = currentAreaSnapshot;
      });

      setDraftSnapshots(nextSnapshots);
      setDraftAreaAssignments(nextAreaAssignments);
    }

    setWorkerSplitOverrides((prev) => {
      const nextSplitCount = Math.max(1, currentSplitCount - 1);
      if (nextSplitCount <= 1) {
        const next = { ...prev };
        delete next[workerId];
        return next;
      }
      return {
        ...prev,
        [workerId]: nextSplitCount,
      };
    });
    setPlacementAlert({
      tone: "info",
      message: `${worker.name} の分割枠を 1/${currentSplitCount} から 1/${Math.max(1, currentSplitCount - 1)} に戻しました。`,
    });
  };

  const applyPlacement = (
    workerId: string,
    processView: ProcessView,
    sourceStepId: string | null,
    targetShipper: ProcessShipperRow | null = null,
  ) => {
    const worker = workerMap.get(workerId);
    if (!worker) return;

    const candidateRows = targetShipper ? [targetShipper] : processView.shipperRows;
    const shipperOptions = candidateRows
      .map((row) => ({
        shipperId: row.shipperId,
        shipperName: row.shipperName,
        stepIds: row.stepIds,
      }))
      .filter((option) => option.stepIds.length > 0);

    if (shipperOptions.length === 0) return;

    const workerShift = resolveWorkerShiftForDate(worker.id, selectedDate) ?? resolveWorkerShiftForDate(worker.name, selectedDate);
    const selectedMinutes = parseTimeLabel(selectedTime || timeLabels[0] || "00:00");
    const shiftEnd =
      workerShift && !workerShift.isOff && isClockValue(workerShift.end)
        ? parseTime(workerShift.end)
        : isClockValue(targetShipper?.targetEndTime ?? processView.targetEndTime)
          ? parseTime(targetShipper?.targetEndTime ?? processView.targetEndTime)
          : selectedMinutes;

    const startTime =
      selectedTime && timeLabels.includes(selectedTime)
        ? selectedTime
        : findTimeLabelAtOrAfter(timeLabels, selectedMinutes);
    const baseEndTime =
      findTimeLabelAtOrBefore(timeLabels, shiftEnd) ||
      findTimeLabelAtOrAfter(timeLabels, shiftEnd) ||
      startTime;
    const endTime = parseTimeLabel(baseEndTime) < parseTimeLabel(startTime) ? startTime : baseEndTime;

    const selectedOptions = shipperOptions;
    const eligibleStepIds = Array.from(new Set(selectedOptions.flatMap((option) => option.stepIds)));
    if (eligibleStepIds.length === 0) return;

    const startMinutes = parseTimeLabel(startTime);
    const endMinutes = parseTimeLabel(endTime);
    if (endMinutes < startMinutes) return;
    const allowParallelAssignment = (workerSplitOverrides[worker.id] ?? 1) > 1;
    const nextSnapshots = { ...draftSnapshots };
    const nextAreaAssignments = { ...draftAreaAssignments };

    timeLabels.forEach((timeLabel) => {
      const timeMinutes = parseTimeLabel(timeLabel);
      if (timeMinutes < startMinutes || timeMinutes > endMinutes) return;

      const sourceSnapshot = nextSnapshots[timeLabel] ?? materializeSnapshot({}, steps);
      const nextSnapshot = cloneSnapshot(sourceSnapshot);
      const currentAreaSnapshot = { ...(nextAreaAssignments[timeLabel] ?? {}) };

      Object.keys(nextSnapshot).forEach((stepId) => {
        const containsWorker = (nextSnapshot[stepId] ?? []).includes(worker.id);
        if (!containsWorker) return;

        const assignedAreaId = getAssignedAreaId(stepId, worker.id, currentAreaSnapshot);
        const shouldRemove =
          !allowParallelAssignment ||
          assignedAreaId !== processView.areaId ||
          (sourceStepId !== null && stepId === sourceStepId);

        if (!shouldRemove) return;

        nextSnapshot[stepId] = (nextSnapshot[stepId] ?? []).filter(
          (assignedWorkerId) => assignedWorkerId !== worker.id,
        );
        delete currentAreaSnapshot[buildAreaAssignmentKey(stepId, worker.id)];
      });

      const targetStepId =
        [...eligibleStepIds]
          .map((stepId) => {
            const step = deploymentStepMap.get(stepId);
            const metrics = stepMetrics.get(stepId);
            return {
              stepId,
              startMinutes: parseTime(metrics?.startTime ?? step?.startTime ?? "00:00"),
              shortage: (metrics?.requiredHeadcount ?? step?.headcount ?? 0) - (nextSnapshot[stepId]?.length ?? 0),
            };
          })
          .sort(
            (left, right) =>
              right.shortage - left.shortage ||
              left.startMinutes - right.startMinutes ||
              left.stepId.localeCompare(right.stepId, "ja"),
          )[0]?.stepId ?? null;

      if (targetStepId) {
        nextSnapshot[targetStepId] = [...(nextSnapshot[targetStepId] ?? []), worker.id];
        currentAreaSnapshot[buildAreaAssignmentKey(targetStepId, worker.id)] = processView.areaId;
      }

      nextSnapshots[timeLabel] = materializeSnapshot(nextSnapshot, steps);
      nextAreaAssignments[timeLabel] = currentAreaSnapshot;
    });

    setDraftSnapshots(nextSnapshots);
    setDraftAreaAssignments(nextAreaAssignments);

    const selectedSteps = eligibleStepIds
      .map((stepId) => deploymentStepMap.get(stepId))
      .filter((step): step is DeploymentStep => Boolean(step));
    const requirementWarningLines = getRequirementWarningLines(worker.id, selectedSteps);
    const requirementWarning = requirementWarningLines.join(" / ");

    setPlacementAlert({
      tone: requirementWarning ? "warning" : "info",
      title: requirementWarning ? "資格・スキル不足を確認してください" : undefined,
      details: requirementWarning ? requirementWarningLines : undefined,
      message: (() => {
        const targetLabel = targetShipper?.shipperName
          ? `${processView.processName} / ${targetShipper.shipperName}`
          : processView.processName;
        return requirementWarning
          ? `${worker.name} を ${targetLabel} に ${startTime} - ${endTime} で配置しました。`
          : `${worker.name} を ${targetLabel} に ${startTime} - ${endTime} で配置しました。`;
      })(),
    });
  };

  const updateFutureSnapshots = (workerId: string, sourceStepId: string | null, targetStepId: string | null) => {
    if (!selectedTime) return;

    const targetStep = targetStepId ? deploymentStepMap.get(targetStepId) ?? null : null;
    const worker = workerMap.get(workerId);
    if (targetStep && worker) {
      const warningLines = getRequirementWarningLines(workerId, [targetStep]);
      const warning = warningLines.join(" / ");
      setPlacementAlert({
        tone: warning ? "warning" : "info",
        title: warning ? "資格・スキル不足を確認してください" : undefined,
        details: warning ? warningLines : undefined,
        message: warning
          ? `${worker.name} を ${targetStep.processName} に配置しました。`
          : `${worker.name} を ${targetStep.processName} に配置しました。`,
      });
    } else if (worker) {
      setPlacementAlert({
        tone: "info",
        message: `${worker.name} を未配置へ戻しました。`,
      });
    }

    const nextSnapshots = { ...draftSnapshots };
    const nextAreaAssignments = { ...draftAreaAssignments };
    const selectedMinutes = parseTimeLabel(selectedTime);

    timeLabels.forEach((timeLabel) => {
      if (parseTimeLabel(timeLabel) < selectedMinutes) return;

      const sourceSnapshot = nextSnapshots[timeLabel] ?? materializeSnapshot({}, steps);
      const nextSnapshot = cloneSnapshot(sourceSnapshot);
      const currentAreaSnapshot = { ...(nextAreaAssignments[timeLabel] ?? {}) };

      if (sourceStepId) {
        nextSnapshot[sourceStepId] = (nextSnapshot[sourceStepId] ?? []).filter(
          (assignedWorkerId) => assignedWorkerId !== workerId,
        );
        delete currentAreaSnapshot[buildAreaAssignmentKey(sourceStepId, workerId)];
      }

      if (targetStepId) {
        nextSnapshot[targetStepId] = [...(nextSnapshot[targetStepId] ?? []), workerId];
        const targetAreaId = getAssignedAreaId(targetStepId, workerId, currentAreaSnapshot);
        if (targetAreaId) {
          currentAreaSnapshot[buildAreaAssignmentKey(targetStepId, workerId)] = targetAreaId;
        }
      }

      nextSnapshots[timeLabel] = materializeSnapshot(nextSnapshot, steps);
      nextAreaAssignments[timeLabel] = currentAreaSnapshot;
    });

    setDraftSnapshots(nextSnapshots);
    setDraftAreaAssignments(nextAreaAssignments);
  };

  const moveTimeline = (direction: -1 | 1) => {
    const index = timeLabels.indexOf(selectedTime);
    if (index < 0) return;
    const nextIndex = Math.min(Math.max(index + direction, 0), timeLabels.length - 1);
    setSelectedTime(timeLabels[nextIndex]);
  };

  const resetUnsavedChanges = () => {
    const resetSnapshots = normalizeSnapshotsForTimeLabels(savedSnapshots, timeLabels, steps, seededSnapshots);
    const resetAreaAssignments = normalizeAreaAssignmentsForTimeLabels(
      savedAreaAssignments,
      timeLabels,
      seededAreaAssignments,
    );
    setDraftSnapshots(resetSnapshots);
    setDraftAreaAssignments(resetAreaAssignments);
    setPlacementAlert({
      tone: "info",
      message: "未保存の変更を破棄しました。",
    });
  };

  const saveChanges = () => {
    writeFieldDeploymentSnapshots(siteScope.storageScopeKey, selectedDate, draftSnapshots);
    writeAreaAssignmentSnapshots(siteScope.storageScopeKey, selectedDate, draftAreaAssignments);

    if (selectedDate === getTodayKey()) {
      Array.from(changedTimeLabels)
        .sort((left, right) => parseTimeLabel(left) - parseTimeLabel(right))
        .forEach((timeLabel) => {
          pushAssignmentChangeNotifications({
            siteId: selectedSiteId,
            effectiveTime: timeLabel,
            previousSnapshot: savedSnapshots[timeLabel] ?? materializeSnapshot({}, steps),
            nextSnapshot: draftSnapshots[timeLabel] ?? materializeSnapshot({}, steps),
            stepMap,
            workerMap: workerNameMap,
          });
        });
    }

    setSavedSnapshots(draftSnapshots);
    setSavedAreaAssignments(draftAreaAssignments);
    setLastSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeLabel = formatTime(floorToInterval(nowMinutes, timeInterval));
  const isSelectedDateToday = selectedDate === todayKey;
  const isSelectedDatePast = selectedDate < todayKey;
  const isSelectedDateFuture = selectedDate > todayKey;
  const boardLayoutClass =
    cardsPerRow === 5
      ? "xl:grid-cols-[minmax(0,1fr)_260px]"
      : cardsPerRow === 4
        ? "xl:grid-cols-[minmax(0,1fr)_280px]"
        : "xl:grid-cols-[minmax(0,1fr)_320px]";
  const cardsGridClass =
    cardsPerRow === 5
      ? "md:grid-cols-2 xl:grid-cols-5"
      : cardsPerRow === 4
        ? "md:grid-cols-2 xl:grid-cols-4"
        : "md:grid-cols-2 xl:grid-cols-3";
  const workerPoolContent = (
    <div className="grid gap-4">
      <div
        className={[
          "rounded-2xl border border-dashed p-3 transition",
          dragState?.fromStepId ? "border-cyan-500/50 bg-cyan-500/5" : `${c.borderCard}`,
        ].join(" ")}
        onDragOver={(event) => {
          if (!dragState?.fromStepId) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!dragState?.fromStepId) return;
          updateFutureSnapshots(dragState.workerId, dragState.fromStepId, null);
          setDragState(null);
        }}
      >
        <div className={`mb-2 text-xs font-medium ${c.textSecondary}`}>未配置の作業者</div>
        {dragState?.fromStepId && (
          <div className="mb-3 rounded-xl bg-cyan-500/10 px-3 py-2 text-xs text-cyan-600">
            ここへドロップすると未配置へ戻します。
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {activeWorkers.map((slot) => (
            <WorkerCard
              key={slot.id}
              worker={slot.worker}
              subtitle={slot.worker.note}
              shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
              splitCount={slot.splitCount}
              onSplit={splitWorker}
              qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
              skillItems={skillItemsForIds(slot.worker.skillIds)}
              onDragStart={() => setDragState({ workerId: slot.workerId, fromStepId: null })}
              onDragEnd={() => setDragState(null)}
              c={c}
            />
          ))}
          {activeWorkers.length === 0 && (
            <div className={`w-full rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
              未配置の作業者はいません
            </div>
          )}
        </div>
      </div>

      <div>
        <div className={`mb-2 text-xs font-medium ${c.textSecondary}`}>待機・離席</div>
        <div className="flex flex-wrap gap-2">
          {standbyWorkers.map((slot) => (
            <WorkerCard
              key={slot.id}
              worker={slot.worker}
              subtitle={slot.worker.note}
              shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
              splitCount={slot.splitCount}
              muted
              onSplit={splitWorker}
              qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
              skillItems={skillItemsForIds(slot.worker.skillIds)}
              onDragStart={() => setDragState({ workerId: slot.workerId, fromStepId: null })}
              onDragEnd={() => setDragState(null)}
              c={c}
            />
          ))}
          {standbyWorkers.length === 0 && (
            <div className={`w-full rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
              待機・離席の作業者はいません
            </div>
          )}
        </div>
      </div>

      <div
        className={[
          "rounded-2xl border border-dashed px-4 py-5 transition",
          canDeleteSplit ? "border-rose-400/60 bg-rose-500/8" : `${c.borderCard} ${c.bgSurface}`,
        ].join(" ")}
        onDragOver={(event) => {
          if (!canDeleteSplit) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!dragState || !canDeleteSplit) return;
          deleteWorkerSplit(dragState.workerId, dragState.fromStepId);
          setDragState(null);
        }}
      >
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <div
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${
              canDeleteSplit ? "border-rose-400/60 bg-rose-500/12 text-rose-500" : `${c.borderCard} ${c.textMuted}`
            }`}
          >
            <Trash2 className="h-5 w-5" />
          </div>
          <div className={`text-xs font-semibold ${canDeleteSplit ? "text-rose-500" : c.textSecondary}`}>
            分割枠を削除
          </div>
          <div className={`text-[11px] ${c.textMuted}`}>分割済みアイコンをここへドロップ</div>
        </div>
      </div>
    </div>
  );
  const workerPoolCompactContent = (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,6fr)_minmax(0,3fr)_minmax(0,1fr)]">
      <div
        className={[
          "rounded-2xl border border-dashed p-3 transition",
          dragState?.fromStepId ? "border-cyan-500/50 bg-cyan-500/5" : `${c.borderCard}`,
        ].join(" ")}
        onDragOver={(event) => {
          if (!dragState?.fromStepId) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!dragState?.fromStepId) return;
          updateFutureSnapshots(dragState.workerId, dragState.fromStepId, null);
          setDragState(null);
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className={`text-xs font-medium ${c.textSecondary}`}>未配置の作業者</div>
          {dragState?.fromStepId ? (
            <div className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-600">
              ここへ戻す
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {activeWorkers.map((slot) => (
            <WorkerCard
              key={slot.id}
              worker={slot.worker}
              subtitle={slot.worker.note}
              shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
              splitCount={slot.splitCount}
              onSplit={splitWorker}
              qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
              skillItems={skillItemsForIds(slot.worker.skillIds)}
              onDragStart={() => setDragState({ workerId: slot.workerId, fromStepId: null })}
              onDragEnd={() => setDragState(null)}
              c={c}
            />
          ))}
          {activeWorkers.length === 0 && (
            <div className={`w-full rounded-2xl border border-dashed px-4 py-5 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
              未配置の作業者はいません
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-2xl border border-dashed p-3 ${c.borderCard}`}>
        <div className={`mb-2 text-xs font-medium ${c.textSecondary}`}>待機・離席</div>
        <div className="flex flex-wrap gap-2">
          {standbyWorkers.map((slot) => (
            <WorkerCard
              key={slot.id}
              worker={slot.worker}
              subtitle={slot.worker.note}
              shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
              splitCount={slot.splitCount}
              muted
              onSplit={splitWorker}
              qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
              skillItems={skillItemsForIds(slot.worker.skillIds)}
              onDragStart={() => setDragState({ workerId: slot.workerId, fromStepId: null })}
              onDragEnd={() => setDragState(null)}
              c={c}
            />
          ))}
          {standbyWorkers.length === 0 && (
            <div className={`w-full rounded-2xl border border-dashed px-4 py-5 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
              待機・離席なし
            </div>
          )}
        </div>
      </div>

      <div
        className={[
          "rounded-2xl border border-dashed px-3 py-4 transition",
          canDeleteSplit ? "border-rose-400/60 bg-rose-500/8" : `${c.borderCard} ${c.bgSurface}`,
        ].join(" ")}
        onDragOver={(event) => {
          if (!canDeleteSplit) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!dragState || !canDeleteSplit) return;
          deleteWorkerSplit(dragState.workerId, dragState.fromStepId);
          setDragState(null);
        }}
      >
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <div
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${
              canDeleteSplit ? "border-rose-400/60 bg-rose-500/12 text-rose-500" : `${c.borderCard} ${c.textMuted}`
            }`}
          >
            <Trash2 className="h-4.5 w-4.5" />
          </div>
          <div className={`text-[11px] font-semibold ${canDeleteSplit ? "text-rose-500" : c.textSecondary}`}>分割枠を削除</div>
          <div className={`text-[10px] ${c.textMuted}`}>ここへドロップ</div>
        </div>
      </div>
    </div>
  );
  const adjustmentListContent = (
    <div className="grid gap-3">
      <div>
        <div className={`text-sm font-semibold ${c.textPrimary}`}>配置調整リスト</div>
        <div className={`mt-1 text-xs ${c.textSecondary}`}>未保存の変更候補を時刻順に確認できます。</div>
      </div>

      {adjustmentItems.length === 0 ? (
        <div className={`rounded-2xl px-4 py-8 text-center text-sm ${c.bgSurface} ${c.textMuted}`}>
          未保存の配置変更はありません
        </div>
      ) : (
        adjustmentItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedTime(item.effectiveTime)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${c.borderCard} ${c.bgSurface}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`text-sm font-semibold ${c.textPrimary}`}>{item.workerName}</div>
                <div className={`text-xs ${c.textSecondary}`}>変更時刻 {item.effectiveTime}</div>
              </div>
              <div className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                未保存
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className={c.textMuted}>変更前</div>
                <div className={`font-semibold ${c.textPrimary}`}>{item.previousAssignment}</div>
              </div>
              <div>
                <div className={c.textMuted}>変更後</div>
                <div className={`font-semibold ${c.textPrimary}`}>{item.nextAssignment}</div>
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <section className={`${c.bgCard} ${c.border} shrink-0 rounded-2xl border`}>
        <div className={`flex flex-col gap-4 border-b px-5 py-4 ${c.border}`}>
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto]">
            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>対象日</span>
              <div className="relative">
                <CalendarDays className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${c.textMuted}`} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className={`h-10 w-full rounded-xl border pl-10 pr-3 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                />
              </div>
            </label>

            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>検索</span>
              <div className="relative">
                <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${c.textMuted}`} />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="業務名 / マニュアル / 注意事項"
                  className={`h-10 w-full rounded-xl border pl-10 pr-3 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                />
              </div>
            </label>

            <div className="flex items-end justify-end gap-2">
              {lastSavedAt && (
                <span className={`inline-flex h-10 items-center rounded-xl border px-3 text-xs ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
                  最終保存: {lastSavedAt}
                </span>
              )}
              <button
                type="button"
                onClick={resetUnsavedChanges}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}
                disabled={!hasUnsavedChanges}
              >
                <RotateCcw className="h-4 w-4" />
                リセット
              </button>
              <button
                onClick={saveChanges}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#155DFC] px-4 text-sm font-semibold text-white transition hover:bg-[#0F4FE3] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!hasUnsavedChanges}
              >
                <Save className="h-4 w-4" />
                保存
              </button>
            </div>
          </div>

          <div className={`grid gap-3 overflow-hidden rounded-2xl border px-4 py-3 ${c.borderCard} ${c.bgPanel}`}>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`font-medium ${c.textSecondary}`}>配置タイムライン</span>
                <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>選択中: {selectedTime || "-"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className={`text-xs ${c.textMuted}`}>オレンジは未保存の変更、ライン上の点は現在時刻です。</div>
                <div className={`inline-flex rounded-xl border p-1 ${c.borderCard} ${c.bgCard}`}>
                  {TIME_INTERVAL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTimeInterval(option.value)}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        timeInterval === option.value
                          ? "bg-[#155DFC] text-white"
                          : `${c.textSecondary} hover:bg-[#155DFC]/10 hover:text-[#155DFC]`,
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className={`inline-flex rounded-xl border p-1 ${c.borderCard} ${c.bgCard}`}>
                  {([
                    { id: "card", label: "カード" },
                    { id: "table", label: "表" },
                  ] as const).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setBoardView(option.id)}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        boardView === option.id
                          ? "bg-[#155DFC] text-white"
                          : `${c.textSecondary} hover:bg-[#155DFC]/10 hover:text-[#155DFC]`,
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {boardView === "card" ? (
                  <div className={`inline-flex rounded-xl border p-1 ${c.borderCard} ${c.bgCard}`}>
                    {CARD_PER_ROW_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setCardsPerRow(option)}
                        className={[
                          "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                          cardsPerRow === option
                            ? "bg-[#155DFC] text-white"
                            : `${c.textSecondary} hover:bg-[#155DFC]/10 hover:text-[#155DFC]`,
                        ].join(" ")}
                      >
                        {option}列
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => moveTimeline(-1)}
                disabled={!selectedTime || selectedTime === timeLabels[0]}
                className={`rounded-xl border p-2 transition disabled:cursor-not-allowed disabled:opacity-40 ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div ref={timelineScrollRef} className="min-w-0 flex-1 overflow-x-auto pb-1">
                <div className="relative flex min-w-max items-start px-1">
                  <div className={`absolute left-7 right-7 top-[33px] h-px ${c.isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                  {timeLabels.map((timeLabel) => {
                    const slotMinutes = parseTimeLabel(timeLabel);
                    const isSelected = selectedTime === timeLabel;
                    const isCurrent = isSelectedDateToday && currentTimeLabel === timeLabel;
                    const isPast = isSelectedDatePast || (isSelectedDateToday && slotMinutes < nowMinutes && !isCurrent);
                    const isFuture = isSelectedDateFuture || (isSelectedDateToday && slotMinutes > nowMinutes);
                    const isChanged = changedTimeLabels.has(timeLabel);

                    const dotClass = isCurrent
                      ? "bg-cyan-500"
                      : isChanged
                        ? "bg-amber-500"
                        : isPast
                          ? c.isDark
                            ? "bg-slate-500"
                            : "bg-slate-300"
                          : c.isDark
                            ? "bg-slate-700"
                            : "bg-slate-500";
                    const ringClass = isSelected
                      ? isChanged
                        ? "ring-4 ring-amber-500/20"
                        : isCurrent
                          ? "ring-4 ring-cyan-500/20"
                          : "ring-4 ring-cyan-500/10"
                      : "";
                    const labelClass = isSelected
                      ? c.textPrimary
                      : isPast
                        ? c.textMuted
                        : c.textSecondary;
                    const statusLabel = isCurrent ? "現在" : isChanged ? "変更" : isFuture ? "未来" : "過去";

                    return (
                      <button
                        key={timeLabel}
                        type="button"
                        onClick={() => setSelectedTime(timeLabel)}
                        data-time-label={timeLabel}
                        className="relative z-10 shrink-0 px-3 py-1 text-center transition-transform hover:-translate-y-0.5"
                        aria-pressed={isSelected}
                      >
                        <div className={`h-4 text-[11px] font-semibold leading-4 tabular-nums ${labelClass}`}>{timeLabel}</div>
                        <div className="mt-2 flex h-5 items-center justify-center">
                          <span
                            className={[
                              "flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                              `${c.borderCard} ${c.bgCard}`,
                              ringClass,
                            ].join(" ")}
                          >
                            <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                          </span>
                        </div>
                        <div className={`mt-2 text-[10px] ${isSelected ? c.textPrimary : c.textMuted}`}>{statusLabel}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => moveTimeline(1)}
                disabled={!selectedTime || selectedTime === timeLabels[timeLabels.length - 1]}
                className={`rounded-xl border p-2 transition disabled:cursor-not-allowed disabled:opacity-40 ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {placementAlert && (
          <div
            className={[
              "border-b px-5 py-3",
              placementAlert.tone === "warning"
                ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                : "border-cyan-500/20 bg-cyan-500/10 text-cyan-500",
            ].join(" ")}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                {placementAlert.title ? (
                  <div className="text-sm font-semibold">{placementAlert.title}</div>
                ) : null}
                <div className="text-sm">{placementAlert.message}</div>
                {placementAlert.details && placementAlert.details.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {placementAlert.details.map((detail) => (
                      <span
                        key={detail}
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          placementAlert.tone === "warning"
                            ? "border border-amber-500/25 bg-white/70 text-amber-700"
                            : "border border-cyan-500/20 bg-white/70 text-cyan-700"
                        }`}
                      >
                        {detail}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </section>

      {boardView === "card" ? (
      <div className={`grid min-h-0 flex-1 gap-4 overflow-hidden ${boardLayoutClass}`}>
        <div className={`grid min-h-0 content-start gap-2.5 overflow-y-auto pr-1 ${cardsGridClass}`}>
          {workflowCardViews.flatMap((workflowCard) => {
            const workflowTone = getWorkflowCardTone(workflowCard.workflowId || workflowCard.workflowName, c.isDark);

            return workflowCard.rows.map(({ areaView, processView, row }) => {
                    const status = statusConfig(row.status);
                    const progressPercent = row.planned > 0 ? Math.min(100, Math.round((row.actual / row.planned) * 100)) : 0;

                    return (
                      <section
                        key={`${workflowCard.workflowId}:${areaView.areaId}:${processView.processId}:${row.shipperId}`}
                        className={[
                          "rounded-[18px] border p-3 shadow-sm transition-all duration-200",
                          dragState
                            ? "border-cyan-500/40 bg-cyan-500/5 shadow-cyan-500/10"
                            : workflowTone.surface,
                        ].join(" ")}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (!dragState) return;
                          applyPlacement(dragState.workerId, processView, dragState.fromStepId, row);
                          setDragState(null);
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-[22px] font-semibold leading-none tracking-[-0.03em] ${c.textPrimary}`}>
                              {processView.processName}
                            </div>
                          </div>
                          <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-sm ${status.className}`}>
                            {status.label}
                          </span>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${workflowTone.metric} ${c.textSecondary}`}>
                            {row.workflowName}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${workflowTone.badge}`}>
                            {areaView.areaName}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${workflowTone.metric} ${c.textSecondary}`}>
                            {row.shipperName}
                          </span>
                        </div>

                        <div className={`mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2.5 border-y py-3.5 ${c.borderCard}`}>
                          <div>
                            <div className={`text-[11px] font-medium ${c.textMuted}`}>開始予定</div>
                            <div className={`mt-1 text-[24px] font-semibold leading-none tabular-nums ${c.textPrimary}`}>
                              {row.startTime}
                            </div>
                          </div>
                          <div className={`pb-1 ${c.textMuted}`}>
                            <ArrowRight className="h-4 w-4" />
                          </div>
                          <div className="text-right">
                            <div className={`text-[11px] font-medium ${c.textMuted}`}>終了予定</div>
                            <div className={`mt-1 text-[24px] font-semibold leading-none tabular-nums ${c.textPrimary}`}>
                              {row.targetEndTime}
                            </div>
                          </div>
                          <div className="col-span-3 flex items-center justify-between pt-1">
                            <div className={`text-[11px] font-medium ${c.textMuted}`}>完了見込み</div>
                            <div className={`inline-flex items-center gap-1.5 text-[15px] font-semibold tabular-nums ${c.textPrimary}`}>
                              <Clock3 className="h-4 w-4" />
                              {row.eta}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2.5">
                          {[
                            { label: "予定数", value: `${row.planned.toLocaleString("ja-JP")} 件` },
                            { label: "実績数", value: `${row.actual.toLocaleString("ja-JP")} 件` },
                            { label: "残数", value: `${row.remaining.toLocaleString("ja-JP")} 件`, accent: "text-amber-500" },
                          ].map((metric) => (
                            <div key={`${row.shipperId}-${row.workflowId}-${metric.label}`} className={`rounded-xl border px-3 py-2.5 ${workflowTone.metric}`}>
                              <div className={`text-[11px] font-semibold ${c.textMuted}`}>{metric.label}</div>
                              <div className={`mt-1.5 text-[15px] font-semibold tabular-nums ${metric.accent ?? c.textPrimary}`}>
                                {metric.value}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className={`text-[12px] font-semibold ${c.textSecondary}`}>進捗推移</div>
                            <div className={`text-[13px] font-semibold tabular-nums ${c.textPrimary}`}>
                              {progressPercent}%
                            </div>
                          </div>
                          <div className={`mt-2 h-2 overflow-hidden rounded-full ${c.isDark ? "bg-slate-900/70" : "bg-slate-200"}`}>
                            <div
                              className={`h-full rounded-full transition-all ${workflowTone.progress}`}
                              style={{ width: `${Math.max(progressPercent, row.planned > 0 ? 6 : 0)}%` }}
                            />
                          </div>
                        </div>

                        <div className={`mt-3 flex items-center justify-between border-t pt-3 ${c.borderCard}`}>
                          <div className={`text-[13px] font-semibold ${c.textSecondary}`}>必要人時</div>
                          <div className={`text-[16px] font-semibold tabular-nums ${c.textPrimary}`}>
                            {row.requiredPersonHours.toFixed(1)} 人時
                          </div>
                        </div>

                        <div className={`mt-3 rounded-t-2xl border-t px-0 pt-3 ${c.borderCard}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className={`text-[13px] font-semibold ${c.textSecondary}`}>配置中の作業者 {row.assignedWorkers.length}名</div>
                          </div>
                          <div className={`mt-2.5 rounded-2xl border px-3 py-4 ${workflowTone.metric}`}>
                            <div className="flex flex-wrap items-start gap-2">
                            {row.assignedWorkers.length > 0 ? (
                              <>
                                {row.assignedWorkers.map((assignment) => {
                                  const worker = workerMap.get(assignment.workerId);
                                  if (!worker) return null;
                                  return (
                                    <WorkerCard
                                      key={assignment.id}
                                      worker={worker}
                                      subtitle={worker.note}
                                      shiftLabel={workerShiftLabelMap.get(worker.id) ?? "シフト未設定"}
                                      splitCount={effectiveWorkerSplitCounts.get(worker.id) ?? 1}
                                      onSplit={splitWorker}
                                      qualificationItems={qualificationItemsForIds(worker.qualificationIds)}
                                      skillItems={skillItemsForIds(worker.skillIds)}
                                      onDragStart={() => setDragState({ workerId: worker.id, fromStepId: assignment.sourceStepId })}
                                      onDragEnd={() => setDragState(null)}
                                      c={c}
                                    />
                                  );
                                })}
                                <div
                                  aria-label={`${row.shipperName} にドロップ`}
                                  className={`inline-flex h-12 w-12 items-center justify-center rounded-full border border-dashed ${c.borderCard} ${c.textMuted} ${c.bgCard}`}
                                >
                                  <Plus className="h-5 w-5" />
                                </div>
                              </>
                            ) : (
                              <div className={`w-full rounded-2xl border border-dashed px-4 py-4 text-center text-sm ${c.borderCard} ${c.textMuted} ${c.bgCard}`}>
                                ここへドロップしてこの荷主に配置
                              </div>
                            )}
                            </div>
                          </div>
                        </div>
                      </section>
                    );
                  });
          })}

          {workflowCardViews.length === 0 && (
            <section className={`${c.bgCard} ${c.border} col-span-full rounded-2xl border p-10 text-center`}>
              <div className={`text-base font-medium ${c.textPrimary}`}>表示できる業務がありません</div>
              <div className={`mt-2 text-sm ${c.textSecondary}`}>
                検索条件を見直すか、対象日に業務と区域の設定があるか確認してください。
              </div>
            </section>
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          <section className={`${c.bgCard} ${c.border} flex min-h-0 flex-1 flex-col rounded-2xl border`}>
            <div className={`border-b px-4 py-4 ${c.border}`}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRightTab("staff")}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${rightTab === "staff" ? "bg-[#155DFC] text-white" : `${c.bgSurface} ${c.textSecondary}`}`}
                >
                  <Users className="h-4 w-4" />
                  作業者プール
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab("adjustments")}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${rightTab === "adjustments" ? "bg-[#155DFC] text-white" : `${c.bgSurface} ${c.textSecondary}`}`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  調整リスト
                  {adjustmentItems.length > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${rightTab === "adjustments" ? "bg-white/20 text-white" : "bg-amber-500/10 text-amber-500"}`}>
                      {adjustmentItems.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {rightTab === "staff" ? (
                <div className="grid gap-4">
                  <div
                    className={[
                      "rounded-2xl border border-dashed p-3 transition",
                      dragState?.fromStepId ? "border-cyan-500/50 bg-cyan-500/5" : `${c.borderCard}`,
                    ].join(" ")}
                    onDragOver={(event) => {
                      if (!dragState?.fromStepId) return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!dragState?.fromStepId) return;
                      updateFutureSnapshots(dragState.workerId, dragState.fromStepId, null);
                      setDragState(null);
                    }}
                  >
                    <div className={`mb-2 text-xs font-medium ${c.textSecondary}`}>未配置の作業者</div>
                    {dragState?.fromStepId && (
                      <div className="mb-3 rounded-xl bg-cyan-500/10 px-3 py-2 text-xs text-cyan-600">
                        ここへドロップすると未配置へ戻します。
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {activeWorkers.map((slot) => (
                        <WorkerCard
                          key={slot.id}
                          worker={slot.worker}
                          subtitle={slot.worker.note}
                          shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
                          splitCount={slot.splitCount}
                          onSplit={splitWorker}
                          qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
                          skillItems={skillItemsForIds(slot.worker.skillIds)}
                          onDragStart={() => setDragState({ workerId: slot.workerId, fromStepId: null })}
                          onDragEnd={() => setDragState(null)}
                          c={c}
                        />
                      ))}
                      {activeWorkers.length === 0 && (
                        <div className={`w-full rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
                          未配置の作業者はいません
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className={`mb-2 text-xs font-medium ${c.textSecondary}`}>待機・離席</div>
                    <div className="flex flex-wrap gap-2">
                      {standbyWorkers.map((slot) => (
                        <WorkerCard
                          key={slot.id}
                          worker={slot.worker}
                          subtitle={slot.worker.note}
                          shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
                          splitCount={slot.splitCount}
                          muted
                          onSplit={splitWorker}
                          qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
                          skillItems={skillItemsForIds(slot.worker.skillIds)}
                          onDragStart={() => setDragState({ workerId: slot.workerId, fromStepId: null })}
                          onDragEnd={() => setDragState(null)}
                          c={c}
                        />
                      ))}
                      {standbyWorkers.length === 0 && (
                        <div className={`w-full rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
                          待機・離席の作業者はいません
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={[
                      "rounded-2xl border border-dashed px-4 py-5 transition",
                      canDeleteSplit
                        ? "border-rose-400/60 bg-rose-500/8"
                        : `${c.borderCard} ${c.bgSurface}`,
                    ].join(" ")}
                    onDragOver={(event) => {
                      if (!canDeleteSplit) return;
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!dragState || !canDeleteSplit) return;
                      deleteWorkerSplit(dragState.workerId, dragState.fromStepId);
                      setDragState(null);
                    }}
                  >
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <div
                        className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${
                          canDeleteSplit
                            ? "border-rose-400/60 bg-rose-500/12 text-rose-500"
                            : `${c.borderCard} ${c.textMuted}`
                        }`}
                      >
                        <Trash2 className="h-5 w-5" />
                      </div>
                      <div className={`text-xs font-semibold ${canDeleteSplit ? "text-rose-500" : c.textSecondary}`}>
                        分割枠を削除
                      </div>
                      <div className={`text-[11px] ${c.textMuted}`}>
                        分割済みアイコンをここへドロップ
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div>
                    <div className={`text-sm font-semibold ${c.textPrimary}`}>配置調整リスト</div>
                    <div className={`mt-1 text-xs ${c.textSecondary}`}>未保存の変更候補を時刻順に確認できます。</div>
                  </div>

                  {adjustmentItems.length === 0 ? (
                    <div className={`rounded-2xl px-4 py-8 text-center text-sm ${c.bgSurface} ${c.textMuted}`}>
                      未保存の配置変更はありません
                    </div>
                  ) : (
                    adjustmentItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedTime(item.effectiveTime)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${c.borderCard} ${c.bgSurface}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={`text-sm font-semibold ${c.textPrimary}`}>{item.workerName}</div>
                            <div className={`text-xs ${c.textSecondary}`}>変更時刻 {item.effectiveTime}</div>
                          </div>
                          <div className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                            未保存
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className={c.textMuted}>変更前</div>
                            <div className={`font-semibold ${c.textPrimary}`}>{item.previousAssignment}</div>
                          </div>
                          <div>
                            <div className={c.textMuted}>変更後</div>
                            <div className={`font-semibold ${c.textPrimary}`}>{item.nextAssignment}</div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <section className={`${c.bgCard} ${c.border} shrink-0 rounded-2xl border`}>
            <div className={`flex items-center justify-between gap-3 border-b px-4 py-4 ${c.border}`}>
              <div>
                <div className={`text-sm font-semibold ${c.textPrimary}`}>作業者プール</div>
                <div className={`mt-1 text-xs ${c.textSecondary}`}>上段からドラッグして、下段の業務行へそのまま配置できます。</div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs ${c.bgSurface} ${c.textSecondary}`}>選択中: {selectedTime || "-"}</div>
            </div>
            <div className="max-h-[220px] overflow-y-auto p-4">{workerPoolCompactContent}</div>
          </section>

          <section className={`${c.bgCard} ${c.border} flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border`}>
            <div className={`flex items-center justify-between gap-3 border-b px-4 py-4 ${c.border}`}>
              <div>
                <div className={`text-sm font-semibold ${c.textPrimary}`}>業務フロー配置テーブル</div>
                <div className={`mt-1 text-xs ${c.textSecondary}`}>開始予定時刻・終了予定時刻・予定数は参照のみです。行へドロップするとそのまま配置します。</div>
              </div>
              <div className={`text-xs ${c.textMuted}`}>{workflowCardViews.length} 業務フロー</div>
            </div>

            <div className="min-h-0 overflow-auto">
              {workflowCardViews.length === 0 ? (
                <div className="p-10 text-center">
                  <div className={`text-base font-medium ${c.textPrimary}`}>表示できる業務がありません</div>
                  <div className={`mt-2 text-sm ${c.textSecondary}`}>検索条件を見直すか、対象日に業務と区域の設定があるか確認してください。</div>
                </div>
              ) : (
                <table className="w-full min-w-[1360px] border-collapse">
                  <thead className={`${c.bgSurface} ${c.textSecondary}`}>
                    <tr className={`border-b ${c.border}`}>
                      <th className="px-3 py-3 text-left text-xs font-semibold">業務</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold">荷主</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold">エリア</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold">開始予定時刻</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold">終了予定時刻</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold">予定数</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold">実績数</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold">残数</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold">必要人時</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold">完了見込み</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold">状態</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold">配置中の作業者</th>
                    </tr>
                  </thead>
                  {workflowCardViews.map((workflowCard) => {
                    const workflowTone = getWorkflowCardTone(workflowCard.workflowId || workflowCard.workflowName, c.isDark);

                    return (
                        <tbody key={`table:${workflowCard.workflowId || workflowCard.workflowName}`}>
                          <tr className={`border-b ${c.border}`}>
                            <td colSpan={12} className={`px-4 py-3 ${workflowTone.surface}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${workflowTone.badge}`}>
                                    業務フロー
                                  </span>
                                  <div className={`truncate text-sm font-semibold ${c.textPrimary}`}>{workflowCard.workflowName}</div>
                                </div>
                                <div className={`text-xs ${c.textSecondary}`}>業務 {workflowCard.rows.length} 件</div>
                              </div>
                            </td>
                          </tr>
                          {workflowCard.rows.map(({ areaView, processView, row }) => {
                            const status = statusConfig(row.status);
                            return (
                              <tr
                                key={`table:${workflowCard.workflowId}:${areaView.areaId}:${processView.processId}:${row.shipperId}`}
                                className={`border-b transition ${c.border} ${dragState ? "hover:bg-[#155DFC]/[0.04]" : ""}`}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (!dragState) return;
                                  applyPlacement(dragState.workerId, processView, dragState.fromStepId, row);
                                  setDragState(null);
                                }}
                              >
                                <td className="px-3 py-3 align-top">
                                  <div className={`text-sm font-semibold ${c.textPrimary}`}>{processView.processName}</div>
                                </td>
                                <td className={`px-3 py-3 align-top text-sm ${c.textPrimary}`}>{row.shipperName}</td>
                                <td className="px-3 py-3 align-top">
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${workflowTone.metric} ${c.textSecondary}`}>
                                    {areaView.areaName}
                                  </span>
                                </td>
                                <td className={`px-3 py-3 align-top text-sm font-semibold tabular-nums ${c.textPrimary}`}>{row.startTime}</td>
                                <td className={`px-3 py-3 align-top text-sm font-semibold tabular-nums ${c.textPrimary}`}>{row.targetEndTime}</td>
                                <td className={`px-3 py-3 align-top text-right text-sm font-semibold tabular-nums ${c.textPrimary}`}>{row.planned.toLocaleString("ja-JP")}</td>
                                <td className={`px-3 py-3 align-top text-right text-sm font-semibold tabular-nums ${c.textPrimary}`}>{row.actual.toLocaleString("ja-JP")}</td>
                                <td className="px-3 py-3 align-top text-right">
                                  <span className="text-sm font-semibold tabular-nums text-amber-500">{row.remaining.toLocaleString("ja-JP")}</span>
                                </td>
                                <td className={`px-3 py-3 align-top text-right text-sm font-semibold tabular-nums ${c.textPrimary}`}>{row.requiredPersonHours.toFixed(1)}</td>
                                <td className={`px-3 py-3 align-top text-sm font-semibold tabular-nums ${c.textPrimary}`}>{row.eta}</td>
                                <td className="px-3 py-3 align-top">
                                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${status.className}`}>{status.label}</span>
                                </td>
                                <td className="px-3 py-3 align-top">
                                  <div className={`flex min-h-[44px] flex-wrap items-center gap-2 rounded-xl border border-dashed px-2.5 py-2 ${c.borderCard}`}>
                                    {row.assignedWorkers.length > 0 ? (
                                      row.assignedWorkers.map((assignment) => {
                                        const worker = workerMap.get(assignment.workerId);
                                        if (!worker) return null;
                                        return (
                                          <div
                                            key={assignment.id}
                                            draggable
                                            onDragStart={() => setDragState({ workerId: worker.id, fromStepId: assignment.sourceStepId })}
                                            onDragEnd={() => setDragState(null)}
                                            onContextMenu={(event) => {
                                              event.preventDefault();
                                              splitWorker(worker.id);
                                            }}
                                            className="inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-full border border-white/60 shadow-sm active:cursor-grabbing"
                                            title={`${worker.name} / ${workerShiftLabelMap.get(worker.id) ?? "シフト未設定"}`}
                                          >
                                            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ${worker.color}`}>
                                              {worker.initials}
                                            </span>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <span className={`text-xs ${c.textMuted}`}>ここへドロップして配置</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                    );
                  })}
                </table>
              )}
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
