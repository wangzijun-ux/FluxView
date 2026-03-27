import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  Layers,
  Package,
  Search,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import {
  buildBaseDeploymentSnapshot,
  buildDeploymentWorkflows,
  buildSiteScope,
  createSeededDeploymentSnapshots,
  createTimeSlots,
  materializeSnapshot,
  parseTimeLabel,
  readDeploymentWorkers,
  readFieldDeploymentSnapshots,
  type AssignmentSnapshot,
  type DeploymentStep,
  type DeploymentWorkflow,
  type DeploymentWorker,
} from "./fieldDeploymentStore";

type ViewMode = "workflow" | "worker";
type TimeScale = "15m" | "30m" | "1h";

interface GanttSegment {
  key: string;
  stepId: string;
  workerId: string;
  workerName: string;
  workflowId: string;
  workflowName: string;
  shipperId: string;
  shipperName: string;
  siteId: string;
  siteName: string;
  processId: string;
  processName: string;
  color: string;
  startMinutes: number;
  endMinutes: number;
}

interface PositionedSegment extends GanttSegment {
  laneIndex: number;
}

interface WorkflowProcessRow {
  workflow: DeploymentWorkflow;
  step: DeploymentStep;
  segments: PositionedSegment[];
  laneCount: number;
}

interface WorkflowGroup {
  workflow: DeploymentWorkflow;
  rows: WorkflowProcessRow[];
}

const LABEL_COLUMN_WIDTH = 320;
const MINUTES_IN_DAY = 24 * 60;
const DISPLAY_SCALES: TimeScale[] = ["15m", "30m", "1h"];
const READABLE_GANTT_PALETTE: Record<
  string,
  {
    accent: string;
    solid: string;
    barText: string;
    accentTextDark: string;
    accentTextLight: string;
  }
> = {
  cyan: {
    accent: "#06b6d4",
    solid: "#0e7490",
    barText: "#ecfeff",
    accentTextDark: "#a5f3fc",
    accentTextLight: "#155e75",
  },
  emerald: {
    accent: "#10b981",
    solid: "#047857",
    barText: "#ecfdf5",
    accentTextDark: "#a7f3d0",
    accentTextLight: "#065f46",
  },
  violet: {
    accent: "#8b5cf6",
    solid: "#6d28d9",
    barText: "#f5f3ff",
    accentTextDark: "#ddd6fe",
    accentTextLight: "#5b21b6",
  },
  amber: {
    accent: "#f59e0b",
    solid: "#b45309",
    barText: "#fffbeb",
    accentTextDark: "#fde68a",
    accentTextLight: "#92400e",
  },
  blue: {
    accent: "#3b82f6",
    solid: "#1d4ed8",
    barText: "#eff6ff",
    accentTextDark: "#bfdbfe",
    accentTextLight: "#1d4ed8",
  },
  rose: {
    accent: "#f43f5e",
    solid: "#be123c",
    barText: "#fff1f2",
    accentTextDark: "#fecdd3",
    accentTextLight: "#9f1239",
  },
  orange: {
    accent: "#f97316",
    solid: "#c2410c",
    barText: "#fff7ed",
    accentTextDark: "#fed7aa",
    accentTextLight: "#9a3412",
  },
  pink: {
    accent: "#ec4899",
    solid: "#be185d",
    barText: "#fdf2f8",
    accentTextDark: "#fbcfe8",
    accentTextLight: "#9d174d",
  },
  teal: {
    accent: "#14b8a6",
    solid: "#0f766e",
    barText: "#f0fdfa",
    accentTextDark: "#99f6e4",
    accentTextLight: "#115e59",
  },
  indigo: {
    accent: "#6366f1",
    solid: "#4338ca",
    barText: "#eef2ff",
    accentTextDark: "#c7d2fe",
    accentTextLight: "#3730a3",
  },
};

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3
    ? normalized
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
    : normalized;

  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getReadableGanttTone(color: string, isDark: boolean) {
  const palette = READABLE_GANTT_PALETTE[color] ?? READABLE_GANTT_PALETTE.cyan;

  return {
    headerStyle: {
      backgroundColor: hexToRgba(palette.accent, isDark ? 0.18 : 0.1),
      borderColor: hexToRgba(palette.accent, isDark ? 0.34 : 0.22),
      color: isDark ? palette.accentTextDark : palette.accentTextLight,
    } satisfies CSSProperties,
    subtitleStyle: {
      color: isDark ? "rgba(226, 232, 240, 0.86)" : "rgba(15, 23, 42, 0.72)",
    } satisfies CSSProperties,
    chipStyle: {
      backgroundColor: hexToRgba(palette.accent, isDark ? 0.16 : 0.08),
      borderColor: hexToRgba(palette.accent, isDark ? 0.32 : 0.18),
      color: isDark ? palette.accentTextDark : palette.accentTextLight,
    } satisfies CSSProperties,
    barStyle: {
      backgroundColor: hexToRgba(palette.solid, isDark ? 0.94 : 0.9),
      borderColor: hexToRgba(palette.accent, isDark ? 0.5 : 0.38),
      color: palette.barText,
      boxShadow: isDark
        ? "0 10px 24px rgba(15, 23, 42, 0.28)"
        : "0 8px 18px rgba(15, 23, 42, 0.12)",
    } satisfies CSSProperties,
    metaStyle: {
      color: hexToRgba(palette.barText, 0.92),
    } satisfies CSSProperties,
  };
}

