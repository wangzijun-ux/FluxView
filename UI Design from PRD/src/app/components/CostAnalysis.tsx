import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  DollarSign,
  Layers3,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import {
  buildDeploymentWorkflows,
  buildSiteScope,
  createTimeSlots,
  parseTimeLabel,
  readFieldDeploymentSnapshots,
  type AssignmentSnapshot,
} from "./fieldDeploymentStore";
import {
  buildStepPlanDefaults,
  readProgressPlanStore,
  resolveStepPlanValues,
} from "./progressPlanStore";
import {
  buildWorkerSubmissionRecords,
  type WorkerSubmissionRecord,
} from "./workerMobileStore";
import { DEFAULT_USER_UNIT_PRICE, readUsersFromStorage } from "./userStore";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const OVERHEAD_RATE = 0.08;
const DEFAULT_SLOT_INTERVAL = 30;
const SECTION_CARD_CLASS = "rounded-[24px] border p-5 shadow-sm";
const SUB_CARD_CLASS = "rounded-[20px] border p-4";
const BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition";

type AnalysisTab = "overview" | "breakdown" | "variance" | "timeslot";
type ViewType = "shipper" | "process";
type PeriodType = "week" | "month" | "quarter";
type SlotInterval = 30 | 60;
type EmploymentKey = "fullTime" | "partner" | "dispatch";

interface PlannedStepFact {
  key: string;
  dateKey: string;
  workflowId: string;
  workflowName: string;
  shipperId: string;
  shipperName: string;
  processId: string;
  processName: string;
  plannedVolume: number;
  plannedHours: number;
  plannedCost: number;
  uph: number;
  startTime: string;
  targetEndTime: string;
  startMinutes: number;
  endMinutes: number;
  requiredHeadcount: number;
}

interface ActualTaskFact {
  key: string;
  dateKey: string;
  workerId: string;
  workerName: string;
  employmentType: EmploymentKey;
  workflowId: string;
  workflowName: string;
  shipperId: string;
  shipperName: string;
  processId: string;
  processName: string;
  quantity: number;
  hours: number;
  cost: number;
  unitRate: number;
  startMinutes: number;
  endMinutes: number;
  lastReportedMinutes?: number;
}

interface CostBreakdownRow {
  id: string;
  name: string;
  category: string;
  plannedVolume: number;
  actualVolume: number;
  plannedHours: number;
  actualHours: number;
  plannedCost: number;
  actualCost: number;
  costPerUnit: number;
  gapCost: number;
  uph: number;
  actualWorkers: number;
  plannedWorkers: number;
  actualCostByType: Record<EmploymentKey, number>;
  actualHoursByType: Record<EmploymentKey, number>;
}

interface TrendBucket {
  key: string;
  label: string;
  plannedCost: number;
  actualCost: number;
}

interface VarianceInsight {
  id: string;
  name: string;
  category: string;
  reason: string;
  action: string;
  gapCost: number;
  severity: "critical" | "warning" | "opportunity";
  plannedCost: number;
  actualCost: number;
  uph: number;
}

interface TimeSlotRow {
  label: string;
  requiredHeadcount: number;
  plannedAssignedHeadcount: number;
  actualVolume: number;
  theoreticalCost: number;
  plannedCost: number;
  actualCost: number;
  status: "逼迫" | "適正" | "余力";
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateTime(dateKey: string, timeLabel: string) {
  const [hours, minutes] = timeLabel.split(":").map(Number);
  const date = new Date(`${dateKey}T00:00:00`);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function minutesFromDateTime(dateKey: string, value?: string, fallbackTimeLabel?: string) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const base = new Date(`${dateKey}T00:00:00`);
      return Math.round((parsed.getTime() - base.getTime()) / 60000);
    }
  }

  if (fallbackTimeLabel) {
    return parseTimeLabel(fallbackTimeLabel);
  }

  return 0;
}

function normalizeEndMinutes(startMinutes: number, endMinutes: number) {
  return endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;
}

function buildDateRange(period: PeriodType) {
  const totalDays = period === "week" ? 7 : period === "month" ? 30 : 90;
  const today = new Date();
  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (totalDays - index - 1));
    return toDateInput(date);
  });
}

function buildTrendBuckets(dateRange: string[], period: PeriodType) {
  if (period === "week") {
    return dateRange.map((dateKey) => ({
      key: dateKey,
      label: `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`,
      dates: [dateKey],
    }));
  }

  if (period === "month") {
    const buckets: Array<{ key: string; label: string; dates: string[] }> = [];
    for (let start = 0; start < dateRange.length; start += 5) {
      const dates = dateRange.slice(start, start + 5);
      if (dates.length === 0) continue;
      buckets.push({
        key: dates[0],
        label: `${Number(dates[0].slice(5, 7))}/${Number(dates[0].slice(8, 10))}-${Number(dates[dates.length - 1].slice(8, 10))}`,
        dates,
      });
    }
    return buckets;
  }

  const monthMap = new Map<string, string[]>();
  dateRange.forEach((dateKey) => {
    const key = dateKey.slice(0, 7);
    const entry = monthMap.get(key) ?? [];
    entry.push(dateKey);
    monthMap.set(key, entry);
  });

  return Array.from(monthMap.entries()).map(([key, dates]) => ({
    key,
    label: `${Number(key.slice(5, 7))}月`,
    dates,
  }));
}

function normalizeEmploymentType(value?: string): EmploymentKey {
  if (value === "正社員") return "fullTime";
  if (value === "パートナー") return "partner";
  if (value === "派遣") return "dispatch";

  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("partner")) return "partner";
  if (normalized.includes("dispatch") || normalized.includes("temp")) return "dispatch";
  return "fullTime";
}

function formatYen(value: number) {
  if (!Number.isFinite(value)) return "¥0";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

function formatHeadcount(value: number) {
  return `${value.toFixed(1)}人`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatRatio(value: number, total: number) {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatVolume(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}件`;
}

function computeOverlapMinutes(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function resolveSnapshotAtTime(
  snapshots: Record<string, AssignmentSnapshot>,
  timeLabel: string,
) {
  const labels = Object.keys(snapshots).sort((left, right) => parseTimeLabel(left) - parseTimeLabel(right));
  if (labels.length === 0) return null;

  const target = parseTimeLabel(timeLabel);
  let candidate = labels[0];
  labels.forEach((label) => {
    if (parseTimeLabel(label) <= target) candidate = label;
  });

  return snapshots[candidate] ?? null;
}

function SectionTitle({
  icon: Icon,
  title,
  description,
  c,
}: {
  icon: typeof BarChart3;
  title: string;
  description: string;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 rounded-2xl border p-2.5 ${c.bgSurface} ${c.borderCard}`}>
        <Icon className={`h-5 w-5 ${c.textSecondary}`} />
      </div>
      <div>
        <h2 className={`text-lg font-bold ${c.textPrimary}`}>{title}</h2>
        <p className={`mt-1 text-sm ${c.textSecondary}`}>{description}</p>
      </div>
    </div>
  );
}

