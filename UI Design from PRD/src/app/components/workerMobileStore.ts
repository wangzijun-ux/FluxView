import {
  DEPLOYMENT_WORKERS,
  buildBaseDeploymentSnapshot,
  buildDeploymentWorkflows,
  buildFieldDeploymentStorageKey,
  createSeededDeploymentSnapshots,
  createTimeSlots,
  materializeSnapshot,
  parseTimeLabel,
  type AssignmentSnapshot,
  type DeploymentStep,
  type DeploymentWorkflow,
} from "./fieldDeploymentStore";
import type { AreaMaster, ProcessMaster, Shipper, WorkflowDefinition } from "./masterStore";

export const WORKER_SESSION_STORAGE_KEY = "fluxview-worker-session-v1";
export const WORKER_PROGRESS_STORAGE_KEY = "fluxview-worker-progress-v1";
export const WORKER_NOTIFICATION_STORAGE_KEY = "fluxview-worker-notifications-v1";

export type WorkerNotificationType = "announce" | "assignment" | "reminder";
export type WorkerTaskStatus = "pending" | "working" | "paused" | "completed";

type SnapshotLike = Record<string, Array<string | null>>;

export interface WorkerSession {
  workerId: string;
  siteId: string;
}

export interface WorkerNotificationRecord {
  id: string;
  siteId: string;
  workerId: string | null;
  type: WorkerNotificationType;
  title: string;
  message: string;
  createdAt: string;
  deliverAt: string;
  effectiveAt?: string;
}

export interface WorkerTaskRecord {
  id: string;
  workerId: string;
  workflowId: string;
  workflowName: string;
  shipperName: string;
  areaName: string;
  processName: string;
  color: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  order: number;
}

export interface WorkerTaskProgressEntry {
  status: WorkerTaskStatus;
  startedAt?: string;
  completedAt?: string;
  reportedQuantity?: number;
  lastReportedAt?: string;
}

export interface WorkerSiteDeploymentData {
  workflowViews: DeploymentWorkflow[];
  steps: DeploymentStep[];
  timeLabels: string[];
  snapshotsByTime: Record<string, AssignmentSnapshot>;
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeIso(date: Date, timeLabel: string) {
  const [hours, minutes] = timeLabel.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result.toISOString();
}

function formatTimeLabel(totalMinutes: number) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function sortTimeLabels(labels: string[]) {
  return [...labels].sort((left, right) => parseTimeLabel(left) - parseTimeLabel(right));
}

function detectSnapshotInterval(labels: string[]) {
  if (labels.length < 2) return 30;
  let minDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < labels.length; index += 1) {
    const delta = parseTimeLabel(labels[index]) - parseTimeLabel(labels[index - 1]);
    if (delta > 0) minDelta = Math.min(minDelta, delta);
  }
  return Number.isFinite(minDelta) ? minDelta : 30;
}

function normalizeNotifications(records: WorkerNotificationRecord[]) {
  return records
    .slice()
    .sort((left, right) => new Date(right.deliverAt).getTime() - new Date(left.deliverAt).getTime());
}

function findAssignedStepId(snapshot: SnapshotLike, workerId: string) {
  for (const [stepId, workerIds] of Object.entries(snapshot)) {
    if (workerIds.some((candidate) => candidate === workerId)) return stepId;
  }
  return null;
}

export function getDefaultWorkerSession(defaultSiteId: string, fallbackWorkerId: string) {
  const stored = readStorage<Partial<WorkerSession> | null>(WORKER_SESSION_STORAGE_KEY, null);
  if (stored?.workerId && stored?.siteId) {
    return { workerId: stored.workerId, siteId: stored.siteId } satisfies WorkerSession;
  }
  return { workerId: fallbackWorkerId, siteId: defaultSiteId } satisfies WorkerSession;
}

export function saveWorkerSession(session: WorkerSession) {
  writeStorage(WORKER_SESSION_STORAGE_KEY, session);
}

export function readWorkerProgress(dateKey: string, workerId: string) {
  const stored = readStorage<Record<string, Record<string, Record<string, WorkerTaskProgressEntry>>>>(
    WORKER_PROGRESS_STORAGE_KEY,
    {},
  );
  return stored[dateKey]?.[workerId] ?? {};
}

export function saveWorkerProgress(dateKey: string, workerId: string, progress: Record<string, WorkerTaskProgressEntry>) {
  const stored = readStorage<Record<string, Record<string, Record<string, WorkerTaskProgressEntry>>>>(
    WORKER_PROGRESS_STORAGE_KEY,
    {},
  );
  writeStorage(WORKER_PROGRESS_STORAGE_KEY, {
    ...stored,
    [dateKey]: {
      ...(stored[dateKey] ?? {}),
      [workerId]: progress,
    },
  });
}

