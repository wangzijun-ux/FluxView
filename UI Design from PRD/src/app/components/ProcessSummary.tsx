import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import type { WorkflowDefinition, WorkflowStepSetting } from "./masterStore";
import {
  buildDeploymentWorkflows,
  buildSiteScope,
  readFieldDeploymentSnapshots,
} from "./fieldDeploymentStore";
import {
  PLAN_STORAGE_KEY,
  buildStepPlanDefaults,
  readProgressPlanStore,
  resolveStepPlanValues,
  updateStepPlanEntry,
  type ProgressPlanStore,
} from "./progressPlanStore";
import { readAttendanceMonthShifts } from "./attendanceStore";
import { readAttendanceWorkers } from "./workforceStore";
import { readUsersFromStorage } from "./userStore";
import { buildReportedQuantityMap, buildWorkerSubmissionRecords, type WorkerSubmissionRecord } from "./workerMobileStore";

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatTime(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatHourValue(value: number) {
  return `${value.toFixed(1)}h`;
}

function formatHeadcountValue(value: number) {
  return `${value.toFixed(1)}人`;
}

function hashString(value: string) {
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getWorkflowCardTone(seed: string, isDark: boolean) {
  const tones = [
    isDark ? "border-sky-400/20 bg-sky-500/10" : "border-sky-200 bg-sky-50/80",
    isDark ? "border-emerald-400/20 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50/80",
    isDark ? "border-violet-400/20 bg-violet-500/10" : "border-violet-200 bg-violet-50/80",
    isDark ? "border-amber-400/20 bg-amber-500/10" : "border-amber-200 bg-amber-50/80",
    isDark ? "border-rose-400/20 bg-rose-500/10" : "border-rose-200 bg-rose-50/80",
  ] as const;

  return tones[hashString(seed) % tones.length];
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const DEFAULT_DEPLOYMENT_INTERVAL_MINUTES = 30;
const DEPLOYMENT_DAY_END = 24 * 60;
const TREND_SAMPLE_MINUTES = [6 * 60, 8 * 60, 10 * 60, 12 * 60, 14 * 60, 16 * 60, 18 * 60, 20 * 60];
const DESIGNER_EDGE_STORAGE_KEY = "fluxview.workflow.designer-edges.v1";
type StatusTone = "healthy" | "attention" | "delayed" | "done";
type TrendPoint = { label: string; planned: number; actual: number };
type TrendDialogState = {
  stepId: string;
};
type AddWorkflowStepDraft = {
  sourceStepId: string;
  processId: string;
  processName: string;
  previousStepId: string;
  areaId: string;
  planned: number;
  uph: number;
  startTime: string;
  targetEndTime: string;
};
type WorkflowEdgeType = "serial" | "copy" | "split";
type WorkflowEdge = {
  id: string;
  from: string;
  to: string;
  type: WorkflowEdgeType;
};
type WorkflowMiniStep = {
  id: string;
  sourceStepId: string;
  processName: string;
  actual: number;
  planned: number;
  progress: number;
  status: StatusTone;
  processableCount: number | null;
  dependencyGap: number;
};
type WorkflowDagLevel = {
  level: number;
  steps: WorkflowMiniStep[];
};
type RequiredCondition = {
  id: string;
  label: string;
  kind: "qualification" | "skill";
};
type StepAreaDetailTone = "configured" | "unassigned" | "missing";
type StepAreaDetail = {
  id: string;
  name: string;
  description: string;
  tone: StepAreaDetailTone;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function calculateRequiredHeadcount(
  planned: number,
  uph: number,
  startTime: string,
  targetEndTime: string,
  fallbackHeadcount: number,
) {
  const requiredValue = calculateRequiredHeadcountValue(planned, uph, startTime, targetEndTime, fallbackHeadcount);
  if (requiredValue <= 0) return 0;
  return Math.max(1, Math.ceil(requiredValue));
}

function calculateRequiredHeadcountValue(
  planned: number,
  uph: number,
  startTime: string,
  targetEndTime: string,
  fallbackHeadcount: number,
) {
  const safePlanned = Math.max(0, planned);
  if (safePlanned === 0) return 0;

  const effectiveUph = Math.max(uph, 1);
  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(targetEndTime);
  const durationMinutes = endMinutes - startMinutes;

  if (durationMinutes <= 0) return Math.max(1, fallbackHeadcount);
  return Math.max(1, safePlanned / (effectiveUph * (durationMinutes / 60)));
}

function calculateRequiredPersonHours(planned: number, uph: number) {
  if (planned <= 0) return 0;
  return Number((planned / Math.max(uph, 1)).toFixed(1));
}

function calculateBreakHours(totalHours: number) {
  if (totalHours >= 8) return 1;
  if (totalHours >= 6) return 0.75;
  if (totalHours >= 4) return 0.25;
  return 0;
}

function calculateEffectiveShiftHours(start: string, end: string) {
  const grossHours = Math.max(0, (parseTime(end) - parseTime(start)) / 60);
  if (grossHours <= 0) return 0;
  return Number(Math.max(0, grossHours - calculateBreakHours(grossHours) - 0.5).toFixed(1));
}

function sortTimeLabels(labels: string[]) {
  return [...labels].sort((left, right) => parseTime(left) - parseTime(right));
}

function detectSnapshotInterval(labels: string[]) {
  if (labels.length < 2) return DEFAULT_DEPLOYMENT_INTERVAL_MINUTES;
  let minDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < labels.length; index += 1) {
    const delta = parseTime(labels[index]) - parseTime(labels[index - 1]);
    if (delta > 0) minDelta = Math.min(minDelta, delta);
  }
  return Number.isFinite(minDelta) ? minDelta : DEFAULT_DEPLOYMENT_INTERVAL_MINUTES;
}

function buildStepAreaDetails(
  layoutAreaIds: string[] | undefined,
  site: { layoutAreas?: Array<{ id: string; name: string; description: string }> } | undefined,
) {
  const uniqueAreaIds = Array.from(new Set((layoutAreaIds ?? []).filter((id) => typeof id === "string" && id.trim().length > 0)));
  const areaMap = new Map((site?.layoutAreas ?? []).map((area) => [area.id, area]));

  if (uniqueAreaIds.length === 0) {
    return [
      {
        id: "unassigned",
        name: "エリア未設定",
        description: "この工程にはまだ作業エリアが設定されていません。",
        tone: "unassigned" as const,
      },
    ];
  }

  return uniqueAreaIds.map((areaId, index) => {
    const area = areaMap.get(areaId);
    if (area) {
      return {
        id: area.id,
        name: area.name,
        description: area.description || "エリア説明は未設定です。",
        tone: "configured" as const,
      };
    }

    return {
      id: `${areaId}-${index}`,
      name: "未登録エリア",
      description: "拠点レイアウト側に該当エリアが見つかりません。",
      tone: "missing" as const,
    };
  });
}

function buildAreaPlanKey(stepId: string, areaId: string) {
  return `${stepId}::area::${areaId}`;
}

function splitPlannedQuantity(total: number, count: number, index: number) {
  const safeTotal = Math.max(0, Math.round(total));
  const safeCount = Math.max(1, count);
  const base = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal % safeCount;
  return base + (index < remainder ? 1 : 0);
}

function aggregateAreaPlanValues(
  areaPlans: Array<{ planned: number; startTime: string; targetEndTime: string }>,
  fallback: StepPlanValues,
) {
  if (areaPlans.length === 0) return fallback;

  const planned = areaPlans.reduce((sum, areaPlan) => sum + Math.max(0, areaPlan.planned), 0);
  const startTime = areaPlans.reduce(
    (earliest, areaPlan) => (parseTime(areaPlan.startTime) < parseTime(earliest) ? areaPlan.startTime : earliest),
    areaPlans[0].startTime,
  );
  const targetEndTime = areaPlans.reduce(
    (latest, areaPlan) => (parseTime(areaPlan.targetEndTime) > parseTime(latest) ? areaPlan.targetEndTime : latest),
    areaPlans[0].targetEndTime,
  );

  return {
    planned,
    startTime,
    targetEndTime,
  };
}

function countAssigned(snapshot: Record<string, string[]> | undefined, stepId: string) {
  return (snapshot?.[stepId] ?? []).filter(Boolean).length;
}

function getAssignedCountAtReference(params: {
  stepId: string;
  startTime: string;
  selectedDate: string;
  today: string;
  nowMinutes: number;
  timeLabels: string[];
  snapshotsByTime: Record<string, Record<string, string[]>>;
}) {
  const { stepId, startTime, selectedDate, today, nowMinutes, timeLabels, snapshotsByTime } = params;
  if (timeLabels.length === 0) return 0;

  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");

  if (selectedDateValue > todayValue) {
    const futureLabel = timeLabels.find((label) => parseTime(label) >= parseTime(startTime)) ?? timeLabels[0];
    return countAssigned(snapshotsByTime[futureLabel], stepId);
  }

  if (selectedDateValue < todayValue) {
    const lastLabel = timeLabels[timeLabels.length - 1];
    return countAssigned(snapshotsByTime[lastLabel], stepId);
  }

  const currentLabel = [...timeLabels].reverse().find((label) => parseTime(label) <= nowMinutes) ?? timeLabels[0];
  return countAssigned(snapshotsByTime[currentLabel], stepId);
}

function getPlannedValueAtMinute(startTime: string, targetEndTime: string, planned: number, minute: number) {
  if (planned <= 0) return 0;
  const start = parseTime(startTime);
  const end = Math.max(parseTime(targetEndTime), start + 30);
  if (minute <= start) return 0;
  if (minute >= end) return planned;
  const progress = (minute - start) / (end - start);
  return Math.round((planned * progress) / 10) * 10;
}

function getSubmissionQuantityAtMinute(
  records: WorkerSubmissionRecord[],
  minute: number,
  selectedDate: string,
  today: string,
  nowMinutes: number,
) {
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");
  const effectiveMinute = selectedDateValue < todayValue ? minute : Math.min(minute, nowMinutes);
  if (selectedDateValue > todayValue) return 0;

  return records.reduce((sum, record) => {
    const quantity = record.reportedQuantity ?? 0;
    if (quantity <= 0) return sum;

    const startedMinutes = record.startedAt
      ? new Date(record.startedAt).getHours() * 60 + new Date(record.startedAt).getMinutes()
      : parseTime(record.scheduledStartTime);
    const finishedMinutes = record.completedAt
      ? new Date(record.completedAt).getHours() * 60 + new Date(record.completedAt).getMinutes()
      : record.lastReportedAt
        ? new Date(record.lastReportedAt).getHours() * 60 + new Date(record.lastReportedAt).getMinutes()
        : startedMinutes;

    const rangeStart = Math.max(0, startedMinutes);
    const rangeEnd = Math.max(rangeStart, finishedMinutes);

    if (effectiveMinute <= rangeStart) return sum;
    if (effectiveMinute >= rangeEnd) return sum + quantity;
    if (rangeEnd === rangeStart) return sum + quantity;

    const progress = (effectiveMinute - rangeStart) / (rangeEnd - rangeStart);
    return sum + Math.round((quantity * progress) / 10) * 10;
  }, 0);
}

function calculateActualRawUntil(
  stepId: string,
  stepUph: number,
  stepStartTime: string,
  minute: number,
  timeLabels: string[],
  intervalMinutes: number,
  snapshotsByTime: Record<string, Record<string, string[]>>,
) {
  const startMinutes = parseTime(stepStartTime);
  let actualRaw = 0;

  timeLabels.forEach((timeLabel) => {
    const slotStart = parseTime(timeLabel);
    const slotEnd = Math.min(slotStart + intervalMinutes, DEPLOYMENT_DAY_END);
    if (slotEnd <= startMinutes || slotStart >= minute) return;
    const effectiveStart = Math.max(slotStart, startMinutes);
    const effectiveEnd = Math.min(slotEnd, minute);
    if (effectiveEnd <= effectiveStart) return;
    actualRaw += countAssigned(snapshotsByTime[timeLabel], stepId) * stepUph * 0.82 * ((effectiveEnd - effectiveStart) / 60);
  });

  return actualRaw;
}

function projectEtaMinutes(params: {
  stepId: string;
  stepUph: number;
  stepStartTime: string;
  planned: number;
  referenceMinutes: number;
  timeLabels: string[];
  intervalMinutes: number;
  snapshotsByTime: Record<string, Record<string, string[]>>;
}) {
  const { stepId, stepUph, stepStartTime, planned, referenceMinutes, timeLabels, intervalMinutes, snapshotsByTime } = params;
  let remainingRaw = Math.max(
    0,
    planned - calculateActualRawUntil(stepId, stepUph, stepStartTime, referenceMinutes, timeLabels, intervalMinutes, snapshotsByTime),
  );
  if (remainingRaw === 0) return clamp(referenceMinutes, 0, DEPLOYMENT_DAY_END);

  for (let index = 0; index < timeLabels.length; index += 1) {
    const slotStart = parseTime(timeLabels[index]);
    const slotEnd = Math.min(slotStart + intervalMinutes, DEPLOYMENT_DAY_END);
    if (slotEnd <= referenceMinutes) continue;

    const effectiveStart = Math.max(slotStart, referenceMinutes, parseTime(stepStartTime));
    const effectiveEnd = Math.max(effectiveStart, slotEnd);
    const assignedCount = countAssigned(snapshotsByTime[timeLabels[index]], stepId);
    if (assignedCount <= 0 || effectiveEnd <= effectiveStart) continue;

    const hourlyCapacity = assignedCount * stepUph * 0.82;
    const slotCapacity = hourlyCapacity * ((effectiveEnd - effectiveStart) / 60);
    if (slotCapacity >= remainingRaw) {
      return Math.ceil(effectiveStart + (remainingRaw / hourlyCapacity) * 60);
    }

    remainingRaw -= slotCapacity;
  }

  return null;
}

function projectConfiguredEtaMinutes(params: {
  planned: number;
  actual: number;
  stepUph: number;
  configuredHeadcount: number;
  startTime: string;
  referenceMinutes: number;
}) {
  const { planned, actual, stepUph, configuredHeadcount, startTime, referenceMinutes } = params;
  const remaining = Math.max(0, planned - actual);
  if (remaining === 0) return clamp(referenceMinutes, 0, DEPLOYMENT_DAY_END);

  const hourlyCapacity = Math.max(configuredHeadcount, 0) * Math.max(stepUph, 1);
  if (hourlyCapacity <= 0) return null;

  const effectiveStart = Math.max(referenceMinutes, parseTime(startTime));
  return Math.ceil(effectiveStart + (remaining / hourlyCapacity) * 60);
}

function resolveEdgeType(manual: string, caution: string): WorkflowEdgeType {
  if (caution.trim()) return "split";
  if (manual.trim()) return "copy";
  return "serial";
}

function readDesignerEdgeStore() {
  if (typeof window === "undefined") return {} as Record<string, WorkflowEdge[]>;

  try {
    const raw = window.localStorage.getItem(DESIGNER_EDGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, WorkflowEdge[]>) : {};
  } catch {
    return {};
  }
}

function normalizeWorkflowEdges(
  workflowId: string,
  steps: Array<{ sourceStepId: string; manual: string; caution: string }>,
  savedEdges: WorkflowEdge[] | undefined,
) {
  const stepIds = new Set(steps.map((step) => step.sourceStepId));
  const filtered =
    savedEdges?.filter(
      (edge) =>
        (edge.type === "serial" || edge.type === "copy" || edge.type === "split") &&
        stepIds.has(edge.from) &&
        stepIds.has(edge.to) &&
        edge.from !== edge.to,
    ) ?? [];

  if (filtered.length > 0 || steps.length < 2) return filtered;

  return steps.slice(1).map((step, index) => ({
    id: `edge-${workflowId}-${steps[index].sourceStepId}-${step.sourceStepId}`,
    from: steps[index].sourceStepId,
    to: step.sourceStepId,
    type: resolveEdgeType(step.manual, step.caution),
  })) satisfies WorkflowEdge[];
}

function buildDagLevels(steps: WorkflowMiniStep[], edges: WorkflowEdge[]) {
  if (steps.length === 0) return [] as WorkflowDagLevel[];

  const indexById = new Map(steps.map((step, index) => [step.sourceStepId, index]));
  const inDegree = new Map(steps.map((step) => [step.sourceStepId, 0]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  const levelMap = new Map(steps.map((step) => [step.sourceStepId, 0]));

  edges.forEach((edge) => {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    const bucket = outgoing.get(edge.from) ?? [];
    bucket.push(edge);
    outgoing.set(edge.from, bucket);
  });

  const queue = steps
    .filter((step) => (inDegree.get(step.sourceStepId) ?? 0) === 0)
    .sort((left, right) => (indexById.get(left.sourceStepId) ?? 0) - (indexById.get(right.sourceStepId) ?? 0))
    .map((step) => step.sourceStepId);

  const visited = new Set(queue);

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;

    (outgoing.get(currentId) ?? []).forEach((edge) => {
      levelMap.set(edge.to, Math.max(levelMap.get(edge.to) ?? 0, (levelMap.get(currentId) ?? 0) + 1));
      inDegree.set(edge.to, Math.max(0, (inDegree.get(edge.to) ?? 0) - 1));

      if ((inDegree.get(edge.to) ?? 0) === 0 && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    });
  }

  steps.forEach((step, index) => {
    if (visited.has(step.sourceStepId)) return;
    levelMap.set(step.sourceStepId, index);
  });

  const grouped = new Map<number, WorkflowMiniStep[]>();
  steps.forEach((step) => {
    const level = levelMap.get(step.sourceStepId) ?? 0;
    const bucket = grouped.get(level) ?? [];
    bucket.push(step);
    grouped.set(level, bucket);
  });

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([level, levelSteps]) => ({
      level,
      steps: levelSteps.sort(
        (left, right) => (indexById.get(left.sourceStepId) ?? 0) - (indexById.get(right.sourceStepId) ?? 0),
      ),
    }));
}

function determineStepStatus(params: {
  planned: number;
  actual: number;
  etaMinutes: number | null;
  targetMinutes: number;
  plannedAtReference: number;
  referenceMinutes: number;
  startMinutes: number;
  isPast: boolean;
  dependencyGap: number;
  processableCount: number | null;
  configuredHeadcount: number;
  recommendedHeadcount: number;
}) {
  const {
    planned,
    actual,
    etaMinutes,
    targetMinutes,
    plannedAtReference,
    referenceMinutes,
    startMinutes,
    isPast,
    dependencyGap,
    processableCount,
    configuredHeadcount,
    recommendedHeadcount,
  } = params;

  if (planned <= 0) return "attention" satisfies StatusTone;
  if (actual >= planned) return "done" satisfies StatusTone;

  const progress = planned > 0 ? (actual / planned) * 100 : 0;
  const expectedProgress = planned > 0 ? (plannedAtReference / planned) * 100 : 0;
  const hasStarted = isPast || referenceMinutes > startMinutes;
  const etaLate = etaMinutes !== null && etaMinutes > targetMinutes;
  const etaRisk = etaMinutes !== null && etaMinutes > targetMinutes - 45;
  const severeLag = hasStarted && expectedProgress >= 20 && progress + 15 < expectedProgress;
  const mildLag = hasStarted && expectedProgress >= 10 && progress + 5 < expectedProgress;
  const upstreamBlocked = hasStarted && processableCount !== null && processableCount <= 0 && dependencyGap > 0;
  const staffingRisk = configuredHeadcount > 0 && recommendedHeadcount > configuredHeadcount;

  if (isPast || etaLate || severeLag) return "delayed";
  if ((hasStarted && actual === 0) || mildLag || etaRisk || upstreamBlocked || staffingRisk) return "attention";
  return "healthy";
}

function summarizeWorkflowStatus(steps: Array<{ status: StatusTone }>) {
  if (steps.length === 0) return "healthy" satisfies StatusTone;
  if (steps.every((step) => step.status === "done")) return "done" satisfies StatusTone;
  if (steps.some((step) => step.status === "delayed")) return "delayed" satisfies StatusTone;
  if (steps.some((step) => step.status === "attention")) return "attention" satisfies StatusTone;
  return "healthy";
}

function edgeTypeLabel(type: WorkflowEdgeType) {
  switch (type) {
    case "split":
      return "分岐";
    case "copy":
      return "複製";
    default:
      return "直列";
  }
}

function progressBarTone(progress: number, status: StatusTone) {
  if (status === "done") return "from-emerald-500 via-emerald-400 to-lime-300";
  if (status === "delayed") return "from-rose-600 via-rose-500 to-amber-400";
  if (status === "attention") return "from-amber-500 via-yellow-400 to-lime-300";
  if (progress >= 70) return "from-emerald-500 via-lime-400 to-cyan-400";
  return "from-cyan-500 via-sky-400 to-emerald-400";
}

function progressDisplayWidth(progress: number, planned: number) {
  if (planned <= 0) return "0%";
  if (progress <= 0) return "12px";
  return `${Math.min(progress, 100)}%`;
}

function formatEtaOffset(etaMinutes: number | null, referenceMinutes: number, etaLabel: string) {
  if (etaMinutes === null || etaLabel === "-" || etaLabel === "未設定" || etaLabel === "完了") return "";
  const deltaMinutes = Math.max(0, etaMinutes - Math.max(0, referenceMinutes));
  if (deltaMinutes <= 0) return "";
  return `(+${(deltaMinutes / 60).toFixed(1)}h)`;
}

function getStepExecutionMetrics(params: {
  stepId: string;
  stepUph: number;
  configuredHeadcount: number;
  planned: number;
  actualReported: number;
  startTime: string;
  targetEndTime: string;
  selectedDate: string;
  today: string;
  nowMinutes: number;
  timeLabels: string[];
  intervalMinutes: number;
  snapshotsByTime: Record<string, Record<string, string[]>>;
}) {
  const {
    stepId,
    stepUph,
    configuredHeadcount,
    planned,
    actualReported,
    startTime,
    targetEndTime,
    selectedDate,
    today,
    nowMinutes,
    timeLabels,
    intervalMinutes,
    snapshotsByTime,
  } = params;

  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");
  const isFuture = selectedDateValue > todayValue;
  const isPast = selectedDateValue < todayValue;
  const referenceMinutes = isFuture ? parseTime(startTime) : isPast ? DEPLOYMENT_DAY_END : nowMinutes;
  const actual = Math.max(0, actualReported);
  const remaining = Math.max(0, planned - actual);
  const progress = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
  const totalUph = configuredHeadcount > 0 ? configuredHeadcount * stepUph : 0;

  let eta = "-";
  let etaMinutes: number | null = null;
  if (planned === 0) {
    eta = "未設定";
  } else if (remaining === 0) {
    eta = "完了";
    etaMinutes = clamp(referenceMinutes, 0, DEPLOYMENT_DAY_END);
  } else {
    const projectedEta =
      projectEtaMinutes({
        stepId,
        stepUph,
        stepStartTime: startTime,
        planned,
        referenceMinutes: Math.max(referenceMinutes, parseTime(startTime)),
        timeLabels,
        intervalMinutes,
        snapshotsByTime,
      }) ??
      projectConfiguredEtaMinutes({
        planned,
        actual,
        stepUph,
        referenceMinutes: Math.max(referenceMinutes, parseTime(startTime)),
        configuredHeadcount,
        startTime,
      });
    etaMinutes = projectedEta;
    eta = projectedEta === null ? "-" : formatTime(Math.min(projectedEta, DEPLOYMENT_DAY_END));
  }

  const plannedAtReference = isPast
    ? planned
    : isFuture
      ? 0
      : getPlannedValueAtMinute(startTime, targetEndTime, planned, referenceMinutes);
  return {
    actual,
    remaining,
    progress,
    totalUph,
    eta,
    etaMinutes,
    plannedAtReference,
    referenceMinutes,
    targetMinutes: parseTime(targetEndTime),
    startMinutes: parseTime(startTime),
    isPast,
  };
}

function buildStepTrend(params: {
  planned: number;
  startTime: string;
  targetEndTime: string;
  records: WorkerSubmissionRecord[];
  selectedDate: string;
  today: string;
  nowMinutes: number;
}) {
  const { planned, startTime, targetEndTime, records, selectedDate, today, nowMinutes } = params;
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");
  const isFuture = selectedDateValue > todayValue;
  const currentActual = Math.min(
    planned,
    getSubmissionQuantityAtMinute(records, selectedDateValue < todayValue ? DEPLOYMENT_DAY_END : nowMinutes, selectedDate, today, nowMinutes),
  );

  return TREND_SAMPLE_MINUTES.map((minute) => {
    const plannedAtPoint = getPlannedValueAtMinute(startTime, targetEndTime, planned, minute);
    if (isFuture) return { label: formatTime(minute), planned: plannedAtPoint, actual: 0 };

    const actualAtPoint = planned > 0
      ? Math.min(planned, getSubmissionQuantityAtMinute(records, minute, selectedDate, today, nowMinutes))
      : 0;

    return {
      label: formatTime(minute),
      planned: plannedAtPoint,
      actual: minute <= nowMinutes || selectedDateValue < todayValue ? actualAtPoint : currentActual,
    };
  });
}

function statusConfig(status: StatusTone) {
  switch (status) {
    case "done":
      return { label: "完了", className: "bg-emerald-500/15 text-emerald-500", icon: CheckCircle2 };
    case "delayed":
      return { label: "遅延", className: "bg-rose-500/15 text-rose-500", icon: AlertTriangle };
    case "attention":
      return { label: "注意", className: "bg-amber-500/15 text-amber-500", icon: Clock3 };
    default:
      return { label: "順調", className: "bg-cyan-500/15 text-cyan-500", icon: TrendingUp };
  }
}

function TrendSparkline({ points, colors }: { points: TrendPoint[]; colors: ReturnType<typeof useThemeColors> }) {
  const width = 132;
  const height = 34;
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.planned, point.actual]));
  const buildPolyline = (key: "planned" | "actual") =>
    points
      .map((point, index) => {
        const x = points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width;
        const y = height - 4 - (point[key] / maxValue) * (height - 10);
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <div className="min-w-[144px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-[132px]" role="img" aria-label="予定数と実績数の推移">
        <line x1="0" y1={height - 4} x2={width} y2={height - 4} stroke={colors.isDark ? "#263041" : "#dbe4ee"} strokeWidth="1" />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={colors.isDark ? "#1e293b" : "#edf2f7"} strokeWidth="1" strokeDasharray="4 4" />
        <polyline fill="none" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4 3" points={buildPolyline("planned")} />
        <polyline fill="none" stroke="#06b6d4" strokeWidth="2.4" points={buildPolyline("actual")} />
      </svg>
      <div className={`mt-0.5 flex items-center gap-2 text-[9px] ${colors.textMuted}`}>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          予定
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
          実績
        </span>
      </div>
    </div>
  );
}

function TrendDetailChart({ points, colors }: { points: TrendPoint[]; colors: ReturnType<typeof useThemeColors> }) {
  const gridStroke = colors.isDark ? "#1e293b" : "#e2e8f0";
  const axisStroke = colors.isDark ? "#475569" : "#94a3b8";
  const tickFill = colors.isDark ? "#94a3b8" : "#64748b";
  const tooltipBg = colors.isDark ? "#111827" : "#ffffff";
  const tooltipBorder = colors.isDark ? "#334155" : "#cbd5e1";
  const tooltipColor = colors.isDark ? "#e2e8f0" : "#0f172a";

  return (
    <div className={`${colors.bgSurface} ${colors.borderCard} rounded-3xl border p-4`}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={points} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="label" stroke={axisStroke} tick={{ fontSize: 11, fill: tickFill }} />
          <YAxis stroke={axisStroke} tick={{ fontSize: 11, fill: tickFill }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: "12px",
              color: tooltipColor,
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "11px", color: tickFill }} />
          <Line type="monotone" dataKey="planned" name="予定数" stroke="#8b5cf6" strokeWidth={2.2} strokeDasharray="6 4" dot={{ r: 3 }} />
          <Line type="monotone" dataKey="actual" name="実績数" stroke="#06b6d4" strokeWidth={2.4} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniWorkflowDag({
  levels,
  edges,
  colors,
  className = "",
}: {
  levels: WorkflowDagLevel[];
  edges: WorkflowEdge[];
  colors: ReturnType<typeof useThemeColors>;
  className?: string;
}) {
  if (levels.length === 0) return null;

  const railClass =
    colors.isDark
      ? "border-slate-800 bg-slate-950/45"
      : "border-slate-200 bg-slate-100/90";
  const typeLegend = [...new Set(edges.map((edge) => edge.type))];

  const nodeClass = (step: WorkflowMiniStep) => {
    const tone = statusConfig(step.status);
    const dependencyClass =
      step.dependencyGap > 0 && step.processableCount === 0
        ? colors.isDark
          ? "ring-1 ring-amber-500/40"
          : "ring-1 ring-amber-400/60"
        : "";

    return `${tone.className} ${dependencyClass} rounded-xl border border-current/20 px-3 py-2 shadow-sm`;
  };

  return (
    <div className={`overflow-x-auto rounded-2xl border px-3 py-3 ${railClass} ${className}`}>
      <div className="flex min-w-max items-start gap-3">
        {levels.map((level, index) => {
          const nextLevel = levels[index + 1];
          const currentIds = new Set(level.steps.map((step) => step.sourceStepId));
          const nextIds = new Set(nextLevel?.steps.map((step) => step.sourceStepId) ?? []);
          const labels = [...new Set(
            edges
              .filter((edge) => currentIds.has(edge.from) && nextIds.has(edge.to))
              .map((edge) => edgeTypeLabel(edge.type)),
          )];

          return (
            <div key={level.level} className="flex items-start gap-3">
              <div className="flex min-w-[184px] flex-col gap-2">
                <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${colors.textMuted}`}>
                  {level.steps.length > 1 ? `parallel ${index + 1}` : `step ${index + 1}`}
                </div>
                {level.steps.map((step) => (
                  <div key={step.id} className={nodeClass(step)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold">{step.processName}</span>
                      <span className="text-[10px] font-semibold">{formatPercent(step.progress)}</span>
                    </div>
                    <div className="mt-1 text-[10px] opacity-80">
                      実績 {step.actual.toLocaleString("ja-JP")} / {step.planned.toLocaleString("ja-JP")} 件
                    </div>
                    {step.dependencyGap > 0 && (
                      <div className="mt-1 text-[10px] opacity-80">
                        前工程待ち {step.dependencyGap.toLocaleString("ja-JP")} 件
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {nextLevel && (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <ArrowRight className={`h-4 w-4 ${colors.textMuted}`} />
                  {labels.length > 0 && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${colors.borderCard} ${colors.textSecondary}`}>
                      {labels.join(" / ")}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={`mt-3 flex flex-wrap gap-2 text-[10px] ${colors.textMuted}`}>
        <span>矢印表示は上流依存の向きです</span>
        {typeLegend.map((type) => (
          <span key={type} className={`rounded-full border px-2 py-0.5 ${colors.borderCard}`}>
            {edgeTypeLabel(type)}
          </span>
        ))}
      </div>
    </div>
  );
}

function RequirementIconSummary({
  conditions,
  colors,
}: {
  conditions: RequiredCondition[];
  colors: ReturnType<typeof useThemeColors>;
}) {
  const groups = [
    {
      key: "qualification",
      label: "資格",
      icon: ShieldCheck,
      items: conditions.filter((condition) => condition.kind === "qualification").map((condition) => condition.label),
      textClass: "text-amber-500",
      bgClass: "bg-amber-500/10",
    },
    {
      key: "skill",
      label: "スキル",
      icon: Wrench,
      items: conditions.filter((condition) => condition.kind === "skill").map((condition) => condition.label),
      textClass: "text-cyan-500",
      bgClass: "bg-cyan-500/10",
    },
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return <span className={`text-xs ${colors.textMuted}`}>-</span>;
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {groups.map((group) => {
        const Icon = group.icon;
        const tooltipText = `${group.label}: ${group.items.join(" / ")}`;

        return (
          <div key={group.key} className="group relative">
            <button
              type="button"
              title={tooltipText}
              aria-label={tooltipText}
              className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${colors.borderCard} ${colors.bgSurface} ${group.textClass}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{group.items.length}</span>
            </button>
            <div
              className={`pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-max max-w-[220px] -translate-x-1/2 rounded-xl border px-3 py-2 text-left text-[11px] leading-5 shadow-xl group-hover:block group-focus-within:block ${colors.bgCard} ${colors.borderCard}`}
            >
              <div className={`font-semibold ${group.textClass}`}>{group.label}</div>
              <div className={`mt-1 ${colors.textSecondary}`}>{group.items.join(" / ")}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function areaToneClass(tone: StepAreaDetailTone, colors: ReturnType<typeof useThemeColors>) {
  switch (tone) {
    case "missing":
      return {
        badge: colors.isDark
          ? "border-rose-400/30 bg-rose-500/15 text-rose-200"
          : "border-rose-200 bg-rose-50 text-rose-700",
        panel: colors.isDark ? "bg-slate-900/65" : "bg-slate-50/90",
      };
    case "unassigned":
      return {
        badge: colors.isDark
          ? "border-amber-400/30 bg-amber-500/15 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-700",
        panel: colors.isDark ? "bg-slate-900/65" : "bg-slate-50/90",
      };
    default:
      return {
        badge: colors.isDark
          ? "border-sky-400/30 bg-sky-500/15 text-sky-200"
          : "border-sky-200 bg-sky-50 text-sky-700",
        panel: colors.isDark ? "bg-slate-900/65" : "bg-slate-50/90",
      };
  }
}

function StepAreaDetailRows({
  step,
  colors,
  trendButtonClass,
  inputClass,
  selectedDate,
  setPlanStore,
  onOpenTrend,
}: {
  step: {
    id: string;
    processName: string;
    startTime: string;
    targetEndTime: string;
    planned: number;
    actual: number;
    progress: number;
    processableCount: number | null;
    dependencyGap: number;
    previousProcessName: string | null;
    previousActual: number | null;
    requiredPersonHours: number;
    totalUph: number;
    headcount: number;
    requiredHeadcount: number;
    uph: number;
    requiredConditions: RequiredCondition[];
    trend: TrendPoint[];
    eta: string;
    status: StatusTone;
    areaRows: Array<
      StepAreaDetail & {
        planKey: string;
        planned: number;
        startTime: string;
        targetEndTime: string;
      }
    >;
  };
  colors: ReturnType<typeof useThemeColors>;
  trendButtonClass: string;
  inputClass: string;
  selectedDate: string;
  setPlanStore: (value: ProgressPlanStore | ((prev: ProgressPlanStore) => ProgressPlanStore)) => void;
  onOpenTrend: (stepId: string) => void;
}) {
  return (
    <>
      {step.areaRows.map((detail) => {
        const tone = areaToneClass(detail.tone, colors);
        const toneLabel = detail.tone === "configured" ? "設定済み" : detail.tone === "missing" ? "要確認" : "未設定";
        const pinClass =
          detail.tone === "configured" ? "text-sky-500" : detail.tone === "missing" ? "text-rose-500" : "text-amber-500";
        const status = statusConfig(step.status);
        const StatusIcon = status.icon;

        return (
          <tr key={detail.id} id={`step-area-panel-${step.id}-${detail.id}`} className={`border-t ${colors.borderCard} ${tone.panel}`}>
            <td className="px-4 py-4 align-middle">
              <div className="space-y-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <MapPin className={`h-4 w-4 shrink-0 ${pinClass}`} />
                  <span className={`font-medium ${colors.textPrimary}`}>{detail.name}</span>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone.badge}`}>{toneLabel}</span>
                </div>
                <div className={`text-xs ${colors.textSecondary}`}>{detail.description}</div>
                <div className={`text-xs ${colors.textMuted}`}>工程: {step.processName}</div>
              </div>
            </td>
            <td className="px-4 py-4 align-middle">
              <input
                type="time"
                value={detail.startTime}
                onChange={(event) =>
                  setPlanStore((prev) =>
                    updateStepPlanEntry(
                      prev,
                      selectedDate,
                      detail.planKey,
                      { startTime: event.target.value },
                      {
                        planned: detail.planned,
                        startTime: detail.startTime,
                        targetEndTime: detail.targetEndTime,
                      },
                    ),
                  )
                }
                className={`${inputClass} mx-auto max-w-[132px] text-center`}
              />
            </td>
            <td className="px-4 py-4 align-middle">
              <input
                type="time"
                value={detail.targetEndTime}
                onChange={(event) =>
                  setPlanStore((prev) =>
                    updateStepPlanEntry(
                      prev,
                      selectedDate,
                      detail.planKey,
                      { targetEndTime: event.target.value },
                      {
                        planned: detail.planned,
                        startTime: detail.startTime,
                        targetEndTime: detail.targetEndTime,
                      },
                    ),
                  )
                }
                className={`${inputClass} mx-auto max-w-[132px] text-center`}
              />
            </td>
            <td className="px-4 py-4 align-middle">
              <input
                type="number"
                min={0}
                value={detail.planned}
                onChange={(event) =>
                  setPlanStore((prev) =>
                    updateStepPlanEntry(
                      prev,
                      selectedDate,
                      detail.planKey,
                      { planned: Math.max(0, Number(event.target.value) || 0) },
                      {
                        planned: detail.planned,
                        startTime: detail.startTime,
                        targetEndTime: detail.targetEndTime,
                      },
                    ),
                  )
                }
                className={`${inputClass} mx-auto max-w-[132px] text-center`}
              />
            </td>
            <td className="px-4 py-4 align-middle">
              <div className={`font-medium ${colors.textPrimary}`}>{step.actual.toLocaleString("ja-JP")} 件</div>
            </td>
            <td className="px-4 py-4 align-middle">
              {step.processableCount === null ? (
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${colors.bgCard} ${colors.textSecondary}`}>前工程なし</span>
              ) : (
                <div className="min-w-[188px] text-left">
                  <div className={`font-medium ${step.processableCount === 0 && step.dependencyGap > 0 ? "text-amber-500" : colors.textPrimary}`}>
                    {step.processableCount.toLocaleString("ja-JP")} 件
                  </div>
                  <div className={`mt-1 text-xs ${colors.textMuted}`}>
                    {step.previousProcessName} 実績 {step.previousActual?.toLocaleString("ja-JP")} 件
                  </div>
                  {step.dependencyGap > 0 && (
                    <div className={`mt-1 text-xs ${step.processableCount === 0 ? "text-rose-500" : "text-amber-500"}`}>
                      予定に対して {step.dependencyGap.toLocaleString("ja-JP")} 件不足
                    </div>
                  )}
                </div>
              )}
            </td>
            <td className="px-4 py-4 align-middle">
              <div className={`${colors.textPrimary}`}>{formatHeadcountValue(step.requiredHeadcountValue ?? step.requiredHeadcount)}</div>
            </td>
            <td className="px-4 py-4 align-middle">
              <div className="mx-auto min-w-[168px]">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={colors.textSecondary}>{formatPercent(step.progress)}</span>
                  <span className={colors.textMuted}>
                    {step.actual.toLocaleString("ja-JP")} / {step.planned.toLocaleString("ja-JP")}
                  </span>
                </div>
                <div className={`mt-2 h-3 overflow-hidden rounded-full border ${colors.borderCard} ${colors.bgSurface}`}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${progressBarTone(step.progress, step.status)} transition-all`}
                    style={{ width: progressDisplayWidth(step.progress, step.planned) }}
                  />
                </div>
              </div>
            </td>
            <td className="px-4 py-4 align-middle">
              <div className="font-semibold text-violet-500">{step.totalUph.toLocaleString("ja-JP")}</div>
              <div className={`mt-1 text-xs ${colors.textMuted}`}>
                配置 {step.headcount}人 / 推奨 {step.requiredHeadcount}人 / 単位 {step.uph.toLocaleString("ja-JP")}
              </div>
            </td>
            <td className="px-4 py-4 align-middle">
              <RequirementIconSummary conditions={step.requiredConditions} colors={colors} />
            </td>
            <td className="px-4 py-4 align-middle">
              <button
                type="button"
                onClick={() => onOpenTrend(step.id)}
                className={trendButtonClass}
                aria-label={`${detail.name} の進捗推移を詳しく見る`}
              >
                <TrendSparkline points={step.trend} colors={colors} />
              </button>
            </td>
            <td className="px-4 py-4 align-middle">
              <div className={`${colors.textPrimary}`}>{step.eta}</div>
              {step.actual === 0 && step.eta !== "-" && step.eta !== "未設定" && step.eta !== "完了" && (
                <div className={`mt-1 text-xs ${colors.textMuted}`}>UPH x 配置人数ベースで推計</div>
              )}
            </td>
            <td className="px-4 py-4 align-middle">
              <div className="flex flex-col items-center gap-1">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${status.className}`}>
                  <StatusIcon className="h-3 w-3" />
                  {status.label}
                </span>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${tone.badge}`}>{toneLabel}</span>
                {step.processableCount === 0 && step.dependencyGap > 0 && (
                  <span className="text-[10px] text-amber-500">前工程待ち</span>
                )}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function ProcessSummary() {
  const c = useThemeColors();
  const navigate = useNavigate();
  const {
    selectedSiteId,
    sites,
    workflows,
    setWorkflows,
    shippers,
    processes,
    qualifications,
    skills,
    getShippersForSite,
  } = useMasterData();

  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [keyword, setKeyword] = useState("");
  const [planStore, setPlanStore] = useState<ProgressPlanStore>(() => readProgressPlanStore());
  const [selectedTrend, setSelectedTrend] = useState<TrendDialogState | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addShipperId, setAddShipperId] = useState("");
  const [addWorkflowTemplateId, setAddWorkflowTemplateId] = useState("");
  const [addBulkAreaId, setAddBulkAreaId] = useState("");
  const [addBulkStartTime, setAddBulkStartTime] = useState("06:00");
  const [addBulkTargetEndTime, setAddBulkTargetEndTime] = useState("20:30");
  const [addBulkPlanned, setAddBulkPlanned] = useState(0);
  const [addBulkUph, setAddBulkUph] = useState(1);
  const [addStepDrafts, setAddStepDrafts] = useState<AddWorkflowStepDraft[]>([]);
  const [isAddRowOpen, setIsAddRowOpen] = useState(false);
  const [addRowDraft, setAddRowDraft] = useState<AddWorkflowStepDraft>({
    sourceStepId: "",
    processId: "",
    processName: "",
    previousStepId: "",
    areaId: "",
    planned: 0,
    uph: 1,
    startTime: "06:00",
    targetEndTime: "20:30",
  });

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(planStore));
  }, [planStore]);

  useEffect(() => {
    if (!selectedTrend) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTrend(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTrend]);

  const resetAddDialog = () => {
    setAddShipperId(availableShippers[0]?.id ?? "");
    setAddWorkflowTemplateId(availableWorkflowTemplates[0]?.id ?? "");
    setIsAddRowOpen(false);
  };

  const openAddDialog = () => {
    resetAddDialog();
    setIsAddDialogOpen(true);
  };

  const closeAddDialog = () => {
    setIsAddDialogOpen(false);
  };

  const appendAddRowDraft = () => {
    if (!addRowDraft.processId) return;
    const nextDraftId = makeId("draft-step");

    setAddStepDrafts((prev) => [
      ...prev,
      {
        ...addRowDraft,
        sourceStepId: nextDraftId,
        processName: processNameById.get(addRowDraft.processId) ?? addRowDraft.processName,
      },
    ]);
    setAddRowDraft((prev) => ({
      ...prev,
      sourceStepId: "",
      processId: availableProcessOptions[0]?.id ?? "",
      processName: availableProcessOptions[0]?.name ?? "",
      previousStepId: nextDraftId,
      uph: Math.max(1, processById.get(availableProcessOptions[0]?.id ?? "")?.defaultUph || 1),
    }));
    setIsAddRowOpen(false);
  };

  const buildAddStepDrafts = (template: WorkflowDefinition): AddWorkflowStepDraft[] =>
    template.steps.map((step, stepIndex) => {
      const headcount = Math.max(step.standardHeadcount || 1, 1);
      const uph = Math.max(step.uph || 1, 1);
      const defaults = buildStepPlanDefaults(0, stepIndex, headcount, uph);

      return {
        sourceStepId: step.id,
        processId: step.processId,
        processName: processNameById.get(step.processId) ?? `業務 ${stepIndex + 1}`,
        previousStepId: step.previousStepId ?? template.steps[stepIndex - 1]?.id ?? "",
        areaId: step.layoutAreaIds?.[0] ?? selectedSiteLayoutAreas[0]?.id ?? "",
        planned: defaults.planned,
        uph,
        startTime: defaults.startTime,
        targetEndTime: defaults.targetEndTime,
      };
    });

  const buildWorkflowStepsFromDrafts = (template: WorkflowDefinition, drafts: AddWorkflowStepDraft[]): WorkflowStepSetting[] => {
    const templateStepById = new Map(template.steps.map((step) => [step.id, step]));
    const nextStepIdByDraftId = new Map(drafts.map((draft) => [draft.sourceStepId, makeId("step")]));

    return drafts.flatMap((draft) => {
      const templateStep = templateStepById.get(draft.sourceStepId);
      const process = processById.get(draft.processId);
      if (!templateStep && !process) return [];

      return [
        {
          id: nextStepIdByDraftId.get(draft.sourceStepId) ?? makeId("step"),
          processId: draft.processId,
          previousStepId:
            draft.previousStepId && nextStepIdByDraftId.has(draft.previousStepId)
              ? nextStepIdByDraftId.get(draft.previousStepId)
              : undefined,
          layoutAreaIds: draft.areaId ? [draft.areaId] : [],
          requiredQualificationIds: templateStep
            ? [...templateStep.requiredQualificationIds]
            : [...(process?.defaultQualificationIds ?? [])],
          requiredSkillIds: templateStep ? [...templateStep.requiredSkillIds] : [...(process?.defaultSkillIds ?? [])],
          standardHeadcount: templateStep
            ? Math.max(1, templateStep.standardHeadcount || 1)
            : Math.max(1, process?.defaultHeadcount || 1),
          uph: Math.max(1, draft.uph || templateStep?.uph || process?.defaultUph || 1),
          manual: templateStep?.manual ?? "",
          caution: templateStep?.caution ?? "",
        },
      ];
    });
  };

  const submitAddDialog = () => {
    if (!selectedSiteId || !addShipperId) return;

    const template = availableWorkflowTemplates.find((workflow) => workflow.id === addWorkflowTemplateId);
    if (!template || addStepDrafts.length === 0) return;

    const nextWorkflow = {
      id: makeId("workflow"),
      name: template.name,
      shipperId: addShipperId,
      siteId: selectedSiteId,
      steps: buildWorkflowStepsFromDrafts(template, addStepDrafts),
      updatedAt: new Date().toISOString(),
    } satisfies WorkflowDefinition;

    if (nextWorkflow.steps.length === 0) return;

    setWorkflows((prev) => [nextWorkflow, ...prev]);
    setPlanStore((prev) => {
      let nextStore = prev;

      nextWorkflow.steps.forEach((step, index) => {
        const draft = addStepDrafts[index];
        if (!draft) return;

        nextStore = updateStepPlanEntry(
          nextStore,
          selectedDate,
          step.id,
          {
            planned: draft.planned,
            startTime: draft.startTime,
            targetEndTime: draft.targetEndTime,
          },
          {
            planned: draft.planned,
            startTime: draft.startTime,
            targetEndTime: draft.targetEndTime,
          },
        );
      });

      return nextStore;
    });
    setIsAddDialogOpen(false);
  };

  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const scopedWorkflows = useMemo(
    () => workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)),
    [workflows, siteScope.siteIds],
  );
  const availableWorkflowTemplates = useMemo(
    () => [...scopedWorkflows].sort((left, right) => left.name.localeCompare(right.name, "ja")),
    [scopedWorkflows],
  );
  const workflowViews = useMemo(
    () => buildDeploymentWorkflows(scopedWorkflows, shippers, sites, processes),
    [scopedWorkflows, shippers, sites, processes],
  );
  const attendanceWorkers = useMemo(() => readAttendanceWorkers(), [qualifications, skills]);
  const users = useMemo(() => readUsersFromStorage(), [qualifications, skills]);
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
  const submissionRecordsByStep = useMemo(() => {
    const map = new Map<string, WorkerSubmissionRecord[]>();
    records.forEach((record) => {
      const group = map.get(record.stepId) ?? [];
      group.push(record);
      map.set(record.stepId, group);
    });
    return map;
  }, [records]);
  const today = toDateInput(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const storedDeploymentSnapshots = useMemo(
    () => readFieldDeploymentSnapshots(siteScope.storageScopeKey, selectedDate),
    [siteScope.storageScopeKey, selectedDate],
  );
  const deploymentTimeLabels = useMemo(
    () => sortTimeLabels(Object.keys(storedDeploymentSnapshots)),
    [storedDeploymentSnapshots],
  );
  const deploymentIntervalMinutes = useMemo(
    () => detectSnapshotInterval(deploymentTimeLabels),
    [deploymentTimeLabels],
  );
  const qualificationNameById = useMemo(
    () => new Map(qualifications.map((qualification) => [qualification.id, qualification.name])),
    [qualifications],
  );
  const skillNameById = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill.name])),
    [skills],
  );
  const processById = useMemo(() => new Map(processes.map((process) => [process.id, process])), [processes]);
  const processNameById = useMemo(() => new Map(processes.map((process) => [process.id, process.name])), [processes]);
  const availableProcessOptions = useMemo(
    () => [...processes].sort((left, right) => left.name.localeCompare(right.name, "ja")),
    [processes],
  );
  const siteById = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const selectedSiteLayoutAreas = useMemo(() => siteById.get(selectedSiteId)?.layoutAreas ?? [], [siteById, selectedSiteId]);
  const availableShippers = useMemo(() => {
    const scoped = selectedSiteId ? getShippersForSite(selectedSiteId) : [];
    return scoped.length > 0 ? scoped : shippers;
  }, [getShippersForSite, selectedSiteId, shippers]);
  const selectedAddTemplate = useMemo(
    () => availableWorkflowTemplates.find((workflow) => workflow.id === addWorkflowTemplateId) ?? null,
    [availableWorkflowTemplates, addWorkflowTemplateId],
  );
  const addStepDraftIds = useMemo(() => new Set(addStepDrafts.map((draft) => draft.sourceStepId)), [addStepDrafts]);
  const areAddStepDependenciesValid = useMemo(
    () =>
      addStepDrafts.every(
        (draft) =>
          !draft.previousStepId || (draft.previousStepId !== draft.sourceStepId && addStepDraftIds.has(draft.previousStepId)),
      ),
    [addStepDraftIds, addStepDrafts],
  );
  const canSubmitAddDialog =
    Boolean(selectedSiteId) &&
    Boolean(addShipperId) &&
    Boolean(addWorkflowTemplateId) &&
    addStepDrafts.length > 0 &&
    areAddStepDependenciesValid &&
    addStepDrafts.every(
      (draft) =>
        draft.startTime &&
        draft.targetEndTime &&
        Number.isFinite(draft.planned) &&
        Number.isFinite(draft.uph) &&
        draft.uph > 0,
    );

  useEffect(() => {
    if (!isAddDialogOpen) return;

    if (!selectedAddTemplate) {
      setAddStepDrafts([]);
      setIsAddRowOpen(false);
      setAddRowDraft({
        sourceStepId: "",
        processId: availableProcessOptions[0]?.id ?? "",
        processName: availableProcessOptions[0]?.name ?? "",
        previousStepId: "",
        areaId: selectedSiteLayoutAreas[0]?.id ?? "",
        planned: 0,
        uph: Math.max(1, processById.get(availableProcessOptions[0]?.id ?? "")?.defaultUph || 1),
        startTime: "06:00",
        targetEndTime: "20:30",
      });
      return;
    }

    const drafts = buildAddStepDrafts(selectedAddTemplate);
    setAddStepDrafts(drafts);
    setIsAddRowOpen(false);
    setAddBulkAreaId(drafts[0]?.areaId ?? selectedSiteLayoutAreas[0]?.id ?? "");
    setAddBulkStartTime(drafts[0]?.startTime ?? "06:00");
    setAddBulkTargetEndTime(drafts[0]?.targetEndTime ?? "20:30");
    setAddBulkPlanned(drafts[0]?.planned ?? 0);
    setAddBulkUph(drafts[0]?.uph ?? 1);
    setAddRowDraft({
      sourceStepId: "",
      processId: availableProcessOptions[0]?.id ?? "",
      processName: availableProcessOptions[0]?.name ?? "",
      previousStepId: drafts.at(-1)?.sourceStepId ?? "",
      areaId: drafts[0]?.areaId ?? selectedSiteLayoutAreas[0]?.id ?? "",
      planned: drafts[0]?.planned ?? 0,
      uph: drafts[0]?.uph ?? Math.max(1, processById.get(availableProcessOptions[0]?.id ?? "")?.defaultUph || 1),
      startTime: drafts[0]?.startTime ?? "06:00",
      targetEndTime: drafts[0]?.targetEndTime ?? "20:30",
    });
  }, [isAddDialogOpen, selectedAddTemplate, selectedSiteLayoutAreas, availableProcessOptions, processById]);

  const rows = useMemo(() => {
    const dayStore = planStore[selectedDate];
    const normalizedKeyword = keyword.trim().toLowerCase();

    return workflowViews
      .map((workflow, workflowIndex) => {
        const workflowSite = siteById.get(workflow.siteId);
        const steps = workflow.steps.map((step, stepIndex) => {
          const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph);
          const basePlan = resolveStepPlanValues(dayStore, step.id, {
            planned: defaults.planned,
            startTime: step.startTime,
            targetEndTime: step.targetEndTime,
          });
          const areaRows = buildStepAreaDetails(step.layoutAreaIds, workflowSite).map((detail, areaIndex, details) => {
            const areaDefaults = {
              planned: splitPlannedQuantity(basePlan.planned, details.length, areaIndex),
              startTime: basePlan.startTime,
              targetEndTime: basePlan.targetEndTime,
            };
            const planKey = buildAreaPlanKey(step.id, detail.id);
            const areaPlan = resolveStepPlanValues(dayStore, planKey, areaDefaults);

            return {
              ...detail,
              planKey,
              planned: areaPlan.planned,
              startTime: areaPlan.startTime,
              targetEndTime: areaPlan.targetEndTime,
            };
          });
          const plan = aggregateAreaPlanValues(areaRows, basePlan);
          const requiredHeadcountValue = calculateRequiredHeadcountValue(
            plan.planned,
            step.uph,
            plan.startTime,
            plan.targetEndTime,
            step.headcount,
          );
          const requiredHeadcount = calculateRequiredHeadcount(
            plan.planned,
            step.uph,
            plan.startTime,
            plan.targetEndTime,
            step.headcount,
          );
          const metrics = getStepExecutionMetrics({
            stepId: step.id,
            stepUph: step.uph,
            configuredHeadcount: step.headcount,
            planned: plan.planned,
            actualReported: reportedQuantityMap.get(step.id) ?? 0,
            startTime: plan.startTime,
            targetEndTime: plan.targetEndTime,
            selectedDate,
            today,
            nowMinutes,
            timeLabels: deploymentTimeLabels,
            intervalMinutes: deploymentIntervalMinutes,
            snapshotsByTime: storedDeploymentSnapshots,
          });
          const trend = buildStepTrend({
            planned: plan.planned,
            startTime: plan.startTime,
            targetEndTime: plan.targetEndTime,
            records: submissionRecordsByStep.get(step.id) ?? [],
            selectedDate,
            today,
            nowMinutes,
          });

          return {
            ...step,
            planned: plan.planned,
            startTime: plan.startTime,
            targetEndTime: plan.targetEndTime,
            requiredConditions: [
              ...step.requiredQualificationIds.flatMap((id) => {
                const label = qualificationNameById.get(id);
                return label ? [{ id: `qualification-${id}`, label, kind: "qualification" as const }] : [];
              }),
              ...step.requiredSkillIds.flatMap((id) => {
                const label = skillNameById.get(id);
                return label ? [{ id: `skill-${id}`, label, kind: "skill" as const }] : [];
              }),
            ],
            assignedCount: getAssignedCountAtReference({
              stepId: step.id,
              startTime: plan.startTime,
              selectedDate,
              today,
              nowMinutes,
              timeLabels: deploymentTimeLabels,
              snapshotsByTime: storedDeploymentSnapshots,
            }),
            requiredHeadcount,
            requiredHeadcountValue,
            requiredPersonHours: calculateRequiredPersonHours(plan.planned, step.uph),
            areaRows,
            actual: metrics.actual,
            remaining: metrics.remaining,
            totalUph: metrics.totalUph,
            progress: metrics.progress,
            eta: metrics.eta,
            etaMinutes: metrics.etaMinutes,
            plannedAtReference: metrics.plannedAtReference,
            referenceMinutes: metrics.referenceMinutes,
            targetMinutes: metrics.targetMinutes,
            startMinutes: metrics.startMinutes,
            isPast: metrics.isPast,
            trend,
          };
        });
        const stepBySourceId = new Map(steps.map((step) => [step.sourceStepId, step]));
        const allSteps = steps.map((step, stepIndex) => {
          const fallbackPrevious = stepIndex > 0 ? steps[stepIndex - 1]?.sourceStepId ?? "" : "";
          const dependencySourceStepId = step.previousStepId ?? fallbackPrevious;
          const serialDependencies = dependencySourceStepId
            ? [stepBySourceId.get(dependencySourceStepId)].filter((candidate): candidate is typeof step => Boolean(candidate))
            : [];
          const upstreamActual = serialDependencies.reduce((sum, dependency) => sum + dependency.actual, 0);
          const processableCount = serialDependencies.length > 0 ? Math.max(0, upstreamActual - step.actual) : null;
          const dependencyGap = serialDependencies.length > 0 ? Math.max(0, step.planned - upstreamActual) : 0;
          const status = determineStepStatus({
            planned: step.planned,
            actual: step.actual,
            etaMinutes: step.etaMinutes,
            targetMinutes: step.targetMinutes,
            plannedAtReference: step.plannedAtReference,
            referenceMinutes: step.referenceMinutes,
            startMinutes: step.startMinutes,
            isPast: step.isPast,
            dependencyGap,
            processableCount,
            configuredHeadcount: step.headcount,
            recommendedHeadcount: step.requiredHeadcount,
          });

          return {
            ...step,
            upstreamActual,
            processableCount,
            dependencyGap,
            previousProcessName:
              serialDependencies.length > 0 ? serialDependencies.map((dependency) => dependency.processName).join(" / ") : null,
            previousActual: serialDependencies.length > 0 ? upstreamActual : null,
            status,
          };
        });

        const filteredSteps = allSteps.filter((step) => {
          if (!normalizedKeyword) return true;
          const haystack = `${workflow.workflowName} ${step.processName} ${step.manual} ${step.caution}`.toLowerCase();
          return haystack.includes(normalizedKeyword);
        });

        const totalPlanned = allSteps.reduce((sum, step) => sum + step.planned, 0);
        const totalActual = allSteps.reduce((sum, step) => sum + step.actual, 0);
        const workflowStatus = summarizeWorkflowStatus(allSteps);
        const delayedCount = allSteps.filter((step) => step.status === "delayed").length;
        const attentionCount = allSteps.filter((step) => step.status === "attention").length;
        const blockedCount = allSteps.filter((step) => step.processableCount === 0 && step.dependencyGap > 0).length;

        return {
          ...workflow,
          allSteps,
          steps: filteredSteps,
          totalPlanned,
          totalActual,
          workflowProgress: totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0,
          workflowStatus,
          delayedCount,
          attentionCount,
          blockedCount,
        };
      })
      .filter((workflow) => workflow.steps.length > 0);
  }, [
    workflowViews,
    planStore,
    selectedDate,
    reportedQuantityMap,
    keyword,
    qualificationNameById,
    skillNameById,
    submissionRecordsByStep,
    today,
    nowMinutes,
    deploymentTimeLabels,
    deploymentIntervalMinutes,
    storedDeploymentSnapshots,
    siteById,
  ]);

  const activeTrend = useMemo(() => {
    if (!selectedTrend) return null;

    for (const workflow of rows) {
      const step = workflow.allSteps.find((item) => item.id === selectedTrend.stepId);
      if (step) {
        return {
          workflowName: workflow.workflowName,
          step,
        };
      }
    }

    return null;
  }, [rows, selectedTrend]);

  useEffect(() => {
    if (selectedTrend && !activeTrend) {
      setSelectedTrend(null);
    }
  }, [selectedTrend, activeTrend]);

  const totals = useMemo(() => {
    const shipperCount = new Set(rows.map((workflow) => workflow.shipperId)).size;
    const workflowCount = rows.length;
    const stepCount = rows.reduce((sum, workflow) => sum + workflow.allSteps.length, 0);
    const planned = rows.reduce((sum, workflow) => sum + workflow.totalPlanned, 0);
    const actual = rows.reduce((sum, workflow) => sum + workflow.totalActual, 0);
    const totalPersonHours = rows.reduce(
      (sum, workflow) => sum + workflow.allSteps.reduce((stepSum, step) => stepSum + step.requiredPersonHours, 0),
      0,
    );

    return {
      shipperCount,
      workflowCount,
      stepCount,
      planned,
      actual,
      totalPersonHours,
      progress: planned > 0 ? (actual / planned) * 100 : 0,
    };
  }, [rows]);
  const staffingSummary = useMemo(() => {
    const [yearPart, monthPart, dayPart] = selectedDate.split("-").map(Number);
    if (!yearPart || !monthPart || !dayPart) {
      return {
        scheduledWorkerCount: 0,
        scheduledHours: 0,
        gapHours: 0,
        shortageWorkers: 0,
      };
    }

    const monthlyShifts = readAttendanceMonthShifts(yearPart, monthPart - 1, attendanceWorkers);
    const workerByUserId = new Map(attendanceWorkers.map((worker) => [worker.userId, worker]));

    const scheduledEntries = users
      .map((user) => {
        const worker = workerByUserId.get(user.id);
        if (!worker || worker.status !== "active") return null;
        const shift = monthlyShifts[worker.id]?.[dayPart];
        if (!shift || shift.isOff) return null;
        return {
          workerId: worker.id,
          effectiveHours: calculateEffectiveShiftHours(shift.start, shift.end),
        };
      })
      .filter((entry): entry is { workerId: string; effectiveHours: number } => Boolean(entry));

    const scheduledHours = Number(
      scheduledEntries.reduce((sum, entry) => sum + entry.effectiveHours, 0).toFixed(1),
    );
    const gapHours = Number((scheduledHours - totals.totalPersonHours).toFixed(1));

    return {
      scheduledWorkerCount: scheduledEntries.length,
      scheduledHours,
      gapHours,
      shortageWorkers: gapHours < 0 ? Math.ceil(Math.abs(gapHours) / 8) : 0,
    };
  }, [attendanceWorkers, selectedDate, totals.totalPersonHours, users]);

  const inputClass = `h-10 w-full rounded-xl border px-3 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`;
  const tableInputClass = `${inputClass} h-9 rounded-lg px-2.5 text-[12px]`;
  const compactTableInputClass = `h-10 rounded-lg border px-2.5 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`;
  const cardClass = `${c.bgCard} border ${c.border} rounded-2xl`;
  const trendButtonClass = `mx-auto block rounded-2xl p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
    c.isDark ? "hover:bg-slate-900/70" : "hover:bg-slate-100"
  }`;
  const summaryCards = [
    {
      icon: Building2,
      label: "荷主数",
      value: `${totals.shipperCount} 件`,
      sub: "表示中の対象荷主",
      valueClass: c.textPrimary,
      iconClass: "text-sky-500",
      iconBg: "bg-sky-500/10",
    },
    {
      icon: BarChart3,
      label: "業務数",
      value: `${totals.workflowCount} 件`,
      sub: `工程 ${totals.stepCount} 件`,
      valueClass: c.textPrimary,
      iconClass: "text-cyan-500",
      iconBg: "bg-cyan-500/10",
    },
    {
      icon: Target,
      label: "予定数合計",
      value: `${totals.planned.toLocaleString("ja-JP")} 件`,
      sub: "予定入力済み工程の合計",
      valueClass: c.textPrimary,
      iconClass: "text-amber-500",
      iconBg: "bg-amber-500/10",
    },
    {
      icon: TrendingUp,
      label: "実績数合計",
      value: `${totals.actual.toLocaleString("ja-JP")} 件`,
      sub: `進捗率 ${formatPercent(totals.progress)}`,
      valueClass: c.textPrimary,
      iconClass: "text-emerald-500",
      iconBg: "bg-emerald-500/10",
    },
    {
      icon: Clock3,
      label: "必要人時合計",
      value: formatHourValue(totals.totalPersonHours),
      sub: "進捗管理で算出した必要工数",
      valueClass: c.textPrimary,
      iconClass: "text-violet-500",
      iconBg: "bg-violet-500/10",
    },
    {
      icon: CalendarDays,
      label: "出勤予定人時",
      value: formatHourValue(staffingSummary.scheduledHours),
      sub: `月次シフトベース / ${staffingSummary.scheduledWorkerCount}名`,
      valueClass: "text-cyan-500",
      iconClass: "text-cyan-500",
      iconBg: "bg-cyan-500/10",
    },
    {
      icon: staffingSummary.gapHours < 0 ? AlertTriangle : CheckCircle2,
      label: "過不足",
      value: `${staffingSummary.gapHours > 0 ? "+" : ""}${formatHourValue(staffingSummary.gapHours)}`,
      sub: staffingSummary.gapHours < 0 ? "不足あり" : "不足なし",
      valueClass:
        staffingSummary.gapHours < 0
          ? "text-rose-500"
          : staffingSummary.gapHours > 0
            ? "text-emerald-500"
            : c.textPrimary,
      iconClass: staffingSummary.gapHours < 0 ? "text-rose-500" : "text-emerald-500",
      iconBg: staffingSummary.gapHours < 0 ? "bg-rose-500/10" : "bg-emerald-500/10",
    },
    {
      icon: staffingSummary.shortageWorkers > 0 ? AlertTriangle : CheckCircle2,
      label: "不足人数（8h換算）",
      value: `${staffingSummary.shortageWorkers}名`,
      sub: staffingSummary.shortageWorkers > 0 ? "補充検討の目安" : "充足済み",
      valueClass: staffingSummary.shortageWorkers > 0 ? "text-rose-500" : "text-emerald-500",
      iconClass: staffingSummary.shortageWorkers > 0 ? "text-rose-500" : "text-emerald-500",
      iconBg: staffingSummary.shortageWorkers > 0 ? "bg-rose-500/10" : "bg-emerald-500/10",
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <div className={`${cardClass} shrink-0`}>
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
                  className={`${inputClass} pl-10`}
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
                  placeholder="予定数 / 工程 / マニュアル / 注意事項"
                  className={`${inputClass} pl-10`}
                />
              </div>
            </label>
            <div className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>操作</span>
              <button
                type="button"
                onClick={openAddDialog}
                disabled={!selectedSiteId}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition ${
                  !selectedSiteId
                    ? "cursor-not-allowed bg-slate-300 text-slate-100"
                    : "bg-[#155DFC] hover:bg-[#0F4FE3]"
                }`}
              >
                <Plus className="h-4 w-4" />
                追加
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto px-5 py-5">
          <div className="flex min-w-max gap-3">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className={`w-[188px] shrink-0 rounded-2xl border p-4 ${c.borderCard} ${c.bgPanel}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`text-xs ${c.textSecondary}`}>{card.label}</div>
                      <div className={`mt-1 text-lg font-semibold ${card.valueClass}`}>{card.value}</div>
                      <div className={`mt-1 text-xs ${c.textMuted}`}>{card.sub}</div>
                    </div>
                    <div className={`rounded-xl p-2 ${card.iconBg}`}>
                      <Icon className={`h-5 w-5 ${card.iconClass}`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-4">
          {rows.map((workflow, workflowIndex) => (
            <section key={workflow.id} className={cardClass}>
              <div
                className={`border-b px-5 py-4 ${c.border} ${getWorkflowCardTone(
                  workflow.id || workflow.workflowName,
                  c.isDark,
                )}`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`text-base font-semibold ${c.textPrimary}`}>{workflow.workflowName}</div>
                      {(() => {
                        const status = statusConfig(workflow.workflowStatus);
                        const StatusIcon = status.icon;
                        return (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${status.className}`}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {status.label}
                          </span>
                        );
                      })()}
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${c.bgSurface} ${c.textSecondary}`}>
                        進捗 {formatPercent(workflow.workflowProgress)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 text-xs">
                    <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>
                      予定 {workflow.totalPlanned.toLocaleString("ja-JP")} 件
                    </span>
                    <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>
                      実績 {workflow.totalActual.toLocaleString("ja-JP")} 件
                    </span>
                    <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>
                      進捗 {formatPercent(workflow.workflowProgress)}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 ${
                        c.isDark ? "border-violet-400/25 bg-violet-500/12 text-violet-200" : "border-violet-200 bg-violet-50 text-violet-700"
                      }`}
                    >
                      必要人数 {workflow.allSteps.reduce((sum, step) => sum + step.requiredHeadcountValue, 0).toFixed(1)}人
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1480px] w-full text-center text-sm">
                  <thead className={`${c.bgSurface} ${c.textSecondary}`}>
                    <tr>
                      <th className="px-4 py-3 text-center font-medium">工程</th>
                      <th className="px-4 py-3 text-center font-medium">予定時刻</th>
                      <th className="px-4 py-3 text-center font-medium">予定数</th>
                      <th className="px-4 py-3 text-center font-medium">UPH</th>
                      <th className="px-4 py-3 text-center font-medium">進捗</th>
                      <th className="px-4 py-3 text-center font-medium">必要人数</th>
                      <th className="px-4 py-3 text-center font-medium">配置人数</th>
                      <th className="px-4 py-3 text-center font-medium">見込み終了時刻</th>
                      <th className="px-4 py-3 text-center font-medium">進捗推移</th>
                      <th className="px-4 py-3 text-center font-medium">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflow.steps.map((step) => {
                      const areaLabels = step.areaRows.map((detail) => ({
                        id: detail.id,
                        name: detail.name,
                        className:
                          detail.tone === "configured"
                            ? c.isDark
                              ? "bg-sky-500/12 text-sky-200"
                              : "bg-sky-50 text-sky-700"
                            : detail.tone === "missing"
                              ? c.isDark
                                ? "bg-rose-500/12 text-rose-200"
                                : "bg-rose-50 text-rose-700"
                              : c.isDark
                                ? "bg-amber-500/12 text-amber-200"
                                : "bg-amber-50 text-amber-700",
                      }));

                      return (
                        <Fragment key={step.id}>
                          <tr className={`border-t ${c.borderCard}`}>
                            <td className="px-4 py-4 align-middle">
                              <div className="min-w-0 text-left">
                                <div className={`font-medium ${c.textPrimary}`}>{step.processName}</div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                      c.isDark ? "bg-violet-500/12 text-violet-200" : "bg-violet-50 text-violet-700"
                                    }`}
                                  >
                                    {workflow.shipperName}
                                  </span>
                                  {areaLabels.map((area) => (
                                    <span key={area.id} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${area.className}`}>
                                      {area.name}
                                    </span>
                                  ))}
                                </div>
                                {(step.manual || step.caution) && (
                                  <div className={`mt-2 space-y-1 text-xs ${c.textSecondary}`}>
                                    {step.manual && <div>マニュアル: {step.manual}</div>}
                                    {step.caution && <div>注意事項: {step.caution}</div>}
                                  </div>
                                )}
                              </div>
                            </td>
                        <td className="px-4 py-4 align-middle">
                          <div className="mx-auto flex max-w-[256px] items-center justify-center gap-2">
                            <input
                              type="time"
                              value={step.startTime}
                              readOnly
                              tabIndex={-1}
                              className={`${compactTableInputClass} w-[104px] flex-none cursor-default text-center ${c.isDark ? "bg-slate-950/70" : "bg-slate-50"}`}
                            />
                            <span className={`shrink-0 text-xs font-semibold ${c.textMuted}`}>~</span>
                            <input
                              type="time"
                              value={step.targetEndTime}
                              readOnly
                              tabIndex={-1}
                              className={`${compactTableInputClass} w-[104px] flex-none cursor-default text-center ${c.isDark ? "bg-slate-950/70" : "bg-slate-50"}`}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <input
                            type="number"
                            min={0}
                            value={step.planned}
                            onChange={(event) => {
                              const nextPlanned = Math.max(0, Number(event.target.value) || 0);
                              const nextAreaRows = step.areaRows;
                              setPlanStore((prev) => {
                                let nextStore = updateStepPlanEntry(
                                  prev,
                                  selectedDate,
                                  step.id,
                                  { planned: nextPlanned },
                                  {
                                    planned: step.planned,
                                    startTime: step.startTime,
                                    targetEndTime: step.targetEndTime,
                                  },
                                );

                                nextAreaRows.forEach((detail, areaIndex, details) => {
                                  nextStore = updateStepPlanEntry(
                                    nextStore,
                                    selectedDate,
                                    detail.planKey,
                                    { planned: splitPlannedQuantity(nextPlanned, details.length, areaIndex) },
                                    {
                                      planned: detail.planned,
                                      startTime: detail.startTime,
                                      targetEndTime: detail.targetEndTime,
                                    },
                                  );
                                });

                                return nextStore;
                              });
                            }}
                            className={`${compactTableInputClass} mx-auto w-[104px] text-center`}
                          />
                          {step.processableCount !== null && (
                            <div
                              className={`mt-2 text-xs ${
                                step.processableCount === 0 && step.dependencyGap > 0 ? "text-amber-500" : c.textMuted
                              }`}
                            >
                              処理可能数 {step.processableCount.toLocaleString("ja-JP")} 件
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className={`font-medium ${c.textPrimary}`}>{step.uph.toLocaleString("ja-JP")}</div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className="mx-auto min-w-[178px] text-left">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`font-semibold ${c.textPrimary}`}>
                                {step.actual.toLocaleString("ja-JP")} / {step.planned.toLocaleString("ja-JP")}
                              </span>
                              <span className={`text-xs font-semibold ${c.textSecondary}`}>{formatPercent(step.progress)}</span>
                            </div>
                            <div className={`mt-2 h-2 overflow-hidden rounded-full border ${c.borderCard} ${c.bgSurface}`}>
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${progressBarTone(step.progress, step.status)} transition-all`}
                                style={{ width: progressDisplayWidth(step.progress, step.planned) }}
                              />
                            </div>
                            <div className="mt-2 text-xs">
                              <span className={c.textMuted}>見込み </span>
                              <span className="font-semibold text-violet-500">{step.eta}</span>
                              {formatEtaOffset(step.etaMinutes, step.referenceMinutes, step.eta) ? (
                                <span className="ml-1 font-medium text-rose-500">
                                  {formatEtaOffset(step.etaMinutes, step.referenceMinutes, step.eta)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className={`${c.textPrimary}`}>{formatHeadcountValue(step.requiredHeadcountValue)}</div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <button
                            type="button"
                            onClick={() => {
                              const params = new URLSearchParams({
                                date: selectedDate,
                                time: step.startTime,
                                workflowId: step.workflowId,
                                processId: step.processId,
                                shipperId: step.shipperId,
                              });
                              const primaryArea = step.areaRows.find((detail) => detail.tone === "configured");
                              if (primaryArea) params.set("areaId", primaryArea.id);
                              navigate(`/live-command?${params.toString()}`);
                            }}
                            className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold transition ${c.borderCard} ${c.textPrimary} ${c.bgSurface} ${c.isDark ? "hover:bg-slate-900" : "hover:bg-slate-100"}`}
                          >
                            {step.assignedCount}人
                          </button>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className="min-w-[124px] text-center">
                            <div className={`font-semibold ${step.eta === "-" ? c.textMuted : "text-violet-500"}`}>{step.eta}</div>
                            {formatEtaOffset(step.etaMinutes, step.referenceMinutes, step.eta) ? (
                              <div className="mt-1 text-[11px] font-medium text-rose-500">
                                {formatEtaOffset(step.etaMinutes, step.referenceMinutes, step.eta)}
                              </div>
                            ) : (
                              <div className={`mt-1 text-[11px] ${c.textMuted}`}>完了見込み</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <button
                            type="button"
                            onClick={() => setSelectedTrend({ stepId: step.id })}
                            className={trendButtonClass}
                            aria-label={`${step.processName} の進捗推移を詳しく見る`}
                          >
                            <TrendSparkline points={step.trend} colors={c} />
                          </button>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          {(() => {
                            const status = statusConfig(step.status);
                            const StatusIcon = status.icon;
                            return (
                              <div className="flex flex-col items-center gap-1">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium ${status.className}`}>
                                  <StatusIcon className="h-3 w-3" />
                                  {status.label}
                                </span>
                                {step.processableCount === 0 && step.dependencyGap > 0 && (
                                  <span className="text-[10px] text-amber-500">前工程待ち</span>
                                )}
                                {step.requiredHeadcount > step.headcount && (
                                  <span className={`text-[10px] ${c.textMuted}`}>推奨 {step.requiredHeadcount}人</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          {rows.length === 0 && (
            <div className={`${cardClass} p-10 text-center`}>
              <div className={`text-base font-medium ${c.textPrimary}`}>表示できる進捗データがありません</div>
              <div className={`mt-2 text-sm ${c.textSecondary}`}>
                対象日、拠点、検索条件を見直してください。
              </div>
            </div>
          )}
        </div>
      </div>
      {isAddDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={closeAddDialog}>
          <div
            className={`${c.bgCard} ${c.border} w-full max-w-6xl overflow-hidden rounded-[28px] border shadow-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="max-h-[calc(100vh-4rem)] overflow-y-auto">
              <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${c.border}`}>
                <div>
                  <div className={`text-[20px] font-semibold ${c.textPrimary}`}>進捗対象を追加</div>
                  <div className={`mt-1 text-[13px] ${c.textSecondary}`}>
                    業務フローテンプレートを選んで、進捗対象として追加できます。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeAddDialog}
                  className={`${c.bgSurface} ${c.borderCard} rounded-2xl border p-2 ${c.textSecondary} transition ${
                    c.isDark ? "hover:bg-slate-900" : "hover:bg-slate-100"
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60`}
                  aria-label="閉じる"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-5 px-6 py-6">
                <div className="grid gap-1">
                  <span className={`text-xs font-medium ${c.textSecondary}`}>業務フローテンプレート</span>
                  <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border p-3`}>
                    {availableWorkflowTemplates.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {availableWorkflowTemplates.map((workflow) => {
                          const selected = workflow.id === addWorkflowTemplateId;
                          return (
                            <button
                              key={workflow.id}
                              type="button"
                              onClick={() => setAddWorkflowTemplateId(workflow.id)}
                              className={`rounded-2xl border px-4 py-3 text-left transition ${
                                selected
                                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-700"
                                  : `${c.borderCard} ${c.bgCard} ${c.textSecondary}`
                              }`}
                            >
                              <div className="text-[13px] font-semibold">{workflow.name}</div>
                              <div className="mt-1 text-[11px] opacity-80">構成業務 {workflow.steps.length} 件</div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={`text-sm ${c.textMuted}`}>利用できる業務フローテンプレートがありません。</div>
                    )}
                  </div>
                </div>
                {selectedAddTemplate && (
                  <div className="grid gap-4 md:grid-cols-5">
                    <label className="grid gap-1">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>エリア</span>
                      <select
                        value={addBulkAreaId}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setAddBulkAreaId(nextValue);
                          setAddStepDrafts((prev) => prev.map((draft) => ({ ...draft, areaId: nextValue })));
                        }}
                        className={inputClass}
                      >
                        <option value="">エリア未設定</option>
                        {selectedSiteLayoutAreas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                      <span className={`text-[11px] ${c.textMuted}`}>下表の全業務へ一括反映</span>
                    </label>
                    <label className="grid gap-1">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>開始予定時刻</span>
                      <input
                        type="time"
                        value={addBulkStartTime}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setAddBulkStartTime(nextValue);
                          setAddStepDrafts((prev) => prev.map((draft) => ({ ...draft, startTime: nextValue })));
                        }}
                        className={inputClass}
                      />
                      <span className={`text-[11px] ${c.textMuted}`}>下表の全業務へ一括反映</span>
                    </label>
                    <label className="grid gap-1">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>終了予定時刻</span>
                      <input
                        type="time"
                        value={addBulkTargetEndTime}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setAddBulkTargetEndTime(nextValue);
                          setAddStepDrafts((prev) => prev.map((draft) => ({ ...draft, targetEndTime: nextValue })));
                        }}
                        className={inputClass}
                      />
                      <span className={`text-[11px] ${c.textMuted}`}>下表の全業務へ一括反映</span>
                    </label>
                    <label className="grid gap-1">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>予定数</span>
                      <input
                        type="number"
                        min={0}
                        value={addBulkPlanned}
                        onChange={(event) => {
                          const nextValue = Math.max(0, Number(event.target.value) || 0);
                          setAddBulkPlanned(nextValue);
                          setAddStepDrafts((prev) => prev.map((draft) => ({ ...draft, planned: nextValue })));
                        }}
                        className={inputClass}
                      />
                      <span className={`text-[11px] ${c.textMuted}`}>下表の全業務へ一括反映</span>
                    </label>
                    <label className="grid gap-1">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>UPH</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={addBulkUph}
                        onChange={(event) => {
                          const nextValue = Math.max(1, Number(event.target.value) || 1);
                          setAddBulkUph(nextValue);
                          setAddStepDrafts((prev) => prev.map((draft) => ({ ...draft, uph: nextValue })));
                        }}
                        className={inputClass}
                      />
                      <span className={`text-[11px] ${c.textMuted}`}>下表の全業務へ一括反映</span>
                    </label>
                  </div>
                )}
                {addStepDrafts.length > 0 && (
                  <div className="grid gap-2">
                    <div className={`text-xs font-medium ${c.textSecondary}`}>業務別調整</div>
                    <div className={`${c.bgSurface} ${c.borderCard} overflow-hidden rounded-2xl border`}>
                      <div className="overflow-hidden">
                        <table className="w-full table-fixed text-[13px]">
                          <colgroup>
                            <col className="w-[16%]" />
                            <col className="w-[11%]" />
                            <col className="w-[11%]" />
                            <col className="w-[10%]" />
                            <col className="w-[10%]" />
                            <col className="w-[14%]" />
                            <col className="w-[10%]" />
                            <col className="w-[10%]" />
                            <col className="w-[8%]" />
                          </colgroup>
                          <thead className={c.tableHeader}>
                            <tr>
                              <th className="px-2.5 py-2.5 text-left text-[12px] font-semibold">業務名</th>
                              <th className="px-2.5 py-2.5 text-left text-[12px] font-semibold">開始予定時刻</th>
                              <th className="px-2.5 py-2.5 text-left text-[12px] font-semibold">終了予定時刻</th>
                              <th className="px-2.5 py-2.5 text-left text-[12px] font-semibold">予定数</th>
                              <th className="px-2.5 py-2.5 text-left text-[12px] font-semibold">UPH</th>
                              <th className="px-2.5 py-2.5 text-left text-[12px] font-semibold">荷主</th>
                              <th className="px-2.5 py-2.5 text-left text-[12px] font-semibold">エリア</th>
                              <th className="px-2.5 py-2.5 text-left text-[12px] font-semibold">前業務</th>
                              <th className="px-2.5 py-2.5 text-center text-[12px] font-semibold">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {addStepDrafts.map((draft, index) => (
                              <tr key={draft.sourceStepId} className={`border-t ${c.borderCard}`}>
                                <td className="px-2.5 py-2.5">
                                  <div
                                    title={draft.processName}
                                    className={`overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium leading-5 ${c.textPrimary}`}
                                  >
                                    {draft.processName}
                                  </div>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <input
                                    type="time"
                                    value={draft.startTime}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setAddStepDrafts((prev) =>
                                        prev.map((item) =>
                                          item.sourceStepId === draft.sourceStepId ? { ...item, startTime: nextValue } : item,
                                        ),
                                      );
                                    }}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  />
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <input
                                    type="time"
                                    value={draft.targetEndTime}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setAddStepDrafts((prev) =>
                                        prev.map((item) =>
                                          item.sourceStepId === draft.sourceStepId ? { ...item, targetEndTime: nextValue } : item,
                                        ),
                                      );
                                    }}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  />
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <input
                                    type="number"
                                    min={0}
                                    value={draft.planned}
                                    onChange={(event) => {
                                      const nextValue = Math.max(0, Number(event.target.value) || 0);
                                      setAddStepDrafts((prev) =>
                                        prev.map((item) =>
                                          item.sourceStepId === draft.sourceStepId ? { ...item, planned: nextValue } : item,
                                        ),
                                      );
                                    }}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  />
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={draft.uph}
                                    onChange={(event) => {
                                      const nextValue = Math.max(1, Number(event.target.value) || 1);
                                      setAddStepDrafts((prev) =>
                                        prev.map((item) =>
                                          item.sourceStepId === draft.sourceStepId ? { ...item, uph: nextValue } : item,
                                        ),
                                      );
                                    }}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  />
                                  <div className={`mt-1 text-[10px] ${c.textMuted}`}>
                                    推奨 {calculateRequiredHeadcount(draft.planned, draft.uph, draft.startTime, draft.targetEndTime, 1)}人
                                  </div>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <select
                                    value={addShipperId}
                                    onChange={(event) => setAddShipperId(event.target.value)}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  >
                                    <option value="">荷主を選択</option>
                                    {availableShippers.map((shipper) => (
                                      <option key={shipper.id} value={shipper.id}>
                                        {shipper.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <select
                                    value={draft.areaId}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setAddStepDrafts((prev) =>
                                        prev.map((item) =>
                                          item.sourceStepId === draft.sourceStepId ? { ...item, areaId: nextValue } : item,
                                        ),
                                      );
                                    }}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  >
                                    <option value="">エリア未設定</option>
                                    {selectedSiteLayoutAreas.map((area) => (
                                      <option key={area.id} value={area.id}>
                                        {area.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <select
                                    value={draft.previousStepId}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setAddStepDrafts((prev) =>
                                        prev.map((item) =>
                                          item.sourceStepId === draft.sourceStepId ? { ...item, previousStepId: nextValue } : item,
                                        ),
                                      );
                                    }}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  >
                                    <option value="">なし</option>
                                    {addStepDrafts
                                      .filter((item) => item.sourceStepId !== draft.sourceStepId)
                                      .map((item, optionIndex) => (
                                        <option key={item.sourceStepId} value={item.sourceStepId}>
                                          {optionIndex + 1}. {item.processName}
                                        </option>
                                      ))}
                                  </select>
                                </td>
                                <td className="px-2.5 py-2.5 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAddStepDrafts((prev) => {
                                          if (index === 0) return prev;
                                          const next = [...prev];
                                          [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                          return next;
                                        })
                                      }
                                      disabled={index === 0}
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                                        index === 0
                                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                                          : c.isDark
                                            ? "border-[#155DFC]/25 text-[#A9C5FF] hover:border-[#155DFC]/50 hover:bg-[#155DFC]/10"
                                            : "border-[#B7CDFF] text-[#155DFC] hover:border-[#155DFC] hover:bg-[#EEF4FF]"
                                      }`}
                                      aria-label={`${draft.processName} を上へ移動`}
                                    >
                                      <ChevronDown className="h-4 w-4 rotate-180" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAddStepDrafts((prev) => {
                                          if (index === prev.length - 1) return prev;
                                          const next = [...prev];
                                          [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                          return next;
                                        })
                                      }
                                      disabled={index === addStepDrafts.length - 1}
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                                        index === addStepDrafts.length - 1
                                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                                          : c.isDark
                                            ? "border-[#155DFC]/25 text-[#A9C5FF] hover:border-[#155DFC]/50 hover:bg-[#155DFC]/10"
                                            : "border-[#B7CDFF] text-[#155DFC] hover:border-[#155DFC] hover:bg-[#EEF4FF]"
                                      }`}
                                      aria-label={`${draft.processName} を下へ移動`}
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAddStepDrafts((prev) =>
                                          prev
                                            .filter((item) => item.sourceStepId !== draft.sourceStepId)
                                            .map((item) =>
                                              item.previousStepId === draft.sourceStepId
                                                ? { ...item, previousStepId: "" }
                                                : item,
                                            ),
                                        )
                                      }
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                                        c.isDark
                                          ? "border-rose-500/20 text-rose-300 hover:border-rose-400/40 hover:bg-rose-500/10"
                                          : "border-rose-200 text-rose-500 hover:border-rose-300 hover:bg-rose-50"
                                      }`}
                                      aria-label={`${draft.processName} を削除`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {isAddRowOpen && (
                            <tfoot className={`${c.bgCard}`}>
                              <tr className={`border-t ${c.borderCard}`}>
                                <td className="px-2.5 py-2.5">
                                  <select
                                    value={addRowDraft.processId}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setAddRowDraft((prev) => ({
                                        ...prev,
                                        processId: nextValue,
                                        processName: processNameById.get(nextValue) ?? "",
                                        uph: Math.max(1, processById.get(nextValue)?.defaultUph || prev.uph || 1),
                                      }));
                                    }}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  >
                                    <option value="">業務を選択</option>
                                    {availableProcessOptions.map((process) => (
                                      <option key={process.id} value={process.id}>
                                        {process.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <input
                                    type="time"
                                    value={addRowDraft.startTime}
                                    onChange={(event) =>
                                      setAddRowDraft((prev) => ({ ...prev, startTime: event.target.value }))
                                    }
                                    className={`${tableInputClass} w-full min-w-0`}
                                  />
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <input
                                    type="time"
                                    value={addRowDraft.targetEndTime}
                                    onChange={(event) =>
                                      setAddRowDraft((prev) => ({ ...prev, targetEndTime: event.target.value }))
                                    }
                                    className={`${tableInputClass} w-full min-w-0`}
                                  />
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <input
                                    type="number"
                                    min={0}
                                    value={addRowDraft.planned}
                                    onChange={(event) =>
                                      setAddRowDraft((prev) => ({
                                        ...prev,
                                        planned: Math.max(0, Number(event.target.value) || 0),
                                      }))
                                    }
                                    className={`${tableInputClass} w-full min-w-0`}
                                  />
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={addRowDraft.uph}
                                    onChange={(event) =>
                                      setAddRowDraft((prev) => ({
                                        ...prev,
                                        uph: Math.max(1, Number(event.target.value) || 1),
                                      }))
                                    }
                                    className={`${tableInputClass} w-full min-w-0`}
                                  />
                                  <div className={`mt-1 text-[10px] ${c.textMuted}`}>
                                    推奨 {calculateRequiredHeadcount(addRowDraft.planned, addRowDraft.uph, addRowDraft.startTime, addRowDraft.targetEndTime, 1)}人
                                  </div>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <select
                                    value={addShipperId}
                                    onChange={(event) => setAddShipperId(event.target.value)}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  >
                                    <option value="">荷主を選択</option>
                                    {availableShippers.map((shipper) => (
                                      <option key={shipper.id} value={shipper.id}>
                                        {shipper.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <select
                                    value={addRowDraft.areaId}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setAddRowDraft((prev) => ({ ...prev, areaId: nextValue }));
                                    }}
                                    className={`${tableInputClass} w-full min-w-0`}
                                  >
                                    <option value="">エリア未設定</option>
                                    {selectedSiteLayoutAreas.map((area) => (
                                      <option key={area.id} value={area.id}>
                                        {area.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2.5 py-2.5">
                                  <select
                                    value={addRowDraft.previousStepId}
                                    onChange={(event) =>
                                      setAddRowDraft((prev) => ({ ...prev, previousStepId: event.target.value }))
                                    }
                                    className={`${tableInputClass} w-full min-w-0`}
                                  >
                                    <option value="">なし</option>
                                    {addStepDrafts.map((item, optionIndex) => (
                                      <option key={item.sourceStepId} value={item.sourceStepId}>
                                        {optionIndex + 1}. {item.processName}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2.5 py-2.5" />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      <div className={`border-t p-3 ${c.borderCard}`}>
                        {isAddRowOpen && (
                          <div className="mb-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setIsAddRowOpen(false)}
                              className={`text-xs font-medium ${c.textSecondary} transition hover:text-cyan-500`}
                            >
                              入力行を閉じる
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!isAddRowOpen) {
                              setIsAddRowOpen(true);
                              return;
                            }
                            appendAddRowDraft();
                          }}
                          disabled={isAddRowOpen ? !addRowDraft.processId : false}
                          className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                            !isAddRowOpen || addRowDraft.processId
                              ? c.isDark
                                ? "border-[#155DFC]/30 bg-[#155DFC]/10 text-[#A9C5FF] hover:border-[#155DFC]/60 hover:bg-[#155DFC]/20"
                                : "border-[#B7CDFF] bg-[#EEF4FF] text-[#155DFC] hover:border-[#155DFC] hover:bg-[#DCE9FF]"
                              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                          }`}
                        >
                          <Plus className="h-4 w-4" />
                          {isAddRowOpen ? "この内容で追加" : "追加"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className={`flex items-center justify-end gap-3 border-t px-6 py-4 ${c.border}`}>
                <button
                  type="button"
                  onClick={closeAddDialog}
                  className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-2 text-[13px] font-semibold ${c.textSecondary}`}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={submitAddDialog}
                  disabled={!canSubmitAddDialog}
                  className={`rounded-2xl px-4 py-2 text-[13px] font-semibold text-white transition ${
                    canSubmitAddDialog ? "bg-[#155DFC] hover:bg-[#0F4FE3]" : "cursor-not-allowed bg-slate-300 text-slate-100"
                  }`}
                >
                  追加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedTrend && activeTrend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setSelectedTrend(null)}>
          <div
            className={`${c.bgCard} ${c.border} w-full max-w-5xl overflow-hidden rounded-[28px] border shadow-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="max-h-[calc(100vh-4rem)] overflow-y-auto">
              <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${c.border}`}>
                <div>
                  <div className={`text-[20px] font-semibold ${c.textPrimary}`}>{activeTrend.step.processName}</div>
                  <div className={`mt-1 text-[13px] ${c.textSecondary}`}>
                    {activeTrend.workflowName} / 開始 {activeTrend.step.startTime} / 目標 {activeTrend.step.targetEndTime}
                  </div>
                  <div className={`mt-2 text-[11px] ${c.textMuted}`}>{selectedDate} の進捗推移詳細</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTrend(null)}
                  className={`${c.bgSurface} ${c.borderCard} rounded-2xl border p-2 ${c.textSecondary} transition ${
                    c.isDark ? "hover:bg-slate-900" : "hover:bg-slate-100"
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60`}
                  aria-label="閉じる"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-5 px-6 py-6">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                    <div className={`text-[11px] ${c.textMuted}`}>予定数</div>
                    <div className="mt-1 text-[20px] font-semibold text-violet-500 tabular-nums">
                      {activeTrend.step.planned.toLocaleString("ja-JP")} 件
                    </div>
                  </div>
                  <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                    <div className={`text-[11px] ${c.textMuted}`}>実績数</div>
                    <div className="mt-1 text-[20px] font-semibold text-cyan-500 tabular-nums">
                      {activeTrend.step.actual.toLocaleString("ja-JP")} 件
                    </div>
                  </div>
                  <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                    <div className={`text-[11px] ${c.textMuted}`}>残数</div>
                    <div
                      className={`mt-1 text-[20px] font-semibold tabular-nums ${
                        activeTrend.step.planned - activeTrend.step.actual > 0 ? "text-amber-500" : "text-emerald-500"
                      }`}
                    >
                      {(activeTrend.step.planned - activeTrend.step.actual).toLocaleString("ja-JP")} 件
                    </div>
                  </div>
                  <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                    <div className={`text-[11px] ${c.textMuted}`}>状態</div>
                    <div className={`mt-1 text-[20px] font-semibold ${c.textPrimary}`}>{statusConfig(activeTrend.step.status).label}</div>
                  </div>
                </div>
                <TrendDetailChart points={activeTrend.step.trend} colors={c} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
