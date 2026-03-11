import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  Box,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Filter,
  Layers,
  Package,
  Save,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import { processColorClasses } from "./processStore";
import { buildFieldDeploymentStorageKey, buildSiteScope, readFieldDeploymentSnapshots, writeFieldDeploymentSnapshots } from "./fieldDeploymentStore";
import { buildStepPlanDefaults, readProgressPlanStore, resolveStepPlanValues } from "./progressPlanStore";
import { buildReportedQuantityMap, buildWorkerSubmissionRecords, pushAssignmentChangeNotifications } from "./workerMobileStore";
import { resolveWorkerShiftForDate } from "./attendanceStore";
import type {
  AreaMaster,
  ProcessMaster,
  QualificationMaster,
  Shipper,
  SkillMaster,
  WorkflowDefinition,
} from "./masterStore";

const TIMELINE_START = 0;
const TIMELINE_END = 24 * 60;
const COLORS = ["cyan", "emerald", "violet", "amber", "blue", "rose", "orange", "teal", "indigo"] as const;
const INTERVAL_OPTIONS = [15, 30, 60] as const;
const PRODUCTION_EFFICIENCY = 0.82;
const ADJUSTMENT_STORAGE_PREFIX = "fluxview-field-deployment-adjustments-v1";

type TimelineInterval = (typeof INTERVAL_OPTIONS)[number];
type WorkerStatus = "active" | "break" | "absent";
type AssignmentSnapshot = Record<string, Array<string | null>>;
type SnapshotsByTime = Record<string, AssignmentSnapshot>;
type ThemeColors = ReturnType<typeof useThemeColors>;

interface Worker {
  id: string;
  name: string;
  initials: string;
  color: string;
  qualificationIds: string[];
  skillIds: string[];
  status: WorkerStatus;
  note?: string;
}

interface StepTemplate {
  id: string;
  workflowId: string;
  workflowName: string;
  shipperId: string;
  shipperName: string;
  areaId: string;
  areaName: string;
  processId: string;
  processName: string;
  description: string;
  color: string;
  icon: LucideIcon;
  headcount: number;
  planned: number;
  uph: number;
  startTime: string;
  targetEndTime: string;
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
}

interface StepView extends StepTemplate {
  slots: Array<string | null>;
  assignedCount: number;
}

interface PanelView {
  id: string;
  shipperId: string;
  shipperName: string;
  areaId: string;
  areaName: string;
  workflowName: string;
  color: string;
  steps: StepTemplate[];
}

interface DragState {
  workerId: string;
  fromStepId: string | null;
  fromSlotIndex: number | null;
}

interface AdjustmentItem {
  id: string;
  panelId: string;
  areaName: string;
  processName: string;
  shortage: number;
  recommended: number;
  progress: number;
  eta: string;
  overdue: boolean;
}

interface AssignmentChangeItem {
  id: string;
  panelId: string | "all";
  workerId: string;
  workerName: string;
  effectiveTime: string;
  previousAssignment: string;
  nextAssignment: string;
}

const MOCK_WORKERS: Worker[] = [
  { id: "worker-1", name: "小林 さくら", initials: "小", color: "bg-pink-500", qualificationIds: ["qual-10"], skillIds: ["skill-5", "skill-4"], status: "active", note: "新人" },
  { id: "worker-2", name: "山田 裕子", initials: "山", color: "bg-teal-500", qualificationIds: ["qual-1"], skillIds: ["skill-3", "skill-4"], status: "active", note: "フォーク担当" },
  { id: "worker-3", name: "松本 翔", initials: "松", color: "bg-violet-500", qualificationIds: ["qual-1"], skillIds: ["skill-3", "skill-7"], status: "active", note: "保管担当" },
  { id: "worker-4", name: "田中 美咲", initials: "田", color: "bg-cyan-500", qualificationIds: ["qual-4"], skillIds: ["skill-6", "skill-5"], status: "active", note: "梱包担当" },
  { id: "worker-5", name: "伊藤 恒一", initials: "伊", color: "bg-orange-500", qualificationIds: ["qual-8"], skillIds: ["skill-3", "skill-7"], status: "active", note: "出荷担当" },
  { id: "worker-6", name: "渡辺 彩", initials: "渡", color: "bg-emerald-500", qualificationIds: ["qual-7"], skillIds: ["skill-7", "skill-5"], status: "active", note: "仕分け担当" },
  { id: "worker-7", name: "鈴木 大輔", initials: "鈴", color: "bg-blue-500", qualificationIds: ["qual-2"], skillIds: ["skill-1", "skill-2"], status: "active", note: "ピッキング担当" },
  { id: "worker-8", name: "高橋 七海", initials: "高", color: "bg-rose-500", qualificationIds: ["qual-3"], skillIds: ["skill-7", "skill-8"], status: "active", note: "棚卸担当" },
  { id: "worker-9", name: "中島 亮", initials: "中", color: "bg-indigo-500", qualificationIds: ["qual-5"], skillIds: ["skill-5", "skill-6"], status: "active", note: "出荷検品担当" },
  { id: "worker-10", name: "井上 葵", initials: "井", color: "bg-fuchsia-500", qualificationIds: ["qual-6"], skillIds: ["skill-9", "skill-10"], status: "active", note: "特殊作業" },
  { id: "worker-11", name: "加藤 翼", initials: "加", color: "bg-lime-500", qualificationIds: ["qual-1"], skillIds: ["skill-3", "skill-1"], status: "active", note: "応援要員" },
  { id: "worker-12", name: "吉田 真央", initials: "吉", color: "bg-sky-500", qualificationIds: ["qual-10"], skillIds: ["skill-4", "skill-5"], status: "active", note: "検品主担当" },
  { id: "worker-13", name: "岡田 玲奈", initials: "岡", color: "bg-amber-500", qualificationIds: ["qual-2"], skillIds: ["skill-1", "skill-6"], status: "active", note: "多能工" },
  { id: "worker-14", name: "森 健太", initials: "森", color: "bg-purple-500", qualificationIds: ["qual-7"], skillIds: ["skill-7", "skill-8"], status: "active", note: "ライン応援" },
  { id: "worker-15", name: "斎藤 未来", initials: "斎", color: "bg-slate-400", qualificationIds: ["qual-4"], skillIds: ["skill-6"], status: "break", note: "休憩中" },
  { id: "worker-16", name: "中村 敏", initials: "中", color: "bg-gray-400", qualificationIds: ["qual-1"], skillIds: ["skill-3"], status: "absent", note: "離席" },
];

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatTime(totalMinutes: number) {
  const normalized = Math.max(0, totalMinutes);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatPreciseTime(totalMinutes: number) {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function floorTimeToSlot(totalMinutes: number, interval: TimelineInterval) {
  const clamped = clamp(totalMinutes, TIMELINE_START, TIMELINE_END);
  const offset = clamped - TIMELINE_START;
  return TIMELINE_START + Math.floor(offset / interval) * interval;
}

function createTimeSlots(interval: TimelineInterval) {
  const slots: string[] = [];
  for (let minute = TIMELINE_START; minute <= TIMELINE_END; minute += interval) {
    slots.push(formatTime(minute));
  }
  return slots;
}

function buildAdjustmentStorageKey(siteId: string, dateKey?: string) {
  const scopeKey = siteId || "default";
  return dateKey
    ? `${ADJUSTMENT_STORAGE_PREFIX}:${scopeKey}:${dateKey}`
    : `${ADJUSTMENT_STORAGE_PREFIX}:${scopeKey}`;
}

function readAdjustmentStorage(siteId: string, dateKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const datedRaw = window.localStorage.getItem(buildAdjustmentStorageKey(siteId, dateKey));
    if (datedRaw) return JSON.parse(datedRaw) as { savedAt?: string; items?: AssignmentChangeItem[] };

    if (dateKey === toDateInput(new Date())) {
      const legacyRaw = window.localStorage.getItem(buildAdjustmentStorageKey(siteId));
      return legacyRaw ? JSON.parse(legacyRaw) as { savedAt?: string; items?: AssignmentChangeItem[] } : null;
    }
  } catch {
    return null;
  }

  return null;
}

function writeAdjustmentStorage(siteId: string, dateKey: string, payload: { savedAt?: string; items?: AssignmentChangeItem[] }) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(payload);
  window.localStorage.setItem(buildAdjustmentStorageKey(siteId, dateKey), serialized);
  if (dateKey === toDateInput(new Date())) {
    window.localStorage.setItem(buildAdjustmentStorageKey(siteId), serialized);
  }
}

function pickColor(index: number) {
  return COLORS[index % COLORS.length];
}

