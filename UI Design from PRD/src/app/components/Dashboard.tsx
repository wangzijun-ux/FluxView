import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Layers,
  MoreHorizontal,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  alpha,
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
  useTheme as useMuiTheme,
} from "@mui/material";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import { processColorClasses } from "./processStore";
import type { AreaMaster, ProcessMaster, Shipper, WorkflowDefinition } from "./masterStore";

const PLAN_STORAGE_KEY = "fluxview-progress-plans-v1";
const COLORS = ["cyan", "emerald", "violet", "amber", "blue", "rose", "orange", "teal", "indigo"] as const;

type StatusTone = "on_track" | "delayed" | "not_started" | "done";
type PlanStore = Record<string, Record<string, number>>;

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
  color: string;
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
  steps: StepView[];
}

interface StepMetrics {
  planned: number;
  actual: number;
  remaining: number;
  progress: number;
  status: StatusTone;
}

interface WorkflowSummary {
  id: string;
  workflowName: string;
  shipperId: string;
  shipperName: string;
  areaId: string;
  areaName: string;
  color: string;
  processNames: string[];
  stepCount: number;
  totalPlanned: number;
  totalActual: number;
  totalRemaining: number;
  averageProgress: number;
  delayedCount: number;
  status: StatusTone;
}

interface ProcessSummaryRow {
  processId: string;
  processName: string;
  progress: number;
  workers: number;
  status: StatusTone;
}

interface WorkflowGroup {
  shipperId: string;
  shipperName: string;
  workflowCount: number;
  totalPlanned: number;
  totalActual: number;
  averageProgress: number;
  delayedCount: number;
  workflows: WorkflowSummary[];
}

