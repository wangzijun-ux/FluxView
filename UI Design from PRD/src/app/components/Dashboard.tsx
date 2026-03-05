import { useState } from "react";
import {
  Users,
  Package,
  TrendingUp,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useThemeColors } from "./ThemeContext";

const kpiData = [
  { label: "稼働中作業員", value: "247", total: "/312", change: "+12", trend: "up", icon: Users, color: "cyan" },
  { label: "本日出荷進捗", value: "68%", total: "4,280件", change: "+5.2%", trend: "up", icon: Package, color: "emerald" },
  { label: "平均UPH", value: "142", total: "目標: 135", change: "+7", trend: "up", icon: TrendingUp, color: "violet" },
  { label: "遅延アラート", value: "3", total: "件", change: "+1", trend: "down", icon: AlertTriangle, color: "red" },
];

const hourlyData = [
  { time: "06:00", actual: 0, target: 0 },
  { time: "07:00", actual: 120, target: 150 },
  { time: "08:00", actual: 340, target: 300 },
  { time: "09:00", actual: 580, target: 450 },
  { time: "10:00", actual: 820, target: 600 },
  { time: "11:00", actual: 1050, target: 750 },
  { time: "12:00", actual: 1100, target: 900 },
  { time: "13:00", actual: 1380, target: 1050 },
  { time: "14:00", actual: 1620, target: 1200 },
  { time: "15:00", actual: 1900, target: 1350 },
  { time: "16:00", actual: 2180, target: 1500 },
  { time: "17:00", actual: 2500, target: 1650 },
  { time: "18:00", actual: 2900, target: 1800 },
];

const processData = [
  { name: "入荷", progress: 92, workers: 24, status: "normal" },
  { name: "検品", progress: 78, workers: 38, status: "normal" },
  { name: "仕分け", progress: 45, workers: 56, status: "warning" },
  { name: "流通加工", progress: 62, workers: 42, status: "normal" },
  { name: "梱包", progress: 34, workers: 48, status: "alert" },
  { name: "出荷", progress: 55, workers: 39, status: "normal" },
];

const zoneData = [
  { id: "A", name: "A棟 - 入荷エリア", workers: 24, capacity: 30, uph: 156, status: "green" },
  { id: "B", name: "B棟 - 検品ライン", workers: 38, capacity: 40, uph: 142, status: "green" },
  { id: "C", name: "C棟 - 仕分けエリア", workers: 56, capacity: 60, uph: 98, status: "yellow" },
  { id: "D", name: "D棟 - 流通加工", workers: 42, capacity: 50, uph: 134, status: "green" },
  { id: "E", name: "E棟 - 梱包ライン", workers: 48, capacity: 55, uph: 78, status: "red" },
  { id: "F", name: "F棟 - 出荷バース", workers: 39, capacity: 45, uph: 165, status: "green" },
];

const alerts = [
  { time: "14:32", message: "E棟 梱包ラインのUPHが目標値を20%下回っています", level: "error" },
  { time: "14:15", message: "C棟 仕分けエリアでスキル不足の配置が検出されました", level: "warning" },
  { time: "13:58", message: "派遣会社Bの出勤者数が予定より3名不足", level: "warning" },
  { time: "13:40", message: "WMS連携: 追加出荷オーダー 320件を受信", level: "info" },
  { time: "13:22", message: "TMS連携: 17:00便の必要車数を12台に更新", level: "info" },
];

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

