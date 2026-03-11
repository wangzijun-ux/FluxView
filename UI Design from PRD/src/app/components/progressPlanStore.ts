const DAY_START_MINUTES = 6 * 60;
const DAY_END_MINUTES = 20 * 60 + 30;
export const DEFAULT_SHIFT_END_MINUTES = DAY_END_MINUTES;

export const PLAN_STORAGE_KEY = "fluxview-progress-plans-v1";

export type StepPlanEntry =
  | number
  | {
      planned?: number;
      startTime?: string;
      targetEndTime?: string;
    };

export type ProgressPlanStore = Record<string, Record<string, StepPlanEntry>>;

export interface StepPlanDefaults {
  planned: number;
  startTime: string;
  targetEndTime: string;
}

export interface StepPlanValues extends StepPlanDefaults {}

function formatTime(totalMinutes: number) {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function sanitizeTime(value: string | undefined, fallback: string) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

export function buildStepPlanDefaults(workflowIndex: number, stepIndex: number, headcount: number, uph: number): StepPlanDefaults {
  const startMinutes = Math.min(DAY_START_MINUTES + stepIndex * 90 + (workflowIndex % 2) * 15, DAY_END_MINUTES - 90);
  const planned = Math.max(480, Math.round((headcount * uph * (1.7 + ((workflowIndex + stepIndex) % 3) * 0.35)) / 10) * 10);

  return {
    planned,
    startTime: formatTime(startMinutes),
    targetEndTime: formatTime(DEFAULT_SHIFT_END_MINUTES),
  };
}

export function readProgressPlanStore(): ProgressPlanStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ProgressPlanStore) : {};
  } catch {
    return {};
  }
}

export function resolveStepPlanValues(
  dayStore: Record<string, StepPlanEntry> | undefined,
  stepId: string,
  defaults: StepPlanDefaults,
): StepPlanValues {
  const entry = dayStore?.[stepId];
  if (typeof entry === "number") {
    return {
      planned: Math.max(0, entry),
      startTime: defaults.startTime,
      targetEndTime: defaults.targetEndTime,
    };
  }

  if (!entry || typeof entry !== "object") {
    return defaults;
  }

  return {
    planned: Math.max(0, typeof entry.planned === "number" ? entry.planned : defaults.planned),
    startTime: sanitizeTime(entry.startTime, defaults.startTime),
    targetEndTime: sanitizeTime(entry.targetEndTime, defaults.targetEndTime),
  };
}

export function updateStepPlanEntry(
  store: ProgressPlanStore,
  dateKey: string,
  stepId: string,
  patch: Partial<StepPlanValues>,
  defaults: StepPlanDefaults,
): ProgressPlanStore {
  const dayStore = store[dateKey] ?? {};
  const current = resolveStepPlanValues(dayStore, stepId, defaults);

  return {
    ...store,
    [dateKey]: {
      ...dayStore,
      [stepId]: {
        planned: patch.planned ?? current.planned,
        startTime: patch.startTime ?? current.startTime,
        targetEndTime: patch.targetEndTime ?? current.targetEndTime,
      },
    },
  };
}
