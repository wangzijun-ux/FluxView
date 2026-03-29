import { readAttendanceWorkers, type AttendanceWorker } from "./workforceStore";

export interface BreakTemplate {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface ShiftBreakAssignment {
  id: string;
  templateId: string | null;
  name: string;
  start: string;
  end: string;
}

export type ShiftAdjustmentKind = "none" | "late" | "overtime" | "earlyLeave" | "absence" | "handoff";

export interface ShiftAdjustment {
  kind: ShiftAdjustmentKind;
  note: string;
  plannedStart?: string;
  plannedEnd?: string;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  category: string;
  start: string;
  end: string;
  color: string;
  isDefault?: boolean;
  breaks: ShiftBreakAssignment[];
}

export interface AttendanceTemplateStore {
  shiftTemplates: ShiftTemplate[];
  breakTemplates: BreakTemplate[];
}

export interface ShiftData {
  start: string;
  end: string;
  isOff: boolean;
  breaks?: ShiftBreakAssignment[];
  templateId?: string | null;
  adjustment?: ShiftAdjustment;
}

export type MonthlyShifts = Record<string, Record<number, ShiftData>>;
type AttendanceStore = Record<string, MonthlyShifts>;

const ATTENDANCE_STORAGE_KEY = "fluxview-attendance-shifts-v1";
const ATTENDANCE_TEMPLATE_STORAGE_KEY = "fluxview-attendance-templates-v1";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month, day).getDay();
}

function normalizeWorkerKey(value: string) {
  return value.replace(/[\s\u3000]/g, "").toLowerCase();
}

function cloneShiftBreakAssignments(items: ShiftBreakAssignment[] = []) {
  return items.map((item) => ({ ...item }));
}

function createDefaultShiftAdjustment(
  plannedStart = "",
  plannedEnd = "",
  kind: ShiftAdjustmentKind = "none",
): ShiftAdjustment {
  return {
    kind,
    note: "",
    plannedStart,
    plannedEnd,
  };
}

export function createShiftBreakAssignmentFromTemplate(template: BreakTemplate, suffix = Date.now().toString()) {
  return {
    id: `${template.id}:${suffix}`,
    templateId: template.id,
    name: template.name,
    start: template.start,
    end: template.end,
  } satisfies ShiftBreakAssignment;
}

export function createDefaultAttendanceTemplates(): AttendanceTemplateStore {
  const breakTemplates: BreakTemplate[] = [
    { id: "break-morning-15", name: "午前休憩", start: "10:00", end: "10:15" },
    { id: "break-lunch-45", name: "昼休憩", start: "12:00", end: "12:45" },
    { id: "break-afternoon-15", name: "午後休憩", start: "15:00", end: "15:15" },
    { id: "break-evening-45", name: "夕方休憩", start: "19:00", end: "19:45" },
    { id: "break-evening-15", name: "小休憩", start: "21:30", end: "21:45" },
    { id: "break-night-60", name: "深夜休憩", start: "02:00", end: "03:00" },
    { id: "break-partner-45", name: "パート休憩", start: "15:30", end: "16:15" },
  ];

  const lunchBreak = breakTemplates.find((item) => item.id === "break-lunch-45")!;
  const afternoonBreak = breakTemplates.find((item) => item.id === "break-afternoon-15")!;
  const eveningBreak = breakTemplates.find((item) => item.id === "break-evening-45")!;
  const eveningShortBreak = breakTemplates.find((item) => item.id === "break-evening-15")!;
  const nightBreak = breakTemplates.find((item) => item.id === "break-night-60")!;
  const partnerBreak = breakTemplates.find((item) => item.id === "break-partner-45")!;

  return {
    breakTemplates,
    shiftTemplates: [
      {
        id: "shift-day",
        name: "日勤",
        category: "正社員",
        start: "08:00",
        end: "16:00",
        color: "#378ADD",
        isDefault: true,
        breaks: [
          createShiftBreakAssignmentFromTemplate(lunchBreak, "day-lunch"),
          createShiftBreakAssignmentFromTemplate(afternoonBreak, "day-afternoon"),
        ],
      },
      {
        id: "shift-evening",
        name: "夕勤",
        category: "正社員",
        start: "16:00",
        end: "00:00",
        color: "#EF9F27",
        breaks: [
          createShiftBreakAssignmentFromTemplate(eveningBreak, "evening-main"),
          createShiftBreakAssignmentFromTemplate(eveningShortBreak, "evening-short"),
        ],
      },
      {
        id: "shift-night",
        name: "夜勤",
        category: "正社員",
        start: "22:00",
        end: "06:00",
        color: "#534AB7",
        breaks: [createShiftBreakAssignmentFromTemplate(nightBreak, "night-main")],
      },
      {
        id: "shift-partner-morning",
        name: "午前パート",
        category: "パートナー",
        start: "09:00",
        end: "13:00",
        color: "#1D9E75",
        isDefault: true,
        breaks: [],
      },
      {
        id: "shift-partner-afternoon",
        name: "午後パート",
        category: "パートナー",
        start: "13:00",
        end: "19:15",
        color: "#D85A30",
        breaks: [createShiftBreakAssignmentFromTemplate(partnerBreak, "partner-main")],
      },
      {
        id: "shift-dispatch-day",
        name: "派遣日勤",
        category: "派遣",
        start: "09:00",
        end: "17:00",
        color: "#6D7380",
        isDefault: true,
        breaks: [createShiftBreakAssignmentFromTemplate(lunchBreak, "dispatch-lunch")],
      },
    ],
  };
}

