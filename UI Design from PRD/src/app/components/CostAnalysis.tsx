import { useMemo, useState } from "react";
import {
  BarChart3,
  Briefcase,
  Clock,
  DollarSign,
  Layers,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import { buildDeploymentWorkflows, buildSiteScope } from "./fieldDeploymentStore";
import {
  buildStepPlanDefaults,
  readProgressPlanStore,
  resolveStepPlanValues,
} from "./progressPlanStore";
import {
  buildWorkerSubmissionRecords,
  type WorkerSubmissionRecord,
} from "./workerMobileStore";

const USER_STORAGE_KEY = "fluxview-users-v1";
const INTERNAL_RATES = { fullTime: 1700, partner: 1400 } as const;
const OVERHEAD_RATE = 0.08;
const MONTH_BUCKETS = 6;

type ViewType = "shipper" | "process";
type PeriodType = "week" | "month" | "quarter";
type EmploymentKey = "fullTime" | "partner" | "dispatch";

type CostUser = {
  employmentType?: string;
  dispatchCompanyId?: string;
  status: "active" | "inactive" | "locked";
};

type CostRow = {
  id: string;
  name: string;
  category?: string;
  plannedVolume: number;
  actualVolume: number;
  plannedHours: number;
  actualHours: number;
  workers: Record<EmploymentKey, number>;
  hours: Record<EmploymentKey, number>;
  cost: Record<EmploymentKey, number> & { overhead: number };
  totalCost: number;
  plannedCost: number;
  costPerUnit: number;
  budgetVariance: number;
  averageUph: number;
};

function readUsers(): CostUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CostUser[]) : [];
  } catch {
    return [];
  }
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDateRange(period: PeriodType) {
  const days = period === "week" ? 7 : period === "month" ? 30 : 90;
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    return toDateInput(date);
  });
}

function buildMonthBuckets() {
  const current = new Date();
  return Array.from({ length: MONTH_BUCKETS }, (_, index) => {
    const date = new Date(current.getFullYear(), current.getMonth() - (MONTH_BUCKETS - index - 1), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: `${date.getMonth() + 1}月`,
    };
  });
}

function parseRecordDateTime(dateKey: string, timeLabel: string) {
  const [hours, minutes] = timeLabel.split(":").map(Number);
  const date = new Date(`${dateKey}T00:00:00`);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function getRecordHours(record: WorkerSubmissionRecord) {
  const startedAt = record.startedAt
    ? new Date(record.startedAt)
    : parseRecordDateTime(record.dateKey, record.scheduledStartTime);
  const endedAt = record.completedAt
    ? new Date(record.completedAt)
    : record.lastReportedAt
      ? new Date(record.lastReportedAt)
      : parseRecordDateTime(record.dateKey, record.scheduledEndTime);
  return Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 60000 - record.pausedMinutes) / 60;
}

function splitHours(total: number, ratios: Record<EmploymentKey, number>) {
  const fullTime = Number((total * ratios.fullTime).toFixed(1));
  const partner = Number((total * ratios.partner).toFixed(1));
  const dispatch = Number(Math.max(0, total - fullTime - partner).toFixed(1));
  return { fullTime, partner, dispatch } satisfies Record<EmploymentKey, number>;
}

function splitWorkers(total: number, ratios: Record<EmploymentKey, number>) {
  const fullTime = Math.round(total * ratios.fullTime);
  const partner = Math.round(total * ratios.partner);
  const dispatch = Math.max(0, total - fullTime - partner);
  return { fullTime, partner, dispatch } satisfies Record<EmploymentKey, number>;
}

