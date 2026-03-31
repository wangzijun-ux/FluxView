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
    Edit3,
    ChevronDown,
    ChevronRight as ChevronRightIcon,
    Info,
    X,
    CalendarX,
    CheckSquare,
    Square,
    Zap,
    Upload,
    Plus,
    Trash2,
    Copy,
    Star,
    CheckCircle2,
    AlertTriangle,
} from "lucide-react";
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { useThemeColors } from "./ThemeContext";
import { useMasterData } from "./MasterDataContext";
import { buildDeploymentWorkflows } from "./fieldDeploymentStore";
import {
    readAttendanceWorkers,
    type AttendanceWorker as Worker
} from "./workforceStore";
import {
    createDefaultMonthlyShifts,
    readAttendanceMonthShifts,
    readAttendanceTemplates,
    writeAttendanceMonthShifts,
    writeAttendanceTemplates,
    type AttendanceTemplateStore,
    type MonthlyShifts,
    type ShiftBreakAssignment,
    type ShiftData,
    type ShiftTemplate,
} from "./attendanceStore";
import { buildStepPlanDefaults, readProgressPlanStore, resolveStepPlanValues } from "./progressPlanStore";
import { readUsersFromStorage, type User } from "./userStore";

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
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 24 * 60;
    return Math.max(0, diff / 60);
};

const calculateBreakHoursFromAssignments = (breaks: ShiftBreakAssignment[] = []) =>
    breaks.reduce((sum, breakItem) => sum + calculateHours(breakItem.start, breakItem.end), 0);

const cloneShiftBreaks = (breaks: ShiftBreakAssignment[] = []) => breaks.map((breakItem) => ({ ...breakItem }));

const normalizeImportedMonthlyShifts = (
    value: unknown,
    year: number,
    month: number,
    workers: Worker[],
): MonthlyShifts => {
    const defaults = createDefaultMonthlyShifts(year, month, workers);
    let candidate = value;

    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        const record = candidate as Record<string, unknown>;
        if (record.monthlyShifts && typeof record.monthlyShifts === "object") {
            candidate = record.monthlyShifts;
        } else if (record.shifts && typeof record.shifts === "object") {
            candidate = record.shifts;
        }
    }

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        throw new Error("invalid-shift-format");
    }

    const imported = candidate as Record<string, Record<string | number, Partial<ShiftData>>>;

    return Object.fromEntries(
        Object.entries(defaults).map(([workerId, dayMap]) => [
            workerId,
            Object.fromEntries(
                Object.entries(dayMap).map(([day, shift]) => {
                    const incoming = imported[workerId]?.[day] ?? imported[workerId]?.[Number(day)];
                    return [
                        Number(day),
                        incoming && typeof incoming === "object"
                            ? {
                                start: typeof incoming.start === "string" ? incoming.start : shift.start,
                                end: typeof incoming.end === "string" ? incoming.end : shift.end,
                                isOff: typeof incoming.isOff === "boolean" ? incoming.isOff : shift.isOff,
                                templateId:
                                    typeof incoming.templateId === "string"
                                        ? incoming.templateId
                                        : incoming.templateId === null
                                            ? null
                                            : (shift.templateId ?? null),
                                breaks: Array.isArray(incoming.breaks)
                                    ? cloneShiftBreaks(incoming.breaks as ShiftBreakAssignment[])
                                    : cloneShiftBreaks(shift.breaks ?? []),
                                adjustment:
                                    incoming.adjustment && typeof incoming.adjustment === "object"
                                        ? {
                                            kind:
                                                incoming.adjustment.kind === "late" ||
                                                incoming.adjustment.kind === "overtime" ||
                                                incoming.adjustment.kind === "earlyLeave" ||
                                                incoming.adjustment.kind === "absence" ||
                                                incoming.adjustment.kind === "handoff"
                                                    ? incoming.adjustment.kind
                                                    : "none",
                                            note: typeof incoming.adjustment.note === "string" ? incoming.adjustment.note : shift.adjustment?.note ?? "",
                                            plannedStart:
                                                typeof incoming.adjustment.plannedStart === "string"
                                                    ? incoming.adjustment.plannedStart
                                                    : shift.adjustment?.plannedStart ?? shift.start,
                                            plannedEnd:
                                                typeof incoming.adjustment.plannedEnd === "string"
                                                    ? incoming.adjustment.plannedEnd
                                                    : shift.adjustment?.plannedEnd ?? shift.end,
                                        }
                                        : (shift.adjustment ?? {
                                            kind: "none",
                                            note: "",
                                            plannedStart: shift.start,
                                            plannedEnd: shift.end,
                                        }),
                            }
                            : shift,
                    ];
                }),
            ),
        ]),
    );
};

type EditingCellState = {
    workerId: string;
    day: number;
    anchorRect: {
        top: number;
        left: number;
        bottom: number;
        right: number;
        width: number;
        height: number;
    };
};

const EDITOR_PANEL_WIDTH = 292;
const EDITOR_PANEL_HEIGHT = 440;
const EDITOR_PANEL_MARGIN = 12;
type EditorShiftTab = "plan" | "adjustment";
type ShiftAdjustmentKind = "none" | "late" | "overtime" | "earlyLeave" | "absence" | "handoff";
const SHIFT_ADJUSTMENT_OPTIONS: Array<{ kind: Exclude<ShiftAdjustmentKind, "none">; label: string }> = [
    { kind: "late", label: "遅刻" },
    { kind: "overtime", label: "延長" },
    { kind: "earlyLeave", label: "早退" },
    { kind: "absence", label: "欠勤" },
    { kind: "handoff", label: "担当変更" },
];

const createShiftEditorDraft = (shift?: ShiftData): ShiftData => ({
    start: shift?.start ?? "",
    end: shift?.end ?? "",
    isOff: shift?.isOff ?? false,
    templateId: shift?.templateId ?? null,
    breaks: cloneShiftBreaks(shift?.breaks ?? []),
    adjustment: shift?.adjustment
        ? { ...shift.adjustment }
        : {
            kind: "none",
            note: "",
            plannedStart: shift?.start ?? "",
            plannedEnd: shift?.end ?? "",
        },
});

type BulkShiftDraft = {
    templateId: string | null;
    start: string;
    end: string;
    isOff: boolean;
    breaks: ShiftBreakAssignment[];
};

const createBulkShiftDraft = (template?: ShiftTemplate): BulkShiftDraft => ({
    templateId: template?.id ?? null,
    start: template?.start ?? "",
    end: template?.end ?? "",
    isOff: false,
    breaks: cloneShiftBreaks(template?.breaks ?? []),
});

const captureAnchorRect = (rect: DOMRect) => ({
    top: rect.top,
    left: rect.left,
    bottom: rect.bottom,
    right: rect.right,
    width: rect.width,
    height: rect.height,
});

const getEditorPopoverStyle = (anchorRect: EditingCellState["anchorRect"]) => {
    if (typeof window === "undefined") {
        return { position: "fixed" as const };
    }

    const preferredLeft = anchorRect.left + (anchorRect.width / 2) - (EDITOR_PANEL_WIDTH / 2);
    const maxLeft = Math.max(EDITOR_PANEL_MARGIN, window.innerWidth - EDITOR_PANEL_WIDTH - EDITOR_PANEL_MARGIN);
    const left = Math.min(Math.max(EDITOR_PANEL_MARGIN, preferredLeft), maxLeft);

    const fitsBelow = anchorRect.bottom + EDITOR_PANEL_HEIGHT + EDITOR_PANEL_MARGIN <= window.innerHeight;
    const preferredTop = fitsBelow
        ? anchorRect.bottom + 8
        : anchorRect.top - EDITOR_PANEL_HEIGHT - 8;
    const maxTop = Math.max(EDITOR_PANEL_MARGIN, window.innerHeight - EDITOR_PANEL_HEIGHT - EDITOR_PANEL_MARGIN);
    const top = Math.min(Math.max(EDITOR_PANEL_MARGIN, preferredTop), maxTop);

    return {
        position: "fixed" as const,
        top: `${top}px`,
        left: `${left}px`,
        width: `${EDITOR_PANEL_WIDTH}px`,
    };
};

const ANALYSIS_SLOT_STARTS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] as const;
const DAY_VIEW_START_MINUTES = 0;
const DAY_VIEW_END_MINUTES = 24 * 60;
const SHIFT_SETUP_CLEANUP_HOURS = 0.5;
const DEFAULT_SHIFT_RECOMMENDATION_HOURS = 8;
const MIN_SHIFT_RECOMMENDATION_HOURS = 4;

type ShiftAnalysisWorker = {
    user: User;
    worker: Worker;
    shift: ShiftData;
    grossHours: number;
    effectiveHours: number;
    capabilityKeys: Set<string>;
};

type AnalysisStepRow = {
    workflowName: string;
    shipperName: string;
    processName: string;
    planned: number;
    uph: number;
    requiredPersonHours: number;
    theoreticalHeadcount: number;
    startMinutes: number;
    endMinutes: number;
    requiredLabels: string[];
    capabilityKeys: string[];
};

type AnalysisTimeSlot = {
    label: string;
    startMinutes: number;
    endMinutes: number;
    requiredHeadcount: number;
    availableHeadcount: number;
    diff: number;
};

type DayViewGranularity = 15 | 30 | 60;

type ScheduledShiftRange = {
    workerId: string;
    workerName: string;
    startMinutes: number;
    endMinutes: number;
    capabilityKeys: Set<string>;
};

type AnalysisDayViewSlot = {
    label: string;
    startMinutes: number;
    endMinutes: number;
    requiredHeadcount: number;
    availableHeadcount: number;
    diff: number;
    activeProcesses: string[];
};

type CapabilityGapRow = {
    key: string;
    label: string;
    type: "skill" | "qualification";
    needed: number;
    available: number;
    shortage: number;
    slotRows: Array<{
        startMinutes: number;
        endMinutes: number;
        shortage: number;
    }>;
};

type DispatchRecommendation = {
    id: string;
    title: string;
    description: string;
    count: number;
    unitPrice: number;
    startMinutes: number;
    endMinutes: number;
    estimatedCost: number;
};

const DAY_VIEW_GRANULARITY_OPTIONS: DayViewGranularity[] = [15, 30, 60];