function buildDefaultShift(worker: AttendanceWorker, dayOfWeek: number): ShiftData {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (worker.category === "パートナー") {
    return {
      start: "09:00",
      end: "15:00",
      isOff: isWeekend,
      breaks: [],
      templateId: null,
      adjustment: createDefaultShiftAdjustment("09:00", "15:00"),
    };
  }

  if (worker.category === "派遣") {
    return {
      start: "09:00",
      end: "17:00",
      isOff: isWeekend,
      breaks: [],
      templateId: null,
      adjustment: createDefaultShiftAdjustment("09:00", "17:00"),
    };
  }

  return {
    start: "08:00",
    end: "17:00",
    isOff: isWeekend,
    breaks: [],
    templateId: null,
    adjustment: createDefaultShiftAdjustment("08:00", "17:00"),
  };
}

function normalizeBreakTemplate(value: unknown, fallback: BreakTemplate): BreakTemplate {
  if (!value || typeof value !== "object") return fallback;
  const template = value as Partial<BreakTemplate>;
  return {
    id: typeof template.id === "string" && template.id.trim() ? template.id : fallback.id,
    name: typeof template.name === "string" && template.name.trim() ? template.name.trim() : fallback.name,
    start: typeof template.start === "string" ? template.start : fallback.start,
    end: typeof template.end === "string" ? template.end : fallback.end,
  };
}

function normalizeShiftBreakAssignment(value: unknown, fallback: ShiftBreakAssignment): ShiftBreakAssignment {
  if (!value || typeof value !== "object") return fallback;
  const assignment = value as Partial<ShiftBreakAssignment>;
  return {
    id: typeof assignment.id === "string" && assignment.id.trim() ? assignment.id : fallback.id,
    templateId:
      typeof assignment.templateId === "string" && assignment.templateId.trim() ? assignment.templateId : fallback.templateId,
    name: typeof assignment.name === "string" && assignment.name.trim() ? assignment.name.trim() : fallback.name,
    start: typeof assignment.start === "string" ? assignment.start : fallback.start,
    end: typeof assignment.end === "string" ? assignment.end : fallback.end,
  };
}