function iconForProcess(processId: string, processName: string): LucideIcon {
  switch (processId) {
    case "proc-1":
      return Warehouse;
    case "proc-2":
    case "proc-8":
      return ClipboardCheck;
    case "proc-3":
    case "proc-4":
      return Box;
    case "proc-7":
      return Package;
    case "proc-9":
      return Truck;
    default:
      return processName.includes("検") ? ClipboardCheck : Layers;
  }
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildPanels(
  workflows: WorkflowDefinition[],
  shippers: Shipper[],
  areas: AreaMaster[],
  processes: ProcessMaster[],
  dayPlans: Record<string, unknown>,
): PanelView[] {
  const shipperMap = new Map(shippers.map((item) => [item.id, item]));
  const areaMap = new Map(areas.map((item) => [item.id, item]));
  const processMap = new Map(processes.map((item) => [item.id, item]));

  return workflows
    .slice()
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .map((workflow, workflowIndex) => ({
      id: workflow.id,
      shipperId: workflow.shipperId,
      shipperName: shipperMap.get(workflow.shipperId)?.name ?? "未設定荷主",
      areaId: workflow.areaId,
      areaName: areaMap.get(workflow.areaId)?.name ?? workflow.name,
      workflowName: workflow.name,
      color: pickColor(workflowIndex),
      steps: workflow.steps.map((step, stepIndex) => {
        const process = processMap.get(step.processId);
        const headcount = Math.max(step.standardHeadcount || process?.defaultHeadcount || 1, 1);
        const uph = step.uph || process?.defaultUph || 100;
        const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, headcount, uph);
        const planValues = resolveStepPlanValues(dayPlans as Record<string, never>, `${workflow.id}:${step.id}`, defaults);

        return {
          id: `${workflow.id}:${step.id}`,
          workflowId: workflow.id,
          workflowName: workflow.name,
          shipperId: workflow.shipperId,
          shipperName: shipperMap.get(workflow.shipperId)?.name ?? "未設定荷主",
          areaId: workflow.areaId,
          areaName: areaMap.get(workflow.areaId)?.name ?? workflow.name,
          processId: step.processId,
          processName: process?.name ?? `工程${stepIndex + 1}`,
          description: process?.description ?? "標準工程",
          color: pickColor(workflowIndex + stepIndex),
          icon: iconForProcess(step.processId, process?.name ?? ""),
          headcount,
          planned: planValues.planned,
          uph,
          startTime: planValues.startTime,
          targetEndTime: planValues.targetEndTime,
          requiredQualificationIds: step.requiredQualificationIds,
          requiredSkillIds: step.requiredSkillIds,
        };
      }),
    }));
}

function scoreWorker(worker: Worker, step: StepTemplate) {
  const qualificationScore = step.requiredQualificationIds.filter((id) => worker.qualificationIds.includes(id)).length * 3;
  const skillScore = step.requiredSkillIds.filter((id) => worker.skillIds.includes(id)).length * 2;
  return qualificationScore + skillScore;
}

function cloneSnapshot(snapshot: AssignmentSnapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([stepId, slots]) => [stepId, [...slots]]));
}

function countAssigned(snapshot: AssignmentSnapshot | undefined, stepId: string) {
  return (snapshot?.[stepId] ?? []).filter((workerId): workerId is string => Boolean(workerId)).length;
}

function countAssignedAtMinute(
  stepId: string,
  minute: number,
  timeSlots: string[],
  intervalMinutes: TimelineInterval,
  snapshotsByTime: SnapshotsByTime,
) {
  const slotIndex = timeSlots.findIndex((timeLabel, index) => {
    const slotStart = parseTime(timeLabel);
    const slotEnd = index < timeSlots.length - 1
      ? parseTime(timeSlots[index + 1])
      : Math.min(24 * 60, slotStart + intervalMinutes);
    return minute >= slotStart && minute < slotEnd;
  });

  if (slotIndex >= 0) {
    return countAssigned(snapshotsByTime[timeSlots[slotIndex]], stepId);
  }

  const previousSlots = timeSlots.filter((timeLabel) => parseTime(timeLabel) <= minute);
  const fallbackSlot = previousSlots[previousSlots.length - 1];
  return fallbackSlot ? countAssigned(snapshotsByTime[fallbackSlot], stepId) : 0;
}

function findAssignedStepId(snapshot: AssignmentSnapshot, workerId: string) {
  return Object.entries(snapshot).find(([, slots]) => slots.includes(workerId))?.[0] ?? null;
}

function formatAssignmentLabel(stepId: string | null, stepMap: Map<string, StepTemplate>) {
  if (!stepId) return "未配置";
  const step = stepMap.get(stepId);
  return step ? `${step.areaName} / ${step.processName}` : "未配置";
}

function materializeSnapshot(snapshot: AssignmentSnapshot, steps: StepTemplate[]): AssignmentSnapshot {
  return Object.fromEntries(
    steps.map((step) => {
      const source = snapshot[step.id] ?? [];
      const slots = source.filter((workerId, index): workerId is string => Boolean(workerId) && source.indexOf(workerId) === index);
      return [step.id, slots];
    }),
  );
}

function findLastAssignedIndex(slots: Array<string | null>) {
  return slots.filter((workerId): workerId is string => Boolean(workerId)).length - 1;
}

function firstFreeWorkerId(snapshot: AssignmentSnapshot, workers: Worker[]) {
  const assigned = new Set(Object.values(snapshot).flat().filter((value): value is string => Boolean(value)));
  return workers.find((worker) => worker.status === "active" && !assigned.has(worker.id))?.id ?? null;
}

function buildBaseSnapshot(steps: StepTemplate[], workers: Worker[]) {
  const activeWorkers = workers.filter((worker) => worker.status === "active");
  const remaining = new Set(activeWorkers.map((worker) => worker.id));
  const snapshot: AssignmentSnapshot = {};

  steps.forEach((step, index) => {
    const targetAssigned = Math.max(1, Math.min(step.headcount, step.headcount - (index % 3 === 2 ? 2 : 1)));
    const selected = activeWorkers
      .filter((worker) => remaining.has(worker.id))
      .map((worker) => ({ worker, score: scoreWorker(worker, step) }))
      .sort((left, right) => right.score - left.score || left.worker.id.localeCompare(right.worker.id, "ja"))
      .slice(0, targetAssigned)
      .map((entry) => entry.worker.id);

    selected.forEach((workerId) => remaining.delete(workerId));
    snapshot[step.id] = selected;
  });

  return snapshot;
}

function createSeededSnapshots(timeSlots: string[], steps: StepTemplate[], workers: Worker[], baseSnapshot: AssignmentSnapshot) {
  const snapshots: Record<string, AssignmentSnapshot> = {};
  const emptySnapshot = materializeSnapshot({}, steps);
  const baseMaterializedSnapshot = materializeSnapshot(baseSnapshot, steps);
  const earliestStartMinute = steps.length > 0 ? Math.min(...steps.map((step) => parseTime(step.startTime))) : 0;
  const rawSeedStartIndex = timeSlots.findIndex((timeLabel) => parseTime(timeLabel) > earliestStartMinute);
  const seedStartIndex = rawSeedStartIndex === -1 ? Math.max(timeSlots.length - 1, 0) : Math.max(rawSeedStartIndex - 1, 0);
  let previous = emptySnapshot;

  timeSlots.forEach((timeLabel, index) => {
    if (index < seedStartIndex) {
      snapshots[timeLabel] = cloneSnapshot(emptySnapshot);
      previous = snapshots[timeLabel];
      return;
    }

    const next = cloneSnapshot(index === seedStartIndex ? baseMaterializedSnapshot : previous);

    if (index > seedStartIndex && steps.length > 0) {
      if (index % 2 === 1 && steps.length > 1) {
        const sourceStep = steps[(index - 1) % steps.length];
        const targetStep = steps[index % steps.length];
        const sourceSlots = [...(next[sourceStep.id] ?? [])].filter((workerId): workerId is string => Boolean(workerId));
        const targetSlots = [...(next[targetStep.id] ?? [])].filter((workerId): workerId is string => Boolean(workerId));
        const sourceIndex = findLastAssignedIndex(sourceSlots);

        if (sourceIndex >= 0) {
          const movedWorkerId = sourceSlots[sourceIndex];
          sourceSlots.splice(sourceIndex, 1);
          targetSlots.push(movedWorkerId);
          next[sourceStep.id] = sourceSlots;
          next[targetStep.id] = targetSlots;
        }
      }

      if (index % 3 === 0) {
        const targetStep = steps[(index + 1) % steps.length];
        const targetSlots = [...(next[targetStep.id] ?? [])].filter((workerId): workerId is string => Boolean(workerId));
        const freeWorkerId = firstFreeWorkerId(next, workers);
        if (freeWorkerId) {
          targetSlots.push(freeWorkerId);
          next[targetStep.id] = targetSlots;
        }
      }

      if (index % 5 === 0) {
        const sourceStep = steps[(index + 2) % steps.length];
        const sourceSlots = [...(next[sourceStep.id] ?? [])].filter((workerId): workerId is string => Boolean(workerId));
        const sourceIndex = findLastAssignedIndex(sourceSlots);
        if (sourceIndex >= 0) {
          sourceSlots.splice(sourceIndex, 1);
          next[sourceStep.id] = sourceSlots;
        }
      }
    }

    snapshots[timeLabel] = materializeSnapshot(next, steps);
    previous = snapshots[timeLabel];
  });

  return snapshots;
}