export function Dashboard() {
  const [selectedDate] = useState("2026-03-04");
  const c = useThemeColors();

  const gridStroke = c.isDark ? "#1e1e2e" : "#e5e7eb";
  const axisStroke = c.isDark ? "#4a4a5e" : "#9ca3af";
  const tickFill = c.isDark ? "#6b6b7e" : "#6b7280";
  const tooltipBg = c.isDark ? "#1a1a2e" : "#ffffff";
  const tooltipBorder = c.isDark ? "#2a2a3e" : "#e5e7eb";
  const tooltipColor = c.isDark ? "#e0e0e0" : "#1f2937";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={c.textPrimary}>Live Command Center</h1>
          <p className={`${c.textSecondary} text-[14px] mt-1`}>
            リアルタイム物流オペレーション監視 — 東京第一物流センター
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${c.bgSurface} border ${c.borderCard}`}>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[13px]">LIVE</span>
          </div>
          <div className={`px-3 py-1.5 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[13px]`}>
            {selectedDate}
          </div>
          <div className={`px-3 py-1.5 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[13px] flex items-center gap-2`}>
            <Clock className="w-3.5 h-3.5" />
            14:35
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpiData.map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-xl border bg-gradient-to-br ${colorMap[kpi.color]} p-4`}
          >
            <div className="flex items-center justify-between mb-3">
              <kpi.icon className={`w-5 h-5 ${iconColorMap[kpi.color]}`} />
              <div
                className={`flex items-center gap-1 text-[12px] ${
                  kpi.trend === "up" && kpi.color !== "red"
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {kpi.trend === "up" && kpi.color !== "red" ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {kpi.change}
              </div>
            </div>
            <div className={`text-[28px] ${c.textPrimary} tracking-tight`}>
              {kpi.value}
              <span className={`text-[14px] ${c.textSecondary} ml-1`}>{kpi.total}</span>
            </div>
            <div className={`text-[13px] ${c.textSecondary} mt-1`}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Hourly Progress Chart */}
        <div className={`col-span-2 ${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={c.textPrimary}>出荷進捗推移</h3>
              <p className={`${c.textMuted} text-[13px]`}>実績 vs 計画</p>
            </div>
            <div className="flex items-center gap-4 text-[12px]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-1 rounded-full bg-cyan-400" />
                <span className={c.textSecondary}>実績</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-1 rounded-full ${c.isDark ? "bg-gray-500" : "bg-gray-300"}`} />
                <span className={c.textSecondary}>計画</span>
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

        {/* Process Progress */}
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={c.textPrimary}>工程別進捗</h3>
            <button className={`${c.textMuted} hover:${c.textSecondary}`}>
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4">
            {processData.map((process) => (
              <div key={process.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[13px] ${c.textSecondary}`}>{process.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[12px] ${c.textMuted}`}>{process.workers}名</span>
                    <span
                      className={`text-[13px] ${
                        process.status === "alert"
                          ? "text-red-400"
                          : process.status === "warning"
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {process.progress}%
                    </span>
                  </div>
                </div>
                <div className={`w-full h-2 rounded-full ${c.bgSurface} overflow-hidden`}>
                  <div
                    className={`h-full rounded-full transition-all ${
                      process.status === "alert"
                        ? "bg-red-500"
                        : process.status === "warning"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${process.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zone Map & Alerts */}
      <div className="grid grid-cols-3 gap-4">
        {/* Zone Map */}
        <div className={`col-span-2 ${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={c.textPrimary}>ゾーン別配置マップ</h3>
              <p className={`${c.textMuted} text-[13px]`}>リアルタイム人員配置状況</p>
            </div>
            <div className="flex items-center gap-3 text-[12px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className={c.textSecondary}>適正</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className={c.textSecondary}>注意</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className={c.textSecondary}>警告</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {zoneData.map((zone) => (
              <div
                key={zone.id}
                className={`rounded-lg border p-4 cursor-pointer transition-all hover:scale-[1.02] ${
                  zone.status === "red"
                    ? "border-red-500/40 bg-red-500/5"
                    : zone.status === "yellow"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : `${c.borderCard} ${c.bgSurface}`
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`${c.textPrimary} text-[14px]`}>{zone.name}</span>
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      zone.status === "red"
                        ? "bg-red-400 animate-pulse"
                        : zone.status === "yellow"
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                    }`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <div className={`text-[11px] ${c.textMuted}`}>配置人数</div>
                    <div className={`text-[16px] ${c.textPrimary}`}>
                      {zone.workers}
                      <span className={`text-[12px] ${c.textMuted}`}>/{zone.capacity}</span>
                    </div>
                  </div>
                  <div>
                    <div className={`text-[11px] ${c.textMuted}`}>UPH</div>
                    <div className={`text-[16px] ${zone.uph < 100 ? "text-red-400" : "text-cyan-400"}`}>
                      {zone.uph}
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className={`w-full h-1.5 rounded-full ${c.bg} overflow-hidden`}>
                    <div
                      className={`h-full rounded-full ${
                        zone.status === "red"
                          ? "bg-red-500"
                          : zone.status === "yellow"
                          ? "bg-amber-500"
                          : "bg-cyan-500"
                      }`}
                      style={{ width: `${(zone.workers / zone.capacity) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className={c.textPrimary}>アラート</h3>
              <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[11px]">3件</span>
            </div>
            <button className={c.textMuted}>
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`rounded-lg p-3 border ${
                  alert.level === "error"
                    ? "border-red-500/30 bg-red-500/5"
                    : alert.level === "warning"
                    ? "border-amber-500/30 bg-amber-500/5"
                    : `${c.borderCard} ${c.bgSurface}`
                }`}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      alert.level === "error"
                        ? "bg-red-400"
                        : alert.level === "warning"
                        ? "bg-amber-400"
                        : "bg-cyan-400"
                    }`}
                  />
                  <div>
                    <p className={`text-[13px] ${c.textSecondary}`}>{alert.message}</p>
                    <p className={`text-[11px] ${c.textMuted} mt-1`}>{alert.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* External Integration Status */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { name: "WMS連携", status: "connected", lastSync: "14:35:02", direction: "In" },
          { name: "TMS連携", status: "connected", lastSync: "14:30:00", direction: "Out" },
          { name: "勤怠連携", status: "connected", lastSync: "14:35:01", direction: "In" },
          { name: "会計連携", status: "scheduled", lastSync: "06:00:00", direction: "Out" },
        ].map((integration) => (
          <div
            key={integration.name}
            className={`${c.bgCard} rounded-xl border ${c.border} p-4 flex items-center gap-3`}
          >
            <div className={`w-2 h-2 rounded-full ${integration.status === "connected" ? "bg-emerald-400" : "bg-gray-500"}`} />
            <div className="flex-1">
              <div className={`text-[13px] ${c.textPrimary}`}>{integration.name}</div>
              <div className={`text-[11px] ${c.textMuted}`}>最終同期: {integration.lastSync}</div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded ${c.bgSurface} ${c.textSecondary}`}>
              {integration.direction}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
