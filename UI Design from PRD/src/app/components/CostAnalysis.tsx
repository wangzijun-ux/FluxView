import { useMemo, useState } from "react";
import { BarChart3, Briefcase, Clock, DollarSign, Download, Layers, Package, PieChart as PieChartIcon, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import { buildDeploymentWorkflows, buildSiteScope } from "./fieldDeploymentStore";
import { buildStepPlanDefaults, readProgressPlanStore, resolveStepPlanValues } from "./progressPlanStore";
import { buildWorkerSubmissionRecords, type WorkerSubmissionRecord } from "./workerMobileStore";

const USER_STORAGE_KEY = "fluxview-users-v1";
const INTERNAL_RATES = { fullTime: 1700, partner: 1400 } as const;
const OVERHEAD_RATE = 0.08;
const MONTH_BUCKETS = 6;

type ViewType = "shipper" | "process";
type PeriodType = "week" | "month" | "quarter";
type EmploymentKey = "fullTime" | "partner" | "dispatch";
type CostUser = { employmentType: "正社員" | "パートナー" | "派遣"; dispatchCompanyId?: string; status: "active" | "inactive" | "locked" };
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
  const startedAt = record.startedAt ? new Date(record.startedAt) : parseRecordDateTime(record.dateKey, record.scheduledStartTime);
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
  return `${value.toFixed(1)}h`;
}

