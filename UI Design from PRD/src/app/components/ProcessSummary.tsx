import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Layers,
  Package,
  Search,
  Target,
  TrendingUp,
  Warehouse,
  ClipboardCheck,
  Box,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import { processColorClasses } from "./processStore";
import {
  DEPLOYMENT_WORKERS,
  buildBaseDeploymentSnapshot,
  buildFieldDeploymentStorageKey,
  buildSiteScope,
  createSeededDeploymentSnapshots,
  createTimeSlots,
  materializeSnapshot,
  type AssignmentSnapshot,
} from "./fieldDeploymentStore";
import {
  PLAN_STORAGE_KEY,
  buildStepPlanDefaults,
  readProgressPlanStore,
  resolveStepPlanValues,
  updateStepPlanEntry,
  type ProgressPlanStore,
} from "./progressPlanStore";
import {
  buildReportedQuantityMap,
  buildWorkerSubmissionRecords,
  type WorkerSubmissionRecord,
} from "./workerMobileStore";
import type { AreaMaster, ProcessMaster, Shipper, WorkflowDefinition } from "./masterStore";

const COLORS = ["cyan", "emerald", "violet", "amber", "blue", "rose", "orange", "teal", "indigo"] as const;
const DEPLOYMENT_INTERVAL_MINUTES = 30;
const DEPLOYMENT_DAY_END = 24 * 60;

type StatusTone = "on_track" | "delayed" | "not_started" | "done";
type TrendPoint = { label: string; planned: number; actual: number };
const TREND_SAMPLE_MINUTES = [6 * 60, 8 * 60, 10 * 60, 12 * 60, 14 * 60, 16 * 60, 18 * 60, 20 * 60];

interface StepView {
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
  defaultPlanned: number;
  weight: number;
  startTime: string;
  targetEndTime: string;
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
}

interface WorkflowView {
  id: string;
  workflowName: string;
  shipperId: string;
  shipperName: string;
  areaId: string;
  areaName: string;
  color: string;
  updatedAt: string;
  steps: StepView[];
}

interface StepMetrics {
  planned: number;
  actual: number;
  remaining: number;
  progress: number;
  totalUph: number;
  eta: string;
  status: StatusTone;
}

interface WorkflowMetrics {
  totalPlanned: number;
  totalActual: number;
  totalRemaining: number;
  averageProgress: number;
  delayedCount: number;
  status: StatusTone;
  trend: TrendPoint[];
}

interface AreaMetrics {
  areaId: string;
  areaName: string;
  workflowCount: number;
  processCount: number;
  totalPlanned: number;
  totalActual: number;
  averageProgress: number;
  delayedCount: number;
}

interface TrendDialogState {
  title: string;
  subtitle: string;
  points: TrendPoint[];
  plannedTotal: number;
  actualTotal: number;
  statusLabel: string;
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatTime(totalMinutes: number) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function pickColor(index: number) {
  return COLORS[index % COLORS.length];
}

function readDeploymentSnapshots(storageKey: string): Record<string, AssignmentSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, AssignmentSnapshot> : {};
  } catch {
    return {};
  }
}

function sortTimeLabels(labels: string[]) {
  return [...labels].sort((left, right) => parseTime(left) - parseTime(right));
}

function detectSnapshotInterval(labels: string[]) {
  if (labels.length < 2) return DEPLOYMENT_INTERVAL_MINUTES;
  let minDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < labels.length; index += 1) {
    const delta = parseTime(labels[index]) - parseTime(labels[index - 1]);
    if (delta > 0) minDelta = Math.min(minDelta, delta);
  }
  return Number.isFinite(minDelta) ? minDelta : DEPLOYMENT_INTERVAL_MINUTES;
}

function countAssigned(snapshot: AssignmentSnapshot | undefined, stepId: string) {
  return (snapshot?.[stepId] ?? []).filter((workerId): workerId is string => Boolean(workerId)).length;
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

function buildWorkflowViews(workflows: WorkflowDefinition[], shippers: Shipper[], areas: AreaMaster[], processes: ProcessMaster[]) {
  const shipperMap = new Map(shippers.map((item) => [item.id, item]));
  const areaMap = new Map(areas.map((item) => [item.id, item]));
  const processMap = new Map(processes.map((item) => [item.id, item]));

  return workflows
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "ja"))
    .map((workflow, workflowIndex) => ({
      id: workflow.id,
      workflowName: workflow.name,
      shipperId: workflow.shipperId,
      shipperName: shipperMap.get(workflow.shipperId)?.name ?? "未設定荷主",
      areaId: workflow.areaId,
      areaName: areaMap.get(workflow.areaId)?.name ?? workflow.name,
      color: pickColor(workflowIndex),
      updatedAt: workflow.updatedAt,
      steps: workflow.steps.map((step, stepIndex) => {
        const process = processMap.get(step.processId);
        const headcount = Math.max(step.standardHeadcount || process?.defaultHeadcount || 1, 1);
        const uph = step.uph || process?.defaultUph || 100;
        const weight = Math.max(headcount * uph, 1);
        const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, headcount, uph);

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
          defaultPlanned: defaults.planned,
          weight,
          startTime: defaults.startTime,
          targetEndTime: defaults.targetEndTime,
          requiredQualificationIds: step.requiredQualificationIds,
          requiredSkillIds: step.requiredSkillIds,
        } satisfies StepView;
      }),
    })) satisfies WorkflowView[];
}

