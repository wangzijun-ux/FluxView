import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, Clock3, Search, Target, TrendingUp, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
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

function formatEta(value: string, planned: number, actual: number, totalUph: number) {
  if (planned <= 0) return "-";
  if (actual >= planned) return "完了";
  if (totalUph <= 0) return "-";
  return value;
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

const DEFAULT_DEPLOYMENT_INTERVAL_MINUTES = 30;
const DEPLOYMENT_DAY_END = 24 * 60;
const TREND_SAMPLE_MINUTES = [6 * 60, 8 * 60, 10 * 60, 12 * 60, 14 * 60, 16 * 60, 18 * 60, 20 * 60];

type StatusTone = "on_track" | "delayed" | "not_started" | "done";
type TrendPoint = { label: string; planned: number; actual: number };
type TrendDialogState = {
  stepId: string;
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
  const safePlanned = Math.max(0, planned);
  if (safePlanned === 0) return 0;

  const effectiveUph = Math.max(uph, 1);
  const startMinutes = parseTime(startTime);
  const endMinutes = parseTime(targetEndTime);
  const durationMinutes = endMinutes - startMinutes;

  if (durationMinutes <= 0) return Math.max(1, fallbackHeadcount);
  return Math.max(1, Math.ceil(safePlanned / (effectiveUph * (durationMinutes / 60))));
}

function calculateRequiredPersonHours(planned: number, uph: number) {
  if (planned <= 0) return 0;
  return Number((planned / Math.max(uph, 1)).toFixed(1));
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

function countAssigned(snapshot: Record<string, string[]> | undefined, stepId: string) {
  return (snapshot?.[stepId] ?? []).filter(Boolean).length;
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

function getStepExecutionMetrics(params: {
  stepId: string;
  stepUph: number;
  requiredHeadcount: number;
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
    requiredHeadcount,
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
  const totalUph = requiredHeadcount > 0 ? requiredHeadcount * stepUph : 0;

  let eta = "-";
  if (planned === 0) {
    eta = "未設定";
  } else if (remaining === 0) {
    eta = "完了";
  } else {
    const projectedEta = projectEtaMinutes({
      stepId,
      stepUph,
      stepStartTime: startTime,
      planned,
      referenceMinutes: Math.max(referenceMinutes, parseTime(startTime)),
      timeLabels,
      intervalMinutes,
      snapshotsByTime,
    });
    eta = projectedEta === null ? "-" : formatTime(Math.min(projectedEta, DEPLOYMENT_DAY_END));
  }

  const plannedAtReference = isPast
    ? planned
    : isFuture
      ? 0
      : getPlannedValueAtMinute(startTime, targetEndTime, planned, referenceMinutes);
  const targetMinutes = parseTime(targetEndTime);

  let status: StatusTone = "on_track";
  if (planned === 0) status = "not_started";
  else if (remaining === 0) status = "done";
  else if (isFuture || referenceMinutes <= parseTime(startTime)) status = "not_started";
  else if (isPast && actual < planned) status = "delayed";
  else if (eta !== "-" && eta !== "未設定" && eta !== "完了" && parseTime(eta) > targetMinutes) status = "delayed";
  else if (plannedAtReference > 0 && progress + 12 < Math.round((plannedAtReference / planned) * 100)) status = "delayed";

  return { actual, remaining, progress, totalUph, eta, status };
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
      return { label: "遅延", className: "bg-amber-500/15 text-amber-500", icon: AlertTriangle };
    case "not_started":
      return { label: "未着手", className: "bg-slate-500/15 text-slate-500", icon: Clock3 };
    default:
      return { label: "進行中", className: "bg-cyan-500/15 text-cyan-500", icon: TrendingUp };
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

export function ProcessSummary() {
  const c = useThemeColors();
  const { selectedSiteId, sites, workflows, shippers, processes } = useMasterData();

  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [keyword, setKeyword] = useState("");
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

  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const scopedWorkflows = useMemo(
    () => workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)),
    [workflows, siteScope.siteIds],
  );
  const workflowViews = useMemo(
    () => buildDeploymentWorkflows(scopedWorkflows, shippers, sites, processes),
    [scopedWorkflows, shippers, sites, processes],
  );
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

  const rows = useMemo(() => {
    const dayStore = planStore[selectedDate];

    return workflowViews
      .map((workflow, workflowIndex) => {
        const steps = workflow.steps.map((step, stepIndex) => {
          const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph);
          const plan = resolveStepPlanValues(dayStore, step.id, {
            planned: defaults.planned,
            startTime: step.startTime,
            targetEndTime: step.targetEndTime,
          });
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
            requiredHeadcount,
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
            requiredHeadcount,
            requiredPersonHours: calculateRequiredPersonHours(plan.planned, step.uph),
            actual: metrics.actual,
            remaining: metrics.remaining,
            totalUph: metrics.totalUph,
            progress: metrics.progress,
            eta: metrics.eta,
            status: metrics.status,
            trend,
          };
        });

        const normalizedKeyword = keyword.trim().toLowerCase();
        const filteredSteps = steps.filter((step) => {
          if (!normalizedKeyword) return true;
          const haystack = `${workflow.workflowName} ${step.processName} ${step.manual} ${step.caution}`.toLowerCase();
          return haystack.includes(normalizedKeyword);
        });

        return {
          ...workflow,
          steps: filteredSteps,
          totalPlanned: filteredSteps.reduce((sum, step) => sum + step.planned, 0),
          totalActual: filteredSteps.reduce((sum, step) => sum + step.actual, 0),
        };
      })
      .filter((workflow) => workflow.steps.length > 0);
  }, [
    workflowViews,
    planStore,
    selectedDate,
    reportedQuantityMap,
    keyword,
    submissionRecordsByStep,
    today,
    nowMinutes,
    deploymentTimeLabels,
    deploymentIntervalMinutes,
    storedDeploymentSnapshots,
  ]);

  const activeTrend = useMemo(() => {
    if (!selectedTrend) return null;

    for (const workflow of rows) {
      const step = workflow.steps.find((item) => item.id === selectedTrend.stepId);
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
    const workflowCount = rows.length;
    const stepCount = rows.reduce((sum, workflow) => sum + workflow.steps.length, 0);
    const planned = rows.reduce((sum, workflow) => sum + workflow.totalPlanned, 0);
    const actual = rows.reduce((sum, workflow) => sum + workflow.totalActual, 0);

    return {
      workflowCount,
      stepCount,
      planned,
      actual,
      progress: planned > 0 ? (actual / planned) * 100 : 0,
    };
  }, [rows]);

  const inputClass = `h-10 w-full rounded-xl border px-3 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`;
  const cardClass = `${c.bgCard} border ${c.border} rounded-2xl`;
  const trendButtonClass = `mx-auto block rounded-2xl p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
    c.isDark ? "hover:bg-slate-900/70" : "hover:bg-slate-100"
  }`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <div className={`${cardClass} shrink-0`}>
        <div className={`flex flex-col gap-4 border-b px-5 py-4 ${c.border}`}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`text-lg font-semibold ${c.textPrimary}`}>進捗管理</div>
              <div className={`text-sm ${c.textSecondary}`}>
                上部で選択した拠点を対象に、業務ごとに工程の予定数と進捗を管理します。
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>業務: {totals.workflowCount}件</span>
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>工程: {totals.stepCount}件</span>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
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
                  placeholder="業務名 / 工程 / マニュアル / 注意事項"
                  className={`${inputClass} pl-10`}
                />
              </div>
            </label>
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: BarChart3,
              label: "対象業務数",
              value: `${totals.workflowCount} 件`,
              sub: `工程 ${totals.stepCount} 件`,
              color: "text-cyan-500",
              bg: "bg-cyan-500/10",
            },
            {
              icon: Target,
              label: "予定数合計",
              value: `${totals.planned.toLocaleString("ja-JP")} 件`,
              sub: "業務別・工程別の入力値",
              color: "text-amber-500",
              bg: "bg-amber-500/10",
            },
            {
              icon: TrendingUp,
              label: "実績数合計",
              value: `${totals.actual.toLocaleString("ja-JP")} 件`,
              sub: `進捗率 ${formatPercent(totals.progress)}`,
              color: "text-emerald-500",
              bg: "bg-emerald-500/10",
            },
            {
              icon: CalendarDays,
              label: "対象日",
              value: selectedDate,
              sub: "日次集計",
              color: "text-violet-500",
              bg: "bg-violet-500/10",
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`rounded-2xl border p-4 ${c.borderCard} ${c.bgPanel}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-xs ${c.textSecondary}`}>{card.label}</div>
                    <div className={`mt-1 text-lg font-semibold ${c.textPrimary}`}>{card.value}</div>
                    <div className={`mt-1 text-xs ${c.textMuted}`}>{card.sub}</div>
                  </div>
                  <div className={`rounded-xl p-2 ${card.bg}`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-4">
          {rows.map((workflow, workflowIndex) => (
            <section key={workflow.id} className={cardClass}>
              <div className={`border-b px-5 py-4 ${c.border}`}>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className={`text-base font-semibold ${c.textPrimary}`}>{workflow.workflowName}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>
                      予定 {workflow.totalPlanned.toLocaleString("ja-JP")} 件
                    </span>
                    <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>
                      実績 {workflow.totalActual.toLocaleString("ja-JP")} 件
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1480px] w-full text-center text-sm">
                  <thead className={`${c.bgSurface} ${c.textSecondary}`}>
                    <tr>
                      <th className="px-4 py-3 text-center font-medium">工程</th>
                      <th className="px-4 py-3 text-center font-medium">開始予定時刻</th>
                      <th className="px-4 py-3 text-center font-medium">目標完了時刻</th>
                      <th className="px-4 py-3 text-center font-medium">予定数</th>
                      <th className="px-4 py-3 text-center font-medium">実績数</th>
                      <th className="px-4 py-3 text-center font-medium">所要人時</th>
                      <th className="px-4 py-3 text-center font-medium">進捗</th>
                      <th className="px-4 py-3 text-center font-medium">UPH</th>
                      <th className="px-4 py-3 text-center font-medium">予実推移</th>
                      <th className="px-4 py-3 text-center font-medium">完了見込み時刻</th>
                      <th className="px-4 py-3 text-center font-medium">状況</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflow.steps.map((step, stepIndex) => (
                      <tr key={step.id} className={`border-t ${c.borderCard}`}>
                        <td className="px-4 py-4 align-middle">
                          <div className={`font-medium ${c.textPrimary}`}>{step.processName}</div>
                          {(step.manual || step.caution) && (
                            <div className={`mt-2 space-y-1 text-xs ${c.textSecondary}`}>
                              {step.manual && <div>マニュアル: {step.manual}</div>}
                              {step.caution && <div>注意事項: {step.caution}</div>}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <input
                            type="time"
                            value={step.startTime}
                            onChange={(event) =>
                              setPlanStore((prev) =>
                                updateStepPlanEntry(
                                  prev,
                                  selectedDate,
                                  step.id,
                                  { startTime: event.target.value },
                                  buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph),
                                ),
                              )
                            }
                            className={`${inputClass} mx-auto max-w-[132px] text-center`}
                          />
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <input
                            type="time"
                            value={step.targetEndTime}
                            onChange={(event) =>
                              setPlanStore((prev) =>
                                updateStepPlanEntry(
                                  prev,
                                  selectedDate,
                                  step.id,
                                  { targetEndTime: event.target.value },
                                  buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph),
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
                            value={step.planned}
                            onChange={(event) =>
                              setPlanStore((prev) =>
                                updateStepPlanEntry(
                                  prev,
                                  selectedDate,
                                  step.id,
                                  { planned: Math.max(0, Number(event.target.value) || 0) },
                                  buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph),
                                ),
                              )
                            }
                            className={`${inputClass} mx-auto max-w-[132px] text-center`}
                          />
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className={`font-medium ${c.textPrimary}`}>{step.actual.toLocaleString("ja-JP")} 件</div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className={`${c.textPrimary}`}>{step.requiredPersonHours.toFixed(1)} 人時</div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className="mx-auto min-w-[160px]">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className={c.textSecondary}>{formatPercent(step.progress)}</span>
                              <span className={c.textMuted}>
                                {step.actual.toLocaleString("ja-JP")} / {step.planned.toLocaleString("ja-JP")}
                              </span>
                            </div>
                            <div className={`mt-2 h-2 rounded-full ${c.bgSurface}`}>
                              <div
                                className={`h-2 rounded-full transition-all ${
                                  step.progress >= 70 ? "bg-emerald-500" : step.progress >= 40 ? "bg-amber-500" : "bg-rose-500"
                                }`}
                                style={{ width: `${Math.min(step.progress, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className="font-semibold text-violet-500">{step.totalUph.toLocaleString("ja-JP")}</div>
                          <div className={`mt-1 text-xs ${c.textMuted}`}>単位 {step.uph.toLocaleString("ja-JP")}</div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <button
                            type="button"
                            onClick={() => setSelectedTrend({ stepId: step.id })}
                            className={trendButtonClass}
                            aria-label={`${step.processName} の予実推移を詳しく見る`}
                          >
                            <TrendSparkline points={step.trend} colors={c} />
                          </button>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <div className={`${c.textPrimary}`}>{step.eta}</div>
                        </td>
                        <td className="px-4 py-4 align-middle">
                          {(() => {
                            const status = statusConfig(step.status);
                            const StatusIcon = status.icon;
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] ${status.className}`}>
                                <StatusIcon className="h-3 w-3" />
                                {status.label}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          {rows.length === 0 && (
            <div className={`${cardClass} p-10 text-center`}>
              <div className={`text-base font-medium ${c.textPrimary}`}>表示できる進捗データがありません</div>
              <div className={`mt-2 text-sm ${c.textSecondary}`}>
                対象日、拠点、検索条件を確認してください。
              </div>
            </div>
          )}
        </div>
      </div>
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
                  <div className={`mt-2 text-[11px] ${c.textMuted}`}>{selectedDate} の予実推移詳細</div>
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
                    <div className={`text-[11px] ${c.textMuted}`}>予定合計</div>
                    <div className="mt-1 text-[20px] font-semibold text-violet-500 tabular-nums">
                      {activeTrend.step.planned.toLocaleString("ja-JP")} 件
                    </div>
                  </div>
                  <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                    <div className={`text-[11px] ${c.textMuted}`}>実績合計</div>
                    <div className="mt-1 text-[20px] font-semibold text-cyan-500 tabular-nums">
                      {activeTrend.step.actual.toLocaleString("ja-JP")} 件
                    </div>
                  </div>
                  <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                    <div className={`text-[11px] ${c.textMuted}`}>差分</div>
                    <div
                      className={`mt-1 text-[20px] font-semibold tabular-nums ${
                        activeTrend.step.planned - activeTrend.step.actual > 0 ? "text-amber-500" : "text-emerald-500"
                      }`}
                    >
                      {(activeTrend.step.planned - activeTrend.step.actual).toLocaleString("ja-JP")} 件
                    </div>
                  </div>
                  <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
                    <div className={`text-[11px] ${c.textMuted}`}>状況</div>
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