function formatYen(value: number) {
  if (!Number.isFinite(value)) return "¥0";
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatHours(value: number) {
  return `${value.toFixed(1)}時間`;
}

function formatRatio(value: number, total: number) {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function normalizeEmploymentType(value?: string): EmploymentKey {
  if (value === "正社員") return "fullTime";
  if (value === "パートナー") return "partner";
  if (value === "派遣") return "dispatch";

  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("partner")) return "partner";
  if (normalized.includes("dispatch")) return "dispatch";
  if (normalized.includes("temp")) return "dispatch";
  return "fullTime";
}

function employmentLabel(key: EmploymentKey) {
  switch (key) {
    case "fullTime":
      return "正社員";
    case "partner":
      return "パートナー";
    default:
      return "派遣";
  }
}

export function CostAnalysis() {
  const c = useThemeColors();
  const { selectedSiteId, sites, workflows, shippers, processes, dispatchCompanies } = useMasterData();
  const [viewType, setViewType] = useState<ViewType>("shipper");
  const [periodFilter, setPeriodFilter] = useState<PeriodType>("month");

  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const scopedWorkflows = useMemo(
    () => workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)),
    [workflows, siteScope.siteIds],
  );
  const workflowViews = useMemo(
    () => buildDeploymentWorkflows(scopedWorkflows, shippers, sites, processes),
    [scopedWorkflows, shippers, sites, processes],
  );
  const users = useMemo(() => readUsers(), []);
  const planStore = useMemo(() => readProgressPlanStore(), []);
  const dateRange = useMemo(() => buildDateRange(periodFilter), [periodFilter]);
  const monthBuckets = useMemo(() => buildMonthBuckets(), []);
  const todayKey = useMemo(() => toDateInput(new Date()), []);

  const employmentMix = useMemo(() => {
    const counts = users
      .filter((user) => user.status === "active")
      .reduce(
        (acc, user) => {
          acc[normalizeEmploymentType(user.employmentType)] += 1;
          return acc;
        },
        { fullTime: 0, partner: 0, dispatch: 0 } satisfies Record<EmploymentKey, number>,
      );

    const total = counts.fullTime + counts.partner + counts.dispatch;
    const ratios = total > 0
      ? {
          fullTime: counts.fullTime / total,
          partner: counts.partner / total,
          dispatch: counts.dispatch / total,
        }
      : { fullTime: 0.45, partner: 0.3, dispatch: 0.25 };

    const dispatchUsers = users.filter(
      (user) => user.status === "active" && normalizeEmploymentType(user.employmentType) === "dispatch",
    );
    const dispatchRate = dispatchUsers.length > 0
      ? dispatchUsers.reduce((sum, user) => {
          return sum + (dispatchCompanies.find((item) => item.id === user.dispatchCompanyId)?.unitPrice ?? 1250);
        }, 0) / dispatchUsers.length
      : dispatchCompanies.length > 0
        ? dispatchCompanies.reduce((sum, item) => sum + item.unitPrice, 0) / dispatchCompanies.length
        : 1250;

    return {
      counts,
      ratios,
      rates: {
        fullTime: INTERNAL_RATES.fullTime,
        partner: INTERNAL_RATES.partner,
        dispatch: dispatchRate,
      },
    };
  }, [users, dispatchCompanies]);

  const aggregates = useMemo(() => {
    const shipperMap = new Map<string, CostRow>();
    const processMap = new Map<string, CostRow>();
    const monthlyCostMap = new Map<string, Record<EmploymentKey, number>>();

    const ensureRow = (map: Map<string, CostRow>, id: string, name: string, category?: string) => {
      const existing = map.get(id);
      if (existing) return existing;

      const next: CostRow = {
        id,
        name,
        category,
        plannedVolume: 0,
        actualVolume: 0,
        plannedHours: 0,
        actualHours: 0,
        workers: { fullTime: 0, partner: 0, dispatch: 0 },
        hours: { fullTime: 0, partner: 0, dispatch: 0 },
        cost: { fullTime: 0, partner: 0, dispatch: 0, overhead: 0 },
        totalCost: 0,
        plannedCost: 0,
        costPerUnit: 0,
        budgetVariance: 0,
        averageUph: 0,
      };

      map.set(id, next);
      return next;
    };

    dateRange.forEach((dateKey) => {
      const records = buildWorkerSubmissionRecords({
        dateKey,
        selectedSiteId,
        sites,
        workflows,
        shippers,
        processes,
      }).filter((record) => siteScope.siteIds.includes(record.siteId));

      records.forEach((record) => {
        const hours = getRecordHours(record);
        const workerHours = splitHours(hours, employmentMix.ratios);

        const shipperRow = ensureRow(shipperMap, record.shipperName, record.shipperName, record.workflowName);
        const processRow = ensureRow(processMap, record.processId, record.processName, record.shipperName);

        shipperRow.actualVolume += record.reportedQuantity;
        shipperRow.actualHours += hours;
        processRow.actualVolume += record.reportedQuantity;
        processRow.actualHours += hours;

        const monthKey = dateKey.slice(0, 7);
        const monthCurrent = monthlyCostMap.get(monthKey) ?? { fullTime: 0, partner: 0, dispatch: 0 };
        monthCurrent.fullTime += workerHours.fullTime * employmentMix.rates.fullTime;
        monthCurrent.partner += workerHours.partner * employmentMix.rates.partner;
        monthCurrent.dispatch += workerHours.dispatch * employmentMix.rates.dispatch;
        monthlyCostMap.set(monthKey, monthCurrent);
      });

      if (!planStore[dateKey] && dateKey !== todayKey) return;
      const dayPlans = planStore[dateKey] ?? {};

      workflowViews.forEach((workflow, workflowIndex) => {
        workflow.steps.forEach((step, stepIndex) => {
          const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph);
          const planned = resolveStepPlanValues(dayPlans, step.id, defaults).planned;
          const plannedHours = step.uph > 0 ? planned / step.uph : 0;

          ensureRow(shipperMap, workflow.shipperName, workflow.shipperName, workflow.workflowName).plannedVolume += planned;
          ensureRow(shipperMap, workflow.shipperName, workflow.shipperName, workflow.workflowName).plannedHours += plannedHours;
          ensureRow(processMap, step.processId, step.processName, workflow.shipperName).plannedVolume += planned;
          ensureRow(processMap, step.processId, step.processName, workflow.shipperName).plannedHours += plannedHours;
        });
      });
    });

    const finalize = (source: Map<string, CostRow>) =>
      Array.from(source.values())
        .map((row) => {
          const workers = splitWorkers(Math.max(1, Math.round(row.actualHours)), employmentMix.ratios);
          const hours = splitHours(row.actualHours, employmentMix.ratios);
          const plannedHours = splitHours(row.plannedHours, employmentMix.ratios);

          const cost = {
            fullTime: hours.fullTime * employmentMix.rates.fullTime,
            partner: hours.partner * employmentMix.rates.partner,
            dispatch: hours.dispatch * employmentMix.rates.dispatch,
            overhead: 0,
          };

          const directCost = cost.fullTime + cost.partner + cost.dispatch;
          cost.overhead = directCost * OVERHEAD_RATE;
          const totalCost = directCost + cost.overhead;
          const plannedCost = (
            plannedHours.fullTime * employmentMix.rates.fullTime +
            plannedHours.partner * employmentMix.rates.partner +
            plannedHours.dispatch * employmentMix.rates.dispatch
          ) * (1 + OVERHEAD_RATE);
          const budgetVariance = plannedCost > 0 ? ((totalCost - plannedCost) / plannedCost) * 100 : 0;

          return {
            ...row,
            workers,
            hours,
            cost,
            totalCost,
            plannedCost,
            costPerUnit: row.actualVolume > 0 ? totalCost / row.actualVolume : 0,
            budgetVariance: Number(budgetVariance.toFixed(1)),
            averageUph: row.actualHours > 0 ? Number((row.actualVolume / row.actualHours).toFixed(1)) : 0,
          } satisfies CostRow;
        })
        .sort((left, right) => right.totalCost - left.totalCost || left.name.localeCompare(right.name, "ja"));

    return {
      shipperRows: finalize(shipperMap),
      processRows: finalize(processMap),
      monthlyTrend: monthBuckets.map((bucket) => {
        const current = monthlyCostMap.get(bucket.key) ?? { fullTime: 0, partner: 0, dispatch: 0 };
        return {
          month: bucket.label,
          fullTime: Math.round(current.fullTime / 1000),
          partner: Math.round(current.partner / 1000),
          dispatch: Math.round(current.dispatch / 1000),
          total: Math.round((current.fullTime + current.partner + current.dispatch) / 1000),
        };
      }),
    };
  }, [
    dateRange,
    employmentMix.rates,
    employmentMix.ratios,
    monthBuckets,
    planStore,
    processes,
    selectedSiteId,
    shippers,
    siteScope.siteIds,
    sites,
    todayKey,
    workflowViews,
    workflows,
  ]);

  const activeData = viewType === "shipper" ? aggregates.shipperRows : aggregates.processRows;
  const totalCost = activeData.reduce((sum, row) => sum + row.totalCost, 0);
  const totalHours = activeData.reduce((sum, row) => sum + row.actualHours, 0);
  const totalVolume = activeData.reduce((sum, row) => sum + row.actualVolume, 0);
  const avgCostPerUnit = totalVolume > 0 ? totalCost / totalVolume : 0;

  const totalByType = {
    fullTime: activeData.reduce((sum, row) => sum + row.cost.fullTime, 0),
    partner: activeData.reduce((sum, row) => sum + row.cost.partner, 0),
    dispatch: activeData.reduce((sum, row) => sum + row.cost.dispatch, 0),
    overhead: activeData.reduce((sum, row) => sum + row.cost.overhead, 0),
  };

  const composition = [
    { key: "fullTime", label: "正社員", value: totalByType.fullTime, color: "bg-cyan-500" },
    { key: "partner", label: "パートナー", value: totalByType.partner, color: "bg-violet-500" },
    { key: "dispatch", label: "派遣", value: totalByType.dispatch, color: "bg-orange-500" },
    { key: "overhead", label: "間接費", value: totalByType.overhead, color: "bg-slate-500" },
  ] as const;

  const compositionTotal = composition.reduce((sum, item) => sum + item.value, 0);
  const trendMax = Math.max(1, ...aggregates.monthlyTrend.map((item) => item.total));
  const topRows = activeData.slice(0, 8);
  const topRowMax = Math.max(1, ...topRows.map((row) => row.totalCost));

  const kpis = [
    {
      label: "総原価",
      value: formatYen(totalCost),
      hint: `${activeData.length} 行`,
      icon: DollarSign,
      iconClass: "text-cyan-400",
    },
    {
      label: "総工数",
      value: formatHours(totalHours),
      hint: `${totalVolume.toLocaleString("ja-JP")} 件`,
      icon: Clock,
      iconClass: "text-blue-400",
    },
    {
      label: "件当たり原価",
      value: formatYen(avgCostPerUnit),
      hint: viewType === "shipper" ? "荷主別表示" : "工程別表示",
      icon: TrendingUp,
      iconClass: "text-emerald-400",
    },
    {
      label: "人員構成",
      value: `${employmentMix.counts.fullTime + employmentMix.counts.partner + employmentMix.counts.dispatch}`,
      hint: `${employmentLabel("fullTime")} ${employmentMix.counts.fullTime} / ${employmentLabel("partner")} ${employmentMix.counts.partner} / ${employmentLabel("dispatch")} ${employmentMix.counts.dispatch}`,
      icon: Users,
      iconClass: "text-amber-400",
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className={`text-[24px] font-semibold ${c.textPrimary}`}>コスト分析</div>
          <div className={`mt-1 text-[13px] ${c.textSecondary}`}>
            拠点単位で原価、生産性、計画差異を確認します。
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex items-center rounded-xl border p-1 ${c.bgCard} ${c.borderCard}`}>
            <button
              type="button"
              onClick={() => setViewType("shipper")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium ${viewType === "shipper" ? "bg-[#155DFC] text-white shadow" : c.textSecondary}`}
            >
              <Briefcase className="h-4 w-4" />
              荷主
            </button>
            <button
              type="button"
              onClick={() => setViewType("process")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium ${viewType === "process" ? "bg-[#155DFC] text-white shadow" : c.textSecondary}`}
            >
              <Layers className="h-4 w-4" />
              工程
            </button>
          </div>

          <div className={`flex items-center rounded-xl border overflow-hidden ${c.borderCard}`}>
            {(["week", "month", "quarter"] as PeriodType[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setPeriodFilter(period)}
                className={`px-4 py-2 text-[13px] ${periodFilter === period ? "bg-slate-700 text-white" : `${c.bgSurface} ${c.textSecondary}`}`}
              >
                {period === "week" ? "7日" : period === "month" ? "30日" : "90日"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <div key={item.label} className={`${c.bgCard} ${c.borderCard} rounded-3xl border p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`text-[11px] uppercase tracking-[0.16em] ${c.textMuted}`}>{item.label}</div>
                <div className={`mt-3 text-[24px] font-semibold ${c.textPrimary}`}>{item.value}</div>
                <div className={`mt-2 text-[12px] ${c.textSecondary}`}>{item.hint}</div>
              </div>
              <item.icon className={`h-5 w-5 ${item.iconClass}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className={`${c.bgCard} ${c.borderCard} rounded-3xl border p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={`text-[16px] font-semibold ${c.textPrimary}`}>コスト構成</div>
              <div className={`mt-1 text-[12px] ${c.textSecondary}`}>人件費と間接費の構成比</div>
            </div>
            <DollarSign className="h-5 w-5 text-cyan-400" />
          </div>

          <div className="mt-5 space-y-4">
            {composition.map((item) => (
              <div key={item.key} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <div className={`font-medium ${c.textPrimary}`}>{item.label}</div>
                  <div className={`${c.textSecondary}`}>
                    {formatYen(item.value)} ({formatRatio(item.value, compositionTotal)})
                  </div>
                </div>
                <div className={`h-2.5 overflow-hidden rounded-full ${c.bgSurface}`}>
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${compositionTotal > 0 ? (item.value / compositionTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${c.bgCard} ${c.borderCard} rounded-3xl border p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={`text-[16px] font-semibold ${c.textPrimary}`}>月次推移</div>
              <div className={`mt-1 text-[12px] ${c.textSecondary}`}>直近の月次原価推移</div>
            </div>
            <BarChart3 className="h-5 w-5 text-violet-400" />
          </div>

          <div className="mt-5 space-y-3">
            {aggregates.monthlyTrend.map((item) => (
              <div key={item.month} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className={c.textPrimary}>{item.month}</span>
                  <span className={c.textSecondary}>{item.total.toLocaleString("ja-JP")}千円</span>
                </div>
                <div className={`h-8 rounded-2xl ${c.bgSurface} overflow-hidden`}>
                  <div className="flex h-full">
                    <div
                      className="bg-cyan-500/80"
                      style={{ width: `${(item.fullTime / trendMax) * 100}%` }}
                    />
                    <div
                      className="bg-violet-500/80"
                      style={{ width: `${(item.partner / trendMax) * 100}%` }}
                    />
                    <div
                      className="bg-orange-500/80"
                      style={{ width: `${(item.dispatch / trendMax) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <section className={`${c.bgCard} ${c.borderCard} rounded-3xl border p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={`text-[16px] font-semibold ${c.textPrimary}`}>主要コスト要因</div>
              <div className={`mt-1 text-[12px] ${c.textSecondary}`}>現在表示で原価の大きい項目</div>
            </div>
            <Package className="h-5 w-5 text-amber-400" />
          </div>

          <div className="mt-5 space-y-3">
            {topRows.length === 0 ? (
              <div className={`rounded-2xl border px-4 py-10 text-center text-[13px] ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
                選択期間にデータがありません。
              </div>
            ) : (
              topRows.map((row) => (
                <div key={row.id} className={`rounded-2xl border p-4 ${c.bgSurface} ${c.borderCard}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`truncate text-[13px] font-semibold ${c.textPrimary}`}>{row.name}</div>
                      {row.category ? (
                        <div className={`mt-1 text-[11px] ${c.textSecondary}`}>{row.category}</div>
                      ) : null}
                    </div>
                    <div className={`shrink-0 text-[12px] ${c.textPrimary}`}>{formatYen(row.totalCost)}</div>
                  </div>
                  <div className={`mt-3 h-2 rounded-full ${c.bgCard}`}>
                    <div
                      className="h-full rounded-full bg-cyan-500"
                      style={{ width: `${(row.totalCost / topRowMax) * 100}%` }}
                    />
                  </div>
                  <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] ${c.textSecondary}`}>
                    <span>実績数 {row.actualVolume.toLocaleString("ja-JP")}件</span>
                    <span>工数 {formatHours(row.actualHours)}</span>
                    <span>UPH {row.averageUph.toFixed(1)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={`${c.bgCard} ${c.borderCard} rounded-3xl border overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <div className={`text-[16px] font-semibold ${c.textPrimary}`}>詳細内訳</div>
              <div className={`mt-1 text-[12px] ${c.textSecondary}`}>計画、実績、差異の明細</div>
            </div>
            <Users className="h-5 w-5 text-blue-400" />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className={`${c.bgSurface} border-y ${c.border}`}>
                <tr>
                  {[
                    viewType === "shipper" ? "荷主" : "工程",
                    "計画",
                    "実績",
                    "工数",
                    "コスト",
                    "件数当たりコスト",
                    "予算差異",
                  ].map((header) => (
                    <th
                      key={header}
                      className={`whitespace-nowrap px-4 py-3 text-[11px] uppercase tracking-[0.14em] ${c.textMuted}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`px-4 py-10 text-center text-[13px] ${c.textSecondary}`}>
                      条件に一致するデータがありません。
                    </td>
                  </tr>
                ) : (
                  activeData.map((row) => (
                    <tr key={row.id} className={`border-b ${c.border} ${c.bgCardHover}`}>
                      <td className="px-4 py-3">
                        <div className={`text-[13px] font-medium ${c.textPrimary}`}>{row.name}</div>
                        {row.category ? (
                          <div className={`mt-1 text-[11px] ${c.textSecondary}`}>{row.category}</div>
                        ) : null}
                      </td>
                      <td className={`px-4 py-3 text-[12px] ${c.textSecondary}`}>
                        <div>{row.plannedVolume.toLocaleString("ja-JP")} 件</div>
                        <div className={`mt-1 text-[11px] ${c.textMuted}`}>{formatHours(row.plannedHours)}</div>
                      </td>
                      <td className={`px-4 py-3 text-[12px] ${c.textSecondary}`}>
                        <div>{row.actualVolume.toLocaleString("ja-JP")} 件</div>
                        <div className={`mt-1 text-[11px] ${c.textMuted}`}>{formatHours(row.actualHours)}</div>
                      </td>
                      <td className={`px-4 py-3 text-[12px] ${c.textSecondary}`}>
                        <div>{employmentLabel("fullTime")} {formatHours(row.hours.fullTime)}</div>
                        <div>{employmentLabel("partner")} {formatHours(row.hours.partner)}</div>
                        <div>{employmentLabel("dispatch")} {formatHours(row.hours.dispatch)}</div>
                      </td>
                      <td className={`px-4 py-3 text-[12px] ${c.textSecondary}`}>
                        <div>{formatYen(row.totalCost)}</div>
                        <div className={`mt-1 text-[11px] ${c.textMuted}`}>間接費 {formatYen(row.cost.overhead)}</div>
                      </td>
                      <td className={`px-4 py-3 text-[13px] ${c.textPrimary}`}>{formatYen(row.costPerUnit)}</td>
                      <td className={`px-4 py-3 text-[13px] ${row.budgetVariance > 0 ? "text-rose-400" : row.budgetVariance < 0 ? "text-emerald-400" : c.textSecondary}`}>
                        {row.budgetVariance > 0 ? "+" : ""}
                        {row.budgetVariance.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