function calcStepMetrics(
  step: StepView,
  referenceMinutes: number,
  timeSlots: string[],
  intervalMinutes: TimelineInterval,
  snapshotsByTime: SnapshotsByTime,
  actualReported = 0,
) {
  const targetMinutes = parseTime(step.targetEndTime);
  const effectiveReferenceMinutes = Math.max(0, referenceMinutes);
  const actual = Math.max(0, actualReported);
  const progress = step.planned > 0 ? Math.min(100, Math.round((actual / step.planned) * 100)) : 0;
  const remaining = Math.max(0, step.planned - actual);
  const totalUph = Math.max(0, step.assignedCount * step.uph);
  const etaMinutes = remaining === 0
    ? effectiveReferenceMinutes
    : totalUph > 0
      ? effectiveReferenceMinutes + (remaining / totalUph) * 60
      : null;
  const eta = remaining === 0
    ? "完了"
    : etaMinutes !== null
      ? formatPreciseTime(etaMinutes)
      : "--:--:--";
  const recommended = remaining === 0
    ? step.assignedCount
    : Math.max(1, Math.ceil(remaining / (step.uph * Math.max((targetMinutes - effectiveReferenceMinutes) / 60, 0.25))));
  const shortage = Math.max(recommended - step.assignedCount, 0);
  const overdue = eta !== "完了" && eta !== "--:--:--" && parseTime(eta) > targetMinutes;

  return { actual, progress, eta, shortage, recommended, overdue };
}

function generateAssignmentChanges(params: {
  timeSlots: string[];
  currentSnapshots: SnapshotsByTime;
  savedSnapshots: SnapshotsByTime;
  workerMap: Map<string, Worker>;
  stepMap: Map<string, StepTemplate>;
}) {
  const { timeSlots, currentSnapshots, savedSnapshots, workerMap, stepMap } = params;
  const workerIds = Array.from(workerMap.keys());
  const items: AssignmentChangeItem[] = [];

  timeSlots.forEach((timeLabel, index) => {
    const currentSnapshot = currentSnapshots[timeLabel] ?? {};
    const savedSnapshot = savedSnapshots[timeLabel] ?? {};
    const previousCurrent = index > 0 ? currentSnapshots[timeSlots[index - 1]] ?? {} : {};
    const previousSaved = index > 0 ? savedSnapshots[timeSlots[index - 1]] ?? {} : {};

    workerIds.forEach((workerId) => {
      const currentStepId = findAssignedStepId(currentSnapshot, workerId);
      const savedStepId = findAssignedStepId(savedSnapshot, workerId);
      if (currentStepId === savedStepId) return;

      const previousCurrentStepId = findAssignedStepId(previousCurrent, workerId);
      const previousSavedStepId = findAssignedStepId(previousSaved, workerId);
      if (index > 0 && previousCurrentStepId === currentStepId && previousSavedStepId === savedStepId) return;

      const worker = workerMap.get(workerId);
      const targetStep = stepMap.get(currentStepId ?? "") ?? stepMap.get(savedStepId ?? "");
      items.push({
        id: `${workerId}:${timeLabel}:${savedStepId ?? "none"}:${currentStepId ?? "none"}`,
        panelId: targetStep?.workflowId ?? "all",
        workerId,
        workerName: worker?.name ?? workerId,
        effectiveTime: timeLabel,
        previousAssignment: formatAssignmentLabel(savedStepId, stepMap),
        nextAssignment: formatAssignmentLabel(currentStepId, stepMap),
      });
    });
  });

  return items.sort(
    (left, right) => parseTime(left.effectiveTime) - parseTime(right.effectiveTime)
      || left.workerName.localeCompare(right.workerName, "ja")
      || left.nextAssignment.localeCompare(right.nextAssignment, "ja"),
  );
}

function statusLabel(status: WorkerStatus) {
  switch (status) {
    case "break":
      return "休憩中";
    case "absent":
      return "離席";
    default:
      return "出勤中";
  }
}

function buildWorkerScheduleLabelMap(
  workers: Worker[],
  steps: StepTemplate[],
  timeSlots: string[],
  intervalMinutes: TimelineInterval,
  snapshotsByTime: SnapshotsByTime,
) {
  const stepMap = new Map(steps.map((step) => [step.id, step] as const));
  const rangeMap = new Map<string, { start: number; end: number }>();

  timeSlots.forEach((timeLabel, index) => {
    const slotStart = parseTime(timeLabel);
    const slotEnd = index < timeSlots.length - 1
      ? parseTime(timeSlots[index + 1])
      : Math.min(TIMELINE_END, slotStart + intervalMinutes);
    const snapshot = snapshotsByTime[timeLabel] ?? {};

    Object.entries(snapshot).forEach(([stepId, workerIds]) => {
      const step = stepMap.get(stepId);
      if (!step) return;

      const effectiveStart = Math.max(slotStart, parseTime(step.startTime));
      const effectiveEnd = Math.min(slotEnd, parseTime(step.targetEndTime));
      if (effectiveEnd <= effectiveStart) return;

      workerIds.forEach((workerId) => {
        if (!workerId) return;
        const current = rangeMap.get(workerId);
        if (!current) {
          rangeMap.set(workerId, { start: effectiveStart, end: effectiveEnd });
          return;
        }

        current.start = Math.min(current.start, effectiveStart);
        current.end = Math.max(current.end, effectiveEnd);
      });
    });
  });

  return new Map(
    workers.map((worker) => {
      const range = rangeMap.get(worker.id);
      return [worker.id, range ? `${formatTime(range.start)} - ${formatTime(range.end)}` : null] as const;
    }),
  );
}

