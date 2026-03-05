import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Clock,
  Search,
  AlertTriangle,
  Save,
  X,
  TrendingUp,
  Target,
  Timer,
  Calculator,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  ArrowRight,
  Bell,
  BellRing,
  ListChecks,
  Plus,
  Trash2,
  Send,
  Check,
  ChevronLeft,
  ChevronRight,
  Users,
  SkipForward,
  MapPin,
  Layers,
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

interface Worker {
  id: string;
  name: string;
  initials: string;
  color: string;
  skills: { label: string; icon: string }[];
  status: "active" | "break" | "absent";
}

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

interface StaffChange {
  workerId: string;
  workerName: string;
  fromZone: string | null;   // null = プール
  toZone: string | null;     // null = プール
}

interface AdjustmentEntry {
  id: string;
  scheduledTime: string;   // "HH:MM"
  createdAt: string;
  changes: StaffChange[];
  status: "pending" | "notified" | "applied";
  memo: string;
}

/* ------------------------------------------------------------------ */
/*  Mock Workers                                                       */
/* ------------------------------------------------------------------ */

const allWorkers: Worker[] = [
  { id: "w1",  name: "田中 太郎",   initials: "田", color: "bg-blue-500",    skills: [{ label: "L", icon: "✅" }, { label: "FL", icon: "🔑" }], status: "active" },
  { id: "w2",  name: "渡辺 謙",     initials: "渡", color: "bg-emerald-500", skills: [{ label: "検品", icon: "🔍" }],  status: "active" },
  { id: "w3",  name: "佐藤 花子",   initials: "佐", color: "bg-violet-500",  skills: [{ label: "検品", icon: "🔍" }, { label: "品質", icon: "○" }], status: "active" },
  { id: "w4",  name: "高橋 優子",   initials: "高", color: "bg-amber-500",   skills: [{ label: "加工", icon: "✂" }, { label: "ラベル", icon: "🏷" }], status: "active" },
  { id: "w5",  name: "伊藤 健",     initials: "伊", color: "bg-rose-400",    skills: [{ label: "梱包", icon: "📦" }], status: "active" },
  { id: "w6",  name: "鈴木 一郎",   initials: "鈴", color: "bg-orange-500",  skills: [{ label: "FL", icon: "🔑" }, { label: "出荷", icon: "🚛" }], status: "active" },
  { id: "w7",  name: "小林 さくら", initials: "小", color: "bg-pink-400",    skills: [{ label: "New", icon: "🌱" }], status: "active" },
  { id: "w8",  name: "中村 敏",     initials: "中", color: "bg-gray-400",    skills: [{ label: "FL", icon: "🔑" }],  status: "break" },
  { id: "w9",  name: "山田 裕子",   initials: "山", color: "bg-teal-500",    skills: [{ label: "仕分", icon: "📋" }], status: "active" },
  { id: "w10", name: "松本 翔",     initials: "松", color: "bg-indigo-500",  skills: [{ label: "仕分", icon: "📋" }, { label: "FL", icon: "🔑" }], status: "active" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildInitialZones(): Zone[] {
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
        slots: slotAssign.map((wId) => ({ workerId: wId })),
        production: { ...prod },
      });
    }
  }
  return zones;
}

function cloneZones(zones: Zone[]): Zone[] {
  return zones.map((z) => ({ ...z, slots: z.slots.map((s) => ({ ...s })), production: { ...z.production } }));
}

function parseTime(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
function formatTime(mins: number): string {
  const h = Math.floor(mins / 60); const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const NOW_MINUTES = 10 * 60 + 15;
const NOW_LABEL = formatTime(NOW_MINUTES);

/** Generate time slots from 06:00 to 22:00 every 30 min */
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 30) slots.push(formatTime(m));
  return slots;
}
const TIME_SLOTS = generateTimeSlots();

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