function sortTimeLabels(labels: string[]) {
  return [...labels].sort((left, right) => parseTimeLabel(left) - parseTimeLabel(right));
}

function getIntervalMinutes(scale: TimeScale) {
  switch (scale) {
    case "15m":
      return 15;
    case "30m":
      return 30;
    default:
      return 60;
  }
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function detectSnapshotInterval(labels: string[]) {
  if (labels.length < 2) return 30;

  let minDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < labels.length; index += 1) {
    const delta = parseTimeLabel(labels[index]) - parseTimeLabel(labels[index - 1]);
    if (delta > 0) minDelta = Math.min(minDelta, delta);
  }

  return Number.isFinite(minDelta) ? minDelta : 30;
}

function buildSegments(
  timeLabels: string[],
  snapshotsByTime: Record<string, AssignmentSnapshot>,
  stepMap: Map<string, DeploymentStep>,
  workerMap: Map<string, DeploymentWorker>,
) {
  const sortedLabels = sortTimeLabels(timeLabels);
  const intervalMinutes = detectSnapshotInterval(sortedLabels);
  const rawSegments: GanttSegment[] = [];

  sortedLabels.forEach((timeLabel, index) => {
    const startMinutes = parseTimeLabel(timeLabel);
    const endMinutes = index < sortedLabels.length - 1
      ? parseTimeLabel(sortedLabels[index + 1])
      : Math.min(MINUTES_IN_DAY, startMinutes + intervalMinutes);

    if (endMinutes <= startMinutes) return;
    const snapshot = snapshotsByTime[timeLabel] ?? {};

    Object.entries(snapshot).forEach(([stepId, workerIds]) => {
      const step = stepMap.get(stepId);
      if (!step) return;

      const stepStartMinutes = parseTimeLabel(step.startTime);
      const stepEndMinutes = parseTimeLabel(step.targetEndTime);
      const clippedStartMinutes = Math.max(startMinutes, stepStartMinutes);
      const clippedEndMinutes = Math.min(endMinutes, stepEndMinutes);
      if (clippedEndMinutes <= clippedStartMinutes) return;

      workerIds.forEach((workerId) => {
        const worker = workerMap.get(workerId);
        if (!worker) return;

        rawSegments.push({
          key: `${workerId}:${stepId}`,
          stepId,
          workerId,
          workerName: worker.name,
          workflowId: step.workflowId,
          workflowName: step.workflowName,
          shipperId: step.shipperId,
          shipperName: step.shipperName,
          siteId: step.siteId,
          siteName: step.siteName,
          processId: step.processId,
          processName: step.processName,
          color: step.color,
          startMinutes: clippedStartMinutes,
          endMinutes: clippedEndMinutes,
        });
      });
    });
  });

  rawSegments.sort(
    (left, right) => left.key.localeCompare(right.key, "ja") || left.startMinutes - right.startMinutes,
  );

  const merged: GanttSegment[] = [];
  rawSegments.forEach((segment) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.key === segment.key && previous.endMinutes === segment.startMinutes) {
      previous.endMinutes = segment.endMinutes;
      return;
    }
    merged.push({ ...segment });
  });

  return merged;
}