function toDateKey(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTime(value: string) {
    const [hours, minutes] = value.split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

function formatTimeLabel(totalMinutes: number) {
    const safeMinutes = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function overlapMinutes(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
    return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
}

function calculateBreakHours(totalHours: number) {
    if (totalHours >= 8) return 1;
    if (totalHours >= 6) return 0.75;
    if (totalHours >= 4) return 0.25;
    return 0;
}

function calculateEffectiveShiftHours(start: string, end: string, breaks: ShiftBreakAssignment[] = []) {
    const grossHours = calculateHours(start, end);
    if (grossHours <= 0) return 0;
    const configuredBreakHours = calculateBreakHoursFromAssignments(breaks);
    const breakHours = configuredBreakHours > 0 ? configuredBreakHours : calculateBreakHours(grossHours);
    return Number(Math.max(0, grossHours - breakHours - SHIFT_SETUP_CLEANUP_HOURS).toFixed(1));
}

function formatSignedCount(value: number) {
    const rounded = Math.round(value);
    if (rounded === 0) return "0";
    return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function formatHourValue(value: number) {
    return `${value.toFixed(1)}h`;
}

function clampDay(day: number, daysInMonth: number) {
    return Math.min(Math.max(day, 1), Math.max(daysInMonth, 1));
}

function buildRecommendedWindow(slotRows: Array<{ startMinutes: number; endMinutes: number; shortage: number }>) {
    const shortageRows = slotRows.filter((row) => row.shortage > 0);
    if (shortageRows.length === 0) {
        return {
            startMinutes: 10 * 60,
            endMinutes: 10 * 60 + DEFAULT_SHIFT_RECOMMENDATION_HOURS * 60,
        };
    }

    const startMinutes = shortageRows[0].startMinutes;
    const rawEndMinutes = shortageRows[shortageRows.length - 1].endMinutes;
    return {
        startMinutes,
        endMinutes: Math.min(22 * 60, Math.max(rawEndMinutes, startMinutes + MIN_SHIFT_RECOMMENDATION_HOURS * 60)),
    };
}

function floorToGranularity(totalMinutes: number, granularity: DayViewGranularity) {
    return Math.floor(totalMinutes / granularity) * granularity;
}

function ceilToGranularity(totalMinutes: number, granularity: DayViewGranularity) {
    return Math.ceil(totalMinutes / granularity) * granularity;
}

function formatHeadcountValue(value: number) {
    const rounded = Number(value.toFixed(1));
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function expandScheduledShiftRanges(worker: ShiftAnalysisWorker): ScheduledShiftRange[] {
    if (!worker.shift.start || !worker.shift.end) return [];

    const startMinutes = parseTime(worker.shift.start);
    const endMinutes = parseTime(worker.shift.end);
    const baseRange = {
        workerId: worker.worker.id,
        workerName: worker.worker.name,
        capabilityKeys: worker.capabilityKeys,
    };

    if (endMinutes <= startMinutes) {
        return [
            {
                ...baseRange,
                startMinutes,
                endMinutes: DAY_VIEW_END_MINUTES,
            },
            ...(endMinutes > DAY_VIEW_START_MINUTES
                ? [
                    {
                        ...baseRange,
                        startMinutes: DAY_VIEW_START_MINUTES,
                        endMinutes,
                    },
                ]
                : []),
        ];
    }

    return [
        {
            ...baseRange,
            startMinutes,
            endMinutes,
        },
    ];
}

function countAvailableWorkers(
    scheduledShiftRanges: ScheduledShiftRange[],
    startMinutes: number,
    endMinutes: number,
    capabilityKey?: string,
) {
    return new Set(
        scheduledShiftRanges
            .filter((worker) =>
                overlapMinutes(startMinutes, endMinutes, worker.startMinutes, worker.endMinutes) > 0 &&
                (!capabilityKey || worker.capabilityKeys.has(capabilityKey)),
            )
            .map((worker) => worker.workerId),
    ).size;
}

function buildDayViewSlotRows(
    stepRows: AnalysisStepRow[],
    scheduledShiftRanges: ScheduledShiftRange[],
    granularity: DayViewGranularity,
) {
    const relevantStarts = [
        ...stepRows.map((row) => row.startMinutes),
        ...scheduledShiftRanges.map((row) => row.startMinutes),
    ];
    const relevantEnds = [
        ...stepRows.map((row) => row.endMinutes),
        ...scheduledShiftRanges.map((row) => row.endMinutes),
    ];

    if (relevantStarts.length === 0 || relevantEnds.length === 0) return [] satisfies AnalysisDayViewSlot[];

    const rangeStart = DAY_VIEW_START_MINUTES;
    const rangeEnd = DAY_VIEW_END_MINUTES;
    const slotHours = granularity / 60;
    const rows: AnalysisDayViewSlot[] = [];

    for (let startMinutes = rangeStart; startMinutes < rangeEnd; startMinutes += granularity) {
        const endMinutes = startMinutes + granularity;
        const requiredHeadcount = Number(
            stepRows
                .reduce((sum, row) => {
                    const overlapHours = overlapMinutes(startMinutes, endMinutes, row.startMinutes, row.endMinutes) / 60;
                    if (overlapHours <= 0) return sum;
                    return sum + (row.theoreticalHeadcount * overlapHours) / slotHours;
                }, 0)
                .toFixed(1),
        );
        const availableHeadcount = countAvailableWorkers(scheduledShiftRanges, startMinutes, endMinutes);
        const activeProcesses = [...new Set(
            stepRows
                .filter((row) => overlapMinutes(startMinutes, endMinutes, row.startMinutes, row.endMinutes) > 0)
                .map((row) => row.processName),
        )];

        rows.push({
            label: `${formatTimeLabel(startMinutes)}-${formatTimeLabel(endMinutes)}`,
            startMinutes,
            endMinutes,
            requiredHeadcount,
            availableHeadcount,
            diff: Number((availableHeadcount - requiredHeadcount).toFixed(1)),
            activeProcesses,
        });
    }

    return rows;
}

export function AttendanceManagement() {
    const cellEditorPopoverRef = React.useRef<HTMLDivElement | null>(null);
    const [viewYear, setViewYear] = useState(2026);
    const [viewMonth, setViewMonth] = useState(2); // 2 = March
    const [activeTab, setActiveTab] = useState<"table" | "dayView" | "templates">("table");
    const [dayViewGranularity, setDayViewGranularity] = useState<DayViewGranularity>(30);
    const today = new Date();
    const [analysisDay, setAnalysisDay] = useState(() =>
        today.getFullYear() === 2026 && today.getMonth() === 2 ? today.getDate() : 1,
    );
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
    const [selectedCellKeys, setSelectedCellKeys] = useState<Set<string>>(new Set());

    // 編集中のセル情報
    const [editingCell, setEditingCell] = useState<EditingCellState | null>(null);
    const [editorShiftTab, setEditorShiftTab] = useState<EditorShiftTab>("plan");
    const [editingShiftDraft, setEditingShiftDraft] = useState<ShiftData | null>(null);
    const [bulkShiftDraft, setBulkShiftDraft] = useState<BulkShiftDraft | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
    const [importFeedback, setImportFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

    const c = useThemeColors();
    const { selectedSiteId, sites, workflows, shippers, processes, dispatchCompanies, qualifications, skills } = useMasterData();
    const raisedSurface = c.isDark ? "bg-[#171726]" : "bg-gray-100";
    const raisedSurfaceSoft = c.isDark ? "bg-[#151525]/95" : "bg-gray-100/90";
    const bodySurface = c.isDark ? "bg-[#0f1119]" : "bg-white";
    const hoverSurface = c.isDark ? "hover:bg-white/[0.06]" : "hover:bg-white";
    const hoverSubtle = c.isDark ? "hover:bg-white/[0.05]" : "hover:bg-gray-100";
    const dividerTone = c.isDark ? "bg-white/10" : "bg-gray-500/20";
    const popoverSurface = c.isDark ? "bg-[#151827]/95" : "bg-white/95";
    const inputClass = `w-full text-[15px] text-center border p-2 rounded-lg font-bold tabular-nums ${c.bgInput} ${c.borderCard} ${c.textPrimary} placeholder:text-gray-400 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20 outline-none`;
    const secondaryButtonClass = `${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:bg-gray-500/10`;
    const tabButtonClass = (tab: "table" | "dayView" | "templates") =>
        `flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all ${
            activeTab === tab
                ? "bg-[#155DFC] text-white shadow-sm"
                : `${c.textSecondary} hover:bg-[#155DFC]/10 hover:text-[#155DFC]`
        }`;
    const holidayColumnHeaderClass = c.isDark ? "bg-[#171726]" : "bg-white";
    const holidayColumnCellClass = "";
    const getDayNumberClass = (dow: number, isSelected: boolean, holidayName?: string) => {
        if (holidayName) return "text-amber-600";
        if (dow === 0) return "text-rose-600";
        if (dow === 6) return "text-blue-600";
        return c.isDark ? "text-slate-100" : "text-slate-900";
    };
    const getDayLabelClass = (dow: number, isSelected: boolean, holidayName?: string) => {
        if (holidayName) return "text-amber-500";
        if (dow === 0) return "text-rose-500";
        if (dow === 6) return "text-blue-500";
        return c.isDark ? "text-slate-300" : "text-slate-700";
    };
    const attendanceWorkers = useMemo(() => readAttendanceWorkers(), []);
    const users = useMemo(
        () => readUsersFromStorage(),
        [dispatchCompanies, qualifications, skills],
    );

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
        return attendanceWorkers.filter(w => {
            const matchesSearch = (w.name?.includes(searchTerm) || w.id?.includes(searchTerm));
            const matchesCategory = filterCategory === "all" || w.category === filterCategory;
            return matchesSearch && matchesCategory;
        });
    }, [attendanceWorkers, searchTerm, filterCategory]);

    const [monthlyShifts, setMonthlyShifts] = useState<MonthlyShifts>(() =>
        readAttendanceMonthShifts(2026, 2, attendanceWorkers)
    );
    const [attendanceTemplates, setAttendanceTemplates] = useState<AttendanceTemplateStore>(() => readAttendanceTemplates());

    useEffect(() => {
        setMonthlyShifts(readAttendanceMonthShifts(viewYear, viewMonth, attendanceWorkers));
    }, [attendanceWorkers, viewYear, viewMonth]);

    useEffect(() => {
        writeAttendanceMonthShifts(viewYear, viewMonth, monthlyShifts);
    }, [viewYear, viewMonth, monthlyShifts]);

    useEffect(() => {
        writeAttendanceTemplates(attendanceTemplates);
    }, [attendanceTemplates]);

    useEffect(() => {
        setAnalysisDay(prev => clampDay(prev, daysInMonth));
    }, [daysInMonth]);

    const selectedSite = useMemo(
        () => sites.find(site => site.id === selectedSiteId) ?? null,
        [sites, selectedSiteId],
    );
    const analysisDateKey = useMemo(
        () => toDateKey(viewYear, viewMonth, clampDay(analysisDay, daysInMonth)),
        [viewYear, viewMonth, analysisDay, daysInMonth],
    );
    const analysisData = useMemo(() => {
        const dayStore = readProgressPlanStore()[analysisDateKey];
        const scopedWorkflows = workflows.filter(workflow => !selectedSiteId || workflow.siteId === selectedSiteId);
        const workflowViews = buildDeploymentWorkflows(scopedWorkflows, shippers, sites, processes);
        const skillNameById = new Map(skills.map(skill => [skill.id, skill.name]));
        const qualificationNameById = new Map(qualifications.map(qualification => [qualification.id, qualification.name]));
        const skillIdByName = new Map(skills.map(skill => [skill.name, skill.id]));
        const qualificationIdByName = new Map(qualifications.map(qualification => [qualification.name, qualification.id]));
        const workerByUserId = new Map(attendanceWorkers.map(worker => [worker.userId, worker]));

        const scheduledWorkers = users
            .map((user) => {
                const worker = workerByUserId.get(user.id);
                if (!worker) return null;

                const shift = monthlyShifts[worker.id]?.[analysisDay];
                if (!shift || shift.isOff || worker.status !== "active") return null;

                const capabilityKeys = new Set<string>([
                    ...user.skills.flatMap(skill => {
                        const skillId = skillIdByName.get(skill.name);
                        return skillId ? [`skill:${skillId}`] : [];
                    }),
                    ...user.certifications.flatMap(certification => {
                        const qualificationId = qualificationIdByName.get(certification.name);
                        return qualificationId ? [`qualification:${qualificationId}`] : [];
                    }),
                ]);

                return {
                    user,
                    worker,
                    shift,
                    grossHours: calculateHours(shift.start, shift.end),
                    effectiveHours: calculateEffectiveShiftHours(shift.start, shift.end, shift.breaks ?? []),
                    capabilityKeys,
                } satisfies ShiftAnalysisWorker;
            })
            .filter((candidate): candidate is ShiftAnalysisWorker => Boolean(candidate));

        const scheduledShiftRanges = scheduledWorkers.flatMap((worker) =>
            expandScheduledShiftRanges(worker),
        ) satisfies ScheduledShiftRange[];

        const stepRows = workflowViews.flatMap((workflow, workflowIndex) =>
            workflow.steps.map((step, stepIndex) => {
                const defaults = buildStepPlanDefaults(workflowIndex, stepIndex, step.headcount, step.uph);
                const plan = resolveStepPlanValues(dayStore, step.id, {
                    planned: defaults.planned,
                    startTime: step.startTime,
                    targetEndTime: step.targetEndTime,
                });
                const startMinutes = parseTime(plan.startTime);
                const endMinutes = Math.max(startMinutes + 60, parseTime(plan.targetEndTime));
                const durationHours = Math.max(1, (endMinutes - startMinutes) / 60);
                const requiredPersonHours = Number((plan.planned / Math.max(step.uph, 1)).toFixed(1));
                const theoreticalHeadcount = Number((requiredPersonHours / durationHours).toFixed(1));
                const requiredLabels = [
                    ...step.requiredQualificationIds.flatMap(id => qualificationNameById.get(id) ?? []),
                    ...step.requiredSkillIds.flatMap(id => skillNameById.get(id) ?? []),
                ];

                return {
                    workflowName: workflow.workflowName,
                    shipperName: workflow.shipperName,
                    processName: step.processName,
                    planned: plan.planned,
                    uph: step.uph,
                    requiredPersonHours,
                    theoreticalHeadcount,
                    startMinutes,
                    endMinutes,
                    requiredLabels,
                    capabilityKeys: [
                        ...step.requiredQualificationIds.map(id => `qualification:${id}`),
                        ...step.requiredSkillIds.map(id => `skill:${id}`),
                    ],
                } satisfies AnalysisStepRow;
            }),
        );

        const totalRequiredHours = stepRows.reduce((sum, row) => sum + row.requiredPersonHours, 0);
        const totalScheduledHours = scheduledWorkers.reduce((sum, worker) => sum + worker.effectiveHours, 0);
        const gapHours = Number((totalScheduledHours - totalRequiredHours).toFixed(1));
        const shortageWorkers = gapHours < 0 ? Math.ceil(Math.abs(gapHours) / DEFAULT_SHIFT_RECOMMENDATION_HOURS) : 0;

        const timeSlotRows = ANALYSIS_SLOT_STARTS.map((hour) => {
            const startMinutes = hour * 60;
            const endMinutes = startMinutes + 120;
            const slotHours = (endMinutes - startMinutes) / 60;
            const requiredHeadcount = Number(stepRows.reduce((sum, row) => {
                const overlapHours = overlapMinutes(startMinutes, endMinutes, row.startMinutes, row.endMinutes) / 60;
                if (overlapHours <= 0) return sum;
                return sum + (row.theoreticalHeadcount * overlapHours) / slotHours;
            }, 0).toFixed(1));
            const availableHeadcount = countAvailableWorkers(scheduledShiftRanges, startMinutes, endMinutes);

            return {
                label: `${String(hour).padStart(2, "0")}-${String(hour + 2).padStart(2, "0")}`,
                startMinutes,
                endMinutes,
                requiredHeadcount,
                availableHeadcount,
                diff: Number((availableHeadcount - requiredHeadcount).toFixed(1)),
            } satisfies AnalysisTimeSlot;
        });

        const dayViewRowsByGranularity = Object.fromEntries(
            DAY_VIEW_GRANULARITY_OPTIONS.map((granularity) => [
                granularity,
                buildDayViewSlotRows(stepRows, scheduledShiftRanges, granularity),
            ]),
        ) as Record<DayViewGranularity, AnalysisDayViewSlot[]>;

        const capabilityMeta = new Map<string, { key: string; label: string; type: "skill" | "qualification" }>();
        stepRows.forEach((row) => {
            row.capabilityKeys.forEach((key) => {
                if (capabilityMeta.has(key)) return;
                const [type, rawId] = key.split(":");
                capabilityMeta.set(key, {
                    key,
                    label: type === "qualification"
                        ? qualificationNameById.get(rawId) ?? rawId
                        : skillNameById.get(rawId) ?? rawId,
                    type: type === "qualification" ? "qualification" : "skill",
                });
            });
        });

        const capabilityRows = [...capabilityMeta.values()]
            .map((meta) => {
                const slotRows = ANALYSIS_SLOT_STARTS.map((hour) => {
                    const startMinutes = hour * 60;
                    const endMinutes = startMinutes + 120;
                    const slotHours = (endMinutes - startMinutes) / 60;
                    const required = stepRows.reduce((sum, row) => {
                        if (!row.capabilityKeys.includes(meta.key)) return sum;
                        const overlapHours = overlapMinutes(startMinutes, endMinutes, row.startMinutes, row.endMinutes) / 60;
                        if (overlapHours <= 0) return sum;
                        return sum + (row.theoreticalHeadcount * overlapHours) / slotHours;
                    }, 0);
                    const available = countAvailableWorkers(scheduledShiftRanges, startMinutes, endMinutes, meta.key);
                    return {
                        startMinutes,
                        endMinutes,
                        required,
                        available,
                        shortage: Math.max(0, Math.ceil(required - available)),
                    };
                });

                const worstSlot = slotRows.reduce((worst, current) => {
                    if (current.shortage > worst.shortage) return current;
                    if (current.shortage === worst.shortage && current.required > worst.required) return current;
                    return worst;
                }, slotRows[0] ?? { startMinutes: 0, endMinutes: 0, required: 0, available: 0, shortage: 0 });

                return {
                    key: meta.key,
                    label: meta.label,
                    type: meta.type,
                    needed: Math.max(0, Math.ceil(worstSlot.required)),
                    available: worstSlot.available,
                    shortage: worstSlot.shortage,
                    slotRows: slotRows.map(slot => ({
                        startMinutes: slot.startMinutes,
                        endMinutes: slot.endMinutes,
                        shortage: slot.shortage,
                    })),
                } satisfies CapabilityGapRow;
            })
            .filter(row => row.needed > 0)
            .sort((left, right) => right.shortage - left.shortage || right.needed - left.needed);

        const activeDispatchCompanies = dispatchCompanies.filter(company => company.status === "active");
        const buildDispatchCandidates = (capabilityKey: string | null) =>
            activeDispatchCompanies
                .map((company) => {
                    const matchCount = users.filter((user) => {
                        if (user.employmentType !== "派遣" || user.dispatchCompanyId !== company.id) return false;
                        if (!capabilityKey) return true;
                        const [type, rawId] = capabilityKey.split(":");
                        return type === "qualification"
                            ? user.certifications.some(certification => qualificationIdByName.get(certification.name) === rawId)
                            : user.skills.some(skill => skillIdByName.get(skill.name) === rawId);
                    }).length;

                    return {
                        company,
                        matchCount,
                    };
                })
                .sort((left, right) =>
                    right.matchCount - left.matchCount || left.company.unitPrice - right.company.unitPrice,
                );

        const recommendations: DispatchRecommendation[] = [];
        const topCapabilityGap = capabilityRows.find(row => row.shortage > 0);
        if (topCapabilityGap) {
            const candidate = buildDispatchCandidates(topCapabilityGap.key)[0];
            if (candidate) {
                const window = buildRecommendedWindow(topCapabilityGap.slotRows);
                const durationHours = (window.endMinutes - window.startMinutes) / 60;
                const count = Math.max(topCapabilityGap.shortage, shortageWorkers > 0 ? Math.min(shortageWorkers, topCapabilityGap.shortage) : topCapabilityGap.shortage);
                recommendations.push({
                    id: `dispatch-capability-${topCapabilityGap.key}`,
                    title: `${candidate.company.name}（${topCapabilityGap.label}対応）`,
                    description: `単価 ¥${candidate.company.unitPrice.toLocaleString("ja-JP")}/h ・ 推奨シフト ${formatTimeLabel(window.startMinutes)}-${formatTimeLabel(window.endMinutes)}`,
                    count,
                    unitPrice: candidate.company.unitPrice,
                    startMinutes: window.startMinutes,
                    endMinutes: window.endMinutes,
                    estimatedCost: Math.round(count * durationHours * candidate.company.unitPrice),
                });
            }
        }

        const generalCandidates = buildDispatchCandidates(null);
        const remainingCount = Math.max(0, shortageWorkers - recommendations.reduce((sum, item) => sum + item.count, 0));
        if ((remainingCount > 0 || (recommendations.length === 0 && gapHours < 0)) && generalCandidates.length > 0) {
            const shortageSlotRows = timeSlotRows.map((slot) => ({
                startMinutes: slot.startMinutes,
                endMinutes: slot.endMinutes,
                shortage: Math.max(0, Math.ceil(slot.requiredHeadcount - slot.availableHeadcount)),
            }));
            const window = buildRecommendedWindow(shortageSlotRows);
            const durationHours = (window.endMinutes - window.startMinutes) / 60;
            const generalCount = Math.max(1, remainingCount || shortageWorkers || 1);
            recommendations.push({
                id: "dispatch-general",
                title: `${generalCandidates[0].company.name}（一般作業員）`,
                description: `単価 ¥${generalCandidates[0].company.unitPrice.toLocaleString("ja-JP")}/h ・ 推奨シフト ${formatTimeLabel(window.startMinutes)}-${formatTimeLabel(window.endMinutes)}`,
                count: generalCount,
                unitPrice: generalCandidates[0].company.unitPrice,
                startMinutes: window.startMinutes,
                endMinutes: window.endMinutes,
                estimatedCost: Math.round(generalCount * durationHours * generalCandidates[0].company.unitPrice),
            });
        }

        return {
            workflowCount: workflowViews.length,
            stepRows,
            totalRequiredHours: Number(totalRequiredHours.toFixed(1)),
            totalScheduledHours: Number(totalScheduledHours.toFixed(1)),
            gapHours,
            shortageWorkers,
            timeSlotRows,
            dayViewRowsByGranularity,
            capabilityRows,
            recommendations,
            totalRecommendationCost: recommendations.reduce((sum, item) => sum + item.estimatedCost, 0),
            scheduledWorkerCount: scheduledWorkers.length,
        };
    }, [
        analysisDateKey,
        analysisDay,
        attendanceWorkers,
        dispatchCompanies,
        monthlyShifts,
        processes,
        qualifications,
        selectedSiteId,
        shippers,
        sites,
        skills,
        users,
        workflows,
    ]);

    const dayViewRows = useMemo(
        () => analysisData.dayViewRowsByGranularity[dayViewGranularity] ?? [],
        [analysisData.dayViewRowsByGranularity, dayViewGranularity],
    );

    const dayViewSummary = useMemo(() => {
        if (dayViewRows.length === 0) {
            return {
                peakRequired: 0,
                peakAvailable: 0,
                maxShortage: 0,
                windowLabel: "-",
            };
        }

        const peakRequired = Math.max(...dayViewRows.map((row) => row.requiredHeadcount));
        const peakAvailable = Math.max(...dayViewRows.map((row) => row.availableHeadcount));
        const maxShortage = Math.max(...dayViewRows.map((row) => Math.max(0, row.requiredHeadcount - row.availableHeadcount)));
        const windowLabel = `${formatTimeLabel(dayViewRows[0].startMinutes)}-${formatTimeLabel(dayViewRows[dayViewRows.length - 1].endMinutes)}`;

        return {
            peakRequired: Number(peakRequired.toFixed(1)),
            peakAvailable: Number(peakAvailable.toFixed(1)),
            maxShortage: Number(maxShortage.toFixed(1)),
            windowLabel,
        };
    }, [dayViewRows]);

    const dayViewChartRows = useMemo(
        () =>
            dayViewRows.map((row) => ({
                label: row.label,
                requiredHeadcount: row.requiredHeadcount,
                availableHeadcount: row.availableHeadcount,
                diff: row.diff,
                processLabel: row.activeProcesses.join(" / ") || "-",
            })),
        [dayViewRows],
    );

    const dayViewBottlenecks = useMemo(
        () =>
            dayViewRows
                .filter((row) => row.requiredHeadcount - row.availableHeadcount > 0)
                .sort(
                    (left, right) =>
                        right.requiredHeadcount - right.availableHeadcount - (left.requiredHeadcount - left.availableHeadcount) ||
                        right.requiredHeadcount - left.requiredHeadcount,
                )
                .slice(0, 4),
        [dayViewRows],
    );

    const chartGridStroke = c.isDark ? "#1e293b" : "#e2e8f0";
    const chartAxisStroke = c.isDark ? "#475569" : "#94a3b8";
    const chartTickFill = c.isDark ? "#94a3b8" : "#64748b";
    const chartTooltipBg = c.isDark ? "#111827" : "#ffffff";
    const chartTooltipBorder = c.isDark ? "#334155" : "#cbd5e1";
    const chartTooltipColor = c.isDark ? "#e2e8f0" : "#0f172a";

    const activeEditingWorkerId = editingCell?.workerId;
    const activeEditingDay = editingCell?.day;

    useEffect(() => {
        if (!activeEditingWorkerId || !activeEditingDay) return;

        const updateAnchorRect = () => {
            const anchor = document.querySelector<HTMLElement>(`[data-shift-cell="${activeEditingWorkerId}:${activeEditingDay}"]`);
            if (!anchor) return;
            const nextRect = captureAnchorRect(anchor.getBoundingClientRect());
            setEditingCell((current) => {
                if (!current || current.workerId !== activeEditingWorkerId || current.day !== activeEditingDay) {
                    return current;
                }
                if (
                    current.anchorRect.top === nextRect.top &&
                    current.anchorRect.left === nextRect.left &&
                    current.anchorRect.bottom === nextRect.bottom &&
                    current.anchorRect.right === nextRect.right
                ) {
                    return current;
                }
                return { ...current, anchorRect: nextRect };
            });
        };

        const container = scrollContainerRef.current;
        window.addEventListener("resize", updateAnchorRect);
        container?.addEventListener("scroll", updateAnchorRect);

        return () => {
            window.removeEventListener("resize", updateAnchorRect);
            container?.removeEventListener("scroll", updateAnchorRect);
        };
    }, [activeEditingWorkerId, activeEditingDay]);

    const groupedWorkers = useMemo(() => {
        const groups: Record<string, Worker[]> = { "正社員": [], "パートナー": [], "派遣": [] };
        filteredWorkers.forEach(w => { if (groups[w.category]) groups[w.category].push(w); });
        return groups;
    }, [filteredWorkers]);

    const quickTemplates = attendanceTemplates.shiftTemplates;

    const updateShiftTemplate = (templateId: string, updater: (template: ShiftTemplate) => ShiftTemplate) => {
        setAttendanceTemplates(prev => ({
            ...prev,
            shiftTemplates: prev.shiftTemplates.map(template =>
                template.id === templateId ? updater(template) : template,
            ),
        }));
    };

    const ensureShiftAdjustment = (shift?: ShiftData) => ({
        kind: (shift?.adjustment?.kind ?? "none") as ShiftAdjustmentKind,
        note: shift?.adjustment?.note ?? "",
        plannedStart: shift?.adjustment?.plannedStart ?? shift?.start ?? "",
        plannedEnd: shift?.adjustment?.plannedEnd ?? shift?.end ?? "",
    });

    const handleShiftUpdate = (workerId: string, day: number, updates: Partial<ShiftData>) => {
        setMonthlyShifts(prev => ({
            ...prev,
            [workerId]: {
                ...prev[workerId],
                [day]: {
                    ...prev[workerId][day],
                    ...updates,
                    templateId: updates.templateId !== undefined ? updates.templateId : (prev[workerId]?.[day]?.templateId ?? null),
                    breaks: updates.breaks ? cloneShiftBreaks(updates.breaks) : cloneShiftBreaks(prev[workerId]?.[day]?.breaks ?? []),
                    adjustment: updates.adjustment
                        ? {
                            ...ensureShiftAdjustment(prev[workerId]?.[day]),
                            ...updates.adjustment,
                        }
                        : ensureShiftAdjustment(prev[workerId]?.[day]),
                },
            },
        }));
    };

    const applyShiftTemplateToWorkerDay = (workerId: string, day: number, template: ShiftTemplate) => {
        handleShiftUpdate(workerId, day, {
            start: template.start,
            end: template.end,
            isOff: false,
            templateId: template.id,
            breaks: cloneShiftBreaks(template.breaks),
            adjustment: {
                kind: "none",
                note: "",
                plannedStart: template.start,
                plannedEnd: template.end,
            },
        });
    };

    const updateShiftAdjustment = (
        workerId: string,
        day: number,
        updates: Partial<NonNullable<ShiftData["adjustment"]>>,
        shift?: ShiftData,
    ) => {
        const currentShift = shift ?? monthlyShifts[workerId]?.[day];
        handleShiftUpdate(workerId, day, {
            adjustment: {
                ...ensureShiftAdjustment(currentShift),
                ...updates,
            },
        });
    };

    const addShiftBreakToWorkerDay = (workerId: string, day: number, shift?: ShiftData) => {
        const currentShift = shift ?? monthlyShifts[workerId]?.[day];
        const nextIndex = (currentShift?.breaks?.length ?? 0) + 1;
        handleShiftUpdate(workerId, day, {
            isOff: false,
            breaks: [
                ...(currentShift?.breaks ?? []),
                {
                    id: `manual-break-${workerId}-${day}-${Date.now()}`,
                    templateId: null,
                    name: `休憩 ${nextIndex}`,
                    start: currentShift?.start || "12:00",
                    end: currentShift?.start || "12:30",
                },
            ],
        });
    };

    const updateShiftBreakForWorkerDay = (
        workerId: string,
        day: number,
        breakId: string,
        updates: Partial<ShiftBreakAssignment>,
        shift?: ShiftData,
    ) => {
        const currentShift = shift ?? monthlyShifts[workerId]?.[day];
        handleShiftUpdate(workerId, day, {
            breaks: (currentShift?.breaks ?? []).map((breakItem) =>
                breakItem.id === breakId
                    ? { ...breakItem, ...updates, templateId: null }
                    : breakItem,
            ),
        });
    };

    const removeShiftBreakForWorkerDay = (workerId: string, day: number, breakId: string, shift?: ShiftData) => {
        const currentShift = shift ?? monthlyShifts[workerId]?.[day];
        handleShiftUpdate(workerId, day, {
            breaks: (currentShift?.breaks ?? []).filter((breakItem) => breakItem.id !== breakId),
        });
    };

    const applyAdjustmentKind = (workerId: string, day: number, kind: ShiftAdjustmentKind, shift?: ShiftData) => {
        const currentShift = shift ?? monthlyShifts[workerId]?.[day];
        const currentAdjustment = ensureShiftAdjustment(currentShift);
        const plannedStart = currentAdjustment.plannedStart || currentShift?.start || "";
        const plannedEnd = currentAdjustment.plannedEnd || currentShift?.end || "";

        if (kind === "absence") {
            handleShiftUpdate(workerId, day, {
                start: "",
                end: "",
                isOff: true,
                adjustment: {
                    ...currentAdjustment,
                    kind,
                    plannedStart,
                    plannedEnd,
                },
            });
            return;
        }

        handleShiftUpdate(workerId, day, {
            start: currentShift?.start || plannedStart,
            end: currentShift?.end || plannedEnd,
            isOff: false,
            adjustment: {
                ...currentAdjustment,
                kind,
                plannedStart,
                plannedEnd,
            },
        });
    };

    const getCellKey = (workerId: string, day: number) => `${workerId}:${day}`;

    const selectedTargetKeys = useMemo(() => {
        const next = new Set(selectedCellKeys);
        selectedWorkerIds.forEach(workerId => {
            selectedDays.forEach(day => {
                next.add(getCellKey(workerId, day));
            });
        });
        return next;
    }, [selectedCellKeys, selectedWorkerIds, selectedDays]);

    const isBulkActive = selectedTargetKeys.size > 0;

    const handleExport = () => {
        const monthLabel = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
        const payload = {
            year: viewYear,
            month: viewMonth + 1,
            monthlyShifts,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `shift-plan-${monthLabel}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setImportFeedback({ kind: "success", message: `${monthLabel} のシフトをエクスポートしました` });
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        try {
            const raw = await file.text();
            const parsed = JSON.parse(raw);
            const imported = normalizeImportedMonthlyShifts(parsed, viewYear, viewMonth, attendanceWorkers);
            setMonthlyShifts(imported);
            setImportFeedback({ kind: "success", message: `${file.name} を取り込みました` });
        } catch (error) {
            console.error("Failed to import shift plan:", error);
            setImportFeedback({ kind: "error", message: "インポートに失敗しました。JSON形式を確認してください。" });
        }
    };

    // Bulk Apply Logic
    const applyBulkShift = (
        start: string,
        end: string,
        isOff: boolean,
        breaks: ShiftBreakAssignment[] = [],
        templateId: string | null = null,
    ) => {
        setMonthlyShifts(prev => {
            const next = { ...prev };
            selectedTargetKeys.forEach(cellKey => {
                const [workerId, dayValue] = cellKey.split(":");
                const day = Number(dayValue);
                if (!workerId || Number.isNaN(day)) return;
                if (!next[workerId]) next[workerId] = {};
                next[workerId][day] = {
                    start,
                    end,
                    isOff,
                    templateId: isOff ? null : templateId,
                    breaks: isOff ? [] : cloneShiftBreaks(breaks),
                    adjustment: {
                        kind: "none",
                        note: "",
                        plannedStart: start,
                        plannedEnd: end,
                    },
                };
            });
            return next;
        });
        // Selection is maintained or cleared based on UX preference. Let's keep it for now.
    };

    const templateGroupOrder = ["正社員", "パートナー", "派遣"];
    const templateGroupColorMap: Record<string, string> = {
        正社員: "#378ADD",
        パートナー: "#1D9E75",
        派遣: "#6D7380",
    };
    const [expandedTemplateGroups, setExpandedTemplateGroups] = useState<Record<string, boolean>>({
        正社員: true,
        パートナー: true,
        派遣: true,
    });
    const toggleTemplateGroup = (category: string) => {
        setExpandedTemplateGroups(prev => ({ ...prev, [category]: !(prev[category] ?? true) }));
    };

    const addShiftTemplate = (category = "正社員") => {
        const nextIndex = attendanceTemplates.shiftTemplates.filter((template) => template.category === category).length + 1;
        setAttendanceTemplates(prev => ({
            ...prev,
            shiftTemplates: [
                ...prev.shiftTemplates,
                {
                    id: `shift-template-${Date.now()}`,
                    name: `新規テンプレート ${nextIndex}`,
                    category,
                    start: "08:00",
                    end: "17:00",
                    color: templateGroupColorMap[category] ?? "#378ADD",
                    isDefault: false,
                    breaks: [],
                },
            ],
        }));
    };

    const removeShiftTemplate = (templateId: string) => {
        setAttendanceTemplates(prev => ({
            ...prev,
            shiftTemplates: prev.shiftTemplates.filter(template => template.id !== templateId),
        }));
    };

    const duplicateShiftTemplate = (template: ShiftTemplate) => {
        setAttendanceTemplates(prev => ({
            ...prev,
            shiftTemplates: [
                ...prev.shiftTemplates,
                {
                    ...template,
                    id: `shift-template-${Date.now()}`,
                    name: `${template.name} コピー`,
                    isDefault: false,
                    breaks: template.breaks.map((breakItem, index) => ({
                        ...breakItem,
                        id: `${template.id}:copy:${Date.now()}:${index}`,
                    })),
                },
            ],
        }));
    };

    const setShiftTemplateDefault = (templateId: string) => {
        setAttendanceTemplates(prev => {
            const selectedTemplate = prev.shiftTemplates.find((template) => template.id === templateId);
            if (!selectedTemplate) return prev;
            return {
                ...prev,
                shiftTemplates: prev.shiftTemplates.map((template) =>
                    template.category === selectedTemplate.category
                        ? { ...template, isDefault: template.id === templateId }
                        : template,
                ),
            };
        });
    };

    const groupedShiftTemplates = useMemo(() => {
        const base = Object.fromEntries(templateGroupOrder.map((category) => [category, [] as ShiftTemplate[]])) as Record<string, ShiftTemplate[]>;
        attendanceTemplates.shiftTemplates.forEach((template) => {
            const category = template.category || "正社員";
            if (!base[category]) base[category] = [];
            base[category].push(template);
        });
        return base;
    }, [attendanceTemplates.shiftTemplates]);

    const templateCategories = useMemo(() => {
        const ordered = [...templateGroupOrder];
        Object.keys(groupedShiftTemplates).forEach((category) => {
            if (!ordered.includes(category)) ordered.push(category);
        });
        return ordered.filter((category, index) => ordered.indexOf(category) === index);
    }, [groupedShiftTemplates]);

    useEffect(() => {
        if (!isBulkActive) {
            setBulkShiftDraft(null);
            return;
        }

        setBulkShiftDraft((current) => {
            if (current) {
                if (!current.templateId) return current;
                const matchedTemplate = quickTemplates.find((template) => template.id === current.templateId);
                return matchedTemplate
                    ? { ...current, breaks: cloneShiftBreaks(current.breaks) }
                    : current;
            }

            return quickTemplates[0] ? createBulkShiftDraft(quickTemplates[0]) : createBulkShiftDraft();
        });
    }, [isBulkActive, quickTemplates]);

    const getNightHoursForRange = (start: string, end: string) => {
        const totalMinutes = Math.round(calculateHours(start, end) * 60);
        if (totalMinutes <= 0) return 0;
        const [sH, sM] = start.split(":").map(Number);
        const startMinutes = (sH || 0) * 60 + (sM || 0);
        let nightMinutes = 0;
        for (let minuteOffset = 0; minuteOffset < totalMinutes; minuteOffset += 15) {
            const minuteOfDay = (startMinutes + minuteOffset) % (24 * 60);
            if (minuteOfDay >= 22 * 60 || minuteOfDay < 5 * 60) {
                nightMinutes += 15;
            }
        }
        return nightMinutes / 60;
    };

    const getTemplateComplianceItems = (template: ShiftTemplate) => {
        const grossHours = calculateHours(template.start, template.end);
        const breakHours = calculateBreakHoursFromAssignments(template.breaks);
        const items: Array<{ label: string; tone: "ok" | "warn" }> = [];

        if (grossHours >= 8) {
            items.push({
                label: breakHours >= 1 ? "8h以上 60分休憩" : "8h以上 60分休憩が未達",
                tone: breakHours >= 1 ? "ok" : "warn",
            });
        } else if (grossHours >= 6) {
            items.push({
                label: breakHours >= 0.75 ? "6h以上 45分休憩" : "6h以上 45分休憩が未達",
                tone: breakHours >= 0.75 ? "ok" : "warn",
            });
        } else {
            items.push({
                label: "6h未満・休憩は任意",
                tone: "ok",
            });
        }

        const nightHours = getNightHoursForRange(template.start, template.end);
        items.push({
            label: nightHours > 0 ? `深夜勤務 ${nightHours.toFixed(1)}h` : "深夜勤務なし",
            tone: nightHours > 0 ? "warn" : "ok",
        });
        return items;
    };

    const getShiftComplianceItems = (shift?: ShiftData) => {
        if (!shift || shift.isOff || !shift.start || !shift.end) return [] as Array<{ label: string; tone: "ok" | "warn" }>;

        const grossHours = calculateHours(shift.start, shift.end);
        const breakHours = calculateBreakHoursFromAssignments(shift.breaks ?? []);
        const items: Array<{ label: string; tone: "ok" | "warn" }> = [];

        if (grossHours >= 8) {
            items.push({
                label: breakHours >= 1 ? "8h以上 60分休憩" : "8h以上 60分休憩が未達",
                tone: breakHours >= 1 ? "ok" : "warn",
            });
        } else if (grossHours >= 6) {
            items.push({
                label: breakHours >= 0.75 ? "6h以上 45分休憩" : "6h以上 45分休憩が未達",
                tone: breakHours >= 0.75 ? "ok" : "warn",
            });
        } else {
            items.push({
                label: "6h未満・休憩は任意",
                tone: "ok",
            });
        }

        const nightHours = getNightHoursForRange(shift.start, shift.end);
        items.push({
            label: nightHours > 0 ? `深夜勤務 ${nightHours.toFixed(1)}h` : "深夜勤務なし",
            tone: nightHours > 0 ? "warn" : "ok",
        });
        return items;
    };

    const getTemplateNetHours = (template: ShiftTemplate) => {
        const grossHours = calculateHours(template.start, template.end);
        const breakHours = calculateBreakHoursFromAssignments(template.breaks);
        return Math.max(0, grossHours - breakHours);
    };

    const formatBreakMinutes = (breakItem: ShiftBreakAssignment) =>
        `${Math.round(calculateHours(breakItem.start, breakItem.end) * 60)}分`;

    const renderTemplateCard = (template: ShiftTemplate) => {
        const breakHours = calculateBreakHoursFromAssignments(template.breaks);
        const netHours = getTemplateNetHours(template);
        const complianceItems = getTemplateComplianceItems(template);

        return (
            <article key={template.id} className={`${c.bgCard} overflow-hidden rounded-[14px] border ${c.borderCard}`}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="h-10 w-1 rounded-full" style={{ backgroundColor: template.color }} />

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                type="text"
                                value={template.name}
                                onChange={(event) =>
                                    updateShiftTemplate(template.id, (current) => ({ ...current, name: event.target.value }))
                                }
                                className={`min-w-[180px] flex-1 border-none bg-transparent px-0 py-0 text-[14px] font-semibold outline-none ${c.textPrimary}`}
                            />
                            {template.isDefault ? (
                                <span className="rounded-md bg-[#E6F1FB] px-2 py-0.5 text-[11px] font-semibold text-[#155DFC]">
                                    デフォルト
                                </span>
                            ) : null}
                        </div>
                        <div className={`mt-1 text-[12px] ${c.textSecondary}`}>
                            実働 {netHours.toFixed(1)}h ・ 休憩 {breakHours.toFixed(1)}h
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition hover:border-[#155DFC]/40">
                            <span className={c.textSecondary}>色</span>
                            <input
                                type="color"
                                value={template.color}
                                onChange={(event) =>
                                    updateShiftTemplate(template.id, (current) => ({ ...current, color: event.target.value }))
                                }
                                className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                                aria-label={`${template.name} の色`}
                            />
                        </label>
                        <div className={`inline-flex items-center rounded-xl border px-3 py-2 ${c.borderCard} ${c.bgCard}`}>
                            <input
                                type="text"
                                value={template.start}
                                onChange={(event) =>
                                    updateShiftTemplate(template.id, (current) => ({ ...current, start: event.target.value }))
                                }
                                className={`w-[54px] border-none bg-transparent text-right text-[15px] font-semibold tabular-nums outline-none ${c.textPrimary}`}
                            />
                            <span className={`px-1 text-[12px] ${c.textMuted}`}>→</span>
                            <input
                                type="text"
                                value={template.end}
                                onChange={(event) =>
                                    updateShiftTemplate(template.id, (current) => ({ ...current, end: event.target.value }))
                                }
                                className={`w-[54px] border-none bg-transparent text-left text-[15px] font-semibold tabular-nums outline-none ${c.textPrimary}`}
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setShiftTemplateDefault(template.id)}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${template.isDefault ? "border-[#155DFC] bg-[#EEF4FF] text-[#155DFC]" : `${c.borderCard} ${c.bgCard} ${c.textSecondary} hover:bg-black/[0.03]`}`}
                                aria-label={`${template.name} をデフォルトに設定`}
                            >
                                <Star className={`h-4 w-4 ${template.isDefault ? "fill-current" : ""}`} />
                            </button>
                            <button
                                type="button"
                                onClick={() => duplicateShiftTemplate(template)}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${c.borderCard} ${c.bgCard} ${c.textSecondary} hover:bg-black/[0.03]`}
                                aria-label={`${template.name} を複製`}
                            >
                                <Copy className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => removeShiftTemplate(template.id)}
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${c.borderCard} ${c.bgCard} text-rose-500 hover:bg-rose-500/10`}
                                aria-label={`${template.name} を削除`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className={`border-t px-4 py-3 ${c.borderCard} ${c.bgSurface}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className={`text-[11px] font-semibold ${c.textMuted}`}>休憩設定</div>
                            <div className={`mt-1 text-[12px] ${c.textSecondary}`}>
                                必要な休憩を手動で追加し、名前と時間を直接調整できます。
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                updateShiftTemplate(template.id, (current) => ({
                                    ...current,
                                    breaks: [
                                        ...current.breaks,
                                        {
                                            id: `manual-break-${Date.now()}`,
                                            templateId: null,
                                            name: `手動休憩 ${current.breaks.length + 1}`,
                                            start: "12:00",
                                            end: "12:30",
                                        },
                                    ],
                                }))
                            }
                            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${c.borderCard} ${c.bgCard} ${c.textSecondary}`}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            手動休憩を追加
                        </button>
                    </div>

                    {template.breaks.length === 0 ? (
                        <div className={`mt-3 rounded-xl border border-dashed px-4 py-5 text-center text-[12px] ${c.borderCard} ${c.textMuted}`}>
                            休憩を追加すると、ここで名前と時間を編集できます。
                        </div>
                    ) : (
                        <div className="mt-3 flex flex-col gap-2">
                            {template.breaks.map((breakItem, breakIndex) => (
                                <div key={breakItem.id} className={`${c.bgCard} grid gap-2 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_94px_94px_auto_40px] ${c.borderCard}`}>
                                    <input
                                        type="text"
                                        value={breakItem.name}
                                        onChange={(event) =>
                                            updateShiftTemplate(template.id, (current) => ({
                                                ...current,
                                                breaks: current.breaks.map((item) =>
                                                    item.id === breakItem.id ? { ...item, name: event.target.value } : item,
                                                ),
                                            }))
                                        }
                                        className={`rounded-lg border px-3 py-2 text-[12px] ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                                    />
                                    <input
                                        type="text"
                                        value={breakItem.start}
                                        onChange={(event) =>
                                            updateShiftTemplate(template.id, (current) => ({
                                                ...current,
                                                breaks: current.breaks.map((item) =>
                                                    item.id === breakItem.id ? { ...item, start: event.target.value } : item,
                                                ),
                                            }))
                                        }
                                        className={`rounded-lg border px-3 py-2 text-[12px] tabular-nums ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                                    />
                                    <input
                                        type="text"
                                        value={breakItem.end}
                                        onChange={(event) =>
                                            updateShiftTemplate(template.id, (current) => ({
                                                ...current,
                                                breaks: current.breaks.map((item) =>
                                                    item.id === breakItem.id ? { ...item, end: event.target.value } : item,
                                                ),
                                            }))
                                        }
                                        className={`rounded-lg border px-3 py-2 text-[12px] tabular-nums ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                                    />
                                    <div className={`inline-flex items-center justify-center rounded-lg px-2 text-[11px] ${c.bgSurface} ${c.textSecondary}`}>
                                        {formatBreakMinutes(breakItem)}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            updateShiftTemplate(template.id, (current) => ({
                                                ...current,
                                                breaks: current.breaks.filter((item) => item.id !== breakItem.id),
                                            }))
                                        }
                                        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border transition ${c.borderCard} ${c.bgSurface} text-rose-500 hover:bg-rose-500/10`}
                                        aria-label={`${breakItem.name || `休憩 ${breakIndex + 1}`} を削除`}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                        {complianceItems.map((item) => (
                            <span
                                key={`${template.id}-${item.label}`}
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
                                    item.tone === "ok" ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FAEEDA] text-[#854F0B]"
                                }`}
                            >
                                {item.tone === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                {item.label}
                            </span>
                        ))}
                    </div>
                </div>
            </article>
        );
    };

    const renderTemplateGroup = (category: string) => {
        const templates = groupedShiftTemplates[category] ?? [];
        const isExpanded = expandedTemplateGroups[category] ?? true;
        const accentColor = templateGroupColorMap[category] ?? "#378ADD";

        return (
            <section key={category} className={`${c.bgCard} overflow-hidden rounded-2xl border ${c.border} shadow-sm`}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <button
                        type="button"
                        onClick={() => toggleTemplateGroup(category)}
                        className="inline-flex items-center gap-3 text-left"
                    >
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                        </span>
                        <span className={`text-[14px] font-semibold ${c.textPrimary}`}>{category}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] ${c.bgSurface} ${c.textSecondary}`}>
                            {templates.length} テンプレート
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => addShiftTemplate(category)}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition"
                        style={{ color: accentColor, backgroundColor: `${accentColor}12` }}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        追加
                    </button>
                </div>

                {isExpanded ? (
                    <div className={`border-t px-5 py-4 ${c.borderCard} ${c.bgSurface}`}>
                        <div className="flex flex-col gap-3">
                            {templates.length === 0 ? (
                                <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-[12px] ${c.borderCard} ${c.textMuted}`}>
                                    {category} のテンプレートはまだありません。右上の「追加」から作成できます。
                                </div>
                            ) : (
                                templates.map((template) => renderTemplateCard(template))
                            )}
                        </div>
                    </div>
                ) : null}
            </section>
        );
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

    const toggleCellSelection = (workerId: string, day: number) => {
        const cellKey = getCellKey(workerId, day);
        setSelectedCellKeys(prev => {
            const next = new Set(prev);
            if (next.has(cellKey)) next.delete(cellKey);
            else next.add(cellKey);
            return next;
        });
    };

    const openCellEditor = (workerId: string, day: number, rect: DOMRect) => {
        setEditorShiftTab("plan");
        setEditingShiftDraft(createShiftEditorDraft(monthlyShifts[workerId]?.[day]));
        setEditingCell({
            workerId,
            day,
            anchorRect: captureAnchorRect(rect),
        });
    };

    const closeCellEditor = () => {
        setEditingCell(null);
        setEditingShiftDraft(null);
        setEditorShiftTab("plan");
    };

    useEffect(() => {
        if (!editingCell) return;

        const handlePointerDownOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (cellEditorPopoverRef.current?.contains(target)) return;
            if (target.closest("[data-shift-cell]")) return;
            closeCellEditor();
        };

        document.addEventListener("pointerdown", handlePointerDownOutside, true);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDownOutside, true);
        };
    }, [editingCell]);

    const saveCellEditor = () => {
        if (!editingCell || !editingShiftDraft) {
            closeCellEditor();
            return;
        }

        handleShiftUpdate(editingCell.workerId, editingCell.day, editingShiftDraft);
        closeCellEditor();
    };

    const addEditingShiftDraftBreak = () => {
        setEditingShiftDraft((current) => {
            const base = current ?? createShiftEditorDraft();
            const nextIndex = (base.breaks?.length ?? 0) + 1;
            return {
                ...base,
                isOff: false,
                breaks: [
                    ...(base.breaks ?? []),
                    {
                        id: `manual-break-draft-${Date.now()}`,
                        templateId: null,
                        name: `休憩 ${nextIndex}`,
                        start: base.start || "12:00",
                        end: base.start || "12:30",
                    },
                ],
            };
        });
    };

    const updateEditingShiftDraftBreak = (breakId: string, updates: Partial<ShiftBreakAssignment>) => {
        setEditingShiftDraft((current) => {
            const base = current ?? createShiftEditorDraft();
            return {
                ...base,
                breaks: (base.breaks ?? []).map((breakItem) =>
                    breakItem.id === breakId ? { ...breakItem, ...updates, templateId: null } : breakItem,
                ),
            };
        });
    };

    const addBulkShiftDraftBreak = () => {
        setBulkShiftDraft((current) => {
            const base = current ?? createBulkShiftDraft();
            const nextIndex = (base.breaks?.length ?? 0) + 1;
            return {
                ...base,
                breaks: [
                    ...(base.breaks ?? []),
                    {
                        id: `manual-bulk-break-${Date.now()}`,
                        templateId: null,
                        name: `休憩 ${nextIndex}`,
                        start: base.start || "12:00",
                        end: base.start || "12:30",
                    },
                ],
            };
        });
    };

    const updateBulkShiftDraftBreak = (breakId: string, updates: Partial<ShiftBreakAssignment>) => {
        setBulkShiftDraft((current) => {
            const base = current ?? createBulkShiftDraft();
            return {
                ...base,
                breaks: (base.breaks ?? []).map((breakItem) =>
                    breakItem.id === breakId ? { ...breakItem, ...updates, templateId: null } : breakItem,
                ),
            };
        });
    };

    const removeBulkShiftDraftBreak = (breakId: string) => {
        setBulkShiftDraft((current) => {
            const base = current ?? createBulkShiftDraft();
            return {
                ...base,
                breaks: (base.breaks ?? []).filter((breakItem) => breakItem.id !== breakId),
            };
        });
    };

    const handleCellClick = (event: React.MouseEvent<HTMLButtonElement>, workerId: string, day: number) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
            closeCellEditor();
            toggleCellSelection(workerId, day);
            return;
        }

        openCellEditor(workerId, day, event.currentTarget.getBoundingClientRect());
    };

    const clearSelection = () => {
        setSelectedWorkerIds(new Set());
        setSelectedDays(new Set());
        setSelectedCellKeys(new Set());
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

    const getDailyScheduledHours = (day: number) => {
        const total = filteredWorkers.reduce((sum, worker) => {
            const shift = monthlyShifts[worker.id]?.[day];
            if (!shift || shift.isOff) return sum;
            return sum + calculateHours(shift.start, shift.end);
        }, 0);
        return total.toFixed(1);
    };

    const getMonthlyScheduledHoursTotal = () => {
        const total = filteredWorkers.reduce((sum, worker) => {
            const shifts = monthlyShifts[worker.id];
            if (!shifts) return sum;
            return (
                sum +
                Object.values(shifts).reduce((workerSum, shift) => {
                    if (!shift || shift.isOff) return workerSum;
                    return workerSum + calculateHours(shift.start, shift.end);
                }, 0)
            );
        }, 0);
        return total.toFixed(1);
    };

    const selectedBulkTemplate = bulkShiftDraft?.templateId
        ? quickTemplates.find((template) => template.id === bulkShiftDraft.templateId) ?? null
        : null;
    const bulkComplianceItems = bulkShiftDraft?.isOff
        ? []
        : getShiftComplianceItems({
            start: bulkShiftDraft?.start ?? "",
            end: bulkShiftDraft?.end ?? "",
            isOff: bulkShiftDraft?.isOff ?? false,
            templateId: bulkShiftDraft?.templateId ?? null,
            breaks: bulkShiftDraft?.breaks ?? [],
            adjustment: {
                kind: "none",
                note: "",
                plannedStart: bulkShiftDraft?.start ?? "",
                plannedEnd: bulkShiftDraft?.end ?? "",
            },
        });

    const toggleCategory = (cat: string) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

    const SIDEBAR_WIDTH = "260px"; // Wider to accommodate checkbox
    const CELL_WIDTH = "65px";

    return (
        <div className={`p-6 h-full flex flex-col overflow-hidden relative ${c.bg}`}>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFile}
            />

            {/* Toolbar */}
            {activeTab !== "templates" ? (
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
                    {isBulkActive && (
                        <div className="flex items-center gap-4">
                            <button onClick={clearSelection} className="flex items-center gap-1.5 text-rose-500 font-bold hover:underline"><X className="w-3.5 h-3.5" />選択解除 ({selectedTargetKeys.size}セル)</button>
                        </div>
                    )}
                </div>
            ) : null}

            <div className="mb-4 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className={`inline-flex flex-wrap items-center gap-2 rounded-2xl border p-1 ${c.bgCard} ${c.border} shadow-sm`}>
                        <button
                            type="button"
                            onClick={() => setActiveTab("table")}
                            className={tabButtonClass("table")}
                            aria-pressed={activeTab === "table"}
                        >
                            <Calendar className="h-4 w-4" />
                            シフト表
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                closeCellEditor();
                                setActiveTab("dayView");
                            }}
                            className={tabButtonClass("dayView")}
                            aria-pressed={activeTab === "dayView"}
                        >
                            <Clock className="h-4 w-4" />
                            作業日ビュー
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                closeCellEditor();
                                setActiveTab("templates");
                            }}
                            className={tabButtonClass("templates")}
                            aria-pressed={activeTab === "templates"}
                        >
                            <Edit3 className="h-4 w-4" />
                            テンプレート
                        </button>
                    </div>

                    {activeTab === "table" ? (
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            {importFeedback ? (
                                <div className={`rounded-lg px-3 py-2 text-[12px] font-medium ${
                                    importFeedback.kind === "success"
                                        ? "bg-emerald-500/10 text-emerald-600"
                                        : "bg-rose-500/10 text-rose-600"
                                }`}>
                                    {importFeedback.message}
                                </div>
                            ) : null}
                            <button
                                onClick={handleImportClick}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${c.borderCard} ${c.bgCard} ${c.textSecondary} text-[13px] transition-all font-medium ${hoverSubtle}`}
                            >
                                <Upload className="w-4 h-4" />インポート
                            </button>
                            <button
                                onClick={handleExport}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${c.borderCard} ${c.bgCard} ${c.textSecondary} text-[13px] transition-all font-medium ${hoverSubtle}`}
                            >
                                <Download className="w-4 h-4" />エクスポート
                            </button>
                            <button className="flex items-center gap-2 px-6 py-2 rounded-lg bg-[#155DFC] text-white text-[13px] hover:bg-[#0F4FE3] transition-all shadow-lg font-bold">
                                <Save className="w-4 h-4" />計画を保存
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>

            {activeTab === "templates" ? (
                <div className="flex-1 min-h-0 overflow-auto">
                    <div className="mx-auto flex max-w-[860px] flex-col gap-4 pb-6">
                        <section className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className={`text-[18px] font-semibold ${c.textPrimary}`}>シフトテンプレート</div>
                                <div className={`mt-1 text-[13px] ${c.textSecondary}`}>
                                    出勤・退勤パターンと、各テンプレート内の休憩設定を雇用区分ごとにまとめて管理します。
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => addShiftTemplate(templateCategories[0] ?? "正社員")}
                                className="inline-flex items-center gap-2 rounded-lg bg-[#155DFC] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#0F4FE3]"
                            >
                                <Plus className="h-4 w-4" />
                                テンプレートを追加
                            </button>
                        </section>

                        {templateCategories.map((category) => renderTemplateGroup(category))}
                    </div>
                </div>
            ) : activeTab === "dayView" ? (
                <div className="flex-1 min-h-0 overflow-auto">
                    <section className={`${c.bgCard} border ${c.border} rounded-2xl p-5 shadow-sm`}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div className={`flex items-center gap-2 text-[16px] font-semibold ${c.textPrimary}`}>
                                    <Clock className="h-4 w-4 text-blue-500" />
                                    作業日ビュー需給
                                </div>
                                <div className={`mt-1 text-[12px] ${c.textSecondary}`}>
                                    {analysisDateKey} / {selectedSite?.name ?? "全拠点"} / {dayViewGranularity}分単位で必要人数と出勤人数を比較
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <label className="flex items-center gap-2">
                                    <span className={`text-[11px] font-medium ${c.textSecondary}`}>対象日</span>
                                    <input
                                        type="date"
                                        value={analysisDateKey}
                                        min={toDateKey(viewYear, viewMonth, 1)}
                                        max={toDateKey(viewYear, viewMonth, daysInMonth)}
                                        onChange={(event) => {
                                            const selected = new Date(event.target.value);
                                            if (Number.isNaN(selected.getTime())) return;
                                            setAnalysisDay(selected.getDate());
                                        }}
                                        className={`rounded-lg border px-3 py-2 text-[12px] ${c.bgInput} ${c.borderCard} ${c.textPrimary}`}
                                    />
                                </label>
                                <div className={`inline-flex items-center gap-1 rounded-xl border p-1 ${c.bgSurface} ${c.borderCard}`}>
                                    {DAY_VIEW_GRANULARITY_OPTIONS.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                                onClick={() => setDayViewGranularity(option)}
                                                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                                                    dayViewGranularity === option
                                                    ? "bg-[#155DFC] text-white"
                                                    : `${c.textSecondary} hover:bg-[#155DFC]/10 hover:text-[#155DFC]`
                                            }`}
                                            aria-pressed={dayViewGranularity === option}
                                        >
                                            {option === 60 ? "1時間" : `${option}分`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {analysisData.workflowCount === 0 ? (
                            <div className={`mt-5 rounded-2xl border px-5 py-8 text-center ${c.bgSurface} ${c.borderCard}`}>
                                <div className={`text-[15px] font-semibold ${c.textPrimary}`}>進捗計画がまだありません</div>
                                <div className={`mt-2 text-[12px] ${c.textSecondary}`}>
                                    進捗管理で予定数を登録すると、この画面で時間帯別の必要人数を確認できます。
                                </div>
                            </div>
                    ) : (
                            <>
                                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                                    {[
                                        {
                                            label: "表示時間帯",
                                            value: dayViewSummary.windowLabel,
                                            tone: c.textPrimary,
                                        },
                                        {
                                            label: "必要人時合計",
                                            value: formatHourValue(analysisData.totalRequiredHours),
                                            tone: c.textPrimary,
                                        },
                                        {
                                            label: "出勤予定人時",
                                            value: formatHourValue(analysisData.totalScheduledHours),
                                            tone: "text-cyan-500",
                                        },
                                        {
                                            label: "過不足",
                                            value: `${analysisData.gapHours > 0 ? "+" : ""}${formatHourValue(analysisData.gapHours)}`,
                                            tone: analysisData.gapHours < 0 ? "text-rose-500" : analysisData.gapHours > 0 ? "text-emerald-500" : c.textPrimary,
                                        },
                                        {
                                            label: "不足人数（8h換算）",
                                            value: `${analysisData.shortageWorkers}名`,
                                            tone: analysisData.shortageWorkers > 0 ? "text-rose-500" : "text-emerald-500",
                                        },
                                    ].map((item) => (
                                        <div key={item.label} className={`rounded-2xl border px-4 py-3 ${c.bgSurface} ${c.borderCard}`}>
                                            <div className={`text-[11px] ${c.textMuted}`}>{item.label}</div>
                                            <div className={`mt-2 text-[22px] font-semibold ${item.tone}`}>{item.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {dayViewChartRows.length === 0 ? (
                                    <div className={`mt-6 rounded-2xl border px-5 py-8 text-center ${c.bgSurface} ${c.borderCard}`}>
                                        <div className={`text-[15px] font-semibold ${c.textPrimary}`}>表示できる時間帯データがありません</div>
                                        <div className={`mt-2 text-[12px] ${c.textSecondary}`}>
                                            シフト時間または工程の作業時間帯を確認してください。
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                                        <div className={`rounded-3xl border p-4 ${c.bgSurface} ${c.borderCard}`}>
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <div className={`text-[13px] font-semibold ${c.textPrimary}`}>時間帯別 人員チャート</div>
                                                    <div className={`mt-1 text-[11px] ${c.textSecondary}`}>
                                                        バーが出勤人数、ラインが必要人数です。ホバーで過不足と稼働工程を確認できます。
                                                    </div>
                                                </div>
                                                <div className={`flex flex-wrap items-center gap-3 text-[11px] ${c.textSecondary}`}>
                                                    <span className="inline-flex items-center gap-1">
                                                        <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                                                        出勤人数
                                                    </span>
                                                    <span className="inline-flex items-center gap-1">
                                                        <span className="h-0.5 w-4 rounded-full bg-rose-500" />
                                                        必要人数
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="mt-4 h-[360px]">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <ComposedChart data={dayViewChartRows} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
                                                        <XAxis
                                                            dataKey="label"
                                                            stroke={chartAxisStroke}
                                                            tick={{ fontSize: 11, fill: chartTickFill }}
                                                            minTickGap={24}
                                                        />
                                                        <YAxis
                                                            stroke={chartAxisStroke}
                                                            tick={{ fontSize: 11, fill: chartTickFill }}
                                                            allowDecimals
                                                        />
                                                        <Tooltip
                                                            contentStyle={{
                                                                backgroundColor: chartTooltipBg,
                                                                border: `1px solid ${chartTooltipBorder}`,
                                                                borderRadius: "12px",
                                                                color: chartTooltipColor,
                                                                fontSize: "12px",
                                                            }}
                                                            formatter={(value: number | string, name: number | string) => [
                                                                `${formatHeadcountValue(Number(value))}名`,
                                                                name === "requiredHeadcount" ? "必要人数" : "出勤人数",
                                                            ]}
                                                            labelFormatter={(label, payload) => {
                                                                const point = payload?.[0]?.payload as { processLabel?: string } | undefined;
                                                                return point?.processLabel ? `${label} | ${point.processLabel}` : String(label);
                                                            }}
                                                        />
                                                        <Legend wrapperStyle={{ fontSize: "11px", color: chartTickFill }} />
                                                        <Bar
                                                            dataKey="availableHeadcount"
                                                            name="出勤人数"
                                                            fill="#06b6d4"
                                                            radius={[8, 8, 0, 0]}
                                                            barSize={dayViewGranularity === 15 ? 10 : dayViewGranularity === 30 ? 16 : 24}
                                                        />
                                                        <Line
                                                            type="monotone"
                                                            dataKey="requiredHeadcount"
                                                            name="必要人数"
                                                            stroke="#f43f5e"
                                                            strokeWidth={2.5}
                                                            dot={false}
                                                            activeDot={{ r: 4 }}
                                                        />
                                                    </ComposedChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className={`rounded-2xl border px-4 py-4 ${c.bgSurface} ${c.borderCard}`}>
                                                <div className={`text-[13px] font-semibold ${c.textPrimary}`}>逼迫時間帯</div>
                                                <div className={`mt-1 text-[11px] ${c.textSecondary}`}>
                                                    不足が大きい順に表示
                                                </div>
                                            </div>
                                            {dayViewBottlenecks.length === 0 ? (
                                                <div className={`rounded-2xl border px-4 py-4 text-[12px] ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
                                                    すべての時間帯で必要人数を満たしています。
                                                </div>
                                            ) : (
                                                dayViewBottlenecks.map((row) => {
                                                    const shortage = row.requiredHeadcount - row.availableHeadcount;
                                                    const processLabel =
                                                        row.activeProcesses.length <= 2
                                                            ? row.activeProcesses.join(" / ")
                                                            : `${row.activeProcesses.slice(0, 2).join(" / ")} +${row.activeProcesses.length - 2}`;

                                                    return (
                                                        <div key={row.label} className={`rounded-2xl border px-4 py-4 ${c.bgSurface} ${c.borderCard}`}>
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{row.label}</div>
                                                                    <div className={`mt-1 text-[11px] leading-5 ${c.textSecondary}`}>{processLabel || "-"}</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-[20px] font-semibold text-rose-500">
                                                                        {formatHeadcountValue(shortage)}名
                                                                    </div>
                                                                    <div className={`text-[10px] ${c.textMuted}`}>不足</div>
                                                                </div>
                                                            </div>
                                                            <div className={`mt-3 text-[11px] ${c.textSecondary}`}>
                                                                必要 {formatHeadcountValue(row.requiredHeadcount)}名 / 出勤 {row.availableHeadcount}名
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </div>
            ) : (
            <div className={`flex-1 ${c.bgCard} border ${c.border} rounded-xl overflow-hidden shadow-md flex flex-col`}>
                <div ref={scrollContainerRef} className={`flex-1 overflow-auto ${bodySurface} custom-scrollbar`}>
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
                                    const isHolidayColumn = h.dow === 0 || h.dow === 6 || !!h.holidayName;
                                    const isSelected = selectedDays.has(h.day);
                                    return (
                                        <th
                                            key={h.day}
                                            onClick={() => {
                                                toggleDaySelection(h.day);
                                                setAnalysisDay(h.day);
                                            }}
                                            className={`p-2 border-b border-r ${c.border} text-center cursor-pointer transition-all ${
                                                isHolidayColumn
                                                    ? `${holidayColumnHeaderClass} ${isSelected ? "ring-2 ring-inset ring-cyan-600" : ""}`
                                                    : isSelected
                                                        ? "bg-cyan-500/20"
                                                        : c.isDark
                                                            ? "bg-[#171726] hover:bg-white/[0.05]"
                                                            : "bg-gray-50 hover:bg-gray-100"
                                            }`}
                                            style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}
                                        >
                                            <div className="flex flex-col items-center">
                                                <span className={`text-[14px] font-bold ${getDayNumberClass(h.dow, isSelected, h.holidayName)}`}>{h.day}</span>
                                                <span className={`text-[10px] ${getDayLabelClass(h.dow, isSelected, h.holidayName)}`}>{["日", "月", "火", "水", "木", "金", "土"][h.dow]}</span>
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
                                            {dayHeaders.map(h => {
                                                const isHolidayColumn = h.dow === 0 || h.dow === 6 || !!h.holidayName;
                                                const isSelectedDay = selectedDays.has(h.day);
                                                return (
                                                    <td
                                                        key={h.day}
                                                        className={`border-b border-r ${c.border} ${
                                                            isHolidayColumn
                                                                ? `${holidayColumnCellClass} ${isSelectedDay ? "ring-1 ring-inset ring-cyan-600" : ""}`
                                                                : `bg-gray-500/5 ${isSelectedDay ? "bg-cyan-500/10" : ""}`
                                                        }`}
                                                    />
                                                );
                                            })}
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
                                                        const isHolidayColumn = h.dow === 0 || h.dow === 6 || !!h.holidayName;
                                                        const isEditing = editingCell?.workerId === worker.id && editingCell?.day === h.day;
                                                        const cellKey = getCellKey(worker.id, h.day);
                                                        const isDirectlySelected = selectedCellKeys.has(cellKey);
                                                        const isSelectedCell = isDirectlySelected || isRowSelected || selectedDays.has(h.day);
                                                        const isIntersected = isDirectlySelected || (isRowSelected && selectedDays.has(h.day));
                                                        const hasPlan = shift && !shift.isOff;
                                                        const editingCellSurfaceClass = c.isDark ? "bg-cyan-500/18" : "bg-cyan-100";
                                                        const selectedCellTextClass = isEditing
                                                            ? (c.isDark ? "text-cyan-100" : "text-slate-900")
                                                            : isSelectedCell
                                                                ? (c.isDark ? "text-cyan-200" : "text-slate-900")
                                                                : c.textPrimary;
                                                        const popoverShift = isEditing ? (editingShiftDraft ?? createShiftEditorDraft(shift)) : shift;
                                                                        const visibleQuickTemplates = quickTemplates.filter((template) => template.category === worker.category);
                                                                        const matchedTemplate =
                                                                            visibleQuickTemplates.find((template) => template.id === popoverShift?.templateId)
                                                                            ?? visibleQuickTemplates.find((template) => template.start === popoverShift?.start && template.end === popoverShift?.end)
                                                                            ?? quickTemplates.find((template) => template.id === popoverShift?.templateId)
                                                                            ?? quickTemplates.find((template) => template.start === popoverShift?.start && template.end === popoverShift?.end);
                                                        const shiftAdjustment = ensureShiftAdjustment(popoverShift);
                                                        const plannedStart = shiftAdjustment.plannedStart || matchedTemplate?.start || popoverShift?.start || "";
                                                        const plannedEnd = shiftAdjustment.plannedEnd || matchedTemplate?.end || popoverShift?.end || "";
                                                        const currentAdjustmentKind = shiftAdjustment.kind;
                                                        const shiftComplianceItems = getShiftComplianceItems(popoverShift);
                                                        const adjustmentDuration =
                                                            currentAdjustmentKind === "late" && plannedStart && popoverShift?.start
                                                                ? Math.max(0, calculateHours(plannedStart, popoverShift.start))
                                                                : currentAdjustmentKind === "overtime" && plannedEnd && popoverShift?.end
                                                                    ? Math.max(0, calculateHours(plannedEnd, popoverShift.end))
                                                                    : currentAdjustmentKind === "earlyLeave" && plannedEnd && popoverShift?.end
                                                                        ? Math.max(0, calculateHours(popoverShift.end, plannedEnd))
                                                                        : 0;
                                                        return (
                                                            <td
                                                                key={h.day}
                                                                data-shift-cell={`${worker.id}:${h.day}`}
                                                                className={`p-0 border-b border-r ${c.border} text-center relative ${
                                                                    isHolidayColumn
                                                                        ? `${holidayColumnCellClass} ${isEditing ? "ring-2 ring-inset ring-cyan-600" : isIntersected ? "ring-2 ring-inset ring-cyan-600" : isSelectedCell ? "ring-1 ring-inset ring-cyan-600" : ""}`
                                                                        : isEditing
                                                                            ? editingCellSurfaceClass
                                                                        : isIntersected
                                                                            ? "bg-cyan-500/15"
                                                                            : isSelectedCell
                                                                                ? "bg-cyan-500/5"
                                                                                : ""
                                                                }`}
                                                                style={{ width: CELL_WIDTH }}
                                                            >
                                                                <button
                                                                    data-shift-cell={`${worker.id}:${h.day}`}
                                                                    className={`w-full h-full min-h-[50px] flex flex-col items-center justify-center ${
                                                                        isEditing
                                                                            ? editingCellSurfaceClass
                                                                            : "hover:bg-cyan-500/10"
                                                                    } transition-colors py-2 gap-0.5`}
                                                                    onClick={(event) => handleCellClick(event, worker.id, h.day)}
                                                                >
                                                                    {hasPlan ? (
                                                                        <>
                                                                            <span className={`text-[12px] font-bold tabular-nums ${selectedCellTextClass}`}>{shift.start}</span>
                                                                            <span className={`text-[12px] font-bold tabular-nums ${selectedCellTextClass}`}>{shift.end}</span>
                                                                        </>
                                                                    ) : (
                                                                        <span className="block h-[18px]" />
                                                                    )}
                                                                </button>
                                                                {isEditing && editingCell ? (
                                                                    <div
                                                                        ref={cellEditorPopoverRef}
                                                                        className={`z-[120] p-3.5 ${popoverSurface} border-2 border-cyan-500 shadow-2xl rounded-xl flex flex-col gap-3 animate-in fade-in zoom-in duration-200 backdrop-blur-md`}
                                                                        style={getEditorPopoverStyle(editingCell.anchorRect)}
                                                                    >
                                                                        <div className={`flex items-center justify-between border-b pb-2 ${c.borderCard}`}>
                                                                            <span className={`text-[13px] font-bold ${c.textSecondary}`}>{h.day}日のシフト</span>
                                                                            <button onClick={closeCellEditor} className={`p-1 rounded-full transition-colors ${hoverSubtle}`}>
                                                                                <X className={`w-4 h-4 ${c.textMuted}`} />
                                                                            </button>
                                                                        </div>

                                                                        <div className="grid grid-cols-4 gap-2">
                                                                            {visibleQuickTemplates.map((template) => {
                                                                                const isActiveTemplate =
                                                                                    !popoverShift?.isOff &&
                                                                                    popoverShift?.start === template.start &&
                                                                                    popoverShift?.end === template.end;
                                                                                return (
                                                                                    <button
                                                                                        key={template.id}
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setEditingShiftDraft({
                                                                                                start: template.start,
                                                                                                end: template.end,
                                                                                                isOff: false,
                                                                                                templateId: template.id,
                                                                                                breaks: cloneShiftBreaks(template.breaks),
                                                                                                adjustment: {
                                                                                                    kind: "none",
                                                                                                    note: "",
                                                                                                    plannedStart: template.start,
                                                                                                    plannedEnd: template.end,
                                                                                                },
                                                                                            })
                                                                                        }
                                                                                        className={`text-[11px] font-bold py-1.5 rounded-lg transition-all border shadow-sm ${
                                                                                            isActiveTemplate
                                                                                                ? (c.isDark
                                                                                                    ? "bg-[#155DFC]/18 border-[#155DFC]/50 text-[#A9C5FF]"
                                                                                                    : "bg-[#EEF4FF] border-[#155DFC] text-[#155DFC]")
                                                                                                : `${secondaryButtonClass} hover:bg-[#155DFC]/12 hover:border-[#155DFC] hover:text-[#155DFC]`
                                                                                        }`}
                                                                                    >
                                                                                        {template.name}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                            {visibleQuickTemplates.length === 0 ? (
                                                                                <div className="col-span-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-[11px] text-slate-500">
                                                                                    この雇用形態で使えるテンプレートはありません
                                                                                </div>
                                                                            ) : null}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    setEditingShiftDraft({
                                                                                        start: "",
                                                                                        end: "",
                                                                                        isOff: true,
                                                                                        templateId: null,
                                                                                        breaks: [],
                                                                                        adjustment: {
                                                                                            kind: "none",
                                                                                            note: "",
                                                                                            plannedStart: "",
                                                                                            plannedEnd: "",
                                                                                        },
                                                                                    })
                                                                                }
                                                                                className={`text-[11px] font-bold py-1.5 rounded-lg transition-all border shadow-sm ${
                                                                                    popoverShift?.isOff
                                                                                        ? "bg-rose-500 text-white border-rose-600"
                                                                                        : `${secondaryButtonClass} hover:bg-rose-500/10 hover:border-rose-400 hover:text-rose-500`
                                                                                }`}
                                                                            >
                                                                                休
                                                                            </button>
                                                                        </div>

                                                                        <div className="flex items-center gap-2 w-full justify-between">
                                                                            <div className="flex flex-col gap-1 flex-1">
                                                                                <span className={`text-[10px] ${c.textMuted} uppercase font-bold text-center`}>開始</span>
                                                                                <input
                                                                                    type="text"
                                                                                    value={popoverShift?.start ?? ""}
                                                                                    onChange={(e) =>
                                                                                        setEditingShiftDraft((current) => ({
                                                                                            ...(current ?? createShiftEditorDraft(shift)),
                                                                                            start: e.target.value,
                                                                                            isOff: false,
                                                                                        }))
                                                                                    }
                                                                                    className={inputClass}
                                                                                />
                                                                            </div>
                                                                            <div className={`pt-4 ${c.textMuted} font-bold`}>~</div>
                                                                            <div className="flex flex-col gap-1 flex-1">
                                                                                <span className={`text-[10px] ${c.textMuted} uppercase font-bold text-center`}>終了</span>
                                                                                <input
                                                                                    type="text"
                                                                                    value={popoverShift?.end ?? ""}
                                                                                    onChange={(e) =>
                                                                                        setEditingShiftDraft((current) => ({
                                                                                            ...(current ?? createShiftEditorDraft(shift)),
                                                                                            end: e.target.value,
                                                                                            isOff: false,
                                                                                        }))
                                                                                    }
                                                                                    className={inputClass}
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className={`-mt-2 text-right text-[10px] font-semibold ${c.textMuted}`}>
                                                                            {popoverShift?.isOff
                                                                                ? "休日"
                                                                                : `実働 ${calculateHours(popoverShift?.start ?? "", popoverShift?.end ?? "").toFixed(1)}h / 休憩 ${calculateBreakHoursFromAssignments(popoverShift?.breaks ?? []).toFixed(1)}h`}
                                                                        </div>

                                                                        {editorShiftTab === "plan" ? (
                                                                            <div className="flex flex-col gap-2">
                                                                                {shiftComplianceItems.length ? (
                                                                                    <div className="flex flex-wrap gap-1.5">
                                                                                        {shiftComplianceItems.map((item) => (
                                                                                            <span
                                                                                                key={item.label}
                                                                                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                                                                                    item.tone === "warn"
                                                                                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                                                                                        : c.isDark
                                                                                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                                                                                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                                                                }`}
                                                                                            >
                                                                                                {item.tone === "warn" ? (
                                                                                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                                                                                ) : (
                                                                                                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                                                                                                )}
                                                                                                {item.label}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : null}

                                                                                {matchedTemplate && !popoverShift?.isOff ? (
                                                                                    <div className={`-mt-1 text-[10px] font-semibold ${c.textMuted}`}>
                                                                                        テンプレート: {matchedTemplate.name}
                                                                                    </div>
                                                                                ) : null}

                                                                                {!popoverShift?.isOff ? (
                                                                                    <div className={`rounded-xl border p-2.5 ${c.bgSurface} ${c.borderCard}`}>
                                                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                                                            <span className={`text-[10px] font-bold uppercase ${c.textMuted}`}>休憩</span>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={addEditingShiftDraftBreak}
                                                                                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${c.borderCard} ${c.bgCard} ${c.textSecondary}`}
                                                                                            >
                                                                                                <Plus className="h-3 w-3" />
                                                                                                追加
                                                                                            </button>
                                                                                        </div>

                                                                                        {popoverShift?.breaks?.length ? (
                                                                                            <div className="flex flex-col gap-2">
                                                                                                {popoverShift.breaks.map((breakItem) => (
                                                                                                    <div key={breakItem.id} className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-1.5">
                                                                                                        <input
                                                                                                            type="text"
                                                                                                            value={breakItem.name}
                                                                                                            onChange={(event) =>
                                                                                                                updateEditingShiftDraftBreak(breakItem.id, { name: event.target.value })
                                                                                                            }
                                                                                                            className={`rounded-md border px-2 py-1.5 text-[11px] ${c.bgInput} ${c.borderCard} ${c.textPrimary} outline-none`}
                                                                                                        />
                                                                                                        <input
                                                                                                            type="text"
                                                                                                            value={breakItem.start}
                                                                                                            onChange={(event) =>
                                                                                                                updateEditingShiftDraftBreak(breakItem.id, { start: event.target.value })
                                                                                                            }
                                                                                                            className={`rounded-md border px-2 py-1.5 text-[11px] tabular-nums ${c.bgInput} ${c.borderCard} ${c.textPrimary} outline-none`}
                                                                                                        />
                                                                                                        <input
                                                                                                            type="text"
                                                                                                            value={breakItem.end}
                                                                                                            onChange={(event) =>
                                                                                                                updateEditingShiftDraftBreak(breakItem.id, { end: event.target.value })
                                                                                                            }
                                                                                                            className={`rounded-md border px-2 py-1.5 text-[11px] tabular-nums ${c.bgInput} ${c.borderCard} ${c.textPrimary} outline-none`}
                                                                                                        />
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className={`rounded-lg border border-dashed px-3 py-2 text-center text-[11px] ${c.borderCard} ${c.textMuted}`}>
                                                                                                休憩なし
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                ) : null}

                                                                                <div className="flex items-center justify-end gap-2 pt-1">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={closeCellEditor}
                                                                                        className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${secondaryButtonClass}`}
                                                                                    >
                                                                                        キャンセル
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={saveCellEditor}
                                                                                        className="rounded-lg bg-[#155DFC] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-[#0F4FE3]"
                                                                                    >
                                                                                        保存
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex flex-col gap-2.5">
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                        {SHIFT_ADJUSTMENT_OPTIONS.map((option) => {
                                                                                            const selected = currentAdjustmentKind === option.kind;
                                                                                            return (
                                                                                                <button
                                                                                                    key={option.kind}
                                                                                                    type="button"
                                                                                                    onClick={() => applyAdjustmentKind(worker.id, h.day, option.kind, shift)}
                                                                                                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                                                                                                        selected
                                                                                                            ? "border-[#EF9F27] bg-[#FAEEDA] text-[#854F0B]"
                                                                                                            : `${c.borderCard} ${c.bgCard} ${c.textSecondary} hover:border-[#EF9F27]/40 hover:text-[#854F0B]`
                                                                                                    }`}
                                                                                                >
                                                                                                    {option.label}
                                                                                                </button>
                                                                                            );
                                                                                        })}
                                                                                </div>

                                                                                <div className={`rounded-xl border p-2.5 text-[11px] ${c.bgSurface} ${c.borderCard}`}>
                                                                                    {currentAdjustmentKind === "late" ? (
                                                                                        <div className="grid grid-cols-3 gap-2">
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>予定開始</div><div className={`mt-0.5 font-semibold tabular-nums ${c.textPrimary}`}>{plannedStart || "-"}</div></div>
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>調整後</div><div className={`mt-0.5 font-semibold tabular-nums ${c.textPrimary}`}>{shift?.start || "-"}</div></div>
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>遅刻</div><div className="mt-0.5 font-semibold text-amber-600">{adjustmentDuration.toFixed(1)}h</div></div>
                                                                                        </div>
                                                                                    ) : currentAdjustmentKind === "overtime" ? (
                                                                                        <div className="grid grid-cols-3 gap-2">
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>予定終了</div><div className={`mt-0.5 font-semibold tabular-nums ${c.textPrimary}`}>{plannedEnd || "-"}</div></div>
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>調整後</div><div className={`mt-0.5 font-semibold tabular-nums ${c.textPrimary}`}>{shift?.end || "-"}</div></div>
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>延長</div><div className="mt-0.5 font-semibold text-sky-600">{adjustmentDuration.toFixed(1)}h</div></div>
                                                                                        </div>
                                                                                    ) : currentAdjustmentKind === "earlyLeave" ? (
                                                                                        <div className="grid grid-cols-3 gap-2">
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>予定終了</div><div className={`mt-0.5 font-semibold tabular-nums ${c.textPrimary}`}>{plannedEnd || "-"}</div></div>
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>調整後</div><div className={`mt-0.5 font-semibold tabular-nums ${c.textPrimary}`}>{shift?.end || "-"}</div></div>
                                                                                            <div className={`rounded-lg border px-2 py-1.5 ${c.bgCard} ${c.borderCard}`}><div className={`text-[10px] ${c.textMuted}`}>早退</div><div className="mt-0.5 font-semibold text-amber-600">{adjustmentDuration.toFixed(1)}h</div></div>
                                                                                        </div>
                                                                                    ) : currentAdjustmentKind === "absence" ? (
                                                                                        <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${c.bgCard} ${c.borderCard} ${c.textSecondary}`}>当日は欠勤として扱います。</div>
                                                                                    ) : currentAdjustmentKind === "handoff" ? (
                                                                                        <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${c.bgCard} ${c.borderCard} ${c.textSecondary}`}>担当変更・入替内容をメモへ記録できます。</div>
                                                                                    ) : (
                                                                                        <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${c.bgCard} ${c.borderCard} ${c.textSecondary}`}>調整内容を選ぶとここに要点が出ます。</div>
                                                                                    )}
                                                                                </div>

                                                                                <label className="flex flex-col gap-1">
                                                                                    <span className={`text-[10px] font-semibold ${c.textMuted}`}>メモ</span>
                                                                                    <textarea
                                                                                        value={shiftAdjustment.note}
                                                                                        onChange={(event) =>
                                                                                            updateShiftAdjustment(worker.id, h.day, { note: event.target.value }, shift)
                                                                                        }
                                                                                        rows={2}
                                                                                        className={`w-full resize-none rounded-lg border px-2.5 py-2 text-[11px] ${c.bgInput} ${c.borderCard} ${c.textPrimary} outline-none placeholder:text-gray-400 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20`}
                                                                                        placeholder="当日の補足を入力"
                                                                                    />
                                                                                </label>

                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        updateShiftAdjustment(
                                                                                            worker.id,
                                                                                            h.day,
                                                                                            { kind: "none", note: "", plannedStart, plannedEnd },
                                                                                            shift,
                                                                                        )
                                                                                    }
                                                                                    className={`rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition ${secondaryButtonClass} hover:border-slate-400/50`}
                                                                                >
                                                                                    調整をクリア
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : null}
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
                                    const isHolidayColumn = h.dow === 0 || h.dow === 6 || !!h.holidayName;
                                    return (
                                        <td
                                            key={h.day}
                                            className={`p-2 border-t border-r ${c.border} text-center font-black ${
                                                isHolidayColumn
                                                    ? `${holidayColumnCellClass} ${selectedDays.has(h.day) ? "ring-1 ring-inset ring-cyan-600" : ""}`
                                                    : selectedDays.has(h.day)
                                                        ? "bg-cyan-500/10"
                                                        : ""
                                            }`}
                                            style={{ width: CELL_WIDTH }}
                                        >
                                            <div className={`text-[15px] ${count > 0 ? (c.isDark ? "text-cyan-300" : "text-cyan-600 shadow-sm") : c.textDimmed}`}>{count}</div>
                                        </td>
                                    );
                                })}
                                <td className={`p-3 border-t ${c.border} sticky right-0 z-50 ${raisedSurface} shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.15)]`} style={{ width: '80px' }}></td>
                            </tr>
                            <tr className={raisedSurface}>
                                <td className={`p-3 border-t border-r ${c.border} sticky left-0 z-50 ${raisedSurface} text-[13px] font-bold ${c.textSecondary}`} style={{ width: SIDEBAR_WIDTH }}>
                                    人時 (Hours)
                                </td>
                                {dayHeaders.map(h => {
                                    const hours = getDailyScheduledHours(h.day);
                                    const isHolidayColumn = h.dow === 0 || h.dow === 6 || !!h.holidayName;
                                    return (
                                        <td
                                            key={h.day}
                                            className={`p-2 border-t border-r ${c.border} text-center font-black ${
                                                isHolidayColumn
                                                    ? `${holidayColumnCellClass} ${selectedDays.has(h.day) ? "ring-1 ring-inset ring-cyan-600" : ""}`
                                                    : selectedDays.has(h.day)
                                                        ? "bg-cyan-500/10"
                                                        : ""
                                            }`}
                                            style={{ width: CELL_WIDTH }}
                                        >
                                            <div className={`text-[13px] ${c.textPrimary}`}>
                                                {hours}
                                                <span className={`ml-0.5 text-[10px] font-normal ${c.textMuted}`}>h</span>
                                            </div>
                                        </td>
                                    );
                                })}
                                <td
                                    className={`p-3 border-t ${c.border} sticky right-0 z-50 ${raisedSurface} text-center font-bold text-[13px] ${c.textPrimary} shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.15)]`}
                                    style={{ width: '80px' }}
                                >
                                    {getMonthlyScheduledHoursTotal()}
                                    <span className={`ml-0.5 text-[10px] font-normal ${c.textMuted}`}>h</span>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Bulk Action Toolbar - Floating */}
                {isBulkActive && (
                    <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-[100] min-w-[920px] max-w-[1080px] ${popoverSurface} border-2 border-cyan-500 shadow-[0_8px_32px_rgba(0,0,0,0.25)] rounded-2xl p-4 flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 backdrop-blur-md`}>
                        <div className="flex items-start justify-between gap-6">
                            <div className={`flex flex-col border-r pr-6 ${c.borderCard}`}>
                                <div className={`flex items-center gap-2 ${c.isDark ? "text-cyan-400" : "text-cyan-600"} mb-1`}>
                                    <Zap className="w-4 h-4 fill-cyan-500" />
                                    <span className="text-[12px] font-black uppercase tracking-wider">一括編集モード</span>
                                </div>
                                <span className={`text-[11px] ${c.textSecondary} font-bold whitespace-nowrap`}>{selectedTargetKeys.size}セルを選択中</span>
                            </div>

                            <div className="min-w-0 flex-1 flex flex-col gap-3">
                                <div className="flex items-center justify-between gap-3">
                                    <span className={`text-[10px] ${c.textMuted} font-bold`}>共通シフト</span>
                                    {selectedBulkTemplate ? (
                                        <span className={`text-[10px] font-semibold ${c.textMuted}`}>
                                            テンプレート: {selectedBulkTemplate.name}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {quickTemplates.map(template => {
                                        const isActive = bulkShiftDraft?.templateId === template.id;
                                        return (
                                            <button
                                                key={template.id}
                                                type="button"
                                                onClick={() => setBulkShiftDraft(createBulkShiftDraft(template))}
                                                className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all shadow-sm active:scale-95 ${
                                                    isActive
                                                        ? "bg-[#155DFC] border border-[#155DFC] text-white"
                                                        : c.isDark
                                                            ? "bg-[#155DFC]/10 border border-[#155DFC]/30 text-[#A9C5FF] hover:bg-[#155DFC]/18"
                                                            : "bg-[#EEF4FF] border border-[#B7CDFF] text-[#155DFC] hover:bg-[#DDEAFF]"
                                                }`}
                                            >
                                                {template.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => applyBulkShift("", "", true, [], null)}
                                    className="flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 rounded-lg text-[13px] font-bold hover:bg-rose-500 hover:text-white transition-all shadow-sm whitespace-nowrap"
                                >
                                    <CalendarX className="w-4 h-4" /> 一括休日
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

                        <div className="grid grid-cols-[180px_1fr] gap-4">
                            <div className={`rounded-xl border p-3 ${c.bgSurface} ${c.borderCard} flex flex-col gap-3`}>
                                <div className="flex items-center gap-2">
                                    <div className="flex flex-col gap-1 flex-1">
                                        <span className={`text-[10px] ${c.textMuted} uppercase font-bold text-center`}>開始</span>
                                        <input
                                            type="text"
                                            value={bulkShiftDraft?.start ?? ""}
                                            onChange={(e) =>
                                                setBulkShiftDraft((current) => ({
                                                    ...(current ?? createBulkShiftDraft()),
                                                    start: e.target.value,
                                                    isOff: false,
                                                }))
                                            }
                                            className={inputClass}
                                        />
                                    </div>
                                    <div className={`pt-4 ${c.textMuted} font-bold`}>~</div>
                                    <div className="flex flex-col gap-1 flex-1">
                                        <span className={`text-[10px] ${c.textMuted} uppercase font-bold text-center`}>終了</span>
                                        <input
                                            type="text"
                                            value={bulkShiftDraft?.end ?? ""}
                                            onChange={(e) =>
                                                setBulkShiftDraft((current) => ({
                                                    ...(current ?? createBulkShiftDraft()),
                                                    end: e.target.value,
                                                    isOff: false,
                                                }))
                                            }
                                            className={inputClass}
                                        />
                                    </div>
                                </div>

                                <div className={`text-right text-[10px] font-semibold ${c.textMuted}`}>
                                    実働 {calculateHours(bulkShiftDraft?.start ?? "", bulkShiftDraft?.end ?? "").toFixed(1)}h / 休憩 {calculateBreakHoursFromAssignments(bulkShiftDraft?.breaks ?? []).toFixed(1)}h
                                </div>

                                {bulkComplianceItems.length ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {bulkComplianceItems.map((item) => (
                                            <span
                                                key={item.label}
                                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                                                    item.tone === "warn"
                                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                                        : c.isDark
                                                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                }`}
                                            >
                                                {item.tone === "warn" ? (
                                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                                ) : (
                                                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                                                )}
                                                {item.label}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}

                                <button
                                    type="button"
                                    onClick={() =>
                                        applyBulkShift(
                                            bulkShiftDraft?.start ?? "",
                                            bulkShiftDraft?.end ?? "",
                                            bulkShiftDraft?.isOff ?? false,
                                            bulkShiftDraft?.breaks ?? [],
                                            bulkShiftDraft?.templateId ?? null,
                                        )
                                    }
                                    className="rounded-lg bg-[#155DFC] px-4 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#0F4FE3]"
                                >
                                    一括適用
                                </button>
                            </div>

                            <div className={`rounded-xl border p-3 ${c.bgSurface} ${c.borderCard}`}>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className={`text-[10px] font-bold uppercase ${c.textMuted}`}>休憩</span>
                                    <button
                                        type="button"
                                        onClick={addBulkShiftDraftBreak}
                                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${c.borderCard} ${c.bgCard} ${c.textSecondary}`}
                                    >
                                        <Plus className="h-3 w-3" />
                                        追加
                                    </button>
                                </div>

                                {bulkShiftDraft?.breaks?.length ? (
                                    <div className="flex flex-col gap-2">
                                        {bulkShiftDraft.breaks.map((breakItem) => (
                                            <div key={breakItem.id} className="grid grid-cols-[minmax(0,1fr)_78px_78px_32px] gap-1.5">
                                                <input
                                                    type="text"
                                                    value={breakItem.name}
                                                    onChange={(event) => updateBulkShiftDraftBreak(breakItem.id, { name: event.target.value })}
                                                    className={`rounded-md border px-2 py-1.5 text-[11px] ${c.bgInput} ${c.borderCard} ${c.textPrimary} outline-none`}
                                                />
                                                <input
                                                    type="text"
                                                    value={breakItem.start}
                                                    onChange={(event) => updateBulkShiftDraftBreak(breakItem.id, { start: event.target.value })}
                                                    className={`rounded-md border px-2 py-1.5 text-[11px] tabular-nums ${c.bgInput} ${c.borderCard} ${c.textPrimary} outline-none`}
                                                />
                                                <input
                                                    type="text"
                                                    value={breakItem.end}
                                                    onChange={(event) => updateBulkShiftDraftBreak(breakItem.id, { end: event.target.value })}
                                                    className={`rounded-md border px-2 py-1.5 text-[11px] tabular-nums ${c.bgInput} ${c.borderCard} ${c.textPrimary} outline-none`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeBulkShiftDraftBreak(breakItem.id)}
                                                    className={`inline-flex h-[32px] w-[32px] items-center justify-center rounded-md border transition ${c.borderCard} ${c.bgCard} text-rose-500 hover:bg-rose-500/10`}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={`rounded-lg border border-dashed px-3 py-2 text-center text-[11px] ${c.borderCard} ${c.textMuted}`}>
                                        休憩なし
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Legend */}
                <div className={`px-6 py-4 border-t ${c.border} ${raisedSurface} flex items-center justify-end text-[12px]`}>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${c.bgCard} ${c.isDark ? "text-cyan-300" : "text-cyan-600"} font-bold shadow-sm`}>
                        <Info className="w-4 h-4" />
                        <span>左上チェック・日付クリックに加えて、Ctrl/Cmd + セルクリックでも複数選択して一括編集できます</span>
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}


