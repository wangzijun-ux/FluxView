import {
  DEPLOYMENT_WORKERS,
  buildBaseDeploymentSnapshot,
  buildDeploymentWorkflows,
  buildSiteScope,
  createSeededDeploymentSnapshots,
  createTimeSlots,
  materializeSnapshot,
  parseTimeLabel,
  readFieldDeploymentSnapshots,
  type AssignmentSnapshot,
  type DeploymentStep,
  type DeploymentWorkflow,
} from "./fieldDeploymentStore";
import { buildStepPlanDefaults, readProgressPlanStore, resolveStepPlanValues } from "./progressPlanStore";
import type { AreaMaster, ProcessMaster, Shipper, Site, WorkflowDefinition } from "./masterStore";

export const WORKER_SESSION_STORAGE_KEY = "fluxview-worker-session-v1";
export const WORKER_AUTH_STORAGE_KEY = "fluxview-worker-auth-v1";
export const WORKER_PROGRESS_STORAGE_KEY = "fluxview-worker-progress-v1";
export const WORKER_NOTIFICATION_STORAGE_KEY = "fluxview-worker-notifications-v1";

export type WorkerNotificationType = "announce" | "assignment" | "reminder";
export type WorkerTaskStatus = "pending" | "working" | "paused" | "completed";

type SnapshotLike = Record<string, Array<string | null>>;

export interface WorkerSession {
  workerId: string;
  siteId: string;
}

export interface WorkerAuthSession {
  userId: string;
  userName: string;
  userEmail: string;
  workerId: string;
  siteId: string;
  loggedInAt: string;
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
  stepId: string;
  workerId: string;
  siteId: string;
  siteName: string;
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
  pauseStartedAt?: string;
  totalPausedMinutes?: number;
}

export interface WorkerSubmissionRecord {
  id: string;
  dateKey: string;
  siteId: string;
  siteName: string;
  workerId: string;
  workerName: string;
  stepId: string;
  workflowId: string;
  workflowName: string;
  shipperName: string;
  areaName: string;
  processName: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  startedAt?: string;
  completedAt?: string;
  lastReportedAt?: string;
  reportedQuantity: number;
  pausedMinutes: number;
  status: WorkerTaskStatus;
}

