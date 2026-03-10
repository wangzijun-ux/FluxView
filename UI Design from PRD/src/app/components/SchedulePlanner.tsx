import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Zap,
  Users,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Clock,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import {
  defaultAreas,
  defaultProcessSteps,
  INITIAL_WORKERS,
  type Worker,
  type Area,
  type ProcessStep
} from "./processStore";


// Helper to parse "HH:MM" to float hour
const parseTime = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h + m / 60;
};

const processHourlyNeeds = [
  { process: "入荷", needed: 24, assigned: 24, status: "ok" },
  { process: "検品", needed: 40, assigned: 38, status: "short" },
  { process: "格納", needed: 55, assigned: 48, status: "critical" },
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
            className={`rounded-lg border p-3 ${p.status === "critical" ? "border-red-500/30 bg-red-500/5"
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

      {/* Gantt Chart with Area Grouping */}
      <div className={`flex-1 ${c.bgCard} rounded-xl border ${c.border} overflow-auto min-h-0`}>
        <div className="min-w-[1000px]">
          <div className={`flex border-b ${c.border} sticky top-0 ${c.bgCard} z-20`}>
            <div className={`w-[200px] shrink-0 px-4 py-3 text-[12px] ${c.textMuted} border-r ${c.border}`}>エリア / 作業員</div>
            <div className="flex-1 flex">
              {Array.from({ length: 15 }, (_, i) => i + 6).map((hour) => (
                <div key={hour} className={`flex-1 text-center text-[12px] ${c.textMuted} py-3 border-r ${c.border}`}>{hour}:00</div>
              ))}
            </div>
          </div>

          {defaultAreas.map((area) => {
            const areaProcesses = defaultProcessSteps.filter(p => area.processStepIds.includes(p.id));
            const areaWorkers = INITIAL_WORKERS.filter(w => {
              // Simplified mock: assign workers based on their primary skills or some logic
              if (area.id === "area-1") return ["w1", "w2", "w3"].includes(w.id);
              if (area.id === "area-2") return ["w9", "w10"].includes(w.id);
              if (area.id === "area-3") return ["w4", "w5", "w6", "w7"].includes(w.id);
              return false;
            });

            return (
              <div key={area.id} className="contents">
                {/* Area Header */}
                <div className={`flex border-b ${c.border} bg-cyan-500/5 group`}>
                  <div className={`w-[200px] shrink-0 px-4 py-2 text-[11px] font-bold text-cyan-400 flex items-center gap-2 border-r ${c.border}`}>
                    <MapPin className="w-3.5 h-3.5" />
                    {area.name}
                  </div>
                  <div className="flex-1 px-4 py-2 flex items-center gap-6">
                    {areaProcesses.map(p => (
                      <div key={p.id} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full bg-${p.color}-500`} />
                        <span className={`text-[11px] ${c.textSecondary}`}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rows for workers in this area */}
                {areaWorkers.map((worker) => {
                  const shiftS = worker.shiftStart ? parseTime(worker.shiftStart) : 8;
                  const shiftE = worker.shiftEnd ? parseTime(worker.shiftEnd) : 17;
                  const startTimelineHour = 6;
                  const totalTimelineHours = 15;

                  return (
                    <div key={worker.id} className={`flex border-b ${c.border} ${c.bgCardHover}`}>
                      <div className={`w-[200px] shrink-0 px-4 py-3 text-[13px] ${c.textSecondary} border-r ${c.border} flex items-center gap-2`}>
                        <div className={`w-6 h-6 rounded-full ${worker.color} flex items-center justify-center text-[9px] text-white`}>{worker.initials}</div>
                        {worker.name}
                      </div>
                      <div className="flex-1 relative h-[48px] bg-gray-500/5">
                        {/* Attendance Background (Planned Shift) */}
                        <div
                          className="absolute h-full bg-cyan-500/10 border-x border-cyan-500/20"
                          style={{
                            left: `${((shiftS - startTimelineHour) / totalTimelineHours) * 100}%`,
                            width: `${((shiftE - shiftS) / totalTimelineHours) * 100}%`
                          }}
                        >
                          <div className="absolute -top-3 left-0 text-[9px] text-cyan-500 opacity-60 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />{worker.shiftStart}
                          </div>
                          <div className="absolute -top-3 right-0 text-[9px] text-cyan-500 opacity-60">{worker.shiftEnd}</div>
                        </div>

                        {/* Actual Work Blocks (Mocked) */}
                        <div
                          className={`absolute top-2.5 h-[28px] rounded-md border flex items-center justify-center text-[10px] bg-cyan-500/30 border-cyan-500/50 text-cyan-200 cursor-pointer hover:opacity-90 transition-all`}
                          style={{
                            left: `${((shiftS + 0.5 - startTimelineHour) / totalTimelineHours) * 100}%`,
                            width: `${((4) / totalTimelineHours) * 100}%`
                          }}
                        >
                          {areaProcesses[0]?.name || "作業中"}
                        </div>

                        {/* Grid lines */}
                        {Array.from({ length: 15 }).map((_, i) => (
                          <div key={i} className={`absolute top-0 h-full border-r ${c.border} opacity-20`} style={{ left: `${((i + 1) / 15) * 100}%` }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
