import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import { useThemeColors } from "./ThemeContext";

const companies = [
  { id: "D001", name: "サンワスタッフ", planned: 45, actual: 43, avgUph: 138, rating: 4.2, cost: "¥1,250/h", trend: "up", color: "#22d3ee" },
  { id: "D002", name: "ロジテック人材", planned: 38, actual: 35, avgUph: 125, rating: 3.8, cost: "¥1,180/h", trend: "down", color: "#a78bfa" },
  { id: "D003", name: "フルキャスト", planned: 52, actual: 52, avgUph: 145, rating: 4.5, cost: "¥1,350/h", trend: "up", color: "#34d399" },
  { id: "D004", name: "テンプスタッフ", planned: 30, actual: 28, avgUph: 132, rating: 4.0, cost: "¥1,300/h", trend: "stable", color: "#fb923c" },
];

const weeklyData = [
  { day: "月", サンワ: 42, ロジテック: 35, フルキャスト: 50, テンプ: 30 },
  { day: "火", サンワ: 43, ロジテック: 36, フルキャスト: 52, テンプ: 28 },
  { day: "水", サンワ: 43, ロジテック: 35, フルキャスト: 52, テンプ: 28 },
  { day: "木", サンワ: 45, ロジテック: 38, フルキャスト: 52, テンプ: 30 },
  { day: "金", サンワ: 44, ロジテック: 37, フルキャスト: 51, テンプ: 29 },
];

const performanceData = [
  { skill: "出勤率", サンワ: 95, ロジテック: 92, フルキャスト: 100, テンプ: 93 },
  { skill: "UPH", サンワ: 85, ロジテック: 78, フルキャスト: 90, テンプ: 82 },
  { skill: "品質", サンワ: 88, ロジテック: 82, フルキャスト: 92, テンプ: 85 },
  { skill: "定着率", サンワ: 80, ロジテック: 70, フルキャスト: 88, テンプ: 75 },
  { skill: "柔軟性", サンワ: 90, ロジテック: 85, フルキャスト: 82, テンプ: 88 },
];



export function DispatchManagement() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const c = useThemeColors();

  const gridStroke = c.isDark ? "#1e1e2e" : "#e5e7eb";
  const axisStroke = c.isDark ? "#4a4a5e" : "#9ca3af";
  const tickFill = c.isDark ? "#6b6b7e" : "#6b7280";
  const tooltipBg = c.isDark ? "#1a1a2e" : "#ffffff";
  const tooltipBorder = c.isDark ? "#2a2a3e" : "#e5e7eb";
  const tooltipColor = c.isDark ? "#e0e0e0" : "#1f2937";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={c.textPrimary}>派遣会社・稼働率管理</h1>
          <p className={`${c.textSecondary} text-[14px] mt-1`}>派遣会社別の人員管理と生産性分析</p>
        </div>
      </div>

      {/* Company Cards */}
      <div className="grid grid-cols-4 gap-4">
        {companies.map((company) => (
          <div key={company.id} onClick={() => setSelectedCompany(company.id)}
            className={`rounded-xl border p-5 cursor-pointer transition-all hover:scale-[1.01] ${
              selectedCompany === company.id ? "border-cyan-500/40 bg-cyan-500/5" : `${c.border} ${c.bgCard}`
            }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: company.color }} />
                <span className={`${c.textPrimary} text-[14px]`}>{company.name}</span>
              </div>
              <button className={c.textDimmed}><MoreHorizontal className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={`text-[11px] ${c.textMuted}`}>予定 / 実績</div>
                <div className={`${c.textPrimary} text-[18px]`}>{company.actual}<span className={`${c.textMuted} text-[13px]`}>/{company.planned}</span></div>
              </div>
              <div>
                <div className={`text-[11px] ${c.textMuted}`}>平均UPH</div>
                <div className="flex items-center gap-1">
                  <span className="text-cyan-400 text-[18px]">{company.avgUph}</span>
                  {company.trend === "up" ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : company.trend === "down" ? <TrendingDown className="w-3.5 h-3.5 text-red-400" /> : null}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className={`text-[12px] ${c.textMuted}`}>{company.cost}</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <div key={star} className={`w-1.5 h-1.5 rounded-full ${star <= Math.floor(company.rating) ? "bg-amber-400" : c.isDark ? "bg-gray-700" : "bg-gray-300"}`} />
                ))}
                <span className={`text-[11px] ${c.textMuted} ml-1`}>{company.rating}</span>
              </div>
            </div>
            <div className="mt-3">
              <div className={`w-full h-1.5 rounded-full ${c.bgSurface} overflow-hidden`}>
                <div className="h-full rounded-full" style={{ width: `${(company.actual / company.planned) * 100}%`, backgroundColor: company.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <h3 className={`${c.textPrimary} mb-4`}>週間出勤実績</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="day" stroke={axisStroke} tick={{ fontSize: 12, fill: tickFill }} />
              <YAxis stroke={axisStroke} tick={{ fontSize: 12, fill: tickFill }} />
              <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "8px", color: tooltipColor, fontSize: "13px" }} />
              <Bar dataKey="サンワ" fill="#22d3ee" radius={[2, 2, 0, 0]} />
              <Bar dataKey="ロジテック" fill="#a78bfa" radius={[2, 2, 0, 0]} />
              <Bar dataKey="フルキャスト" fill="#34d399" radius={[2, 2, 0, 0]} />
              <Bar dataKey="テンプ" fill="#fb923c" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`${c.bgCard} rounded-xl border ${c.border} p-5`}>
          <h3 className={`${c.textPrimary} mb-4`}>パフォーマンス比較</h3>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={performanceData}>
              <PolarGrid stroke={gridStroke} />
              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 11, fill: tickFill }} />
              <PolarRadiusAxis angle={90} tick={{ fontSize: 10, fill: axisStroke }} domain={[0, 100]} />
              <Radar name="サンワ" dataKey="サンワ" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} />
              <Radar name="フルキャスト" dataKey="フルキャスト" stroke="#34d399" fill="#34d399" fillOpacity={0.15} />
              <Legend wrapperStyle={{ fontSize: "12px", color: tickFill }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