function StaffCard({
  worker,
  subtitle,
  themeColors,
  qualificationMap,
  skillMap,
  muted = false,
  compact = false,
  dense = false,
  draggable = false,
  onDragStart,
  onDragEnd,
}: {
  worker: Worker;
  subtitle?: string | null;
  themeColors: ThemeColors;
  qualificationMap: Map<string, QualificationMaster>;
  skillMap: Map<string, SkillMaster>;
  muted?: boolean;
  compact?: boolean;
  dense?: boolean;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const skillNames = worker.skillIds
    .map((id) => skillMap.get(id)?.name ?? "")
    .filter(Boolean);
  const qualificationNames = worker.qualificationIds
    .map((id) => qualificationMap.get(id)?.name ?? "")
    .filter(Boolean);
  const iconBadgeClass = dense
    ? "h-5 w-5"
    : compact
      ? "h-5.5 w-5.5"
      : "h-6 w-6";
  const iconClass = dense
    ? "h-2.5 w-2.5"
    : compact
      ? "h-3 w-3"
      : "h-3.5 w-3.5";

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={[
        dense
          ? "rounded-xl border px-2 py-1.5 transition-all"
          : compact
            ? "rounded-lg border px-2.5 py-2 transition-all"
            : "rounded-xl border p-3 transition-all",
        muted ? `${themeColors.borderCard} ${themeColors.bgSurface} opacity-70 grayscale` : `${themeColors.borderCard} ${themeColors.bgCard}`,
        draggable ? "cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-md" : "",
      ].join(" ")}
    >
      <div className={`flex items-center ${dense ? "gap-1.5" : compact ? "gap-2" : "gap-3"}`}>
        <div className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dense ? "h-6 w-6 text-[10px]" : compact ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-[13px]"} ${muted ? "bg-slate-400" : worker.color}`}>
          {worker.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold ${dense ? "text-[11px] leading-4" : compact ? "text-[12px]" : "text-[13px]"} ${themeColors.textPrimary}`}>{worker.name}</div>
          <div className={`${dense ? "text-[9px] leading-3.5" : compact ? "text-[10px]" : "text-[11px]"} ${muted ? themeColors.textMuted : themeColors.textSecondary}`}>
            {subtitle ?? worker.note ?? statusLabel(worker.status)}
          </div>
        </div>
      </div>
      {(skillNames.length > 0 || qualificationNames.length > 0) && (
        <div className={`flex flex-wrap gap-1 ${dense || compact ? "mt-1" : "mt-2"}`}>
          {skillNames.map((skillName) => (
            <span
              key={`${worker.id}-skill-${skillName}`}
              title={skillName}
              aria-label={`スキル: ${skillName}`}
              className={`inline-flex items-center justify-center rounded-full border cursor-help ${iconBadgeClass} ${muted ? "border-slate-300/70 bg-slate-200/70 text-slate-400" : "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"}`}
            >
              <Wrench className={iconClass} />
            </span>
          ))}
          {qualificationNames.map((qualificationName) => (
            <span
              key={`${worker.id}-qualification-${qualificationName}`}
              title={qualificationName}
              aria-label={`資格: ${qualificationName}`}
              className={`inline-flex items-center justify-center rounded-full border cursor-help ${iconBadgeClass} ${muted ? "border-slate-300/70 bg-slate-200/70 text-slate-400" : "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"}`}
            >
              <ShieldCheck className={iconClass} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LiveCommand() {
  const c = useThemeColors();
  const { shippers, sites, areas, qualifications, skills, processes, workflows, selectedSiteId } = useMasterData();
  const [now, setNow] = useState(new Date());
  const [timelineInterval, setTimelineInterval] = useState<TimelineInterval>(30);
  const [selectedPanelId, setSelectedPanelId] = useState<string | "all">("all");
  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [filterShipperId, setFilterShipperId] = useState("all");
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterProcessId, setFilterProcessId] = useState("all");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [selectedTime, setSelectedTime] = useState(() => formatTime(floorTimeToSlot(new Date().getHours() * 60 + new Date().getMinutes(), 30)));
  const [rightTab, setRightTab] = useState<"staff" | "adjustments">("staff");
  const [staffSearch, setStaffSearch] = useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [snapshotsByTime, setSnapshotsByTime] = useState<SnapshotsByTime>({});
  const [savedSnapshotsByTime, setSavedSnapshotsByTime] = useState<SnapshotsByTime>({});
  const [savedAdjustmentItems, setSavedAdjustmentItems] = useState<AssignmentChangeItem[]>([]);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const qualificationMap = useMemo(() => new Map(qualifications.map((item) => [item.id, item])), [qualifications]);
  const skillMap = useMemo(() => new Map(skills.map((item) => [item.id, item])), [skills]);
  const workerMap = useMemo(() => new Map(MOCK_WORKERS.map((worker) => [worker.id, worker])), []);
  const todayKey = useMemo(() => toDateInput(new Date()), []);
  const planStore = useMemo(() => readProgressPlanStore(), []);
  const dayPlans = useMemo(() => planStore[selectedDate] ?? {}, [planStore, selectedDate]);
  const submissionRecords = useMemo(
    () =>
      buildWorkerSubmissionRecords({
        dateKey: selectedDate,
        selectedSiteId,
        sites,
        workflows,
        shippers,
        areas,
        processes,
      }),
    [selectedDate, selectedSiteId, sites, workflows, shippers, areas, processes],
  );
  const reportedQuantityByStep = useMemo(
    () => buildReportedQuantityMap(submissionRecords),
    [submissionRecords],
  );
  const timeSlots = useMemo(() => createTimeSlots(timelineInterval), [timelineInterval]);
  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const deploymentStorageKey = useMemo(
    () => buildFieldDeploymentStorageKey(siteScope.storageScopeKey, selectedDate),
    [siteScope.storageScopeKey, selectedDate],
  );
  const adjustmentStorageKey = useMemo(
    () => buildAdjustmentStorageKey(siteScope.storageScopeKey, selectedDate),
    [siteScope.storageScopeKey, selectedDate],
  );

  useEffect(() => {
    if (timeSlots.includes(selectedTime)) return;
    const currentSlot = formatTime(floorTimeToSlot(new Date().getHours() * 60 + new Date().getMinutes(), timelineInterval));
    setSelectedTime(timeSlots.includes(currentSlot) ? currentSlot : (timeSlots[0] ?? currentSlot));
  }, [timeSlots, selectedTime, timelineInterval]);

  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container) return;

    const target = container.querySelector<HTMLElement>(`[data-time-label="${selectedTime}"]`);
    if (!target) return;

    const nextLeft = Math.max(0, target.offsetLeft - (container.clientWidth / 2) + (target.clientWidth / 2));
    container.scrollTo({ left: nextLeft, behavior: "auto" });
  }, [selectedTime, timeSlots, timelineInterval]);

  const panels = useMemo(
    () => buildPanels(workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)), shippers, areas, processes, dayPlans),
    [workflows, siteScope.siteIds, shippers, areas, processes, dayPlans],
  );
  const allSteps = useMemo(() => panels.flatMap((panel) => panel.steps), [panels]);
  const stepMap = useMemo(() => new Map(allSteps.map((step) => [step.id, step])), [allSteps]);
  const baseSnapshot = useMemo(() => buildBaseSnapshot(allSteps, MOCK_WORKERS), [allSteps]);
  const seededSnapshots = useMemo(() => createSeededSnapshots(timeSlots, allSteps, MOCK_WORKERS, baseSnapshot), [timeSlots, allSteps, baseSnapshot]);

  useEffect(() => {
    try {
      const stored = readFieldDeploymentSnapshots(siteScope.storageScopeKey, selectedDate);
      const storedAdjustment = readAdjustmentStorage(siteScope.storageScopeKey, selectedDate);
      const defaultSnapshots = Object.fromEntries(
        timeSlots.map((timeLabel) => [
          timeLabel,
          materializeSnapshot(seededSnapshots[timeLabel] ?? baseSnapshot, allSteps),
        ]),
      ) as SnapshotsByTime;

      if (Object.keys(stored).length === 0) {
        setSnapshotsByTime(defaultSnapshots);
        setSavedSnapshotsByTime(defaultSnapshots);
        if (storedAdjustment) {
          setSavedAdjustmentItems(storedAdjustment.items ?? []);
        } else {
          setSavedAdjustmentItems([]);
        }
        return;
      }
      const merged = Object.fromEntries(
        timeSlots.map((timeLabel) => [
          timeLabel,
          materializeSnapshot(stored?.[timeLabel] ?? seededSnapshots[timeLabel] ?? baseSnapshot, allSteps),
        ]),
      ) as SnapshotsByTime;
      setSnapshotsByTime(merged);
      setSavedSnapshotsByTime(merged);
      if (storedAdjustment) {
        setSavedAdjustmentItems(storedAdjustment.items ?? []);
      } else {
        setSavedAdjustmentItems([]);
      }
    } catch {
      const fallbackSnapshots = Object.fromEntries(
        timeSlots.map((timeLabel) => [
          timeLabel,
          materializeSnapshot(seededSnapshots[timeLabel] ?? baseSnapshot, allSteps),
        ]),
      ) as SnapshotsByTime;
      setSnapshotsByTime(fallbackSnapshots);
      setSavedSnapshotsByTime(fallbackSnapshots);
      setSavedAdjustmentItems([]);
    }
  }, [adjustmentStorageKey, deploymentStorageKey, seededSnapshots, timeSlots, baseSnapshot, allSteps, siteScope.storageScopeKey, selectedDate]);

  const normalizedSnapshotsByTime = useMemo(
    () => Object.fromEntries(
      timeSlots.map((timeLabel) => [
        timeLabel,
        materializeSnapshot(snapshotsByTime[timeLabel] ?? seededSnapshots[timeLabel] ?? baseSnapshot, allSteps),
      ]),
    ) as SnapshotsByTime,
    [snapshotsByTime, timeSlots, seededSnapshots, baseSnapshot, allSteps],
  );

  const savedNormalizedSnapshotsByTime = useMemo(
    () => Object.fromEntries(
      timeSlots.map((timeLabel) => [
        timeLabel,
        materializeSnapshot(savedSnapshotsByTime[timeLabel] ?? seededSnapshots[timeLabel] ?? baseSnapshot, allSteps),
      ]),
    ) as SnapshotsByTime,
    [savedSnapshotsByTime, timeSlots, seededSnapshots, baseSnapshot, allSteps],
  );

  const workerScheduleLabelMap = useMemo(
    () => buildWorkerScheduleLabelMap(MOCK_WORKERS, allSteps, timeSlots, timelineInterval, normalizedSnapshotsByTime),
    [allSteps, timeSlots, timelineInterval, normalizedSnapshotsByTime],
  );
  const workerAttendanceLabelMap = useMemo(
    () => new Map(
      MOCK_WORKERS.map((worker) => {
        const shift = resolveWorkerShiftForDate(worker.name, selectedDate);
        if (shift?.isOff) {
          return [worker.id, "公休"] as const;
        }
        if (shift) {
          return [worker.id, `${shift.start} - ${shift.end}`] as const;
        }
        return [worker.id, workerScheduleLabelMap.get(worker.id) ?? null] as const;
      }),
    ),
    [selectedDate, workerScheduleLabelMap],
  );

  const currentSnapshot = useMemo(
    () => normalizedSnapshotsByTime[selectedTime] ?? materializeSnapshot(seededSnapshots[selectedTime] ?? baseSnapshot, allSteps),
    [normalizedSnapshotsByTime, selectedTime, seededSnapshots, baseSnapshot, allSteps],
  );

  const panelsWithSlots = useMemo(
    () => panels.map((panel) => ({
      ...panel,
      steps: panel.steps.map((step) => {
        const slots = currentSnapshot[step.id] ?? [];
        return {
          ...step,
          slots,
          assignedCount: slots.filter((slot): slot is string => Boolean(slot)).length,
        } satisfies StepView;
      }),
    })),
    [panels, currentSnapshot],
  );

  const shipperOptions = useMemo(() => {
    const optionMap = new Map(
      shippers
        .filter((shipper) => panelsWithSlots.some((panel) => panel.shipperId === shipper.id))
        .map((shipper) => [shipper.id, shipper] as const),
    );
    return Array.from(optionMap.values());
  }, [panelsWithSlots, shippers]);

  const panelsForAreaOptions = useMemo(
    () => panelsWithSlots.filter((panel) => filterShipperId === "all" || panel.shipperId === filterShipperId),
    [panelsWithSlots, filterShipperId],
  );

  const areaOptions = useMemo(() => {
    const duplicateNameCount = panelsForAreaOptions.reduce((map, panel) => {
      map.set(panel.areaName, (map.get(panel.areaName) ?? 0) + 1);
      return map;
    }, new Map<string, number>());

    const optionMap = new Map<string, { id: string; name: string; label: string }>();
    panelsForAreaOptions.forEach((panel) => {
      if (optionMap.has(panel.areaId)) return;
      const hasDuplicateName = (duplicateNameCount.get(panel.areaName) ?? 0) > 1;
      optionMap.set(panel.areaId, {
        id: panel.areaId,
        name: panel.areaName,
        label: hasDuplicateName ? `${panel.areaName} / ${panel.shipperName}` : panel.areaName,
      });
    });

    return Array.from(optionMap.values());
  }, [panelsForAreaOptions]);

  const panelsForProcessOptions = useMemo(
    () =>
      panelsWithSlots.filter((panel) => {
        if (filterShipperId !== "all" && panel.shipperId !== filterShipperId) return false;
        if (filterAreaId !== "all" && panel.areaId !== filterAreaId) return false;
        return true;
      }),
    [panelsWithSlots, filterShipperId, filterAreaId],
  );

  const processOptions = useMemo(() => {
    const optionMap = new Map(
      processes
        .filter((process) =>
          panelsForProcessOptions.some((panel) => panel.steps.some((step) => step.processId === process.id)),
        )
        .map((process) => [process.id, process] as const),
    );
    return Array.from(optionMap.values());
  }, [panelsForProcessOptions, processes]);

  useEffect(() => {
    if (filterShipperId === "all") return;
    if (shipperOptions.some((shipper) => shipper.id === filterShipperId)) return;
    setFilterShipperId("all");
  }, [filterShipperId, shipperOptions]);

  useEffect(() => {
    if (filterAreaId === "all") return;
    if (areaOptions.some((area) => area.id === filterAreaId)) return;
    setFilterAreaId("all");
  }, [filterAreaId, areaOptions]);

  useEffect(() => {
    if (filterProcessId === "all") return;
    if (processOptions.some((process) => process.id === filterProcessId)) return;
    setFilterProcessId("all");
  }, [filterProcessId, processOptions]);

  const filteredPanels = useMemo(() => {
    const keyword = filterKeyword.trim().toLowerCase();
    return panelsWithSlots.filter((panel) => {
      if (filterShipperId !== "all" && panel.shipperId !== filterShipperId) return false;
      if (filterAreaId !== "all" && panel.areaId !== filterAreaId) return false;
      if (filterProcessId !== "all" && !panel.steps.some((step) => step.processId === filterProcessId)) return false;
      if (!keyword) return true;
      const haystack = `${panel.shipperName} ${panel.areaName} ${panel.workflowName} ${panel.steps.map((step) => step.processName).join(" ")}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [panelsWithSlots, filterShipperId, filterAreaId, filterProcessId, filterKeyword]);

  useEffect(() => {
    if (selectedPanelId === "all") return;
    if (filteredPanels.some((panel) => panel.id === selectedPanelId)) return;
    setSelectedPanelId("all");
  }, [filteredPanels, selectedPanelId]);

  const displayPanels = useMemo(
    () => selectedPanelId === "all" ? filteredPanels : filteredPanels.filter((panel) => panel.id === selectedPanelId),
    [filteredPanels, selectedPanelId],
  );

  const systemReferenceMinutes = clamp(now.getHours() * 60 + now.getMinutes(), TIMELINE_START, TIMELINE_END);
  const metricsByStepId = useMemo(
    () => new Map(
      panelsWithSlots.flatMap((panel) => panel.steps.map((step) => [
        step.id,
        calcStepMetrics(
          step,
          systemReferenceMinutes,
          timeSlots,
          timelineInterval,
          normalizedSnapshotsByTime,
          reportedQuantityByStep.get(step.id) ?? 0,
        ),
      ])),
    ),
    [panelsWithSlots, systemReferenceMinutes, timeSlots, timelineInterval, normalizedSnapshotsByTime, reportedQuantityByStep],
  );
  const visibleSteps = useMemo(
    () => displayPanels.flatMap((panel) => panel.steps.map((step) => ({
      panel,
      step,
      meta: metricsByStepId.get(step.id) ?? calcStepMetrics(
        step,
        systemReferenceMinutes,
        timeSlots,
        timelineInterval,
        normalizedSnapshotsByTime,
        reportedQuantityByStep.get(step.id) ?? 0,
      ),
    }))),
    [displayPanels, metricsByStepId, normalizedSnapshotsByTime, systemReferenceMinutes, timeSlots, timelineInterval, reportedQuantityByStep],
  );
  const assignedWorkerIds = useMemo(
    () => new Set(Object.values(currentSnapshot).flat().filter((value): value is string => Boolean(value))),
    [currentSnapshot],
  );

  const filteredWorkerText = staffSearch.trim().toLowerCase();
  const freeWorkers = MOCK_WORKERS.filter((worker) => {
    if (worker.status !== "active" || assignedWorkerIds.has(worker.id)) return false;
    if (!filteredWorkerText) return true;
    const haystack = `${worker.name} ${worker.skillIds.map((id) => skillMap.get(id)?.name ?? "").join(" ")} ${worker.note ?? ""}`.toLowerCase();
    return haystack.includes(filteredWorkerText);
  });
  const breakWorkers = MOCK_WORKERS.filter((worker) => worker.status === "break");
  const absentWorkers = MOCK_WORKERS.filter((worker) => worker.status === "absent");
  const activeCount = MOCK_WORKERS.filter((worker) => worker.status === "active").length;
  const assignedCount = Array.from(assignedWorkerIds).length;
  const breakCount = breakWorkers.length;
  const absentCount = absentWorkers.length;
  const attendanceRate = Math.round((activeCount / MOCK_WORKERS.length) * 100);
  const nowMinutes = systemReferenceMinutes;
  const nowSlot = formatTime(floorTimeToSlot(nowMinutes, timelineInterval));
  const todayValue = todayKey.replaceAll("-", "");
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const isSelectedDateToday = selectedDateValue === todayValue;
  const isSelectedDatePast = selectedDateValue < todayValue;
  const isSelectedDateFuture = selectedDateValue > todayValue;
  const hasFilters = filterShipperId !== "all" || filterAreaId !== "all" || filterProcessId !== "all" || filterKeyword.trim().length > 0;
  const unsavedAdjustmentItems = useMemo(
    () => generateAssignmentChanges({
      timeSlots,
      currentSnapshots: normalizedSnapshotsByTime,
      savedSnapshots: savedNormalizedSnapshotsByTime,
      workerMap,
      stepMap,
    }),
    [timeSlots, normalizedSnapshotsByTime, savedNormalizedSnapshotsByTime, workerMap, stepMap],
  );
  const changedTimeSlots = useMemo(
    () => new Set([...savedAdjustmentItems, ...unsavedAdjustmentItems].map((item) => item.effectiveTime)),
    [savedAdjustmentItems, unsavedAdjustmentItems],
  );

  const updateFutureSnapshots = (workerId: string, targetStepId: string | null, targetIndex: number) => {
    const selectedIndex = timeSlots.indexOf(selectedTime);
    if (selectedIndex < 0) return;

    setSnapshotsByTime((prev) => {
      const nextState = { ...prev };

      for (let index = selectedIndex; index < timeSlots.length; index += 1) {
        const timeLabel = timeSlots[index];
        const source = materializeSnapshot(prev[timeLabel] ?? seededSnapshots[timeLabel] ?? baseSnapshot, allSteps);
        const nextSnapshot = cloneSnapshot(source);

        Object.keys(nextSnapshot).forEach((stepKey) => {
          nextSnapshot[stepKey] = (nextSnapshot[stepKey] ?? []).filter(
            (assignedId): assignedId is string => Boolean(assignedId) && assignedId !== workerId,
          );
        });

        if (targetStepId) {
          const targetSlots = [...(nextSnapshot[targetStepId] ?? [])].filter((assignedId): assignedId is string => Boolean(assignedId));
          const insertIndex = clamp(targetIndex, 0, targetSlots.length);
          targetSlots.splice(insertIndex, 0, workerId);
          nextSnapshot[targetStepId] = targetSlots;
        }

        const materializedSnapshot = materializeSnapshot(nextSnapshot, allSteps);
        nextState[timeLabel] = materializedSnapshot;
      }

      return nextState;
    });
  };

  const handleDropToSlot = (stepId: string, slotIndex: number) => {
    if (!dragState) return;
    updateFutureSnapshots(dragState.workerId, stepId, slotIndex);
    setDragState(null);
  };

  const handleDropToPool = () => {
    if (!dragState) return;
    updateFutureSnapshots(dragState.workerId, null, 0);
    setDragState(null);
  };

  const moveTimeline = (direction: -1 | 1) => {
    const index = timeSlots.indexOf(selectedTime);
    if (index < 0) return;
    const nextIndex = clamp(index + direction, 0, timeSlots.length - 1);
    setSelectedTime(timeSlots[nextIndex]);
  };

  const handleAiOptimize = () => {
    const selectedIndex = timeSlots.indexOf(selectedTime);
    if (selectedIndex < 0 || allSteps.length === 0) return;

    const activeWorkers = MOCK_WORKERS.filter((worker) => worker.status === "active");
    if (activeWorkers.length === 0) return;

    const referenceSnapshot = materializeSnapshot(
      normalizedSnapshotsByTime[selectedTime] ?? seededSnapshots[selectedTime] ?? baseSnapshot,
      allSteps,
    );
    const currentStepByWorker = new Map(activeWorkers.map((worker) => [worker.id, findAssignedStepId(referenceSnapshot, worker.id)] as const));
    const availableWorkerIds = new Set(activeWorkers.map((worker) => worker.id));
    const optimizedSnapshot: AssignmentSnapshot = {};
    const resolveStepMeta = (step: StepTemplate) => {
      const cached = metricsByStepId.get(step.id);
      if (cached) return cached;

      const assignedCount = countAssigned(referenceSnapshot, step.id);
      return calcStepMetrics(
        { ...step, slots: referenceSnapshot[step.id] ?? [], assignedCount },
        systemReferenceMinutes,
        timeSlots,
        timelineInterval,
        normalizedSnapshotsByTime,
        reportedQuantityByStep[step.id] ?? 0,
      );
    };
    const sortedSteps = [...allSteps].sort((left, right) => {
      const leftMeta = resolveStepMeta(left);
      const rightMeta = resolveStepMeta(right);
      const leftRemaining = Math.max(0, left.planned - (leftMeta.actual ?? 0));
      const rightRemaining = Math.max(0, right.planned - (rightMeta.actual ?? 0));

      return rightMeta.shortage - leftMeta.shortage
        || rightRemaining - leftRemaining
        || rightMeta.recommended - leftMeta.recommended
        || left.workflowName.localeCompare(right.workflowName, "ja")
        || left.processName.localeCompare(right.processName, "ja");
    });

    sortedSteps.forEach((step) => {
      const stepMeta = resolveStepMeta(step);
      const remaining = Math.max(0, step.planned - stepMeta.actual);
      const desiredCount = remaining === 0 ? 0 : Math.min(activeWorkers.length, Math.max(1, stepMeta.recommended));

      if (desiredCount === 0) {
        optimizedSnapshot[step.id] = [];
        return;
      }

      const keptWorkerIds = (referenceSnapshot[step.id] ?? [])
        .filter((workerId): workerId is string => Boolean(workerId) && availableWorkerIds.has(workerId))
        .sort((left, right) => {
          const leftWorker = workerMap.get(left);
          const rightWorker = workerMap.get(right);
          return (rightWorker ? scoreWorker(rightWorker, step) : 0) - (leftWorker ? scoreWorker(leftWorker, step) : 0);
        })
        .slice(0, desiredCount);

      const assignedWorkerIds = [...keptWorkerIds];
      keptWorkerIds.forEach((workerId) => availableWorkerIds.delete(workerId));

      if (assignedWorkerIds.length < desiredCount) {
        const needed = desiredCount - assignedWorkerIds.length;
        const candidates = activeWorkers
          .filter((worker) => availableWorkerIds.has(worker.id))
          .map((worker) => ({
            worker,
            score: scoreWorker(worker, step),
            staysOnSameStep: currentStepByWorker.get(worker.id) === step.id ? 1 : 0,
          }))
          .sort((left, right) => right.score - left.score
            || right.staysOnSameStep - left.staysOnSameStep
            || left.worker.name.localeCompare(right.worker.name, "ja"))
          .slice(0, needed);

        candidates.forEach(({ worker }) => {
          assignedWorkerIds.push(worker.id);
          availableWorkerIds.delete(worker.id);
        });
      }

      optimizedSnapshot[step.id] = assignedWorkerIds;
    });

    setSnapshotsByTime((prev) => {
      const nextState = { ...prev };

      for (let index = selectedIndex; index < timeSlots.length; index += 1) {
        nextState[timeSlots[index]] = materializeSnapshot(cloneSnapshot(optimizedSnapshot), allSteps);
      }

      return nextState;
    });
    setRightTab("adjustments");
  };

  const handleSave = () => {
    const savedAt = new Date().toISOString();
    const effectiveTimes = Array.from(new Set(unsavedAdjustmentItems.map((item) => item.effectiveTime)))
      .sort((left, right) => parseTime(left) - parseTime(right));

    effectiveTimes.forEach((timeLabel) => {
      if (!selectedSiteId || selectedDate !== todayKey) return;
      pushAssignmentChangeNotifications({
        siteId: selectedSiteId,
        effectiveTime: timeLabel,
        previousSnapshot: savedNormalizedSnapshotsByTime[timeLabel] ?? {},
        nextSnapshot: normalizedSnapshotsByTime[timeLabel] ?? {},
        stepMap,
        workerMap,
      });
    });

    writeFieldDeploymentSnapshots(siteScope.storageScopeKey, selectedDate, normalizedSnapshotsByTime as Record<string, AssignmentSnapshot>);
    writeAdjustmentStorage(siteScope.storageScopeKey, selectedDate, { savedAt, items: unsavedAdjustmentItems });
    setSavedSnapshotsByTime(normalizedSnapshotsByTime);
    setSavedAdjustmentItems(unsavedAdjustmentItems);
    setRightTab("adjustments");
  };

  return (
    <div className={`flex h-full min-h-0 flex-col ${c.isDark ? "bg-[#0d0f16]" : "bg-slate-50"}`}>
      <div className={`${c.bgCard} border-b ${c.border} px-5 py-4`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-[190px] items-center gap-3">
            <Clock3 className={`h-5 w-5 ${c.textMuted}`} />
            <div className="w-[165px] shrink-0">
              <div className={`w-full text-[30px] font-semibold leading-none tabular-nums ${c.textPrimary}`}>
                {now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
              </div>
              <div className={`mt-1 text-[13px] ${c.textSecondary}`}>{now.toLocaleDateString("ja-JP")}</div>
            </div>
          </div>

          <div className={`flex flex-wrap items-center gap-5 border-l ${c.border} pl-5`}>
            <div>
              <div className={`text-[11px] ${c.textMuted}`}>出勤</div>
              <div className={`text-[18px] font-semibold tabular-nums ${c.textPrimary}`}>{activeCount}</div>
            </div>
            <div>
              <div className={`text-[11px] ${c.textMuted}`}>休憩</div>
              <div className={`text-[18px] font-semibold tabular-nums ${c.textPrimary}`}>{breakCount}</div>
            </div>
            <div>
              <div className={`text-[11px] ${c.textMuted}`}>離席</div>
              <div className={`text-[18px] font-semibold tabular-nums ${c.textPrimary}`}>{absentCount}</div>
            </div>
            <div>
              <div className={`text-[11px] ${c.textMuted}`}>配置済み</div>
              <div className={`text-[18px] font-semibold tabular-nums ${c.textPrimary}`}>{assignedCount}</div>
            </div>
            <div>
              <div className={`text-[11px] ${c.textMuted}`}>稼働率</div>
              <div className="text-[18px] font-semibold tabular-nums text-emerald-500">{attendanceRate}%</div>
            </div>
          </div>

          <div className="ml-auto">
            {unsavedAdjustmentItems.length > 0 ? (
              <span className="inline-flex items-center rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-500">
                未保存の配置変更 {unsavedAdjustmentItems.length}件
              </span>
            ) : (
              <span className={`inline-flex items-center rounded-xl border px-3 py-2 text-[12px] ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
                保存済みの配置変更はありません
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              <Save className="h-3.5 w-3.5" />
              保存
              {unsavedAdjustmentItems.length > 0 && (
                <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">{unsavedAdjustmentItems.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleAiOptimize}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold shadow-sm transition ${c.bgSurface} ${c.borderCard} ${c.textPrimary} hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200`}
            >
              <Layers className="h-3.5 w-3.5" />
              AI最適化
            </button>
          </div>
        </div>
      </div>

      <div className={`${c.bgCard} border-b ${c.border} px-5 py-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterShipperId} onChange={(event) => setFilterShipperId(event.target.value)} className={`${c.bgSurface} ${c.borderCard} ${c.textPrimary} rounded-xl border px-3 py-2 text-[12px] outline-none`}>
            <option value="all">荷主: すべて</option>
            {shipperOptions.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.name}</option>)}
          </select>
          <select value={filterAreaId} onChange={(event) => setFilterAreaId(event.target.value)} className={`${c.bgSurface} ${c.borderCard} ${c.textPrimary} rounded-xl border px-3 py-2 text-[12px] outline-none`}>
            <option value="all">エリア: すべて</option>
            {areaOptions.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select>
          <select value={filterProcessId} onChange={(event) => setFilterProcessId(event.target.value)} className={`${c.bgSurface} ${c.borderCard} ${c.textPrimary} rounded-xl border px-3 py-2 text-[12px] outline-none`}>
            <option value="all">工程: すべて</option>
            {processOptions.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
          </select>
          <div className={`flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border px-3 py-2 ${c.bgSurface} ${c.borderCard}`}>
            <Search className={`h-4 w-4 ${c.textMuted}`} />
            <input
              value={filterKeyword}
              onChange={(event) => setFilterKeyword(event.target.value)}
              placeholder="荷主・エリア・工程で検索"
              className={`w-full bg-transparent text-[12px] ${c.textPrimary} outline-none placeholder:text-slate-400`}
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterShipperId("all");
                setFilterAreaId("all");
                setFilterProcessId("all");
                setFilterKeyword("");
                setSelectedPanelId("all");
              }}
              className={`rounded-xl border px-3 py-2 text-[12px] ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}
            >
              クリア
            </button>
          )}
        </div>
      </div>

      <div className={`${c.bgCard} border-b ${c.border} px-5 py-3`}>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className={`${c.bgSurface} ${c.borderCard} ${c.textPrimary} h-10 rounded-xl border px-3 text-[12px] outline-none`}
          />
          <button type="button" onClick={() => moveTimeline(-1)} className={`rounded-xl border p-2 ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div ref={timelineScrollRef} className="flex-1 overflow-x-auto pb-1">
            <div className="relative flex min-w-max items-start px-1">
              <div className={`absolute left-7 right-7 top-[33px] h-px ${c.isDark ? "bg-slate-800" : "bg-slate-200"}`} />
              {timeSlots.map((timeLabel) => {
                const slotMinutes = parseTime(timeLabel);
                const isSelected = selectedTime === timeLabel;
                const isCurrent = isSelectedDateToday && nowSlot === timeLabel;
                const isPast = isSelectedDatePast || (isSelectedDateToday && slotMinutes < nowMinutes && !isCurrent);
                const isFuture = isSelectedDateFuture || (isSelectedDateToday && slotMinutes > nowMinutes);
                const isChangedFuture = changedTimeSlots.has(timeLabel) && isFuture;

                const dotClass = isCurrent
                  ? "bg-blue-500"
                  : isChangedFuture
                    ? "bg-orange-500"
                    : isPast
                      ? (c.isDark ? "bg-slate-500" : "bg-slate-300")
                      : (c.isDark ? "bg-slate-700" : "bg-slate-500");

                const labelClass = isCurrent
                  ? "text-blue-500"
                  : isChangedFuture
                    ? "text-orange-500"
                    : isPast
                      ? (c.isDark ? "text-slate-500" : "text-slate-400")
                      : c.textMuted;

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
                          "flex h-5 w-5 items-center justify-center rounded-full transition-all",
                          isSelected
                            ? (isCurrent
                              ? "ring-2 ring-blue-500/25"
                              : isChangedFuture
                                ? "ring-2 ring-orange-500/25"
                                : c.isDark
                                  ? "ring-2 ring-slate-600"
                                  : "ring-2 ring-slate-300")
                            : "",
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
          <button type="button" onClick={() => moveTimeline(1)} className={`rounded-xl border p-2 ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className={`ml-2 flex items-center gap-1 rounded-xl border p-1 ${c.bgSurface} ${c.borderCard}`}>
            {INTERVAL_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTimelineInterval(option)}
                className={`rounded-lg px-2.5 py-1 text-[11px] ${timelineInterval === option ? "bg-blue-600 text-white" : c.textSecondary}`}
              >
                {option}分
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`${c.bgCard} border-b ${c.border} flex items-center gap-2 overflow-x-auto px-5 py-2`}>
        <Filter className={`h-4 w-4 ${c.textMuted}`} />
        <button
          type="button"
          onClick={() => setSelectedPanelId("all")}
          className={`rounded-xl border px-3 py-1.5 text-[12px] ${selectedPanelId === "all" ? (c.isDark ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-blue-300 bg-blue-50 text-blue-700") : `${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}`}
        >
          全ワークフロー
        </button>
        {filteredPanels.map((panel) => {
          const average = panel.steps.length > 0
            ? Math.round(panel.steps.reduce((sum, step) => sum + (metricsByStepId.get(step.id)?.progress ?? 0), 0) / panel.steps.length)
            : 0;
          const colorTone = processColorClasses[panel.color] ?? processColorClasses.cyan;
          return (
            <button
              key={panel.id}
              type="button"
              onClick={() => setSelectedPanelId(panel.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-[12px] ${selectedPanelId === panel.id ? `${colorTone.bg} ${colorTone.border} ${colorTone.text}` : `${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}`}
            >
              <div className="text-left">
                <div className="max-w-[160px] truncate font-semibold">{panel.areaName}</div>
                <div className={`max-w-[160px] truncate text-[10px] ${c.textMuted}`}>{panel.shipperName}</div>
              </div>
              <span className={`text-[10px] font-semibold tabular-nums ${average >= 70 ? "text-emerald-500" : average >= 40 ? "text-amber-500" : "text-rose-500"}`}>{average}%</span>
            </button>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 overflow-y-auto pr-1">
          {displayPanels.length === 0 ? (
            <div className={`rounded-3xl border border-dashed ${c.borderCard} ${c.bgCard} px-6 py-12 text-center`}>
              <div className={`text-[16px] font-semibold ${c.textPrimary}`}>対象のワークフローがありません</div>
              <div className={`mt-2 text-[13px] ${c.textSecondary}`}>現在の拠点・フィルター条件に一致する工程が見つかりません。</div>
            </div>
          ) : (
            <div className="space-y-6">
              {displayPanels.map((panel) => {
                const totalAssigned = panel.steps.reduce((sum, step) => sum + step.assignedCount, 0);
                const averageProgress = panel.steps.length > 0
                  ? Math.round(panel.steps.reduce((sum, step) => sum + (metricsByStepId.get(step.id)?.progress ?? 0), 0) / panel.steps.length)
                  : 0;
                const panelTone = processColorClasses[panel.color] ?? processColorClasses.cyan;

                return (
                  <section key={panel.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full border ${panelTone.bg} ${panelTone.border}`} />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[18px] font-semibold ${c.textPrimary}`}>{panel.areaName}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${panelTone.bg} ${panelTone.text}`}>{panel.shipperName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={`text-[12px] ${c.textSecondary}`}><Users className="mr-1 inline h-3.5 w-3.5" />配置 {totalAssigned}名</div>
                        <div className={`text-[12px] font-semibold ${averageProgress >= 70 ? "text-emerald-500" : averageProgress >= 40 ? "text-amber-500" : "text-rose-500"}`}>{averageProgress}%</div>
                      </div>
                    </div>

                    <div className="grid gap-4 2xl:grid-cols-2">
                      {panel.steps.map((step) => {
                        const tone = processColorClasses[step.color] ?? processColorClasses.cyan;
                        const meta = metricsByStepId.get(step.id) ?? calcStepMetrics(step, systemReferenceMinutes, timeSlots, timelineInterval, normalizedSnapshotsByTime);
                        const requiredLabels = [
                          ...step.requiredSkillIds.map((id) => skillMap.get(id)?.name ?? ""),
                          ...step.requiredQualificationIds.map((id) => qualificationMap.get(id)?.name ?? ""),
                        ].filter(Boolean).slice(0, 3);

                        return (
                          <article key={step.id} className={`rounded-3xl border p-3 ${c.bgCard} ${c.border}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone.bg} ${tone.text}`}>
                                  <step.icon className="h-5 w-5" />
                                </div>
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className={`text-[18px] font-semibold ${c.textPrimary}`}>{step.processName}</div>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${tone.bg} ${tone.text}`}>{step.areaName}</span>
                                  </div>
                                  <div className={`text-[12px] ${c.textSecondary}`}>{step.description}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-[12px] ${c.textSecondary}`}>配置 {step.assignedCount}名</div>
                              </div>
                            </div>

                            {requiredLabels.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1">
                                {requiredLabels.map((label) => (
                                  <span key={`${step.id}-${label}`} className={`rounded-full px-2 py-0.5 text-[10px] ${c.bgSurface} ${c.textSecondary}`}>
                                    {label}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className={`mt-4 grid grid-cols-5 gap-2 rounded-2xl px-3 py-3 ${c.bgSurface}`}>
                              <div>
                                <div className={`text-[10px] ${c.textMuted}`}>予定</div>
                                <div className={`text-[16px] font-semibold tabular-nums ${c.textPrimary}`}>{step.planned.toLocaleString("ja-JP")}</div>
                              </div>
                              <div>
                                <div className={`text-[10px] ${c.textMuted}`}>実績</div>
                                <div className="text-[16px] font-semibold tabular-nums text-cyan-500">{meta.actual.toLocaleString("ja-JP")}</div>
                              </div>
                              <div>
                                <div className={`text-[10px] ${c.textMuted}`}>進捗</div>
                                <div className={`text-[16px] font-semibold tabular-nums ${meta.progress < 50 ? "text-rose-500" : "text-amber-500"}`}>{meta.progress}%</div>
                              </div>
                              <div>
                                <div className={`text-[10px] ${c.textMuted}`}>UPH</div>
                                <div className="text-[16px] font-semibold tabular-nums text-violet-500">{step.assignedCount * step.uph}</div>
                              </div>
                              <div>
                                <div className={`text-[10px] ${c.textMuted}`}>見込</div>
                                <div className={`text-[16px] font-semibold tabular-nums ${meta.overdue ? "text-rose-500" : c.textPrimary}`}>{meta.eta}</div>
                              </div>
                            </div>

                            <div className="mt-3">
                              <div className={`h-2 rounded-full ${c.isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                                <div className={`h-2 rounded-full ${meta.progress >= 70 ? "bg-emerald-500" : meta.progress >= 40 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.max(meta.progress, 4)}%` }} />
                              </div>
                              <div className={`mt-2 flex items-center justify-between text-[11px] ${c.textSecondary}`}>
                                <span>開始 {step.startTime}</span>
                                <span>目標終了 {step.targetEndTime}</span>
                                <span>推奨 {meta.recommended}名</span>
                              </div>
                            </div>

                            <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                              {step.slots.map((workerId, slotIndex) => {
                                const worker = workerId ? workerMap.get(workerId) : undefined;
                                if (!worker) return null;

                                return (
                                  <div
                                    key={`${step.id}-slot-${slotIndex}`}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      handleDropToSlot(step.id, slotIndex);
                                    }}
                                    className="min-h-[60px]"
                                  >
                                    <StaffCard
                                      worker={worker}
                                      subtitle={workerAttendanceLabelMap.get(worker.id)}
                                      themeColors={c}
                                      qualificationMap={qualificationMap}
                                      skillMap={skillMap}
                                      muted={worker.status !== "active"}
                                      dense
                                      draggable
                                      onDragStart={(event) => {
                                        event.dataTransfer.effectAllowed = "move";
                                        event.dataTransfer.setData("text/plain", worker.id);
                                        setDragState({ workerId: worker.id, fromStepId: step.id, fromSlotIndex: slotIndex });
                                      }}
                                      onDragEnd={() => setDragState(null)}
                                    />
                                  </div>
                                );
                              })}
                              <div
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  handleDropToSlot(step.id, step.slots.length);
                                }}
                                className={`flex min-h-[60px] items-center justify-center rounded-xl border border-dashed px-3 text-[11px] ${dragState ? "border-cyan-400/60 text-cyan-500" : `${c.borderCard} ${c.textMuted}`}`}
                              >
                                追加
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <aside className={`min-h-0 overflow-y-auto rounded-3xl border ${c.border} ${c.bgCard}`}>
          <div className={`sticky top-0 z-10 border-b ${c.border} ${c.bgCard} px-4 py-4`}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRightTab("staff")}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold ${rightTab === "staff" ? "bg-blue-600 text-white" : `${c.bgSurface} ${c.textSecondary}`}`}
              >
                <Users className="h-4 w-4" />
                スタッフ
              </button>
              <button
                type="button"
                onClick={() => setRightTab("adjustments")}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold ${rightTab === "adjustments" ? "bg-blue-600 text-white" : `${c.bgSurface} ${c.textSecondary}`}`}
              >
                <AlertTriangle className="h-4 w-4" />
                調整リスト
              </button>
            </div>
          </div>

          {rightTab === "staff" ? (
            <div className="space-y-5 p-4">
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${c.bgSurface} ${c.borderCard}`}>
                <Search className={`h-4 w-4 ${c.textMuted}`} />
                <input
                  value={staffSearch}
                  onChange={(event) => setStaffSearch(event.target.value)}
                  placeholder="名前・スキルで検索"
                  className={`w-full bg-transparent text-[12px] ${c.textPrimary} outline-none placeholder:text-slate-400`}
                />
              </div>

              <div
                className={`rounded-2xl border border-dashed p-3 ${dragState?.fromStepId ? "border-cyan-400/60" : c.borderCard}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDropToPool();
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className={`text-[14px] font-semibold ${c.textPrimary}`}>未配置</div>
                    <div className={`text-[11px] ${c.textSecondary}`}>ドラッグして工程へ配置</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${c.bgSurface} ${c.textSecondary}`}>{freeWorkers.length}</span>
                </div>
                <div className="space-y-2">
                  {freeWorkers.length === 0 ? (
                    <div className={`rounded-xl ${c.bgSurface} px-3 py-6 text-center text-[12px] ${c.textMuted}`}>
                      未配置スタッフはいません
                    </div>
                  ) : freeWorkers.map((worker) => (
                    <StaffCard
                      key={worker.id}
                      worker={worker}
                      subtitle={workerAttendanceLabelMap.get(worker.id)}
                      themeColors={c}
                      qualificationMap={qualificationMap}
                      skillMap={skillMap}
                      compact
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", worker.id);
                        setDragState({ workerId: worker.id, fromStepId: null, fromSlotIndex: null });
                      }}
                      onDragEnd={() => setDragState(null)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className={`text-[14px] font-semibold ${c.textPrimary}`}>休憩・離席</div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${c.bgSurface} ${c.textSecondary}`}>{breakWorkers.length + absentWorkers.length}</span>
                </div>
                <div className="space-y-2">
                  {[...breakWorkers, ...absentWorkers].map((worker) => (
                    <StaffCard
                      key={worker.id}
                      worker={worker}
                      subtitle={workerAttendanceLabelMap.get(worker.id)}
                      themeColors={c}
                      qualificationMap={qualificationMap}
                      skillMap={skillMap}
                      compact
                      muted
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <div>
                <div className={`text-[14px] font-semibold ${c.textPrimary}`}>人員配置調整リスト</div>
                <div className={`text-[12px] ${c.textSecondary}`}>
                  {unsavedAdjustmentItems.length > 0 ? "保存すると最新の調整リストを確定します" : "保存済みの配置変更を表示します"}
                </div>
              </div>
              {savedAdjustmentItems.length === 0 ? (
                <div className={`rounded-2xl ${c.bgSurface} px-4 py-8 text-center text-[12px] ${c.textMuted}`}>
                  {unsavedAdjustmentItems.length > 0 ? `未保存の変更が ${unsavedAdjustmentItems.length} 件あります` : "保存済みの配置変更はありません"}
                </div>
              ) : savedAdjustmentItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedTime(item.effectiveTime);
                    setSelectedPanelId(item.panelId);
                  }}
                  className={`w-full rounded-2xl border px-4 py-3 text-left ${c.borderCard} ${c.bgSurface}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{item.workerName}</div>
                      <div className={`text-[11px] ${c.textSecondary}`}>変更時点 {item.effectiveTime}</div>
                    </div>
                    <div className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-500">
                      保存済み
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className={c.textMuted}>元作業</div>
                      <div className={`font-semibold ${c.textPrimary}`}>{item.previousAssignment}</div>
                    </div>
                    <div>
                      <div className={c.textMuted}>新作業</div>
                      <div className={`font-semibold ${c.textPrimary}`}>{item.nextAssignment}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

