import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Zap,
  Users,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";

interface ShiftBlock {
  id: string;
  worker: string;
  process: string;
  startHour: number;
  endHour: number;
  color: string;
  isAI?: boolean;
}

const hours = Array.from({ length: 14 }, (_, i) => i + 6);

const shifts: ShiftBlock[] = [
  { id: "s1", worker: "田中 太郎", process: "入荷", startHour: 6, endHour: 12, color: "cyan" },
  { id: "s2", worker: "田中 太郎", process: "検品", startHour: 13, endHour: 18, color: "emerald" },
  { id: "s3", worker: "佐藤 花子", process: "検品", startHour: 7, endHour: 12, color: "emerald" },
  { id: "s4", worker: "佐藤 花子", process: "梱包", startHour: 13, endHour: 17, color: "blue" },
  { id: "s5", worker: "鈴木 一郎", process: "仕分け", startHour: 8, endHour: 15, color: "violet" },
  { id: "s6", worker: "鈴木 一郎", process: "出荷", startHour: 15, endHour: 19, color: "rose" },
  { id: "s7", worker: "高橋 美咲", process: "流通加工", startHour: 6, endHour: 14, color: "amber" },
  { id: "s8", worker: "伊藤 健太", process: "出荷", startHour: 9, endHour: 18, color: "rose" },
  { id: "s9", worker: "渡辺 真由", process: "梱包", startHour: 7, endHour: 16, color: "blue" },
  { id: "s10", worker: "山田 裕子", process: "検品", startHour: 10, endHour: 18, color: "emerald", isAI: true },
  { id: "s11", worker: "中村 翔太", process: "仕分け", startHour: 6, endHour: 14, color: "violet" },
  { id: "s12", worker: "小林 さくら", process: "流通加工", startHour: 8, endHour: 17, color: "amber", isAI: true },
];

const workerNames = [...new Set(shifts.map((s) => s.worker))];

const shiftColorMap: Record<string, string> = {
  cyan: "bg-cyan-500/30 border-cyan-500/50 text-cyan-300",
  emerald: "bg-emerald-500/30 border-emerald-500/50 text-emerald-300",
  violet: "bg-violet-500/30 border-violet-500/50 text-violet-300",
  amber: "bg-amber-500/30 border-amber-500/50 text-amber-300",
  blue: "bg-blue-500/30 border-blue-500/50 text-blue-300",
  rose: "bg-rose-500/30 border-rose-500/50 text-rose-300",
};

const shiftColorMapLight: Record<string, string> = {
  cyan: "bg-cyan-100 border-cyan-400 text-cyan-700",
  emerald: "bg-emerald-100 border-emerald-400 text-emerald-700",
  violet: "bg-violet-100 border-violet-400 text-violet-700",
  amber: "bg-amber-100 border-amber-400 text-amber-700",
  blue: "bg-blue-100 border-blue-400 text-blue-700",
  rose: "bg-rose-100 border-rose-400 text-rose-700",
};

const processHourlyNeeds = [
  { process: "入荷", needed: 24, assigned: 24, status: "ok" },
  { process: "検品", needed: 40, assigned: 38, status: "short" },
  { process: "仕分け", needed: 60, assigned: 56, status: "short" },
  { process: "流通加工", needed: 45, assigned: 42, status: "short" },
  { process: "梱包", needed: 55, assigned: 48, status: "critical" },
  { process: "出荷", needed: 40, assigned: 39, status: "ok" },
];

export function SchedulePlanner() {
  const [currentDate] = useState("2026年3月4日（水）");
  const c = useThemeColors();

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={c.textPrimary}>ワークスケジュール・プランナー</h1>
          <p className={`${c.textSecondary} text-[14px] mt-1`}>AI推奨シフトとリアルタイム人員調整</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-[13px] hover:bg-violet-600/30 transition-all">
            <Zap className="w-4 h-4" />AI推奨シフト生成
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500 transition-all">
            <Plus className="w-4 h-4" />シフト追加
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button className={`p-2 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} hover:${c.textPrimary}`}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className={`${c.textPrimary} text-[14px]`}>{currentDate}</span>
          <button className={`p-2 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} hover:${c.textPrimary}`}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className={`flex items-center gap-4 text-[12px]`}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-violet-500/30 border border-violet-500/50" />
            <span className={c.textSecondary}>AI推奨</span>
          </div>
          <div className={`flex items-center gap-2 ${c.textSecondary}`}>
            <Users className="w-3.5 h-3.5" />出勤予定: 247名
          </div>
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />欠勤: 3名
          </div>
        </div>
      </div>

      {/* Resource Summary */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        {processHourlyNeeds.map((p) => (
          <div key={p.process}
            className={`rounded-lg border p-3 ${
              p.status === "critical" ? "border-red-500/30 bg-red-500/5"
                : p.status === "short" ? "border-amber-500/30 bg-amber-500/5"
                : `${c.borderCard} ${c.bgCard}`
            }`}>
            <div className={`text-[12px] ${c.textMuted} mb-1`}>{p.process}</div>
            <div className="flex items-center justify-between">
              <span className={`${c.textPrimary} text-[16px]`}>
                {p.assigned}<span className={`${c.textMuted} text-[12px]`}>/{p.needed}</span>
              </span>
              {p.status === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : p.status === "critical" ? <AlertTriangle className="w-4 h-4 text-red-400" />
                : <AlertTriangle className="w-4 h-4 text-amber-400" />}
            </div>
          </div>
        ))}
      </div>

      {/* Gantt Chart */}
      <div className={`flex-1 ${c.bgCard} rounded-xl border ${c.border} overflow-auto min-h-0`}>
        <div className="min-w-[900px]">
          <div className={`flex border-b ${c.border} sticky top-0 ${c.bgCard} z-10`}>
            <div className={`w-[140px] shrink-0 px-4 py-3 text-[12px] ${c.textMuted} border-r ${c.border}`}>作業員</div>
            <div className="flex-1 flex">
              {hours.map((hour) => (
                <div key={hour} className={`flex-1 text-center text-[12px] ${c.textMuted} py-3 border-r ${c.border}`}>{hour}:00</div>
              ))}
            </div>
          </div>

          {workerNames.map((worker) => {
            const workerShifts = shifts.filter((s) => s.worker === worker);
            return (
              <div key={worker} className={`flex border-b ${c.border} ${c.bgCardHover}`}>
                <div className={`w-[140px] shrink-0 px-4 py-3 text-[13px] ${c.textSecondary} border-r ${c.border} flex items-center`}>{worker}</div>
                <div className="flex-1 relative h-[48px]">
                  {workerShifts.map((shift) => {
                    const totalHours = hours.length;
                    const leftPercent = ((shift.startHour - hours[0]) / totalHours) * 100;
                    const widthPercent = ((shift.endHour - shift.startHour) / totalHours) * 100;
                    const colorMap = c.isDark ? shiftColorMap : shiftColorMapLight;
                    return (
                      <div key={shift.id}
                        className={`absolute top-2 h-[32px] rounded-md border flex items-center justify-center text-[11px] cursor-pointer hover:opacity-90 transition-all ${colorMap[shift.color]} ${shift.isAI ? "border-dashed" : ""}`}
                        style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}>
                        {shift.isAI && <Zap className="w-3 h-3 mr-1 text-violet-400" />}
                        {shift.process}
                      </div>
                    );
                  })}
                  {hours.map((_, i) => (
                    <div key={i} className={`absolute top-0 h-full border-r ${c.border}`} style={{ left: `${((i + 1) / hours.length) * 100}%` }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