function SegmentedButton<T extends string>({
  value,
  selected,
  onClick,
  c,
}: {
  value: T;
  selected: boolean;
  onClick: (value: T) => void;
  c: ReturnType<typeof useThemeColors>;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`${BUTTON_BASE_CLASS} ${
        selected
          ? "border-[#155DFC] bg-[#155DFC] text-white shadow-sm"
          : `${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:text-white hover:bg-[#155DFC] hover:border-[#155DFC]`
      }`}
    >
      {value}
    </button>
  );
}

function getInsightMeta(
  row: CostBreakdownRow,
): Omit<
  VarianceInsight,
  "id" | "name" | "category" | "plannedCost" | "actualCost" | "gapCost" | "uph"
> {
  const hoursGapRatio = row.plannedHours > 0 ? row.actualHours / row.plannedHours : 1;
  const plannedCostPerUnit = row.plannedVolume > 0 ? row.plannedCost / row.plannedVolume : 0;
  const actualCostPerUnit = row.actualVolume > 0 ? row.actualCost / row.actualVolume : 0;

  if (hoursGapRatio >= 1.15) {
    return {
      reason: "工数超過",
      action: "時間帯別の配置人数とチーム配分を見直し、待機時間を圧縮",
      severity: "critical",
    };
  }

  if (row.uph > 0 && row.actualVolume > 0 && row.actualHours > 0 && row.actualVolume / row.actualHours < row.uph * 0.85) {
    return {
      reason: "UPH未達",
      action: "熟練チーム再配置とボトルネック工程の標準作業見直しを優先",
      severity: "warning",
    };
  }

  if (plannedCostPerUnit > 0 && actualCostPerUnit > plannedCostPerUnit * 1.1) {
    return {
      reason: "単価上昇",
      action: "派遣比率とチーム構成を確認し、固定人員で代替できる区間を抽出",
      severity: "warning",
    };
  }

  return {
    reason: "改善余地あり",
    action: "配置の時間帯を見直し、余剰配置を他業務へ移してロスを圧縮",
    severity: "opportunity",
  };
}

export function CostAnalysis() {
  const c = useThemeColors();
  const { selectedSiteId, sites, workflows, shippers, processes } = useMasterData();
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("overview");
  const [viewType, setViewType] = useState<ViewType>("shipper");
  const [periodFilter, setPeriodFilter] = useState<PeriodType>("month");
  const [analysisDate, setAnalysisDate] = useState(() => toDateInput(new Date()));
  const [slotInterval, setSlotInterval] = useState<SlotInterval>(DEFAULT_SLOT_INTERVAL);

  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const scopedWorkflows = useMemo(
    () => workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)),
    [workflows, siteScope.siteIds],
  );
  const workflowViews = useMemo(
    () => buildDeploymentWorkflows(scopedWorkflows, shippers, sites, processes),
    [scopedWorkflows, shippers, sites, processes],
  );
  const users = useMemo(() => readUsersFromStorage(), []);
  const planStore = useMemo(() => readProgressPlanStore(), []);
  const dateRange = useMemo(() => buildDateRange(periodFilter), [periodFilter]);
  const trendBuckets = useMemo(() => buildTrendBuckets(dateRange, periodFilter), [dateRange, periodFilter]);

  const workerMeta = useMemo(() => {
    return new Map(
      users.map((user) => [
        user.deploymentWorkerId ?? user.id,
        {
          rate: user.unitPrice || DEFAULT_USER_UNIT_PRICE,
          employmentType: normalizeEmploymentType(user.employmentType),
        },
      ]),
    );
  }, [users]);

  const averageLaborRate = useMemo(() => {
    const active = users.filter((user) => user.status === "active");
    if (active.length === 0) return DEFAULT_USER_UNIT_PRICE;
    return active.reduce((sum, user) => sum + (user.unitPrice || DEFAULT_USER_UNIT_PRICE), 0) / active.length;
  }, [users]);

  const plannedStepFacts = useMemo(() => {
    const rows: PlannedStepFact[] = [];

    dateRange.forEach((dateKey) => {
      const dayStore = planStore[dateKey];
      workflowViews.forEach((workflow, workflowIndex) => {
        workflow.steps.forEach((step, stepIndex) => {
          const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph);
          const resolved = resolveStepPlanValues(dayStore, step.id, {
            planned: defaults.planned,
            startTime: step.startTime,
            targetEndTime: step.targetEndTime,
          });
          const startMinutes = parseTimeLabel(resolved.startTime);
          const endMinutes = normalizeEndMinutes(startMinutes, parseTimeLabel(resolved.targetEndTime));
          const durationHours = Math.max(0.25, (endMinutes - startMinutes) / 60);
          const plannedHours = resolved.planned / Math.max(step.uph, 1);
          const requiredHeadcount = plannedHours / durationHours;
          const plannedCost = plannedHours * averageLaborRate * (1 + OVERHEAD_RATE);

          rows.push({
            key: `${dateKey}:${step.id}`,
            dateKey,
            workflowId: workflow.id,
            workflowName: workflow.workflowName,
            shipperId: workflow.shipperId,
            shipperName: workflow.shipperName,
            processId: step.processId,
            processName: step.processName,
            plannedVolume: resolved.planned,
            plannedHours,
            plannedCost,
            uph: step.uph,
            startTime: resolved.startTime,
            targetEndTime: resolved.targetEndTime,
            startMinutes,
            endMinutes,
            requiredHeadcount,
          });
        });
      });
    });

    return rows;
  }, [averageLaborRate, dateRange, planStore, workflowViews]);

  const stepLookup = useMemo(() => {
    return new Map(
      workflowViews.flatMap((workflow) =>
        workflow.steps.map((step) => [
          step.id,
          {
            workflowId: workflow.id,
            workflowName: workflow.workflowName,
            shipperId: workflow.shipperId,
            shipperName: workflow.shipperName,
            processId: step.processId,
            processName: step.processName,
          },
        ]),
      ),
    );
  }, [workflowViews]);

  const actualTaskFacts = useMemo(() => {
    const facts: ActualTaskFact[] = [];

    dateRange.forEach((dateKey) => {
      const records = buildWorkerSubmissionRecords({
        dateKey,
        selectedSiteId,
        sites,
        workflows,
        shippers,
        processes,
      });

      const taskMap = new Map<
        string,
        {
          dateKey: string;
          workerId: string;
          workerName: string;
          workflowId: string;
          workflowName: string;
          shipperId: string;
          shipperName: string;
          processId: string;
          processName: string;
          quantity: number;
          pausedMinutes: number;
          startedAt?: string;
          completedAt?: string;
          lastReportedAt?: string;
          scheduledStartTime: string;
          scheduledEndTime: string;
        }
      >();

      records.forEach((record: WorkerSubmissionRecord) => {
        const meta = stepLookup.get(record.stepId);
        if (!meta) return;
        const key = `${record.dateKey}:${record.workerId}:${record.stepId}:${record.scheduledStartTime}:${record.scheduledEndTime}`;
        const current = taskMap.get(key) ?? {
          dateKey: record.dateKey,
          workerId: record.workerId,
          workerName: record.workerName,
          workflowId: meta.workflowId,
          workflowName: meta.workflowName,
          shipperId: meta.shipperId,
          shipperName: meta.shipperName,
          processId: meta.processId,
          processName: meta.processName,
          quantity: 0,
          pausedMinutes: 0,
          scheduledStartTime: record.scheduledStartTime,
          scheduledEndTime: record.scheduledEndTime,
        };

        current.quantity += record.reportedQuantity;
        current.pausedMinutes = Math.max(current.pausedMinutes, record.pausedMinutes);

        if (record.startedAt && (!current.startedAt || new Date(record.startedAt) < new Date(current.startedAt))) {
          current.startedAt = record.startedAt;
        }
        if (record.completedAt && (!current.completedAt || new Date(record.completedAt) > new Date(current.completedAt))) {
          current.completedAt = record.completedAt;
        }
        if (record.lastReportedAt && (!current.lastReportedAt || new Date(record.lastReportedAt) > new Date(current.lastReportedAt))) {
          current.lastReportedAt = record.lastReportedAt;
        }

        taskMap.set(key, current);
      });

      taskMap.forEach((task, taskKey) => {
        const meta = workerMeta.get(task.workerId);
        const unitRate = meta?.rate ?? DEFAULT_USER_UNIT_PRICE;
        const employmentType = meta?.employmentType ?? "fullTime";
        const startedMinutes = minutesFromDateTime(task.dateKey, task.startedAt, task.scheduledStartTime);
        const endedMinutes = normalizeEndMinutes(
          startedMinutes,
          minutesFromDateTime(task.dateKey, task.completedAt ?? task.lastReportedAt, task.scheduledEndTime),
        );
        const hours = Math.max(0.05, (endedMinutes - startedMinutes) / 60 - task.pausedMinutes / 60);
        const cost = hours * unitRate * (1 + OVERHEAD_RATE);

        facts.push({
          key: taskKey,
          dateKey: task.dateKey,
          workerId: task.workerId,
          workerName: task.workerName,
          employmentType,
          workflowId: task.workflowId,
          workflowName: task.workflowName,
          shipperId: task.shipperId,
          shipperName: task.shipperName,
          processId: task.processId,
          processName: task.processName,
          quantity: task.quantity,
          hours,
          cost,
          unitRate,
          startMinutes: startedMinutes,
          endMinutes: endedMinutes,
          lastReportedMinutes: task.lastReportedAt
            ? minutesFromDateTime(task.dateKey, task.lastReportedAt, task.scheduledEndTime)
            : undefined,
        });
      });
    });

    return facts;
  }, [dateRange, processes, selectedSiteId, shippers, sites, stepLookup, workerMeta, workflows]);

  const trendMap = useMemo(() => {
    return trendBuckets.map((bucket) => {
      const dateSet = new Set(bucket.dates);
      const plannedCost = plannedStepFacts
        .filter((row) => dateSet.has(row.dateKey))
        .reduce((sum, row) => sum + row.plannedCost, 0);
      const actualCost = actualTaskFacts
        .filter((row) => dateSet.has(row.dateKey))
        .reduce((sum, row) => sum + row.cost, 0);

      return {
        key: bucket.key,
        label: bucket.label,
        plannedCost,
        actualCost,
      } satisfies TrendBucket;
    });
  }, [actualTaskFacts, plannedStepFacts, trendBuckets]);

  const breakdownRows = useMemo(() => {
    const targetMap = new Map<string, CostBreakdownRow>();
    const workersByRow = new Map<string, Set<string>>();

    const ensureRow = (id: string, name: string, category: string) => {
      const existing = targetMap.get(id);
      if (existing) return existing;

      const row: CostBreakdownRow = {
        id,
        name,
        category,
        plannedVolume: 0,
        actualVolume: 0,
        plannedHours: 0,
        actualHours: 0,
        plannedCost: 0,
        actualCost: 0,
        costPerUnit: 0,
        gapCost: 0,
        uph: 0,
        actualWorkers: 0,
        plannedWorkers: 0,
        actualCostByType: { fullTime: 0, partner: 0, dispatch: 0 },
        actualHoursByType: { fullTime: 0, partner: 0, dispatch: 0 },
      };

      targetMap.set(id, row);
      return row;
    };

    plannedStepFacts.forEach((fact) => {
      const id = viewType === "shipper" ? fact.shipperId : fact.processId;
      const name = viewType === "shipper" ? fact.shipperName : fact.processName;
      const category = viewType === "shipper" ? fact.workflowName : fact.shipperName;
      const row = ensureRow(id, name, category);
      row.plannedVolume += fact.plannedVolume;
      row.plannedHours += fact.plannedHours;
      row.plannedCost += fact.plannedCost;
      row.plannedWorkers += fact.requiredHeadcount;
      row.uph += fact.uph * fact.plannedVolume;
    });

    actualTaskFacts.forEach((fact) => {
      const id = viewType === "shipper" ? fact.shipperId : fact.processId;
      const name = viewType === "shipper" ? fact.shipperName : fact.processName;
      const category = viewType === "shipper" ? fact.workflowName : fact.shipperName;
      const row = ensureRow(id, name, category);
      row.actualVolume += fact.quantity;
      row.actualHours += fact.hours;
      row.actualCost += fact.cost;
      row.actualCostByType[fact.employmentType] += fact.cost;
      row.actualHoursByType[fact.employmentType] += fact.hours;

      const assignedWorkers = workersByRow.get(id) ?? new Set<string>();
      assignedWorkers.add(fact.workerId);
      workersByRow.set(id, assignedWorkers);
    });

    targetMap.forEach((row) => {
      row.uph =
        row.plannedVolume > 0
          ? row.uph / row.plannedVolume
          : row.actualHours > 0
            ? row.actualVolume / row.actualHours
            : 0;
      row.costPerUnit = row.actualVolume > 0 ? row.actualCost / row.actualVolume : 0;
      row.gapCost = row.actualCost - row.plannedCost;
      row.actualWorkers = workersByRow.get(row.id)?.size ?? 0;
    });

    return Array.from(targetMap.values()).sort(
      (left, right) =>
        right.actualCost - left.actualCost ||
        right.plannedCost - left.plannedCost ||
        left.name.localeCompare(right.name, "ja"),
    );
  }, [actualTaskFacts, plannedStepFacts, viewType]);

  const totalPlannedCost = useMemo(() => breakdownRows.reduce((sum, row) => sum + row.plannedCost, 0), [breakdownRows]);
  const totalActualCost = useMemo(() => breakdownRows.reduce((sum, row) => sum + row.actualCost, 0), [breakdownRows]);
  const totalActualHours = useMemo(() => breakdownRows.reduce((sum, row) => sum + row.actualHours, 0), [breakdownRows]);
  const totalActualVolume = useMemo(() => breakdownRows.reduce((sum, row) => sum + row.actualVolume, 0), [breakdownRows]);
  const totalPlannedVolume = useMemo(() => breakdownRows.reduce((sum, row) => sum + row.plannedVolume, 0), [breakdownRows]);

  const costByEmployment = useMemo(() => {
    return actualTaskFacts.reduce(
      (acc, fact) => {
        acc[fact.employmentType] += fact.cost;
        return acc;
      },
      { fullTime: 0, partner: 0, dispatch: 0 } satisfies Record<EmploymentKey, number>,
    );
  }, [actualTaskFacts]);

  const varianceInsights = useMemo(() => {
    return breakdownRows
      .filter((row) => Math.abs(row.gapCost) > 0)
      .slice()
      .sort((left, right) => Math.abs(right.gapCost) - Math.abs(left.gapCost))
      .slice(0, 6)
      .map((row) => {
        const meta = getInsightMeta(row);
        return {
          id: row.id,
          name: row.name,
          category: row.category,
          plannedCost: row.plannedCost,
          actualCost: row.actualCost,
          gapCost: row.gapCost,
          uph: row.uph,
          ...meta,
        } satisfies VarianceInsight;
      });
  }, [breakdownRows]);

  const timeSlotRows = useMemo(() => {
    const labels = createTimeSlots(slotInterval);
    const snapshots = readFieldDeploymentSnapshots(siteScope.storageScopeKey, analysisDate);
    const dayPlans = plannedStepFacts.filter((row) => row.dateKey === analysisDate);
    const dayActuals = actualTaskFacts.filter((row) => row.dateKey === analysisDate);

    return labels.map((label) => {
      const slotStart = parseTimeLabel(label);
      const slotEnd = slotStart + slotInterval;
      const snapshot = resolveSnapshotAtTime(snapshots, label);

      let requiredHeadcount = 0;
      let theoreticalCost = 0;

      dayPlans.forEach((plan) => {
        const overlapBase = computeOverlapMinutes(plan.startMinutes, plan.endMinutes, slotStart, slotEnd);
        const overlapShifted = computeOverlapMinutes(plan.startMinutes, plan.endMinutes, slotStart + 24 * 60, slotEnd + 24 * 60);
        const overlapMinutes = Math.max(overlapBase, overlapShifted);
        if (overlapMinutes <= 0) return;
        requiredHeadcount += plan.requiredHeadcount;
        theoreticalCost += plan.requiredHeadcount * (slotInterval / 60) * averageLaborRate * (1 + OVERHEAD_RATE);
      });

      const plannedAssignedHeadcount = snapshot
        ? new Set(Object.values(snapshot).flat().filter(Boolean)).size
        : 0;

      let actualVolume = 0;
      let actualCost = 0;

      dayActuals.forEach((fact) => {
        const overlapBase = computeOverlapMinutes(fact.startMinutes, fact.endMinutes, slotStart, slotEnd);
        const overlapShifted = computeOverlapMinutes(fact.startMinutes, fact.endMinutes, slotStart + 24 * 60, slotEnd + 24 * 60);
        const overlapMinutes = Math.max(overlapBase, overlapShifted);
        if (overlapMinutes <= 0) return;

        actualCost += (overlapMinutes / 60) * fact.unitRate * (1 + OVERHEAD_RATE);
        if (fact.lastReportedMinutes != null && fact.lastReportedMinutes >= slotStart && fact.lastReportedMinutes < slotEnd) {
          actualVolume += fact.quantity;
        }
      });

      const plannedCost = plannedAssignedHeadcount * (slotInterval / 60) * averageLaborRate * (1 + OVERHEAD_RATE);
      const gap = plannedAssignedHeadcount - requiredHeadcount;
      const status = gap < -0.5 ? "逼迫" : gap > 1 ? "余力" : "適正";

      return {
        label,
        requiredHeadcount,
        plannedAssignedHeadcount,
        actualVolume,
        theoreticalCost,
        plannedCost,
        actualCost,
        status,
      } satisfies TimeSlotRow;
    });
  }, [actualTaskFacts, analysisDate, averageLaborRate, plannedStepFacts, siteScope.storageScopeKey, slotInterval]);

  const timeSlotInsights = useMemo(() => {
    const pressured = timeSlotRows
      .filter((row) => row.status === "逼迫")
      .slice()
      .sort((left, right) => right.requiredHeadcount - left.requiredHeadcount)
      .slice(0, 3)
      .map((row) => ({
        label: row.label,
        title: "逼迫時間帯",
        message: `必要 ${formatHeadcount(row.requiredHeadcount)} に対し、計画配置 ${formatHeadcount(row.plannedAssignedHeadcount)} です。`,
        tone: "border-rose-200 bg-rose-50 text-rose-700",
      }));

    const surplus = timeSlotRows
      .filter((row) => row.status === "余力")
      .slice()
      .sort((left, right) => right.plannedAssignedHeadcount - left.plannedAssignedHeadcount)
      .slice(0, 3)
      .map((row) => ({
        label: row.label,
        title: "余力時間帯",
        message: `計画配置 ${formatHeadcount(row.plannedAssignedHeadcount)} に対し、必要 ${formatHeadcount(row.requiredHeadcount)} です。`,
        tone: "border-amber-200 bg-amber-50 text-amber-700",
      }));

    return [...pressured, ...surplus].slice(0, 4);
  }, [timeSlotRows]);

  const peakRequiredSlot = useMemo(() => {
    return timeSlotRows.reduce<TimeSlotRow | null>((best, row) => {
      if (!best || row.requiredHeadcount > best.requiredHeadcount) return row;
      return best;
    }, null);
  }, [timeSlotRows]);

  const peakActualCostSlot = useMemo(() => {
    return timeSlotRows.reduce<TimeSlotRow | null>((best, row) => {
      if (!best || row.actualCost > best.actualCost) return row;
      return best;
    }, null);
  }, [timeSlotRows]);

  const topRows = useMemo(() => breakdownRows.slice(0, 5), [breakdownRows]);
  const maxTrendValue = useMemo(
    () => Math.max(1, ...trendMap.map((bucket) => Math.max(bucket.plannedCost, bucket.actualCost))),
    [trendMap],
  );

  const tabOptions = [
    { value: "overview", label: "概要", icon: BarChart3 },
    { value: "breakdown", label: "内訳", icon: Layers3 },
    { value: "variance", label: "差異分析", icon: AlertTriangle },
    { value: "timeslot", label: "時間帯分析", icon: Clock3 },
  ] satisfies Array<{ value: AnalysisTab; label: string; icon: typeof BarChart3 }>;

  const viewOptions = [
    { value: "shipper", label: "荷主別" },
    { value: "process", label: "業務別" },
  ] satisfies Array<{ value: ViewType; label: string }>;

  const periodOptions = [
    { value: "week", label: "7日" },
    { value: "month", label: "30日" },
    { value: "quarter", label: "90日" },
  ] satisfies Array<{ value: PeriodType; label: string }>;

  const slotOptions = [30, 60] satisfies SlotInterval[];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-6">
      <section className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <SectionTitle
            icon={DollarSign}
            title="コスト分析"
            description="労務コストを、予定・実績・差異・時間帯の4軸で把握し、再配置やシフト調整につなげます。"
            c={c}
          />
          <div className="flex flex-wrap gap-2">
            {tabOptions.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setAnalysisTab(tab.value)}
                  className={`${BUTTON_BASE_CLASS} gap-2 ${
                    analysisTab === tab.value
                      ? "border-[#155DFC] bg-[#155DFC] text-white shadow-sm"
                      : `${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:text-white hover:bg-[#155DFC] hover:border-[#155DFC]`
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
            <div className={`text-xs font-medium ${c.textMuted}`}>分析対象</div>
            <div className={`mt-2 text-base font-semibold ${c.textPrimary}`}>{siteScope.siteName}</div>
            <div className={`mt-1 text-sm ${c.textSecondary}`}>
              現在の拠点選択を基準に、進捗・配置・送信実績・ユーザー単価を横断して集計します。
            </div>
          </div>
          <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
            <div className={`text-xs font-medium ${c.textMuted}`}>表示軸</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {viewOptions.map((option) => (
                <SegmentedButton
                  key={option.value}
                  value={option.label}
                  selected={viewType === option.value}
                  onClick={() => setViewType(option.value)}
                  c={c}
                />
              ))}
            </div>
          </div>
          <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
            <div className={`text-xs font-medium ${c.textMuted}`}>集計期間</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {periodOptions.map((option) => (
                <SegmentedButton
                  key={option.value}
                  value={option.label}
                  selected={periodFilter === option.value}
                  onClick={() => setPeriodFilter(option.value)}
                  c={c}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {[
          {
            label: "実績労務費",
            value: formatYen(totalActualCost),
            note: `期間実績 ${dateRange.length}日`,
            icon: DollarSign,
            accent: "from-[#155DFC] to-[#4F86FF]",
          },
          {
            label: "予定労務費",
            value: formatYen(totalPlannedCost),
            note: "進捗計画ベース",
            icon: BriefcaseBusiness,
            accent: "from-emerald-500 to-teal-500",
          },
          {
            label: "差額",
            value: formatYen(totalActualCost - totalPlannedCost),
            note: totalActualCost >= totalPlannedCost ? "予算超過" : "予算内",
            icon: totalActualCost >= totalPlannedCost ? TrendingUp : TrendingDown,
            accent: totalActualCost >= totalPlannedCost ? "from-rose-500 to-orange-500" : "from-sky-500 to-cyan-500",
          },
          {
            label: "1件あたりコスト",
            value: formatYen(totalActualVolume > 0 ? totalActualCost / totalActualVolume : 0),
            note: `予定 ${formatYen(totalPlannedVolume > 0 ? totalPlannedCost / totalPlannedVolume : 0)}`,
            icon: Package,
            accent: "from-violet-500 to-indigo-500",
          },
          {
            label: "実績人時",
            value: formatHours(totalActualHours),
            note: `予定 ${formatHours(breakdownRows.reduce((sum, row) => sum + row.plannedHours, 0))}`,
            icon: Clock3,
            accent: "from-amber-500 to-orange-500",
          },
          {
            label: "実績件数",
            value: formatVolume(totalActualVolume),
            note: `予定 ${formatVolume(totalPlannedVolume)}`,
            icon: Users,
            accent: "from-teal-500 to-emerald-500",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard} relative overflow-hidden`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-xs font-medium ${c.textMuted}`}>{card.label}</div>
                  <div className={`mt-2 text-[28px] font-bold tracking-tight ${c.textPrimary}`}>{card.value}</div>
                  <div className={`mt-2 text-sm ${c.textSecondary}`}>{card.note}</div>
                </div>
                <div className={`${c.bgSurface} ${c.borderCard} rounded-2xl border p-3`}>
                  <Icon className={`h-5 w-5 ${c.textSecondary}`} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {analysisTab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
          <section className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className={`text-base font-bold ${c.textPrimary}`}>コスト推移</h3>
                <p className={`mt-1 text-sm ${c.textSecondary}`}>予定労務費と実績労務費の差を、期間推移で確認します。</p>
              </div>
              <div className={`${c.bgSurface} ${c.borderCard} rounded-full border px-3 py-1 text-xs font-medium ${c.textSecondary}`}>
                {viewType === "shipper" ? "荷主軸" : "業務軸"}
              </div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className={`rounded-[22px] border p-4 ${c.bgSurface} ${c.borderCard}`}>
                <div className="flex h-72 items-end gap-3">
                  {trendMap.map((bucket) => (
                    <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-56 w-full items-end justify-center gap-2">
                        <div className="flex w-1/2 items-end justify-center">
                          <div
                            className="w-full rounded-t-2xl bg-[#C9D7FF]"
                            style={{ height: `${Math.max(10, (bucket.plannedCost / maxTrendValue) * 100)}%` }}
                          />
                        </div>
                        <div className="flex w-1/2 items-end justify-center">
                          <div
                            className="w-full rounded-t-2xl bg-[#155DFC]"
                            style={{ height: `${Math.max(10, (bucket.actualCost / maxTrendValue) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-center">
                        <div className={`text-xs font-medium ${c.textSecondary}`}>{bucket.label}</div>
                        <div className={`mt-1 text-[11px] ${c.textMuted}`}>{formatYen(bucket.actualCost)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                  <div className={`text-sm font-semibold ${c.textPrimary}`}>雇用形態別の実績労務費</div>
                  <div className="mt-4 space-y-3">
                    {([
                      ["fullTime", "正社員", "#155DFC"],
                      ["partner", "パートナー", "#10B981"],
                      ["dispatch", "派遣", "#F59E0B"],
                    ] as const).map(([key, label, color]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className={`text-sm font-medium ${c.textPrimary}`}>{label}</span>
                          </div>
                          <span className={`text-sm font-semibold ${c.textPrimary}`}>{formatYen(costByEmployment[key])}</span>
                        </div>
                        <div className={`mt-2 h-2 rounded-full ${c.isDark ? "bg-white/10" : "bg-slate-200"}`}>
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: formatRatio(costByEmployment[key], totalActualCost),
                              backgroundColor: color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                  <div className={`text-sm font-semibold ${c.textPrimary}`}>優先対応すべき対象</div>
                  <div className="mt-4 space-y-3">
                    {topRows.slice(0, 3).map((row) => (
                      <div
                        key={row.id}
                        className={`rounded-2xl border px-4 py-3 ${c.bgCard} ${c.borderCard}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className={`text-sm font-semibold ${c.textPrimary}`}>{row.name}</div>
                            <div className={`mt-1 text-xs ${c.textMuted}`}>{row.category}</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-bold ${row.gapCost >= 0 ? "text-rose-500" : "text-emerald-500"}`}>
                              {formatYen(row.gapCost)}
                            </div>
                            <div className={`mt-1 text-xs ${c.textMuted}`}>差額</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <article className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
              <h3 className={`text-base font-bold ${c.textPrimary}`}>改善余地サマリー</h3>
              <div className="mt-4 space-y-3">
                {varianceInsights.slice(0, 4).map((insight) => {
                  const badgeClass =
                    insight.severity === "critical"
                      ? "border-rose-200 bg-rose-50 text-rose-600"
                      : insight.severity === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700";

                  return (
                    <div key={insight.id} className={`rounded-[20px] border p-4 ${c.bgSurface} ${c.borderCard}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={`text-sm font-semibold ${c.textPrimary}`}>{insight.name}</div>
                          <div className={`mt-1 text-xs ${c.textMuted}`}>{insight.category}</div>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
                          {insight.reason}
                        </span>
                      </div>
                      <div className={`mt-3 text-sm ${c.textSecondary}`}>{insight.action}</div>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className={c.textMuted}>影響額</span>
                        <span className={`font-semibold ${insight.gapCost >= 0 ? "text-rose-500" : "text-emerald-500"}`}>
                          {formatYen(insight.gapCost)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
              <h3 className={`text-base font-bold ${c.textPrimary}`}>コスト前提</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                  <div className={`text-xs font-medium ${c.textMuted}`}>平均労務単価</div>
                  <div className={`mt-2 text-xl font-bold ${c.textPrimary}`}>{formatYen(averageLaborRate)}</div>
                </div>
                <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                  <div className={`text-xs font-medium ${c.textMuted}`}>共通間接費率</div>
                  <div className={`mt-2 text-xl font-bold ${c.textPrimary}`}>{formatPercent(OVERHEAD_RATE * 100)}</div>
                </div>
              </div>
              <div className={`mt-4 rounded-[20px] border p-4 text-sm leading-6 ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
                実績コストは <span className={c.textPrimary}>送信実績の実作業時間 × ユーザー単価</span>、
                予定コストは <span className={c.textPrimary}>進捗計画の予定数 ÷ UPH</span> を人時換算して算出しています。
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {analysisTab === "breakdown" ? (
        <section className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className={`text-base font-bold ${c.textPrimary}`}>{viewType === "shipper" ? "荷主別" : "業務別"}コスト内訳</h3>
              <p className={`mt-1 text-sm ${c.textSecondary}`}>計画量・実績量・人時・労務費を同じ軸で比較します。</p>
            </div>
            <div className={`${c.bgSurface} ${c.borderCard} rounded-full border px-3 py-1 text-xs font-medium ${c.textSecondary}`}>
              {breakdownRows.length}件
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[1240px] w-full table-fixed border-separate border-spacing-0">
              <thead>
                <tr className={`${c.textSecondary}`}>
                  {["対象", "予定件数", "実績件数", "予定人時", "実績人時", "実績労務費", "1件あたり", "差額", "UPH", "配置構成"].map((header) => (
                    <th
                      key={header}
                      className={`border-b px-4 py-3 text-left text-xs font-semibold ${c.borderCard}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdownRows.map((row) => (
                  <tr key={row.id} className={`${c.bgCardHover}`}>
                    <td className={`border-b px-4 py-4 align-top ${c.borderCard}`}>
                      <div className={`font-semibold ${c.textPrimary}`}>{row.name}</div>
                      <div className={`mt-1 text-xs ${c.textMuted}`}>{row.category}</div>
                    </td>
                    <td className={`border-b px-4 py-4 text-sm ${c.borderCard} ${c.textPrimary}`}>{formatVolume(row.plannedVolume)}</td>
                    <td className={`border-b px-4 py-4 text-sm ${c.borderCard} ${c.textPrimary}`}>{formatVolume(row.actualVolume)}</td>
                    <td className={`border-b px-4 py-4 text-sm ${c.borderCard} ${c.textPrimary}`}>{formatHours(row.plannedHours)}</td>
                    <td className={`border-b px-4 py-4 text-sm ${c.borderCard} ${c.textPrimary}`}>{formatHours(row.actualHours)}</td>
                    <td className={`border-b px-4 py-4 text-sm font-semibold ${c.borderCard} ${c.textPrimary}`}>{formatYen(row.actualCost)}</td>
                    <td className={`border-b px-4 py-4 text-sm ${c.borderCard} ${c.textPrimary}`}>{formatYen(row.costPerUnit)}</td>
                    <td className={`border-b px-4 py-4 text-sm font-semibold ${c.borderCard} ${row.gapCost >= 0 ? "text-rose-500" : "text-emerald-500"}`}>
                      {formatYen(row.gapCost)}
                    </td>
                    <td className={`border-b px-4 py-4 text-sm ${c.borderCard} ${c.textPrimary}`}>{row.uph.toFixed(1)}</td>
                    <td className={`border-b px-4 py-4 align-top ${c.borderCard}`}>
                      <div className="space-y-2">
                        {([
                          ["fullTime", "正社員", "#155DFC"],
                          ["partner", "パートナー", "#10B981"],
                          ["dispatch", "派遣", "#F59E0B"],
                        ] as const).map(([key, label, color]) => (
                          <div key={key}>
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                <span className={c.textSecondary}>{label}</span>
                              </div>
                              <span className={`font-medium ${c.textPrimary}`}>{formatYen(row.actualCostByType[key])}</span>
                            </div>
                            <div className={`mt-1 h-1.5 rounded-full ${c.isDark ? "bg-white/10" : "bg-slate-200"}`}>
                              <div
                                className="h-1.5 rounded-full"
                                style={{
                                  width: formatRatio(row.actualCostByType[key], Math.max(row.actualCost, 1)),
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {analysisTab === "variance" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <section className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className={`text-base font-bold ${c.textPrimary}`}>差異分析</h3>
                <p className={`mt-1 text-sm ${c.textSecondary}`}>金額差異の大きい対象から、原因と改善アクションを抽出します。</p>
              </div>
              <div className={`${c.bgSurface} ${c.borderCard} rounded-full border px-3 py-1 text-xs font-medium ${c.textSecondary}`}>
                上位 {varianceInsights.length} 件
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {varianceInsights.map((insight) => {
                const toneClass =
                  insight.severity === "critical"
                    ? "border-rose-200 bg-rose-50 text-rose-600"
                    : insight.severity === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700";

                return (
                  <article key={insight.id} className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`text-sm font-semibold ${c.textPrimary}`}>{insight.name}</div>
                        <div className={`mt-1 text-xs ${c.textMuted}`}>{insight.category}</div>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
                        {insight.reason}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className={`rounded-2xl border px-3 py-2 ${c.bgCard} ${c.borderCard}`}>
                        <div className={`text-[11px] font-medium ${c.textMuted}`}>予定労務費</div>
                        <div className={`mt-1 text-sm font-semibold ${c.textPrimary}`}>{formatYen(insight.plannedCost)}</div>
                      </div>
                      <div className={`rounded-2xl border px-3 py-2 ${c.bgCard} ${c.borderCard}`}>
                        <div className={`text-[11px] font-medium ${c.textMuted}`}>実績労務費</div>
                        <div className={`mt-1 text-sm font-semibold ${c.textPrimary}`}>{formatYen(insight.actualCost)}</div>
                      </div>
                      <div className={`rounded-2xl border px-3 py-2 ${c.bgCard} ${c.borderCard}`}>
                        <div className={`text-[11px] font-medium ${c.textMuted}`}>差額</div>
                        <div className={`mt-1 text-sm font-semibold ${insight.gapCost >= 0 ? "text-rose-500" : "text-emerald-500"}`}>
                          {formatYen(insight.gapCost)}
                        </div>
                      </div>
                    </div>
                    <div className={`mt-4 text-sm leading-6 ${c.textSecondary}`}>{insight.action}</div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <article className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
              <h3 className={`text-base font-bold ${c.textPrimary}`}>差異要因の見方</h3>
              <div className="mt-4 space-y-3">
                {[
                  {
                    label: "工数超過",
                    description: "実績人時が予定人時を 15% 以上上回る対象。配置過多や待機が疑われます。",
                    tone: "border-rose-200 bg-rose-50 text-rose-600",
                  },
                  {
                    label: "UPH未達",
                    description: "処理量に対して人時が多く、現場効率が標準より低い状態です。",
                    tone: "border-amber-200 bg-amber-50 text-amber-700",
                  },
                  {
                    label: "改善余地あり",
                    description: "配置の時間帯調整だけでも差額を縮められる可能性があります。",
                    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
                  },
                ].map((item) => (
                  <div key={item.label} className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${item.tone}`}>
                      {item.label}
                    </span>
                    <p className={`mt-3 text-sm leading-6 ${c.textSecondary}`}>{item.description}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
              <h3 className={`text-base font-bold ${c.textPrimary}`}>改善アクションの優先順位</h3>
              <div className="mt-4 space-y-3">
                {varianceInsights.slice(0, 3).map((insight, index) => (
                  <div key={insight.id} className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className={`text-sm font-semibold ${c.textPrimary}`}>優先 {index + 1}</div>
                      <div className={`text-xs ${c.textMuted}`}>{insight.reason}</div>
                    </div>
                    <div className={`mt-2 text-sm font-semibold ${c.textPrimary}`}>{insight.name}</div>
                    <div className={`mt-1 text-sm ${c.textSecondary}`}>{insight.action}</div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {analysisTab === "timeslot" ? (
        <section className={`${SECTION_CARD_CLASS} ${c.bgCard} ${c.borderCard}`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className={`text-base font-bold ${c.textPrimary}`}>時間帯別コスト分析</h3>
              <p className={`mt-1 text-sm ${c.textSecondary}`}>
                予定人数・実配置人数・時間帯コストを同じ粒度で見比べて、逼迫と余力を見つけます。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className={`flex items-center gap-2 rounded-full border px-3 py-2 ${c.bgSurface} ${c.borderCard}`}>
                <CalendarDays className={`h-4 w-4 ${c.textSecondary}`} />
                <input
                  type="date"
                  value={analysisDate}
                  onChange={(event) => setAnalysisDate(event.target.value)}
                  className={`bg-transparent text-sm outline-none ${c.textPrimary}`}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {slotOptions.map((value) => (
                  <SegmentedButton
                    key={value}
                    value={`${value}分`}
                    selected={slotInterval === value}
                    onClick={() => setSlotInterval(value)}
                    c={c}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
            <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className={`rounded-2xl border px-4 py-3 ${c.bgCard} ${c.borderCard}`}>
                  <div className={`text-[11px] font-medium ${c.textMuted}`}>最大必要人数</div>
                  <div className={`mt-2 text-lg font-bold ${c.textPrimary}`}>
                    {peakRequiredSlot ? formatHeadcount(peakRequiredSlot.requiredHeadcount) : formatHeadcount(0)}
                  </div>
                  <div className={`mt-1 text-xs ${c.textSecondary}`}>
                    {peakRequiredSlot ? `${peakRequiredSlot.label} 時点` : "データなし"}
                  </div>
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${c.bgCard} ${c.borderCard}`}>
                  <div className={`text-[11px] font-medium ${c.textMuted}`}>最大実績コスト</div>
                  <div className={`mt-2 text-lg font-bold ${c.textPrimary}`}>
                    {peakActualCostSlot ? formatYen(peakActualCostSlot.actualCost) : formatYen(0)}
                  </div>
                  <div className={`mt-1 text-xs ${c.textSecondary}`}>
                    {peakActualCostSlot ? `${peakActualCostSlot.label} 時点` : "データなし"}
                  </div>
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${c.bgCard} ${c.borderCard}`}>
                  <div className={`text-[11px] font-medium ${c.textMuted}`}>逼迫スロット数</div>
                  <div className={`mt-2 text-lg font-bold ${c.textPrimary}`}>
                    {timeSlotRows.filter((row) => row.status === "逼迫").length}
                  </div>
                  <div className={`mt-1 text-xs ${c.textSecondary}`}>全 {timeSlotRows.length} 区間中</div>
                </div>
              </div>

              <div className={`mt-4 rounded-[22px] border p-4 ${c.bgCard} ${c.borderCard}`}>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#155DFC]" />
                    <span className={c.textSecondary}>計画配置人数</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                    <span className={c.textSecondary}>必要人数</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" />
                    <span className={c.textSecondary}>実績コスト</span>
                  </div>
                </div>
                <div className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={timeSlotRows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.isDark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.22)"} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: c.isDark ? "#94a3b8" : "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        interval={slotInterval === 30 ? 1 : 0}
                      />
                      <YAxis
                        yAxisId="headcount"
                        tick={{ fill: c.isDark ? "#94a3b8" : "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                      />
                      <YAxis
                        yAxisId="cost"
                        orientation="right"
                        tick={{ fill: c.isDark ? "#94a3b8" : "#64748b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={56}
                        tickFormatter={(value: number) => `¥${Math.round(value / 1000)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 16,
                          borderColor: c.isDark ? "rgba(71,85,105,0.8)" : "rgba(203,213,225,0.9)",
                          backgroundColor: c.isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)",
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === "実績コスト") return [formatYen(value), name];
                          if (name === "実績件数") return [formatVolume(value), name];
                          return [formatHeadcount(value), name];
                        }}
                        labelFormatter={(label) => `${label}`}
                      />
                      <Legend />
                      <Bar
                        yAxisId="headcount"
                        dataKey="plannedAssignedHeadcount"
                        name="計画配置人数"
                        fill="#155DFC"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={20}
                      />
                      <Line
                        yAxisId="headcount"
                        type="monotone"
                        dataKey="requiredHeadcount"
                        name="必要人数"
                        stroke="#F59E0B"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5 }}
                      />
                      <Area
                        yAxisId="cost"
                        type="monotone"
                        dataKey="actualCost"
                        name="実績コスト"
                        stroke="#10B981"
                        fill={c.isDark ? "rgba(16,185,129,0.18)" : "rgba(16,185,129,0.14)"}
                        strokeWidth={2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                <div className={`text-sm font-semibold ${c.textPrimary}`}>時間帯インサイト</div>
                <div className="mt-4 space-y-3">
                  {timeSlotInsights.length > 0 ? (
                    timeSlotInsights.map((item) => (
                      <div key={`${item.title}:${item.label}`} className={`rounded-2xl border px-4 py-3 ${item.tone}`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold">{item.title}</span>
                          <span className="text-xs font-medium">{item.label}</span>
                        </div>
                        <div className="mt-2 text-sm leading-6">{item.message}</div>
                      </div>
                    ))
                  ) : (
                    <div className={`rounded-2xl border px-4 py-6 text-sm ${c.bgCard} ${c.borderCard} ${c.textSecondary}`}>
                      目立つ逼迫・余力はありません。現在の計画では大きな時間帯偏りは見られません。
                    </div>
                  )}
                </div>
              </div>

              <div className={`${SUB_CARD_CLASS} ${c.bgSurface} ${c.borderCard}`}>
                <div className={`text-sm font-semibold ${c.textPrimary}`}>集計サマリー</div>
                <div className="mt-4 space-y-3">
                  <div className={`rounded-2xl border px-4 py-3 ${c.bgCard} ${c.borderCard}`}>
                    <div className={`text-[11px] font-medium ${c.textMuted}`}>理論コスト合計</div>
                    <div className={`mt-2 text-lg font-bold ${c.textPrimary}`}>
                      {formatYen(timeSlotRows.reduce((sum, row) => sum + row.theoreticalCost, 0))}
                    </div>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 ${c.bgCard} ${c.borderCard}`}>
                    <div className={`text-[11px] font-medium ${c.textMuted}`}>計画コスト合計</div>
                    <div className={`mt-2 text-lg font-bold ${c.textPrimary}`}>
                      {formatYen(timeSlotRows.reduce((sum, row) => sum + row.plannedCost, 0))}
                    </div>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 ${c.bgCard} ${c.borderCard}`}>
                    <div className={`text-[11px] font-medium ${c.textMuted}`}>実績コスト合計</div>
                    <div className={`mt-2 text-lg font-bold ${c.textPrimary}`}>
                      {formatYen(timeSlotRows.reduce((sum, row) => sum + row.actualCost, 0))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
