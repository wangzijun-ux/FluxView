import { readAttendanceWorkers, type AttendanceWorker } from "./workforceStore";

export interface ShiftData {
  start: string;
  end: string;
  isOff: boolean;
}

export type MonthlyShifts = Record<string, Record<number, ShiftData>>;
type AttendanceStore = Record<string, MonthlyShifts>;

const ATTENDANCE_STORAGE_KEY = "fluxview-attendance-shifts-v1";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(year, month, day).getDay();
}

function normalizeWorkerKey(value: string) {
  return value.replace(/[\s\u3000]/g, "").toLowerCase();
}

function buildDefaultShift(worker: AttendanceWorker, dayOfWeek: number): ShiftData {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (worker.category === "パートナー") {
    return { start: "09:00", end: "15:00", isOff: isWeekend };
  }

  if (worker.category === "派遣") {
    return { start: "09:00", end: "17:00", isOff: isWeekend };
  }

  return { start: "08:00", end: "17:00", isOff: isWeekend };
}

function normalizeShiftData(value: unknown, fallback: ShiftData) {
  if (!value || typeof value !== "object") return fallback;
  const shift = value as Partial<ShiftData>;
  return {
    start: typeof shift.start === "string" ? shift.start : fallback.start,
    end: typeof shift.end === "string" ? shift.end : fallback.end,
    isOff: typeof shift.isOff === "boolean" ? shift.isOff : fallback.isOff,
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
