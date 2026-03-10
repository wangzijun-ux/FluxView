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
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import { processColorClasses } from "./processStore";
import type { AreaMaster, ProcessMaster, Shipper, WorkflowDefinition } from "./masterStore";

const PLAN_STORAGE_KEY = "fluxview-progress-plans-v1";
const COLORS = ["cyan", "emerald", "violet", "amber", "blue", "rose", "orange", "teal", "indigo"] as const;

type PlanStore = Record<string, Record<string, number>>;
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

function hashString(value: string) {
  return Array.from(value).reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 1), 0);
}

function readPlanStore(): PlanStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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
        const defaultPlanned = Math.max(400, Math.round((weight * (1.4 + ((workflowIndex + stepIndex) % 3) * 0.25)) / 10) * 10);
        const startMinutes = 6 * 60 + stepIndex * 70 + (workflowIndex % 2) * 10;
        const endMinutes = Math.min(startMinutes + 240 - stepIndex * 10, 20 * 60 + 30);

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
          defaultPlanned,
          weight,
          startTime: formatTime(startMinutes),
          targetEndTime: formatTime(endMinutes),
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

function getStepMetrics(step: StepView, planned: number, selectedDate: string, today: string, nowMinutes: number): StepMetrics {
  const seed = hashString(`${selectedDate}:${step.id}`);
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");
  const timeFactor = clamp((nowMinutes - 6 * 60) / (14 * 60), 0, 1);
  const noise = ((seed % 19) - 9) / 100;

  let progressFactor = 0;
  if (selectedDateValue < todayValue) {
    progressFactor = 0.88 + (seed % 11) / 100;
  } else if (selectedDateValue > todayValue) {
    progressFactor = (seed % 7) / 100;
  } else {
    progressFactor = clamp(0.1 + timeFactor * 0.78 + noise, 0, 0.98);
  }

  const actual = planned > 0 ? Math.min(planned, Math.round((planned * progressFactor) / 10) * 10) : 0;
  const remaining = Math.max(0, planned - actual);
  const progress = planned > 0 ? Math.round((actual / planned) * 100) : 0;
  const totalUph = Math.max(step.headcount * step.uph, step.uph);

  let eta = "--:--";
  if (planned === 0) eta = "未設定";
  else if (remaining === 0) eta = "完了";
  else if (selectedDateValue > todayValue) eta = step.targetEndTime;
  else eta = formatTime(Math.min(nowMinutes + Math.ceil((remaining / totalUph) * 60), 23 * 60 + 59));

  const expectedProgress = selectedDateValue < todayValue ? 100 : selectedDateValue > todayValue ? 0 : Math.round(timeFactor * 100);
  let status: StatusTone = "on_track";
  if (planned === 0) status = "not_started";
  else if (remaining === 0) status = "done";
  else if (selectedDateValue > todayValue || actual === 0) status = "not_started";
  else if (progress + 12 < expectedProgress) status = "delayed";

  return { planned, actual, remaining, progress, totalUph, eta, status };
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

function buildStepTrend(step: StepView, planned: number, actual: number, selectedDate: string, today: string, nowMinutes: number): TrendPoint[] {
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");
  const effectiveCurrentMinutes = selectedDateValue > todayValue ? 6 * 60 : nowMinutes;

  return TREND_SAMPLE_MINUTES.map((minute) => {
    const plannedAtPoint = getPlannedValueAtMinute(step, planned, minute);
    if (selectedDateValue > todayValue) {
      return { label: formatTime(minute), planned: plannedAtPoint, actual: 0 };
    }

    const effectiveMinute = selectedDateValue < todayValue ? minute : Math.min(minute, effectiveCurrentMinutes);
    const plannedAtEffectiveMinute = getPlannedValueAtMinute(step, planned, effectiveMinute);
    const actualAtPoint = planned > 0
      ? Math.min(actual, Math.round((actual * (plannedAtEffectiveMinute / planned)) / 10) * 10)
      : 0;

    return {
      label: formatTime(minute),
      planned: plannedAtPoint,
      actual: selectedDateValue < todayValue || minute <= effectiveCurrentMinutes ? actualAtPoint : actual,
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

function toSparklinePath(values: number[], width: number, height: number, padding = 4) {
  const maxValue = Math.max(...values, 1);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  return values.map((value, index) => {
    const x = padding + (values.length === 1 ? usableWidth / 2 : (usableWidth * index) / (values.length - 1));
    const y = padding + usableHeight - (value / maxValue) * usableHeight;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function TrendSparkline({ points, themeColors }: { points: TrendPoint[]; themeColors: ReturnType<typeof useThemeColors> }) {
  const width = 160;
  const height = 48;
  const plannedValues = points.map((point) => point.planned);
  const actualValues = points.map((point) => point.actual);
  const guideValues = [0, Math.max(...plannedValues, ...actualValues, 1) / 2, Math.max(...plannedValues, ...actualValues, 1)];
  const plannedPath = toSparklinePath(plannedValues, width, height);
  const actualPath = toSparklinePath(actualValues, width, height);
  const lastPoint = points[points.length - 1];

  return (
    <div className="min-w-[176px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-[160px]" role="img" aria-label={`予定 ${lastPoint?.planned ?? 0}、実績 ${lastPoint?.actual ?? 0} の推移`}>
        {guideValues.map((value, index) => {
          const y = 4 + ((height - 8) * index) / Math.max(guideValues.length - 1, 1);
          return (
            <line
              key={`${value}-${index}`}
              x1="4"
              y1={y}
              x2={width - 4}
              y2={y}
              stroke={themeColors.isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.22)"}
              strokeWidth="1"
            />
          );
        })}
        <path d={plannedPath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={actualPath} fill="none" stroke="#06b6d4" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
  const width = 720;
  const height = 240;
  const padding = 18;
  const plannedValues = points.map((point) => point.planned);
  const actualValues = points.map((point) => point.actual);
  const maxValue = Math.max(...plannedValues, ...actualValues, 1);
  const guideValues = [maxValue, Math.round(maxValue / 2), 0];
  const plannedPath = toSparklinePath(plannedValues, width, height, padding);
  const actualPath = toSparklinePath(actualValues, width, height, padding);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const pointX = (index: number) => padding + (points.length === 1 ? usableWidth / 2 : (usableWidth * index) / Math.max(points.length - 1, 1));
  const pointY = (value: number) => padding + usableHeight - (value / maxValue) * usableHeight;

  return (
    <div className={`${themeColors.bgSurface} ${themeColors.borderCard} rounded-3xl border p-4`}>
      <div className="grid gap-4 lg:grid-cols-[56px_minmax(0,1fr)]">
        <div className={`flex flex-col justify-between py-2 text-[11px] tabular-nums ${themeColors.textMuted}`}>
          {guideValues.map((value, index) => (
            <span key={`${value}-${index}`}>{value.toLocaleString("ja-JP")}</span>
          ))}
        </div>
        <div>
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full" role="img" aria-label="予定数と実績数の推移チャート">
            {guideValues.map((value, index) => {
              const y = padding + ((height - padding * 2) * index) / Math.max(guideValues.length - 1, 1);
              return (
                <line
                  key={`${value}-${index}`}
                  x1={padding}
                  y1={y}
                  x2={width - padding}
                  y2={y}
                  stroke={themeColors.isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.22)"}
                  strokeWidth="1"
                />
              );
            })}
            <path d={plannedPath} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeDasharray="8 6" strokeLinecap="round" strokeLinejoin="round" />
            <path d={actualPath} fill="none" stroke="#06b6d4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((point, index) => (
              <g key={point.label}>
                <circle cx={pointX(index)} cy={pointY(point.planned)} r="4.5" fill="#8b5cf6" />
                <circle cx={pointX(index)} cy={pointY(point.actual)} r="4.5" fill="#06b6d4" />
              </g>
            ))}
          </svg>
          <div className={`mt-3 grid grid-cols-4 gap-2 text-[11px] ${themeColors.textMuted} lg:grid-cols-8`}>
            {points.map((point) => (
              <div key={point.label} className="text-center">{point.label}</div>
            ))}
          </div>
        </div>
      </div>
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
  const [planStore, setPlanStore] = useState<PlanStore>(() => readPlanStore());
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

  const workflowViews = useMemo(
    () => buildWorkflowViews(workflows.filter((workflow) => workflow.siteId === selectedSiteId), shippers, areas, processes),
    [workflows, selectedSiteId, shippers, areas, processes],
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
        const planned = dayPlans[step.id] ?? step.defaultPlanned;
        const metrics = getStepMetrics(step, planned, selectedDate, today, nowMinutes);
        const trend = buildStepTrend(step, planned, metrics.actual, selectedDate, today, nowMinutes);
        return { ...step, ...metrics, trend };
      });

      const totalPlanned = sum(steps.map((step) => step.planned));
      const totalActual = sum(steps.map((step) => step.actual));
      const totalRemaining = Math.max(0, totalPlanned - totalActual);
      const averageProgress = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
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
  }, [filteredWorkflows, dayPlans, selectedDate, today, nowMinutes]);

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
      current.averageProgress = current.totalPlanned > 0 ? Math.round((current.totalActual / current.totalPlanned) * 100) : 0;
      map.set(workflow.areaId, current);
    });
    return Array.from(map.values());
  }, [workflowRows]);

  const kpis = useMemo(() => {
    const totalPlanned = sum(workflowRows.map((workflow) => workflow.metrics.totalPlanned));
    const totalActual = sum(workflowRows.map((workflow) => workflow.metrics.totalActual));
    const delayed = sum(workflowRows.map((workflow) => workflow.metrics.delayedCount));
    const progress = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
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
    setPlanStore((prev) => ({
      ...prev,
      [selectedDate]: {
        ...(prev[selectedDate] ?? {}),
        ...distributed,
      },
    }));
  };

  const handleProcessPlannedChange = (stepId: string, value: number) => {
    setPlanStore((prev) => ({
      ...prev,
      [selectedDate]: {
        ...(prev[selectedDate] ?? {}),
        [stepId]: Math.max(0, value),
      },
    }));
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
                <p className={`text-[12px] ${c.textSecondary}`}>工程単位で予定数を微調整し、全体の進捗を把握します</p>
              </div>
              <div className={`text-[12px] ${c.textMuted}`}>{processRows.length} 工程表示</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1360px] w-full">
                <thead>
                  <tr className={`border-b ${c.border}`}>
                    {[
                      "ワークフロー",
                      "工程",
                      "人員",
                      "予定数",
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
                      <td colSpan={11} className={`px-4 py-10 text-center text-[13px] ${c.textSecondary}`}>条件に一致する工程がありません</td>
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
