import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Grip,
  RotateCcw,
  Save,
  Search,
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

function formatWorkerShiftLabel(workerId: string, workerName: string, dateKey: string) {
  const shift = resolveWorkerShiftForDate(workerId, dateKey) ?? resolveWorkerShiftForDate(workerName, dateKey);
  if (!shift) return "シフト 未設定";
  if (shift.isOff) return "シフト 公休";
  return `シフト ${shift.start} - ${shift.end}`;
}

type DragState = {
  workerId: string;
  fromStepId: string | null;
};

type PlacementAlertState =
  | {
      message: string;
      tone: "warning" | "info";
    }
  | null;

type CapabilityItem = {
  id: string;
  name: string;
  iconKey?: MasterIconKey;
};

type ProcessShipperRow = {
  shipperId: string;
  shipperName: string;
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
  startTime: string;
  targetEndTime: string;
  planned: number;
  actual: number;
  requiredPersonHours: number;
  eta: string;
  status: StatusTone;
};

type ProcessView = {
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
  assignedWorkerIds: string[];
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
  manuals: string[];
  cautions: string[];
  targetStepId: string | null;
  shipperRows: ProcessShipperRow[];
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

function findAssignedStepId(snapshot: AssignmentSnapshot, workerId: string) {
  return Object.entries(snapshot).find(([, slots]) => slots.includes(workerId))?.[0] ?? null;
}

function buildAssignmentLabel(stepId: string | null, stepLookup: Map<string, DeploymentStep>) {
  if (!stepId) return "未配置";
  return stepLookup.get(stepId)?.processName ?? "未配置";
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
      const currentStepId = findAssignedStepId(currentSnapshot, worker.id);
      const savedStepId = findAssignedStepId(savedSnapshot, worker.id);
      const currentLabel = buildAssignmentLabel(currentStepId, stepLookup);
      const savedLabel = buildAssignmentLabel(savedStepId, stepLookup);
      if (currentLabel === savedLabel) return;

      const previousCurrentLabel = buildAssignmentLabel(findAssignedStepId(previousCurrent, worker.id), stepLookup);
      const previousSavedLabel = buildAssignmentLabel(findAssignedStepId(previousSaved, worker.id), stepLookup);
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
  muted = false,
  draggable = true,
  onDragStart,
  onDragEnd,
  qualificationItems,
  skillItems,
  c,
}: {
  worker: DeploymentWorker;
  subtitle?: string;
  shiftLabel: string;
  muted?: boolean;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  qualificationItems: CapabilityItem[];
  skillItems: CapabilityItem[];
  c: ReturnType<typeof useThemeColors>;
}) {
  const visibleQualifications = qualificationItems.slice(0, 2);
  const visibleSkills = skillItems.slice(0, 2);
  const hiddenQualificationCount = Math.max(qualificationItems.length - visibleQualifications.length, 0);
  const hiddenSkillCount = Math.max(skillItems.length - visibleSkills.length, 0);
  const qualificationToneClasses = getCapabilityToneClasses("qualification");
  const skillToneClasses = getCapabilityToneClasses("skill");

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={[
        "rounded-2xl border p-3 transition",
        muted ? `${c.borderCard} ${c.bgSurface}` : `${c.borderCard} ${c.bgPanel}`,
        draggable ? "cursor-grab active:cursor-grabbing" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${worker.color}`}>
          {worker.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`truncate text-sm font-semibold ${c.textPrimary}`}>{worker.name}</div>
            {subtitle && <div className={`shrink-0 text-[11px] ${c.textMuted}`}>{subtitle}</div>}
          </div>
          <div className={`mt-0.5 text-xs ${c.textSecondary}`}>{shiftLabel}</div>
        </div>
        <Grip className={`mt-0.5 h-4 w-4 shrink-0 ${c.textMuted}`} />
      </div>

      {(skillItems.length > 0 || qualificationItems.length > 0) && (
        <div className="mt-2 flex items-center gap-1.5">
          {qualificationItems.length > 0 && (
            <div className="flex items-center gap-1">
              {visibleQualifications.map((item) => {
                const iconOption = getMasterIconOption(item.iconKey, DEFAULT_QUALIFICATION_ICON_KEY);
                const Icon = iconOption.icon;
                return (
                  <span
                    key={item.id}
                    title={item.name}
                    aria-label={`資格: ${item.name}`}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${qualificationToneClasses.surfaceClass}`}
                  >
                    <Icon className={`h-3 w-3 ${qualificationToneClasses.accentClass}`} />
                  </span>
                );
              })}
              {hiddenQualificationCount > 0 && (
                <span className={`text-[10px] ${c.textMuted}`}>+{hiddenQualificationCount}</span>
              )}
            </div>
          )}
          {skillItems.length > 0 && (
            <div className="flex items-center gap-1">
              {visibleSkills.map((item) => {
                const iconOption = getMasterIconOption(item.iconKey, DEFAULT_SKILL_ICON_KEY);
                const Icon = iconOption.icon;
                return (
                  <span
                    key={item.id}
                    title={item.name}
                    aria-label={`スキル: ${item.name}`}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${skillToneClasses.surfaceClass}`}
                  >
                    <Icon className={`h-3 w-3 ${skillToneClasses.accentClass}`} />
                  </span>
                );
              })}
              {hiddenSkillCount > 0 && (
                <span className={`text-[10px] ${c.textMuted}`}>+{hiddenSkillCount}</span>
              )}
            </div>
          )}
        </div>
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
  const [selectedTime, setSelectedTime] = useState("");
  const [keyword, setKeyword] = useState("");
  const [rightTab, setRightTab] = useState<RightTab>("staff");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [placementAlert, setPlacementAlert] = useState<PlacementAlertState>(null);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, AssignmentSnapshot>>({});
  const [draftSnapshots, setDraftSnapshots] = useState<Record<string, AssignmentSnapshot>>({});
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
  const steps = useMemo(() => workflowViews.flatMap((workflow) => workflow.steps), [workflowViews]);
  const deploymentStepMap = useMemo(() => new Map(steps.map((step) => [step.id, step])), [steps]);
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

  const snapshotScopeKey = useMemo(
    () => `${siteScope.storageScopeKey}::${selectedDate}::${steps.map((step) => step.id).join("|")}`,
    [siteScope.storageScopeKey, selectedDate, steps],
  );

  useEffect(() => {
    if (steps.length === 0) {
      setSavedSnapshots({});
      setDraftSnapshots({});
      snapshotScopeRef.current = snapshotScopeKey;
      return;
    }

    if (snapshotScopeRef.current !== snapshotScopeKey) {
      const stored = readFieldDeploymentSnapshots(siteScope.storageScopeKey, selectedDate);
      const nextSnapshots =
        Object.keys(stored).length > 0
          ? normalizeSnapshotsForTimeLabels(stored, timeLabels, steps, seededSnapshots)
          : seededSnapshots;

      setSavedSnapshots(nextSnapshots);
      setDraftSnapshots(nextSnapshots);
      setPlacementAlert(null);
      snapshotScopeRef.current = snapshotScopeKey;
      return;
    }

    setSavedSnapshots((prev) => normalizeSnapshotsForTimeLabels(prev, timeLabels, steps, seededSnapshots));
    setDraftSnapshots((prev) => normalizeSnapshotsForTimeLabels(prev, timeLabels, steps, seededSnapshots));
  }, [snapshotScopeKey, siteScope.storageScopeKey, selectedDate, steps, timeLabels, seededSnapshots]);

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
          const group = shipperGroupMap.get(item.step.shipperId) ?? [];
          group.push(item);
          shipperGroupMap.set(item.step.shipperId, group);
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

            return {
              shipperId: items[0]?.step.shipperId ?? "",
              shipperName: items[0]?.step.shipperName ?? "未設定荷主",
              requiredQualificationIds: Array.from(new Set(items.flatMap((item) => item.step.requiredQualificationIds))),
              requiredSkillIds: Array.from(new Set(items.flatMap((item) => item.step.requiredSkillIds))),
              startTime,
              targetEndTime,
              planned,
              actual,
              requiredPersonHours: Number(items.reduce((sum, item) => sum + item.requiredPersonHours, 0).toFixed(1)),
              eta: resolveGroupEta(items.map((item) => item.eta), planned, actual),
              status: mergeStatuses(items.map((item) => item.status)),
            } satisfies ProcessShipperRow;
          })
          .sort(
            (left, right) =>
              parseTime(left.startTime) - parseTime(right.startTime) ||
              left.shipperName.localeCompare(right.shipperName, "ja"),
          );

        return {
          processId,
          processName: sortedMetricsList[0]?.step.processName ?? "未設定工程",
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
          assignedWorkerIds: Array.from(new Set(sortedMetricsList.flatMap((item) => currentSnapshot[item.step.id] ?? []))),
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
  const assignedWorkerIds = new Set(Object.values(currentSnapshot).flat().filter(Boolean));
  const availableWorkers = deploymentWorkers.filter((worker) => !assignedWorkerIds.has(worker.id));
  const activeWorkers = availableWorkers.filter((worker) => worker.status === "active");
  const standbyWorkers = availableWorkers.filter((worker) => worker.status !== "active");
  const changedTimeLabels = useMemo(
    () =>
      new Set(
        timeLabels.filter((timeLabel) => {
          const draft = JSON.stringify(draftSnapshots[timeLabel] ?? {});
          const saved = JSON.stringify(savedSnapshots[timeLabel] ?? {});
          return draft !== saved;
        }),
      ),
    [timeLabels, draftSnapshots, savedSnapshots],
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

  const getRequirementWarning = (workerId: string, step: DeploymentStep) => {
    const worker = workerMap.get(workerId);
    if (!worker) return "";

    const missingQualifications = step.requiredQualificationIds
      .filter((id) => !worker.qualificationIds.includes(id))
      .map((id) => qualificationMap.get(id) ?? id);
    const missingSkills = step.requiredSkillIds
      .filter((id) => !worker.skillIds.includes(id))
      .map((id) => skillMap.get(id) ?? id);

    const warnings: string[] = [];
    if (missingQualifications.length > 0) warnings.push(`不足資格: ${missingQualifications.join("、")}`);
    if (missingSkills.length > 0) warnings.push(`不足スキル: ${missingSkills.join("、")}`);
    return warnings.join(" / ");
  };

  const updateFutureSnapshots = (workerId: string, targetStepId: string | null) => {
    if (!selectedTime) return;

    const targetStep = targetStepId ? deploymentStepMap.get(targetStepId) ?? null : null;
    const worker = workerMap.get(workerId);
    if (targetStep && worker) {
      const warning = getRequirementWarning(workerId, targetStep);
      setPlacementAlert({
        tone: warning ? "warning" : "info",
        message: warning
          ? `${worker.name} を ${targetStep.processName} に配置しました。${warning} ですが、配置は継続できます。`
          : `${worker.name} を ${targetStep.processName} に配置しました。`,
      });
    } else if (worker) {
      setPlacementAlert({
        tone: "info",
        message: `${worker.name} を未配置へ戻しました。`,
      });
    }

    setDraftSnapshots((prev) => {
      const nextSnapshots = { ...prev };
      const selectedMinutes = parseTimeLabel(selectedTime);

      timeLabels.forEach((timeLabel) => {
        if (parseTimeLabel(timeLabel) < selectedMinutes) return;

        const sourceSnapshot = nextSnapshots[timeLabel] ?? materializeSnapshot({}, steps);
        const nextSnapshot = cloneSnapshot(sourceSnapshot);

        Object.keys(nextSnapshot).forEach((stepId) => {
          nextSnapshot[stepId] = nextSnapshot[stepId].filter((assignedWorkerId) => assignedWorkerId !== workerId);
        });

        if (targetStepId) {
          nextSnapshot[targetStepId] = [...(nextSnapshot[targetStepId] ?? []), workerId];
        }

        nextSnapshots[timeLabel] = materializeSnapshot(nextSnapshot, steps);
      });

      return nextSnapshots;
    });
  };

  const moveTimeline = (direction: -1 | 1) => {
    const index = timeLabels.indexOf(selectedTime);
    if (index < 0) return;
    const nextIndex = Math.min(Math.max(index + direction, 0), timeLabels.length - 1);
    setSelectedTime(timeLabels[nextIndex]);
  };

  const resetUnsavedChanges = () => {
    const resetSnapshots = normalizeSnapshotsForTimeLabels(savedSnapshots, timeLabels, steps, seededSnapshots);
    setDraftSnapshots(resetSnapshots);
    setPlacementAlert({
      tone: "info",
      message: "未保存の調整を取り消しました。",
    });
  };

  const saveChanges = () => {
    writeFieldDeploymentSnapshots(siteScope.storageScopeKey, selectedDate, draftSnapshots);

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
    setLastSavedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeLabel = formatTime(floorToInterval(nowMinutes, timeInterval));
  const isSelectedDateToday = selectedDate === todayKey;
  const isSelectedDatePast = selectedDate < todayKey;
  const isSelectedDateFuture = selectedDate > todayKey;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <section className={`${c.bgCard} ${c.border} shrink-0 rounded-2xl border`}>
        <div className={`flex flex-col gap-4 border-b px-5 py-4 ${c.border}`}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`text-lg font-semibold ${c.textPrimary}`}>現場配置</div>
              <div className={`text-sm ${c.textSecondary}`}>
                上部メニューで選択した拠点を対象に、工程別で配置します。荷主は配置判断に使用しません。
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>拠点: {siteScope.siteName}</span>
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>工程系統: {processViews.length} 件</span>
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>変更時刻: {changedTimeLabels.size} 件</span>
              {lastSavedAt && <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>最終保存: {lastSavedAt}</span>}
            </div>
          </div>

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
                  placeholder="工程名 / マニュアル / 注意事項"
                  className={`h-10 w-full rounded-xl border pl-10 pr-3 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                />
              </div>
            </label>

            <div className="flex items-end justify-end gap-2">
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
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className={`text-xs ${c.textMuted}`}>オレンジは未保存の変更、青は現在時刻です。</div>
                <div className={`inline-flex rounded-xl border p-1 ${c.borderCard} ${c.bgCard}`}>
                  {TIME_INTERVAL_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTimeInterval(option.value)}
                      className={[
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                        timeInterval === option.value
                          ? "bg-cyan-600 text-white"
                          : `${c.textSecondary} hover:bg-slate-500/10`,
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  ))}
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
                    const statusLabel = isCurrent ? "現在" : isChanged ? "変更" : isFuture ? "予定" : "済";

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
              "flex items-start gap-2 border-b px-5 py-3 text-sm",
              placementAlert.tone === "warning"
                ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
                : "border-cyan-500/20 bg-cyan-500/10 text-cyan-500",
            ].join(" ")}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{placementAlert.message}</div>
          </div>
        )}
      </section>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
          {processViews.map((processView) => {
            const shortage = Math.max(processView.requiredHeadcount - processView.assignedCount, 0);

            return (
              <section
                key={processView.processId}
                className={`${c.bgCard} ${c.border} rounded-2xl border`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!dragState || !processView.targetStepId) return;
                  updateFutureSnapshots(dragState.workerId, processView.targetStepId);
                  setDragState(null);
                }}
              >
                <div className={`border-b px-5 py-4 ${c.border}`}>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className={`text-base font-semibold ${c.textPrimary}`}>{processView.processName}</div>
                      <div className={`text-sm ${c.textSecondary}`}>{processView.description}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${c.bgSurface} ${c.textSecondary}`}>
                        現在配置 {processView.assignedCount} 人
                      </span>
                      {shortage > 0 ? (
                        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-500">
                          不足 {shortage} 人
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-500">
                          配置充足
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 p-5">
                  <div className={`overflow-x-auto rounded-2xl border ${c.borderCard}`}>
                    <table className="min-w-[1200px] w-full text-xs">
                      <thead className={`${c.bgSurface} ${c.textSecondary}`}>
                        <tr>
                          <th className="px-3 py-3 text-left font-medium">荷主</th>
                          <th className="px-3 py-3 text-left font-medium">必要資格 / 必要スキル</th>
                          <th className="px-3 py-3 text-center font-medium">開始予定時刻</th>
                          <th className="px-3 py-3 text-center font-medium">目標完了時刻</th>
                          <th className="px-3 py-3 text-center font-medium">予定数</th>
                          <th className="px-3 py-3 text-center font-medium">実績数</th>
                          <th className="px-3 py-3 text-center font-medium">所要人時</th>
                          <th className="px-3 py-3 text-center font-medium">完了見込み</th>
                          <th className="px-3 py-3 text-center font-medium">状況</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processView.shipperRows.map((row) => {
                          const status = statusConfig(row.status);
                          return (
                            <tr key={`${processView.processId}-${row.shipperId}`} className={`border-t ${c.borderCard}`}>
                              <td className={`px-3 py-3 font-medium ${c.textPrimary}`}>{row.shipperName}</td>
                              <td className="px-3 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  {row.requiredQualificationIds.length > 0 && (
                                    <div
                                      className="flex flex-wrap items-center gap-1"
                                      title={`必要資格: ${row.requiredQualificationIds.map((id) => qualificationMap.get(id) ?? id).join("、")}`}
                                      aria-label={`必要資格 ${row.requiredQualificationIds.map((id) => qualificationMap.get(id) ?? id).join("、")}`}
                                    >
                                      {qualificationItemsForIds(row.requiredQualificationIds).map((item) => {
                                        const iconOption = getMasterIconOption(item.iconKey, DEFAULT_QUALIFICATION_ICON_KEY);
                                        const Icon = iconOption.icon;
                                        return (
                                          <span
                                            key={item.id}
                                            title={item.name}
                                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${qualificationToneClasses.surfaceClass}`}
                                          >
                                            <Icon className={`h-3 w-3 ${qualificationToneClasses.accentClass}`} />
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {row.requiredSkillIds.length > 0 && (
                                    <div
                                      className="flex flex-wrap items-center gap-1"
                                      title={`必要スキル: ${row.requiredSkillIds.map((id) => skillMap.get(id) ?? id).join("、")}`}
                                      aria-label={`必要スキル ${row.requiredSkillIds.map((id) => skillMap.get(id) ?? id).join("、")}`}
                                    >
                                      {skillItemsForIds(row.requiredSkillIds).map((item) => {
                                        const iconOption = getMasterIconOption(item.iconKey, DEFAULT_SKILL_ICON_KEY);
                                        const Icon = iconOption.icon;
                                        return (
                                          <span
                                            key={item.id}
                                            title={item.name}
                                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${skillToneClasses.surfaceClass}`}
                                          >
                                            <Icon className={`h-3 w-3 ${skillToneClasses.accentClass}`} />
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {row.requiredQualificationIds.length === 0 && row.requiredSkillIds.length === 0 && (
                                    <span className={c.textMuted}>-</span>
                                  )}
                                </div>
                              </td>
                              <td className={`px-3 py-3 text-center tabular-nums ${c.textSecondary}`}>{row.startTime}</td>
                              <td className={`px-3 py-3 text-center tabular-nums ${c.textSecondary}`}>{row.targetEndTime}</td>
                              <td className={`px-3 py-3 text-center tabular-nums ${c.textPrimary}`}>{row.planned.toLocaleString("ja-JP")} 件</td>
                              <td className="px-3 py-3 text-center tabular-nums font-medium text-cyan-500">
                                {row.actual.toLocaleString("ja-JP")} 件
                              </td>
                              <td className={`px-3 py-3 text-center tabular-nums ${c.textPrimary}`}>{row.requiredPersonHours.toFixed(1)} 人時</td>
                              <td className={`px-3 py-3 text-center tabular-nums ${c.textPrimary}`}>{row.eta}</td>
                              <td className="px-3 py-3 text-center">
                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium ${status.className}`}>
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-2 text-xs">
                    {processView.manuals.length > 0 && (
                      <div className={`rounded-xl px-3 py-2 ${c.bgSurface}`}>
                        <div className={c.textMuted}>マニュアル</div>
                        <div className="mt-1 grid gap-1">
                          {processView.manuals.map((manual, index) => (
                            <div key={`${processView.processId}-manual-${index}`} className={c.textSecondary}>
                              {manual}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {processView.cautions.length > 0 && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                        <div className="font-medium">注意事項</div>
                        <div className="mt-1 grid gap-1">
                          {processView.cautions.map((caution, index) => (
                            <div key={`${processView.processId}-caution-${index}`}>{caution}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3">
                    <div className={`text-xs font-medium ${c.textSecondary}`}>配置中の作業者</div>
                    <div className="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                      {processView.assignedWorkerIds.length > 0 ? (
                        <>
                          {processView.assignedWorkerIds.map((workerId) => {
                            const worker = workerMap.get(workerId);
                            if (!worker) return null;
                            return (
                              <WorkerCard
                                key={`${processView.processId}-${worker.id}`}
                                worker={worker}
                                subtitle={worker.note}
                                shiftLabel={workerShiftLabelMap.get(worker.id) ?? "シフト 未設定"}
                                qualificationItems={qualificationItemsForIds(worker.qualificationIds)}
                                skillItems={skillItemsForIds(worker.skillIds)}
                                onDragStart={() => setDragState({ workerId: worker.id, fromStepId: processView.targetStepId })}
                                onDragEnd={() => setDragState(null)}
                                c={c}
                              />
                            );
                          })}
                          <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
                            ここに作業者をドロップ
                          </div>
                        </>
                      ) : (
                        <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
                          ここに作業者をドロップ
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}

          {processViews.length === 0 && (
            <section className={`${c.bgCard} ${c.border} rounded-2xl border p-10 text-center`}>
              <div className={`text-base font-medium ${c.textPrimary}`}>表示できる工程がありません</div>
              <div className={`mt-2 text-sm ${c.textSecondary}`}>検索条件を見直すか、業務管理で工程を追加してください。</div>
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
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${rightTab === "staff" ? "bg-cyan-600 text-white" : `${c.bgSurface} ${c.textSecondary}`}`}
                >
                  <Users className="h-4 w-4" />
                  作業者プール
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab("adjustments")}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${rightTab === "adjustments" ? "bg-cyan-600 text-white" : `${c.bgSurface} ${c.textSecondary}`}`}
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
                      updateFutureSnapshots(dragState.workerId, null);
                      setDragState(null);
                    }}
                  >
                    <div className={`mb-2 text-xs font-medium ${c.textSecondary}`}>未配置作業者</div>
                    {dragState?.fromStepId && (
                      <div className="mb-3 rounded-xl bg-cyan-500/10 px-3 py-2 text-xs text-cyan-600">
                        ここへドロップすると未配置に戻します。
                      </div>
                    )}
                    <div className="grid gap-2">
                      {activeWorkers.map((worker) => (
                        <WorkerCard
                          key={worker.id}
                          worker={worker}
                          shiftLabel={workerShiftLabelMap.get(worker.id) ?? "シフト 未設定"}
                          qualificationItems={qualificationItemsForIds(worker.qualificationIds)}
                          skillItems={skillItemsForIds(worker.skillIds)}
                          onDragStart={() => setDragState({ workerId: worker.id, fromStepId: null })}
                          onDragEnd={() => setDragState(null)}
                          c={c}
                        />
                      ))}
                      {activeWorkers.length === 0 && (
                        <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
                          未配置の作業者はいません
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className={`mb-2 text-xs font-medium ${c.textSecondary}`}>待機・離席</div>
                    <div className="grid gap-2">
                      {standbyWorkers.map((worker) => (
                        <WorkerCard
                          key={worker.id}
                          worker={worker}
                          shiftLabel={workerShiftLabelMap.get(worker.id) ?? "シフト 未設定"}
                          muted
                          qualificationItems={qualificationItemsForIds(worker.qualificationIds)}
                          skillItems={skillItemsForIds(worker.skillIds)}
                          onDragStart={() => setDragState({ workerId: worker.id, fromStepId: null })}
                          onDragEnd={() => setDragState(null)}
                          c={c}
                        />
                      ))}
                      {standbyWorkers.length === 0 && (
                        <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${c.borderCard} ${c.textMuted}`}>
                          待機・離席の作業者はいません
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div>
                    <div className={`text-sm font-semibold ${c.textPrimary}`}>人員配置調整リスト</div>
                    <div className={`mt-1 text-xs ${c.textSecondary}`}>未保存の変更内容を時刻順に確認できます。</div>
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
                            <div className={`text-xs ${c.textSecondary}`}>変更時点 {item.effectiveTime}</div>
                          </div>
                          <div className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                            未保存
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className={c.textMuted}>元配置</div>
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
    </div>
  );
}