export function readWorkerNotifications() {
  return normalizeNotifications(readStorage<WorkerNotificationRecord[]>(WORKER_NOTIFICATION_STORAGE_KEY, []));
}

export function saveWorkerNotifications(records: WorkerNotificationRecord[]) {
  writeStorage(WORKER_NOTIFICATION_STORAGE_KEY, normalizeNotifications(records));
}

export function buildWorkerSiteDeploymentData(
  siteId: string,
  workflows: WorkflowDefinition[],
  shippers: Shipper[],
  areas: AreaMaster[],
  processes: ProcessMaster[],
) {
  const workflowViews = buildDeploymentWorkflows(
    workflows.filter((workflow) => workflow.siteId === siteId),
    shippers,
    areas,
    processes,
  );
  const steps = workflowViews.flatMap((workflow) => workflow.steps);
  const storageKey = buildFieldDeploymentStorageKey(siteId);
  const storedSnapshots = readStorage<Record<string, AssignmentSnapshot>>(storageKey, {});
  const defaultTimeLabels = createTimeSlots(30);
  const timeLabels = (() => {
    const storedLabels = sortTimeLabels(Object.keys(storedSnapshots).filter((label) => /^\d{2}:\d{2}$/.test(label)));
    return storedLabels.length > 0 ? storedLabels : defaultTimeLabels;
  })();

  const baseSnapshot = buildBaseDeploymentSnapshot(steps, DEPLOYMENT_WORKERS);
  const seededSnapshots = createSeededDeploymentSnapshots(timeLabels, steps, DEPLOYMENT_WORKERS, baseSnapshot);
  const snapshotsByTime = Object.fromEntries(
    timeLabels.map((timeLabel) => [
      timeLabel,
      materializeSnapshot(storedSnapshots[timeLabel] ?? seededSnapshots[timeLabel] ?? {}, steps),
    ]),
  ) as Record<string, AssignmentSnapshot>;

  return {
    workflowViews,
    steps,
    timeLabels,
    snapshotsByTime,
  } satisfies WorkerSiteDeploymentData;
}

export function pickFallbackWorkerId(siteData: WorkerSiteDeploymentData) {
  const assignedWorkerIds = sortTimeLabels(siteData.timeLabels)
    .flatMap((timeLabel) => Object.values(siteData.snapshotsByTime[timeLabel] ?? {}).flat())
    .filter((workerId, index, array): workerId is string => Boolean(workerId) && array.indexOf(workerId) === index);

  return assignedWorkerIds[0] ?? DEPLOYMENT_WORKERS.find((worker) => worker.status === "active")?.id ?? "worker-1";
}

export function buildWorkerDayTasks(siteData: WorkerSiteDeploymentData, workerId: string) {
  const stepMap = new Map(siteData.steps.map((step) => [step.id, step]));
  const sortedLabels = sortTimeLabels(siteData.timeLabels);
  const intervalMinutes = detectSnapshotInterval(sortedLabels);

  const rawTasks: Array<Omit<WorkerTaskRecord, "id" | "durationMinutes" | "order">> = [];

  sortedLabels.forEach((timeLabel, index) => {
    const startMinutes = parseTimeLabel(timeLabel);
    const endMinutes = index < sortedLabels.length - 1
      ? parseTimeLabel(sortedLabels[index + 1])
      : startMinutes + intervalMinutes;
    const snapshot = siteData.snapshotsByTime[timeLabel] ?? {};

    Object.entries(snapshot).forEach(([stepId, workerIds]) => {
      if (!workerIds.includes(workerId)) return;
      const step = stepMap.get(stepId);
      if (!step) return;

      rawTasks.push({
        workerId,
        workflowId: step.workflowId,
        workflowName: step.workflowName,
        shipperName: step.shipperName,
        areaName: step.areaName,
        processName: step.processName,
        color: step.color,
        startTime: formatTimeLabel(startMinutes),
        endTime: formatTimeLabel(endMinutes),
        startMinutes,
        endMinutes,
      });
    });
  });

  rawTasks.sort((left, right) => left.startMinutes - right.startMinutes || left.processName.localeCompare(right.processName, "ja"));

  const merged: Array<Omit<WorkerTaskRecord, "id" | "durationMinutes" | "order">> = [];
  rawTasks.forEach((task) => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.workflowId === task.workflowId &&
      previous.processName === task.processName &&
      previous.areaName === task.areaName &&
      previous.endMinutes === task.startMinutes
    ) {
      previous.endMinutes = task.endMinutes;
      previous.endTime = task.endTime;
      return;
    }
    merged.push({ ...task });
  });

  return merged.map((task, index) => ({
    ...task,
    id: `${workerId}:${task.workflowId}:${task.processName}:${task.startTime}`,
    durationMinutes: task.endMinutes - task.startMinutes,
    order: index + 1,
  })) satisfies WorkerTaskRecord[];
}

