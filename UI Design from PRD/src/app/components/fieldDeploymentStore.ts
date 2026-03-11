import {
  Box,
  ClipboardCheck,
  Layers,
  Package,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_SHIFT_END_MINUTES } from "./progressPlanStore";
import type { AreaMaster, ProcessMaster, Shipper, Site, WorkflowDefinition } from "./masterStore";

export const FIELD_DEPLOYMENT_STORAGE_PREFIX = "fluxview-field-deployment-v1";
const COLORS = ["cyan", "emerald", "violet", "amber", "blue", "rose", "orange", "teal", "indigo"] as const;

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type DeploymentWorkerStatus = "active" | "break" | "absent";
export type AssignmentSnapshot = Record<string, string[]>;

export interface DeploymentWorker {
  id: string;
  name: string;
  initials: string;
  color: string;
  qualificationIds: string[];
  skillIds: string[];
  status: DeploymentWorkerStatus;
  note?: string;
}

export interface DeploymentStep {
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
  uph: number;
  startTime: string;
  targetEndTime: string;
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
}

export interface DeploymentWorkflow {
  id: string;
  shipperId: string;
  shipperName: string;
  areaId: string;
  areaName: string;
  workflowName: string;
  color: string;
  steps: DeploymentStep[];
}

export const DEPLOYMENT_WORKERS: DeploymentWorker[] = [
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

export function buildFieldDeploymentStorageKey(siteId: string, dateKey?: string) {
  const scopeKey = siteId || "default";
  return dateKey
    ? `${FIELD_DEPLOYMENT_STORAGE_PREFIX}:${scopeKey}:${dateKey}`
    : `${FIELD_DEPLOYMENT_STORAGE_PREFIX}:${scopeKey}`;
}

function readJsonStorage<T>(storageKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function readFieldDeploymentSnapshots(siteId: string, dateKey?: string) {
  const dated = readJsonStorage<Record<string, AssignmentSnapshot>>(buildFieldDeploymentStorageKey(siteId, dateKey));
  if (dated) return dated;

  if (dateKey && dateKey === toDateInput(new Date())) {
    return readJsonStorage<Record<string, AssignmentSnapshot>>(buildFieldDeploymentStorageKey(siteId)) ?? {};
  }

  return {};
}

export function writeFieldDeploymentSnapshots(siteId: string, dateKey: string, snapshots: Record<string, AssignmentSnapshot>) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(snapshots);
  window.localStorage.setItem(buildFieldDeploymentStorageKey(siteId, dateKey), payload);

  if (dateKey === toDateInput(new Date())) {
    window.localStorage.setItem(buildFieldDeploymentStorageKey(siteId), payload);
  }
}

export function buildSiteScope(sites: Site[], selectedSiteId: string) {
  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  if (!selectedSite) {
    return {
      siteName: "拠点未選択",
      siteIds: selectedSiteId ? [selectedSiteId] : [],
      storageScopeKey: selectedSiteId || "default",
    };
  }

  const relatedSiteIds = sites
    .filter((site) => site.name === selectedSite.name)
    .map((site) => site.id);

  return {
    siteName: selectedSite.name,
    siteIds: relatedSiteIds.length > 0 ? relatedSiteIds : [selectedSite.id],
    storageScopeKey: `name:${encodeURIComponent(selectedSite.name)}`,
  };
}

export function parseTimeLabel(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function formatTimeLabel(totalMinutes: number) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function createTimeSlots(intervalMinutes: number, startMinutes = 0, endMinutes = 24 * 60) {
  const slots: string[] = [];
  for (let minute = startMinutes; minute <= endMinutes; minute += intervalMinutes) {
    slots.push(formatTimeLabel(minute));
  }
  return slots;
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

export function buildDeploymentWorkflows(
  workflows: WorkflowDefinition[],
  shippers: Shipper[],
  areas: AreaMaster[],
  processes: ProcessMaster[],
) {
  const shipperMap = new Map(shippers.map((item) => [item.id, item]));
  const areaMap = new Map(areas.map((item) => [item.id, item]));
  const processMap = new Map(processes.map((item) => [item.id, item]));

  return workflows
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "ja"))
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
        const startMinutes = Math.min(6 * 60 + stepIndex * 90 + (workflowIndex % 2) * 15, 20 * 60);
        const targetEndMinutes = DEFAULT_SHIFT_END_MINUTES;

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
          uph,
          startTime: formatTimeLabel(startMinutes),
          targetEndTime: formatTimeLabel(targetEndMinutes),
          requiredQualificationIds: step.requiredQualificationIds,
          requiredSkillIds: step.requiredSkillIds,
        } satisfies DeploymentStep;
      }),
    })) satisfies DeploymentWorkflow[];
}

function scoreWorker(worker: DeploymentWorker, step: DeploymentStep) {
  const qualificationScore = step.requiredQualificationIds.filter((id) => worker.qualificationIds.includes(id)).length * 3;
  const skillScore = step.requiredSkillIds.filter((id) => worker.skillIds.includes(id)).length * 2;
  return qualificationScore + skillScore;
}

export function cloneSnapshot(snapshot: AssignmentSnapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([stepId, slots]) => [stepId, [...slots]]));
}

export function materializeSnapshot(snapshot: AssignmentSnapshot, steps: DeploymentStep[]) {
  return Object.fromEntries(
    steps.map((step) => {
      const source = snapshot[step.id] ?? [];
      const slots = source.filter((workerId, index) => Boolean(workerId) && source.indexOf(workerId) === index);
      return [step.id, slots];
    }),
  ) as AssignmentSnapshot;
}

function findLastAssignedIndex(slots: string[]) {
  return slots.length - 1;
}

function firstFreeWorkerId(snapshot: AssignmentSnapshot, workers: DeploymentWorker[]) {
  const assigned = new Set(Object.values(snapshot).flat().filter(Boolean));
  return workers.find((worker) => worker.status === "active" && !assigned.has(worker.id))?.id ?? null;
}

export function buildBaseDeploymentSnapshot(steps: DeploymentStep[], workers: DeploymentWorker[]) {
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

export function createSeededDeploymentSnapshots(
  timeSlots: string[],
  steps: DeploymentStep[],
  workers: DeploymentWorker[],
  baseSnapshot: AssignmentSnapshot,
) {
  const snapshots: Record<string, AssignmentSnapshot> = {};
  const emptySnapshot = materializeSnapshot({}, steps);
  const baseMaterializedSnapshot = materializeSnapshot(baseSnapshot, steps);
  const earliestStartMinute = steps.length > 0 ? Math.min(...steps.map((step) => parseTimeLabel(step.startTime))) : 0;
  const rawSeedStartIndex = timeSlots.findIndex((timeLabel) => parseTimeLabel(timeLabel) > earliestStartMinute);
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
        const sourceSlots = [...(next[sourceStep.id] ?? [])];
        const targetSlots = [...(next[targetStep.id] ?? [])];
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
        const targetSlots = [...(next[targetStep.id] ?? [])];
        const freeWorkerId = firstFreeWorkerId(next, workers);
        if (freeWorkerId) {
          targetSlots.push(freeWorkerId);
          next[targetStep.id] = targetSlots;
        }
      }

      if (index % 5 === 0) {
        const sourceStep = steps[(index + 2) % steps.length];
        const sourceSlots = [...(next[sourceStep.id] ?? [])];
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
