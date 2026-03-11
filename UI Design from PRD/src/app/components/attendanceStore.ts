import { INITIAL_WORKERS, type Worker as AttendanceWorker } from "./processStore";

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

function normalizeWorkerName(value: string) {
  return value.replace(/[\s\u3000]/g, "");
}

function buildDefaultShift(worker: AttendanceWorker, dayOfWeek: number): ShiftData {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  let start = "08:00";
  let end = "17:00";
  let isOff = isWeekend;

  if (worker.category === "派遣") {
    if (dayOfWeek !== 1 && dayOfWeek !== 3 && dayOfWeek !== 5) {
      isOff = true;
    }
  }

  if (worker.category === "パートナー") {
    start = "09:00";
    end = "15:00";
  }

  return { start, end, isOff };
}

export function buildAttendanceMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function createDefaultMonthlyShifts(
  year: number,
  month: number,
  workers: AttendanceWorker[] = INITIAL_WORKERS,
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
    return parsed && typeof parsed === "object" ? parsed as AttendanceStore : {};
  } catch {
    return {};
  }
}

export function readAttendanceMonthShifts(
  year: number,
  month: number,
  workers: AttendanceWorker[] = INITIAL_WORKERS,
): MonthlyShifts {
  const defaults = createDefaultMonthlyShifts(year, month, workers);
  const monthKey = buildAttendanceMonthKey(year, month);
  const stored = readAttendanceStore()[monthKey];
  if (!stored || typeof stored !== "object") return defaults;

  return Object.fromEntries(
    Object.entries(defaults).map(([workerId, dayMap]) => [
      workerId,
      Object.fromEntries(
        Object.entries(dayMap).map(([day, shift]) => {
          const savedShift = stored[workerId]?.[Number(day)];
          return [
            Number(day),
            savedShift && typeof savedShift === "object"
              ? {
                  start: typeof savedShift.start === "string" ? savedShift.start : shift.start,
                  end: typeof savedShift.end === "string" ? savedShift.end : shift.end,
                  isOff: Boolean(savedShift.isOff),
                }
              : shift,
          ];
        }),
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
  workerName: string,
  dateKey: string,
  workers: AttendanceWorker[] = INITIAL_WORKERS,
) {
  const [yearPart, monthPart, dayPart] = dateKey.split("-").map(Number);
  if (!yearPart || !monthPart || !dayPart) return null;

  const worker = workers.find((item) => normalizeWorkerName(item.name) === normalizeWorkerName(workerName));
  if (!worker) return null;

  const monthlyShifts = readAttendanceMonthShifts(yearPart, monthPart - 1, workers);
  return monthlyShifts[worker.id]?.[dayPart] ?? null;
}

