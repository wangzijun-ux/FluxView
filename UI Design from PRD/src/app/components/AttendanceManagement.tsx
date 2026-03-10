import React, { useState, useMemo, useEffect } from "react";
import {
    Clock,
    Search,
    ChevronLeft,
    ChevronRight,
    Save,
    Filter,
    Download,
    Calendar,
    CheckCircle2,
    Edit3,
    ChevronDown,
    ChevronRight as ChevronRightIcon,
    Info,
    X,
    CalendarX,
    CheckSquare,
    Square,
    Zap,
    Trash2
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import {
    INITIAL_WORKERS,
    type Worker
} from "./processStore";

/** 月の日数を取得 */
const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
};

/** 曜日を取得 (0: 日, 1: 月, ...) */
const getDayOfWeek = (year: number, month: number, day: number) => {
    return new Date(year, month, day).getDay();
};

/** 時間差分を計算 (Hours) */
const calculateHours = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    const diff = (eH * 60 + eM) - (sH * 60 + sM);
    return Math.max(0, diff / 60);
};

interface ShiftData {
    start: string;
    end: string;
    isOff: boolean;
}

export function AttendanceManagement() {
    const [viewYear, setViewYear] = useState(2026);
    const [viewMonth, setViewMonth] = useState(2); // 2 = March
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCategory, setFilterCategory] = useState<string>("all");
    const [holidays, setHolidays] = useState<Record<string, string>>({});
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
        "正社員": true,
        "パートナー": true,
        "派遣": true
    });

    // Selection State for Bulk Edit
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
    const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());

    // 編集中のセル情報
    const [editingCell, setEditingCell] = useState<{ workerId: string, day: number } | null>(null);

    const c = useThemeColors();
    const raisedSurface = c.isDark ? "bg-[#171726]" : "bg-gray-100";
    const raisedSurfaceSoft = c.isDark ? "bg-[#151525]/95" : "bg-gray-100/90";
    const bodySurface = c.isDark ? "bg-[#0f1119]" : "bg-white";
    const hoverSurface = c.isDark ? "hover:bg-white/[0.06]" : "hover:bg-white";
    const hoverSubtle = c.isDark ? "hover:bg-white/[0.05]" : "hover:bg-gray-100";
    const dividerTone = c.isDark ? "bg-white/10" : "bg-gray-500/20";
    const popoverSurface = c.isDark ? "bg-[#151827]/95" : "bg-white/95";
    const inputClass = `w-full text-[15px] text-center border p-2 rounded-lg font-bold tabular-nums ${c.bgInput} ${c.borderCard} ${c.textPrimary} placeholder:text-gray-400 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20 outline-none`;
    const secondaryButtonClass = `${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:bg-gray-500/10`;

    // 祝日データの取得
    useEffect(() => {
        fetch("https://holidays-jp.github.io/api/v1/date.json")
            .then(res => res.json())
            .then(data => setHolidays(data))
            .catch(err => console.error("Failed to fetch holidays:", err));
    }, []);

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const dayHeaders = useMemo(() => {
        const headers = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dow = getDayOfWeek(viewYear, viewMonth, i);
            const holidayName = holidays[dateStr];
            headers.push({ day: i, dow, holidayName, dateStr });
        }
        return headers;
    }, [viewYear, viewMonth, daysInMonth, holidays]);

    const filteredWorkers = useMemo(() => {
        return INITIAL_WORKERS.filter(w => {
            const matchesSearch = (w.name?.includes(searchTerm) || w.id?.includes(searchTerm));
            const matchesCategory = filterCategory === "all" || w.category === filterCategory;
            return matchesSearch && matchesCategory;
        });
    }, [searchTerm, filterCategory]);

    const [monthlyShifts, setMonthlyShifts] = useState<Record<string, Record<number, ShiftData>>>(() => {
        const initial: Record<string, Record<number, ShiftData>> = {};
        INITIAL_WORKERS.forEach(w => {
            initial[w.id] = {};
            for (let i = 1; i <= 31; i++) {
                const dow = getDayOfWeek(2026, 2, i);
                const isWeekend = (dow === 0 || dow === 6);
                let start = "08:00", end = "17:00", isOff = isWeekend;
                if (w.category === "派遣") if (dow !== 1 && dow !== 3 && dow !== 5) isOff = true;
                if (w.category === "パートナー") { start = "09:00"; end = "15:00"; }
                initial[w.id][i] = { start, end, isOff };
            }
        });
        return initial;
    });

    const groupedWorkers = useMemo(() => {
        const groups: Record<string, Worker[]> = { "正社員": [], "パートナー": [], "派遣": [] };
        filteredWorkers.forEach(w => { if (groups[w.category]) groups[w.category].push(w); });
        return groups;
    }, [filteredWorkers]);

    const handleShiftUpdate = (workerId: string, day: number, updates: Partial<ShiftData>) => {
        setMonthlyShifts(prev => ({
            ...prev,
            [workerId]: { ...prev[workerId], [day]: { ...prev[workerId][day], ...updates } }
        }));
    };

    // Bulk Apply Logic
    const applyBulkShift = (start: string, end: string, isOff: boolean) => {
        setMonthlyShifts(prev => {
            const next = { ...prev };
            selectedWorkerIds.forEach(wId => {
                if (!next[wId]) next[wId] = {};
                selectedDays.forEach(day => {
                    next[wId][day] = { start, end, isOff };
                });
            });
            return next;
        });
        // Selection is maintained or cleared based on UX preference. Let's keep it for now.
    };

    const toggleWorkerSelection = (id: string) => {
        setSelectedWorkerIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleDaySelection = (day: number) => {
        setSelectedDays(prev => {
            const next = new Set(prev);
            if (next.has(day)) next.delete(day); else next.add(day);
            return next;
        });
    };

    const clearSelection = () => {
        setSelectedWorkerIds(new Set());
        setSelectedDays(new Set());
    };

    const getWorkerMonthlyTotal = (workerId: string) => {
        const shifts = monthlyShifts[workerId];
        if (!shifts) return 0;
        return Object.values(shifts).reduce((sum, s) => sum + (s.isOff ? 0 : calculateHours(s.start, s.end)), 0).toFixed(1);
    };

    const getDailyActiveCount = (day: number) => {
        return filteredWorkers.reduce((count, w) => {
            const shift = monthlyShifts[w.id]?.[day];
            return count + (shift && !shift.isOff ? 1 : 0);
        }, 0);
    };

    const toggleCategory = (cat: string) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

    const quickTemplates = [
        { label: "8-17", s: "08:00", e: "17:00" },
        { label: "9-15", s: "09:00", e: "15:00" },
        { label: "10-16", s: "10:00", e: "16:00" },
        { label: "13-22", s: "13:00", e: "22:00" },
    ];

    const SIDEBAR_WIDTH = "260px"; // Wider to accommodate checkbox
    const CELL_WIDTH = "65px";

    const isBulkActive = selectedWorkerIds.size > 0 && selectedDays.size > 0;

    return (
        <div className={`p-6 h-full flex flex-col overflow-hidden relative ${c.bg}`}>
            {/* Header */}
            <div className="flex items-center justify-end mb-4">
                <div className="flex items-center gap-3">
                    <button className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${c.borderCard} ${c.bgCard} ${c.textSecondary} text-[13px] transition-all font-medium ${hoverSubtle}`}>
                        <Download className="w-4 h-4" />エクスポート
                    </button>
                    <button className="flex items-center gap-2 px-6 py-2 rounded-lg bg-blue-600 text-white text-[13px] hover:bg-blue-500 transition-all shadow-lg font-bold">
                        <Save className="w-4 h-4" />計画を保存
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className={`mb-4 p-4 rounded-xl ${c.bgCard} border ${c.border} flex flex-wrap items-center justify-between gap-4 shadow-sm text-[13px]`}>
                <div className="flex items-center gap-6">
                    <div className={`flex items-center gap-1 p-1 rounded-lg ${c.bgSurface} border ${c.borderCard}`}>
                        <button onClick={() => setViewMonth(prev => prev === 0 ? 11 : prev - 1)} className={`p-1.5 rounded-md ${hoverSurface} ${c.textSecondary} transition-colors`}><ChevronLeft className="w-4 h-4" /></button>
                        <span className={`px-4 font-bold ${c.textPrimary} min-w-[100px] text-center`}>{viewYear}年 {viewMonth + 1}月</span>
                        <button onClick={() => setViewMonth(prev => prev === 11 ? 0 : prev + 1)} className={`p-1.5 rounded-md ${hoverSurface} ${c.textSecondary} transition-colors`}><ChevronRight className="w-4 h-4" /></button>
                    </div>
                    <div className="relative">
                        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${c.textMuted}`} />
                        <input type="text" placeholder="名前・IDで検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-[220px] ${c.bgInput} border ${c.borderCard} rounded-lg pl-10 pr-4 py-2 ${c.textPrimary} outline-none placeholder:text-gray-400 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20 transition-all`} />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className={`w-4 h-4 ${c.textMuted}`} />
                        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={`px-3 py-2 rounded-lg ${c.bgInput} border ${c.borderCard} ${c.textPrimary} outline-none cursor-pointer hover:border-cyan-500/30 transition-all`}>
                            <option value="all">全区分</option>
                            {Object.keys(groupedWorkers).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`text-[12px] ${c.textMuted}`}><span className={`font-bold mr-1 ${c.textSecondary}`}>{filteredWorkers.length}</span> 名表示中</div>
                    <div className={`h-4 w-[1px] ${dividerTone}`} />
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-500 border border-rose-600" /><span className={`text-[11px] ${c.textMuted}`}>土日祝日</span></div>
                    {isBulkActive && (
                        <button onClick={clearSelection} className="flex items-center gap-1.5 text-rose-500 font-bold hover:underline ml-4"><X className="w-3.5 h-3.5" />選択解除 ({selectedWorkerIds.size}名 × {selectedDays.size}日)</button>
                    )}
                </div>
            </div>

            {/* Monthly Grid Table */}
            <div className={`flex-1 ${c.bgCard} border ${c.border} rounded-xl overflow-hidden shadow-md flex flex-col`}>
                <div className={`flex-1 overflow-auto ${bodySurface} custom-scrollbar`}>
                    <table className="w-full text-left border-separate border-spacing-0" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
                        <thead className="sticky top-0 z-40">
                            <tr>
                                <th className={`p-4 ${raisedSurface} border-b border-r ${c.border} sticky left-0 z-50 text-[12px] ${c.textMuted} font-bold uppercase tracking-wider`} style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }}>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => {
                                                if (selectedWorkerIds.size === filteredWorkers.length) setSelectedWorkerIds(new Set());
                                                else setSelectedWorkerIds(new Set(filteredWorkers.map(w => w.id)));
                                            }}
                                            className={`${c.textMuted} hover:text-cyan-500`}
                                        >
                                            {selectedWorkerIds.size === filteredWorkers.length ? <CheckSquare className="w-4 h-4 text-cyan-500" /> : <Square className="w-4 h-4" />}
                                        </button>
                                        作業員・区分
                                    </div>
                                </th>
                                {dayHeaders.map((h) => {
                                    const isRed = h.dow === 0 || h.dow === 6 || !!h.holidayName;
                                    const isSelected = selectedDays.has(h.day);
                                    return (
                                        <th
                                            key={h.day}
                                            onClick={() => toggleDaySelection(h.day)}
                                            className={`p-2 border-b border-r ${c.border} text-center cursor-pointer transition-all ${
                                                isSelected
                                                    ? "bg-cyan-500/20"
                                                    : isRed
                                                        ? "bg-rose-500/5 font-bold"
                                                        : c.isDark
                                                            ? "bg-[#171726] hover:bg-white/[0.05]"
                                                            : "bg-gray-50 hover:bg-gray-100"
                                            }`}
                                            style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span className={`text-[14px] font-bold ${
                                                    isSelected
                                                        ? (c.isDark ? "text-cyan-300" : "text-cyan-600")
                                                        : isRed
                                                            ? (c.isDark ? "text-rose-300" : "text-rose-600 shadow-sm")
                                                            : c.textPrimary
                                                }`}>{h.day}</span>
                                                <span className={`text-[10px] ${
                                                    isSelected
                                                        ? (c.isDark ? "text-cyan-300/70" : "text-cyan-600/60")
                                                        : isRed
                                                            ? (c.isDark ? "text-rose-300/80" : "text-rose-500")
                                                            : c.textDimmed
                                                }`}>{["日", "月", "火", "水", "木", "金", "土"][h.dow]}</span>
                                            </div>
                                        </th>
                                    );
                                })}
                                <th className={`p-4 ${raisedSurface} border-b ${c.border} text-center sticky right-0 z-50 text-[11px] ${c.textMuted} font-bold`} style={{ width: '80px', minWidth: '80px' }}>月間計</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.keys(groupedWorkers).map(cat => {
                                const workersInCat = groupedWorkers[cat];
                                const isExpanded = expandedCategories[cat];
                                if (workersInCat.length === 0) return null;
                                return (
                                    <React.Fragment key={cat}>
                                        <tr className={`bg-gray-500/5 cursor-pointer ${c.isDark ? "hover:bg-white/[0.05]" : "hover:bg-gray-500/10"} transition-colors`} onClick={() => toggleCategory(cat)}>
                                            <td className={`p-2 border-b border-r ${c.border} sticky left-0 z-30 ${raisedSurfaceSoft} backdrop-blur-md`} style={{ width: SIDEBAR_WIDTH }}>
                                                <div className="flex items-center gap-2 px-1 ml-7">
                                                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                                                    <span className={`text-[12px] font-bold ${c.textPrimary}`}>{cat} ({workersInCat.length}名)</span>
                                                </div>
                                            </td>
                                            {dayHeaders.map(h => <td key={h.day} className={`border-b border-r ${c.border} bg-gray-500/5 ${selectedDays.has(h.day) ? "bg-cyan-500/10" : ""}`}></td>)}
                                            <td className={`border-b ${c.border} sticky right-0 z-30 ${raisedSurfaceSoft}`}></td>
                                        </tr>
                                        {isExpanded && workersInCat.map((worker) => {
                                            const isRowSelected = selectedWorkerIds.has(worker.id);
                                            return (
                                                <tr key={worker.id} className={`group transition-colors ${isRowSelected ? "bg-cyan-500/[0.03]" : c.isDark ? "hover:bg-white/[0.03]" : "hover:bg-gray-500/[0.02]"}`}>
                                                    <td className={`p-2 border-b border-r ${c.border} sticky left-0 z-20 ${c.bgCard} transition-colors ${c.isDark ? "group-hover:bg-white/[0.04]" : "group-hover:bg-gray-500/[0.04]"}`} style={{ width: SIDEBAR_WIDTH }}>
                                                        <div className="flex items-center gap-3 px-1">
                                                            <button onClick={() => toggleWorkerSelection(worker.id)} className={`transition-colors ${isRowSelected ? "text-cyan-500" : c.isDark ? "text-gray-600 hover:text-gray-300" : "text-gray-300 hover:text-gray-400"}`}>
                                                                {isRowSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                            </button>
                                                            <div className={`w-9 h-9 rounded-full ${worker.color} flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-sm`}>{worker.initials}</div>
                                                            <div className="min-w-0">
                                                                <div className={`text-[14px] ${c.textPrimary} font-bold truncate leading-none`}>{worker.name}</div>
                                                                <div className={`text-[11px] ${c.textMuted} truncate mt-1`}>ID:{worker.id}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    {dayHeaders.map((h) => {
                                                        const shift = monthlyShifts[worker.id]?.[h.day];
                                                        const isRed = h.dow === 0 || h.dow === 6 || !!h.holidayName;
                                                        const isEditing = editingCell?.workerId === worker.id && editingCell?.day === h.day;
                                                        const isSelectedCell = isRowSelected || selectedDays.has(h.day);
                                                        const isIntersected = isRowSelected && selectedDays.has(h.day);
                                                        const hasPlan = shift && !shift.isOff;
                                                        return (
                                                            <td key={h.day} className={`p-0 border-b border-r ${c.border} text-center relative ${isIntersected ? "bg-cyan-500/15" : isSelectedCell ? "bg-cyan-500/5" : isRed ? "bg-rose-500/[0.04]" : ""}`} style={{ width: CELL_WIDTH }}>
                                                                {isEditing ? (
                                                                    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] p-4 ${popoverSurface} border-2 border-cyan-500 shadow-2xl rounded-xl w-[210px] flex flex-col gap-4 animate-in fade-in zoom-in duration-200 backdrop-blur-md`}>
                                                                        <div className={`flex items-center justify-between border-b pb-2 ${c.borderCard}`}><span className={`text-[13px] font-bold ${c.textSecondary}`}>{h.day}日のシフト</span><button onClick={() => setEditingCell(null)} className={`p-1 rounded-full transition-colors ${hoverSubtle}`}><X className={`w-4 h-4 ${c.textMuted}`} /></button></div>
                                                                        <div className="flex items-center gap-2 w-full justify-between">
                                                                            <div className="flex flex-col gap-1 flex-1"><span className={`text-[10px] ${c.textMuted} uppercase font-bold text-center`}>開始</span><input type="text" value={shift?.start} onChange={(e) => handleShiftUpdate(worker.id, h.day, { start: e.target.value, isOff: false })} className={inputClass} /></div>
                                                                            <div className={`pt-4 ${c.textMuted} font-bold`}>~</div>
                                                                            <div className="flex flex-col gap-1 flex-1"><span className={`text-[10px] ${c.textMuted} uppercase font-bold text-center`}>終了</span><input type="text" value={shift?.end} onChange={(e) => handleShiftUpdate(worker.id, h.day, { end: e.target.value, isOff: false })} className={inputClass} /></div>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 gap-2 mt-1">{quickTemplates.map(t => (<button key={t.label} onClick={() => handleShiftUpdate(worker.id, h.day, { start: t.s, end: t.e, isOff: false })} className={`text-[11px] font-bold py-2 rounded-lg transition-all border shadow-sm hover:bg-cyan-500 hover:text-white hover:border-cyan-600 ${secondaryButtonClass}`}>{t.label}</button>))}</div>
                                                                        <div className={`flex items-center gap-2 mt-2 pt-2 border-t ${c.borderCard}`}><button onClick={() => handleShiftUpdate(worker.id, h.day, { isOff: !shift?.isOff })} className={`flex-1 flex items-center justify-center gap-2 text-[12px] font-bold py-2.5 px-3 border rounded-lg transition-all ${shift?.isOff ? "bg-rose-500 text-white border-rose-600 shadow-lg" : `${secondaryButtonClass} hover:border-rose-400 hover:text-rose-500`}`}><CalendarX className="w-4 h-4" />{shift?.isOff ? "公休 (設定中)" : "公休に設定"}</button><button onClick={() => setEditingCell(null)} className="flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 rounded-lg shadow-lg transition-all active:scale-95"><CheckCircle2 className="w-5 h-5" /></button></div>
                                                                    </div>
                                                                ) : (
                                                                    <button className={`w-full h-full min-h-[50px] flex flex-col items-center justify-center hover:bg-cyan-500/10 transition-colors py-2 gap-0.5`} onClick={() => setEditingCell({ workerId: worker.id, day: h.day })}>
                                                                        {hasPlan ? (<><span className={`text-[12px] font-bold tabular-nums ${c.textPrimary}`}>{shift.start}</span><span className={`text-[12px] font-bold tabular-nums ${c.textPrimary}`}>{shift.end}</span></>) : shift?.isOff ? (<span className="text-[13px] font-black text-rose-500/40">休</span>) : (<span className={`${c.textDimmed} text-[12px]`}>-</span>)}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className={`p-2 border-b text-center sticky right-0 z-20 ${c.bgCard} font-bold text-[14px] ${c.textPrimary} border-l ${c.border} shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.15)] ${isRowSelected ? "bg-cyan-500/[0.02]" : ""}`}>{getWorkerMonthlyTotal(worker.id)}<span className={`text-[11px] font-normal ml-0.5 ${c.textMuted}`}>h</span></td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                        <tfoot className="sticky bottom-0 z-40">
                            <tr className={`${raisedSurface} shadow-[0_-6px_15px_rgba(0,0,0,0.12)]`}>
                                <td className={`p-3 border-t border-r ${c.border} sticky left-0 z-50 ${raisedSurface} text-[13px] font-bold ${c.textSecondary}`} style={{ width: SIDEBAR_WIDTH }}>出勤人数 (Capacity)</td>
                                {dayHeaders.map(h => {
                                    const count = getDailyActiveCount(h.day);
                                    return (<td key={h.day} className={`p-2 border-t border-r ${c.border} text-center font-black ${selectedDays.has(h.day) ? "bg-cyan-500/10" : ""}`} style={{ width: CELL_WIDTH }}><div className={`text-[15px] ${count > 0 ? (c.isDark ? "text-cyan-300" : "text-cyan-600 shadow-sm") : c.textDimmed}`}>{count}</div></td>);
                                })}
                                <td className={`p-3 border-t ${c.border} sticky right-0 z-50 ${raisedSurface} shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.15)]`} style={{ width: '80px' }}></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Bulk Action Toolbar - Floating */}
                {isBulkActive && (
                    <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-[100] ${popoverSurface} border-2 border-cyan-500 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-2xl p-4 flex items-center gap-6 animate-in slide-in-from-bottom-4 duration-300 backdrop-blur-md`}>
                        <div className={`flex flex-col border-r pr-6 ${c.borderCard}`}>
                            <div className={`flex items-center gap-2 ${c.isDark ? "text-cyan-400" : "text-cyan-600"} mb-1`}>
                                <Zap className="w-4 h-4 fill-cyan-500" />
                                <span className="text-[12px] font-black uppercase tracking-wider">一括編集モード</span>
                            </div>
                            <span className={`text-[11px] ${c.textSecondary} font-bold whitespace-nowrap`}>{selectedWorkerIds.size}名 × {selectedDays.size}日分を選択中</span>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex flex-col gap-1 items-center">
                                <span className={`text-[10px] ${c.textMuted} font-bold`}>共通シフト</span>
                                <div className="flex items-center gap-3">
                                    {quickTemplates.map(t => (
                                        <button
                                            key={t.label}
                                            onClick={() => applyBulkShift(t.s, t.e, false)}
                                            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all shadow-sm active:scale-95 ${c.isDark ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-200" : "bg-cyan-50 border border-cyan-200 text-cyan-700"} hover:bg-cyan-500 hover:text-white`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={`h-10 w-[1px] ${dividerTone}`} />

                            <button
                                onClick={() => applyBulkShift("", "", true)}
                                className="flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 rounded-lg text-[13px] font-bold hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                            >
                                <CalendarX className="w-4 h-4" /> 一括公休
                            </button>

                            <button
                                onClick={clearSelection}
                                className={`p-2 ${c.textMuted} ${c.isDark ? "hover:text-gray-200" : "hover:text-gray-600"} transition-colors`}
                                title="キャンセル"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer Legend */}
                <div className={`px-6 py-4 border-t ${c.border} ${raisedSurface} flex items-center justify-between text-[12px]`}>
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-2">
                            <span className="text-rose-600 font-bold text-[14px]">● 休日</span>
                            <span className={c.textSecondary}>公休・日祝は赤系</span>
                        </div>
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${c.bgCard} ${c.isDark ? "text-cyan-300" : "text-cyan-600"} font-bold shadow-sm`}>
                            <Info className="w-4 h-4" />
                            <span>左上のチェックや日付クリックで範囲選択 → 一括編集が可能</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