export function CostAnalysis() {
  const c = useThemeColors();
  const { selectedSiteId, sites, workflows, shippers, areas, processes, dispatchCompanies } = useMasterData();
  const [viewType, setViewType] = useState<ViewType>("shipper");
  const [periodFilter, setPeriodFilter] = useState<PeriodType>("month");

  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const scopedWorkflows = useMemo(() => workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)), [workflows, siteScope.siteIds]);
  const workflowViews = useMemo(() => buildDeploymentWorkflows(scopedWorkflows, shippers, areas, processes), [scopedWorkflows, shippers, areas, processes]);
  const users = useMemo(() => readUsers(), []);
  const planStore = useMemo(() => readProgressPlanStore(), []);
  const dateRange = useMemo(() => buildDateRange(periodFilter), [periodFilter]);
  const monthBuckets = useMemo(() => buildMonthBuckets(), []);
  const todayKey = useMemo(() => toDateInput(new Date()), []);

  const employmentMix = useMemo(() => {
    const counts = users.filter((user) => user.status === "active").reduce(
      (acc, user) => {
        if (user.employmentType === "正社員") acc.fullTime += 1;
        if (user.employmentType === "パートナー") acc.partner += 1;
        if (user.employmentType === "派遣") acc.dispatch += 1;
        return acc;
      },
      { fullTime: 0, partner: 0, dispatch: 0 } satisfies Record<EmploymentKey, number>,
    );
    const total = counts.fullTime + counts.partner + counts.dispatch;
    const ratios = total > 0
      ? { fullTime: counts.fullTime / total, partner: counts.partner / total, dispatch: counts.dispatch / total }
      : { fullTime: 0.45, partner: 0.3, dispatch: 0.25 };
    const dispatchUsers = users.filter((user) => user.status === "active" && user.employmentType === "派遣");
    const dispatchRate = dispatchUsers.length > 0
      ? dispatchUsers.reduce((sum, user) => sum + (dispatchCompanies.find((item) => item.id === user.dispatchCompanyId)?.unitPrice ?? 1250), 0) / dispatchUsers.length
      : dispatchCompanies.length > 0
        ? dispatchCompanies.reduce((sum, item) => sum + item.unitPrice, 0) / dispatchCompanies.length
        : 1250;
    return {
      counts,
      ratios,
      rates: { fullTime: INTERNAL_RATES.fullTime, partner: INTERNAL_RATES.partner, dispatch: dispatchRate },
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
        areas,
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
      Array.from(source.values()).map((row) => {
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
      }).sort((left, right) => right.totalCost - left.totalCost || left.name.localeCompare(right.name, "ja"));

    return {
      shipperRows: finalize(shipperMap),
      processRows: finalize(processMap),
      monthlyTrend: monthBuckets.map((bucket) => {
        const current = monthlyCostMap.get(bucket.key) ?? { fullTime: 0, partner: 0, dispatch: 0 };
        return {
          month: bucket.label,
          正社員: Math.round(current.fullTime / 1000),
          パートナー: Math.round(current.partner / 1000),
          派遣: Math.round(current.dispatch / 1000),
          合計: Math.round((current.fullTime + current.partner + current.dispatch) / 1000),
        };
      }),
    };
  }, [areas, dateRange, employmentMix.rates, employmentMix.ratios, monthBuckets, planStore, processes, selectedSiteId, shippers, siteScope.siteIds, sites, todayKey, workflowViews, workflows]);

  const activeData = viewType === "shipper" ? aggregates.shipperRows : aggregates.processRows;
  const totalCost = activeData.reduce((sum, row) => sum + row.totalCost, 0);
  const totalHours = activeData.reduce((sum, row) => sum + row.actualHours, 0);
  const totalVolume = activeData.reduce((sum, row) => sum + row.actualVolume, 0);
  const totalByType = {
    fullTime: activeData.reduce((sum, row) => sum + row.cost.fullTime, 0),
    partner: activeData.reduce((sum, row) => sum + row.cost.partner, 0),
    dispatch: activeData.reduce((sum, row) => sum + row.cost.dispatch, 0),
    overhead: activeData.reduce((sum, row) => sum + row.cost.overhead, 0),
  };
  const pieData = [
    { name: "正社員", value: totalByType.fullTime, color: "#22d3ee" },
    { name: "パートナー", value: totalByType.partner, color: "#a78bfa" },
    { name: "派遣", value: totalByType.dispatch, color: "#fb923c" },
    { name: "管理OH", value: totalByType.overhead, color: "#6b7280" },
  ];
  const barData = activeData.slice(0, 8).map((row) => ({
    name: row.name.length > 10 ? `${row.name.slice(0, 10)}…` : row.name,
    正社員: Math.round(row.cost.fullTime / 10000),
    パートナー: Math.round(row.cost.partner / 10000),
    派遣: Math.round(row.cost.dispatch / 10000),
    管理費: Math.round(row.cost.overhead / 10000),
  }));
  const avgCostPerUnit = totalVolume > 0 ? totalCost / totalVolume : 0;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className={`flex items-center rounded-lg ${c.bgCard} p-1 border ${c.borderCard}`}>
          <button onClick={() => setViewType("shipper")} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-medium ${viewType === "shipper" ? "bg-cyan-600 text-white shadow" : c.textSecondary}`}><Briefcase className="w-4 h-4" />荷主別</button>
          <button onClick={() => setViewType("process")} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-medium ${viewType === "process" ? "bg-cyan-600 text-white shadow" : c.textSecondary}`}><Layers className="w-4 h-4" />工程別</button>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center rounded-lg border ${c.borderCard} overflow-hidden`}>
            {["week", "month", "quarter"].map((key) => (
              <button key={key} onClick={() => setPeriodFilter(key as PeriodType)} className={`px-3 py-1.5 text-[12px] ${periodFilter === key ? "bg-slate-700 text-white" : `${c.bgSurface} ${c.textSecondary}`}`}>{key === "week" ? "週" : key === "month" ? "月" : "四半期"}</button>
            ))}
          </div>
          <button className={`flex items-center gap-2 px-4 py-1.5 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[13px]`}><Download className="w-4 h-4" />CSV出力</button>
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-6 px-4 py-3 rounded-xl border ${c.borderCard} ${c.bgCard}`}>
        <div><div className={`text-[12px] ${c.textMuted}`}>対象拠点</div><div className={`text-[13px] ${c.textPrimary}`}>{siteScope.siteName}</div></div>
        <div><div className={`text-[12px] ${c.textMuted}`}>対象期間</div><div className={`text-[13px] ${c.textPrimary}`}>{dateRange[0]} - {dateRange[dateRange.length - 1]}</div></div>
        <div><div className={`text-[12px] ${c.textMuted}`}>データ連動</div><div className={`text-[13px] ${c.textPrimary}`}>送信実績 / 進捗管理 / ワークフロー管理 / 派遣会社マスタ</div></div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {[
          { icon: DollarSign, label: "総原価", value: formatYen(totalCost), sub: "送信実績ベース", color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { icon: Clock, label: "総実働時間", value: formatHours(totalHours), sub: "送信記録から算出", color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { icon: Package, label: "総実績数量", value: totalVolume.toLocaleString("ja-JP"), sub: viewType === "shipper" ? "荷主別" : "工程別", color: "text-amber-400", bg: "bg-amber-500/10" },
          { icon: Users, label: "雇用構成", value: `${employmentMix.counts.fullTime + employmentMix.counts.partner + employmentMix.counts.dispatch}名`, sub: `正${employmentMix.counts.fullTime} / P${employmentMix.counts.partner} / 派${employmentMix.counts.dispatch}`, color: "text-violet-400", bg: "bg-violet-500/10" },
          { icon: BarChart3, label: "平均個あたり原価", value: `¥${avgCostPerUnit.toFixed(1)}`, sub: "計画数量と比較", color: "text-rose-400", bg: "bg-rose-500/10" },
        ].map((kpi) => (
          <div key={kpi.label} className={`${c.bgCard} rounded-xl border ${c.border} p-4`}>
            <div className="flex items-center gap-2 mb-2"><div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center`}><kpi.icon className={`w-4 h-4 ${kpi.color}`} /></div><span className={`text-[12px] ${c.textMuted}`}>{kpi.label}</span></div>
            <div className={`text-[22px] ${c.textPrimary} tabular-nums`}>{kpi.value}</div>
            <div className={`text-[11px] ${c.textDimmed} mt-1`}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className={`flex flex-wrap items-center gap-6 px-4 py-2.5 rounded-lg ${c.bgSurface} border ${c.borderCard}`}>
        <span className={`text-[12px] ${c.textMuted}`}>基準単価:</span>
        <span className={`text-[12px] ${c.textSecondary}`}>正社員 ¥{INTERNAL_RATES.fullTime.toLocaleString()}/h</span>
        <span className={`text-[12px] ${c.textSecondary}`}>パートナー ¥{INTERNAL_RATES.partner.toLocaleString()}/h</span>
        <span className={`text-[12px] ${c.textSecondary}`}>派遣 ¥{Math.round(employmentMix.rates.dispatch).toLocaleString()}/h</span>
        <span className={`text-[11px] ${c.textMuted}`}>派遣単価は派遣会社マスタ連動</span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center gap-2 mb-4"><PieChartIcon className="w-4 h-4 text-cyan-400" /><h3 className={`${c.textPrimary} text-[14px]`}>原価構成比</h3></div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">{pieData.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie>
              <Tooltip formatter={(value: number) => [formatYen(value), ""]} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center gap-2 mb-4"><BarChart3 className="w-4 h-4 text-violet-400" /><h3 className={`${c.textPrimary} text-[14px]`}>{viewType === "shipper" ? "荷主別原価（万円）" : "工程別原価（万円）"}</h3></div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={c.isDark ? "#1e1e2e" : "#e5e7eb"} />
              <XAxis type="number" stroke={c.isDark ? "#4a4a5e" : "#9ca3af"} tick={{ fontSize: 11, fill: c.isDark ? "#6b6b7e" : "#6b7280" }} />
              <YAxis dataKey="name" type="category" stroke={c.isDark ? "#4a4a5e" : "#9ca3af"} tick={{ fontSize: 11, fill: c.isDark ? "#6b6b7e" : "#6b7280" }} width={82} />
              <Tooltip />
              <Bar dataKey="正社員" stackId="a" fill="#22d3ee" />
              <Bar dataKey="パートナー" stackId="a" fill="#a78bfa" />
              <Bar dataKey="派遣" stackId="a" fill="#fb923c" />
              <Bar dataKey="管理費" stackId="a" fill="#6b7280" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-emerald-400" /><h3 className={`${c.textPrimary} text-[14px]`}>月次推移（千円）</h3></div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={aggregates.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.isDark ? "#1e1e2e" : "#e5e7eb"} />
              <XAxis dataKey="month" stroke={c.isDark ? "#4a4a5e" : "#9ca3af"} tick={{ fontSize: 11, fill: c.isDark ? "#6b6b7e" : "#6b7280" }} />
              <YAxis stroke={c.isDark ? "#4a4a5e" : "#9ca3af"} tick={{ fontSize: 11, fill: c.isDark ? "#6b6b7e" : "#6b7280" }} />
              <Tooltip />
              <Line type="monotone" dataKey="正社員" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="パートナー" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="派遣" stroke="#fb923c" strokeWidth={2} dot={{ r: 3 }} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={`${c.bgCard} rounded-xl border ${c.border} overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${c.border}`}>
          <h3 className={c.textPrimary}>{viewType === "shipper" ? "荷主別原価明細" : "工程別原価明細"}</h3>
          <p className={`${c.textMuted} text-[12px] mt-1`}>実績数量は送信実績、予定数量は進捗管理、工程情報はワークフロー管理に連動します。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b ${c.border}`}>
                {[(viewType === "shipper" ? "荷主" : "工程"), "正社員", "パートナー", "派遣", "管理OH", "原価合計", "実績数量", "個あたり原価", "予算比"].map((header) => (
                  <th key={header} className={`text-left text-[11px] ${c.textMuted} px-4 py-3 whitespace-nowrap`}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeData.map((row) => (
                <tr key={row.id} className={`border-b ${c.border} ${c.bgCardHover}`}>
                  <td className="px-4 py-3">
                    <div className={`text-[13px] ${c.textPrimary}`}>{row.name}</div>
                    {row.category ? <div className={`text-[10px] ${c.textDimmed} mt-1`}>{row.category}</div> : null}
                  </td>
                  <td className="px-4 py-3"><div className="text-[12px] text-cyan-400 tabular-nums">{formatYen(row.cost.fullTime)}</div><div className={`text-[10px] ${c.textDimmed}`}>{row.workers.fullTime}名 / {row.hours.fullTime.toFixed(1)}h</div></td>
                  <td className="px-4 py-3"><div className="text-[12px] text-violet-400 tabular-nums">{formatYen(row.cost.partner)}</div><div className={`text-[10px] ${c.textDimmed}`}>{row.workers.partner}名 / {row.hours.partner.toFixed(1)}h</div></td>
                  <td className="px-4 py-3"><div className="text-[12px] text-orange-400 tabular-nums">{formatYen(row.cost.dispatch)}</div><div className={`text-[10px] ${c.textDimmed}`}>{row.workers.dispatch}名 / {row.hours.dispatch.toFixed(1)}h</div></td>
                  <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}>{formatYen(row.cost.overhead)}</td>
                  <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>{formatYen(row.totalCost)}</td>
                  <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}><div>{row.actualVolume.toLocaleString("ja-JP")}</div><div className={`text-[10px] ${c.textDimmed}`}>予定 {row.plannedVolume.toLocaleString("ja-JP")}</div></td>
                  <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>¥{row.costPerUnit.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-[13px] tabular-nums ${row.budgetVariance > 0 ? "text-red-400" : row.budgetVariance < 0 ? "text-emerald-400" : c.textSecondary}`}>{row.budgetVariance > 0 ? "+" : ""}{row.budgetVariance.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