function normalizeShiftTemplate(value: unknown, fallback: ShiftTemplate): ShiftTemplate {
  if (!value || typeof value !== "object") return fallback;
  const template = value as Partial<ShiftTemplate>;
  const rawBreaks = Array.isArray(template.breaks) ? template.breaks : fallback.breaks;
  return {
    id: typeof template.id === "string" && template.id.trim() ? template.id : fallback.id,
    name: typeof template.name === "string" && template.name.trim() ? template.name.trim() : fallback.name,
    category: typeof template.category === "string" && template.category.trim() ? template.category.trim() : fallback.category,
    start: typeof template.start === "string" ? template.start : fallback.start,
    end: typeof template.end === "string" ? template.end : fallback.end,
    color: typeof template.color === "string" && template.color.trim() ? template.color.trim() : fallback.color,
    isDefault: typeof template.isDefault === "boolean" ? template.isDefault : fallback.isDefault,
    breaks: rawBreaks.map((item, index) =>
      normalizeShiftBreakAssignment(item, fallback.breaks[index] ?? {
        id: `${fallback.id}:break:${index + 1}`,
        templateId: null,
        name: `休憩 ${index + 1}`,
        start: "12:00",
        end: "13:00",
      }),
    ),
  };
}

function normalizeShiftData(value: unknown, fallback: ShiftData) {
  if (!value || typeof value !== "object") return fallback;
  const shift = value as Partial<ShiftData>;
  const rawAdjustment = shift.adjustment;
  return {
    start: typeof shift.start === "string" ? shift.start : fallback.start,
    end: typeof shift.end === "string" ? shift.end : fallback.end,
    isOff: typeof shift.isOff === "boolean" ? shift.isOff : fallback.isOff,
    templateId:
      typeof shift.templateId === "string"
        ? shift.templateId
        : shift.templateId === null
          ? null
          : (fallback.templateId ?? null),
    breaks: Array.isArray(shift.breaks)
      ? shift.breaks.map((item, index) =>
          normalizeShiftBreakAssignment(item, fallback.breaks?.[index] ?? {
            id: `break:${index + 1}`,
            templateId: null,
            name: `休憩 ${index + 1}`,
            start: "12:00",
            end: "13:00",
          }),
        )
      : cloneShiftBreakAssignments(fallback.breaks ?? []),
    adjustment:
      rawAdjustment && typeof rawAdjustment === "object"
        ? {
            kind:
              rawAdjustment.kind === "late" ||
              rawAdjustment.kind === "overtime" ||
              rawAdjustment.kind === "earlyLeave" ||
              rawAdjustment.kind === "absence" ||
              rawAdjustment.kind === "handoff"
                ? rawAdjustment.kind
                : "none",
            note: typeof rawAdjustment.note === "string" ? rawAdjustment.note : fallback.adjustment?.note ?? "",
            plannedStart:
              typeof rawAdjustment.plannedStart === "string"
                ? rawAdjustment.plannedStart
                : fallback.adjustment?.plannedStart ?? fallback.start,
            plannedEnd:
              typeof rawAdjustment.plannedEnd === "string"
                ? rawAdjustment.plannedEnd
                : fallback.adjustment?.plannedEnd ?? fallback.end,
          }
        : {
            ...(fallback.adjustment ?? createDefaultShiftAdjustment(fallback.start, fallback.end)),
            plannedStart: fallback.adjustment?.plannedStart ?? fallback.start,
            plannedEnd: fallback.adjustment?.plannedEnd ?? fallback.end,
          },
  } satisfies ShiftData;
}

function resolveStoredShift(
  stored: MonthlyShifts,
  worker: AttendanceWorker,
  day: number,
  fallback: ShiftData,
) {
  const direct = stored[worker.id]?.[day];
  if (direct) return normalizeShiftData(direct, fallback);

  const legacyEntry = Object.entries(stored).find(([workerKey]) => normalizeWorkerKey(workerKey) === normalizeWorkerKey(worker.name));
  if (legacyEntry?.[1]?.[day]) {
    return normalizeShiftData(legacyEntry[1][day], fallback);
  }

  return fallback;
}

