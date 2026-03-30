import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  LayoutGrid,
  Plus,
  RotateCcw,
  Rows3,
  Save,
  Search,
  Trash2,
  Users,
  X,
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
type WorkCardViewMode = "card" | "table";

function floorToInterval(totalMinutes: number, intervalMinutes: number) {
  const safeInterval = Math.max(5, intervalMinutes);
  return Math.floor(Math.max(0, totalMinutes) / safeInterval) * safeInterval;
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function buildLiveCommandRowKey(params: { workflowId: string; processId: string; shipperId: string; areaId?: string }) {
  const { workflowId, processId, shipperId, areaId } = params;
  return [workflowId, processId, shipperId, areaId || "all"].join("::");
}

function buildLiveCommandRowDomId(rowKey: string) {
  return `live-command-row-${rowKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
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

type DragMember = {
  workerId: string;
  fromStepId: string | null;
};

type TeamDragState = {
  teamId: string;
  teamName: string;
  workerIds: string[];
  members?: DragMember[];
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

type WorkerTaskSegment = {
  stepId: string;
  processName: string;
  shipperName: string;
  workflowName: string;
  areaName: string;
  startTime: string;
  endTime: string;
  startIndex: number;
  endIndex: number;
};

type WorkerTaskCardView = {
  worker: DeploymentWorker;
  splitCount: number;
  shiftLabel: string;
  remainingLabel: string | null;
  statusLabel: string;
  statusClassName: string;
  currentSegment: WorkerTaskSegment | null;
  nextSegment: WorkerTaskSegment | null;
  utilizationPercent: number;
  actionLabel: string | null;
  qualificationItems: CapabilityItem[];
  skillItems: CapabilityItem[];
  dragFromStepId: string | null;
  draggable: boolean;
  muted: boolean;
  isOff: boolean;
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

type StoredManagementTeamView = {
  id: string;
  name?: string;
  memberUserIds: string[];
  themeColor?: string;
};

type TemporaryWorkerTeam = {
  id: string;
  name: string;
  themeColor: string;
  memberUserIds: string[];
  createdAt: string;
};

const FIELD_DEPLOYMENT_AREA_ASSIGNMENT_STORAGE_PREFIX = "fluxview-field-deployment-area-assignments-v1";
const MANAGEMENT_TEAM_STORAGE_KEY = "fluxview-management-teams-v1";
const TEMPORARY_TEAM_STORAGE_PREFIX = "fluxview-live-command-temp-teams-v1";
const TEMPORARY_TEAM_COLOR_OPTIONS = [
  { id: "blue", name: "ブルー", colorClass: "bg-[#155DFC]" },
  { id: "emerald", name: "グリーン", colorClass: "bg-emerald-500" },
  { id: "violet", name: "バイオレット", colorClass: "bg-violet-500" },
  { id: "amber", name: "アンバー", colorClass: "bg-amber-500" },
  { id: "rose", name: "ローズ", colorClass: "bg-rose-500" },
  { id: "slate", name: "グレー", colorClass: "bg-slate-400" },
] as const;

function buildAreaAssignmentStorageKey(siteId: string, dateKey?: string) {
  const scopeKey = siteId || "default";
  return dateKey
    ? `${FIELD_DEPLOYMENT_AREA_ASSIGNMENT_STORAGE_PREFIX}:${scopeKey}:${dateKey}`
    : `${FIELD_DEPLOYMENT_AREA_ASSIGNMENT_STORAGE_PREFIX}:${scopeKey}`;
}

function buildTemporaryTeamStorageKey(siteId: string, dateKey?: string) {
  const scopeKey = siteId || "default";
  return dateKey
    ? `${TEMPORARY_TEAM_STORAGE_PREFIX}:${scopeKey}:${dateKey}`
    : `${TEMPORARY_TEAM_STORAGE_PREFIX}:${scopeKey}`;
}

function formatHourBalance(minutes: number) {
  return `${(Math.max(0, minutes) / 60).toFixed(1)}h`;
}

function calculateClockDuration(start: string, end: string) {
  if (!isClockValue(start) || !isClockValue(end)) return 0;
  const startMinutes = parseTimeLabel(start);
  let endMinutes = parseTimeLabel(end);
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return Math.max(endMinutes - startMinutes, 0);
}

function getWorkerTaskCardStatusMeta(params: {
  isOff: boolean;
  hasCurrentAssignment: boolean;
  workerStatus: DeploymentWorker["status"];
}) {
  const { isOff, hasCurrentAssignment, workerStatus } = params;

  if (isOff) {
    return {
      label: "シフト休み",
      className: "bg-white/8 text-white/72",
    };
  }

  if (hasCurrentAssignment) {
    return {
      label: "稼働中",
      className: "bg-[#155DFC]/20 text-[#8bb3ff]",
    };
  }

  if (workerStatus === "absent") {
    return {
      label: "離席",
      className: "bg-white/10 text-white/60",
    };
  }

  if (workerStatus === "break") {
    return {
      label: "休憩中",
      className: "bg-amber-500/20 text-amber-300",
    };
  }

  return {
    label: "待機中",
    className: "bg-amber-500/20 text-amber-300",
  };
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
  hoverCardData,
  shiftLabel,
  splitCount = 1,
  muted = false,
  selected = false,
  draggable = true,
  onClick,
  onDragStart,
  onDragEnd,
  onSplit,
  qualificationItems,
  skillItems,
  c,
  size = "default",
}: {
  worker: DeploymentWorker;
  subtitle?: string;
  hoverCardData?: WorkerTaskCardView;
  shiftLabel: string;
  splitCount?: number;
  muted?: boolean;
  selected?: boolean;
  draggable?: boolean;
  onClick?: (event: any) => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onSplit?: (workerId: string) => void;
  qualificationItems: CapabilityItem[];
  skillItems: CapabilityItem[];
  c: ReturnType<typeof useThemeColors>;
  size?: "default" | "compact";
}) {
  const isCompact = size === "compact";
  const statusMeta = getWorkerStatusMeta(worker.status);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const hoverCardRef = useRef<HTMLDivElement | null>(null);
  const [isHoverCardVisible, setIsHoverCardVisible] = useState(false);
  const [hoverCardPosition, setHoverCardPosition] = useState<{ top: number; left: number } | null>(null);
  const capabilityItems = [
    ...qualificationItems.map((item) => ({ ...item, kind: "qualification" as const })),
    ...skillItems.map((item) => ({ ...item, kind: "skill" as const })),
  ].slice(0, 4);
  const hoverStatusLabel = hoverCardData?.statusLabel ?? statusMeta.label;
  const hoverStatusClassName = hoverCardData?.statusClassName ?? "bg-white/10 text-white/72";
  const hoverCurrentSegment = hoverCardData?.currentSegment ?? null;
  const hoverNextSegment = hoverCardData?.nextSegment ?? null;
  const hoverRemainingLabel = hoverCardData?.remainingLabel ?? null;
  const hoverUtilizationPercent = hoverCardData?.utilizationPercent ?? 0;
  const hoverActionLabel = hoverCardData?.actionLabel ?? subtitle ?? null;
  const isHoverOff = hoverCardData?.isOff ?? false;
  const hoverStatusToneClass = c.isDark
    ? hoverStatusClassName
    : hoverStatusLabel === "稼働中"
      ? "bg-[#EEF4FF] text-[#155DFC]"
      : hoverStatusLabel === "待機中" || hoverStatusLabel === "休憩中"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
  const hoverRootClass = c.isDark
    ? "border-[#2a2a3e] bg-[#171b26] text-white shadow-[0_24px_64px_rgba(15,23,42,0.28)]"
    : "border-gray-200 bg-white/98 text-gray-900 shadow-[0_24px_64px_rgba(15,23,42,0.16)]";
  const hoverCurrentBlockClass = c.isDark ? "bg-[#213758]" : "border border-[#D9E6FF] bg-[#EEF4FF]";
  const hoverCurrentLabelClass = c.isDark ? "text-[#bad1ff]" : "text-[#155DFC]";
  const hoverCurrentMetaClass = c.isDark ? "bg-white/10 text-white/88" : "bg-white text-[#3B5BA9] border border-[#D9E6FF]";
  const hoverNextBlockClass = c.isDark ? "bg-[#262522]" : "border border-gray-200 bg-gray-50";
  const hoverNextMetaClass = c.isDark ? "bg-white/8 text-white/76" : "bg-white text-gray-600 border border-gray-200";
  const hoverEmptyCurrentClass = c.isDark
    ? "border-amber-400/60 text-white/65"
    : "border-amber-300 bg-amber-50/70 text-amber-700";
  const hoverEmptyNextClass = c.isDark
    ? "border-white/12 text-white/58"
    : "border-gray-200 bg-gray-50 text-gray-500";
  const hoverMetricTrackClass = c.isDark ? "bg-white/8" : "bg-gray-200";
  const hoverCapabilityClass = c.isDark
    ? "bg-white/6 text-white/78"
    : "border border-gray-200 bg-gray-50 text-gray-600";
  const hoverActionChipClass = c.isDark ? "bg-white/8 text-white/72" : "bg-gray-100 text-gray-700";

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
  }, [
    hoverCardData?.actionLabel,
    hoverCardData?.currentSegment?.stepId,
    hoverCardData?.isOff,
    hoverCardData?.nextSegment?.stepId,
    hoverCardData?.remainingLabel,
    hoverCardData?.statusLabel,
    hoverCardData?.utilizationPercent,
    isHoverCardVisible,
  ]);

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
        onClick={onClick}
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
          isCompact
            ? "relative inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
            : "relative inline-flex h-12 w-12 items-center justify-center rounded-full border shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
          selected ? "ring-2 ring-[#155DFC] ring-offset-2 ring-offset-white" : "",
          muted ? `${c.borderCard} ${c.bgSurface}` : `${c.borderCard} ${c.bgPanel}`,
          draggable ? "cursor-grab active:cursor-grabbing hover:-translate-y-0.5" : "",
        ].join(" ")}
      >
        <div
          className={`flex ${isCompact ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-sm"} items-center justify-center rounded-full font-semibold text-white shadow-sm ${worker.color} ${
            muted ? "opacity-75" : ""
          }`}
        >
          {worker.initials}
        </div>
        <span
          aria-hidden="true"
          className={`absolute bottom-0 right-0 ${isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} rounded-full border-2 ${c.isDark ? "border-slate-900" : "border-white"} ${statusMeta.dotClass}`}
        />
        {splitCount > 1 && (
          <span
            className={`absolute ${isCompact ? "-right-1.5 -top-1.5 min-w-[26px] px-1 py-0 text-[9px]" : "-right-2 -top-2 min-w-[32px] px-1.5 py-0.5 text-[10px]"} inline-flex items-center justify-center rounded-full border font-semibold shadow-sm ${
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
          className={`pointer-events-none fixed z-[120] w-[316px] rounded-[22px] border p-3.5 text-left ${hoverRootClass}`}
          style={{ top: hoverCardPosition.top, left: hoverCardPosition.left }}
        >
          <div className="flex items-start gap-2.5">
            <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm ring-4 ${c.isDark ? "ring-white/5" : "ring-slate-100"} ${worker.color}`}>
              {worker.initials}
              {splitCount > 1 ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[28px] items-center justify-center rounded-full bg-[#155DFC] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  1/{splitCount}
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={`truncate text-[17px] font-semibold leading-5 ${c.textPrimary}`}>{worker.name}</div>
                  <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${c.textSecondary}`}>
                    <span>{shiftLabel}</span>
                    <span className={c.textMuted}>•</span>
                    <span>{hoverRemainingLabel ? `残 ${hoverRemainingLabel}` : "残 0.0h"}</span>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${hoverStatusToneClass}`}>
                  {hoverStatusLabel}
                </span>
              </div>
            </div>
          </div>

          {isHoverOff ? (
            <div className={`mt-4 rounded-[16px] border border-dashed px-4 py-5 text-center text-[13px] font-medium ${c.isDark ? "border-white/14 text-white/60" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
              本日シフトなし
            </div>
          ) : (
            <div className="mt-3.5">
              {hoverCurrentSegment ? (
                <div className={`rounded-[16px] px-3 py-3 ${hoverCurrentBlockClass}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`text-[11px] font-semibold ${hoverCurrentLabelClass}`}>現在の配置</div>
                      <div className={`mt-1 truncate text-[15px] font-semibold ${c.textPrimary}`}>{hoverCurrentSegment.processName}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${hoverCurrentMetaClass}`}>
                          {hoverCurrentSegment.shipperName}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${hoverCurrentMetaClass}`}>
                          {hoverCurrentSegment.areaName}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${hoverCurrentMetaClass}`}>
                          {hoverCurrentSegment.workflowName}
                        </span>
                      </div>
                    </div>
                    <div className={`text-right text-[13px] font-bold leading-5 tabular-nums ${c.textPrimary}`}>
                      {hoverCurrentSegment.startTime} →
                      <br />
                      {hoverCurrentSegment.endTime}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`rounded-[16px] border border-dashed px-4 py-4 text-center text-[13px] font-medium ${hoverEmptyCurrentClass}`}>
                  現在未配置・配置可能
                </div>
              )}

              <div className={`flex items-center justify-center py-1.5 ${c.textMuted}`}>
                <ArrowRight className="h-4 w-4 rotate-90" />
              </div>

              {hoverNextSegment ? (
                <div className={`rounded-[16px] px-3 py-3 ${hoverNextBlockClass}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`text-[11px] font-semibold ${c.textSecondary}`}>次の配置</div>
                      <div className={`mt-1 truncate text-[15px] font-semibold ${c.textPrimary}`}>{hoverNextSegment.processName}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${hoverNextMetaClass}`}>
                          {hoverNextSegment.shipperName}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${hoverNextMetaClass}`}>
                          {hoverNextSegment.areaName}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${hoverNextMetaClass}`}>
                          {hoverNextSegment.workflowName}
                        </span>
                      </div>
                    </div>
                    <div className={`text-right text-[13px] font-bold leading-5 tabular-nums ${c.textPrimary}`}>
                      {hoverNextSegment.startTime} →
                      <br />
                      {hoverNextSegment.endTime}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`rounded-[16px] border border-dashed px-4 py-4 text-center text-[13px] font-medium ${hoverEmptyNextClass}`}>
                  次の配置なし・{hoverRemainingLabel ?? "0.0h"} 空き
                </div>
              )}

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className={`font-medium ${c.textSecondary}`}>稼働率</span>
                  <span className={`text-[13px] font-semibold ${c.textPrimary}`}>{hoverUtilizationPercent}%</span>
                </div>
                <div className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${hoverMetricTrackClass}`}>
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${Math.max(hoverUtilizationPercent, hoverUtilizationPercent > 0 ? 8 : 0)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {capabilityItems.length > 0 ? (
                capabilityItems.map((item) => {
                  const iconOption = getMasterIconOption(
                    item.iconKey,
                    item.kind === "qualification" ? DEFAULT_QUALIFICATION_ICON_KEY : DEFAULT_SKILL_ICON_KEY,
                  );
                  const Icon = iconOption.icon;
                  return (
                    <span
                      key={`${worker.id}:${item.kind}:${item.id}`}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${hoverCapabilityClass}`}
                      title={item.name}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                  );
                })
              ) : (
                <span className={`text-[11px] ${c.textMuted}`}>資格・スキル未設定</span>
              )}
            </div>

            {hoverActionLabel ? (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${hoverActionChipClass}`}>
                {hoverActionLabel}
              </span>
            ) : null}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function WorkerTaskPoolCard({
  card,
  onDragStart,
  onDragEnd,
  onSplit,
  c,
}: {
  card: WorkerTaskCardView;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onSplit?: (workerId: string) => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  const capabilityItems = [...card.qualificationItems, ...card.skillItems].slice(0, 4);

  return (
    <div
      draggable={card.draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => {
        if (!onSplit) return;
        event.preventDefault();
        event.stopPropagation();
        onSplit(card.worker.id);
      }}
      className={[
        "group rounded-[24px] border border-white/10 bg-[#2f2d2a] p-4 text-white shadow-[0_10px_32px_rgba(15,23,42,0.14)] transition duration-200",
        card.draggable ? "cursor-grab active:cursor-grabbing hover:-translate-y-0.5" : "",
        card.muted ? "opacity-90" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white shadow-sm ring-4 ring-white/5 ${card.worker.color}`}>
          {card.worker.initials}
          {card.splitCount > 1 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[28px] items-center justify-center rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              1/{card.splitCount}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[18px] font-semibold leading-5 text-white">{card.worker.name}</div>
              <div className="mt-1 text-[12px] text-white/60">
                {card.isOff ? card.worker.id : `${card.worker.id}・シフト`}
              </div>
              {card.remainingLabel ? <div className="text-[14px] text-white/72">残 {card.remainingLabel}</div> : null}
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${card.statusClassName}`}>
              {card.statusLabel}
            </span>
          </div>
        </div>
      </div>

      {card.isOff ? (
        <div className="mt-5 rounded-[18px] border border-dashed border-white/14 px-4 py-6 text-center text-[14px] font-medium text-white/60">
          本日シフトなし
        </div>
      ) : (
        <>
          {card.currentSegment ? (
            <div className="mt-4 rounded-[18px] bg-[#2f4c7a] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[#bad1ff]">現在の配置</div>
                  <div className="mt-2 truncate text-[18px] font-semibold text-white">{card.currentSegment.processName}</div>
                  <div className="mt-1 truncate text-[12px] text-[#b8caf0]">{card.currentSegment.shipperName}</div>
                </div>
                <div className="text-right text-[13px] font-semibold text-white/88">
                  {card.currentSegment.startTime} →
                  <br />
                  {card.currentSegment.endTime}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[18px] border border-dashed border-amber-400/60 px-4 py-5 text-center text-[14px] font-medium text-white/65">
              現在未配置・配置可能
            </div>
          )}

          <div className="flex items-center justify-center py-2.5 text-white/45">
            <ChevronRight className="h-5 w-5 rotate-90" />
          </div>

          {card.nextSegment ? (
            <div className="rounded-[18px] bg-[#262522] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-white/58">次の配置</div>
                  <div className="mt-2 truncate text-[18px] font-semibold text-white">{card.nextSegment.processName}</div>
                  <div className="mt-1 truncate text-[12px] text-white/68">{card.nextSegment.shipperName}</div>
                </div>
                <div className="text-right text-[13px] font-semibold text-white/82">
                  {card.nextSegment.startTime} →
                  <br />
                  {card.nextSegment.endTime}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-white/12 px-4 py-5 text-center text-[14px] font-medium text-white/58">
              次の配置なし・{card.remainingLabel ?? "0.0h"} 空き
            </div>
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="font-medium text-white/60">稼働率</span>
              <span className="text-[14px] font-semibold text-white/82">{card.utilizationPercent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${Math.max(card.utilizationPercent, card.utilizationPercent > 0 ? 8 : 0)}%` }}
              />
            </div>
          </div>
        </>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {capabilityItems.length > 0 ? (
            capabilityItems.map((item) => {
              const fallbackIconKey = card.qualificationItems.some((qualification) => qualification.id === item.id)
                ? DEFAULT_QUALIFICATION_ICON_KEY
                : DEFAULT_SKILL_ICON_KEY;
              const iconOption = getMasterIconOption(item.iconKey, fallbackIconKey);
              const Icon = iconOption.icon;

              return (
                <span
                  key={`${card.worker.id}:${item.id}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/6 text-white/78"
                  title={item.name}
                >
                  <Icon className="h-4 w-4" />
                </span>
              );
            })
          ) : (
            <span className="text-[12px] text-white/38">資格・スキル未設定</span>
          )}
        </div>

        {card.actionLabel ? (
          <span className="rounded-full bg-white/8 px-3 py-1.5 text-[12px] font-medium text-white/72">
            {card.actionLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function LiveCommand() {
  const location = useLocation();
  const c = useThemeColors();
  const { sites, shippers, qualifications, skills, processes, workflows, selectedSiteId } = useMasterData();
  const qualificationToneClasses = getCapabilityToneClasses("qualification");
  const skillToneClasses = getCapabilityToneClasses("skill");
  const deploymentWorkers = useMemo(() => readDeploymentWorkers(), []);

  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [timeInterval, setTimeInterval] = useState<TimeInterval>(30);
  const [workCardViewMode, setWorkCardViewMode] = useState<WorkCardViewMode>("table");
  const [selectedTime, setSelectedTime] = useState("");
  const [keyword, setKeyword] = useState("");
  const [rightTab, setRightTab] = useState<RightTab>("staff");
  const [isWorkerPoolModalOpen, setIsWorkerPoolModalOpen] = useState(false);
  const [temporaryTeams, setTemporaryTeams] = useState<TemporaryWorkerTeam[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [teamDragState, setTeamDragState] = useState<TeamDragState | null>(null);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [selectedAssignedKeys, setSelectedAssignedKeys] = useState<string[]>([]);
  const [placementAlert, setPlacementAlert] = useState<PlacementAlertState>(null);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, AssignmentSnapshot>>({});
  const [draftSnapshots, setDraftSnapshots] = useState<Record<string, AssignmentSnapshot>>({});
  const [savedAreaAssignments, setSavedAreaAssignments] = useState<Record<string, AreaAssignmentSnapshot>>({});
  const [draftAreaAssignments, setDraftAreaAssignments] = useState<Record<string, AreaAssignmentSnapshot>>({});
  const [workerSplitOverrides, setWorkerSplitOverrides] = useState<Record<string, number>>({});
  const [focusedPlacementRowKey, setFocusedPlacementRowKey] = useState("");
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const snapshotScopeRef = useRef("");
  const handledPlacementFocusRef = useRef("");

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!placementAlert) return;
    const timerId = window.setTimeout(() => setPlacementAlert(null), 4000);
    return () => window.clearTimeout(timerId);
  }, [placementAlert]);

  useEffect(() => {
    if (!isWorkerPoolModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsWorkerPoolModalOpen(false);
        setTeamDragState(null);
        setDragState(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWorkerPoolModalOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(buildTemporaryTeamStorageKey(selectedSiteId, selectedDate));
      if (!raw) {
        setSelectedWorkerIds([]);
        setSelectedAssignedKeys([]);
        setTemporaryTeams([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setSelectedWorkerIds([]);
        setSelectedAssignedKeys([]);
        setTemporaryTeams([]);
        return;
      }
      setSelectedWorkerIds([]);
      setSelectedAssignedKeys([]);
      setTemporaryTeams(
        parsed.filter(
          (team): team is TemporaryWorkerTeam =>
            !!team &&
            typeof team.id === "string" &&
            typeof team.name === "string" &&
            typeof team.themeColor === "string" &&
            Array.isArray(team.memberUserIds) &&
            typeof team.createdAt === "string",
        ),
      );
    } catch {
      setSelectedWorkerIds([]);
      setSelectedAssignedKeys([]);
      setTemporaryTeams([]);
    }
  }, [selectedDate, selectedSiteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      buildTemporaryTeamStorageKey(selectedSiteId, selectedDate),
      JSON.stringify(temporaryTeams),
    );
  }, [selectedDate, selectedSiteId, temporaryTeams]);

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
  const workerShiftMap = useMemo(
    () =>
      new Map(
        deploymentWorkers.map((worker) => [
          worker.id,
          resolveWorkerShiftForDate(worker.id, selectedDate) ?? resolveWorkerShiftForDate(worker.name, selectedDate) ?? null,
        ]),
      ),
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
  const placementFocusTarget = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const workflowId = params.get("workflowId") ?? "";
    const processId = params.get("processId") ?? "";
    const shipperId = params.get("shipperId") ?? "";
    if (!workflowId || !processId || !shipperId) return null;

    return {
      workflowId,
      processId,
      shipperId,
      areaId: params.get("areaId") ?? "",
      date: params.get("date") ?? "",
      time: params.get("time") ?? "",
    };
  }, [location.search]);

  useEffect(() => {
    if (selectedTime && timeLabels.includes(selectedTime)) return;
    const fallbackMinutes = selectedTime
      ? parseTimeLabel(selectedTime)
      : floorToInterval(now.getHours() * 60 + now.getMinutes(), timeInterval);
    const nearest = findNearestTimeLabel(timeLabels, fallbackMinutes);
    setSelectedTime(nearest);
  }, [selectedTime, timeLabels, now, timeInterval]);

  useEffect(() => {
    if (!placementFocusTarget) {
      handledPlacementFocusRef.current = "";
      setFocusedPlacementRowKey("");
      return;
    }

    if (placementFocusTarget.date && placementFocusTarget.date !== selectedDate) {
      setSelectedDate(placementFocusTarget.date);
    }

    if (placementFocusTarget.time) {
      const nearestTime = findNearestTimeLabel(timeLabels, parseTime(placementFocusTarget.time));
      if (nearestTime && nearestTime !== selectedTime) {
        setSelectedTime(nearestTime);
      }
    }

    if (workCardViewMode !== "table") {
      setWorkCardViewMode("table");
    }
  }, [placementFocusTarget, selectedDate, selectedTime, timeLabels, workCardViewMode]);

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

  const workerTaskCardViews = useMemo(() => {
    if (timeLabels.length === 0) return [] satisfies WorkerTaskCardView[];

    const selectedIndex = Math.max(timeLabels.indexOf(selectedTime), 0);
    const referenceMinutes = selectedTime
      ? parseTimeLabel(selectedTime)
      : floorToInterval(now.getHours() * 60 + now.getMinutes(), timeInterval);

    const getIntervalMinutes = (index: number) => {
      if (index < timeLabels.length - 1) {
        return Math.max(parseTimeLabel(timeLabels[index + 1]) - parseTimeLabel(timeLabels[index]), timeInterval);
      }
      return timeInterval;
    };

    const buildSegment = (workerId: string, index: number, stepId: string) => {
      const step = deploymentStepMap.get(stepId);
      if (!step) return null;

      let startIndex = index;
      while (startIndex > 0 && (draftSnapshots[timeLabels[startIndex - 1]]?.[stepId] ?? []).includes(workerId)) {
        startIndex -= 1;
      }

      let endIndex = index;
      while (endIndex + 1 < timeLabels.length && (draftSnapshots[timeLabels[endIndex + 1]]?.[stepId] ?? []).includes(workerId)) {
        endIndex += 1;
      }

      const areaAssignments = draftAreaAssignments[timeLabels[index]] ?? draftAreaAssignments[timeLabels[startIndex]] ?? {};
      const assignedAreaId = getAssignedAreaId(stepId, workerId, areaAssignments);
      const areaName =
        (stepAreaEntriesMap.get(stepId) ?? []).find((entry) => entry.areaId === assignedAreaId)?.areaName ?? "未設定エリア";

      return {
        stepId,
        processName: step.processName,
        shipperName: step.shipperName,
        workflowName: step.workflowName,
        areaName,
        startTime: timeLabels[startIndex] ?? step.startTime,
        endTime: endIndex + 1 < timeLabels.length ? timeLabels[endIndex + 1] : step.targetEndTime,
        startIndex,
        endIndex,
      } satisfies WorkerTaskSegment;
    };

    const findNextSegment = (workerId: string, searchFromIndex: number) => {
      for (let index = Math.max(searchFromIndex, 0); index < timeLabels.length; index += 1) {
        const stepIds = findAssignedStepIds(draftSnapshots[timeLabels[index]] ?? {}, workerId);
        if (stepIds.length === 0) continue;
        return buildSegment(workerId, index, stepIds[0]);
      }
      return null;
    };

    return deploymentWorkers
      .map((worker) => {
        const shift = workerShiftMap.get(worker.id);
        const isOff = Boolean(shift?.isOff);
        const currentStepIds = findAssignedStepIds(currentSnapshot, worker.id);
        const currentSegment = !isOff && currentStepIds.length > 0 ? buildSegment(worker.id, selectedIndex, currentStepIds[0]) : null;
        const nextSegment = !isOff
          ? findNextSegment(worker.id, currentSegment ? currentSegment.endIndex + 1 : selectedIndex + 1)
          : null;

        const assignedMinutes = timeLabels.reduce((sum, timeLabel, index) => {
          const stepIds = findAssignedStepIds(draftSnapshots[timeLabel] ?? {}, worker.id);
          if (stepIds.length === 0) return sum;
          return sum + getIntervalMinutes(index);
        }, 0);

        const shiftMinutes =
          shift && !shift.isOff && isClockValue(shift.start) && isClockValue(shift.end)
            ? calculateClockDuration(shift.start, shift.end)
            : 0;
        const remainingMinutes =
          shift && !shift.isOff && isClockValue(shift.end)
            ? Math.max(parseTimeLabel(shift.end) - referenceMinutes, 0)
            : 0;
        const utilizationPercent = shiftMinutes > 0 ? Math.min(100, Math.round((assignedMinutes / shiftMinutes) * 100)) : 0;
        const splitCount = effectiveWorkerSplitCounts.get(worker.id) ?? 1;
        const assignedCount = currentWorkerAssignmentCounts.get(worker.id) ?? 0;
        const hasSpareCapacity = splitCount > assignedCount;
        const statusMeta = getWorkerTaskCardStatusMeta({
          isOff,
          hasCurrentAssignment: Boolean(currentSegment),
          workerStatus: worker.status,
        });

        return {
          worker,
          splitCount,
          shiftLabel: workerShiftLabelMap.get(worker.id) ?? "シフト未設定",
          remainingLabel: isOff ? null : formatHourBalance(remainingMinutes),
          statusLabel: statusMeta.label,
          statusClassName: statusMeta.className,
          currentSegment,
          nextSegment,
          utilizationPercent,
          actionLabel: worker.note?.trim() || currentSegment?.workflowName || nextSegment?.workflowName || null,
          qualificationItems: qualificationItemsForIds(worker.qualificationIds),
          skillItems: skillItemsForIds(worker.skillIds),
          dragFromStepId: hasSpareCapacity ? null : currentSegment?.stepId ?? null,
          draggable: !isOff && worker.status !== "absent",
          muted: isOff || worker.status !== "active",
          isOff,
        } satisfies WorkerTaskCardView;
      })
      .sort((left, right) => {
        const leftRank = left.isOff ? 3 : left.currentSegment ? 0 : left.worker.status === "active" ? 1 : 2;
        const rightRank = right.isOff ? 3 : right.currentSegment ? 0 : right.worker.status === "active" ? 1 : 2;
        return leftRank - rightRank || left.worker.name.localeCompare(right.worker.name, "ja");
      });
  }, [
    currentSnapshot,
    deploymentStepMap,
    deploymentWorkers,
    draftAreaAssignments,
    draftSnapshots,
    effectiveWorkerSplitCounts,
    currentWorkerAssignmentCounts,
    getAssignedAreaId,
    now,
    qualificationItemsForIds,
    selectedTime,
    skillItemsForIds,
    stepAreaEntriesMap,
    timeInterval,
    timeLabels,
    workerShiftLabelMap,
    workerShiftMap,
  ]);
  const workerTaskCardViewMap = useMemo(
    () => new Map(workerTaskCardViews.map((card) => [card.worker.id, card])),
    [workerTaskCardViews],
  );

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
  useEffect(() => {
    if (!placementFocusTarget) return;
    if (handledPlacementFocusRef.current === location.search) return;

    let clearHighlightTimer: number | undefined;
    const scrollTimer = window.setTimeout(() => {
      const baseSelector = [
        `[data-live-workflow="${placementFocusTarget.workflowId}"]`,
        `[data-live-process="${placementFocusTarget.processId}"]`,
        `[data-live-shipper="${placementFocusTarget.shipperId}"]`,
      ].join("");
      const selector = placementFocusTarget.areaId
        ? `${baseSelector}[data-live-area="${placementFocusTarget.areaId}"]`
        : baseSelector;
      const target = document.querySelector<HTMLElement>(selector);
      if (!target) return;

      handledPlacementFocusRef.current = location.search;
      const rowKey = target.dataset.liveRowKey ?? "";
      setFocusedPlacementRowKey(rowKey);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      clearHighlightTimer = window.setTimeout(() => setFocusedPlacementRowKey(""), 2400);
    }, 180);

    return () => {
      window.clearTimeout(scrollTimer);
      if (clearHighlightTimer) window.clearTimeout(clearHighlightTimer);
    };
  }, [placementFocusTarget, workflowCardViews, location.search]);
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
  const workerTeamMetaMap = useMemo(() => {
    const teamMap = new Map<string, { id: string; name: string; colorClass: string; isTemporary: boolean }>();

    try {
      temporaryTeams.forEach((team) => {
        const colorClass =
          TEMPORARY_TEAM_COLOR_OPTIONS.find((option) => option.id === team.themeColor)?.colorClass ?? "bg-[#155DFC]";
        team.memberUserIds.forEach((userId) => {
          if (typeof userId === "string" && !teamMap.has(userId)) {
            teamMap.set(userId, {
              id: team.id,
              name: team.name,
              colorClass,
              isTemporary: true,
            });
          }
        });
      });

      if (typeof window === "undefined") return teamMap;
      const raw = window.localStorage.getItem(MANAGEMENT_TEAM_STORAGE_KEY);
      if (!raw) return teamMap;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return teamMap;

      parsed.forEach((team, index) => {
        const typedTeam = team as StoredManagementTeamView;
        if (!typedTeam || typeof typedTeam.id !== "string" || !Array.isArray(typedTeam.memberUserIds)) return;
        const teamName =
          typeof typedTeam.name === "string" && typedTeam.name.trim()
            ? typedTeam.name.trim()
            : `チーム ${index + 1}`;
        const colorClass =
          TEMPORARY_TEAM_COLOR_OPTIONS.find((option) => option.id === typedTeam.themeColor)?.colorClass ?? "bg-[#155DFC]";

        typedTeam.memberUserIds.forEach((userId) => {
          if (typeof userId === "string" && !teamMap.has(userId)) {
            teamMap.set(userId, {
              id: typedTeam.id,
              name: teamName,
              colorClass,
              isTemporary: false,
            });
          }
        });
      });
    } catch {
      return teamMap;
    }

    return teamMap;
  }, [temporaryTeams]);
  const displayWorkerMap = useMemo(
    () =>
      new Map(
        deploymentWorkers.map((worker) => {
          const effectiveColor = worker.userId ? workerTeamMetaMap.get(worker.userId)?.colorClass : undefined;
          return [worker.id, effectiveColor ? { ...worker, color: effectiveColor } : worker];
        }),
      ),
    [deploymentWorkers, workerTeamMetaMap],
  );
  const activeWorkerGroups = useMemo(() => {
    const groupMap = new Map<string, { id: string; name: string; colorClass: string; isTemporary: boolean; slots: typeof activeWorkers }>();

    activeWorkers.forEach((slot) => {
      const teamMeta = slot.worker.userId ? workerTeamMetaMap.get(slot.worker.userId) : undefined;
      const groupId = teamMeta?.id ?? "__unassigned__";
      const existing = groupMap.get(groupId);
      if (existing) {
        existing.slots.push(slot);
        return;
      }

      groupMap.set(groupId, {
        id: groupId,
        name: teamMeta?.name ?? "未所属",
        colorClass: teamMeta?.colorClass ?? "bg-slate-400",
        isTemporary: teamMeta?.isTemporary ?? false,
        slots: [slot],
      });
    });

    return Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        slots: [...group.slots].sort((left, right) => left.worker.name.localeCompare(right.worker.name, "ja")),
      }))
      .sort((left, right) => {
        if (left.id === "__unassigned__") return 1;
        if (right.id === "__unassigned__") return -1;
        return left.name.localeCompare(right.name, "ja");
      });
  }, [activeWorkers, workerTeamMetaMap]);
  const createTemporaryTeamFromUserIds = (userIds: string[]) => {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) return;

    let nextTeamName = "";
    let nextTeamColor = TEMPORARY_TEAM_COLOR_OPTIONS[0].id;

    setTemporaryTeams((prev) => {
      let nameIndex = 1;
      const existingNames = new Set(prev.map((team) => team.name));
      while (existingNames.has(`仮チーム ${nameIndex}`)) {
        nameIndex += 1;
      }

      nextTeamName = `仮チーム ${nameIndex}`;
      nextTeamColor = TEMPORARY_TEAM_COLOR_OPTIONS[prev.length % TEMPORARY_TEAM_COLOR_OPTIONS.length].id;

      const stripped = prev
        .map((team) => ({
          ...team,
          memberUserIds: team.memberUserIds.filter((memberUserId) => !uniqueUserIds.includes(memberUserId)),
        }))
        .filter((team) => team.memberUserIds.length > 0);

      return [
        ...stripped,
        {
          id: `temp-team-${Date.now()}`,
          name: nextTeamName,
          themeColor: nextTeamColor,
          memberUserIds: uniqueUserIds,
          createdAt: new Date().toISOString(),
        },
      ];
    });

    setPlacementAlert({
      tone: "info",
      message: `仮チーム「${nextTeamName || "仮チーム"}」を ${uniqueUserIds.length} 名で作成しました。`,
    });
  };
  const assignUsersToTemporaryTeam = (userIds: string[], teamId: string) => {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) return;

    let targetTeamName = "";

    setTemporaryTeams((prev) =>
      prev
        .map((team) => {
          const filteredMemberIds = team.memberUserIds.filter((memberUserId) => !uniqueUserIds.includes(memberUserId));
          if (team.id === teamId) {
            targetTeamName = team.name;
            return { ...team, memberUserIds: [...filteredMemberIds, ...uniqueUserIds] };
          }
          return { ...team, memberUserIds: filteredMemberIds };
        })
        .filter((team) => team.memberUserIds.length > 0),
    );

    setPlacementAlert({
      tone: "info",
      message: `${uniqueUserIds.length} 名を仮チーム「${targetTeamName || "仮チーム"}」へ追加しました。`,
    });
  };
  const deleteTemporaryTeam = (teamId: string) => {
    const team = temporaryTeams.find((item) => item.id === teamId);
    setTemporaryTeams((prev) => prev.filter((item) => item.id !== teamId));
    if (team) {
      setPlacementAlert({
        tone: "info",
        message: `仮チーム「${team.name}」を削除しました。`,
      });
    }
  };
  const draggedWorkerIds = teamDragState?.workerIds ?? (dragState ? [dragState.workerId] : []);
  const draggedWorkerUserIds = Array.from(
    new Set(
      draggedWorkerIds
        .map((workerId) => (displayWorkerMap.get(workerId) ?? workerMap.get(workerId) ?? null)?.userId ?? null)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );
  const draggedWorkerUserId = draggedWorkerUserIds[0] ?? null;
  const isPlacementDragActive = dragState !== null || teamDragState !== null;
  const buildAssignedSelectionKey = (workerId: string, fromStepId: string | null) => `${workerId}::${fromStepId ?? "__unassigned__"}`;
  const parseAssignedSelectionKey = (key: string): DragMember => {
    const [workerId, rawFromStepId = "__unassigned__"] = key.split("::");
    return {
      workerId,
      fromStepId: rawFromStepId === "__unassigned__" ? null : rawFromStepId,
    };
  };
  const resolveTeamDragMembers = (team: TeamDragState): DragMember[] =>
    team.members ?? team.workerIds.map((workerId) => ({ workerId, fromStepId: null }));
  const returnableDragMembers =
    teamDragState?.members?.filter((member) => member.fromStepId) ??
    (dragState?.fromStepId ? [{ workerId: dragState.workerId, fromStepId: dragState.fromStepId }] : []);
  const toggleWorkerSelection = (workerId: string, event: any) => {
    const isMultiSelect = Boolean(event?.ctrlKey || event?.metaKey);
    setSelectedAssignedKeys([]);

    if (isMultiSelect) {
      event.preventDefault?.();
      event.stopPropagation?.();
      setSelectedWorkerIds((prev) =>
        prev.includes(workerId) ? prev.filter((id) => id !== workerId) : [...prev, workerId],
      );
      return;
    }

    setSelectedWorkerIds((prev) => (prev.length === 1 && prev[0] === workerId ? prev : [workerId]));
    setSelectedAssignedKeys([]);
  };

  const toggleAssignedSelection = (workerId: string, fromStepId: string | null, event: any) => {
    const key = buildAssignedSelectionKey(workerId, fromStepId);
    const isMultiSelect = Boolean(event?.ctrlKey || event?.metaKey);
    setSelectedWorkerIds([]);

    if (isMultiSelect) {
      event.preventDefault?.();
      event.stopPropagation?.();
      setSelectedAssignedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
      return;
    }

    setSelectedAssignedKeys((prev) => (prev.length === 1 && prev[0] === key ? prev : [key]));
    setSelectedWorkerIds([]);
  };

  const beginWorkerDrag = (workerId: string) => {
    const selectedIds =
      selectedWorkerIds.includes(workerId) && selectedWorkerIds.length > 1
        ? selectedWorkerIds
        : [workerId];

    if (selectedIds.length > 1) {
      setDragState(null);
      setTeamDragState({
        teamId: "__selected__",
        teamName: `選択中作業者 ${selectedIds.length}名`,
        workerIds: selectedIds,
        members: selectedIds.map((selectedWorkerId) => ({ workerId: selectedWorkerId, fromStepId: null })),
      });
      return;
    }

    setTeamDragState(null);
    setDragState({ workerId, fromStepId: null });
  };

  const beginAssignedDrag = (workerId: string, fromStepId: string | null) => {
    const key = buildAssignedSelectionKey(workerId, fromStepId);
    const selectedMembers =
      selectedAssignedKeys.includes(key) && selectedAssignedKeys.length > 1
        ? selectedAssignedKeys.map(parseAssignedSelectionKey)
        : [{ workerId, fromStepId }];

    if (selectedMembers.length > 1) {
      setDragState(null);
      setTeamDragState({
        teamId: "__selected-assigned__",
        teamName: `選択中作業者 ${selectedMembers.length}名`,
        workerIds: selectedMembers.map((member) => member.workerId),
        members: selectedMembers,
      });
      return;
    }

    setTeamDragState(null);
    setDragState({ workerId, fromStepId });
  };

  const endWorkerDrag = () => {
    setDragState(null);
    setTeamDragState(null);
  };
  const returnMembersToUnassigned = (members: DragMember[]) => {
    const effectiveMembers = members.filter((member) => member.fromStepId);
    if (!selectedTime || effectiveMembers.length === 0) return;

    const nextSnapshots = { ...draftSnapshots };
    const nextAreaAssignments = { ...draftAreaAssignments };
    const selectedMinutes = parseTimeLabel(selectedTime);

    timeLabels.forEach((timeLabel) => {
      if (parseTimeLabel(timeLabel) < selectedMinutes) return;

      const sourceSnapshot = nextSnapshots[timeLabel] ?? materializeSnapshot({}, steps);
      const nextSnapshot = cloneSnapshot(sourceSnapshot);
      const currentAreaSnapshot = { ...(nextAreaAssignments[timeLabel] ?? {}) };

      effectiveMembers.forEach(({ workerId, fromStepId }) => {
        if (!fromStepId) return;
        nextSnapshot[fromStepId] = (nextSnapshot[fromStepId] ?? []).filter((assignedWorkerId) => assignedWorkerId !== workerId);
        delete currentAreaSnapshot[buildAreaAssignmentKey(fromStepId, workerId)];
      });

      nextSnapshots[timeLabel] = materializeSnapshot(nextSnapshot, steps);
      nextAreaAssignments[timeLabel] = currentAreaSnapshot;
    });

    setDraftSnapshots(nextSnapshots);
    setDraftAreaAssignments(nextAreaAssignments);
    setSelectedAssignedKeys([]);

    if (effectiveMembers.length === 1) {
      const worker = workerMap.get(effectiveMembers[0].workerId);
      setPlacementAlert({
        tone: "info",
        message: `${worker?.name ?? "作業者"} を未配置へ戻しました。`,
      });
      return;
    }

    setPlacementAlert({
      tone: "info",
      message: `${effectiveMembers.length} 名を未配置へ戻しました。`,
    });
  };
  const renderGroupedActiveWorkers = (interactive: boolean, modalMode = false) => {
    if (activeWorkerGroups.length === 0) {
      return (
        <div className={`w-full rounded-2xl border border-dashed px-4 py-5 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
          未配置の作業者はいません
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        {activeWorkerGroups.map((group) => (
          <div
            key={group.id}
            onDragOver={(event) => {
              if (!modalMode || !group.isTemporary || draggedWorkerUserIds.length === 0) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!modalMode || !group.isTemporary || draggedWorkerUserIds.length === 0) return;
              assignUsersToTemporaryTeam(draggedWorkerUserIds, group.id);
              endWorkerDrag();
            }}
            className={`rounded-2xl border border-dashed px-3 py-3 ${
              modalMode && group.isTemporary && draggedWorkerUserId
                ? "border-[#155DFC]/50 bg-[#EEF4FF]/55"
                : `${c.borderCard} ${c.isDark ? "bg-white/[0.03]" : "bg-slate-50/80"}`
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${group.colorClass}`} />
                <div className={`text-xs font-semibold whitespace-nowrap ${c.textSecondary}`}>{group.name}</div>
                {group.isTemporary ? (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-amber-600">
                    仮チーム
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <div className={`rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${c.bgSurface} ${c.textMuted}`}>{group.slots.length} 名</div>
                {modalMode && group.id !== "__unassigned__" ? (
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDragState(null);
                      setTeamDragState({
                        teamId: group.id,
                        teamName: group.name,
                        workerIds: group.slots.map((slot) => slot.workerId),
                      });
                    }}
                    onDragEnd={() => setTeamDragState(null)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#155DFC]/20 bg-[#EEF4FF] px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap text-[#155DFC]"
                  >
                    <Users className="h-3.5 w-3.5" />
                    チーム配置
                  </button>
                ) : null}
                {group.isTemporary ? (
                  <button
                    type="button"
                    onClick={() => deleteTemporaryTeam(group.id)}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border transition ${c.borderCard} ${c.bgCard} ${c.textMuted}`}
                    aria-label={`${group.name} を削除`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.slots.map((slot) => (
                <WorkerCard
                  key={slot.id}
                  worker={displayWorkerMap.get(slot.worker.id) ?? slot.worker}
                  subtitle={slot.worker.note}
                  hoverCardData={workerTaskCardViewMap.get(slot.workerId)}
                  shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
                  splitCount={slot.splitCount}
                  selected={selectedWorkerIds.includes(slot.workerId)}
                  muted={false}
                  draggable={interactive || modalMode}
                  onSplit={interactive ? splitWorker : undefined}
                  onClick={
                    interactive || modalMode
                      ? (event) => toggleWorkerSelection(slot.workerId, event)
                      : undefined
                  }
                  qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
                  skillItems={skillItemsForIds(slot.worker.skillIds)}
                  onDragStart={
                    interactive || modalMode
                      ? () => {
                          beginWorkerDrag(slot.workerId);
                        }
                      : undefined
                  }
                  onDragEnd={interactive || modalMode ? endWorkerDrag : undefined}
                  c={c}
                />
              ))}
            </div>
          </div>
        ))}
        {modalMode ? (
          <div
            onDragOver={(event) => {
              if (draggedWorkerUserIds.length === 0) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedWorkerUserIds.length === 0) return;
              createTemporaryTeamFromUserIds(draggedWorkerUserIds);
              endWorkerDrag();
            }}
            className={`rounded-2xl border border-dashed px-4 py-5 text-center transition ${
              draggedWorkerUserIds.length > 0
                ? "border-[#155DFC]/60 bg-[#EEF4FF] text-[#155DFC]"
                : `${c.borderCard} ${c.isDark ? "bg-white/[0.03]" : "bg-slate-50/80"} ${c.textSecondary}`
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-2">
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${draggedWorkerUserIds.length > 0 ? "border-[#155DFC]/30 bg-white text-[#155DFC]" : `${c.borderCard} ${c.bgCard} ${c.textMuted}`}`}>
                <Plus className="h-4.5 w-4.5" />
              </div>
              <div className="text-sm font-semibold">仮チーム作成</div>
              <div className={`text-[11px] ${draggedWorkerUserIds.length > 0 ? "text-[#3B5BA9]" : c.textMuted}`}>
                icon をここへ入れると新しい仮チームを作成します
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };
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

  const buildPlacementDraftResult = (params: {
    workerId: string;
    processView: ProcessView;
    sourceStepId: string | null;
    targetShipper?: ProcessShipperRow | null;
    baseSnapshots: Record<string, AssignmentSnapshot>;
    baseAreaAssignments: Record<string, AreaAssignmentSnapshot>;
  }) => {
    const { workerId, processView, sourceStepId, targetShipper = null, baseSnapshots, baseAreaAssignments } = params;
    const worker = workerMap.get(workerId);
    if (!worker) return null;

    const candidateRows = targetShipper ? [targetShipper] : processView.shipperRows;
    const shipperOptions = candidateRows
      .map((row) => ({
        shipperId: row.shipperId,
        shipperName: row.shipperName,
        stepIds: row.stepIds,
      }))
      .filter((option) => option.stepIds.length > 0);

    if (shipperOptions.length === 0) return null;

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

    const eligibleStepIds = Array.from(new Set(shipperOptions.flatMap((option) => option.stepIds)));
    if (eligibleStepIds.length === 0) return null;

    const startMinutes = parseTimeLabel(startTime);
    const endMinutes = parseTimeLabel(endTime);
    if (endMinutes < startMinutes) return null;

    const allowParallelAssignment = (workerSplitOverrides[worker.id] ?? 1) > 1;
    const nextSnapshots = { ...baseSnapshots };
    const nextAreaAssignments = { ...baseAreaAssignments };

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

    return {
      worker,
      nextSnapshots,
      nextAreaAssignments,
      startTime,
      endTime,
      selectedSteps: eligibleStepIds
        .map((stepId) => deploymentStepMap.get(stepId))
        .filter((step): step is DeploymentStep => Boolean(step)),
      targetLabel: targetShipper?.shipperName
        ? `${processView.processName} / ${targetShipper.shipperName}`
        : processView.processName,
    };
  };

  const applyPlacement = (
    workerId: string,
    processView: ProcessView,
    sourceStepId: string | null,
    targetShipper: ProcessShipperRow | null = null,
  ) => {
    const placement = buildPlacementDraftResult({
      workerId,
      processView,
      sourceStepId,
      targetShipper,
      baseSnapshots: draftSnapshots,
      baseAreaAssignments: draftAreaAssignments,
    });
    if (!placement) return;

    setDraftSnapshots(placement.nextSnapshots);
    setDraftAreaAssignments(placement.nextAreaAssignments);

    const requirementWarningLines = getRequirementWarningLines(workerId, placement.selectedSteps);
    const requirementWarning = requirementWarningLines.join(" / ");

    setPlacementAlert({
      tone: requirementWarning ? "warning" : "info",
      title: requirementWarning ? "資格・スキル不足を確認してください" : undefined,
      details: requirementWarning ? requirementWarningLines : undefined,
      message: `${placement.worker.name} を ${placement.targetLabel} に ${placement.startTime} - ${placement.endTime} で配置しました。`,
    });
  };

  const applyTeamPlacement = (
    team: TeamDragState,
    processView: ProcessView,
    targetShipper: ProcessShipperRow | null = null,
  ) => {
    let nextSnapshots = draftSnapshots;
    let nextAreaAssignments = draftAreaAssignments;
    const warningLines = new Set<string>();
    let placedCount = 0;
    let targetLabel = processView.processName;
    const teamMembers = resolveTeamDragMembers(team);

    teamMembers.forEach(({ workerId, fromStepId }) => {
      const placement = buildPlacementDraftResult({
        workerId,
        processView,
        sourceStepId: fromStepId,
        targetShipper,
        baseSnapshots: nextSnapshots,
        baseAreaAssignments: nextAreaAssignments,
      });
      if (!placement) return;

      nextSnapshots = placement.nextSnapshots;
      nextAreaAssignments = placement.nextAreaAssignments;
      targetLabel = placement.targetLabel;
      placedCount += 1;
      getRequirementWarningLines(workerId, placement.selectedSteps).forEach((line) => warningLines.add(line));
    });

    if (placedCount === 0) return;

    setDraftSnapshots(nextSnapshots);
    setDraftAreaAssignments(nextAreaAssignments);

    const details = Array.from(warningLines);
    setPlacementAlert({
      tone: details.length > 0 ? "warning" : "info",
      title: details.length > 0 ? "資格・スキル不足を確認してください" : undefined,
      details: details.length > 0 ? details : undefined,
      message: `チーム「${team.teamName}」の ${placedCount} 名を ${targetLabel} にまとめて配置しました。`,
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
  const workerPoolContent = (
    <div className="grid gap-4">
      <div
        className={[
          "rounded-2xl border border-dashed p-3 transition",
          returnableDragMembers.length > 0 ? "border-cyan-500/50 bg-cyan-500/5" : `${c.borderCard}`,
        ].join(" ")}
        onDragOver={(event) => {
          if (returnableDragMembers.length === 0) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (returnableDragMembers.length === 0) return;
          returnMembersToUnassigned(returnableDragMembers);
          endWorkerDrag();
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className={`text-xs font-medium ${c.textSecondary}`}>未配置の作業者</div>
          {returnableDragMembers.length > 0 ? (
            <div className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[10px] text-cyan-600">
              ここへ戻す
            </div>
          ) : null}
        </div>
        {renderGroupedActiveWorkers(true)}
      </div>

      <div className={`rounded-2xl border border-dashed p-3 ${c.borderCard}`}>
        <div className={`mb-2 text-xs font-medium ${c.textSecondary}`}>待機・離席</div>
        <div className="flex flex-wrap gap-2">
          {standbyWorkers.map((slot) => (
            <WorkerCard
              key={slot.id}
              worker={slot.worker}
              subtitle={slot.worker.note}
              hoverCardData={workerTaskCardViewMap.get(slot.workerId)}
              shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
              splitCount={slot.splitCount}
              muted
              onSplit={splitWorker}
              qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
              skillItems={skillItemsForIds(slot.worker.skillIds)}
              onDragStart={() => {
                setTeamDragState(null);
                setDragState({ workerId: slot.workerId, fromStepId: null });
              }}
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
  const workerPoolModalContent = (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="grid gap-4">
        <section className={`${c.bgCard} ${c.border} rounded-2xl border p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className={`text-sm font-semibold whitespace-nowrap ${c.textPrimary}`}>未配置の作業者</div>
            <div className={`rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap ${c.bgSurface} ${c.textSecondary}`}>{activeWorkers.length} 名</div>
          </div>
          {renderGroupedActiveWorkers(false, true)}
        </section>

        <section className={`${c.bgCard} ${c.border} rounded-2xl border p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className={`text-sm font-semibold whitespace-nowrap ${c.textPrimary}`}>待機・離席</div>
            <div className={`rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap ${c.bgSurface} ${c.textSecondary}`}>{standbyWorkers.length} 名</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {standbyWorkers.map((slot) => (
              <WorkerCard
                key={`modal:${slot.id}`}
                worker={slot.worker}
                subtitle={slot.worker.note}
                hoverCardData={workerTaskCardViewMap.get(slot.workerId)}
                shiftLabel={workerShiftLabelMap.get(slot.workerId) ?? "シフト未設定"}
                splitCount={slot.splitCount}
                muted
                draggable={false}
                qualificationItems={qualificationItemsForIds(slot.worker.qualificationIds)}
                skillItems={skillItemsForIds(slot.worker.skillIds)}
                c={c}
              />
            ))}
            {standbyWorkers.length === 0 ? (
              <div className={`w-full rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
                待機・離席なし
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className={`${c.bgCard} ${c.border} rounded-2xl border p-4`}>
        <div className={`mb-3 text-sm font-semibold whitespace-nowrap ${c.textPrimary}`}>分割枠を削除</div>
        <div className={`flex min-h-[168px] flex-col items-center justify-center rounded-2xl border border-dashed text-center ${c.borderCard} ${c.bgSurface}`}>
          <div className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${c.borderCard} ${c.textMuted}`}>
            <Trash2 className="h-4.5 w-4.5" />
          </div>
        </div>
      </section>
    </div>
  );
  const workerPoolModalPlacementTargetsContent = (
    <section className={`${c.bgCard} ${c.border} flex min-h-0 flex-col overflow-hidden rounded-2xl border`}>
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-4 ${c.border}`}>
        <div>
          <div className={`text-sm font-semibold whitespace-nowrap ${c.textPrimary}`}>チーム配置先</div>
          <div className={`mt-1 overflow-x-auto text-xs whitespace-nowrap ${c.textSecondary}`}>
            チーム見出しの「チーム配置」または個別 icon を、下の業務行へドロップしてまとめて配置できます。
          </div>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${c.bgSurface} ${c.textSecondary}`}>{workflowCardViews.length} 業務フロー</div>
      </div>
      <div className="min-h-0 overflow-auto">
        {workflowCardViews.length === 0 ? (
          <div className="p-10 text-center">
            <div className={`text-base font-medium ${c.textPrimary}`}>配置できる業務がありません</div>
            <div className={`mt-2 text-sm ${c.textSecondary}`}>対象日に進捗対象が登録されているか確認してください。</div>
          </div>
        ) : (
          <table className="w-full min-w-[1180px] border-collapse">
            <thead className={`${c.bgSurface} ${c.textSecondary}`}>
              <tr className={`border-b ${c.border}`}>
                <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">業務フロー</th>
                <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">業務</th>
                <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">荷主</th>
                <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">エリア</th>
                <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">開始予定</th>
                <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">終了予定</th>
                <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">予定数</th>
                <th className="px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">残数</th>
                <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">状態</th>
                <th className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap">配置中の作業者</th>
              </tr>
            </thead>
            {workflowCardViews.map((workflowCard) => {
              const workflowTone = getWorkflowCardTone(workflowCard.workflowId || workflowCard.workflowName, c.isDark);

              return (
                <tbody key={`modal-table:${workflowCard.workflowId || workflowCard.workflowName}`}>
                  {workflowCard.rows.map(({ areaView, processView, row }, rowIndex) => {
                    const status = statusConfig(row.status);
                    return (
                      <tr
                        key={`modal-table:${workflowCard.workflowId}:${areaView.areaId}:${processView.processId}:${row.shipperId}`}
                        className={`border-b transition ${c.border} ${isPlacementDragActive ? "bg-[#155DFC]/[0.01] hover:bg-[#155DFC]/[0.04]" : ""}`}
                        onDragOver={(event) => {
                          if (!isPlacementDragActive) return;
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (teamDragState) {
                            applyTeamPlacement(teamDragState, processView, row);
                            setTeamDragState(null);
                            return;
                          }
                          if (dragState) {
                            applyPlacement(dragState.workerId, processView, dragState.fromStepId, row);
                            setDragState(null);
                          }
                        }}
                      >
                        <td className="px-3 py-3 align-top">
                          {rowIndex === 0 ? (
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap ${workflowTone.badge}`}>
                              {workflowCard.workflowName}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className={`text-sm font-semibold whitespace-nowrap ${c.textPrimary}`}>{processView.processName}</div>
                        </td>
                        <td className={`px-3 py-3 align-top text-sm whitespace-nowrap ${c.textPrimary}`}>{row.shipperName}</td>
                        <td className="px-3 py-3 align-top">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${workflowTone.metric} ${c.textSecondary}`}>
                            {areaView.areaName}
                          </span>
                        </td>
                        <td className={`px-3 py-3 align-top text-sm font-semibold tabular-nums whitespace-nowrap ${c.textPrimary}`}>{row.startTime}</td>
                        <td className={`px-3 py-3 align-top text-sm font-semibold tabular-nums whitespace-nowrap ${c.textPrimary}`}>{row.targetEndTime}</td>
                        <td className={`px-3 py-3 align-top text-right text-sm font-semibold tabular-nums whitespace-nowrap ${c.textPrimary}`}>{row.planned.toLocaleString("ja-JP")}</td>
                        <td className="px-3 py-3 align-top text-right">
                          <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-amber-500">{row.remaining.toLocaleString("ja-JP")}</span>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap ${status.className}`}>{status.label}</span>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className={`flex min-h-[40px] flex-wrap items-center gap-2 rounded-xl border border-dashed px-2.5 py-2 ${c.borderCard}`}>
                            {row.assignedWorkers.length > 0 ? (
                              row.assignedWorkers.map((assignment) => {
                                const worker = displayWorkerMap.get(assignment.workerId) ?? workerMap.get(assignment.workerId);
                                if (!worker) return null;
                                const assignedSelectionKey = buildAssignedSelectionKey(worker.id, assignment.sourceStepId);
                                return (
                                  <WorkerCard
                                    key={`modal-assigned:${assignment.id}`}
                                    worker={worker}
                                    subtitle={worker.note}
                                    hoverCardData={workerTaskCardViewMap.get(worker.id)}
                                    shiftLabel={workerShiftLabelMap.get(worker.id) ?? "シフト未設定"}
                                    splitCount={effectiveWorkerSplitCounts.get(worker.id) ?? 1}
                                    selected={selectedAssignedKeys.includes(assignedSelectionKey)}
                                    qualificationItems={qualificationItemsForIds(worker.qualificationIds)}
                                    skillItems={skillItemsForIds(worker.skillIds)}
                                    onClick={(event) => toggleAssignedSelection(worker.id, assignment.sourceStepId, event)}
                                    onDragStart={() => {
                                      beginAssignedDrag(worker.id, assignment.sourceStepId);
                                    }}
                                    onDragEnd={endWorkerDrag}
                                    c={c}
                                  />
                                );
                              })
                            ) : (
                              <span className={`text-xs ${c.textMuted}`}>
                                {teamDragState ? `チーム「${teamDragState.teamName}」をここへドロップ` : dragState ? "ここへドロップして配置" : "配置先"}
                              </span>
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
  const placementAlertSnackbar =
    placementAlert && typeof document !== "undefined"
      ? createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-5 z-[90] flex justify-center px-4">
            <div
              className={[
                "pointer-events-auto w-full max-w-2xl rounded-2xl border px-5 py-3 shadow-2xl backdrop-blur-sm",
                placementAlert.tone === "warning"
                  ? "border-amber-500/25 bg-white/95 text-amber-600 shadow-amber-500/10"
                  : "border-cyan-500/25 bg-white/95 text-cyan-600 shadow-cyan-500/10",
              ].join(" ")}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    placementAlert.tone === "warning"
                      ? "bg-amber-500/15 text-amber-600"
                      : "bg-cyan-500/15 text-cyan-600"
                  }`}
                >
                  {placementAlert.tone === "warning" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Info className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] ${
                        placementAlert.tone === "warning"
                          ? "border-amber-500/30 bg-white/70 text-amber-700"
                          : "border-cyan-500/25 bg-white/70 text-cyan-700"
                      }`}
                    >
                      Severity: {placementAlert.tone === "warning" ? "Warning" : "Info"}
                    </span>
                    {placementAlert.title ? (
                      <div className="text-sm font-semibold">{placementAlert.title}</div>
                    ) : null}
                  </div>
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      {placementAlertSnackbar}

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
                    { id: "card", label: "カード", icon: LayoutGrid },
                    { id: "table", label: "表", icon: Rows3 },
                  ] as const).map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setWorkCardViewMode(option.id)}
                        className={[
                          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                          workCardViewMode === option.id
                            ? "bg-[#155DFC] text-white"
                            : `${c.textSecondary} hover:bg-[#155DFC]/10 hover:text-[#155DFC]`,
                        ].join(" ")}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
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

      </section>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
        <div
          className={[
            "min-h-0 content-start gap-2.5 pr-1",
            workCardViewMode === "table"
              ? "flex flex-col overflow-auto"
              : "grid overflow-y-auto",
          ].join(" ")}
          style={
            workCardViewMode === "table"
              ? undefined
              : { gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }
          }
        >
          {workflowCardViews.flatMap((workflowCard) => {
            const workflowTone = getWorkflowCardTone(workflowCard.workflowId || workflowCard.workflowName, c.isDark);

            return workflowCard.rows.map(({ areaView, processView, row }) => {
                    const status = statusConfig(row.status);
                    const progressPercent = row.planned > 0 ? Math.min(100, Math.round((row.actual / row.planned) * 100)) : 0;
                    const assignedWorkersContent =
                      row.assignedWorkers.length > 0 ? (
                        <>
                          {row.assignedWorkers.map((assignment) => {
                            const worker = workerMap.get(assignment.workerId);
                            if (!worker) return null;
                            const assignedSelectionKey = buildAssignedSelectionKey(worker.id, assignment.sourceStepId);
                            return (
                              <WorkerCard
                                key={assignment.id}
                                worker={worker}
                                subtitle={worker.note}
                                hoverCardData={workerTaskCardViewMap.get(worker.id)}
                                shiftLabel={workerShiftLabelMap.get(worker.id) ?? "シフト未設定"}
                                splitCount={effectiveWorkerSplitCounts.get(worker.id) ?? 1}
                                selected={selectedAssignedKeys.includes(assignedSelectionKey)}
                                onSplit={splitWorker}
                                onClick={(event) => toggleAssignedSelection(worker.id, assignment.sourceStepId, event)}
                                qualificationItems={qualificationItemsForIds(worker.qualificationIds)}
                                skillItems={skillItemsForIds(worker.skillIds)}
                                onDragStart={() => {
                                  beginAssignedDrag(worker.id, assignment.sourceStepId);
                                }}
                                onDragEnd={endWorkerDrag}
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
                      );
                    const assignedWorkersTableContent =
                      row.assignedWorkers.length > 0 ? (
                        <>
                          {row.assignedWorkers.map((assignment) => {
                            const worker = workerMap.get(assignment.workerId);
                            if (!worker) return null;
                            const assignedSelectionKey = buildAssignedSelectionKey(worker.id, assignment.sourceStepId);
                            return (
                              <WorkerCard
                                key={`${assignment.id}:table`}
                                worker={worker}
                                subtitle={worker.note}
                                hoverCardData={workerTaskCardViewMap.get(worker.id)}
                                shiftLabel={workerShiftLabelMap.get(worker.id) ?? "シフト未設定"}
                                splitCount={effectiveWorkerSplitCounts.get(worker.id) ?? 1}
                                selected={selectedAssignedKeys.includes(assignedSelectionKey)}
                                onSplit={splitWorker}
                                onClick={(event) => toggleAssignedSelection(worker.id, assignment.sourceStepId, event)}
                                qualificationItems={qualificationItemsForIds(worker.qualificationIds)}
                                skillItems={skillItemsForIds(worker.skillIds)}
                                onDragStart={() => {
                                  beginAssignedDrag(worker.id, assignment.sourceStepId);
                                }}
                                onDragEnd={endWorkerDrag}
                                c={c}
                              />
                            );
                          })}
                          <div
                            aria-label={`${row.shipperName} にドロップ`}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed ${c.borderCard} ${c.textMuted} ${c.bgCard}`}
                          >
                            <Plus className="h-4 w-4" />
                          </div>
                        </>
                      ) : (
                        <div className={`w-full rounded-xl border border-dashed px-3 py-3 text-center text-xs ${c.borderCard} ${c.textMuted} ${c.bgCard}`}>
                          ここへドロップ
                        </div>
                      );

                    const liveRowKey = buildLiveCommandRowKey({
                      workflowId: workflowCard.workflowId,
                      processId: processView.processId,
                      shipperId: row.shipperId,
                      areaId: areaView.areaId,
                    });
                    const isFocusedPlacementRow = focusedPlacementRowKey === liveRowKey;

                    return (
                      <section
                        key={`${workflowCard.workflowId}:${areaView.areaId}:${processView.processId}:${row.shipperId}`}
                        id={buildLiveCommandRowDomId(liveRowKey)}
                        data-live-row-key={liveRowKey}
                        data-live-workflow={workflowCard.workflowId}
                        data-live-process={processView.processId}
                        data-live-shipper={row.shipperId}
                        data-live-area={areaView.areaId}
                        className={[
                          workCardViewMode === "table"
                            ? "rounded-[18px] border p-0 shadow-sm transition-all duration-200"
                            : "rounded-[18px] border p-3 shadow-sm transition-all duration-200",
                          isPlacementDragActive
                            ? "border-cyan-500/40 bg-cyan-500/5 shadow-cyan-500/10"
                            : workflowTone.surface,
                          isFocusedPlacementRow ? "ring-2 ring-[#155DFC]/60 shadow-[0_0_0_3px_rgba(21,93,252,0.12)]" : "",
                        ].join(" ")}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (teamDragState) {
                            applyTeamPlacement(teamDragState, processView, row);
                            endWorkerDrag();
                            return;
                          }
                          if (!dragState) return;
                          applyPlacement(dragState.workerId, processView, dragState.fromStepId, row);
                          endWorkerDrag();
                        }}
                      >
                        {workCardViewMode === "table" ? (
                          <div className="flex min-w-[960px] items-stretch">
                            <div className={`flex w-[208px] shrink-0 flex-col justify-center gap-1.5 px-3.5 py-3 ${c.borderCard} border-r`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className={`truncate text-[17px] font-semibold leading-none tracking-[-0.02em] ${c.textPrimary}`}>
                                    {processView.processName}
                                  </div>
                                </div>
                                <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${status.className}`}>
                                  {status.label}
                                </span>
                              </div>
                              <div className="flex flex-col items-start gap-1">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${workflowTone.metric} ${c.textSecondary}`}>
                                  {row.workflowName}
                                </span>
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${workflowTone.badge}`}>
                                  {areaView.areaName}
                                </span>
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${workflowTone.metric} ${c.textSecondary}`}>
                                  {row.shipperName}
                                </span>
                              </div>
                            </div>

                            <div className={`flex min-w-[170px] flex-[0.48] flex-col justify-center gap-2 px-3 py-3 ${c.borderCard} border-r`}>
                              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                                <div>
                                  <div className={`text-[11px] font-medium ${c.textMuted}`}>開始予定</div>
                                  <div className={`mt-1 text-[18px] font-semibold leading-none tabular-nums ${c.textPrimary}`}>
                                    {row.startTime}
                                  </div>
                                </div>
                                <div className={`pt-4 ${c.textMuted}`}>
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </div>
                                <div className="text-right">
                                  <div className={`text-[11px] font-medium ${c.textMuted}`}>終了予定</div>
                                  <div className={`mt-1 text-[18px] font-semibold leading-none tabular-nums ${c.textPrimary}`}>
                                    {row.targetEndTime}
                                  </div>
                                </div>
                              </div>
                              <div className={`flex items-center justify-between border-t pt-2.5 ${c.borderCard}`}>
                                <div className={`text-[11px] font-medium ${c.textMuted}`}>完了見込み</div>
                                <div className={`inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums ${c.textPrimary}`}>
                                  <Clock3 className="h-3.5 w-3.5" />
                                  {row.eta}
                                </div>
                              </div>
                            </div>

                            <div className={`flex min-w-[236px] flex-[0.66] flex-col justify-center px-2 py-3 ${c.borderCard} border-r`}>
                              <div className={`w-full rounded-xl border px-2.5 py-2.5 ${workflowTone.metric}`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className={`text-[16px] font-semibold leading-none tabular-nums ${c.textPrimary}`}>
                                      {row.actual.toLocaleString("ja-JP")}
                                      <span className={`px-1 text-[13px] font-medium ${c.textMuted}`}>/</span>
                                      <span className={`text-[13px] font-medium ${c.textSecondary}`}>
                                        {row.planned.toLocaleString("ja-JP")}
                                      </span>
                                    </div>
                                    <div className={`mt-1 text-[11px] font-medium ${c.textMuted}`}>実績 / 予定</div>
                                  </div>
                                  <div className="text-right">
                                    <div className={`text-[13px] font-semibold tabular-nums ${c.textPrimary}`}>{progressPercent}%</div>
                                    <div className="mt-1 text-[11px] font-medium text-amber-500">残 {row.remaining.toLocaleString("ja-JP")} 件</div>
                                  </div>
                                </div>
                                <div className={`mt-2.5 h-2 overflow-hidden rounded-full ${c.isDark ? "bg-slate-900/70" : "bg-slate-200"}`}>
                                  <div
                                    className={`h-full rounded-full transition-all ${workflowTone.progress}`}
                                    style={{ width: `${Math.max(progressPercent, row.planned > 0 ? 6 : 0)}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex min-w-[320px] flex-[1.18] flex-col justify-center px-3.5 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className={`text-[11px] font-medium ${c.textMuted}`}>配置中の作業者 {row.assignedWorkers.length}名</div>
                              </div>
                              <div className={`mt-2 rounded-2xl border px-2.5 py-2.5 ${workflowTone.metric}`}>
                                <div className="flex min-h-[48px] flex-wrap items-center gap-1.5">{assignedWorkersTableContent}</div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
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

                            <div className={`mt-3 rounded-xl border px-3 py-2.5 ${workflowTone.metric}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className={`text-[17px] font-semibold leading-none tabular-nums ${c.textPrimary}`}>
                                    {row.actual.toLocaleString("ja-JP")}
                                    <span className={`px-1 text-[14px] font-medium ${c.textMuted}`}>/</span>
                                    <span className={`text-[15px] font-medium ${c.textSecondary}`}>
                                      {row.planned.toLocaleString("ja-JP")}
                                    </span>
                                  </div>
                                  <div className={`mt-1 text-[11px] font-medium ${c.textMuted}`}>
                                    実績 / 予定
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-[14px] font-semibold tabular-nums ${c.textPrimary}`}>
                                    {progressPercent}%
                                  </div>
                                  <div className="mt-1 text-[11px] font-medium text-amber-500">
                                    残 {row.remaining.toLocaleString("ja-JP")} 件
                                  </div>
                                </div>
                              </div>
                              <div className={`mt-2.5 h-2 overflow-hidden rounded-full ${c.isDark ? "bg-slate-900/70" : "bg-slate-200"}`}>
                                <div
                                  className={`h-full rounded-full transition-all ${workflowTone.progress}`}
                                  style={{ width: `${Math.max(progressPercent, row.planned > 0 ? 6 : 0)}%` }}
                                />
                              </div>
                            </div>

                            <div className={`mt-3 rounded-t-2xl border-t px-0 pt-3 ${c.borderCard}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className={`text-[13px] font-semibold ${c.textSecondary}`}>配置中の作業者 {row.assignedWorkers.length}名</div>
                              </div>
                              <div className={`mt-2.5 rounded-2xl border px-3 py-4 ${workflowTone.metric}`}>
                                <div className="flex flex-wrap items-start gap-2">{assignedWorkersContent}</div>
                              </div>
                            </div>
                          </>
                        )}
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
                  <span className="whitespace-nowrap">作業者プール</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab("adjustments")}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${rightTab === "adjustments" ? "bg-[#155DFC] text-white" : `${c.bgSurface} ${c.textSecondary}`}`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span className="whitespace-nowrap">調整リスト</span>
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
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={`text-sm font-semibold ${c.textPrimary}`}>作業者プール</div>
                      <div className={`mt-1 text-xs ${c.textSecondary}`}>未配置・待機中の作業者を確認できます。</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTeamDragState(null);
                        setDragState(null);
                        setIsWorkerPoolModalOpen(true);
                      }}
                      className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
                    >
                      拡大表示
                    </button>
                  </div>
                  {workerPoolContent}
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

      {isWorkerPoolModalOpen ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/45 px-6 py-8 backdrop-blur-[2px]">
          <div className={`${c.bgCard} ${c.border} flex max-h-[calc(100vh-64px)] w-full max-w-[1320px] flex-col overflow-hidden rounded-[28px] border shadow-[0_28px_80px_rgba(15,23,42,0.22)]`}>
            <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${c.border}`}>
              <div>
                <div className={`text-lg font-semibold whitespace-nowrap ${c.textPrimary}`}>作業者プール</div>
                <div className={`mt-1 overflow-x-auto text-sm whitespace-nowrap ${c.textSecondary}`}>多人数をまとめて確認できる拡大ビューです。icon を仮チーム作成枠へ入れると新しい仮チームを作成でき、チーム単位でもそのまま配置できます。</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsWorkerPoolModalOpen(false);
                  setTeamDragState(null);
                  setDragState(null);
                }}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
                aria-label="作業者プールを閉じる"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 border-b px-6 py-3">
              <div className={`text-sm whitespace-nowrap ${c.textSecondary}`}>選択中時刻: <span className={`font-semibold ${c.textPrimary}`}>{selectedTime || "-"}</span></div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${c.bgSurface} ${c.textSecondary}`}>未配置 {activeWorkers.length} 名</span>
                <span className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${c.bgSurface} ${c.textSecondary}`}>待機・離席 {standbyWorkers.length} 名</span>
              </div>
            </div>
            <div className="min-h-0 overflow-auto p-6">
              <div className="grid gap-4">
                {workerPoolModalContent}
                {workerPoolModalPlacementTargetsContent}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