export function buildDefaultAnnouncements(siteName: string, date = new Date()) {
  const dateKey = formatLocalDateKey(date);
  return [
    {
      id: `announce:${siteName}:${dateKey}`,
      siteId: "",
      workerId: null,
      type: "announce",
      title: "全体連絡",
      message: `${siteName} の本日の作業開始前に、安全確認と最新の配置通知を確認してください。`,
      createdAt: toDateTimeIso(date, "05:00"),
      deliverAt: toDateTimeIso(date, "05:00"),
    },
  ] satisfies WorkerNotificationRecord[];
}

export function getVisibleWorkerNotifications(params: {
  siteId: string;
  workerId: string;
  siteName: string;
  now?: Date;
}) {
  const { siteId, workerId, siteName, now = new Date() } = params;
  const current = now.getTime();

  return normalizeNotifications([
    ...buildDefaultAnnouncements(siteName, now).map((record) => ({ ...record, siteId })),
    ...readWorkerNotifications(),
  ]).filter((record) => {
    if (record.siteId !== siteId) return false;
    if (record.workerId && record.workerId !== workerId) return false;
    return new Date(record.deliverAt).getTime() <= current;
  });
}

export function pushAssignmentChangeNotifications(params: {
  siteId: string;
  effectiveTime: string;
  previousSnapshot: SnapshotLike;
  nextSnapshot: SnapshotLike;
  stepMap: Map<string, { areaName: string; processName: string }>;
  workerMap: Map<string, { id: string; name: string }>;
  now?: Date;
}) {
  const { siteId, effectiveTime, previousSnapshot, nextSnapshot, stepMap, workerMap, now = new Date() } = params;
  const changedWorkerIds = Array.from(
    new Set(
      [
        ...Object.values(previousSnapshot).flat(),
        ...Object.values(nextSnapshot).flat(),
      ].filter((workerId): workerId is string => Boolean(workerId)),
    ),
  ).filter((workerId) => findAssignedStepId(previousSnapshot, workerId) !== findAssignedStepId(nextSnapshot, workerId));

  if (changedWorkerIds.length === 0) return;

  const reminderMinutes = Math.max(0, parseTimeLabel(effectiveTime) - 5);
  const reminderTime = formatTimeLabel(reminderMinutes);
  const existing = readWorkerNotifications().filter(
    (record) => !(record.siteId === siteId && record.effectiveAt === effectiveTime && record.workerId && changedWorkerIds.includes(record.workerId)),
  );

  const created = now.toISOString();
  const generated = changedWorkerIds.flatMap((workerId) => {
    const worker = workerMap.get(workerId);
    if (!worker) return [];

    const previousStep = stepMap.get(findAssignedStepId(previousSnapshot, workerId) ?? "");
    const nextStepId = findAssignedStepId(nextSnapshot, workerId);
    const nextStep = stepMap.get(nextStepId ?? "");

    const changeMessage = nextStep
      ? `${effectiveTime} から ${nextStep.areaName} / ${nextStep.processName} を担当してください。`
      : `${effectiveTime} から現場待機に変更されます。`;
    const moveDetail = previousStep && nextStep
      ? `${previousStep.areaName} / ${previousStep.processName} から ${nextStep.areaName} / ${nextStep.processName} へ変更されます。`
      : changeMessage;
    const reminderMessage = nextStep
      ? `5分後の ${effectiveTime} に ${nextStep.areaName} / ${nextStep.processName} へ移動してください。`
      : `5分後の ${effectiveTime} から現場待機に切り替わります。`;

    return [
      {
        id: `assignment:${siteId}:${workerId}:${effectiveTime}`,
        siteId,
        workerId,
        type: "assignment",
        title: "配置変更のお知らせ",
        message: moveDetail,
        createdAt: created,
        deliverAt: created,
        effectiveAt: effectiveTime,
      },
      {
        id: `reminder:${siteId}:${workerId}:${effectiveTime}`,
        siteId,
        workerId,
        type: "reminder",
        title: "まもなく配置変更",
        message: reminderMessage,
        createdAt: created,
        deliverAt: toDateTimeIso(now, reminderTime),
        effectiveAt: effectiveTime,
      },
    ] satisfies WorkerNotificationRecord[];
  });

  saveWorkerNotifications([...existing, ...generated]);
}

export function getTodayKey(date = new Date()) {
  return formatLocalDateKey(date);
}