interface AlertItem {
  time: string;
  message: string;
  level: "error" | "warning" | "info";
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
  const safe = Math.max(0, totalMinutes);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hashString(value: string) {
  return Array.from(value).reduce((sum, character, index) => sum + character.charCodeAt(0) * (index + 1), 0);
}

function pickColor(index: number) {
  return COLORS[index % COLORS.length];
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
      steps: workflow.steps.map((step, stepIndex) => {
        const process = processMap.get(step.processId);
        const headcount = Math.max(step.standardHeadcount || process?.defaultHeadcount || 1, 1);
        const uph = step.uph || process?.defaultUph || 100;
        const weight = Math.max(headcount * uph, 1);
        const defaultPlanned = Math.max(400, Math.round((weight * (1.4 + ((workflowIndex + stepIndex) % 3) * 0.25)) / 10) * 10);
        const startMinutes = 6 * 60 + stepIndex * 70 + (workflowIndex % 2) * 15;
        const endMinutes = Math.min(startMinutes + 210 - stepIndex * 10, 20 * 60 + 30);

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
          color: pickColor(workflowIndex + stepIndex),
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

function getStepMetrics(step: StepView, planned: number, selectedDate: string, today: string, nowMinutes: number): StepMetrics {
  const seed = hashString(`${selectedDate}:${step.id}`);
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");
  const timeFactor = clamp((nowMinutes - 6 * 60) / (14 * 60), 0, 1);
  const noise = ((seed % 19) - 9) / 100;

  let progressFactor = 0;
  if (selectedDateValue < todayValue) {
    progressFactor = 0.92 + (seed % 7) / 100;
  } else if (selectedDateValue > todayValue) {
    progressFactor = (seed % 6) / 100;
  } else {
    progressFactor = clamp(0.08 + timeFactor * 0.82 + noise, 0, 0.99);
  }

  const actual = planned > 0 ? Math.min(planned, Math.round((planned * progressFactor) / 10) * 10) : 0;
  const remaining = Math.max(0, planned - actual);
  const progress = planned > 0 ? Math.round((actual / planned) * 100) : 0;

  let status: StatusTone = "on_track";
  if (planned === 0 || actual === 0) status = "not_started";
  else if (remaining === 0 || progress >= 100) status = "done";
  else if (selectedDateValue <= todayValue && progress < 60 && nowMinutes > parseTime(step.targetEndTime) - 60) status = "delayed";

  return { planned, actual, remaining, progress, status };
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

function statusColor(status: StatusTone): "default" | "info" | "warning" | "success" {
  switch (status) {
    case "done":
      return "success";
    case "delayed":
      return "warning";
    case "not_started":
      return "default";
    default:
      return "info";
  }
}

function buildHourlyData(totalPlanned: number, selectedDate: string, today: string, nowMinutes: number) {
  const selectedDateValue = selectedDate.replaceAll("-", "");
  const todayValue = today.replaceAll("-", "");

  return Array.from({ length: 13 }, (_, index) => {
    const minutes = (6 + index) * 60;
    const progressFactor = clamp((minutes - 6 * 60) / (12 * 60), 0, 1);
    const target = Math.round((totalPlanned * progressFactor) / 10) * 10;

    let actualFactor = progressFactor;
    if (selectedDateValue < todayValue) actualFactor = Math.min(1, progressFactor * 1.06);
    else if (selectedDateValue > todayValue) actualFactor = progressFactor * 0.04;
    else actualFactor = clamp(progressFactor * (0.92 + (index % 4) * 0.02), 0, nowMinutes < minutes ? Math.max(0.02, clamp((nowMinutes - 6 * 60) / (12 * 60), 0, 1)) : 1);

    return {
      time: `${String(6 + index).padStart(2, "0")}:00`,
      target,
      actual: Math.round((totalPlanned * actualFactor) / 10) * 10,
    };
  });
}

export function Dashboard() {
  const c = useThemeColors();
  const { shippers, sites, areas, processes, workflows, selectedSiteId } = useMasterData();
  const [selectedDate] = useState(() => toDateInput(new Date()));
  const now = new Date();
  const today = toDateInput(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const siteName = sites.find((site) => site.id === selectedSiteId)?.name ?? "拠点未選択";
  const planStore = useMemo(() => readPlanStore(), []);
  const dayPlans = planStore[selectedDate] ?? {};

  const workflowViews = useMemo(
    () => buildWorkflowViews(workflows.filter((workflow) => workflow.siteId === selectedSiteId), shippers, areas, processes),
    [workflows, selectedSiteId, shippers, areas, processes],
  );

  const workflowSummaries = useMemo<WorkflowSummary[]>(() => {
    return workflowViews.map((workflow) => {
      const stepMetrics = workflow.steps.map((step) => {
        const planned = dayPlans[step.id] ?? step.defaultPlanned;
        return { step, metrics: getStepMetrics(step, planned, selectedDate, today, nowMinutes) };
      });

      const totalPlanned = stepMetrics.reduce((sum, item) => sum + item.metrics.planned, 0);
      const totalActual = stepMetrics.reduce((sum, item) => sum + item.metrics.actual, 0);
      const totalRemaining = stepMetrics.reduce((sum, item) => sum + item.metrics.remaining, 0);
      const averageProgress = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
      const delayedCount = stepMetrics.filter((item) => item.metrics.status === "delayed").length;

      let status: StatusTone = "on_track";
      if (totalPlanned === 0 || totalActual === 0) status = "not_started";
      else if (averageProgress >= 100 || totalRemaining === 0) status = "done";
      else if (delayedCount > 0) status = "delayed";

      return {
        id: workflow.id,
        workflowName: workflow.workflowName,
        shipperId: workflow.shipperId,
        shipperName: workflow.shipperName,
        areaId: workflow.areaId,
        areaName: workflow.areaName,
        color: workflow.color,
        processNames: workflow.steps.map((step) => step.processName),
        stepCount: workflow.steps.length,
        totalPlanned,
        totalActual,
        totalRemaining,
        averageProgress,
        delayedCount,
        status,
      };
    });
  }, [workflowViews, dayPlans, selectedDate, today, nowMinutes]);

  const shipperGroups = useMemo<WorkflowGroup[]>(() => {
    const grouped = new Map<string, WorkflowGroup>();

    workflowSummaries.forEach((workflow) => {
      const current = grouped.get(workflow.shipperId) ?? {
        shipperId: workflow.shipperId,
        shipperName: workflow.shipperName,
        workflowCount: 0,
        totalPlanned: 0,
        totalActual: 0,
        averageProgress: 0,
        delayedCount: 0,
        workflows: [],
      };

      current.workflowCount += 1;
      current.totalPlanned += workflow.totalPlanned;
      current.totalActual += workflow.totalActual;
      current.delayedCount += workflow.delayedCount;
      current.workflows.push(workflow);
      grouped.set(workflow.shipperId, current);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        averageProgress: group.totalPlanned > 0 ? Math.round((group.totalActual / group.totalPlanned) * 100) : 0,
        workflows: group.workflows.sort((left, right) => right.averageProgress - left.averageProgress),
      }))
      .sort((left, right) => right.totalActual - left.totalActual);
  }, [workflowSummaries]);

  const processSummaries = useMemo<ProcessSummaryRow[]>(() => {
    const grouped = new Map<string, { processName: string; planned: number; actual: number; workers: number; delayed: number }>();

    workflowViews.forEach((workflow) => {
      workflow.steps.forEach((step) => {
        const planned = dayPlans[step.id] ?? step.defaultPlanned;
        const metrics = getStepMetrics(step, planned, selectedDate, today, nowMinutes);
        const current = grouped.get(step.processId) ?? {
          processName: step.processName,
          planned: 0,
          actual: 0,
          workers: 0,
          delayed: 0,
        };

        current.planned += metrics.planned;
        current.actual += metrics.actual;
        current.workers += step.headcount;
        current.delayed += metrics.status === "delayed" ? 1 : 0;
        grouped.set(step.processId, current);
      });
    });

    return Array.from(grouped.entries())
      .map(([processId, value]) => {
        const progress = value.planned > 0 ? Math.round((value.actual / value.planned) * 100) : 0;
        let status: StatusTone = "on_track";
        if (value.planned === 0 || value.actual === 0) status = "not_started";
        else if (progress >= 100) status = "done";
        else if (value.delayed > 0) status = "delayed";

        return {
          processId,
          processName: value.processName,
          progress,
          workers: value.workers,
          status,
        };
      })
      .sort((left, right) => right.progress - left.progress)
      .slice(0, 5);
  }, [workflowViews, dayPlans, selectedDate, today, nowMinutes]);

  const totalPlanned = workflowSummaries.reduce((sum, workflow) => sum + workflow.totalPlanned, 0);
  const totalActual = workflowSummaries.reduce((sum, workflow) => sum + workflow.totalActual, 0);
  const averageProgress = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
  const delayedWorkflowCount = workflowSummaries.filter((workflow) => workflow.status === "delayed").length;
  const totalHeadcount = workflowViews.flatMap((workflow) => workflow.steps).reduce((sum, step) => sum + step.headcount, 0);

  const kpiData = [
    {
      label: "対象ワークフロー",
      value: String(workflowSummaries.length),
      total: "件",
      change: workflowSummaries.length > 0 ? `+${shipperGroups.length}` : "0",
      trend: "up" as const,
      icon: Layers,
      color: "cyan",
    },
    {
      label: "本日進捗",
      value: `${averageProgress}%`,
      total: `${totalActual.toLocaleString("ja-JP")}件`,
      change: averageProgress >= 70 ? "+4.8%" : "-2.1%",
      trend: averageProgress >= 70 ? ("up" as const) : ("down" as const),
      icon: Package,
      color: "emerald",
    },
    {
      label: "想定投入人数",
      value: String(totalHeadcount),
      total: "名",
      change: totalHeadcount > 0 ? "+6" : "0",
      trend: "up" as const,
      icon: Users,
      color: "violet",
    },
    {
      label: "遅延ワークフロー",
      value: String(delayedWorkflowCount),
      total: "件",
      change: delayedWorkflowCount > 0 ? `+${delayedWorkflowCount}` : "0",
      trend: delayedWorkflowCount > 0 ? ("down" as const) : ("up" as const),
      icon: AlertTriangle,
      color: "red",
    },
  ];

  const hourlyData = useMemo(
    () => buildHourlyData(totalPlanned || 3000, selectedDate, today, nowMinutes),
    [totalPlanned, selectedDate, today, nowMinutes],
  );

  const alerts = useMemo<AlertItem[]>(() => {
    const delayed = workflowSummaries
      .filter((workflow) => workflow.status === "delayed")
      .slice(0, 3)
      .map((workflow) => ({
        time: formatTime(nowMinutes),
        message: `${workflow.shipperName} / ${workflow.areaName} の進捗が ${workflow.averageProgress}% です。応援配置を確認してください。`,
        level: "warning" as const,
      }));

    const info = workflowSummaries.slice(0, 2).map((workflow, index) => ({
      time: formatTime(Math.max(6 * 60, nowMinutes - (index + 1) * 18)),
      message: `${workflow.shipperName} / ${workflow.areaName} の予定数 ${workflow.totalPlanned.toLocaleString("ja-JP")} 件を監視中です。`,
      level: "info" as const,
    }));

    return delayed.length > 0
      ? [...delayed, ...info].slice(0, 5)
      : [
          {
            time: formatTime(nowMinutes),
            message: "大きな遅延は検出されていません。ワークフローは概ね計画通りです。",
            level: "info",
          },
          ...info,
        ].slice(0, 5);
  }, [workflowSummaries, nowMinutes]);

  const colorMap: Record<string, string> = {
    cyan: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/30",
    emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30",
    violet: "from-violet-500/20 to-violet-500/5 border-violet-500/30",
    red: "from-red-500/20 to-red-500/5 border-red-500/30",
  };

  const iconColorMap: Record<string, string> = {
    cyan: "text-cyan-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
    red: "text-red-400",
  };

  const gridStroke = c.isDark ? "#1e1e2e" : "#e5e7eb";
  const axisStroke = c.isDark ? "#4a4a5e" : "#9ca3af";
  const tickFill = c.isDark ? "#6b6b7e" : "#6b7280";
  const tooltipBg = c.isDark ? "#1a1a2e" : "#ffffff";
  const tooltipBorder = c.isDark ? "#2a2a3e" : "#e5e7eb";
  const tooltipColor = c.isDark ? "#e0e0e0" : "#1f2937";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${c.bgSurface} ${c.borderCard}`}>
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[13px] font-medium text-emerald-400">LIVE</span>
          </div>
          <div className={`rounded-lg border px-3 py-1.5 text-[13px] ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
            {selectedDate}
          </div>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
            <Clock3 className="h-3.5 w-3.5" />
            {formatTime(nowMinutes)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiData.map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border bg-gradient-to-br ${colorMap[kpi.color]} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <kpi.icon className={`h-5 w-5 ${iconColorMap[kpi.color]}`} />
              <div className={`flex items-center gap-1 text-[12px] ${kpi.trend === "up" && kpi.color !== "red" ? "text-emerald-400" : "text-red-400"}`}>
                {kpi.trend === "up" && kpi.color !== "red" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {kpi.change}
              </div>
            </div>
            <div className={`text-[28px] tracking-tight ${c.textPrimary}`}>
              {kpi.value}
              <span className={`ml-1 text-[14px] ${c.textSecondary}`}>{kpi.total}</span>
            </div>
            <div className={`mt-1 text-[13px] ${c.textSecondary}`}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={`xl:col-span-2 rounded-xl border p-5 ${c.bgCard} ${c.border}`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className={`text-[16px] font-semibold ${c.textPrimary}`}>進捗推移</h3>
              <p className={`text-[13px] ${c.textMuted}`}>実績 vs 予定</p>
            </div>
            <div className="flex items-center gap-4 text-[12px]">
              <div className="flex items-center gap-2">
                <div className="h-1 w-3 rounded-full bg-cyan-400" />
                <span className={c.textSecondary}>実績</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-1 w-3 rounded-full ${c.isDark ? "bg-gray-500" : "bg-gray-300"}`} />
                <span className={c.textSecondary}>予定</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={hourlyData}>
              <defs>
                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="time" stroke={axisStroke} tick={{ fontSize: 12, fill: tickFill }} />
              <YAxis stroke={axisStroke} tick={{ fontSize: 12, fill: tickFill }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  border: `1px solid ${tooltipBorder}`,
                  borderRadius: "8px",
                  color: tooltipColor,
                  fontSize: "13px",
                }}
              />
              <Area type="monotone" dataKey="target" stroke={axisStroke} strokeDasharray="5 5" fill="none" />
              <Area type="monotone" dataKey="actual" stroke="#22d3ee" fill="url(#colorActual)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className={`rounded-xl border p-5 ${c.bgCard} ${c.border}`}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className={`text-[16px] font-semibold ${c.textPrimary}`}>工程別進捗</h3>
            <button type="button" className={c.textMuted}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            {processSummaries.length === 0 ? (
              <div className={`rounded-xl border px-4 py-6 text-center text-[13px] ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
                表示できる工程がありません
              </div>
            ) : (
              processSummaries.map((process) => {
                const tone = statusConfig(process.status);
                return (
                  <div key={process.processId}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className={`text-[13px] ${c.textSecondary}`}>{process.processName}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[12px] ${c.textMuted}`}>{process.workers}名</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.className}`}>{process.progress}%</span>
                      </div>
                    </div>
                    <div className={`h-2 w-full overflow-hidden rounded-full ${c.bgSurface}`}>
                      <div
                        className={`h-full rounded-full ${
                          process.status === "delayed"
                            ? "bg-amber-500"
                            : process.status === "done"
                              ? "bg-emerald-500"
                              : process.status === "not_started"
                                ? "bg-slate-400"
                                : "bg-cyan-500"
                        }`}
                        style={{ width: `${process.progress}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={`xl:col-span-2 rounded-xl border p-5 ${c.bgCard} ${c.border}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className={`text-[16px] font-semibold ${c.textPrimary}`}>荷主別ワークフロー進捗</h3>
              <p className={`text-[13px] ${c.textMuted}`}>選択中拠点に紐づくワークフローを荷主単位で表示します。</p>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>{shipperGroups.length}荷主</span>
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>{workflowSummaries.length}WF</span>
            </div>
          </div>

          {shipperGroups.length === 0 ? (
            <div className={`rounded-2xl border px-4 py-10 text-center ${c.bgSurface} ${c.borderCard}`}>
              <div className={`text-[15px] font-semibold ${c.textPrimary}`}>ワークフローがありません</div>
              <div className={`mt-2 text-[13px] ${c.textSecondary}`}>この拠点に紐づく workflow を登録すると、ここに進捗が表示されます。</div>
            </div>
          ) : (
            <div className="space-y-4">
              {shipperGroups.map((group) => (
                <section key={group.shipperId} className={`rounded-2xl border ${c.borderCard}`}>
                  <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 ${c.bgSurface} ${c.borderCard}`}>
                    <div>
                      <div className={`text-[15px] font-semibold ${c.textPrimary}`}>{group.shipperName}</div>
                      <div className={`mt-1 text-[12px] ${c.textMuted}`}>{group.workflowCount} 件のワークフロー</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className={`rounded-full px-2.5 py-1 ${c.bgCard} ${c.textSecondary}`}>
                        実績 {group.totalActual.toLocaleString("ja-JP")}件
                      </span>
                      <span className={`rounded-full px-2.5 py-1 ${c.bgCard} ${c.textSecondary}`}>
                        進捗 {group.averageProgress}%
                      </span>
                      {group.delayedCount > 0 ? (
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-500">
                          遅延工程 {group.delayedCount}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 p-4 lg:grid-cols-2">
                    {group.workflows.map((workflow) => {
                      const tone = processColorClasses[workflow.color] ?? processColorClasses.cyan;
                      const status = statusConfig(workflow.status);
                      const StatusIcon = status.icon;

                      return (
                        <article key={workflow.id} className={`rounded-2xl border p-4 ${c.bgCard} ${c.borderCard}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`truncate text-[14px] font-semibold ${c.textPrimary}`}>{workflow.areaName}</div>
                              <div className={`mt-1 truncate text-[12px] ${c.textSecondary}`}>{workflow.workflowName}</div>
                            </div>
                            <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${status.className}`}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {status.label}
                            </div>
                          </div>

                          <div className={`mt-3 flex flex-wrap gap-2 text-[11px] ${c.textMuted}`}>
                            {workflow.processNames.map((processName) => (
                              <span key={`${workflow.id}:${processName}`} className={`rounded-full border px-2 py-1 ${c.bgSurface} ${c.borderCard}`}>
                                {processName}
                              </span>
                            ))}
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <div>
                              <div className={`text-[11px] ${c.textMuted}`}>予定数</div>
                              <div className={`mt-1 text-[16px] font-semibold ${c.textPrimary}`}>{workflow.totalPlanned.toLocaleString("ja-JP")}</div>
                            </div>
                            <div>
                              <div className={`text-[11px] ${c.textMuted}`}>実績</div>
                              <div className="mt-1 text-[16px] font-semibold text-cyan-500">{workflow.totalActual.toLocaleString("ja-JP")}</div>
                            </div>
                            <div>
                              <div className={`text-[11px] ${c.textMuted}`}>工程数</div>
                              <div className={`mt-1 text-[16px] font-semibold ${c.textPrimary}`}>{workflow.stepCount}</div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <div className="mb-1.5 flex items-center justify-between text-[12px]">
                              <span className={c.textSecondary}>進捗率</span>
                              <span className={`font-semibold ${tone.text}`}>{workflow.averageProgress}%</span>
                            </div>
                            <div className={`h-2 overflow-hidden rounded-full ${c.bgSurface}`}>
                              <div className={`h-full rounded-full ${workflow.status === "delayed" ? "bg-amber-500" : workflow.status === "done" ? "bg-emerald-500" : workflow.status === "not_started" ? "bg-slate-400" : "bg-cyan-500"}`} style={{ width: `${workflow.averageProgress}%` }} />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className={`rounded-xl border p-5 ${c.bgCard} ${c.border}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className={`text-[16px] font-semibold ${c.textPrimary}`}>アラート</h3>
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] text-red-400">
                {alerts.filter((alert) => alert.level !== "info").length}件
              </span>
            </div>
            <button type="button" className={c.textMuted}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div
                key={`${alert.time}-${index}`}
                className={`rounded-lg border p-3 ${
                  alert.level === "error"
                    ? "border-red-500/30 bg-red-500/5"
                    : alert.level === "warning"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : `${c.borderCard} ${c.bgSurface}`
                }`}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      alert.level === "error"
                        ? "bg-red-400"
                        : alert.level === "warning"
                          ? "bg-amber-400"
                          : "bg-cyan-400"
                    }`}
                  />
                  <div>
                    <p className={`text-[13px] leading-6 ${c.textSecondary}`}>{alert.message}</p>
                    <p className={`mt-1 text-[11px] ${c.textMuted}`}>{alert.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { name: "WMS連携", status: "connected", lastSync: formatTime(nowMinutes), direction: "In" },
          { name: "TMS連携", status: "connected", lastSync: formatTime(Math.max(6 * 60, nowMinutes - 5)), direction: "Out" },
          { name: "在庫連携", status: "connected", lastSync: formatTime(Math.max(6 * 60, nowMinutes - 2)), direction: "In" },
          { name: "勤怠連携", status: "scheduled", lastSync: "06:00", direction: "Out" },
        ].map((integration) => (
          <div key={integration.name} className={`flex items-center gap-3 rounded-xl border p-4 ${c.bgCard} ${c.border}`}>
            <div className={`h-2 w-2 rounded-full ${integration.status === "connected" ? "bg-emerald-400" : "bg-gray-500"}`} />
            <div className="flex-1">
              <div className={`text-[13px] ${c.textPrimary}`}>{integration.name}</div>
              <div className={`text-[11px] ${c.textMuted}`}>最終同期 {integration.lastSync}</div>
            </div>
            <span className={`rounded px-2 py-0.5 text-[11px] ${c.bgSurface} ${c.textSecondary}`}>{integration.direction}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