/** Diff two zone snapshots → list of StaffChange */
function diffSnapshots(before: Zone[], after: Zone[]): StaffChange[] {
  const changes: StaffChange[] = [];
  const mapBefore = new Map<string, string | null>();
  const mapAfter  = new Map<string, string | null>();
  for (const z of before) for (const s of z.slots) if (s.workerId) mapBefore.set(s.workerId, z.processId);
  for (const z of after)  for (const s of z.slots) if (s.workerId) mapAfter.set(s.workerId, z.processId);
  const allIds = new Set([...mapBefore.keys(), ...mapAfter.keys()]);
  for (const wId of allIds) {
    const from = mapBefore.get(wId) ?? null;
    const to   = mapAfter.get(wId)  ?? null;
    if (from !== to) {
      const w = allWorkers.find((w) => w.id === wId);
      const fromName = from ? before.find((z) => z.processId === from)?.name ?? null : null;
      const toName   = to   ? after.find((z) => z.processId === to)?.name   ?? null : null;
      changes.push({ workerId: wId, workerName: w?.name ?? wId, fromZone: fromName, toZone: toName });
    }
  }
  return changes;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function LiveCommand() {
  const c = useThemeColors();

  // --- Area selection ---
  const [areas] = useState<Area[]>(defaultAreas);
  const [selectedAreaId, setSelectedAreaId] = useState<string | "all">("all");

  // --- Time Axis ---
  const [selectedTime, setSelectedTime] = useState(NOW_LABEL);
  const isCurrentTime = selectedTime === NOW_LABEL;
  const selectedMinutes = parseTime(selectedTime);
  const sliderRef = useRef<HTMLDivElement>(null);

  // --- Zone snapshots keyed by time ---
  const [snapshotsByTime, setSnapshotsByTime] = useState<Record<string, Zone[]>>(() => ({
    [NOW_LABEL]: buildInitialZones(),
  }));

  // Current zones for the selected time
  const allZones = useMemo(() => {
    if (snapshotsByTime[selectedTime]) return snapshotsByTime[selectedTime];
    const times = Object.keys(snapshotsByTime).sort();
    let base = times[0];
    for (const t of times) { if (parseTime(t) <= selectedMinutes) base = t; }
    return cloneZones(snapshotsByTime[base]);
  }, [snapshotsByTime, selectedTime, selectedMinutes]);

  // Filtered zones for the selected area
  const zones = useMemo(() => {
    if (selectedAreaId === "all") return allZones;
    return allZones.filter((z) => z.areaId === selectedAreaId);
  }, [allZones, selectedAreaId]);

  const setZones = useCallback((updater: (prev: Zone[]) => Zone[]) => {
    setSnapshotsByTime((prev) => {
      const current = prev[selectedTime] ?? cloneZones(allZones);
      const next = updater(current);
      return { ...prev, [selectedTime]: next };
    });
  }, [selectedTime, allZones]);

  // --- Adjustment Queue ---
  const [adjustments, setAdjustments] = useState<AdjustmentEntry[]>([
    {
      id: "adj-0",
      scheduledTime: "12:00",
      createdAt: "10:05",
      changes: [
        { workerId: "w7", workerName: "小林 さくら", fromZone: null, toZone: "仕分け" },
        { workerId: "w9", workerName: "山田 裕子", fromZone: null, toZone: "仕分け" },
      ],
      status: "pending",
      memo: "午後の仕分け増員",
    },
    {
      id: "adj-1",
      scheduledTime: "15:00",
      createdAt: "10:10",
      changes: [
        { workerId: "w2", workerName: "渡辺 謙", fromZone: "検品", toZone: "梱包" },
      ],
      status: "notified",
      memo: "出荷ピーク対応",
    },
  ]);
  const [showAdjPanel, setShowAdjPanel] = useState(false);
  const [adjMemo, setAdjMemo] = useState("");

  // --- Other UI state ---
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedWorkerId, setDraggedWorkerId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<{ processId: string; slotIndex: number } | null>(null);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const toggleAreaExpand = (areaId: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId); else next.add(areaId);
      return next;
    });
  };
  const isZoneExpanded = (zone: { areaId: string }) => expandedAreas.has(zone.areaId);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcProcessId, setCalcProcessId] = useState(defaultProcessSteps[0].id);
  const [calcStartTime, setCalcStartTime] = useState(NOW_LABEL);
  const [calcEndTime, setCalcEndTime] = useState("18:00");
  const [calcQuantity, setCalcQuantity] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Toast helper
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };

  // --- Derived ---
  const assignedWorkerIds = useMemo(() => {
    const ids = new Set<string>();
    allZones.forEach((z) => z.slots.forEach((s) => { if (s.workerId) ids.add(s.workerId); }));
    return ids;
  }, [allZones]);

  const freeWorkers = allWorkers.filter((w) => w.status === "active" && !assignedWorkerIds.has(w.id));
  const breakWorkers = allWorkers.filter((w) => w.status === "break" || w.status === "absent");
  const filteredFreeWorkers = freeWorkers.filter((w) => w.name.includes(searchTerm) || w.skills.some((s) => s.label.includes(searchTerm)));
  const filteredBreakWorkers = breakWorkers.filter((w) => w.name.includes(searchTerm) || w.skills.some((s) => s.label.includes(searchTerm)));
  const totalActive = allWorkers.filter((w) => w.status === "active").length;
  const totalAll = allWorkers.length;
  const totalBreakAbsent = breakWorkers.length;
  const operationRate = Math.round((totalActive / totalAll) * 100);
  const criticalZones = allZones.filter((z) => { const filled = z.slots.filter((s) => s.workerId).length; return filled / z.capacity < 0.25 && z.production.planned > 0; });

  // Per-area stats
  const areaStats = useMemo(() => {
    const stats: Record<string, { workers: number; progress: number; critical: number }> = {};
    for (const area of areas) {
      const areaZones = allZones.filter((z) => z.areaId === area.id);
      let workers = 0;
      let totalProgress = 0;
      let critical = 0;
      for (const z of areaZones) {
        const filled = z.slots.filter((s) => s.workerId).length;
        workers += filled;
        const m = calcZoneMetrics(z, selectedMinutes);
        totalProgress += m.progress;
        if (filled / z.capacity < 0.25 && z.production.planned > 0) critical++;
      }
      stats[area.id] = {
        workers,
        progress: areaZones.length > 0 ? Math.round(totalProgress / areaZones.length) : 0,
        critical,
      };
    }
    return stats;
  }, [allZones, areas, selectedMinutes]);

  // Check if current time snapshot differs from the NOW snapshot
  const hasChanges = useMemo(() => {
    if (isCurrentTime) return false;
    const baseSnapshot = snapshotsByTime[NOW_LABEL];
    if (!baseSnapshot) return false;
    return diffSnapshots(baseSnapshot, allZones).length > 0;
  }, [isCurrentTime, allZones, snapshotsByTime]);

  // Calculator result
  const calcResult = useMemo(() => {
    const zone = allZones.find((z) => z.processId === calcProcessId);
    if (!zone) return null;
    const qty = parseInt(calcQuantity) || Math.max(0, zone.production.planned - zone.production.actual);
    const startMin = parseTime(calcStartTime);
    const endMin = parseTime(calcEndTime);
    const availH = Math.max(0.25, (endMin - startMin) / 60);
    const uph = zone.production.currentUph || zone.baseUph;
    const needed = Math.ceil(qty / (uph * availH));
    const currentFilled = zone.slots.filter((s) => s.workerId).length;
    return { zoneName: zone.name, quantity: qty, uph, needed: Math.max(1, needed), current: currentFilled, diff: Math.max(1, needed) - currentFilled };
  }, [allZones, calcProcessId, calcStartTime, calcEndTime, calcQuantity]);

  const pendingCount = adjustments.filter((a) => a.status === "pending").length;

  // --- Handlers ---
  const addToAdjustmentQueue = () => {
    const baseSnapshot = snapshotsByTime[NOW_LABEL];
    if (!baseSnapshot) return;
    const changes = diffSnapshots(baseSnapshot, allZones);
    if (changes.length === 0) { showToast("配置変更がありません"); return; }
    const entry: AdjustmentEntry = {
      id: `adj-${Date.now()}`,
      scheduledTime: selectedTime,
      createdAt: NOW_LABEL,
      changes,
      status: "pending",
      memo: adjMemo || `${selectedTime}の配置変更`,
    };
    setAdjustments((prev) => [...prev, entry]);
    setAdjMemo("");
    setShowAdjPanel(true);
    showToast(`${selectedTime}の配置変更を調整リストに追加しました`);
  };

  const sendNotification = (adjId: string) => {
    setAdjustments((prev) => prev.map((a) => a.id === adjId ? { ...a, status: "notified" as const } : a));
    const adj = adjustments.find((a) => a.id === adjId);
    showToast(`${adj?.scheduledTime ?? ""}の配置変更通知を${adj?.changes.length ?? 0}名に送信しました`);
  };

  const applyAdjustment = (adjId: string) => {
    setAdjustments((prev) => prev.map((a) => a.id === adjId ? { ...a, status: "applied" as const } : a));
    showToast("配置変更を適用しました");
  };

  const removeAdjustment = (adjId: string) => {
    setAdjustments((prev) => prev.filter((a) => a.id !== adjId));
  };

  const sendAllPending = () => {
    setAdjustments((prev) => prev.map((a) => a.status === "pending" ? { ...a, status: "notified" as const } : a));
    showToast(`未送信${pendingCount}件の通知を一括送信しました`);
  };

  // Drag handlers
  const handleDragStartFromPool = (workerId: string) => { setDraggedWorkerId(workerId); setDragSource(null); };
  const handleDragStartFromSlot = (workerId: string, processId: string, slotIndex: number) => { setDraggedWorkerId(workerId); setDragSource({ processId, slotIndex }); };
  const handleDropOnSlot = (processId: string, slotIndex: number) => {
    if (!draggedWorkerId) return;
    setZones((prev) => {
      const nz = cloneZones(prev);
      if (dragSource) { const src = nz.find((z) => z.processId === dragSource.processId); if (src) src.slots[dragSource.slotIndex].workerId = null; }
      const tgt = nz.find((z) => z.processId === processId);
      if (tgt) {
        const existing = tgt.slots[slotIndex].workerId;
        if (existing && dragSource) { const src = nz.find((z) => z.processId === dragSource.processId); if (src) src.slots[dragSource.slotIndex].workerId = existing; }
        tgt.slots[slotIndex].workerId = draggedWorkerId;
      }
      return nz;
    });
    setDraggedWorkerId(null); setDragSource(null);
  };
  const handleDropOnPool = () => {
    if (!draggedWorkerId || !dragSource) return;
    setZones((prev) => {
      const nz = cloneZones(prev);
      const src = nz.find((z) => z.processId === dragSource.processId);
      if (src) src.slots[dragSource.slotIndex].workerId = null;
      return nz;
    });
    setDraggedWorkerId(null); setDragSource(null);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDragEnd = () => { setDraggedWorkerId(null); setDragSource(null); };
  const removeWorkerFromSlot = (processId: string, slotIndex: number) => {
    setZones((prev) => prev.map((z) => z.processId === processId ? { ...z, slots: z.slots.map((s, i) => i === slotIndex ? { workerId: null } : s) } : z));
  };
  const getWorker = (id: string) => allWorkers.find((w) => w.id === id);
  const updateZoneTime = (processId: string, field: "startTime" | "targetEndTime", value: string) => {
    setZones((prev) => prev.map((z) => z.processId === processId ? { ...z, production: { ...z.production, [field]: value } } : z));
  };

  // Timeline navigation
  const goToPrevSlot = () => {
    const idx = TIME_SLOTS.indexOf(selectedTime);
    if (idx > 0) setSelectedTime(TIME_SLOTS[idx - 1]);
  };
  const goToNextSlot = () => {
    const idx = TIME_SLOTS.indexOf(selectedTime);
    if (idx < TIME_SLOTS.length - 1) setSelectedTime(TIME_SLOTS[idx + 1]);
  };
  const goToNow = () => setSelectedTime(NOW_LABEL);

  // Scroll timeline to keep selection visible
  useEffect(() => {
    if (sliderRef.current) {
      const idx = TIME_SLOTS.indexOf(selectedTime);
      const btn = sliderRef.current.children[idx] as HTMLElement | undefined;
      if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedTime]);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className={`h-full flex flex-col ${c.isDark ? "bg-[#0d0d1a]" : "bg-gray-50"} relative`}>

      {/* ── Toast ── */}
      {toastMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s_ease]">
          <div className={`flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg ${
            c.isDark ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300" : "bg-emerald-50 border border-emerald-200 text-emerald-700"
          }`}>
            <Check className="w-4 h-4" />
            <span className="text-[13px]">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* ══════════ Top Bar ══════════ */}
      <div className={`${c.bgCard} border-b ${c.border} px-5 py-2.5 flex items-center gap-5`}>
        <div className="flex items-center gap-2">
          <Clock className={`w-5 h-5 ${c.textMuted}`} />
          <span className={`text-[26px] ${c.textPrimary} tracking-tight tabular-nums`}>10:15</span>
          <span className={`text-[13px] ${c.textSecondary} ml-1`}>2026/3/4</span>
        </div>
        <div className={`flex items-center gap-5 border-l ${c.border} pl-5`}>
          <div className="text-center"><div className={`text-[11px] ${c.textSecondary}`}>出勤</div><div className={`text-[17px] ${c.textPrimary} tabular-nums`}>{totalActive}<span className={`text-[12px] ${c.textSecondary}`}>/{totalAll}</span></div></div>
          <div className="text-center"><div className={`text-[11px] ${c.textSecondary}`}>休憩</div><div className={`text-[17px] ${c.textPrimary} tabular-nums`}>{totalBreakAbsent}</div></div>
          <div className="text-center"><div className={`text-[11px] ${c.textSecondary}`}>稼働率</div><div className="text-[17px] text-emerald-500 tabular-nums">{operationRate}%</div></div>
        </div>
        {criticalZones.length > 0 && (
          <div className={`flex-1 flex items-center gap-2 rounded-lg px-3 py-1.5 ${c.isDark ? "bg-amber-500/10 border border-amber-500/30" : "bg-amber-50 border border-amber-200"}`}>
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className={`text-[12px] ${c.isDark ? "text-amber-300" : "text-amber-800"}`}>{criticalZones.map((z) => z.name).join("、")}で人員不足</span>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button onClick={() => setShowCalculator(!showCalculator)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all ${showCalculator ? "bg-violet-600 text-white" : `${c.bgSurface} border ${c.borderCard} ${c.textSecondary}`}`}>
            <Calculator className="w-3.5 h-3.5" />推薦人数
          </button>
          <button onClick={() => setShowAdjPanel(!showAdjPanel)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all ${showAdjPanel ? "bg-orange-600 text-white" : `${c.bgSurface} border ${c.borderCard} ${c.textSecondary}`}`}>
            <ListChecks className="w-3.5 h-3.5" />調整リスト
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">{pendingCount}</span>
            )}
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] hover:bg-blue-500 transition-all">
            <Save className="w-3.5 h-3.5" />保存
          </button>
        </div>
      </div>

      {/* ══════════ Area Tabs ══════════ */}
      <div className={`${c.bgCard} border-b ${c.border} px-5 py-2 flex items-center gap-2 overflow-x-auto`}>
        <MapPin className={`w-4 h-4 ${c.textMuted} shrink-0`} />
        <button
          onClick={() => setSelectedAreaId("all")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all shrink-0 border ${
            selectedAreaId === "all"
              ? c.isDark
                ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                : "bg-blue-50 border-blue-300 text-blue-700"
              : `${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:opacity-80`
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          全エリア
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.bgSurface} ${c.textMuted}`}>
            {allZones.length}
          </span>
        </button>
        {areas.map((area) => {
          const aColors = processColorClasses[area.color] ?? processColorClasses.cyan;
          const isActive = selectedAreaId === area.id;
          const stats = areaStats[area.id];
          return (
            <button
              key={area.id}
              onClick={() => setSelectedAreaId(area.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] transition-all shrink-0 border ${
                isActive
                  ? `${aColors.bg} ${aColors.border} ${aColors.text}`
                  : `${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:opacity-80`
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${aColors.bg} border ${aColors.border}`} />
              <span className="max-w-[120px] truncate">{area.name}</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${c.textMuted} flex items-center gap-0.5`}>
                  <Users className="w-2.5 h-2.5" />{stats?.workers ?? 0}
                </span>
                <span className={`text-[10px] tabular-nums ${
                  (stats?.progress ?? 0) >= 70 ? "text-emerald-400"
                    : (stats?.progress ?? 0) >= 40 ? "text-amber-400" : "text-red-400"
                }`}>{stats?.progress ?? 0}%</span>
                {(stats?.critical ?? 0) > 0 && (
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ══════════ Time Axis ══════════ */}
      <div className={`${c.bgCard} border-b ${c.border} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevSlot} className={`${c.textMuted} hover:${c.textPrimary} p-1 rounded transition-colors`}><ChevronLeft className="w-4 h-4" /></button>

          {/* Timeline slider */}
          <div className="flex-1 relative overflow-hidden">
            <div ref={sliderRef} className="flex items-center gap-0 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: "none" }}>
              {TIME_SLOTS.map((t) => {
                const mins = parseTime(t);
                const isNow = t === NOW_LABEL;
                const isSelected = t === selectedTime;
                const isPast = mins < NOW_MINUTES;
                const hasSnapshot = !!snapshotsByTime[t] && t !== NOW_LABEL;
                const hasAdj = adjustments.some((a) => a.scheduledTime === t);
                const isHour = mins % 60 === 0;

                return (
                  <button
                    key={t}
                    onClick={() => setSelectedTime(t)}
                    className={`relative flex flex-col items-center shrink-0 transition-all ${isHour ? "min-w-[48px]" : "min-w-[36px]"} py-1 rounded-lg ${
                      isSelected
                        ? c.isDark ? "bg-blue-500/20 ring-1 ring-blue-500/50" : "bg-blue-50 ring-1 ring-blue-300"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <span className={`text-[10px] tabular-nums ${
                      isSelected ? (c.isDark ? "text-blue-300" : "text-blue-600")
                        : isNow ? "text-emerald-400"
                        : isPast ? c.textDimmed
                        : c.textMuted
                    } ${!isHour ? "text-[9px]" : ""}`}>{t}</span>

                    <div className="relative mt-1">
                      {isNow ? (
                        <div className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30 animate-pulse" />
                      ) : isSelected ? (
                        <div className={`w-3 h-3 rounded-full ${c.isDark ? "bg-blue-400" : "bg-blue-500"} ring-2 ${c.isDark ? "ring-blue-400/30" : "ring-blue-300"}`} />
                      ) : hasSnapshot || hasAdj ? (
                        <div className={`w-2 h-2 rounded-full ${hasAdj ? "bg-orange-400" : "bg-cyan-400"}`} />
                      ) : (
                        <div className={`w-1.5 h-1.5 rounded-full ${isPast ? (c.isDark ? "bg-gray-700" : "bg-gray-300") : (c.isDark ? "bg-gray-600" : "bg-gray-300")}`} />
                      )}
                    </div>

                    {hasAdj && !isSelected && (
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-400" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className={`absolute bottom-[13px] left-0 right-0 h-px ${c.isDark ? "bg-gray-700" : "bg-gray-300"} pointer-events-none`} />
          </div>

          <button onClick={goToNextSlot} className={`${c.textMuted} hover:${c.textPrimary} p-1 rounded transition-colors`}><ChevronRight className="w-4 h-4" /></button>
          {!isCurrentTime && (
            <button onClick={goToNow} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] hover:bg-emerald-500 transition-all shrink-0">
              <SkipForward className="w-3 h-3" />現在
            </button>
          )}
        </div>

        {/* Time context bar */}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[12px] tabular-nums ${isCurrentTime ? "text-emerald-400" : (c.isDark ? "text-blue-300" : "text-blue-600")}`}>
              {isCurrentTime ? "▶ 現在の配置" : `⏱ ${selectedTime} の配置計画`}
            </span>
            {!isCurrentTime && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                selectedMinutes > NOW_MINUTES
                  ? c.isDark ? "bg-blue-500/10 text-blue-400 border border-blue-500/30" : "bg-blue-50 text-blue-600 border border-blue-200"
                  : c.isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"
              }`}>
                {selectedMinutes > NOW_MINUTES ? `${Math.round((selectedMinutes - NOW_MINUTES) / 60 * 10) / 10}時間後` : "過去"}
              </span>
            )}
          </div>
          {!isCurrentTime && hasChanges && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="メモ（例: 午後の増員）"
                value={adjMemo}
                onChange={(e) => setAdjMemo(e.target.value)}
                className={`${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-1 text-[12px] ${c.textPrimary} outline-none w-[200px]`}
              />
              <button onClick={addToAdjustmentQueue}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 text-white text-[12px] hover:bg-orange-500 transition-all">
                <Plus className="w-3.5 h-3.5" />調整リストに追加
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══════════ Calculator Panel ══════════ */}
      {showCalculator && (
        <div className={`${c.bgCard} border-b ${c.border} px-5 py-3`}>
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <Zap className="w-4 h-4 text-violet-400" />
              <span className={`${c.textPrimary} text-[13px]`}>推薦人数</span>
            </div>
            <div><label className={`text-[10px] ${c.textMuted} block mb-0.5`}>工程</label>
              <select value={calcProcessId} onChange={(e) => setCalcProcessId(e.target.value)} className={`${c.bgSurface} border ${c.borderCard} rounded-lg px-2 py-1.5 text-[12px] ${c.textPrimary} outline-none min-w-[120px]`}>
                {allZones.map((z) => <option key={z.processId} value={z.processId}>{z.name}</option>)}
              </select>
            </div>
            <div><label className={`text-[10px] ${c.textMuted} block mb-0.5`}>開始</label>
              <input type="time" value={calcStartTime} onChange={(e) => setCalcStartTime(e.target.value)} className={`${c.bgSurface} border ${c.borderCard} rounded-lg px-2 py-1.5 text-[12px] ${c.textPrimary} outline-none`} />
            </div>
            <div><label className={`text-[10px] ${c.textMuted} block mb-0.5`}>目標完了</label>
              <input type="time" value={calcEndTime} onChange={(e) => setCalcEndTime(e.target.value)} className={`${c.bgSurface} border ${c.borderCard} rounded-lg px-2 py-1.5 text-[12px] ${c.textPrimary} outline-none`} />
            </div>
            <div><label className={`text-[10px] ${c.textMuted} block mb-0.5`}>数量(空=残量)</label>
              <input type="number" placeholder={calcResult ? String(calcResult.quantity) : ""} value={calcQuantity} onChange={(e) => setCalcQuantity(e.target.value)} className={`${c.bgSurface} border ${c.borderCard} rounded-lg px-2 py-1.5 text-[12px] ${c.textPrimary} outline-none w-[100px]`} />
            </div>
            {calcResult && (
              <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ${c.isDark ? "bg-violet-500/10 border border-violet-500/30" : "bg-violet-50 border border-violet-200"}`}>
                <div className="text-center"><div className={`text-[10px] ${c.textMuted}`}>推薦</div><div className="text-[18px] text-violet-400 tabular-nums">{calcResult.needed}<span className={`text-[12px] ${c.textMuted}`}>名</span></div></div>
                <div className={`w-px h-7 ${c.border}`} />
                <div className="text-center"><div className={`text-[10px] ${c.textMuted}`}>現在</div><div className={`text-[14px] ${c.textPrimary} tabular-nums`}>{calcResult.current}名</div></div>
                <div className={`w-px h-7 ${c.border}`} />
                <div className="text-center"><div className={`text-[10px] ${c.textMuted}`}>差</div><div className={`text-[14px] tabular-nums ${calcResult.diff > 0 ? "text-red-400" : "text-emerald-400"}`}>{calcResult.diff > 0 ? `+${calcResult.diff}不足` : calcResult.diff === 0 ? "適正" : `${Math.abs(calcResult.diff)}余裕`}</div></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ Main Content ══════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Zone Area ── */}
        <div className="flex-1 p-4 overflow-y-auto">
          {/* Process Flow per area or all */}
          {selectedAreaId === "all" ? (
            /* All areas view: group by area */
            areas.map((area) => {
              const aColors = processColorClasses[area.color] ?? processColorClasses.cyan;
              const areaZones = allZones.filter((z) => z.areaId === area.id);
              if (areaZones.length === 0) return null;
              return (
                <div key={area.id} className="mb-5">
                  {/* Area header */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-3 h-3 rounded-full ${aColors.bg} border ${aColors.border}`} />
                    <h3 className={`${aColors.text} text-[13px]`}>{area.name}</h3>
                    <span className={`text-[11px] ${c.textMuted}`}>{area.description}</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className={`text-[10px] ${c.textMuted} flex items-center gap-0.5`}>
                        <Users className="w-2.5 h-2.5" />{areaStats[area.id]?.workers ?? 0}名
                      </span>
                      <span className={`text-[10px] tabular-nums ${
                        (areaStats[area.id]?.progress ?? 0) >= 70 ? "text-emerald-400"
                          : (areaStats[area.id]?.progress ?? 0) >= 40 ? "text-amber-400" : "text-red-400"
                      }`}>{areaStats[area.id]?.progress ?? 0}%</span>
                      <button
                        onClick={() => toggleAreaExpand(area.id)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] transition-all ${
                          expandedAreas.has(area.id)
                            ? `${aColors.bg} ${aColors.border} border ${aColors.text}`
                            : `${c.bgSurface} border ${c.borderCard} ${c.textMuted}`
                        }`}
                      >
                        {expandedAreas.has(area.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {expandedAreas.has(area.id) ? "閉じる" : "展開"}
                      </button>
                    </div>
                  </div>
                  {/* Flow indicator */}
                  <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-1">
                    <span className={`text-[10px] ${c.textMuted} mr-1 shrink-0`}>フロー:</span>
                    {areaZones.map((zone, idx) => {
                      const colors = processColorClasses[zone.color];
                      const m = calcZoneMetrics(zone, selectedMinutes);
                      return (
                        <div key={zone.processId} className="flex items-center gap-1 shrink-0">
                          <button onClick={() => toggleAreaExpand(zone.areaId)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-all ${
                              isZoneExpanded(zone) ? `${colors.bg} ${colors.border} border` : `${c.bgSurface} border ${c.borderCard} ${c.textSecondary}`
                            }`}>
                            <zone.icon className={`w-3 h-3 ${colors.text}`} />
                            <span className={isZoneExpanded(zone) ? colors.text : c.textSecondary}>{zone.name}</span>
                            <span className={`tabular-nums ${m.progress >= 80 ? "text-emerald-400" : m.progress >= 40 ? "text-amber-400" : "text-red-400"}`}>{m.progress}%</span>
                          </button>
                          {idx < areaZones.length - 1 && <ArrowRight className={`w-3 h-3 ${c.textDimmed}`} />}
                        </div>
                      );
                    })}
                  </div>
                  {/* Zone Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    {areaZones.map((zone) => renderZoneCard(zone))}
                  </div>
                </div>
              );
            })
          ) : (
            /* Single area view */
            <>
              {/* Flow indicator */}
              <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
                <span className={`text-[10px] ${c.textMuted} mr-1 shrink-0`}>フロー:</span>
                {zones.length > 0 && (() => {
                  const aId = zones[0].areaId;
                  const areaC = processColorClasses[areas.find((a) => a.id === aId)?.color ?? "cyan"] ?? processColorClasses.cyan;
                  return (
                    <button
                      onClick={() => toggleAreaExpand(aId)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-all shrink-0 mr-1 border ${
                        expandedAreas.has(aId)
                          ? `${areaC.bg} ${areaC.border} ${areaC.text}`
                          : `${c.bgSurface} ${c.borderCard} ${c.textMuted}`
                      }`}
                    >
                      {expandedAreas.has(aId) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {expandedAreas.has(aId) ? "全閉じ" : "全展開"}
                    </button>
                  );
                })()}
                {zones.map((zone, idx) => {
                  const colors = processColorClasses[zone.color];
                  const m = calcZoneMetrics(zone, selectedMinutes);
                  return (
                    <div key={zone.processId} className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleAreaExpand(zone.areaId)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-all ${
                          isZoneExpanded(zone) ? `${colors.bg} ${colors.border} border` : `${c.bgSurface} border ${c.borderCard} ${c.textSecondary}`
                        }`}>
                        <zone.icon className={`w-3 h-3 ${colors.text}`} />
                        <span className={isZoneExpanded(zone) ? colors.text : c.textSecondary}>{zone.name}</span>
                        <span className={`tabular-nums ${m.progress >= 80 ? "text-emerald-400" : m.progress >= 40 ? "text-amber-400" : "text-red-400"}`}>{m.progress}%</span>
                      </button>
                      {idx < zones.length - 1 && <ArrowRight className={`w-3 h-3 ${c.textDimmed}`} />}
                    </div>
                  );
                })}
              </div>
              {/* Zone Cards */}
              <div className="grid grid-cols-2 gap-3">
                {zones.map((zone) => renderZoneCard(zone))}
              </div>
            </>
          )}

        </div>

        {/* ── Right Panel: Staff Pool + Adjustment Queue ── */}
        <div className={`w-[280px] ${c.bgCard} border-l ${c.border} flex flex-col shrink-0`}>

          {/* Tab switcher */}
          <div className={`flex border-b ${c.border}`}>
            <button
              onClick={() => setShowAdjPanel(false)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] transition-all ${
                !showAdjPanel ? `${c.textPrimary} border-b-2 border-blue-500` : `${c.textMuted}`
              }`}
            >
              <Users className="w-3.5 h-3.5" />スタッフ
            </button>
            <button
              onClick={() => setShowAdjPanel(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] transition-all relative ${
                showAdjPanel ? `${c.textPrimary} border-b-2 border-orange-500` : `${c.textMuted}`
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />調整リスト
              {pendingCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">{pendingCount}</span>
              )}
            </button>
          </div>

          {!showAdjPanel ? (
            /* ── Staff Pool Tab ── */
            <div className="flex-1 flex flex-col overflow-hidden" onDragOver={handleDragOver} onDrop={handleDropOnPool}>
              <div className={`p-3 border-b ${c.border}`}>
                <div className="relative">
                  <Search className={`w-3.5 h-3.5 ${c.textSecondary} absolute left-2.5 top-1/2 -translate-y-1/2`} />
                  <input type="text" placeholder="名前・スキル検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full ${c.bgSurface} border ${c.border} rounded-lg pl-8 pr-3 py-1.5 text-[12px] ${c.textPrimary} focus:border-blue-400 outline-none`} />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[11px] ${c.textMuted}`}>未割当</span>
                    <span className={`text-[10px] ${c.textSecondary} ${c.bgSurface} px-1.5 py-0.5 rounded-full`}>{filteredFreeWorkers.length}</span>
                  </div>
                  <div className="space-y-1">
                    {filteredFreeWorkers.map((worker) => (
                      <div key={worker.id} draggable onDragStart={() => handleDragStartFromPool(worker.id)} onDragEnd={handleDragEnd}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${c.border} ${c.bgCard} cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow`}>
                        <div className={`w-7 h-7 rounded-full ${worker.color} text-white flex items-center justify-center text-[11px] shrink-0`}>{worker.initials}</div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[11px] ${c.textPrimary} truncate`}>{worker.name}</div>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {worker.skills.map((skill) => (
                              <span key={skill.label} className={`text-[8px] px-1 py-0.5 rounded ${
                                skill.label === "New" ? "bg-green-100 text-green-600" : skill.label === "FL" ? "bg-blue-100 text-blue-600" : `${c.bgSurface} ${c.textMuted}`
                              }`}>{skill.icon}{skill.label}</span>
                            ))}
                          </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      </div>
                    ))}
                    {filteredFreeWorkers.length === 0 && <p className={`text-[11px] ${c.textSecondary} text-center py-2`}>該当なし</p>}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[11px] ${c.textMuted}`}>休憩・離席</span>
                    <span className={`text-[10px] ${c.textSecondary} ${c.bgSurface} px-1.5 py-0.5 rounded-full`}>{filteredBreakWorkers.length}</span>
                  </div>
                  <div className="space-y-1">
                    {filteredBreakWorkers.map((worker) => (
                      <div key={worker.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${c.border} ${c.bgSurface} opacity-60`}>
                        <div className={`w-7 h-7 rounded-full ${worker.color} text-white flex items-center justify-center text-[11px] shrink-0`}>{worker.initials}</div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[11px] ${c.textSecondary} truncate`}>{worker.name}</div>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            {worker.skills.map((skill) => (
                              <span key={skill.label} className={`text-[8px] px-1 py-0.5 rounded ${c.bgSurface} ${c.textMuted}`}>{skill.icon}{skill.label}</span>
                            ))}
                          </div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── Adjustment Queue Tab ── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Queue Header */}
              <div className={`p-3 border-b ${c.border} flex items-center justify-between`}>
                <span className={`text-[12px] ${c.textPrimary}`}>配置調整 {adjustments.length}件</span>
                {pendingCount > 0 && (
                  <button onClick={sendAllPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600 text-white text-[11px] hover:bg-orange-500 transition-all">
                    <Send className="w-3 h-3" />一括送信({pendingCount})
                  </button>
                )}
              </div>

              {/* Queue List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {adjustments.length === 0 && (
                  <div className={`text-center py-8 ${c.textDimmed}`}>
                    <ListChecks className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-[12px]">調整リストは空です</p>
                    <p className="text-[10px] mt-1">時間軸をスライドして配置を変更後、<br />「調整リストに追加」してください</p>
                  </div>
                )}

                {adjustments
                  .sort((a, b) => parseTime(a.scheduledTime) - parseTime(b.scheduledTime))
                  .map((adj) => {
                    const isPast = parseTime(adj.scheduledTime) <= NOW_MINUTES;
                    return (
                      <div key={adj.id} className={`rounded-xl border ${c.border} overflow-hidden ${
                        adj.status === "applied" ? "opacity-50" : ""
                      }`}>
                        {/* Entry Header */}
                        <div className={`px-3 py-2 flex items-center justify-between ${
                          adj.status === "pending"
                            ? c.isDark ? "bg-orange-500/10" : "bg-orange-50"
                            : adj.status === "notified"
                            ? c.isDark ? "bg-blue-500/10" : "bg-blue-50"
                            : c.isDark ? "bg-emerald-500/10" : "bg-emerald-50"
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className={`text-[14px] tabular-nums ${c.textPrimary}`}>{adj.scheduledTime}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              adj.status === "pending" ? "bg-orange-500/20 text-orange-400"
                                : adj.status === "notified" ? "bg-blue-500/20 text-blue-400"
                                : "bg-emerald-500/20 text-emerald-400"
                            }`}>
                              {adj.status === "pending" ? "未送信" : adj.status === "notified" ? "通知済" : "適用済"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {adj.status === "pending" && (
                              <button onClick={() => sendNotification(adj.id)}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-orange-600 text-white text-[10px] hover:bg-orange-500 transition-all"
                                title="作業者に通知送信">
                                <BellRing className="w-3 h-3" />通知
                              </button>
                            )}
                            {adj.status === "notified" && !isPast && (
                              <button onClick={() => applyAdjustment(adj.id)}
                                className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] hover:bg-emerald-500 transition-all">
                                <Check className="w-3 h-3" />適用
                              </button>
                            )}
                            {adj.status !== "applied" && (
                              <button onClick={() => removeAdjustment(adj.id)}
                                className={`p-1 rounded ${c.textMuted} hover:text-red-400 transition-colors`}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Changes detail */}
                        <div className={`px-3 py-2 ${c.bgCard}`}>
                          {adj.memo && <p className={`text-[11px] ${c.textSecondary} mb-1.5`}>{adj.memo}</p>}
                          <div className="space-y-1">
                            {adj.changes.map((ch, i) => {
                              const worker = allWorkers.find((w) => w.id === ch.workerId);
                              return (
                                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                                  {worker && (
                                    <div className={`w-5 h-5 rounded-full ${worker.color} text-white flex items-center justify-center text-[8px] shrink-0`}>
                                      {worker.initials}
                                    </div>
                                  )}
                                  <span className={c.textPrimary}>{ch.workerName}</span>
                                  <span className={c.textDimmed}>:</span>
                                  <span className={c.textMuted}>{ch.fromZone ?? "プール"}</span>
                                  <ArrowRight className={`w-3 h-3 ${c.textDimmed}`} />
                                  <span className={ch.toZone ? "text-cyan-400" : "text-amber-400"}>{ch.toZone ?? "プール"}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className={`text-[9px] ${c.textDimmed} mt-1.5`}>作成: {adj.createdAt} | {adj.changes.length}名の変更</div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Notification Legend */}
              <div className={`p-3 border-t ${c.border}`}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className={`text-[9px] ${c.textMuted}`}>未送信</span></div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className={`text-[9px] ${c.textMuted}`}>通知済</span></div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className={`text-[9px] ${c.textMuted}`}>適用済</span></div>
                </div>
                <p className={`text-[9px] ${c.textDimmed} mt-1`}>
                  <Bell className="w-2.5 h-2.5 inline mr-0.5" />
                  時刻になると作業者端末に自動通知されます
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ── Zone Card Renderer ── */
  function renderZoneCard(zone: Zone) {
    const metrics = calcZoneMetrics(zone, selectedMinutes);
    const isExpanded = isZoneExpanded(zone);
    const cols = zone.capacity <= 4 ? 2 : zone.capacity <= 6 ? 3 : 4;
    const colors = processColorClasses[zone.color];
    const progressColor = metrics.progress >= 80 ? "bg-emerald-500" : metrics.progress >= 50 ? "bg-cyan-500" : metrics.progress >= 25 ? "bg-amber-500" : "bg-red-500";
    const borderStyle = metrics.filled === 0 && zone.production.planned > 0 ? "border-red-400"
      : metrics.isOverdue ? "border-amber-400" : c.isDark ? colors.border : "border-gray-200";
    const area = areas.find((a) => a.id === zone.areaId);

    return (
      <div key={zone.processId} className={`rounded-xl border-2 ${c.bgCard} ${borderStyle} overflow-hidden`}>
        <div className="p-3 pb-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-lg ${colors.bg} flex items-center justify-center`}>
                <zone.icon className={`w-3 h-3 ${colors.text}`} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className={`${c.textPrimary} text-[13px]`}>{zone.name}</h3>
                  {selectedAreaId === "all" && area && (
                    <span className={`text-[9px] px-1 py-0.5 rounded ${(processColorClasses[area.color] ?? processColorClasses.cyan).bg} ${(processColorClasses[area.color] ?? processColorClasses.cyan).text}`}>
                      {area.name.split("（")[0]}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] ${c.textMuted}`}>{zone.description}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] flex items-center gap-0.5 ${
                metrics.filled === 0 && zone.production.planned > 0 ? "text-red-400" : metrics.filled < zone.capacity / 2 ? "text-amber-400" : c.textMuted
              }`}>
                {metrics.filled === 0 && zone.production.planned > 0 && <AlertTriangle className="w-3 h-3" />}
                <Users className="w-3 h-3" />{metrics.filled}/{zone.capacity}
              </span>
              <button onClick={() => toggleAreaExpand(zone.areaId)} className={c.textMuted}>
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* KPI */}
          <div className={`grid grid-cols-5 gap-1 rounded-lg ${c.bgSurface} p-2 mb-1.5`}>
            <div className="text-center">
              <div className={`text-[9px] ${c.textMuted} flex items-center justify-center gap-0.5`}><Target className="w-2.5 h-2.5" />予定</div>
              <div className={`text-[13px] ${c.textPrimary} tabular-nums`}>{zone.production.planned.toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className={`text-[9px] ${c.textMuted} flex items-center justify-center gap-0.5`}><CheckCircle2 className="w-2.5 h-2.5" />実績</div>
              <div className="text-[13px] text-cyan-400 tabular-nums">{zone.production.actual.toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className={`text-[9px] ${c.textMuted} flex items-center justify-center gap-0.5`}><TrendingUp className="w-2.5 h-2.5" />進捗</div>
              <div className={`text-[13px] tabular-nums ${metrics.progress >= 70 ? "text-emerald-400" : metrics.progress >= 40 ? "text-amber-400" : "text-red-400"}`}>{metrics.progress}%</div>
            </div>
            <div className="text-center">
              <div className={`text-[9px] ${c.textMuted}`}>UPH</div>
              <div className={`text-[13px] tabular-nums ${metrics.totalUph > 0 ? "text-violet-400" : c.textDimmed}`}>{metrics.totalUph || "—"}</div>
            </div>
            <div className="text-center">
              <div className={`text-[9px] ${c.textMuted} flex items-center justify-center gap-0.5`}><Timer className="w-2.5 h-2.5" />見込</div>
              <div className={`text-[13px] tabular-nums ${metrics.estimatedEnd === "完了" ? "text-emerald-400" : metrics.isOverdue ? "text-red-400" : c.textPrimary}`}>{metrics.estimatedEnd}</div>
            </div>
          </div>

          {/* Progress */}
          <div className={`w-full h-1.5 rounded-full ${c.isDark ? "bg-gray-800" : "bg-gray-200"} overflow-hidden`}>
            <div className={`h-full rounded-full ${progressColor} transition-all duration-500`} style={{ width: `${metrics.progress}%` }} />
          </div>

          {/* Time & Rec */}
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className={`text-[9px] ${c.textMuted}`}>開始</span>
                <input type="time" value={zone.production.startTime} onChange={(e) => updateZoneTime(zone.processId, "startTime", e.target.value)}
                  className={`${c.bgSurface} border ${c.borderCard} rounded px-1 py-0.5 text-[10px] ${c.textPrimary} outline-none w-[64px] tabular-nums`} />
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[9px] ${c.textMuted}`}>目標</span>
                <input type="time" value={zone.production.targetEndTime} onChange={(e) => updateZoneTime(zone.processId, "targetEndTime", e.target.value)}
                  className={`${c.bgSurface} border ${c.borderCard} rounded px-1 py-0.5 text-[10px] ${c.textPrimary} outline-none w-[64px] tabular-nums`} />
              </div>
            </div>
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] ${
              metrics.recommendedWorkers > metrics.filled
                ? c.isDark ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-red-50 text-red-600 border border-red-200"
                : c.isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-emerald-50 text-emerald-600 border border-emerald-200"
            }`}>
              <Zap className="w-2.5 h-2.5" />推薦{metrics.recommendedWorkers}名
              {metrics.recommendedWorkers > metrics.filled && <span className="text-[9px]">(+{metrics.recommendedWorkers - metrics.filled})</span>}
            </div>
          </div>
        </div>

        {/* Slots */}
        {isExpanded && (
          <div className={`px-3 pb-3 pt-2 border-t ${c.border}`}>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {zone.slots.map((slot, slotIdx) => {
                const worker = slot.workerId ? getWorker(slot.workerId) : null;
                if (worker) {
                  return (
                    <div key={slotIdx} draggable onDragStart={() => handleDragStartFromSlot(worker.id, zone.processId, slotIdx)} onDragEnd={handleDragEnd}
                      className={`relative group flex items-center gap-1.5 px-2 py-1.5 rounded-lg border ${c.border} ${c.bgCard} cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow`}>
                      <div className={`w-7 h-7 rounded-full ${worker.color} text-white flex items-center justify-center text-[11px] shrink-0`}>{worker.initials}</div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-[11px] ${c.textPrimary} truncate`}>{worker.name}</div>
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {worker.skills.slice(0, 2).map((skill) => (
                            <span key={skill.label} className={`text-[8px] px-1 py-0.5 rounded ${
                              skill.label === "New" ? "bg-green-100 text-green-600" : skill.label === "FL" || skill.label === "L" ? "bg-blue-100 text-blue-600" : `${c.bgSurface} ${c.textMuted}`
                            }`}>{skill.icon}{skill.label}</span>
                          ))}
                        </div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <button onClick={(e) => { e.stopPropagation(); removeWorkerFromSlot(zone.processId, slotIdx); }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={slotIdx} onDragOver={handleDragOver} onDrop={() => handleDropOnSlot(zone.processId, slotIdx)}
                    className={`flex items-center justify-center px-2 py-2.5 rounded-lg border-2 border-dashed transition-colors ${
                      draggedWorkerId ? "border-blue-300 bg-blue-50/30" : `${c.border} ${c.bgSurface}`
                    }`}>
                    <span className={`text-[11px] ${c.textDimmed}`}>空き</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
}
