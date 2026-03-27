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
import type { ProcessMaster, Shipper, Site, WorkflowDefinition } from "./masterStore";
import {
  readDeploymentWorkers as readUnifiedDeploymentWorkers,
  type DeploymentWorkerStatus,
} from "./workforceStore";

export const FIELD_DEPLOYMENT_STORAGE_PREFIX = "fluxview-field-deployment-v1";
export const FIELD_DEPLOYMENT_WORKER_NOTES_STORAGE_KEY = "fluxview-field-worker-notes-v1";
const COLORS = ["cyan", "emerald", "violet", "amber", "blue", "rose", "orange", "teal", "indigo"] as const;

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pickColor(index: number) {
  return COLORS[index % COLORS.length];
}

export function parseTimeLabel(timeLabel: string) {
  const [hours, minutes] = timeLabel.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function formatTimeLabel(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function createTimeSlots(intervalMinutes: number) {
  const safeInterval = Math.max(5, intervalMinutes);
  const slots: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += safeInterval) {
    slots.push(formatTimeLabel(minutes));
  }
  return slots;
}

export type AssignmentSnapshot = Record<string, string[]>;

export interface DeploymentWorker {
  id: string;
  userId?: string;
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
  sourceStepId: string;
  previousStepId?: string;
  workflowId: string;
  workflowName: string;
  shipperId: string;
  shipperName: string;
  siteId: string;
  siteName: string;
  processId: string;
  processName: string;
  description: string;
  color: string;
  icon: LucideIcon;
  headcount: number;
  uph: number;
  startTime: string;
  targetEndTime: string;
  layoutAreaIds: string[];
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
  manual: string;
  caution: string;
}

export interface DeploymentWorkflow {
  id: string;
  shipperId: string;
  shipperName: string;
  siteId: string;
  siteName: string;
  workflowName: string;
  color: string;
  steps: DeploymentStep[];
}

export const DEPLOYMENT_WORKERS: DeploymentWorker[] = readUnifiedDeploymentWorkers();

export function readDeploymentWorkers() {
  return readUnifiedDeploymentWorkers();
}

export function writeDeploymentWorkerNotes(notes: Record<string, string>) {
  if (typeof window === "undefined") return;

  const normalizedNotes = Object.fromEntries(
    readUnifiedDeploymentWorkers().map((worker) => [
      worker.id,
      typeof notes[worker.id] === "string" ? notes[worker.id].trim() : (worker.note ?? ""),
    ]),
  );

  window.localStorage.setItem(
    FIELD_DEPLOYMENT_WORKER_NOTES_STORAGE_KEY,
    JSON.stringify(normalizedNotes),
  );
}

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

  return {
    siteName: selectedSite.name,
    siteIds: [selectedSite.id],
    storageScopeKey: selectedSite.id,
  };
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
      return processName.toLowerCase().includes("inspect") ? ClipboardCheck : Layers;
  }
}

export function buildDeploymentWorkflows(
  workflows: WorkflowDefinition[],
  shippers: Shipper[],
  sites: Site[],
  processes: ProcessMaster[],
) {
  const shipperMap = new Map(shippers.map((item) => [item.id, item]));
  const siteMap = new Map(sites.map((item) => [item.id, item]));
  const processMap = new Map(processes.map((item) => [item.id, item]));

  return workflows
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "ja"))
    .map((workflow, workflowIndex) => ({
      id: workflow.id,
      shipperId: workflow.shipperId,
      shipperName: shipperMap.get(workflow.shipperId)?.name ?? "未設定荷主",
      siteId: workflow.siteId,
      siteName: siteMap.get(workflow.siteId)?.name ?? "未設定拠点",
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
          sourceStepId: step.id,
          previousStepId: step.previousStepId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          shipperId: workflow.shipperId,
          shipperName: shipperMap.get(workflow.shipperId)?.name ?? "未設定荷主",
          siteId: workflow.siteId,
          siteName: siteMap.get(workflow.siteId)?.name ?? "未設定拠点",
          processId: step.processId,
          processName: process?.name ?? `工程 ${stepIndex + 1}`,
          description: process?.description ?? "工程説明未設定",
          color: pickColor(workflowIndex + stepIndex),
          icon: iconForProcess(step.processId, process?.name ?? ""),
          headcount,
          uph,
          startTime: formatTimeLabel(startMinutes),
          targetEndTime: formatTimeLabel(targetEndMinutes),
          layoutAreaIds: step.layoutAreaIds ?? [],
          requiredQualificationIds: step.requiredQualificationIds,
          requiredSkillIds: step.requiredSkillIds,
          manual: step.manual ?? "",
          caution: step.caution ?? "",
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