function formatClock(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.min(MINUTES_IN_DAY, totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function minuteToPixels(minutes: number, timelineWidth: number) {
  return (minutes / MINUTES_IN_DAY) * timelineWidth;
}

function layoutSegments(segments: GanttSegment[]) {
  const laneEnds: number[] = [];
  const positioned: PositionedSegment[] = [];

  [...segments]
    .sort(
      (left, right) =>
        left.startMinutes - right.startMinutes ||
        left.endMinutes - right.endMinutes ||
        left.workerName.localeCompare(right.workerName, "ja"),
    )
    .forEach((segment) => {
      let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= segment.startMinutes);
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(segment.endMinutes);
      } else {
        laneEnds[laneIndex] = segment.endMinutes;
      }

      positioned.push({ ...segment, laneIndex });
    });

  return {
    positioned,
    laneCount: Math.max(1, laneEnds.length),
  };
}

function getWorkflowRowHeight(laneCount: number) {
  return Math.max(68, 18 + laneCount * 28 + Math.max(0, laneCount - 1) * 6 + 14);
}

function getWorkerRowHeight() {
  return 76;
}

export function WorkPerformance() {
  const c = useThemeColors();
  const { shippers, sites, processes, workflows, selectedSiteId, getShippersForSite } = useMasterData();
  const [viewMode, setViewMode] = useState<ViewMode>("workflow");
  const [timeScale, setTimeScale] = useState<TimeScale>("30m");
  const [filterShipperId, setFilterShipperId] = useState("all");
  const [filterWorkflowId, setFilterWorkflowId] = useState("all");
  const [filterProcessId, setFilterProcessId] = useState("all");
  const [keyword, setKeyword] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const siteScope = useMemo(() => buildSiteScope(sites, selectedSiteId), [sites, selectedSiteId]);
  const selectedDate = useMemo(() => toDateInput(new Date()), []);
  const deploymentWorkers = useMemo(() => readDeploymentWorkers(), []);
  const workerMap = useMemo(() => new Map(deploymentWorkers.map((worker) => [worker.id, worker])), [deploymentWorkers]);

  const workflowViews = useMemo(
    () =>
      buildDeploymentWorkflows(
        workflows.filter((workflow) => siteScope.siteIds.includes(workflow.siteId)),
        shippers,
        sites,
        processes,
      ),
    [workflows, siteScope.siteIds, shippers, sites, processes],
  );

  const shipperOptions = useMemo(
    () =>
      getShippersForSite(selectedSiteId).filter(
        (shipper) => workflowViews.some((workflow) => workflow.shipperId === shipper.id),
      ),
    [getShippersForSite, selectedSiteId, workflowViews],
  );

  const workflowOptions = useMemo(
    () => workflowViews.map((workflow) => ({ id: workflow.id, name: workflow.workflowName })),
    [workflowViews],
  );

  const processOptions = useMemo(
    () =>
      processes.filter((process) =>
        workflowViews.some((workflow) => workflow.steps.some((step) => step.processId === process.id)),
      ),
    [workflowViews, processes],
  );

  const filteredWorkflows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return workflowViews.filter((workflow) => {
      if (filterShipperId !== "all" && workflow.shipperId !== filterShipperId) return false;
      if (filterWorkflowId !== "all" && workflow.id !== filterWorkflowId) return false;
      if (filterProcessId !== "all" && !workflow.steps.some((step) => step.processId === filterProcessId)) {
        return false;
      }
      if (!normalizedKeyword) return true;

      const haystack = [
        workflow.workflowName,
        workflow.shipperName,
        workflow.siteName,
        ...workflow.steps.map((step) => step.processName),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedKeyword);
    });
  }, [workflowViews, filterShipperId, filterWorkflowId, filterProcessId, keyword]);

  const allSteps = useMemo(
    () =>
      filteredWorkflows.flatMap((workflow) =>
        workflow.steps.filter((step) => filterProcessId === "all" || step.processId === filterProcessId),
      ),
    [filteredWorkflows, filterProcessId],
  );

  const stepMap = useMemo(() => new Map(allSteps.map((step) => [step.id, step])), [allSteps]);
  const visibleStepIds = useMemo(() => new Set(allSteps.map((step) => step.id)), [allSteps]);

  const defaultTimeLabels = useMemo(() => createTimeSlots(30), []);
  const storedSnapshots = useMemo(
    () => readFieldDeploymentSnapshots(siteScope.storageScopeKey, selectedDate),
    [siteScope.storageScopeKey, selectedDate],
  );

  const snapshotLabels = useMemo(() => {
    const storedLabels = sortTimeLabels(Object.keys(storedSnapshots).filter((label) => /^\d{2}:\d{2}$/.test(label)));
    return sortTimeLabels(Array.from(new Set([...defaultTimeLabels, ...storedLabels])));
  }, [storedSnapshots, defaultTimeLabels]);

  const seededSnapshots = useMemo(() => {
    const baseSnapshot = buildBaseDeploymentSnapshot(allSteps, deploymentWorkers);
    return createSeededDeploymentSnapshots(snapshotLabels, allSteps, deploymentWorkers, baseSnapshot);
  }, [snapshotLabels, allSteps, deploymentWorkers]);

  const normalizedSnapshots = useMemo(
    () =>
      Object.fromEntries(
        snapshotLabels.map((timeLabel) => [
          timeLabel,
          materializeSnapshot(storedSnapshots[timeLabel] ?? seededSnapshots[timeLabel] ?? {}, allSteps),
        ]),
      ) as Record<string, AssignmentSnapshot>,
    [snapshotLabels, storedSnapshots, seededSnapshots, allSteps],
  );

  const segments = useMemo(
    () => buildSegments(snapshotLabels, normalizedSnapshots, stepMap, workerMap),
    [snapshotLabels, normalizedSnapshots, stepMap, workerMap],
  );

  const workflowGroups = useMemo<WorkflowGroup[]>(() => {
    return filteredWorkflows
      .map((workflow) => ({
        workflow,
        rows: workflow.steps
          .filter((step) => visibleStepIds.has(step.id))
          .map((step) => {
            const rowLayout = layoutSegments(segments.filter((segment) => segment.stepId === step.id));
            return {
              workflow,
              step,
              segments: rowLayout.positioned,
              laneCount: rowLayout.laneCount,
            };
          }),
      }))
      .filter((group) => group.rows.length > 0);
  }, [filteredWorkflows, segments, visibleStepIds]);

  const workerLanes = useMemo(() => {
    const workerIds = Array.from(new Set(segments.map((segment) => segment.workerId)));
    return workerIds
      .map((workerId) => {
        const worker = workerMap.get(workerId);
        if (!worker) return null;

        return {
          worker,
          segments: segments
            .filter((segment) => segment.workerId === workerId)
            .sort((left, right) => left.startMinutes - right.startMinutes),
        };
      })
      .filter((entry): entry is { worker: DeploymentWorker; segments: GanttSegment[] } => Boolean(entry))
      .sort((left, right) => left.worker.name.localeCompare(right.worker.name, "ja"));
  }, [segments, workerMap]);

  const timelineStepMinutes = getIntervalMinutes(timeScale);
  const timelineSlots = useMemo(
    () => Array.from({ length: MINUTES_IN_DAY / timelineStepMinutes }, (_, index) => index * timelineStepMinutes),
    [timelineStepMinutes],
  );
  const timelineWidth = Math.max(
    1440,
    timelineSlots.length * (timeScale === "15m" ? 28 : timeScale === "30m" ? 40 : 68),
  );
  const tableWidth = LABEL_COLUMN_WIDTH + timelineWidth;

  const kpis = useMemo(() => {
    const workersInView = new Set(segments.map((segment) => segment.workerId)).size;
    const workflowsInView = new Set(filteredWorkflows.map((workflow) => workflow.id)).size;
    const processesInView = allSteps.length;
    const totalHours = segments.reduce((sum, segment) => sum + (segment.endMinutes - segment.startMinutes) / 60, 0);

    return [
      { label: "業務数", value: workflowsInView, suffix: "件", icon: Layers, color: "text-cyan-500" },
      { label: "作業者数", value: workersInView, suffix: "人", icon: Users, color: "text-blue-500" },
      { label: "工程数", value: processesInView, suffix: "工程", icon: Package, color: "text-violet-500" },
      { label: "配置枠数", value: segments.length, suffix: "枠", icon: Target, color: "text-emerald-500" },
      { label: "総工数", value: totalHours.toFixed(1), suffix: "時間", icon: Clock3, color: "text-amber-500" },
    ];
  }, [segments, filteredWorkflows, allSteps]);

  const hasRows = viewMode === "workflow" ? workflowGroups.length > 0 : workerLanes.length > 0;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !hasRows) return;

    const now = new Date();
    const nowMinutes = Math.min(MINUTES_IN_DAY, now.getHours() * 60 + now.getMinutes());
    const centerOffset = node.clientWidth / 2;
    const timelineOffset = LABEL_COLUMN_WIDTH + minuteToPixels(nowMinutes, timelineWidth) - centerOffset;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    node.scrollLeft = Math.min(Math.max(0, timelineOffset), maxScrollLeft);
  }, [timelineWidth, timeScale, hasRows]);

  const renderTimelineHeader = () => (
    <div
      className={`sticky top-0 z-30 flex border-b ${c.border} ${c.bgCard}`}
      style={{ width: `${tableWidth}px` }}
    >
      <div
        className={`sticky left-0 z-30 shrink-0 border-r px-4 py-3 ${c.bgCard} ${c.border}`}
        style={{ width: `${LABEL_COLUMN_WIDTH}px` }}
      >
        <div className={`text-[11px] font-medium ${c.textMuted}`}>
          {viewMode === "workflow" ? "業務 / 荷主 / 拠点 / 工程" : "作業者"}
        </div>
      </div>
      <div className="shrink-0" style={{ width: `${timelineWidth}px` }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${timelineSlots.length}, minmax(0, 1fr))` }}>
          {timelineSlots.map((minutes) => {
            const hour = Math.floor(minutes / 60);
            const minute = minutes % 60;
            const showMinor = timeScale !== "1h";
            const label = minute === 0
              ? `${String(hour).padStart(2, "0")}:00`
              : showMinor
                ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
                : "";

            return (
              <div
                key={minutes}
                className={`border-r px-1 py-3 text-center text-[10px] ${minute === 0 ? c.textPrimary : c.textMuted} ${c.border}`}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderTimelineGrid = () => (
    <div
      className="pointer-events-none absolute inset-0 grid"
      style={{ gridTemplateColumns: `repeat(${timelineSlots.length}, minmax(0, 1fr))` }}
    >
      {timelineSlots.map((minutes) => (
        <div
          key={`grid-${minutes}`}
          className={`border-r ${minutes % 60 === 0 ? "opacity-100" : "opacity-60"} ${c.border}`}
        />
      ))}
    </div>
  );

  return (
    <div className={`flex h-full min-h-0 flex-col ${c.isDark ? "bg-[#0d0f16]" : "bg-slate-50"}`}>
      <div className={`${c.bgCard} border-b ${c.border} px-6 py-4`}>
        <div className="grid gap-3 lg:grid-cols-5">
          {kpis.map((item) => (
            <div key={item.label} className={`${c.bgSurface} ${c.borderCard} rounded-2xl border px-4 py-3`}>
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-[11px] ${c.textMuted}`}>{item.label}</span>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className={`text-[20px] font-semibold tabular-nums ${c.textPrimary}`}>
                {item.value}
                <span className={`ml-1 text-[11px] ${c.textMuted}`}>{item.suffix}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${c.bgCard} border-b ${c.border} px-6 py-3`}>
        <div className="grid gap-3 xl:grid-cols-[180px_180px_180px_minmax(0,1fr)_auto_auto]">
          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>荷主</span>
            <select
              value={filterShipperId}
              onChange={(event) => setFilterShipperId(event.target.value)}
              className={`${c.bgSurface} ${c.borderCard} ${c.textPrimary} w-full rounded-xl border px-3 py-2 text-[13px] outline-none`}
            >
              <option value="all">すべて</option>
              {shipperOptions.map((shipper) => (
                <option key={shipper.id} value={shipper.id}>
                  {shipper.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>業務</span>
            <select
              value={filterWorkflowId}
              onChange={(event) => setFilterWorkflowId(event.target.value)}
              className={`${c.bgSurface} ${c.borderCard} ${c.textPrimary} w-full rounded-xl border px-3 py-2 text-[13px] outline-none`}
            >
              <option value="all">すべて</option>
              {workflowOptions.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>工程</span>
            <select
              value={filterProcessId}
              onChange={(event) => setFilterProcessId(event.target.value)}
              className={`${c.bgSurface} ${c.borderCard} ${c.textPrimary} w-full rounded-xl border px-3 py-2 text-[13px] outline-none`}
            >
              <option value="all">すべて</option>
              {processOptions.map((process) => (
                <option key={process.id} value={process.id}>
                  {process.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>検索</span>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${c.bgSurface} ${c.borderCard}`}>
              <Search className={`h-4 w-4 ${c.textMuted}`} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="荷主、業務、工程で検索"
                className={`w-full bg-transparent text-[13px] ${c.textPrimary} outline-none placeholder:text-slate-400`}
              />
            </div>
          </label>

          <div className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>表示幅</span>
            <div className={`flex rounded-xl border p-1 ${c.bgSurface} ${c.borderCard}`}>
              {DISPLAY_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => setTimeScale(scale)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${timeScale === scale ? "bg-[#155DFC] text-white" : c.textSecondary}`}
                >
                  {scale}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>表示単位</span>
            <div className={`inline-flex rounded-xl border p-1 ${c.bgSurface} ${c.borderCard}`}>
              <button
                type="button"
                onClick={() => setViewMode("workflow")}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium ${viewMode === "workflow" ? "bg-[#155DFC] text-white" : c.textSecondary}`}
              >
                <Layers className="h-4 w-4" />
                業務
              </button>
              <button
                type="button"
                onClick={() => setViewMode("worker")}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium ${viewMode === "worker" ? "bg-[#155DFC] text-white" : c.textSecondary}`}
              >
                <UserRound className="h-4 w-4" />
                作業者
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
        {!hasRows ? (
          <div className={`${c.bgCard} ${c.border} rounded-3xl border px-6 py-16 text-center`}>
            <div className={`text-[16px] font-semibold ${c.textPrimary}`}>配置ブロックがありません</div>
            <div className={`mt-2 text-[13px] ${c.textSecondary}`}>
              絞り込み条件を見直して再度確認してください。
            </div>
          </div>
        ) : (
          <div className={`${c.bgCard} ${c.border} h-full rounded-3xl border overflow-hidden`}>
            <div ref={scrollRef} className="h-full overflow-auto">
              <div style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
                {renderTimelineHeader()}

                {viewMode === "workflow" ? (
                  workflowGroups.map((group) => {
                    const workflowTone = getReadableGanttTone(group.workflow.color, c.isDark);

                    return (
                      <section key={group.workflow.id} className={`border-b ${c.borderCard} last:border-b-0`}>
                        <div className={`flex border-b ${c.borderCard}`}>
                          <div
                            className="sticky left-0 z-20 shrink-0 border-r px-4 py-3"
                            style={{ width: `${LABEL_COLUMN_WIDTH}px`, ...workflowTone.headerStyle }}
                          >
                            <div className="text-[13px] font-semibold">{group.workflow.workflowName}</div>
                            <div className="mt-1 text-[11px]" style={workflowTone.subtitleStyle}>
                              {group.workflow.shipperName}
                            </div>
                          </div>
                          <div
                            className="shrink-0"
                            style={{
                              width: `${timelineWidth}px`,
                              backgroundColor: workflowTone.headerStyle.backgroundColor,
                            }}
                          />
                        </div>

                        {group.rows.map((row) => {
                          const rowTone = getReadableGanttTone(row.step.color, c.isDark);
                          const rowHeight = getWorkflowRowHeight(row.laneCount);

                          return (
                            <div key={row.step.id} className={`flex border-b ${c.borderCard} last:border-b-0`}>
                              <div
                                className={`sticky left-0 z-10 shrink-0 border-r px-4 py-3 ${c.bgCard} ${c.border}`}
                                style={{ width: `${LABEL_COLUMN_WIDTH}px` }}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="rounded-xl border px-2 py-2" style={rowTone.chipStyle}>
                                    <row.step.icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{row.step.processName}</div>
                                    <div className={`mt-1 text-[11px] ${c.textSecondary}`}>
                                      {row.step.startTime} - {row.step.targetEndTime}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div
                                className={`relative shrink-0 ${c.isDark ? "bg-[#111521]" : "bg-slate-50"}`}
                                style={{ width: `${timelineWidth}px`, height: `${rowHeight}px` }}
                              >
                                {renderTimelineGrid()}

                                {row.segments.length === 0 ? (
                                  <div className={`absolute inset-0 flex items-center justify-center text-[11px] ${c.textMuted}`}>
                                    配置なし
                                  </div>
                                ) : null}

                                {row.segments.map((segment) => {
                                  const tone = getReadableGanttTone(segment.color, c.isDark);
                                  const left = minuteToPixels(segment.startMinutes, timelineWidth);
                                  const width = Math.max(
                                    52,
                                    minuteToPixels(segment.endMinutes - segment.startMinutes, timelineWidth),
                                  );
                                  const top = 12 + segment.laneIndex * 34;

                                  return (
                                    <div
                                      key={`${segment.key}:${segment.startMinutes}`}
                                      title={`${segment.workerName} | ${formatClock(segment.startMinutes)} - ${formatClock(segment.endMinutes)}`}
                                      className="absolute flex h-[28px] items-center gap-2 overflow-hidden rounded-xl border px-3 text-[11px] font-semibold"
                                      style={{
                                        left: `${left}px`,
                                        top: `${top}px`,
                                        width: `${width}px`,
                                        ...tone.barStyle,
                                      }}
                                    >
                                      <span className="truncate">{segment.workerName}</span>
                                      <span className="ml-auto shrink-0 text-[10px]" style={tone.metaStyle}>
                                        {formatClock(segment.startMinutes)} - {formatClock(segment.endMinutes)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </section>
                    );
                  })
                ) : (
                  workerLanes.map(({ worker, segments: workerSegments }) => {
                    const rowHeight = getWorkerRowHeight();

                    return (
                      <div key={worker.id} className={`flex border-b ${c.borderCard} last:border-b-0`}>
                        <div
                          className={`sticky left-0 z-10 shrink-0 border-r px-4 py-3 ${c.bgCard} ${c.border}`}
                          style={{ width: `${LABEL_COLUMN_WIDTH}px` }}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold text-white ${worker.color}`}>
                              {worker.initials}
                            </div>
                            <div className="min-w-0">
                              <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{worker.name}</div>
                              <div className={`mt-1 text-[11px] ${c.textSecondary}`}>{worker.note ?? "備考なし"}</div>
                            </div>
                          </div>
                        </div>

                        <div
                          className={`relative shrink-0 ${c.isDark ? "bg-[#111521]" : "bg-slate-50"}`}
                          style={{ width: `${timelineWidth}px`, height: `${rowHeight}px` }}
                        >
                          {renderTimelineGrid()}

                          {workerSegments.map((segment) => {
                            const tone = getReadableGanttTone(segment.color, c.isDark);
                            const left = minuteToPixels(segment.startMinutes, timelineWidth);
                            const width = Math.max(
                              96,
                              minuteToPixels(segment.endMinutes - segment.startMinutes, timelineWidth),
                            );

                            return (
                              <div
                                key={`${segment.key}:${segment.startMinutes}`}
                                title={`${segment.shipperName} | ${segment.processName} | ${formatClock(segment.startMinutes)} - ${formatClock(segment.endMinutes)}`}
                                className="absolute top-3 flex h-[44px] items-center gap-3 overflow-hidden rounded-xl border px-3 text-[11px] font-semibold"
                                style={{
                                  left: `${left}px`,
                                  width: `${width}px`,
                                  ...tone.barStyle,
                                }}
                              >
                                <div className="min-w-0 flex-1 leading-tight">
                                  <div className="truncate">{segment.processName}</div>
                                  <div className="truncate text-[10px]" style={tone.metaStyle}>
                                    {segment.shipperName}
                                  </div>
                                </div>
                                <span className="ml-auto shrink-0 text-[10px]" style={tone.metaStyle}>
                                  {formatClock(segment.startMinutes)} - {formatClock(segment.endMinutes)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