function distributeWorkflowPlan(total: number, steps: StepView[]) {
  const safeTotal = Math.max(0, total);
  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0) || steps.length || 1;
  const nextValues: Record<string, number> = {};
  let remaining = safeTotal;

  steps.forEach((step, index) => {
    if (index === steps.length - 1) {
      nextValues[step.id] = Math.max(0, remaining);
      return;
    }

    const rawValue = Math.round((safeTotal * step.weight / totalWeight) / 10) * 10;
    const value = Math.max(0, Math.min(remaining, rawValue));
    nextValues[step.id] = value;
    remaining -= value;
  });

  return nextValues;
}

function statusConfig(status: StatusTone) {
  switch (status) {
    case "done":
      return { label: "完了", className: "bg-emerald-500/15 text-emerald-500", icon: CheckCircle2 };
    case "delayed":
      return { label: "遅延", className: "bg-amber-500/15 text-amber-500", icon: AlertTriangle };
    case "not_started":
      return { label: "未着手", className: "bg-slate-500/15 text-slate-500", icon: Clock3 };
    default:
      return { label: "進行中", className: "bg-cyan-500/15 text-cyan-500", icon: TrendingUp };
  }
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

function getPlannedValueAtMinute(step: StepView, planned: number, minute: number) {
  if (planned <= 0) return 0;
  const start = parseTime(step.startTime);
  const end = Math.max(parseTime(step.targetEndTime), start + 30);
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
  const isFuture = selectedDateValue > todayValue;
  if (isFuture) return 0;

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
  step: StepView,
  minute: number,
  timeSlots: string[],
  intervalMinutes: number,
  snapshotsByTime: Record<string, AssignmentSnapshot>,
) {
  const startMinutes = parseTime(step.startTime);
  let actualRaw = 0;

  timeSlots.forEach((timeLabel) => {
    const slotStart = parseTime(timeLabel);
    const slotEnd = Math.min(slotStart + intervalMinutes, DEPLOYMENT_DAY_END);
    if (slotEnd <= startMinutes || slotStart >= minute) return;
    const effectiveStart = Math.max(slotStart, startMinutes);
    const effectiveEnd = Math.min(slotEnd, minute);
    if (effectiveEnd <= effectiveStart) return;
    actualRaw += countAssigned(snapshotsByTime[timeLabel], step.id) * step.uph * 0.82 * ((effectiveEnd - effectiveStart) / 60);
  });

  return actualRaw;
}

function projectEtaMinutes(
  step: StepView,
  planned: number,
  referenceMinutes: number,
  timeSlots: string[],
  intervalMinutes: number,
  snapshotsByTime: Record<string, AssignmentSnapshot>,
) {
  let remainingRaw = Math.max(0, planned - calculateActualRawUntil(step, referenceMinutes, timeSlots, intervalMinutes, snapshotsByTime));
  if (remainingRaw === 0) return clamp(referenceMinutes, 0, DEPLOYMENT_DAY_END);

  for (let index = 0; index < timeSlots.length; index += 1) {
    const slotStart = parseTime(timeSlots[index]);
    const slotEnd = Math.min(slotStart + intervalMinutes, DEPLOYMENT_DAY_END);
    if (slotEnd <= referenceMinutes) continue;

    const effectiveStart = Math.max(slotStart, referenceMinutes, parseTime(step.startTime));
    const effectiveEnd = Math.max(effectiveStart, slotEnd);
    const assignedCount = countAssigned(snapshotsByTime[timeSlots[index]], step.id);
    if (assignedCount <= 0 || effectiveEnd <= effectiveStart) continue;

    const hourlyCapacity = assignedCount * step.uph * 0.82;
    const slotCapacity = hourlyCapacity * ((effectiveEnd - effectiveStart) / 60);
    if (slotCapacity >= remainingRaw) {
      return Math.ceil(effectiveStart + (remainingRaw / hourlyCapacity) * 60);
    }

    remainingRaw -= slotCapacity;
  }

  return null;
}

function getStepMetrics(
  step: StepView,
  planned: number,
  actualReported: number,
  selectedDate: string,
  today: string,
  nowMinutes: number,
  timeSlots: string[],
  intervalMinutes: number,
  snapshotsByTime: Record<string, AssignmentSnapshot>,
): StepMetrics {
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");
  const isFuture = selectedDateValue > todayValue;
  const isPast = selectedDateValue < todayValue;
  const referenceMinutes = isFuture ? parseTime(step.startTime) : isPast ? DEPLOYMENT_DAY_END : nowMinutes;
  const actual = Math.max(0, actualReported);
  const remaining = Math.max(0, planned - actual);
  const progress = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
  const totalUph = Math.max(step.headcount * step.uph, step.uph);

  let eta = "--:--";
  if (planned === 0) {
    eta = "未設定";
  } else if (remaining === 0) {
    eta = "完了";
  } else {
    const projectedEta = projectEtaMinutes(
      step,
      planned,
      Math.max(referenceMinutes, parseTime(step.startTime)),
      timeSlots,
      intervalMinutes,
      snapshotsByTime,
    );
    eta = projectedEta === null ? "--:--" : formatTime(Math.min(projectedEta, DEPLOYMENT_DAY_END));
  }

  const plannedAtReference = isPast
    ? planned
    : isFuture
      ? 0
      : getPlannedValueAtMinute(step, planned, referenceMinutes);
  const targetMinutes = parseTime(step.targetEndTime);

  let status: StatusTone = "on_track";
  if (planned === 0) status = "not_started";
  else if (remaining === 0) status = "done";
  else if (isFuture || referenceMinutes <= parseTime(step.startTime)) status = "not_started";
  else if (isPast && actual < planned) status = "delayed";
  else if (eta !== "--:--" && eta !== "未設定" && eta !== "完了" && parseTime(eta) > targetMinutes) status = "delayed";
  else if (plannedAtReference > 0 && progress + 12 < Math.round((plannedAtReference / planned) * 100)) status = "delayed";

  return { planned, actual, remaining, progress, totalUph, eta, status };
}

function buildStepTrend(
  step: StepView,
  planned: number,
  records: WorkerSubmissionRecord[],
  selectedDate: string,
  today: string,
  nowMinutes: number,
  timeSlots: string[],
  intervalMinutes: number,
  snapshotsByTime: Record<string, AssignmentSnapshot>,
): TrendPoint[] {
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");
  const isFuture = selectedDateValue > todayValue;
  const currentActual = Math.min(
    planned,
    getSubmissionQuantityAtMinute(records, selectedDateValue < todayValue ? DEPLOYMENT_DAY_END : nowMinutes, selectedDate, today, nowMinutes),
  );

  return TREND_SAMPLE_MINUTES.map((minute) => {
    const plannedAtPoint = getPlannedValueAtMinute(step, planned, minute);
    if (isFuture) {
      return { label: formatTime(minute), planned: plannedAtPoint, actual: 0 };
    }

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

function buildWorkflowTrend(stepTrends: TrendPoint[][]): TrendPoint[] {
  if (stepTrends.length === 0) return TREND_SAMPLE_MINUTES.map((minute) => ({ label: formatTime(minute), planned: 0, actual: 0 }));
  return TREND_SAMPLE_MINUTES.map((minute, index) => ({
    label: formatTime(minute),
    planned: sum(stepTrends.map((points) => points[index]?.planned ?? 0)),
    actual: sum(stepTrends.map((points) => points[index]?.actual ?? 0)),
  }));
}

function TrendSparkline({ points, themeColors }: { points: TrendPoint[]; themeColors: ReturnType<typeof useThemeColors> }) {
  const lastPoint = points[points.length - 1];
  const gridStroke = themeColors.isDark ? "#263041" : "#e2e8f0";
  const tooltipBg = themeColors.isDark ? "#111827" : "#ffffff";
  const tooltipBorder = themeColors.isDark ? "#334155" : "#cbd5e1";
  const tooltipColor = themeColors.isDark ? "#e2e8f0" : "#0f172a";

  return (
    <div className="min-w-[176px]">
      <div className="h-14 w-[160px]" role="img" aria-label={`予定 ${lastPoint?.planned ?? 0}、実績 ${lastPoint?.actual ?? 0} の推移`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="label" hide />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: "8px",
                color: tooltipColor,
                fontSize: "12px",
              }}
            />
            <Line type="monotone" dataKey="planned" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="4 3" />
            <Line type="monotone" dataKey="actual" stroke="#06b6d4" strokeWidth={2.2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={`mt-1 flex items-center gap-3 text-[10px] ${themeColors.textMuted}`}>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-violet-500" />
          予定
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-cyan-500" />
          実績
        </span>
      </div>
    </div>
  );
}

function TrendDetailChart({ points, themeColors }: { points: TrendPoint[]; themeColors: ReturnType<typeof useThemeColors> }) {
  const gridStroke = themeColors.isDark ? "#1e293b" : "#e2e8f0";
  const axisStroke = themeColors.isDark ? "#475569" : "#94a3b8";
  const tickFill = themeColors.isDark ? "#94a3b8" : "#64748b";
  const tooltipBg = themeColors.isDark ? "#111827" : "#ffffff";
  const tooltipBorder = themeColors.isDark ? "#334155" : "#cbd5e1";
  const tooltipColor = themeColors.isDark ? "#e2e8f0" : "#0f172a";

  return (
    <div className={`${themeColors.bgSurface} ${themeColors.borderCard} rounded-3xl border p-4`}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="label" stroke={axisStroke} tick={{ fontSize: 11, fill: tickFill }} />
          <YAxis stroke={axisStroke} tick={{ fontSize: 11, fill: tickFill }} />
          <Tooltip
            contentStyle={{
              backgroundColor: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: "8px",
              color: tooltipColor,
              fontSize: "12px",
            }}
          />
          <Line type="monotone" dataKey="planned" name="予定数" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} />
          <Line type="monotone" dataKey="actual" name="実績数" stroke="#06b6d4" strokeWidth={2.4} dot={{ r: 3 }} />
          <Legend wrapperStyle={{ fontSize: "11px", color: tickFill }} />
        </LineChart>
      </ResponsiveContainer>
      <div className={`mt-4 flex flex-wrap items-center gap-4 text-[12px] ${themeColors.textSecondary}`}>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          予定数
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
          実績数
        </span>
      </div>
    </div>
  );
}

export function ProcessSummary() {
  const c = useThemeColors();
  const { shippers, sites, areas, processes, workflows, selectedSiteId } = useMasterData();
  const [now, setNow] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [filterShipperId, setFilterShipperId] = useState("all");
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterProcessId, setFilterProcessId] = useState("all");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [planStore, setPlanStore] = useState<ProgressPlanStore>(() => readProgressPlanStore());
  const [selectedTrend, setSelectedTrend] = useState<TrendDialogState | null>(null);

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

  const today = toDateInput(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const deploymentStorageKey = useMemo(
    () => buildFieldDeploymentStorageKey(siteScope.storageScopeKey),
    [siteScope.storageScopeKey],
  );
  const storedDeploymentSnapshots = useMemo(
    () => readDeploymentSnapshots(deploymentStorageKey),
    [deploymentStorageKey],
  );

  const workflowViews = useMemo(
    () => buildWorkflowViews(workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)), shippers, areas, processes),
    [workflows, siteScope.siteIds, shippers, areas, processes],
  );
  const deploymentSteps = useMemo(
    () => workflowViews.flatMap((workflow) => workflow.steps),
    [workflowViews],
  );
  const deploymentTimeSlots = useMemo(() => {
    const defaultLabels = createTimeSlots(DEPLOYMENT_INTERVAL_MINUTES);
    const labels = sortTimeLabels(Object.keys(storedDeploymentSnapshots).filter((label) => /^\d{2}:\d{2}$/.test(label)));
    return sortTimeLabels(Array.from(new Set([...defaultLabels, ...labels])));
  }, [storedDeploymentSnapshots]);
  const deploymentIntervalMinutes = useMemo(
    () => detectSnapshotInterval(deploymentTimeSlots),
    [deploymentTimeSlots],
  );
  const baseDeploymentSnapshot = useMemo(
    () => buildBaseDeploymentSnapshot(deploymentSteps, DEPLOYMENT_WORKERS),
    [deploymentSteps],
  );
  const seededDeploymentSnapshots = useMemo(
    () =>
      createSeededDeploymentSnapshots(
        deploymentTimeSlots,
        deploymentSteps,
        DEPLOYMENT_WORKERS,
        baseDeploymentSnapshot,
      ),
    [deploymentTimeSlots, deploymentSteps, baseDeploymentSnapshot],
  );
  const deploymentSnapshotsByTime = useMemo(
    () =>
      Object.fromEntries(
        deploymentTimeSlots.map((timeLabel) => [
          timeLabel,
          materializeSnapshot(
            storedDeploymentSnapshots[timeLabel] ?? seededDeploymentSnapshots[timeLabel] ?? {},
            deploymentSteps,
          ),
        ]),
      ) as Record<string, AssignmentSnapshot>,
    [deploymentTimeSlots, storedDeploymentSnapshots, seededDeploymentSnapshots, deploymentSteps],
  );
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
        now,
      }),
    [selectedDate, selectedSiteId, sites, workflows, shippers, areas, processes, now],
  );
  const submissionRecordsByStep = useMemo(() => {
    const map = new Map<string, WorkerSubmissionRecord[]>();
    submissionRecords.forEach((record) => {
      const bucket = map.get(record.stepId) ?? [];
      bucket.push(record);
      map.set(record.stepId, bucket);
    });
    return map;
  }, [submissionRecords]);
  const reportedQuantityByStep = useMemo(
    () => buildReportedQuantityMap(submissionRecords),
    [submissionRecords],
  );

  const shipperOptions = useMemo(
    () => shippers.filter((shipper) => workflowViews.some((workflow) => workflow.shipperId === shipper.id)),
    [workflowViews, shippers],
  );
  const areaOptions = useMemo(
    () => areas.filter((area) => workflowViews.some((workflow) => workflow.areaId === area.id)),
    [workflowViews, areas],
  );
  const processOptions = useMemo(
    () => processes.filter((process) => workflowViews.some((workflow) => workflow.steps.some((step) => step.processId === process.id))),
    [workflowViews, processes],
  );

  const filteredWorkflows = useMemo(() => {
    const keyword = filterKeyword.trim().toLowerCase();
    return workflowViews.filter((workflow) => {
      if (filterShipperId !== "all" && workflow.shipperId !== filterShipperId) return false;
      if (filterAreaId !== "all" && workflow.areaId !== filterAreaId) return false;
      if (filterProcessId !== "all" && !workflow.steps.some((step) => step.processId === filterProcessId)) return false;
      if (!keyword) return true;
      const haystack = `${workflow.workflowName} ${workflow.shipperName} ${workflow.areaName} ${workflow.steps.map((step) => step.processName).join(" ")}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [workflowViews, filterShipperId, filterAreaId, filterProcessId, filterKeyword]);

  const dayPlans = planStore[selectedDate] ?? {};

  const workflowRows = useMemo(() => {
    return filteredWorkflows.map((workflow) => {
      const steps = workflow.steps.map((step) => {
        const planValues = resolveStepPlanValues(dayPlans, step.id, {
          planned: step.defaultPlanned,
          startTime: step.startTime,
          targetEndTime: step.targetEndTime,
        });
        const stepWithPlan = {
          ...step,
          planned: planValues.planned,
          startTime: planValues.startTime,
          targetEndTime: planValues.targetEndTime,
        };
        const metrics = getStepMetrics(
          stepWithPlan,
          planValues.planned,
          reportedQuantityByStep.get(step.id) ?? 0,
          selectedDate,
          today,
          nowMinutes,
          deploymentTimeSlots,
          deploymentIntervalMinutes,
          deploymentSnapshotsByTime,
        );
        const trend = buildStepTrend(
          stepWithPlan,
          planValues.planned,
          submissionRecordsByStep.get(step.id) ?? [],
          selectedDate,
          today,
          nowMinutes,
          deploymentTimeSlots,
          deploymentIntervalMinutes,
          deploymentSnapshotsByTime,
        );
        return { ...stepWithPlan, ...metrics, trend };
      });

      const totalPlanned = sum(steps.map((step) => step.planned));
      const totalActual = sum(steps.map((step) => step.actual));
      const totalRemaining = Math.max(0, totalPlanned - totalActual);
      const averageProgress = totalPlanned > 0 ? Math.min(100, Math.round((totalActual / totalPlanned) * 100)) : 0;
      const delayedCount = steps.filter((step) => step.status === "delayed").length;
      const trend = buildWorkflowTrend(steps.map((step) => step.trend));
      const status: StatusTone = totalPlanned === 0
        ? "not_started"
        : delayedCount > 0
          ? "delayed"
          : steps.every((step) => step.status === "done")
            ? "done"
            : steps.every((step) => step.status === "not_started")
              ? "not_started"
              : "on_track";

      return {
        ...workflow,
        steps,
        metrics: {
          totalPlanned,
          totalActual,
          totalRemaining,
          averageProgress,
          delayedCount,
          status,
          trend,
        } satisfies WorkflowMetrics,
      };
    });
  }, [
    filteredWorkflows,
    dayPlans,
    selectedDate,
    today,
    nowMinutes,
    reportedQuantityByStep,
    submissionRecordsByStep,
    deploymentTimeSlots,
    deploymentIntervalMinutes,
    deploymentSnapshotsByTime,
  ]);

  const processRows = useMemo(
    () => workflowRows.flatMap((workflow) => workflow.steps.map((step) => ({ ...step, workflowColor: workflow.color }))).filter((step) => filterProcessId === "all" || step.processId === filterProcessId),
    [workflowRows, filterProcessId],
  );

  const areaRows = useMemo(() => {
    const map = new Map<string, AreaMetrics>();
    workflowRows.forEach((workflow) => {
      const current = map.get(workflow.areaId) ?? {
        areaId: workflow.areaId,
        areaName: workflow.areaName,
        workflowCount: 0,
        processCount: 0,
        totalPlanned: 0,
        totalActual: 0,
        averageProgress: 0,
        delayedCount: 0,
      };
      current.workflowCount += 1;
      current.processCount += workflow.steps.length;
      current.totalPlanned += workflow.metrics.totalPlanned;
      current.totalActual += workflow.metrics.totalActual;
      current.delayedCount += workflow.metrics.delayedCount;
      current.averageProgress = current.totalPlanned > 0 ? Math.min(100, Math.round((current.totalActual / current.totalPlanned) * 100)) : 0;
      map.set(workflow.areaId, current);
    });
    return Array.from(map.values());
  }, [workflowRows]);

  const kpis = useMemo(() => {
    const totalPlanned = sum(workflowRows.map((workflow) => workflow.metrics.totalPlanned));
    const totalActual = sum(workflowRows.map((workflow) => workflow.metrics.totalActual));
    const delayed = sum(workflowRows.map((workflow) => workflow.metrics.delayedCount));
    const progress = totalPlanned > 0 ? Math.min(100, Math.round((totalActual / totalPlanned) * 100)) : 0;
    return [
      { label: "対象ワークフロー", value: workflowRows.length.toLocaleString("ja-JP"), suffix: "件", icon: Layers, color: "text-cyan-500" },
      { label: "対象工程", value: processRows.length.toLocaleString("ja-JP"), suffix: "件", icon: Package, color: "text-blue-500" },
      { label: "予定合計", value: totalPlanned.toLocaleString("ja-JP"), suffix: "個", icon: Target, color: "text-violet-500" },
      { label: "実績合計", value: totalActual.toLocaleString("ja-JP"), suffix: "個", icon: TrendingUp, color: "text-emerald-500" },
      { label: "平均進捗", value: `${progress}`, suffix: "%", icon: BarChart3, color: progress >= 70 ? "text-emerald-500" : progress >= 40 ? "text-amber-500" : "text-rose-500" },
      { label: "遅延工程", value: delayed.toLocaleString("ja-JP"), suffix: "件", icon: AlertTriangle, color: delayed > 0 ? "text-amber-500" : "text-emerald-500" },
    ];
  }, [workflowRows, processRows]);

  const handleWorkflowPlannedChange = (workflow: WorkflowView, value: number) => {
    const distributed = distributeWorkflowPlan(value, workflow.steps);
    setPlanStore((prev) => {
      let nextStore = prev;
      workflow.steps.forEach((step) => {
        nextStore = updateStepPlanEntry(
          nextStore,
          selectedDate,
          step.id,
          { planned: distributed[step.id] ?? 0 },
          {
            planned: step.defaultPlanned,
            startTime: step.startTime,
            targetEndTime: step.targetEndTime,
          },
        );
      });
      return nextStore;
    });
  };

  const handleProcessPlannedChange = (stepId: string, value: number) => {
    const step = processRows.find((row) => row.id === stepId);
    if (!step) return;
    setPlanStore((prev) =>
      updateStepPlanEntry(
        prev,
        selectedDate,
        stepId,
        { planned: Math.max(0, value) },
        {
          planned: step.defaultPlanned,
          startTime: step.startTime,
          targetEndTime: step.targetEndTime,
        },
      ),
    );
  };

  const handleProcessTimeChange = (stepId: string, field: "startTime" | "targetEndTime", value: string) => {
    const step = processRows.find((row) => row.id === stepId);
    if (!step) return;
    setPlanStore((prev) =>
      updateStepPlanEntry(
        prev,
        selectedDate,
        stepId,
        { [field]: value } as Pick<typeof step, "startTime" | "targetEndTime">,
        {
          planned: step.defaultPlanned,
          startTime: step.startTime,
          targetEndTime: step.targetEndTime,
        },
      ),
    );
  };

  const cardClass = `${c.bgCard} border ${c.border} rounded-3xl`;
  const inputClass = `${c.bgSurface} ${c.borderCard} ${c.textPrimary} w-full rounded-xl border px-3 py-2 text-[13px] outline-none`;
  const trendButtonClass = `rounded-2xl p-2 text-left transition ${c.isDark ? "hover:bg-slate-900/60" : "hover:bg-slate-100"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60`;

  return (
    <div className={`flex h-full min-h-0 flex-col ${c.isDark ? "bg-[#0d0f16]" : "bg-slate-50"}`}>
      <div className={`${c.bgCard} border-b ${c.border} px-6 py-4`}>
        <div className="grid gap-3 lg:grid-cols-6">
          {kpis.map((item) => (
            <div key={item.label} className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-[11px] ${c.textMuted}`}>{item.label}</span>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className={`text-[20px] font-semibold tabular-nums ${c.textPrimary}`}>
                {item.value}
                <span className={`ml-1 text-[11px] ${c.textMuted}`}>{item.suffix}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${c.bgCard} border-b ${c.border} px-6 py-3`}>
        <div className="grid gap-3 xl:grid-cols-[220px_180px_180px_180px_minmax(0,1fr)]">
          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>作業日</span>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>荷主</span>
            <select value={filterShipperId} onChange={(event) => setFilterShipperId(event.target.value)} className={inputClass}>
              <option value="all">すべて</option>
              {shipperOptions.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>エリア</span>
            <select value={filterAreaId} onChange={(event) => setFilterAreaId(event.target.value)} className={inputClass}>
              <option value="all">すべて</option>
              {areaOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>工程</span>
            <select value={filterProcessId} onChange={(event) => setFilterProcessId(event.target.value)} className={inputClass}>
              <option value="all">すべて</option>
              {processOptions.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>キーワード</span>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${c.bgSurface} ${c.borderCard}`}>
              <Search className={`h-4 w-4 ${c.textMuted}`} />
              <input value={filterKeyword} onChange={(event) => setFilterKeyword(event.target.value)} placeholder="ワークフロー名・工程名で検索" className={`w-full bg-transparent text-[13px] ${c.textPrimary} outline-none placeholder:text-slate-400`} />
            </div>
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-5">
          <section className={`${cardClass} p-4`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`text-[15px] font-semibold ${c.textPrimary}`}>エリア別サマリー</h2>
                <p className={`text-[12px] ${c.textSecondary}`}>絞り込み後の進捗と予定数をエリア単位で確認できます</p>
              </div>
              <div className={`text-[12px] ${c.textMuted}`}>{areaRows.length} エリア表示</div>
            </div>
            {areaRows.length === 0 ? (
              <div className={`rounded-2xl border border-dashed px-4 py-10 text-center text-[13px] ${c.borderCard} ${c.textSecondary}`}>
                条件に一致するデータがありません
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-4">
                {areaRows.map((area) => {
                  const tone = area.averageProgress >= 70 ? "text-emerald-500" : area.averageProgress >= 40 ? "text-amber-500" : "text-rose-500";
                  return (
                    <div key={area.areaId} className={`${c.bgSurface} ${c.borderCard} rounded-2xl border p-4`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className={`text-[14px] font-semibold ${c.textPrimary}`}>{area.areaName}</div>
                          <div className={`mt-1 text-[11px] ${c.textSecondary}`}>{area.workflowCount}ワークフロー / {area.processCount}工程</div>
                        </div>
                        <div className={`text-[18px] font-semibold ${tone}`}>{area.averageProgress}%</div>
                      </div>
                      <div className={`mt-3 h-2 rounded-full ${c.isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                        <div className={`h-2 rounded-full ${area.averageProgress >= 70 ? "bg-emerald-500" : area.averageProgress >= 40 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.max(area.averageProgress, 4)}%` }} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                        <div><div className={c.textMuted}>予定</div><div className={c.textPrimary}>{area.totalPlanned.toLocaleString("ja-JP")}</div></div>
                        <div><div className={c.textMuted}>実績</div><div className={c.textPrimary}>{area.totalActual.toLocaleString("ja-JP")}</div></div>
                        <div><div className={c.textMuted}>遅延</div><div className={area.delayedCount > 0 ? "text-amber-500" : c.textPrimary}>{area.delayedCount}件</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 ${c.border}">
              <div>
                <h2 className={`text-[15px] font-semibold ${c.textPrimary}`}>ワークフロー別予定数</h2>
                <p className={`text-[12px] ${c.textSecondary}`}>ワークフロー単位で予定数を入力すると、工程別へ自動配賦します</p>
              </div>
              <div className={`text-[12px] ${c.textMuted}`}>更新時刻 {now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1160px] w-full">
                <thead>
                  <tr className={`border-b ${c.border}`}>
                    {[
                      "ワークフロー",
                      "荷主",
                      "エリア",
                      "工程数",
                      "予定数",
                      "実績",
                      "残数",
                      "進捗",
                      "遅延工程",
                      "推移",
                      "最終更新",
                    ].map((header) => (
                      <th key={header} className={`px-4 py-3 text-left text-[11px] font-medium ${c.textMuted}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workflowRows.map((workflow) => {
                    const tone = processColorClasses[workflow.color] ?? processColorClasses.cyan;
                    const status = statusConfig(workflow.metrics.status);
                    return (
                      <tr key={workflow.id} className={`border-b ${c.borderCard} align-top`}>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 h-3 w-3 rounded-full border ${tone.bg} ${tone.border}`} />
                            <div>
                              <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{workflow.workflowName}</div>
                              <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${status.className}`}>
                                <status.icon className="h-3 w-3" />
                                {status.label}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-[12px] ${c.textSecondary}`}>{workflow.shipperName}</td>
                        <td className={`px-4 py-3 text-[12px] ${c.textSecondary}`}>{workflow.areaName}</td>
                        <td className={`px-4 py-3 text-[12px] ${c.textPrimary}`}>{workflow.steps.length}工程</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            step={10}
                            value={workflow.metrics.totalPlanned}
                            onChange={(event) => handleWorkflowPlannedChange(workflow, Number(event.target.value) || 0)}
                            className={`${inputClass} max-w-[140px]`}
                          />
                        </td>
                        <td className="px-4 py-3 text-[12px] font-semibold text-cyan-500 tabular-nums">{workflow.metrics.totalActual.toLocaleString("ja-JP")}</td>
                        <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}>{workflow.metrics.totalRemaining.toLocaleString("ja-JP")}</td>
                        <td className="px-4 py-3 min-w-[180px]">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 flex-1 rounded-full ${c.isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                              <div className={`h-2 rounded-full ${workflow.metrics.averageProgress >= 70 ? "bg-emerald-500" : workflow.metrics.averageProgress >= 40 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.max(workflow.metrics.averageProgress, 4)}%` }} />
                            </div>
                            <span className={`text-[11px] font-semibold ${workflow.metrics.averageProgress >= 70 ? "text-emerald-500" : workflow.metrics.averageProgress >= 40 ? "text-amber-500" : "text-rose-500"}`}>{workflow.metrics.averageProgress}%</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-[12px] ${workflow.metrics.delayedCount > 0 ? "text-amber-500" : c.textSecondary}`}>{workflow.metrics.delayedCount}件</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedTrend({
                              title: workflow.workflowName,
                              subtitle: `${workflow.shipperName} / ${workflow.areaName}`,
                              points: workflow.metrics.trend,
                              plannedTotal: workflow.metrics.totalPlanned,
                              actualTotal: workflow.metrics.totalActual,
                              statusLabel: status.label,
                            })}
                            className={trendButtonClass}
                            aria-label={`${workflow.workflowName} の推移を拡大表示`}
                          >
                            <TrendSparkline points={workflow.metrics.trend} themeColors={c} />
                          </button>
                        </td>
                        <td className={`px-4 py-3 text-[12px] ${c.textSecondary}`}>{formatTimestamp(workflow.updatedAt)}</td>
                      </tr>
                    );
                  })}
                  {workflowRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className={`px-4 py-10 text-center text-[13px] ${c.textSecondary}`}>条件に一致するワークフローがありません</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${cardClass} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 ${c.border}">
              <div>
                <h2 className={`text-[15px] font-semibold ${c.textPrimary}`}>工程別進捗と予定数</h2>
                <p className={`text-[12px] ${c.textSecondary}`}>工程単位で予定数・開始予定・終了予定を調整し、現場配置と同じ前提で進捗を把握します</p>
              </div>
              <div className={`text-[12px] ${c.textMuted}`}>{processRows.length} 工程表示</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1520px] w-full">
                <thead>
                  <tr className={`border-b ${c.border}`}>
                    {[
                      "ワークフロー",
                      "工程",
                      "人員",
                      "予定数",
                      "開始予定",
                      "終了予定",
                      "実績",
                      "残数",
                      "進捗",
                      "UPH",
                      "推移",
                      "見込",
                      "状況",
                    ].map((header) => (
                      <th key={header} className={`px-4 py-3 text-left text-[11px] font-medium ${c.textMuted}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processRows.map((step) => {
                    const tone = processColorClasses[step.color] ?? processColorClasses.cyan;
                    const status = statusConfig(step.status);
                    return (
                      <tr key={step.id} className={`border-b ${c.borderCard}`}>
                        <td className="px-4 py-3">
                          <div className={`text-[12px] font-semibold ${c.textPrimary}`}>{step.workflowName}</div>
                          <div className={`mt-1 text-[11px] ${c.textSecondary}`}>{step.shipperName} / {step.areaName}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone.bg} ${tone.text}`}>
                              <step.icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className={`text-[12px] font-semibold ${c.textPrimary}`}>{step.processName}</div>
                              <div className={`text-[11px] ${c.textSecondary}`}>{step.description}</div>
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-[12px] ${c.textSecondary}`}>{step.headcount}名</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            step={10}
                            value={step.planned}
                            onChange={(event) => handleProcessPlannedChange(step.id, Number(event.target.value) || 0)}
                            className={`${inputClass} max-w-[140px]`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="time"
                            value={step.startTime}
                            onChange={(event) => handleProcessTimeChange(step.id, "startTime", event.target.value)}
                            className={`${inputClass} max-w-[132px]`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="time"
                            value={step.targetEndTime}
                            onChange={(event) => handleProcessTimeChange(step.id, "targetEndTime", event.target.value)}
                            className={`${inputClass} max-w-[132px]`}
                          />
                        </td>
                        <td className="px-4 py-3 text-[12px] font-semibold text-cyan-500 tabular-nums">{step.actual.toLocaleString("ja-JP")}</td>
                        <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}>{step.remaining.toLocaleString("ja-JP")}</td>
                        <td className="px-4 py-3 min-w-[170px]">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 flex-1 rounded-full ${c.isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                              <div className={`h-2 rounded-full ${step.progress >= 70 ? "bg-emerald-500" : step.progress >= 40 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.max(step.progress, 4)}%` }} />
                            </div>
                            <span className={`text-[11px] font-semibold ${step.progress >= 70 ? "text-emerald-500" : step.progress >= 40 ? "text-amber-500" : "text-rose-500"}`}>{step.progress}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[12px] font-semibold text-violet-500 tabular-nums">{step.totalUph.toLocaleString("ja-JP")}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedTrend({
                              title: step.processName,
                              subtitle: `${step.workflowName} / ${step.shipperName} / ${step.areaName}`,
                              points: step.trend,
                              plannedTotal: step.planned,
                              actualTotal: step.actual,
                              statusLabel: status.label,
                            })}
                            className={trendButtonClass}
                            aria-label={`${step.processName} の推移を拡大表示`}
                          >
                            <TrendSparkline points={step.trend} themeColors={c} />
                          </button>
                        </td>
                        <td className={`px-4 py-3 text-[12px] ${step.status === "delayed" ? "text-amber-500" : c.textPrimary}`}>{step.eta}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${status.className}`}>
                            <status.icon className="h-3 w-3" />
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {processRows.length === 0 && (
                    <tr>
                      <td colSpan={13} className={`px-4 py-10 text-center text-[13px] ${c.textSecondary}`}>条件に一致する工程がありません</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
      {selectedTrend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setSelectedTrend(null)}>
          <div
            className={`${c.bgCard} ${c.border} w-full max-w-5xl rounded-[28px] border shadow-2xl`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${c.border}`}>
              <div>
                <div className={`text-[20px] font-semibold ${c.textPrimary}`}>{selectedTrend.title}</div>
                <div className={`mt-1 text-[13px] ${c.textSecondary}`}>{selectedTrend.subtitle}</div>
                <div className={`mt-2 text-[11px] ${c.textMuted}`}>{selectedDate} の推移</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTrend(null)}
                className={`${c.bgSurface} ${c.borderCard} rounded-2xl border p-2 ${c.textSecondary} transition ${c.isDark ? "hover:bg-slate-900" : "hover:bg-slate-100"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60`}
                aria-label="閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-3 md:grid-cols-4">
                <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                  <div className={`text-[11px] ${c.textMuted}`}>予定合計</div>
                  <div className={`mt-1 text-[20px] font-semibold text-violet-500 tabular-nums`}>{selectedTrend.plannedTotal.toLocaleString("ja-JP")}</div>
                </div>
                <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                  <div className={`text-[11px] ${c.textMuted}`}>実績合計</div>
                  <div className={`mt-1 text-[20px] font-semibold text-cyan-500 tabular-nums`}>{selectedTrend.actualTotal.toLocaleString("ja-JP")}</div>
                </div>
                <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                  <div className={`text-[11px] ${c.textMuted}`}>差分</div>
                  <div className={`mt-1 text-[20px] font-semibold tabular-nums ${selectedTrend.plannedTotal - selectedTrend.actualTotal > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                    {(selectedTrend.plannedTotal - selectedTrend.actualTotal).toLocaleString("ja-JP")}
                  </div>
                </div>
                <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                  <div className={`text-[11px] ${c.textMuted}`}>状況</div>
                  <div className={`mt-1 text-[20px] font-semibold ${c.textPrimary}`}>{selectedTrend.statusLabel}</div>
                </div>
              </div>
              <TrendDetailChart points={selectedTrend.points} themeColors={c} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