export interface WorkerSiteDeploymentData {
  siteId: string;
  siteName: string;
  workflowViews: DeploymentWorkflow[];
  steps: DeploymentStep[];
  timeLabels: string[];
  snapshotsByTime: Record<string, AssignmentSnapshot>;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function toDateTimeIsoFromMinutes(date: Date, totalMinutes: number, seconds = 0) {
  const safeMinutes = clampNumber(Math.floor(totalMinutes), 0, 24 * 60 - 1);
  const safeSeconds = clampNumber(Math.floor(seconds), 0, 59);
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setMinutes(safeMinutes, safeSeconds, 0);
  return result.toISOString();
}

function formatTimeLabel(totalMinutes: number) {
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function roundToNearestTen(value: number) {
  return Math.round(value / 10) * 10;
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

export function readWorkerAuthSession() {
  return readStorage<WorkerAuthSession | null>(WORKER_AUTH_STORAGE_KEY, null);
}

export function saveWorkerAuthSession(session: WorkerAuthSession) {
  writeStorage(WORKER_AUTH_STORAGE_KEY, session);
}

export function clearWorkerAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WORKER_AUTH_STORAGE_KEY);
}

export function resolveDemoWorkerId(userId: string) {
  const candidateWorkers = DEPLOYMENT_WORKERS.filter((worker) => worker.status === "active");
  const workers = candidateWorkers.length > 0 ? candidateWorkers : DEPLOYMENT_WORKERS;
  const fallbackWorkerId = workers[0]?.id ?? "worker-1";
  if (!userId) return fallbackWorkerId;
  return workers[hashString(userId) % workers.length]?.id ?? fallbackWorkerId;
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
  selectedSiteId: string,
  sites: Site[],
  workflows: WorkflowDefinition[],
  shippers: Shipper[],
  areas: AreaMaster[],
  processes: ProcessMaster[],
) {
  const siteScope = buildSiteScope(sites, selectedSiteId);
  const workflowViews = buildDeploymentWorkflows(
    workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)),
    shippers,
    areas,
    processes,
  );
  const steps = workflowViews.flatMap((workflow) => workflow.steps);
  const storedSnapshots = readFieldDeploymentSnapshots(siteScope.storageScopeKey, toDateInput(new Date()));
  const defaultTimeLabels = createTimeSlots(30);
  const timeLabels = (() => {
    const storedLabels = sortTimeLabels(Object.keys(storedSnapshots).filter((label) => /^\d{2}:\d{2}$/.test(label)));
    return sortTimeLabels(Array.from(new Set([...defaultTimeLabels, ...storedLabels])));
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
    siteId: selectedSiteId,
    siteName: siteScope.siteName,
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
      : Math.min(24 * 60, startMinutes + intervalMinutes);
    if (endMinutes <= startMinutes) return;
    const snapshot = siteData.snapshotsByTime[timeLabel] ?? {};

    Object.entries(snapshot).forEach(([stepId, workerIds]) => {
      if (!workerIds.includes(workerId)) return;
      const step = stepMap.get(stepId);
      if (!step) return;
      const stepStartMinutes = parseTimeLabel(step.startTime);
      const stepEndMinutes = parseTimeLabel(step.targetEndTime);
      const clippedStartMinutes = Math.max(startMinutes, stepStartMinutes);
      const clippedEndMinutes = Math.min(endMinutes, stepEndMinutes);
      if (clippedEndMinutes <= clippedStartMinutes) return;

      rawTasks.push({
        stepId,
        workerId,
        siteId: siteData.siteId,
        siteName: siteData.siteName,
        workflowId: step.workflowId,
        workflowName: step.workflowName,
        shipperName: step.shipperName,
        areaName: step.areaName,
        processName: step.processName,
        color: step.color,
        startTime: formatTimeLabel(clippedStartMinutes),
        endTime: formatTimeLabel(clippedEndMinutes),
        startMinutes: clippedStartMinutes,
        endMinutes: clippedEndMinutes,
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

export function getPausedMinutes(entry: WorkerTaskProgressEntry, now = new Date()) {
  const baseMinutes = entry.totalPausedMinutes ?? 0;
  if (!entry.pauseStartedAt || entry.status !== "paused") return baseMinutes;
  const pauseStarted = new Date(entry.pauseStartedAt).getTime();
  if (Number.isNaN(pauseStarted)) return baseMinutes;
  return baseMinutes + Math.max(0, Math.round((now.getTime() - pauseStarted) / 60000));
}

export function buildWorkerSubmissionRecords(params: {
  dateKey: string;
  selectedSiteId: string;
  sites: Site[];
  workflows: WorkflowDefinition[];
  shippers: Shipper[];
  areas: AreaMaster[];
  processes: ProcessMaster[];
  now?: Date;
}) {
  const { dateKey, selectedSiteId, sites, workflows, shippers, areas, processes, now = new Date() } = params;
  const siteData = buildWorkerSiteDeploymentData(selectedSiteId, sites, workflows, shippers, areas, processes);
  const workerMap = new Map(DEPLOYMENT_WORKERS.map((worker) => [worker.id, worker]));

  return DEPLOYMENT_WORKERS.flatMap((worker) => {
    const progressByTaskId = readWorkerProgress(dateKey, worker.id);
    const tasks = buildWorkerDayTasks(siteData, worker.id);

    return tasks.flatMap((task) => {
      const progress = progressByTaskId[task.id];
      if (!progress) return [];

      const hasActivity =
        Boolean(progress.startedAt) ||
        Boolean(progress.completedAt) ||
        Boolean(progress.lastReportedAt) ||
        Boolean(progress.pauseStartedAt) ||
        (progress.reportedQuantity ?? 0) > 0 ||
        progress.status !== "pending";

      if (!hasActivity) return [];

      return {
        id: `${dateKey}:${task.id}`,
        dateKey,
        siteId: task.siteId,
        siteName: task.siteName,
        workerId: worker.id,
        workerName: workerMap.get(worker.id)?.name ?? worker.id,
        stepId: task.stepId,
        workflowId: task.workflowId,
        workflowName: task.workflowName,
        shipperName: task.shipperName,
        areaName: task.areaName,
        processName: task.processName,
        scheduledStartTime: task.startTime,
        scheduledEndTime: task.endTime,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        lastReportedAt: progress.lastReportedAt,
        reportedQuantity: progress.reportedQuantity ?? 0,
        pausedMinutes: getPausedMinutes(progress, now),
        status: progress.status,
      } satisfies WorkerSubmissionRecord;
    });
  }).sort(
    (left, right) =>
      (left.startedAt ? new Date(left.startedAt).getTime() : 0) - (right.startedAt ? new Date(right.startedAt).getTime() : 0) ||
      left.workerName.localeCompare(right.workerName, "ja") ||
      left.processName.localeCompare(right.processName, "ja"),
  );
}

export function buildReportedQuantityMap(records: WorkerSubmissionRecord[]) {
  const map = new Map<string, number>();
  records.forEach((record) => {
    map.set(record.stepId, (map.get(record.stepId) ?? 0) + record.reportedQuantity);
  });
  return map;
}

function buildStepPlanMap(siteData: WorkerSiteDeploymentData, dateKey: string) {
  const dayPlans = readProgressPlanStore()[dateKey] ?? {};
  const stepPlanMap = new Map<string, { planned: number; startTime: string; targetEndTime: string }>();

  siteData.workflowViews.forEach((workflow, workflowIndex) => {
    workflow.steps.forEach((step, stepIndex) => {
      const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph);
      const resolved = resolveStepPlanValues(dayPlans, step.id, {
        planned: defaults.planned,
        startTime: step.startTime,
        targetEndTime: step.targetEndTime,
      });
      stepPlanMap.set(step.id, resolved);
    });
  });

  return stepPlanMap;
}

export function seedDemoWorkerSubmissionData(params: {
  selectedSiteId: string;
  sites: Site[];
  workflows: WorkflowDefinition[];
  shippers: Shipper[];
  areas: AreaMaster[];
  processes: ProcessMaster[];
  date?: Date;
}) {
  const { selectedSiteId, sites, workflows, shippers, areas, processes, date = new Date() } = params;
  const dateKey = formatLocalDateKey(date);
  const siteData = buildWorkerSiteDeploymentData(selectedSiteId, sites, workflows, shippers, areas, processes);
  const stepMap = new Map(siteData.steps.map((step) => [step.id, step]));
  const stepPlanMap = buildStepPlanMap(siteData, dateKey);

  if (siteData.steps.length === 0) {
    return { dateKey, workerCount: 0, taskCount: 0, recordCount: 0 };
  }

  const current = new Date();
  const nowMinutes = clampNumber(current.getHours() * 60 + current.getMinutes(), 20, 23 * 60 + 55);
  const stored = readStorage<Record<string, Record<string, Record<string, WorkerTaskProgressEntry>>>>(
    WORKER_PROGRESS_STORAGE_KEY,
    {},
  );
  const nextDateStore = { ...(stored[dateKey] ?? {}) };

  let workerCount = 0;
  let taskCount = 0;
  const currentSiteTaskIds = new Set<string>();

  type SeedTask = {
    workerId: string;
    task: WorkerTaskRecord;
    step: DeploymentStep;
    startedMinutes: number;
    finishedMinutes: number;
    potentialQuantity: number;
    seed: number;
    isInProgress: boolean;
    isPaused: boolean;
  };

  const generatedByWorker = new Map<string, Record<string, WorkerTaskProgressEntry>>();
  const tasksByStep = new Map<string, SeedTask[]>();

  DEPLOYMENT_WORKERS.forEach((worker) => {
    const tasks = buildWorkerDayTasks(siteData, worker.id);
    if (tasks.length === 0) return;

    const siteTaskIds = new Set(tasks.map((task) => task.id));
    const preservedEntries = Object.fromEntries(
      Object.entries(nextDateStore[worker.id] ?? {}).filter(([taskId]) => !siteTaskIds.has(taskId)),
    );

    generatedByWorker.set(worker.id, preservedEntries);

    tasks.forEach((task) => {
      const step = stepMap.get(task.stepId);
      if (!step) return;

      const startedMinutes = task.startMinutes;
      const finishedMinutes = Math.min(task.endMinutes, nowMinutes);
      if (finishedMinutes <= startedMinutes) return;

      const seed = hashString(`${dateKey}:${worker.id}:${task.id}`);
      const productivityFactor = 0.84 + ((seed % 11) / 100);
      const potentialQuantity = Math.max(
        0,
        Math.round((((finishedMinutes - startedMinutes) / 60) * Math.max(step.uph, 1)) * productivityFactor),
      );
      const isInProgress = nowMinutes > task.startMinutes && nowMinutes < task.endMinutes;
      const isPaused = isInProgress && (worker.status === "break" || seed % 7 === 0);

      const stepTasks = tasksByStep.get(task.stepId) ?? [];
      stepTasks.push({
        workerId: worker.id,
        task,
        step,
        startedMinutes,
        finishedMinutes,
        potentialQuantity,
        seed,
        isInProgress,
        isPaused,
      });
      tasksByStep.set(task.stepId, stepTasks);
      currentSiteTaskIds.add(task.id);
    });
  });

  tasksByStep.forEach((stepTasks, stepId) => {
    const step = stepMap.get(stepId);
    if (!step) return;

    const planValues = stepPlanMap.get(stepId) ?? {
      planned: roundToNearestTen(step.headcount * step.uph * Math.max((parseTimeLabel(step.targetEndTime) - parseTimeLabel(step.startTime)) / 60, 1)),
      startTime: step.startTime,
      targetEndTime: step.targetEndTime,
    };
    const scheduleStartMinutes = parseTimeLabel(planValues.startTime);
    const scheduleEndMinutes = Math.max(scheduleStartMinutes + 30, parseTimeLabel(planValues.targetEndTime));
    const scheduleProgress = clampNumber((nowMinutes - scheduleStartMinutes) / Math.max(scheduleEndMinutes - scheduleStartMinutes, 30), 0, 1);
    const plannedUntilNow = planValues.planned * scheduleProgress;
    const capacityUntilNow = stepTasks.reduce((sum, task) => sum + task.potentialQuantity, 0);
    const targetActual = Math.max(
      0,
      Math.min(
        planValues.planned,
        roundToNearestTen(Math.min(capacityUntilNow, plannedUntilNow * (0.94 + ((hashString(`${dateKey}:${stepId}`) % 7) / 100)))),
      ),
    );

    if (targetActual <= 0) return;

    const totalPotential = Math.max(stepTasks.reduce((sum, task) => sum + task.potentialQuantity, 0), 1);
    let distributed = 0;

    stepTasks
      .slice()
      .sort((left, right) => left.startedMinutes - right.startedMinutes || left.workerId.localeCompare(right.workerId, "ja"))
      .forEach((taskSeed, index, array) => {
        const generatedEntries = generatedByWorker.get(taskSeed.workerId) ?? {};
        const isLast = index === array.length - 1;
        const baseQuantity = isLast
          ? Math.max(0, targetActual - distributed)
          : Math.max(0, Math.round((targetActual * taskSeed.potentialQuantity) / totalPotential));
        const reportedQuantity = Math.min(
          Math.max(0, baseQuantity),
          Math.max(taskSeed.potentialQuantity, isLast ? targetActual - distributed : baseQuantity),
        );
        distributed += reportedQuantity;

        const startSeconds = taskSeed.seed % 60;
        const endSeconds = (taskSeed.seed * 7) % 60;
        const startedAt = toDateTimeIsoFromMinutes(date, taskSeed.startedMinutes, startSeconds);

        generatedEntries[taskSeed.task.id] = taskSeed.isInProgress
          ? {
              status: taskSeed.isPaused ? "paused" : "working",
              startedAt,
              lastReportedAt: toDateTimeIsoFromMinutes(
                date,
                clampNumber(nowMinutes - (taskSeed.isPaused ? 11 : 4), taskSeed.startedMinutes + 3, nowMinutes - 1),
                endSeconds,
              ),
              reportedQuantity,
              totalPausedMinutes: taskSeed.isPaused ? 5 + (taskSeed.seed % 14) : 0,
              pauseStartedAt: taskSeed.isPaused
                ? toDateTimeIsoFromMinutes(date, clampNumber(nowMinutes - 9, taskSeed.startedMinutes + 4, nowMinutes - 1))
                : undefined,
            }
          : {
              status: "completed",
              startedAt,
              completedAt: toDateTimeIsoFromMinutes(date, taskSeed.finishedMinutes, endSeconds),
              lastReportedAt: toDateTimeIsoFromMinutes(
                date,
                clampNumber(taskSeed.finishedMinutes - 2, taskSeed.startedMinutes + 2, taskSeed.finishedMinutes),
                (endSeconds + 11) % 60,
              ),
              reportedQuantity,
              totalPausedMinutes: taskSeed.seed % 6 === 0 ? 3 + (taskSeed.seed % 10) : 0,
            };

        generatedByWorker.set(taskSeed.workerId, generatedEntries);
      });
  });

  generatedByWorker.forEach((generatedEntries, workerId) => {
    const generatedTaskIds = Object.keys(generatedEntries);
    const activityCount = generatedTaskIds.filter((taskId) => {
      if (!currentSiteTaskIds.has(taskId)) return false;
      const entry = generatedEntries[taskId];
      return Boolean(entry.startedAt) || Boolean(entry.completedAt) || Boolean(entry.lastReportedAt) || (entry.reportedQuantity ?? 0) > 0;
    }).length;

    if (activityCount === 0) return;

    workerCount += 1;
    taskCount += activityCount;
    nextDateStore[workerId] = generatedEntries;
  });

  writeStorage(WORKER_PROGRESS_STORAGE_KEY, {
    ...stored,
    [dateKey]: nextDateStore,
  });

  const recordCount = buildWorkerSubmissionRecords({
    dateKey,
    selectedSiteId,
    sites,
    workflows,
    shippers,
    areas,
    processes,
    now: current,
  }).length;

  return { dateKey, workerCount, taskCount, recordCount };
}

export function ensureDemoWorkerSubmissionData(params: {
  sites: Site[];
  workflows: WorkflowDefinition[];
  shippers: Shipper[];
  areas: AreaMaster[];
  processes: ProcessMaster[];
  date?: Date;
}) {
  const { sites, workflows, shippers, areas, processes, date = new Date() } = params;
  const dateKey = formatLocalDateKey(date);
  const targetSiteIds = Array.from(new Set(workflows.map((workflow) => workflow.siteId).filter(Boolean)));

  let seededSiteCount = 0;
  let workerCount = 0;
  let taskCount = 0;
  let recordCount = 0;

  targetSiteIds.forEach((siteId) => {
    const existingRecords = buildWorkerSubmissionRecords({
      dateKey,
      selectedSiteId: siteId,
      sites,
      workflows,
      shippers,
      areas,
      processes,
      now: date,
    });

    if (existingRecords.some((record) => (record.reportedQuantity ?? 0) > 0)) {
      return;
    }

    const seeded = seedDemoWorkerSubmissionData({
      selectedSiteId: siteId,
      sites,
      workflows,
      shippers,
      areas,
      processes,
      date,
    });

    if (seeded.recordCount <= 0) return;

    seededSiteCount += 1;
    workerCount += seeded.workerCount;
    taskCount += seeded.taskCount;
    recordCount += seeded.recordCount;
  });

  return { dateKey, seededSiteCount, workerCount, taskCount, recordCount };
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