export function buildAttendanceMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function createDefaultMonthlyShifts(
  year: number,
  month: number,
  workers: AttendanceWorker[] = readAttendanceWorkers(),
): MonthlyShifts {
  const next: MonthlyShifts = {};
  const daysInMonth = getDaysInMonth(year, month);

  workers.forEach((worker) => {
    next[worker.id] = {};
    for (let day = 1; day <= daysInMonth; day += 1) {
      next[worker.id][day] = buildDefaultShift(worker, getDayOfWeek(year, month, day));
    }
  });

  return next;
}

export function readAttendanceStore(): AttendanceStore {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(ATTENDANCE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as AttendanceStore) : {};
  } catch {
    return {};
  }
}

export function readAttendanceMonthShifts(
  year: number,
  month: number,
  workers: AttendanceWorker[] = readAttendanceWorkers(),
): MonthlyShifts {
  const defaults = createDefaultMonthlyShifts(year, month, workers);
  const monthKey = buildAttendanceMonthKey(year, month);
  const stored = readAttendanceStore()[monthKey];
  if (!stored || typeof stored !== "object") return defaults;

  return Object.fromEntries(
    workers.map((worker) => [
      worker.id,
      Object.fromEntries(
        Object.entries(defaults[worker.id] ?? {}).map(([day, fallbackShift]) => [
          Number(day),
          resolveStoredShift(stored, worker, Number(day), fallbackShift),
        ]),
      ),
    ]),
  );
}

export function writeAttendanceMonthShifts(year: number, month: number, shifts: MonthlyShifts) {
  if (typeof window === "undefined") return;

  try {
    const nextStore = {
      ...readAttendanceStore(),
      [buildAttendanceMonthKey(year, month)]: shifts,
    };
    window.localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(nextStore));
  } catch {
    // Ignore storage failures and keep UI responsive.
  }
}

export function readAttendanceTemplates(): AttendanceTemplateStore {
  const defaults = createDefaultAttendanceTemplates();
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(ATTENDANCE_TEMPLATE_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;

    const record = parsed as Partial<AttendanceTemplateStore>;
    const breakTemplates = (Array.isArray(record.breakTemplates) ? record.breakTemplates : defaults.breakTemplates).map((item, index) =>
      normalizeBreakTemplate(item, defaults.breakTemplates[index] ?? {
        id: `break-template-${index + 1}`,
        name: `休憩テンプレート ${index + 1}`,
        start: "12:00",
        end: "13:00",
      }),
    );

    const shiftTemplates = (Array.isArray(record.shiftTemplates) ? record.shiftTemplates : defaults.shiftTemplates).map((item, index) =>
      normalizeShiftTemplate(item, defaults.shiftTemplates[index] ?? {
        id: `shift-template-${index + 1}`,
        name: `シフトテンプレート ${index + 1}`,
        category: "正社員",
        start: "08:00",
        end: "17:00",
        color: "#378ADD",
        isDefault: false,
        breaks: [],
      }),
    );

    return { shiftTemplates, breakTemplates };
  } catch {
    return defaults;
  }
}

export function writeAttendanceTemplates(templates: AttendanceTemplateStore) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(ATTENDANCE_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Ignore storage failures and keep UI responsive.
  }
}

export function resolveWorkerShiftForDate(
  workerIdOrName: string,
  dateKey: string,
  workers: AttendanceWorker[] = readAttendanceWorkers(),
) {
  const [yearPart, monthPart, dayPart] = dateKey.split("-").map(Number);
  if (!yearPart || !monthPart || !dayPart) return null;

  const normalizedTarget = normalizeWorkerKey(workerIdOrName);
  const worker = workers.find((item) =>
    normalizeWorkerKey(item.id) === normalizedTarget || normalizeWorkerKey(item.name) === normalizedTarget,
  );
  if (!worker) return null;

  const monthlyShifts = readAttendanceMonthShifts(yearPart, monthPart - 1, workers);
  return monthlyShifts[worker.id]?.[dayPart] ?? null;
}
