import {
  buildBaseDeploymentSnapshot,
  buildDeploymentWorkflows,
  buildSiteScope,
  createSeededDeploymentSnapshots,
  createTimeSlots,
  materializeSnapshot,
  parseTimeLabel,
  readDeploymentWorkers,
  readFieldDeploymentSnapshots,
  type AssignmentSnapshot,
  type DeploymentStep,
  type DeploymentWorkflow,
} from "./fieldDeploymentStore";
import { buildStepPlanDefaults, readProgressPlanStore, resolveStepPlanValues } from "./progressPlanStore";
import type { ProcessMaster, Shipper, Site, WorkflowDefinition } from "./masterStore";
import { resolveDeploymentWorkerIdForUser } from "./workforceStore";

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
  processName: string;
  color: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  order: number;
}

export interface WorkerTaskSubmissionLog {
  id: string;
  quantity: number;
  submittedAt: string;
}

export interface WorkerTaskProgressEntry {
  status: WorkerTaskStatus;
  startedAt?: string;
  completedAt?: string;
  draftQuantity?: number;
  reportedQuantity?: number;
  lastReportedAt?: string;
  pauseStartedAt?: string;
  totalPausedMinutes?: number;
  submissionLogs?: WorkerTaskSubmissionLog[];
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

function findAssignedStepIds(snapshot: SnapshotLike, workerId: string) {
  return Object.entries(snapshot)
    .filter(([, workerIds]) => workerIds.some((candidate) => candidate === workerId))
    .map(([stepId]) => stepId)
    .sort((left, right) => left.localeCompare(right, "ja"));
}

function normalizeWorkerTaskSubmissionLog(
  log: Partial<WorkerTaskSubmissionLog>,
  fallbackId: string,
  index: number,
) {
  const quantity = Math.max(0, Number(log.quantity ?? 0));
  const submittedAt = typeof log.submittedAt === "string" ? log.submittedAt : "";
  if (quantity <= 0 || !submittedAt) return null;

  return {
    id: typeof log.id === "string" && log.id ? log.id : `${fallbackId}:${index + 1}`,
    quantity,
    submittedAt,
  } satisfies WorkerTaskSubmissionLog;
}

export function getWorkerTaskSubmissionLogs(entry?: WorkerTaskProgressEntry) {
  if (!entry) return [] satisfies WorkerTaskSubmissionLog[];

  const explicitLogs = Array.isArray(entry.submissionLogs)
    ? entry.submissionLogs
        .map((log, index) => normalizeWorkerTaskSubmissionLog(log, "submission", index))
        .filter((log): log is WorkerTaskSubmissionLog => Boolean(log))
        .sort((left, right) => new Date(left.submittedAt).getTime() - new Date(right.submittedAt).getTime())
    : [];

  if (explicitLogs.length > 0) return explicitLogs;

  const legacyQuantity = Math.max(0, Number(entry.reportedQuantity ?? 0));
  const legacySubmittedAt = entry.lastReportedAt ?? entry.completedAt ?? entry.startedAt;
  if (legacyQuantity <= 0 || !legacySubmittedAt) return [] satisfies WorkerTaskSubmissionLog[];

  return [
    {
      id: `legacy:${legacySubmittedAt}`,
      quantity: legacyQuantity,
      submittedAt: legacySubmittedAt,
    },
  ] satisfies WorkerTaskSubmissionLog[];
}

export function getWorkerTaskReportedQuantity(entry?: WorkerTaskProgressEntry) {
  const logs = getWorkerTaskSubmissionLogs(entry);
  if (logs.length > 0) {
    return logs.reduce((sum, log) => sum + log.quantity, 0);
  }
  return Math.max(0, Number(entry?.reportedQuantity ?? 0));
}

export function getWorkerTaskLastReportedAt(entry?: WorkerTaskProgressEntry) {
  const logs = getWorkerTaskSubmissionLogs(entry);
  if (logs.length > 0) return logs[logs.length - 1]?.submittedAt;
  return entry?.lastReportedAt;
}

function normalizeWorkerTaskProgressEntry(entry?: WorkerTaskProgressEntry) {
  if (!entry) return { status: "pending" as const } satisfies WorkerTaskProgressEntry;

  const submissionLogs = getWorkerTaskSubmissionLogs(entry);
  const reportedQuantity = getWorkerTaskReportedQuantity({ ...entry, submissionLogs });
  const lastReportedAt = getWorkerTaskLastReportedAt({ ...entry, submissionLogs });

  return {
    ...entry,
    draftQuantity: Math.max(0, Number(entry.draftQuantity ?? 0)),
    reportedQuantity,
    lastReportedAt,
    submissionLogs,
  } satisfies WorkerTaskProgressEntry;
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
  if (userId) {
    return resolveDeploymentWorkerIdForUser(userId);
  }

  return readDeploymentWorkers().find((worker) => worker.status === "active")?.id ?? "worker-1";
}

export function readWorkerProgress(dateKey: string, workerId: string) {
  const stored = readStorage<Record<string, Record<string, Record<string, WorkerTaskProgressEntry>>>>(
    WORKER_PROGRESS_STORAGE_KEY,
    {},
  );
  const progress = stored[dateKey]?.[workerId] ?? {};
  return Object.fromEntries(
    Object.entries(progress).map(([taskId, entry]) => [taskId, normalizeWorkerTaskProgressEntry(entry)]),
  ) as Record<string, WorkerTaskProgressEntry>;
}

export function saveWorkerProgress(dateKey: string, workerId: string, progress: Record<string, WorkerTaskProgressEntry>) {
  const stored = readStorage<Record<string, Record<string, Record<string, WorkerTaskProgressEntry>>>>(
    WORKER_PROGRESS_STORAGE_KEY,
    {},
  );
  const normalizedProgress = Object.fromEntries(
    Object.entries(progress).map(([taskId, entry]) => [taskId, normalizeWorkerTaskProgressEntry(entry)]),
  ) as Record<string, WorkerTaskProgressEntry>;
  writeStorage(WORKER_PROGRESS_STORAGE_KEY, {
    ...stored,
    [dateKey]: {
      ...(stored[dateKey] ?? {}),
      [workerId]: normalizedProgress,
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
  processes: ProcessMaster[],
) {
  const siteScope = buildSiteScope(sites, selectedSiteId);
  const workflowViews = buildDeploymentWorkflows(
    workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)),
    shippers,
    sites,
    processes,
  );
  const steps = workflowViews.flatMap((workflow) => workflow.steps);
  const storedSnapshots = readFieldDeploymentSnapshots(siteScope.storageScopeKey, toDateInput(new Date()));
  const defaultTimeLabels = createTimeSlots(30);
  const timeLabels = (() => {
    const storedLabels = sortTimeLabels(Object.keys(storedSnapshots).filter((label) => /^\d{2}:\d{2}$/.test(label)));
    return sortTimeLabels(Array.from(new Set([...defaultTimeLabels, ...storedLabels])));
  })();

  const deploymentWorkers = readDeploymentWorkers();
  const baseSnapshot = buildBaseDeploymentSnapshot(steps, deploymentWorkers);
  const seededSnapshots = createSeededDeploymentSnapshots(timeLabels, steps, deploymentWorkers, baseSnapshot);
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

  return assignedWorkerIds[0] ?? readDeploymentWorkers().find((worker) => worker.status === "active")?.id ?? "worker-1";
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
        processName: step.processName,
        color: step.color,
        startTime: formatTimeLabel(clippedStartMinutes),
        endTime: formatTimeLabel(clippedEndMinutes),
        startMinutes: clippedStartMinutes,
        endMinutes: clippedEndMinutes,
      });
    });
  });

  rawTasks.sort(
    (left, right) =>
      left.startMinutes - right.startMinutes ||
      left.shipperName.localeCompare(right.shipperName, "ja") ||
      left.processName.localeCompare(right.processName, "ja"),
  );

  const merged: Array<Omit<WorkerTaskRecord, "id" | "durationMinutes" | "order">> = [];
  rawTasks.forEach((task) => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.stepId === task.stepId &&
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
    id: `${workerId}:${task.stepId}:${task.startTime}`,
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
  processes: ProcessMaster[];
  now?: Date;
}) {
  const { dateKey, selectedSiteId, sites, workflows, shippers, processes, now = new Date() } = params;
  const siteData = buildWorkerSiteDeploymentData(selectedSiteId, sites, workflows, shippers, processes);
  const deploymentWorkers = readDeploymentWorkers();
  const workerMap = new Map(deploymentWorkers.map((worker) => [worker.id, worker]));

  return deploymentWorkers.flatMap((worker) => {
    const progressByTaskId = readWorkerProgress(dateKey, worker.id);
    const tasks = buildWorkerDayTasks(siteData, worker.id);

    return tasks.flatMap((task) => {
      const progress = progressByTaskId[task.id];
      if (!progress) return [];
      const submissionLogs = getWorkerTaskSubmissionLogs(progress);

      const hasActivity =
        Boolean(progress.startedAt) ||
        Boolean(progress.completedAt) ||
        Boolean(getWorkerTaskLastReportedAt(progress)) ||
        Boolean(progress.pauseStartedAt) ||
        submissionLogs.length > 0 ||
        getWorkerTaskReportedQuantity(progress) > 0 ||
        progress.status !== "pending";

      if (!hasActivity) return [];

      if (submissionLogs.length > 0) {
        return submissionLogs.map((submissionLog, index, array) => ({
          id: `${dateKey}:${task.id}:${submissionLog.id}`,
          dateKey,
          siteId: task.siteId,
          siteName: task.siteName,
          workerId: worker.id,
          workerName: workerMap.get(worker.id)?.name ?? worker.id,
          stepId: task.stepId,
          workflowId: task.workflowId,
          workflowName: task.workflowName,
          shipperName: task.shipperName,
          processName: task.processName,
          scheduledStartTime: task.startTime,
          scheduledEndTime: task.endTime,
          startedAt: progress.startedAt,
          completedAt: index === array.length - 1 ? progress.completedAt : undefined,
          lastReportedAt: submissionLog.submittedAt,
          reportedQuantity: submissionLog.quantity,
          pausedMinutes: index === array.length - 1 ? getPausedMinutes(progress, now) : 0,
          status:
            index === array.length - 1
              ? progress.status
              : progress.completedAt
                ? "working"
                : progress.status,
        })) satisfies WorkerSubmissionRecord[];
      }

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
        processName: task.processName,
        scheduledStartTime: task.startTime,
        scheduledEndTime: task.endTime,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        lastReportedAt: getWorkerTaskLastReportedAt(progress),
        reportedQuantity: getWorkerTaskReportedQuantity(progress),
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
  processes: ProcessMaster[];
  date?: Date;
}) {
  const { selectedSiteId, sites, workflows, shippers, processes, date = new Date() } = params;
  const dateKey = formatLocalDateKey(date);
  const siteData = buildWorkerSiteDeploymentData(selectedSiteId, sites, workflows, shippers, processes);
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
  const deploymentWorkers = readDeploymentWorkers();

  deploymentWorkers.forEach((worker) => {
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
              draftQuantity: 0,
              submissionLogs:
                reportedQuantity > 0
                  ? [
                      {
                        id: `${taskSeed.task.id}:seed-1`,
                        quantity: reportedQuantity,
                        submittedAt: toDateTimeIsoFromMinutes(
                          date,
                          clampNumber(nowMinutes - (taskSeed.isPaused ? 11 : 4), taskSeed.startedMinutes + 3, nowMinutes - 1),
                          endSeconds,
                        ),
                      },
                    ]
                  : [],
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
              draftQuantity: 0,
              submissionLogs:
                reportedQuantity > 0
                  ? [
                      {
                        id: `${taskSeed.task.id}:seed-1`,
                        quantity: reportedQuantity,
                        submittedAt: toDateTimeIsoFromMinutes(
                          date,
                          clampNumber(taskSeed.finishedMinutes - 2, taskSeed.startedMinutes + 2, taskSeed.finishedMinutes),
                          (endSeconds + 11) % 60,
                        ),
                      },
                    ]
                  : [],
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
      return (
        Boolean(entry.startedAt) ||
        Boolean(entry.completedAt) ||
        Boolean(getWorkerTaskLastReportedAt(entry)) ||
        getWorkerTaskReportedQuantity(entry) > 0
      );
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
    processes,
    now: current,
  }).length;

  return { dateKey, workerCount, taskCount, recordCount };
}

export function ensureDemoWorkerSubmissionData(params: {
  sites: Site[];
  workflows: WorkflowDefinition[];
  shippers: Shipper[];
  processes: ProcessMaster[];
  date?: Date;
}) {
  const { sites, workflows, shippers, processes, date = new Date() } = params;
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
      title: "朝礼連絡",
      message: `${siteName} の本日の作業は 06:00 開始です。配置、注意事項、引継ぎ内容を確認してから入場してください。`,
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
  stepMap: Map<string, { workflowName: string; processName: string }>;
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
  ).filter((workerId) => {
    const previousStepIds = findAssignedStepIds(previousSnapshot, workerId);
    const nextStepIds = findAssignedStepIds(nextSnapshot, workerId);
    return previousStepIds.join("|") !== nextStepIds.join("|");
  });

  if (changedWorkerIds.length === 0) return;

  const reminderMinutes = Math.max(0, parseTimeLabel(effectiveTime) - 5);
  const reminderTime = formatTimeLabel(reminderMinutes);
  const existing = readWorkerNotifications().filter(
    (record) => !(record.siteId === siteId && record.effectiveAt === effectiveTime && record.workerId && changedWorkerIds.includes(record.workerId)),
  );

  const created = now.toISOString();
  const generated: WorkerNotificationRecord[] = changedWorkerIds.flatMap((workerId) => {
    const worker = workerMap.get(workerId);
    if (!worker) return [];

    const previousStepIds = findAssignedStepIds(previousSnapshot, workerId);
    const nextStepIds = findAssignedStepIds(nextSnapshot, workerId);
    const previousSteps = previousStepIds
      .map((stepId) => stepMap.get(stepId))
      .filter((step): step is { workflowName: string; processName: string } => Boolean(step));
    const nextSteps = nextStepIds
      .map((stepId) => stepMap.get(stepId))
      .filter((step): step is { workflowName: string; processName: string } => Boolean(step));

    const nextLabel =
      nextSteps.length === 1
        ? `${nextSteps[0].workflowName} / ${nextSteps[0].processName}`
        : nextSteps.length > 1
          ? `${nextSteps[0].workflowName} / ${nextSteps[0].processName} ほか`
          : "";
    const previousLabel =
      previousSteps.length === 1
        ? `${previousSteps[0].workflowName} / ${previousSteps[0].processName}`
        : previousSteps.length > 1
          ? `${previousSteps[0].workflowName} / ${previousSteps[0].processName} ほか`
          : "";

    const changeMessage = nextLabel
      ? effectiveTime + " から " + nextLabel + " を開始します。"
      : effectiveTime + " の配置が変更されました。";
    const moveDetail = previousLabel && nextLabel
      ? previousLabel + " → " + nextLabel
      : changeMessage;
    const reminderMessage = nextLabel
      ? effectiveTime + " に " + nextLabel + " へ移動してください。"
      : effectiveTime + " の配置変更があります。";

    return [
      {
        id: "assignment:" + siteId + ":" + workerId + ":" + effectiveTime,
        siteId,
        workerId,
        type: "assignment",
        title: "配置変更",
        message: moveDetail,
        createdAt: created,
        deliverAt: created,
        effectiveAt: effectiveTime,
      },
      {
        id: "reminder:" + siteId + ":" + workerId + ":" + effectiveTime,
        siteId,
        workerId,
        type: "reminder",
        title: "移動リマインド",
        message: reminderMessage,
        createdAt: created,
        deliverAt: toDateTimeIso(now, reminderTime),
        effectiveAt: effectiveTime,
      },
    ];
  });

  saveWorkerNotifications([...existing, ...generated]);
}

export function getTodayKey(date = new Date()) {
  return formatLocalDateKey(date);
}
