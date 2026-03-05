import { useState, useMemo } from "react";
import {
  TrendingUp,
  MapPin,
  ArrowRight,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Zap,
  BarChart3,
  Filter,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Target,
  Timer,
  Package,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import {
  defaultProcessSteps,
  defaultProductionData,
  defaultSlotAssignments,
  defaultAreas,
  processColorClasses,
  getProcessStepsForArea,
  type ProcessStep,
  type ZoneProduction,
  type Area,
} from "./processStore";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ZoneSlot { workerId: string | null; }

interface Zone {
  processId: string;
  areaId: string;
  name: string;
  description: string;
  color: string;
  icon: ProcessStep["icon"];
  capacity: number;
  baseUph: number;
  requiredSkills: string[];
  slots: ZoneSlot[];
  production: ZoneProduction;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseTime(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
function formatTime(mins: number): string {
  const h = Math.floor(mins / 60); const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const NOW_MINUTES = 10 * 60 + 15;

function buildZones(): Zone[] {
  const zones: Zone[] = [];
  for (const area of defaultAreas) {
    const areaSteps = getProcessStepsForArea(area);
    for (const step of areaSteps) {
      const prod = defaultProductionData[step.id] ?? { planned: 0, actual: 0, currentUph: step.baseUph, startTime: "06:00", targetEndTime: "18:00" };
      const slotAssign = defaultSlotAssignments[step.id] ?? Array(step.defaultCapacity).fill(null);
      zones.push({
        processId: step.id, areaId: area.id, name: step.name, description: step.zoneDescription,
        color: step.color, icon: step.icon, capacity: step.defaultCapacity,
        baseUph: step.baseUph, requiredSkills: step.requiredSkills,
        slots: slotAssign.map((wId: string | null) => ({ workerId: wId })),
        production: { ...prod },
      });
    }
  }
  return zones;
}

function calcZoneMetrics(zone: Zone, nowMin: number = NOW_MINUTES) {
  const { production: p } = zone;
  const filled = zone.slots.filter((s) => s.workerId).length;
  const remaining = Math.max(0, p.planned - p.actual);
  const progress = p.planned > 0 ? Math.round((p.actual / p.planned) * 100) : 0;
  let estimatedEnd = "--:--";
  let isOverdue = false;
  if (filled > 0 && p.currentUph > 0 && remaining > 0) {
    const totalUph = p.currentUph * filled;
    const minutesToComplete = Math.ceil((remaining / totalUph) * 60);
    const endMinutes = nowMin + minutesToComplete;
    estimatedEnd = formatTime(Math.min(endMinutes, 23 * 60 + 59));
    isOverdue = endMinutes > parseTime(p.targetEndTime);
  } else if (remaining === 0) { estimatedEnd = "完了"; }
  const targetEnd = parseTime(p.targetEndTime);
  const availableHours = Math.max(0.25, (targetEnd - nowMin) / 60);
  let recommendedWorkers = 0;
  if (remaining > 0 && p.currentUph > 0) { recommendedWorkers = Math.ceil(remaining / (p.currentUph * availableHours)); }
  return { remaining, progress, estimatedEnd, isOverdue, recommendedWorkers, filled, totalUph: filled > 0 ? p.currentUph * filled : 0 };
}

type SortKey = "area" | "name" | "progress" | "remaining" | "uph" | "workers" | "status";
type StatusFilter = "all" | "running" | "delayed" | "idle" | "done";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProcessSummary() {
  const c = useThemeColors();
  const areas = defaultAreas;
  const allZones = useMemo(() => buildZones(), []);

  const [selectedAreaId, setSelectedAreaId] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("area");
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedAreaIds, setExpandedAreaIds] = useState<Set<string>>(new Set(areas.map((a) => a.id)));

  const zones = useMemo(() => {
    if (selectedAreaId === "all") return allZones;
    return allZones.filter((z) => z.areaId === selectedAreaId);
  }, [allZones, selectedAreaId]);

  // Compute metrics for all zones
  const zoneMetrics = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calcZoneMetrics>>();
    zones.forEach((z) => map.set(z.processId, calcZoneMetrics(z)));
    return map;
  }, [zones]);

  // Status for a zone
  const getStatus = (zone: Zone, m: ReturnType<typeof calcZoneMetrics>): StatusFilter => {
    if (m.filled === 0 && zone.production.planned > 0) return "idle";
    if (m.estimatedEnd === "完了") return "done";
    if (m.isOverdue) return "delayed";
    return "running";
  };

  // Area summary stats
  const areaSummary = useMemo(() => {
    const map: Record<string, { workers: number; capacity: number; planned: number; actual: number; progress: number; delayed: number; idle: number; done: number; running: number }> = {};
    for (const area of areas) {
      const areaZones = allZones.filter((z) => z.areaId === area.id);
      let workers = 0, capacity = 0, planned = 0, actual = 0, totalProgress = 0;
      let delayed = 0, idle = 0, done = 0, running = 0;
      for (const z of areaZones) {
        const m = calcZoneMetrics(z);
        const filled = z.slots.filter((s) => s.workerId).length;
        workers += filled;
        capacity += z.capacity;
        planned += z.production.planned;
        actual += z.production.actual;
        totalProgress += m.progress;
        const s = getStatus(z, m);
        if (s === "delayed") delayed++;
        else if (s === "idle") idle++;
        else if (s === "done") done++;
        else running++;
      }
      map[area.id] = {
        workers, capacity, planned, actual,
        progress: areaZones.length > 0 ? Math.round(totalProgress / areaZones.length) : 0,
        delayed, idle, done, running,
      };
    }
    return map;
  }, [allZones, areas]);

  // Filter & sort
  const sortedZones = useMemo(() => {
    let filtered = zones;
    if (statusFilter !== "all") {
      filtered = filtered.filter((z) => {
        const m = zoneMetrics.get(z.processId)!;
        return getStatus(z, m) === statusFilter;
      });
    }
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const ma = zoneMetrics.get(a.processId)!;
      const mb = zoneMetrics.get(b.processId)!;
      let cmp = 0;
      switch (sortKey) {
        case "area": cmp = a.areaId.localeCompare(b.areaId); break;
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "progress": cmp = ma.progress - mb.progress; break;
        case "remaining": cmp = ma.remaining - mb.remaining; break;
        case "uph": cmp = ma.totalUph - mb.totalUph; break;
        case "workers": cmp = ma.filled - mb.filled; break;
        case "status": {
          const order = { idle: 0, delayed: 1, running: 2, done: 3, all: 4 };
          cmp = order[getStatus(a, ma)] - order[getStatus(b, mb)];
          break;
        }
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [zones, zoneMetrics, sortKey, sortAsc, statusFilter]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const toggleAreaExpand = (aId: string) => {
    setExpandedAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(aId)) next.delete(aId); else next.add(aId);
      return next;
    });
  };

  // Global totals
  const globalTotals = useMemo(() => {
    let workers = 0, capacity = 0, planned = 0, actual = 0, delayed = 0, idle = 0;
    allZones.forEach((z) => {
      const m = calcZoneMetrics(z);
      const filled = z.slots.filter((s) => s.workerId).length;
      workers += filled; capacity += z.capacity;
      planned += z.production.planned; actual += z.production.actual;
      const s = getStatus(z, m);
      if (s === "delayed") delayed++;
      if (s === "idle") idle++;
    });
    return { workers, capacity, planned, actual, progress: planned > 0 ? Math.round((actual / planned) * 100) : 0, delayed, idle };
  }, [allZones]);

  const SortHeader = ({ label, sortKeyVal, className = "" }: { label: string; sortKeyVal: SortKey; className?: string }) => (
    <th
      className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left cursor-pointer select-none hover:${c.textSecondary} transition-colors ${className}`}
      onClick={() => handleSort(sortKeyVal)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortKey === sortKeyVal && (
          sortAsc ? <ChevronUp className="w-3 h-3 text-cyan-400" /> : <ChevronDown className="w-3 h-3 text-cyan-400" />
        )}
        {sortKey !== sortKeyVal && <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
      </div>
    </th>
  );

  const statusConfig = {
    running: { label: "稼働中", color: "bg-cyan-500/15 text-cyan-400", icon: Zap },
    delayed: { label: "遅延", color: "bg-amber-500/15 text-amber-400", icon: AlertTriangle },
    idle:    { label: "未稼働", color: "bg-red-500/15 text-red-400", icon: Clock },
    done:    { label: "完了", color: "bg-emerald-500/15 text-emerald-400", icon: CheckCircle2 },
  };

  return (
    <div className={`h-full flex flex-col ${c.bgMain} overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b ${c.border} ${c.bgCard}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`${c.textPrimary} text-[17px]`}>工程別サマリー</h1>
            <p className={`${c.textMuted} text-[12px]`}>全エリア・工程のリアルタイム進捗と配置状況</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${c.bgSurface} border ${c.border}`}>
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className={`text-[12px] ${c.textPrimary} tabular-nums`}>{formatTime(NOW_MINUTES)}</span>
          </div>
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className={`px-6 py-4 border-b ${c.border} ${c.bgCard}`}>
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: "総工程数", value: allZones.length, suffix: "工程", icon: Package, color: "text-cyan-400" },
            { label: "配置人数", value: `${globalTotals.workers}/${globalTotals.capacity}`, suffix: "名", icon: Users, color: "text-blue-400" },
            { label: "予定数量", value: globalTotals.planned.toLocaleString(), suffix: "", icon: Target, color: "text-violet-400" },
            { label: "実績数量", value: globalTotals.actual.toLocaleString(), suffix: "", icon: TrendingUp, color: "text-emerald-400" },
            { label: "遅延工程", value: globalTotals.delayed, suffix: "件", icon: AlertTriangle, color: globalTotals.delayed > 0 ? "text-amber-400" : "text-emerald-400" },
            { label: "未稼働", value: globalTotals.idle, suffix: "件", icon: Clock, color: globalTotals.idle > 0 ? "text-red-400" : "text-emerald-400" },
          ].map((kpi) => (
            <div key={kpi.label} className={`${c.bgSurface} rounded-xl border ${c.border} px-4 py-3`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[11px] ${c.textMuted}`}>{kpi.label}</span>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <div className={`text-[18px] ${c.textPrimary} tabular-nums`}>
                {kpi.value}<span className={`text-[11px] ${c.textMuted} ml-1`}>{kpi.suffix}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Area Tabs + Filters */}
      <div className={`flex items-center gap-3 px-6 py-3 border-b ${c.border}`}>
        {/* Area tabs */}
        <div className="flex items-center gap-1.5">
          <MapPin className={`w-3.5 h-3.5 ${c.textMuted} shrink-0`} />
          <button
            onClick={() => setSelectedAreaId("all")}
            className={`px-3 py-1.5 rounded-lg text-[12px] transition-all ${
              selectedAreaId === "all"
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                : `${c.bgSurface} ${c.textSecondary} border ${c.borderCard}`
            }`}
          >
            全エリア
          </button>
          {areas.map((area) => {
            const ac = processColorClasses[area.color] ?? processColorClasses.cyan;
            return (
              <button
                key={area.id}
                onClick={() => setSelectedAreaId(area.id)}
                className={`px-3 py-1.5 rounded-lg text-[12px] transition-all ${
                  selectedAreaId === area.id
                    ? `${ac.bg} ${ac.text} border ${ac.border}`
                    : `${c.bgSurface} ${c.textSecondary} border ${c.borderCard}`
                }`}
              >
                {area.name.split("（")[0]}
              </button>
            );
          })}
        </div>

        <div className={`w-px h-6 ${c.border}`} />

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <Filter className={`w-3.5 h-3.5 ${c.textMuted} shrink-0`} />
          {(["all", "running", "delayed", "idle", "done"] as StatusFilter[]).map((sf) => (
            <button
              key={sf}
              onClick={() => setStatusFilter(sf)}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
                statusFilter === sf
                  ? sf === "all" ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                    : `${statusConfig[sf as keyof typeof statusConfig].color} border border-current/20`
                  : `${c.bgSurface} ${c.textMuted} border ${c.borderCard}`
              }`}
            >
              {sf === "all" ? "全て" : statusConfig[sf as keyof typeof statusConfig].label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className={`text-[11px] ${c.textMuted}`}>
            {sortedZones.length} / {zones.length} 件表示
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {selectedAreaId === "all" ? (
          /* ── Grouped by Area view ── */
          <div className="px-6 py-4 space-y-4">
            {areas.map((area) => {
              const ac = processColorClasses[area.color] ?? processColorClasses.cyan;
              const stats = areaSummary[area.id];
              const areaZones = sortedZones.filter((z) => z.areaId === area.id);
              if (areaZones.length === 0 && statusFilter !== "all") return null;
              const isExpanded = expandedAreaIds.has(area.id);

              return (
                <div key={area.id} className={`${c.bgCard} rounded-xl border ${c.border} overflow-hidden`}>
                  {/* Area Header */}
                  <button
                    onClick={() => toggleAreaExpand(area.id)}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 border-b ${c.border} transition-colors ${c.bgCardHover}`}
                  >
                    <div className={`w-3 h-3 rounded-full ${ac.bg} border ${ac.border}`} />
                    <h3 className={`${ac.text} text-[14px]`}>{area.name}</h3>
                    <span className={`text-[11px] ${c.textMuted}`}>{area.description}</span>

                    {/* Area flow preview */}
                    <div className="flex items-center gap-1 ml-3">
                      {allZones.filter((z) => z.areaId === area.id).map((z, idx, arr) => {
                        const zc = processColorClasses[z.color];
                        return (
                          <div key={z.processId} className="flex items-center gap-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${zc.bg} ${zc.text}`}>{z.name}</span>
                            {idx < arr.length - 1 && <ArrowRight className={`w-2.5 h-2.5 ${c.textDimmed}`} />}
                          </div>
                        );
                      })}
                    </div>

                    <div className="ml-auto flex items-center gap-4">
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className={`${c.textMuted} flex items-center gap-1`}>
                          <Users className="w-3 h-3" />{stats?.workers ?? 0}/{stats?.capacity ?? 0}名
                        </span>
                        <span className={`tabular-nums ${
                          (stats?.progress ?? 0) >= 70 ? "text-emerald-400"
                            : (stats?.progress ?? 0) >= 40 ? "text-amber-400" : "text-red-400"
                        }`}>{stats?.progress ?? 0}%</span>
                        {(stats?.delayed ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-400">
                            <AlertTriangle className="w-3 h-3" />{stats.delayed}
                          </span>
                        )}
                        {(stats?.idle ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-red-400">
                            <Clock className="w-3 h-3" />{stats.idle}
                          </span>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp className={`w-4 h-4 ${c.textMuted}`} /> : <ChevronDown className={`w-4 h-4 ${c.textMuted}`} />}
                    </div>
                  </button>

                  {/* Area progress bar */}
                  <div className={`h-1 ${c.isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                    <div
                      className={`h-full transition-all duration-500 ${
                        (stats?.progress ?? 0) >= 70 ? "bg-emerald-500"
                          : (stats?.progress ?? 0) >= 40 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${stats?.progress ?? 0}%` }}
                    />
                  </div>

                  {/* Collapsible table */}
                  {isExpanded && (
                    <table className="w-full">
                      <thead>
                        <tr className={`border-b ${c.border}`}>
                          <SortHeader label="工程" sortKeyVal="name" />
                          <th className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left`}>予定</th>
                          <th className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left`}>実績</th>
                          <SortHeader label="残量" sortKeyVal="remaining" />
                          <SortHeader label="進捗" sortKeyVal="progress" />
                          <SortHeader label="UPH" sortKeyVal="uph" />
                          <th className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left`}>完了見込</th>
                          <th className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left`}>推薦</th>
                          <SortHeader label="配置" sortKeyVal="workers" />
                          <SortHeader label="状態" sortKeyVal="status" />
                        </tr>
                      </thead>
                      <tbody>
                        {areaZones.map((zone) => {
                          const m = zoneMetrics.get(zone.processId)!;
                          const colors = processColorClasses[zone.color];
                          const status = getStatus(zone, m);
                          const sc = statusConfig[status as keyof typeof statusConfig];
                          return (
                            <tr key={zone.processId} className={`border-b ${c.border} ${c.bgCardHover} transition-colors`}>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <zone.icon className={`w-3.5 h-3.5 ${colors.text}`} />
                                  <span className={`text-[12px] ${c.textPrimary}`}>{zone.name}</span>
                                </div>
                              </td>
                              <td className={`px-3 py-2.5 text-[12px] ${c.textSecondary} tabular-nums`}>{zone.production.planned.toLocaleString()}</td>
                              <td className="px-3 py-2.5 text-[12px] text-cyan-400 tabular-nums">{zone.production.actual.toLocaleString()}</td>
                              <td className={`px-3 py-2.5 text-[12px] ${c.textSecondary} tabular-nums`}>{m.remaining.toLocaleString()}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={`w-16 h-1.5 rounded-full ${c.isDark ? "bg-gray-800" : "bg-gray-200"} overflow-hidden`}>
                                    <div className={`h-full rounded-full transition-all ${m.progress >= 70 ? "bg-emerald-500" : m.progress >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${m.progress}%` }} />
                                  </div>
                                  <span className={`text-[11px] tabular-nums ${m.progress >= 70 ? "text-emerald-400" : m.progress >= 40 ? "text-amber-400" : "text-red-400"}`}>{m.progress}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-[12px] text-violet-400 tabular-nums">{m.totalUph || "—"}</td>
                              <td className={`px-3 py-2.5 text-[12px] tabular-nums ${m.estimatedEnd === "完了" ? "text-emerald-400" : m.isOverdue ? "text-red-400" : c.textPrimary}`}>{m.estimatedEnd}</td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full tabular-nums ${m.recommendedWorkers > m.filled ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>{m.recommendedWorkers}名</span>
                              </td>
                              <td className={`px-3 py-2.5 text-[12px] ${c.textSecondary} tabular-nums`}>
                                <span className={m.filled < zone.capacity * 0.5 ? "text-amber-400" : ""}>{m.filled}/{zone.capacity}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${sc.color} flex items-center gap-1 w-fit`}>
                                  <sc.icon className="w-3 h-3" />{sc.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Single Area view ── */
          <div className="px-6 py-4">
            {(() => {
              const area = areas.find((a) => a.id === selectedAreaId);
              if (!area) return null;
              const ac = processColorClasses[area.color] ?? processColorClasses.cyan;
              const stats = areaSummary[area.id];

              return (
                <div className={`${c.bgCard} rounded-xl border ${c.border} overflow-hidden`}>
                  {/* Area info header */}
                  <div className={`px-5 py-4 border-b ${c.border}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-3 h-3 rounded-full ${ac.bg} border ${ac.border}`} />
                      <h2 className={`${ac.text} text-[15px]`}>{area.name}</h2>
                      <span className={`text-[12px] ${c.textMuted}`}>{area.description}</span>
                    </div>
                    {/* Area KPI row */}
                    <div className="grid grid-cols-5 gap-3">
                      {[
                        { label: "配置", value: `${stats?.workers ?? 0}/${stats?.capacity ?? 0}`, suffix: "名", color: "text-blue-400" },
                        { label: "予定", value: (stats?.planned ?? 0).toLocaleString(), suffix: "", color: "text-violet-400" },
                        { label: "実績", value: (stats?.actual ?? 0).toLocaleString(), suffix: "", color: "text-cyan-400" },
                        { label: "進捗", value: `${stats?.progress ?? 0}`, suffix: "%", color: (stats?.progress ?? 0) >= 70 ? "text-emerald-400" : (stats?.progress ?? 0) >= 40 ? "text-amber-400" : "text-red-400" },
                        { label: "工程数", value: sortedZones.length, suffix: "件", color: "text-cyan-400" },
                      ].map((k) => (
                        <div key={k.label} className={`${c.bgSurface} rounded-lg border ${c.border} px-3 py-2.5`}>
                          <span className={`text-[10px] ${c.textMuted} block mb-0.5`}>{k.label}</span>
                          <span className={`text-[16px] ${k.color} tabular-nums`}>{k.value}<span className={`text-[10px] ${c.textMuted} ml-0.5`}>{k.suffix}</span></span>
                        </div>
                      ))}
                    </div>
                    {/* Flow */}
                    <div className="flex items-center gap-1.5 mt-3">
                      <span className={`text-[10px] ${c.textMuted} mr-1`}>フロー:</span>
                      {allZones.filter((z) => z.areaId === area.id).map((z, idx, arr) => {
                        const zc = processColorClasses[z.color];
                        const m = zoneMetrics.get(z.processId);
                        return (
                          <div key={z.processId} className="flex items-center gap-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded ${zc.bg} ${zc.text} flex items-center gap-1`}>
                              <z.icon className="w-3 h-3" />{z.name}
                              <span className={`tabular-nums ${(m?.progress ?? 0) >= 70 ? "text-emerald-400" : (m?.progress ?? 0) >= 40 ? "text-amber-400" : "text-red-400"}`}>{m?.progress ?? 0}%</span>
                            </span>
                            {idx < arr.length - 1 && <ArrowRight className={`w-3 h-3 ${c.textDimmed}`} />}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Table */}
                  <table className="w-full">
                    <thead>
                      <tr className={`border-b ${c.border}`}>
                        <SortHeader label="工程" sortKeyVal="name" />
                        <th className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left`}>予定</th>
                        <th className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left`}>実績</th>
                        <SortHeader label="残量" sortKeyVal="remaining" />
                        <SortHeader label="進捗" sortKeyVal="progress" />
                        <SortHeader label="UPH" sortKeyVal="uph" />
                        <th className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left`}>完了見込</th>
                        <th className={`text-[11px] ${c.textMuted} px-3 py-2.5 text-left`}>推薦</th>
                        <SortHeader label="配置" sortKeyVal="workers" />
                        <SortHeader label="状態" sortKeyVal="status" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedZones.map((zone) => {
                        const m = zoneMetrics.get(zone.processId)!;
                        const colors = processColorClasses[zone.color];
                        const status = getStatus(zone, m);
                        const sc = statusConfig[status as keyof typeof statusConfig];
                        return (
                          <tr key={zone.processId} className={`border-b ${c.border} ${c.bgCardHover} transition-colors`}>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <zone.icon className={`w-3.5 h-3.5 ${colors.text}`} />
                                <span className={`text-[12px] ${c.textPrimary}`}>{zone.name}</span>
                              </div>
                            </td>
                            <td className={`px-3 py-2.5 text-[12px] ${c.textSecondary} tabular-nums`}>{zone.production.planned.toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-[12px] text-cyan-400 tabular-nums">{zone.production.actual.toLocaleString()}</td>
                            <td className={`px-3 py-2.5 text-[12px] ${c.textSecondary} tabular-nums`}>{m.remaining.toLocaleString()}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-16 h-1.5 rounded-full ${c.isDark ? "bg-gray-800" : "bg-gray-200"} overflow-hidden`}>
                                  <div className={`h-full rounded-full transition-all ${m.progress >= 70 ? "bg-emerald-500" : m.progress >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${m.progress}%` }} />
                                </div>
                                <span className={`text-[11px] tabular-nums ${m.progress >= 70 ? "text-emerald-400" : m.progress >= 40 ? "text-amber-400" : "text-red-400"}`}>{m.progress}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-[12px] text-violet-400 tabular-nums">{m.totalUph || "—"}</td>
                            <td className={`px-3 py-2.5 text-[12px] tabular-nums ${m.estimatedEnd === "完了" ? "text-emerald-400" : m.isOverdue ? "text-red-400" : c.textPrimary}`}>{m.estimatedEnd}</td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[11px] px-2 py-0.5 rounded-full tabular-nums ${m.recommendedWorkers > m.filled ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>{m.recommendedWorkers}名</span>
                            </td>
                            <td className={`px-3 py-2.5 text-[12px] ${c.textSecondary} tabular-nums`}>
                              <span className={m.filled < zone.capacity * 0.5 ? "text-amber-400" : ""}>{m.filled}/{zone.capacity}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${sc.color} flex items-center gap-1 w-fit`}>
                                <sc.icon className="w-3 h-3" />{sc.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
