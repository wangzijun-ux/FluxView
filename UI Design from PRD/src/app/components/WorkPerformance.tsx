import { useMemo, useState } from "react";
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
import { processColorClasses } from "./processStore";
import {
  DEPLOYMENT_WORKERS,
  buildBaseDeploymentSnapshot,
  buildDeploymentWorkflows,
  buildFieldDeploymentStorageKey,
  createSeededDeploymentSnapshots,
  createTimeSlots,
  materializeSnapshot,
  parseTimeLabel,
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
  areaId: string;
  areaName: string;
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

function readStoredSnapshots(storageKey: string) {
  if (typeof window === "undefined") return {} as Record<string, AssignmentSnapshot>;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, AssignmentSnapshot>) : {};
  } catch {
    return {};
  }
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
    const snapshot = snapshotsByTime[timeLabel] ?? {};

    Object.entries(snapshot).forEach(([stepId, workerIds]) => {
      const step = stepMap.get(stepId);
      if (!step) return;

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
          areaId: step.areaId,
          areaName: step.areaName,
          processId: step.processId,
          processName: step.processName,
          color: step.color,
          startMinutes,
          endMinutes,
        });
      });
    });
  });

  rawSegments.sort(
    (left, right) =>
      left.key.localeCompare(right.key, "ja") ||
      left.startMinutes - right.startMinutes,
  );

  const merged: GanttSegment[] = [];
  rawSegments.forEach((segment) => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.key === segment.key &&
      previous.endMinutes === segment.startMinutes
    ) {
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
  const { shippers, areas, processes, workflows, selectedSiteId } = useMasterData();
  const [viewMode, setViewMode] = useState<ViewMode>("workflow");
  const [timeScale, setTimeScale] = useState<TimeScale>("30m");
  const [filterShipperId, setFilterShipperId] = useState("all");
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterProcessId, setFilterProcessId] = useState("all");
  const [keyword, setKeyword] = useState("");

  const storageKey = useMemo(() => buildFieldDeploymentStorageKey(selectedSiteId), [selectedSiteId]);
  const workerMap = useMemo(() => new Map(DEPLOYMENT_WORKERS.map((worker) => [worker.id, worker])), []);

  const workflowViews = useMemo(
    () => buildDeploymentWorkflows(workflows.filter((workflow) => workflow.siteId === selectedSiteId), shippers, areas, processes),
    [workflows, selectedSiteId, shippers, areas, processes],
  );

  const shipperOptions = useMemo(
    () => shippers.filter((shipper) => workflowViews.some((workflow) => workflow.shipperId === shipper.id)),
    [workflowViews, shippers],
  );
  const areaOptions = useMemo(
    () => areas.filter((area) => workflowViews.some((workflow) => workflow.areaId === area.id)),
    [workflowViews, areas],
  );
  const processOptions = useMemo(
    () => processes.filter((process) => workflowViews.some((workflow) => workflow.steps.some((step) => step.processId === process.id))),
    [workflowViews, processes],
  );

  const filteredWorkflows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return workflowViews.filter((workflow) => {
      if (filterShipperId !== "all" && workflow.shipperId !== filterShipperId) return false;
      if (filterAreaId !== "all" && workflow.areaId !== filterAreaId) return false;
      if (filterProcessId !== "all" && !workflow.steps.some((step) => step.processId === filterProcessId)) return false;
      if (!normalizedKeyword) return true;

      const haystack = [
        workflow.workflowName,
        workflow.shipperName,
        workflow.areaName,
        ...workflow.steps.map((step) => step.processName),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedKeyword);
    });
  }, [workflowViews, filterShipperId, filterAreaId, filterProcessId, keyword]);

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
  const storedSnapshots = useMemo(() => readStoredSnapshots(storageKey), [storageKey]);
  const snapshotLabels = useMemo(() => {
    const storedLabels = sortTimeLabels(Object.keys(storedSnapshots).filter((label) => /^\d{2}:\d{2}$/.test(label)));
    return storedLabels.length > 0 ? storedLabels : defaultTimeLabels;
  }, [storedSnapshots, defaultTimeLabels]);

  const seededSnapshots = useMemo(() => {
    const baseSnapshot = buildBaseDeploymentSnapshot(allSteps, DEPLOYMENT_WORKERS);
    return createSeededDeploymentSnapshots(snapshotLabels, allSteps, DEPLOYMENT_WORKERS, baseSnapshot);
  }, [snapshotLabels, allSteps]);

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
  const timelineWidth = Math.max(1440, timelineSlots.length * (timeScale === "15m" ? 28 : timeScale === "30m" ? 40 : 68));
  const tableWidth = LABEL_COLUMN_WIDTH + timelineWidth;

  const kpis = useMemo(() => {
    const workersInView = new Set(segments.map((segment) => segment.workerId)).size;
    const workflowsInView = new Set(filteredWorkflows.map((workflow) => workflow.id)).size;
    const processesInView = allSteps.length;
    const totalHours = segments.reduce((sum, segment) => sum + (segment.endMinutes - segment.startMinutes) / 60, 0);

    return [
      { label: "対象ワークフロー", value: workflowsInView, suffix: "件", icon: Layers, color: "text-cyan-500" },
      { label: "対象作業員", value: workersInView, suffix: "名", icon: Users, color: "text-blue-500" },
      { label: "対象工程", value: processesInView, suffix: "件", icon: Package, color: "text-violet-500" },
      { label: "配置ブロック", value: segments.length, suffix: "本", icon: Target, color: "text-emerald-500" },
      { label: "総配置時間", value: totalHours.toFixed(1), suffix: "h", icon: Clock3, color: "text-amber-500" },
    ];
  }, [segments, filteredWorkflows, allSteps]);

  const hasRows = viewMode === "workflow" ? workflowGroups.length > 0 : workerLanes.length > 0;

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
          {viewMode === "workflow" ? "荷主 / エリア / 工程" : "作業員"}
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
        <div className="grid gap-3 xl:grid-cols-[180px_180px_180px_minmax(0,1fr)_auto]">
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
            <span className={`text-[11px] ${c.textMuted}`}>エリア</span>
            <select
              value={filterAreaId}
              onChange={(event) => setFilterAreaId(event.target.value)}
              className={`${c.bgSurface} ${c.borderCard} ${c.textPrimary} w-full rounded-xl border px-3 py-2 text-[13px] outline-none`}
            >
              <option value="all">すべて</option>
              {areaOptions.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
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
            <span className={`text-[11px] ${c.textMuted}`}>キーワード</span>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${c.bgSurface} ${c.borderCard}`}>
              <Search className={`h-4 w-4 ${c.textMuted}`} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="ワークフロー名や工程名で検索"
                className={`w-full bg-transparent text-[13px] ${c.textPrimary} outline-none placeholder:text-slate-400`}
              />
            </div>
          </label>

          <div className="space-y-1">
            <span className={`text-[11px] ${c.textMuted}`}>表示粒度</span>
            <div className={`flex rounded-xl border p-1 ${c.bgSurface} ${c.borderCard}`}>
              {DISPLAY_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => setTimeScale(scale)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${timeScale === scale ? "bg-blue-600 text-white" : c.textSecondary}`}
                >
                  {scale === "15m" ? "15分" : scale === "30m" ? "30分" : "1時間"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className={`inline-flex rounded-xl border p-1 ${c.bgSurface} ${c.borderCard}`}>
            <button
              type="button"
              onClick={() => setViewMode("workflow")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium ${viewMode === "workflow" ? "bg-blue-600 text-white" : c.textSecondary}`}
            >
              <Layers className="h-4 w-4" />
              ワークフロー別
            </button>
            <button
              type="button"
              onClick={() => setViewMode("worker")}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium ${viewMode === "worker" ? "bg-blue-600 text-white" : c.textSecondary}`}
            >
              <UserRound className="h-4 w-4" />
              作業員別
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
        {!hasRows ? (
          <div className={`${c.bgCard} ${c.border} rounded-3xl border px-6 py-16 text-center`}>
            <div className={`text-[16px] font-semibold ${c.textPrimary}`}>表示できる作業実績がありません</div>
            <div className={`mt-2 text-[13px] ${c.textSecondary}`}>
              現場配置の対象ワークフロー、またはフィルター条件に一致するデータが見つかりません。
            </div>
          </div>
        ) : (
          <div className={`${c.bgCard} ${c.border} h-full rounded-3xl border overflow-hidden`}>
            <div className="h-full overflow-auto">
              <div style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
                {renderTimelineHeader()}

                {viewMode === "workflow" ? (
                  workflowGroups.map((group) => {
                    const workflowTone = processColorClasses[group.workflow.color] ?? processColorClasses.cyan;

                    return (
                      <section key={group.workflow.id} className={`border-b ${c.borderCard} last:border-b-0`}>
                        <div className={`flex border-b ${c.borderCard}`}>
                          <div
                            className={`sticky left-0 z-20 shrink-0 border-r px-4 py-3 ${workflowTone.bg} ${workflowTone.text} ${c.border}`}
                            style={{ width: `${LABEL_COLUMN_WIDTH}px` }}
                          >
                            <div className="text-[13px] font-semibold">{group.workflow.workflowName}</div>
                            <div className={`mt-1 text-[11px] ${c.textSecondary}`}>
                              {group.workflow.shipperName} / {group.workflow.areaName}
                            </div>
                          </div>
                          <div className={`${workflowTone.bg} shrink-0`} style={{ width: `${timelineWidth}px` }} />
                        </div>

                        {group.rows.map((row) => {
                          const rowTone = processColorClasses[row.step.color] ?? processColorClasses.cyan;
                          const rowHeight = getWorkflowRowHeight(row.laneCount);

                          return (
                            <div key={row.step.id} className={`flex border-b ${c.borderCard} last:border-b-0`}>
                              <div
                                className={`sticky left-0 z-10 shrink-0 border-r px-4 py-3 ${c.bgCard} ${c.border}`}
                                style={{ width: `${LABEL_COLUMN_WIDTH}px` }}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`rounded-xl border px-2 py-2 ${rowTone.bg} ${rowTone.border} ${rowTone.text}`}>
                                    <row.step.icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{row.step.processName}</div>
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
                                  const tone = processColorClasses[segment.color] ?? processColorClasses.cyan;
                                  const left = minuteToPixels(segment.startMinutes, timelineWidth);
                                  const width = Math.max(52, minuteToPixels(segment.endMinutes - segment.startMinutes, timelineWidth));
                                  const top = 12 + segment.laneIndex * 34;

                                  return (
                                    <div
                                      key={`${segment.key}:${segment.startMinutes}`}
                                      title={`${segment.workerName} | ${formatClock(segment.startMinutes)} - ${formatClock(segment.endMinutes)}`}
                                      className={`absolute flex h-[28px] items-center gap-2 overflow-hidden rounded-xl border px-3 text-[11px] font-medium shadow-sm ${tone.bg} ${tone.border} ${tone.text}`}
                                      style={{
                                        left: `${left}px`,
                                        top: `${top}px`,
                                        width: `${width}px`,
                                      }}
                                    >
                                      <span className="truncate">{segment.workerName}</span>
                                      <span className="ml-auto shrink-0 text-[10px] opacity-70">
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
                              <div className={`mt-1 text-[11px] ${c.textSecondary}`}>{worker.note ?? "現場配置中"}</div>
                            </div>
                          </div>
                        </div>

                        <div
                          className={`relative shrink-0 ${c.isDark ? "bg-[#111521]" : "bg-slate-50"}`}
                          style={{ width: `${timelineWidth}px`, height: `${rowHeight}px` }}
                        >
                          {renderTimelineGrid()}

                          {workerSegments.map((segment) => {
                            const tone = processColorClasses[segment.color] ?? processColorClasses.cyan;
                            const left = minuteToPixels(segment.startMinutes, timelineWidth);
                            const width = Math.max(56, minuteToPixels(segment.endMinutes - segment.startMinutes, timelineWidth));

                            return (
                              <div
                                key={`${segment.key}:${segment.startMinutes}`}
                                title={`${segment.processName} | ${segment.areaName} | ${formatClock(segment.startMinutes)} - ${formatClock(segment.endMinutes)}`}
                                className={`absolute top-3 flex h-[44px] items-center gap-2 overflow-hidden rounded-xl border px-3 text-[11px] font-medium shadow-sm ${tone.bg} ${tone.border} ${tone.text}`}
                                style={{
                                  left: `${left}px`,
                                  width: `${width}px`,
                                }}
                              >
                                <span className="truncate">{segment.processName}</span>
                                <span className="shrink-0 text-[10px] opacity-70">{segment.areaName}</span>
                                <span className="ml-auto shrink-0 text-[10px] opacity-70">
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
