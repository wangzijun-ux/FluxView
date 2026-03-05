import { useState } from "react";
import {
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Clock,
  Package,
  Filter,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  AlertTriangle,
  ChevronDown,
  Download,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { useThemeColors } from "./ThemeContext";

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

interface CostEntry {
  shipper: string;
  shipperId: string;
  category: string;
  workers: { fullTime: number; partner: number; dispatch: number };
  hours: { fullTime: number; partner: number; dispatch: number };
  cost: { fullTime: number; partner: number; dispatch: number; overhead: number };
  volume: number;
  costPerUnit: number;
  budgetVariance: number; // percentage vs plan
  trend: "up" | "down" | "stable";
}

const costData: CostEntry[] = [
  {
    shipper: "荷主A (家電)", shipperId: "S001", category: "家電",
    workers: { fullTime: 25, partner: 20, dispatch: 40 },
    hours: { fullTime: 200, partner: 160, dispatch: 320 },
    cost: { fullTime: 340000, partner: 224000, dispatch: 400000, overhead: 58000 },
    volume: 73400, costPerUnit: 13.9, budgetVariance: 3.2, trend: "up",
  },
  {
    shipper: "荷主B (食品)", shipperId: "S002", category: "食品",
    workers: { fullTime: 18, partner: 15, dispatch: 29 },
    hours: { fullTime: 144, partner: 120, dispatch: 232 },
    cost: { fullTime: 244800, partner: 168000, dispatch: 290000, overhead: 42000 },
    volume: 89600, costPerUnit: 8.3, budgetVariance: -1.5, trend: "down",
  },
  {
    shipper: "荷主C (アパレル)", shipperId: "S003", category: "アパレル",
    workers: { fullTime: 12, partner: 10, dispatch: 26 },
    hours: { fullTime: 96, partner: 80, dispatch: 208 },
    cost: { fullTime: 163200, partner: 112000, dispatch: 260000, overhead: 32000 },
    volume: 35900, costPerUnit: 15.8, budgetVariance: 7.8, trend: "up",
  },
  {
    shipper: "荷主D (日用品)", shipperId: "S004", category: "日用品",
    workers: { fullTime: 15, partner: 12, dispatch: 25 },
    hours: { fullTime: 120, partner: 96, dispatch: 200 },
    cost: { fullTime: 204000, partner: 134400, dispatch: 250000, overhead: 38000 },
    volume: 101000, costPerUnit: 6.2, budgetVariance: -0.5, trend: "stable",
  },
  {
    shipper: "荷主E (医薬品)", shipperId: "S005", category: "医薬品",
    workers: { fullTime: 20, partner: 8, dispatch: 15 },
    hours: { fullTime: 160, partner: 64, dispatch: 120 },
    cost: { fullTime: 272000, partner: 89600, dispatch: 150000, overhead: 52000 },
    volume: 22800, costPerUnit: 24.7, budgetVariance: -2.1, trend: "down",
  },
];

const monthlyTrendData = [
  { month: "10月", 正社員: 1050, パートナー: 620, 派遣: 1180, 合計: 2850 },
  { month: "11月", 正社員: 1080, パートナー: 650, 派遣: 1250, 合計: 2980 },
  { month: "12月", 正社員: 1100, パートナー: 780, 派遣: 1580, 合計: 3460 },
  { month: "1月",  正社員: 1060, パートナー: 640, 派遣: 1150, 合計: 2850 },
  { month: "2月",  正社員: 1090, パートナー: 670, 派遣: 1200, 合計: 2960 },
  { month: "3月",  正社員: 1120, パートナー: 700, 派遣: 1350, 合計: 3170 },
];

const COLORS = {
  fullTime: "#22d3ee",
  partner: "#a78bfa",
  dispatch: "#fb923c",
  overhead: "#6b7280",
};

const unitRates = {
  fullTime: "¥1,700/h",
  partner: "¥1,400/h",
  dispatch: "¥1,250/h",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CostAnalysis() {
  const [selectedShipper, setSelectedShipper] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState("month");
  const c = useThemeColors();

  const gridStroke = c.isDark ? "#1e1e2e" : "#e5e7eb";
  const axisStroke = c.isDark ? "#4a4a5e" : "#9ca3af";
  const tickFill = c.isDark ? "#6b6b7e" : "#6b7280";
  const tooltipBg = c.isDark ? "#1a1a2e" : "#ffffff";
  const tooltipBorder = c.isDark ? "#2a2a3e" : "#e5e7eb";
  const tooltipColor = c.isDark ? "#e0e0e0" : "#1f2937";

  // Totals
  const totalCost = costData.reduce((s, d) => s + d.cost.fullTime + d.cost.partner + d.cost.dispatch + d.cost.overhead, 0);
  const totalWorkers = costData.reduce((s, d) => s + d.workers.fullTime + d.workers.partner + d.workers.dispatch, 0);
  const totalHours = costData.reduce((s, d) => s + d.hours.fullTime + d.hours.partner + d.hours.dispatch, 0);
  const totalVolume = costData.reduce((s, d) => s + d.volume, 0);
  const avgCostPerUnit = Math.round((totalCost / totalVolume) * 10) / 10;

  const totalByType = {
    fullTime: costData.reduce((s, d) => s + d.cost.fullTime, 0),
    partner: costData.reduce((s, d) => s + d.cost.partner, 0),
    dispatch: costData.reduce((s, d) => s + d.cost.dispatch, 0),
    overhead: costData.reduce((s, d) => s + d.cost.overhead, 0),
  };

  const pieData = [
    { name: "正社員", value: totalByType.fullTime, color: COLORS.fullTime },
    { name: "パートナー", value: totalByType.partner, color: COLORS.partner },
    { name: "派遣", value: totalByType.dispatch, color: COLORS.dispatch },
    { name: "管理費", value: totalByType.overhead, color: COLORS.overhead },
  ];

  // Shipper bar chart data
  const shipperBarData = costData.map((d) => ({
    name: d.shipper.replace(/ \(.+\)/, ""),
    正社員: Math.round(d.cost.fullTime / 10000),
    パートナー: Math.round(d.cost.partner / 10000),
    派遣: Math.round(d.cost.dispatch / 10000),
    管理費: Math.round(d.cost.overhead / 10000),
  }));

  const selected = selectedShipper ? costData.find((d) => d.shipperId === selectedShipper) : null;

  const formatYen = (v: number) => {
    if (v >= 10000) return `¥${(v / 10000).toFixed(1)}万`;
    return `¥${v.toLocaleString()}`;
  };

  return (
    <div className="p-6 space-y-5 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={c.textPrimary}>荷主別原価分析</h1>
          <p className={`${c.textSecondary} text-[14px] mt-1`}>
            雇用形態別（正社員・パートナー・派遣）の原価構成と荷主別収益性を分析
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center rounded-lg border ${c.borderCard} overflow-hidden`}>
            {[
              { key: "week", label: "週" },
              { key: "month", label: "月" },
              { key: "quarter", label: "四半期" },
            ].map((p) => (
              <button key={p.key} onClick={() => setPeriodFilter(p.key)}
                className={`px-3 py-1.5 text-[12px] transition-all ${
                  periodFilter === p.key
                    ? "bg-cyan-600 text-white"
                    : `${c.bgSurface} ${c.textSecondary}`
                }`}>{p.label}</button>
            ))}
          </div>
          <button className={`flex items-center gap-2 px-4 py-2 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[13px] hover:opacity-80 transition-all`}>
            <Download className="w-4 h-4" />CSV出力
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { icon: DollarSign, label: "総原価", value: formatYen(totalCost), sub: "今月累計", iconColor: "text-cyan-400", bgIcon: "bg-cyan-500/10" },
          { icon: Users, label: "総作業員", value: `${totalWorkers}名`, sub: `正${costData.reduce((s,d)=>s+d.workers.fullTime,0)} / P${costData.reduce((s,d)=>s+d.workers.partner,0)} / 派${costData.reduce((s,d)=>s+d.workers.dispatch,0)}`, iconColor: "text-violet-400", bgIcon: "bg-violet-500/10" },
          { icon: Clock, label: "総実働時間", value: `${totalHours.toLocaleString()}h`, sub: "全雇用形態合計", iconColor: "text-emerald-400", bgIcon: "bg-emerald-500/10" },
          { icon: Package, label: "総処理量", value: `${(totalVolume / 1000).toFixed(1)}K`, sub: "全荷主合計", iconColor: "text-amber-400", bgIcon: "bg-amber-500/10" },
          { icon: BarChart3, label: "平均個あたり原価", value: `¥${avgCostPerUnit}`, sub: "全荷主平均", iconColor: "text-rose-400", bgIcon: "bg-rose-500/10" },
        ].map((kpi) => (
          <div key={kpi.label} className={`${c.bgCard} rounded-xl border ${c.border} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${kpi.bgIcon} flex items-center justify-center`}>
                <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
              </div>
              <span className={`text-[12px] ${c.textMuted}`}>{kpi.label}</span>
            </div>
            <div className={`text-[22px] ${c.textPrimary} tabular-nums`}>{kpi.value}</div>
            <div className={`text-[11px] ${c.textDimmed} mt-1`}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Unit Rate Reference */}
      <div className={`flex items-center gap-6 px-4 py-2.5 rounded-lg ${c.bgSurface} border ${c.borderCard}`}>
        <span className={`text-[12px] ${c.textMuted}`}>基準単価:</span>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.fullTime }} /><span className={`text-[12px] ${c.textSecondary}`}>正社員 {unitRates.fullTime}</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.partner }} /><span className={`text-[12px] ${c.textSecondary}`}>パートナー {unitRates.partner}</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.dispatch }} /><span className={`text-[12px] ${c.textSecondary}`}>派遣 {unitRates.dispatch}</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.overhead }} /><span className={`text-[12px] ${c.textSecondary}`}>管理OH</span></div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Pie: Cost Breakdown */}
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="w-4 h-4 text-cyan-400" />
            <h3 className={`${c.textPrimary} text-[14px]`}>原価構成比</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "8px", color: tooltipColor, fontSize: "12px" }}
                formatter={(value: number) => [formatYen(value), ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className={`text-[11px] ${c.textSecondary}`}>{d.name}</span>
                <span className={`text-[11px] ${c.textMuted} ml-auto tabular-nums`}>{Math.round(d.value / totalCost * 100)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar: Shipper Breakdown */}
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-violet-400" />
            <h3 className={`${c.textPrimary} text-[14px]`}>荷主別原価（万円）</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={shipperBarData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis type="number" stroke={axisStroke} tick={{ fontSize: 11, fill: tickFill }} />
              <YAxis dataKey="name" type="category" stroke={axisStroke} tick={{ fontSize: 11, fill: tickFill }} width={50} />
              <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "8px", color: tooltipColor, fontSize: "12px" }} />
              <Bar dataKey="正社員" stackId="a" fill={COLORS.fullTime} radius={0} />
              <Bar dataKey="パートナー" stackId="a" fill={COLORS.partner} radius={0} />
              <Bar dataKey="派遣" stackId="a" fill={COLORS.dispatch} radius={0} />
              <Bar dataKey="管理費" stackId="a" fill={COLORS.overhead} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line: Monthly Trend */}
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className={`${c.textPrimary} text-[14px]`}>月次推移（千円）</h3>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="month" stroke={axisStroke} tick={{ fontSize: 11, fill: tickFill }} />
              <YAxis stroke={axisStroke} tick={{ fontSize: 11, fill: tickFill }} />
              <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "8px", color: tooltipColor, fontSize: "12px" }} />
              <Line type="monotone" dataKey="正社員" stroke={COLORS.fullTime} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="パートナー" stroke={COLORS.partner} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="派遣" stroke={COLORS.dispatch} strokeWidth={2} dot={{ r: 3 }} />
              <Legend wrapperStyle={{ fontSize: "11px", color: tickFill }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail Table */}
      <div className={`${c.bgCard} rounded-xl border ${c.border} overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${c.border} flex items-center justify-between`}>
          <div>
            <h3 className={c.textPrimary}>荷主別原価明細</h3>
            <p className={`${c.textMuted} text-[12px] mt-1`}>原価算出: (累計実働時間 × 雇用形態別単価) + 管理オーバーヘッド</p>
          </div>
          <div className="flex items-center gap-2">
            <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[12px]`}>
              <Filter className="w-3.5 h-3.5" />フィルタ
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-b ${c.border}`}>
                {["荷主", "正社員", "パートナー", "派遣", "管理OH", "原価合計", "処理量", "個あたり原価", "予算比", ""].map((h) => (
                  <th key={h} className={`text-left text-[11px] ${c.textMuted} px-4 py-3 whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costData.map((row) => {
                const rowTotal = row.cost.fullTime + row.cost.partner + row.cost.dispatch + row.cost.overhead;
                const isSelected = selectedShipper === row.shipperId;
                return (
                  <tr key={row.shipperId}
                    onClick={() => setSelectedShipper(isSelected ? null : row.shipperId)}
                    className={`border-b ${c.border} cursor-pointer transition-all ${isSelected ? "bg-cyan-500/5" : c.bgCardHover}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] ${c.textPrimary}`}>{row.shipper}</span>
                        {row.budgetVariance > 5 && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-[12px] text-cyan-400 tabular-nums">{formatYen(row.cost.fullTime)}</span>
                        <div className={`text-[10px] ${c.textDimmed}`}>{row.workers.fullTime}名 / {row.hours.fullTime}h</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-[12px] text-violet-400 tabular-nums">{formatYen(row.cost.partner)}</span>
                        <div className={`text-[10px] ${c.textDimmed}`}>{row.workers.partner}名 / {row.hours.partner}h</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-[12px] text-orange-400 tabular-nums">{formatYen(row.cost.dispatch)}</span>
                        <div className={`text-[10px] ${c.textDimmed}`}>{row.workers.dispatch}名 / {row.hours.dispatch}h</div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}>{formatYen(row.cost.overhead)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[13px] ${c.textPrimary} tabular-nums`}>{formatYen(rowTotal)}</span>
                    </td>
                    <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}>{row.volume.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>¥{row.costPerUnit}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {row.budgetVariance > 0 ? <TrendingUp className="w-3 h-3 text-red-400" /> : <TrendingDown className="w-3 h-3 text-emerald-400" />}
                        <span className={`text-[13px] tabular-nums ${row.budgetVariance > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {row.budgetVariance > 0 ? "+" : ""}{row.budgetVariance}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button className={c.textDimmed}><ChevronDown className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={`${c.bgSurface}`}>
                <td className={`px-4 py-3 text-[13px] ${c.textPrimary}`}>合計</td>
                <td className="px-4 py-3 text-[12px] text-cyan-400 tabular-nums">{formatYen(totalByType.fullTime)}</td>
                <td className="px-4 py-3 text-[12px] text-violet-400 tabular-nums">{formatYen(totalByType.partner)}</td>
                <td className="px-4 py-3 text-[12px] text-orange-400 tabular-nums">{formatYen(totalByType.dispatch)}</td>
                <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}>{formatYen(totalByType.overhead)}</td>
                <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>{formatYen(totalCost)}</td>
                <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}>{totalVolume.toLocaleString()}</td>
                <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>¥{avgCostPerUnit}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Selected Shipper Detail */}
      {selected && (
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className={c.textPrimary}>{selected.shipper} 詳細分析</h3>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.bgSurface} ${c.textMuted}`}>{selected.category}</span>
            </div>
            <button onClick={() => setSelectedShipper(null)} className={`${c.textMuted} text-[12px]`}>閉じる ×</button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {/* Workforce mix */}
            <div className={`${c.bgSurface} rounded-xl p-4`}>
              <h4 className={`text-[12px] ${c.textMuted} mb-3`}>人員構成</h4>
              <div className="space-y-3">
                {[
                  { label: "正社員", count: selected.workers.fullTime, color: COLORS.fullTime, total: selected.workers.fullTime + selected.workers.partner + selected.workers.dispatch },
                  { label: "パートナー", count: selected.workers.partner, color: COLORS.partner, total: selected.workers.fullTime + selected.workers.partner + selected.workers.dispatch },
                  { label: "派遣", count: selected.workers.dispatch, color: COLORS.dispatch, total: selected.workers.fullTime + selected.workers.partner + selected.workers.dispatch },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className={`text-[12px] ${c.textSecondary}`}>{item.label}</span>
                      </div>
                      <span className={`text-[12px] ${c.textPrimary} tabular-nums`}>{item.count}名 ({Math.round(item.count / item.total * 100)}%)</span>
                    </div>
                    <div className={`w-full h-1.5 rounded-full ${c.isDark ? "bg-gray-800" : "bg-gray-200"} overflow-hidden`}>
                      <div className="h-full rounded-full" style={{ width: `${(item.count / item.total) * 100}%`, backgroundColor: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hours breakdown */}
            <div className={`${c.bgSurface} rounded-xl p-4`}>
              <h4 className={`text-[12px] ${c.textMuted} mb-3`}>実働時間</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${c.textSecondary}`}>正社員</span>
                  <span className="text-[12px] text-cyan-400 tabular-nums">{selected.hours.fullTime}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${c.textSecondary}`}>パートナー</span>
                  <span className="text-[12px] text-violet-400 tabular-nums">{selected.hours.partner}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${c.textSecondary}`}>派遣</span>
                  <span className="text-[12px] text-orange-400 tabular-nums">{selected.hours.dispatch}h</span>
                </div>
                <div className={`border-t ${c.border} pt-2 mt-2 flex items-center justify-between`}>
                  <span className={`text-[12px] ${c.textPrimary}`}>合計</span>
                  <span className={`text-[13px] ${c.textPrimary} tabular-nums`}>{selected.hours.fullTime + selected.hours.partner + selected.hours.dispatch}h</span>
                </div>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className={`${c.bgSurface} rounded-xl p-4`}>
              <h4 className={`text-[12px] ${c.textMuted} mb-3`}>原価内訳</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${c.textSecondary}`}>正社員</span>
                  <span className="text-[12px] text-cyan-400 tabular-nums">{formatYen(selected.cost.fullTime)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${c.textSecondary}`}>パートナー</span>
                  <span className="text-[12px] text-violet-400 tabular-nums">{formatYen(selected.cost.partner)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${c.textSecondary}`}>派遣</span>
                  <span className="text-[12px] text-orange-400 tabular-nums">{formatYen(selected.cost.dispatch)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${c.textSecondary}`}>管理OH</span>
                  <span className={`text-[12px] ${c.textSecondary} tabular-nums`}>{formatYen(selected.cost.overhead)}</span>
                </div>
                <div className={`border-t ${c.border} pt-2 mt-2 flex items-center justify-between`}>
                  <span className={`text-[12px] ${c.textPrimary}`}>合計</span>
                  <span className={`text-[13px] ${c.textPrimary} tabular-nums`}>{formatYen(selected.cost.fullTime + selected.cost.partner + selected.cost.dispatch + selected.cost.overhead)}</span>
                </div>
              </div>
            </div>

            {/* Efficiency metrics */}
            <div className={`${c.bgSurface} rounded-xl p-4`}>
              <h4 className={`text-[12px] ${c.textMuted} mb-3`}>効率指標</h4>
              <div className="space-y-3">
                <div className="text-center">
                  <div className={`text-[22px] ${c.textPrimary} tabular-nums`}>¥{selected.costPerUnit}</div>
                  <div className={`text-[11px] ${c.textMuted}`}>個あたり原価</div>
                </div>
                <div className="text-center">
                  <div className={`text-[22px] tabular-nums ${selected.budgetVariance > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {selected.budgetVariance > 0 ? "+" : ""}{selected.budgetVariance}%
                  </div>
                  <div className={`text-[11px] ${c.textMuted}`}>予算比</div>
                </div>
                <div className="text-center">
                  <div className={`text-[22px] ${c.textPrimary} tabular-nums`}>{selected.volume.toLocaleString()}</div>
                  <div className={`text-[11px] ${c.textMuted}`}>処理量</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
