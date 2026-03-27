import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Send,
  Star,
  Users,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import {
  createDefaultSubmissionReviewEntry,
  readSubmissionReviewStore,
  updateSubmissionReview,
  writeSubmissionReviewStore,
} from "./submissionReviewStore";
import { buildWorkerSubmissionRecords, type WorkerSubmissionRecord } from "./workerMobileStore";

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateDateKeys(startDateKey: string, endDateKey: string) {
  const parseDateKey = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };

  const startDate = parseDateKey(startDateKey);
  const endDate = parseDateKey(endDateKey);
  if (!startDate || !endDate) return [startDateKey];

  const rangeStart = startDate <= endDate ? startDate : endDate;
  const rangeEnd = startDate <= endDate ? endDate : startDate;
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const keys: string[] = [];

  while (cursor <= rangeEnd) {
    keys.push(toDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function latestActivityTime(record: WorkerSubmissionRecord) {
  return record.lastReportedAt ?? record.completedAt ?? record.startedAt ?? "";
}

type SubmissionRecordGroup = {
  id: string;
  summaryRecord: WorkerSubmissionRecord;
  detailRecords: WorkerSubmissionRecord[];
  submissionCount: number;
};

function buildSubmissionGroupId(record: WorkerSubmissionRecord) {
  return [record.dateKey, record.workerId, record.stepId, record.scheduledStartTime, record.scheduledEndTime].join("::");
}

function buildSubmissionRecordGroups(records: WorkerSubmissionRecord[]) {
  const grouped = new Map<string, WorkerSubmissionRecord[]>();

  records.forEach((record) => {
    const groupId = buildSubmissionGroupId(record);
    const bucket = grouped.get(groupId) ?? [];
    bucket.push(record);
    grouped.set(groupId, bucket);
  });

  return Array.from(grouped.entries())
    .map(([groupId, groupRecords]) => {
      const detailRecords = groupRecords
        .slice()
        .sort(
          (left, right) =>
            new Date(latestActivityTime(left) || 0).getTime() - new Date(latestActivityTime(right) || 0).getTime(),
        );
      const latestRecord = groupRecords
        .slice()
        .sort(
          (left, right) =>
            new Date(latestActivityTime(right) || 0).getTime() - new Date(latestActivityTime(left) || 0).getTime(),
        )[0];

      const summaryRecord = {
        ...latestRecord,
        id: groupId,
        startedAt: detailRecords.find((record) => record.startedAt)?.startedAt,
        completedAt:
          groupRecords
            .map((record) => record.completedAt)
            .filter((value): value is string => Boolean(value))
            .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? undefined,
        lastReportedAt:
          groupRecords
            .map((record) => record.lastReportedAt)
            .filter((value): value is string => Boolean(value))
            .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? undefined,
        reportedQuantity: groupRecords.reduce((sum, record) => sum + record.reportedQuantity, 0),
        pausedMinutes: Math.max(...groupRecords.map((record) => record.pausedMinutes ?? 0)),
      } satisfies WorkerSubmissionRecord;

      return {
        id: groupId,
        summaryRecord,
        detailRecords,
        submissionCount: detailRecords.length,
      } satisfies SubmissionRecordGroup;
    })
    .sort(
      (left, right) =>
        new Date(latestActivityTime(right.summaryRecord) || 0).getTime() -
          new Date(latestActivityTime(left.summaryRecord) || 0).getTime() ||
        left.summaryRecord.workerName.localeCompare(right.summaryRecord.workerName, "ja") ||
        left.summaryRecord.processName.localeCompare(right.summaryRecord.processName, "ja"),
    );
}

function sortRecords(records: WorkerSubmissionRecord[]) {
  return records.slice().sort((left, right) => {
    const leftTime = latestActivityTime(left);
    const rightTime = latestActivityTime(right);
    return new Date(rightTime || 0).getTime() - new Date(leftTime || 0).getTime();
  });
}

function parseClockLabel(value?: string) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function toMinutesOfDay(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function formatDurationHours(totalMinutes: number | null) {
  if (totalMinutes === null || totalMinutes <= 0) return "-";
  return `${(totalMinutes / 60).toFixed(1)}h`;
}

function formatActualPlanned(actual: string, planned: string) {
  return `${actual} (${planned})`;
}

function formatUphValue(value: number | null) {
  if (value === null) return "-";
  return value.toFixed(1);
}

function formatVariance(minutes: number | null) {
  if (minutes === null) return "-";
  if (minutes === 0) return "±0分";
  return `${minutes > 0 ? "+" : ""}${minutes}分`;
}

function calculateUph(quantity: number, durationMinutes: number | null) {
  if (durationMinutes === null || durationMinutes <= 0) return null;
  return quantity / (durationMinutes / 60);
}

function buildRecordMetrics(record: WorkerSubmissionRecord, idealUph: number | null) {
  const scheduledStartMinutes = parseClockLabel(record.scheduledStartTime);
  const scheduledEndMinutes = parseClockLabel(record.scheduledEndTime);
  const actualStartMinutes = toMinutesOfDay(record.startedAt);
  const actualEndSource = record.completedAt ?? latestActivityTime(record);
  const actualCompletedMinutes = toMinutesOfDay(record.completedAt);

  const scheduledDurationMinutes =
    scheduledStartMinutes !== null && scheduledEndMinutes !== null
      ? Math.max(0, scheduledEndMinutes - scheduledStartMinutes)
      : null;

  const actualSpanMinutes =
    record.startedAt && actualEndSource
      ? Math.max(0, Math.round((new Date(actualEndSource).getTime() - new Date(record.startedAt).getTime()) / 60000))
      : null;

  const actualWorkingMinutes =
    actualSpanMinutes !== null ? Math.max(0, actualSpanMinutes - (record.pausedMinutes ?? 0)) : null;

  const startVariance =
    scheduledStartMinutes !== null && actualStartMinutes !== null
      ? actualStartMinutes - scheduledStartMinutes
      : null;

  const endVariance =
    scheduledEndMinutes !== null && actualCompletedMinutes !== null
      ? actualCompletedMinutes - scheduledEndMinutes
      : null;

  const actualUph = calculateUph(record.reportedQuantity, actualWorkingMinutes);
  const uphAchievement =
    idealUph !== null && actualUph !== null && idealUph > 0 ? (actualUph / idealUph) * 100 : null;

  return {
    scheduledDurationMinutes,
    actualWorkingMinutes,
    startVariance,
    endVariance,
    actualUph,
    uphAchievement,
  };
}

function statusLabel(status: WorkerSubmissionRecord["status"]) {
  switch (status) {
    case "completed":
      return "完了";
    case "paused":
      return "中断";
    case "working":
      return "作業中";
    default:
      return "未着手";
  }
}

function statusTone(status: WorkerSubmissionRecord["status"]) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-500";
    case "paused":
      return "bg-amber-500/15 text-amber-500";
    case "working":
      return "bg-cyan-500/15 text-cyan-500";
    default:
      return "bg-slate-500/15 text-slate-500";
  }
}

function varianceTone(minutes: number | null) {
  if (minutes === null) return "border-slate-200 bg-slate-100 text-slate-500";
  if (minutes <= 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (minutes <= 15) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function uphTone(rate: number | null) {
  if (rate === null) return "border-slate-200 bg-slate-100 text-slate-500";
  if (rate >= 100) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (rate >= 85) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function resolveReviewEntry(
  reviewStore: ReturnType<typeof readSubmissionReviewStore>,
  recordId: string,
) {
  const current = reviewStore[recordId];
  const fallback = createDefaultSubmissionReviewEntry();

  return {
    rank: current?.rank || fallback.rank,
    comment: current?.comment ?? fallback.comment,
    updatedAt: current?.updatedAt ?? fallback.updatedAt,
  };
}

export function SubmissionRecords() {
  const c = useThemeColors();
  const { selectedSiteId, sites, workflows, shippers, processes } = useMasterData();

  const [periodStart, setPeriodStart] = useState(() => toDateInput(new Date()));
  const [periodEnd, setPeriodEnd] = useState(() => toDateInput(new Date()));
  const [filterShipperName, setFilterShipperName] = useState("all");
  const [filterWorkflowName, setFilterWorkflowName] = useState("all");
  const [filterProcessName, setFilterProcessName] = useState("all");
  const [filterWorkerId, setFilterWorkerId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<WorkerSubmissionRecord["status"] | "all">("all");
  const [filterRank, setFilterRank] = useState<"all" | "S" | "A" | "B" | "C">("all");
  const [reviewStore, setReviewStore] = useState(() => readSubmissionReviewStore());
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);

  useEffect(() => {
    writeSubmissionReviewStore(reviewStore);
  }, [reviewStore]);

  const stepUphMap = useMemo(
    () =>
      new Map(
        workflows
          .filter((workflow) => !selectedSiteId || workflow.siteId === selectedSiteId)
          .flatMap((workflow) => workflow.steps.map((step) => [step.id, step.uph] as const)),
      ),
    [workflows, selectedSiteId],
  );

  const dateKeys = useMemo(() => enumerateDateKeys(periodStart, periodEnd), [periodStart, periodEnd]);

  const records = useMemo(
    () =>
      sortRecords(
        dateKeys.flatMap((dateKey) =>
          buildWorkerSubmissionRecords({
            dateKey,
            selectedSiteId,
            sites,
            workflows,
            shippers,
            processes,
          }),
        ),
      ),
    [dateKeys, selectedSiteId, sites, workflows, shippers, processes],
  );

  const shipperOptions = useMemo(
    () =>
      Array.from(
        new Map(
          records.map((record) => [record.shipperName, { id: record.shipperName, label: record.shipperName }]),
        ).values(),
      ),
    [records],
  );

  const workflowOptions = useMemo(
    () =>
      Array.from(
        new Map(
          records.map((record) => [record.workflowName, { id: record.workflowName, label: record.workflowName }]),
        ).values(),
      ),
    [records],
  );

  const processOptions = useMemo(
    () =>
      Array.from(
        new Map(
          records.map((record) => [record.processName, { id: record.processName, label: record.processName }]),
        ).values(),
      ),
    [records],
  );

  const filteredByProcess = useMemo(
    () =>
      records.filter((record) => {
        if (filterShipperName !== "all" && record.shipperName !== filterShipperName) return false;
        if (filterWorkflowName !== "all" && record.workflowName !== filterWorkflowName) return false;
        if (filterProcessName !== "all" && record.processName !== filterProcessName) return false;
        return true;
      }),
    [records, filterShipperName, filterWorkflowName, filterProcessName],
  );

  const groupedRecords = useMemo(() => buildSubmissionRecordGroups(filteredByProcess), [filteredByProcess]);

  const workerOptions = useMemo(
    () =>
      Array.from(
        new Map(
          groupedRecords.map((group) => [
            group.summaryRecord.workerId,
            { id: group.summaryRecord.workerId, label: group.summaryRecord.workerName },
          ]),
        ).values(),
      ),
    [groupedRecords],
  );

  useEffect(() => {
    if (filterShipperName !== "all" && !shipperOptions.some((option) => option.id === filterShipperName)) {
      setFilterShipperName("all");
    }
  }, [filterShipperName, shipperOptions]);

  useEffect(() => {
    if (filterWorkflowName !== "all" && !workflowOptions.some((option) => option.id === filterWorkflowName)) {
      setFilterWorkflowName("all");
    }
  }, [filterWorkflowName, workflowOptions]);

  useEffect(() => {
    if (filterProcessName !== "all" && !processOptions.some((option) => option.id === filterProcessName)) {
      setFilterProcessName("all");
    }
  }, [filterProcessName, processOptions]);

  useEffect(() => {
    if (filterWorkerId !== "all" && !workerOptions.some((worker) => worker.id === filterWorkerId)) {
      setFilterWorkerId("all");
    }
  }, [filterWorkerId, workerOptions]);

  const visibleGroups = useMemo(() => {
    return groupedRecords.filter((group) => {
      const record = group.summaryRecord;
      const review = resolveReviewEntry(reviewStore, group.id);

      if (filterWorkerId !== "all" && record.workerId !== filterWorkerId) return false;
      if (filterStatus !== "all" && record.status !== filterStatus) return false;
      if (filterRank !== "all" && review.rank !== filterRank) return false;
      return true;
    });
  }, [groupedRecords, filterWorkerId, filterStatus, filterRank, reviewStore]);

  useEffect(() => {
    setExpandedGroupIds((prev) => prev.filter((id) => visibleGroups.some((group) => group.id === id)));
  }, [visibleGroups]);

  const totals = useMemo(() => {
    const completedCount = visibleGroups.filter((group) => group.summaryRecord.status === "completed").length;
    const workingCount = visibleGroups.filter((group) => group.summaryRecord.status === "working").length;
    const uniqueWorkers = new Set(visibleGroups.map((group) => group.summaryRecord.workerId)).size;
    const totalQuantity = visibleGroups.reduce((sum, group) => sum + group.summaryRecord.reportedQuantity, 0);
    const logCount = visibleGroups.reduce((sum, group) => sum + group.submissionCount, 0);

    return {
      completedCount,
      workingCount,
      uniqueWorkers,
      totalQuantity,
      recordCount: logCount,
    };
  }, [visibleGroups]);

  const inputClass = `h-10 w-full rounded-xl border px-3 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`;
  const tableInputClass = `h-9 w-full rounded-lg border px-3 text-[12px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`;
  const cardClass = `${c.bgCard} border ${c.border} rounded-2xl`;
  const thClass = `sticky top-0 z-10 border-b px-3 py-3 text-left text-[11px] font-semibold ${c.border} ${c.bgPanel} ${c.textSecondary}`;
  const tdClass = `border-b px-3 py-3 align-top text-[12px] ${c.borderCard}`;

  const summaryCards = [
    {
      icon: Send,
      label: "送信ログ数",
      value: `${totals.recordCount.toLocaleString("ja-JP")} 件`,
      sub: "表示中の個別送信ログ",
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      icon: CheckCircle2,
      label: "完了工程数",
      value: `${totals.completedCount.toLocaleString("ja-JP")} 件`,
      sub: "完了ステータスの工程集約行",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      icon: Users,
      label: "対象作業者",
      value: `${totals.uniqueWorkers.toLocaleString("ja-JP")} 人`,
      sub: `作業中 ${totals.workingCount.toLocaleString("ja-JP")} 件`,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      icon: Clock3,
      label: "実績数量",
      value: `${totals.totalQuantity.toLocaleString("ja-JP")} 件`,
      sub: "表示中ログの送信数量合計",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ] as const;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <div className={`${cardClass} shrink-0`}>
        <div className={`flex flex-col gap-4 border-b px-5 py-4 ${c.border}`}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
            <div className="grid gap-1 xl:col-span-2">
              <span className={`text-xs font-medium ${c.textSecondary}`}>作業期間</span>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <input
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  className={inputClass}
                />
                <span className={`text-xs ${c.textMuted}`}>~</span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>作業者</span>
              <select
                value={filterWorkerId}
                onChange={(event) => setFilterWorkerId(event.target.value)}
                className={inputClass}
              >
                <option value="all">すべて</option>
                {workerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>荷主</span>
              <select
                value={filterShipperName}
                onChange={(event) => setFilterShipperName(event.target.value)}
                className={inputClass}
              >
                <option value="all">すべて</option>
                {shipperOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>業務</span>
              <select
                value={filterWorkflowName}
                onChange={(event) => setFilterWorkflowName(event.target.value)}
                className={inputClass}
              >
                <option value="all">すべて</option>
                {workflowOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>工程</span>
              <select
                value={filterProcessName}
                onChange={(event) => setFilterProcessName(event.target.value)}
                className={inputClass}
              >
                <option value="all">すべて</option>
                {processOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>状態</span>
              <select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value as WorkerSubmissionRecord["status"] | "all")}
                className={inputClass}
              >
                <option value="all">すべて</option>
                <option value="pending">未着手</option>
                <option value="working">作業中</option>
                <option value="paused">中断</option>
                <option value="completed">完了</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>ランク</span>
              <select
                value={filterRank}
                onChange={(event) => setFilterRank(event.target.value as typeof filterRank)}
                className={inputClass}
              >
                <option value="all">すべて</option>
                <option value="S">S</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <div key={card.label} className={`rounded-2xl border p-4 ${c.borderCard} ${c.bgPanel}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-xs ${c.textSecondary}`}>{card.label}</div>
                    <div className={`mt-1 text-lg font-semibold ${c.textPrimary}`}>{card.value}</div>
                    <div className={`mt-1 text-xs ${c.textMuted}`}>{card.sub}</div>
                  </div>
                  <div className={`rounded-xl p-2 ${card.bg}`}>
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`${cardClass} min-h-0 flex-1 overflow-hidden`}>
        {visibleGroups.length === 0 ? (
          <div className="flex h-full items-center justify-center p-10 text-center">
            <div>
              <MessageSquareText className={`mx-auto h-6 w-6 ${c.textMuted}`} />
              <div className={`mt-3 text-base font-medium ${c.textPrimary}`}>表示できる送信ログがありません</div>
              <div className={`mt-2 text-sm ${c.textSecondary}`}>
                作業期間や絞り込み条件を変更して確認してください。
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="min-w-[1620px] w-full border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>
                    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2">
                      <span aria-hidden="true" />
                      <span>作業者</span>
                    </div>
                  </th>
                  <th className={thClass}>荷主</th>
                  <th className={thClass}>業務</th>
                  <th className={thClass}>工程</th>
                  <th className={thClass}>状態</th>
                  <th className={thClass}>開始</th>
                  <th className={thClass}>終了</th>
                  <th className={thClass}>所要時間</th>
                  <th className={thClass}>UPH</th>
                  <th className={thClass}>実績数</th>
                  <th className={thClass}>ランク</th>
                  <th className={thClass}>管理者コメント</th>
                  <th className={thClass}>最終更新</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => {
                  const record = group.summaryRecord;
                  const review = resolveReviewEntry(reviewStore, group.id);
                  const idealUph = stepUphMap.get(record.stepId) ?? null;
                  const metrics = buildRecordMetrics(record, idealUph);
                  const isExpanded = expandedGroupIds.includes(group.id);
                  let cumulativeQuantity = 0;

                  return (
                    <Fragment key={group.id}>
                      <tr className={c.bgCard}>
                        <td className={tdClass}>
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedGroupIds((prev) =>
                                  prev.includes(group.id)
                                    ? prev.filter((id) => id !== group.id)
                                    : [...prev, group.id],
                                )
                              }
                              className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg border bg-sky-50 text-sky-600 transition hover:bg-sky-100 ${c.borderCard}`}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? "送信明細を閉じる" : "送信明細を開く"}
                            >
                              <span className="text-base font-semibold leading-none">{isExpanded ? "-" : "+"}</span>
                            </button>
                            <div>
                              <div className={`font-semibold ${c.textPrimary}`}>{record.workerName}</div>
                              <div className={`mt-1 text-[11px] ${c.textMuted}`}>送信 {group.submissionCount} 回</div>
                            </div>
                          </div>
                        </td>

                        <td className={tdClass}>
                          <div className={`font-medium ${c.textPrimary}`}>{record.shipperName}</div>
                        </td>

                        <td className={tdClass}>
                          <div className={`font-medium ${c.textPrimary}`}>{record.workflowName}</div>
                        </td>

                        <td className={tdClass}>
                          <div className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${c.bgSurface} ${c.textSecondary}`}>
                            {record.processName}
                          </div>
                        </td>

                        <td className={tdClass}>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusTone(record.status)}`}>
                            {statusLabel(record.status)}
                          </span>
                        </td>

                        <td className={tdClass}>
                          <div className={`font-medium ${c.textPrimary}`}>
                            {formatActualPlanned(formatClock(record.startedAt), record.scheduledStartTime)}
                          </div>
                          <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${varianceTone(metrics.startVariance)}`}>
                            {formatVariance(metrics.startVariance)}
                          </div>
                        </td>

                        <td className={tdClass}>
                          <div className={`font-medium ${c.textPrimary}`}>
                            {formatActualPlanned(
                              record.completedAt ? formatClock(record.completedAt) : "-",
                              record.scheduledEndTime,
                            )}
                          </div>
                          <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${varianceTone(metrics.endVariance)}`}>
                            {formatVariance(metrics.endVariance)}
                          </div>
                        </td>

                        <td className={tdClass}>
                          <div className={`font-medium ${c.textPrimary}`}>
                            {formatActualPlanned(
                              formatDurationHours(metrics.actualWorkingMinutes),
                              formatDurationHours(metrics.scheduledDurationMinutes),
                            )}
                          </div>
                          {!record.completedAt && record.startedAt ? (
                            <div className={`mt-1 text-[10px] ${c.textMuted}`}>最新送信時点</div>
                          ) : null}
                        </td>

                        <td className={tdClass}>
                          <div className={`font-medium ${c.textPrimary}`}>
                            {formatActualPlanned(formatUphValue(metrics.actualUph), formatUphValue(idealUph))}
                          </div>
                          <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${uphTone(metrics.uphAchievement)}`}>
                            {metrics.uphAchievement !== null ? `${metrics.uphAchievement.toFixed(0)}%` : "-"}
                          </div>
                        </td>

                        <td className={tdClass}>
                          <div className={`font-semibold ${c.textPrimary}`}>
                            {record.reportedQuantity.toLocaleString("ja-JP")} 件
                          </div>
                        </td>

                        <td className={tdClass}>
                          <select
                            value={review.rank}
                            onChange={(event) =>
                              setReviewStore((prev) =>
                                updateSubmissionReview(prev, group.id, {
                                  rank: event.target.value as "S" | "A" | "B" | "C",
                                }),
                              )
                            }
                            className={tableInputClass}
                          >
                            <option value="S">S</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        </td>

                        <td className={tdClass}>
                          <input
                            value={review.comment}
                            onChange={(event) =>
                              setReviewStore((prev) =>
                                updateSubmissionReview(prev, group.id, { comment: event.target.value }),
                              )
                            }
                            placeholder="コメント入力"
                            className={tableInputClass}
                          />
                        </td>

                        <td className={tdClass}>
                          <div className={`flex items-center gap-2 ${c.textMuted}`}>
                            <Star className="h-4 w-4" />
                            <span>{review.updatedAt ? formatDateTime(review.updatedAt) : "-"}</span>
                          </div>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className={c.bgCard}>
                          <td colSpan={13} className={`border-b px-4 py-4 ${c.borderCard}`}>
                            <div className={`rounded-2xl border ${c.borderCard} ${c.bgPanel}`}>
                              <div className={`border-b px-4 py-3 text-xs font-semibold ${c.border} ${c.textSecondary}`}>
                                送信記録詳細
                              </div>
                              <div className="overflow-auto">
                                <table className="min-w-[560px] w-full text-left text-[12px]">
                                  <thead className={`${c.bgSurface} ${c.textSecondary}`}>
                                    <tr>
                                      <th className="px-4 py-2.5 font-medium">回数</th>
                                      <th className="px-4 py-2.5 font-medium">送信時刻</th>
                                      <th className="px-4 py-2.5 font-medium">送信数</th>
                                      <th className="px-4 py-2.5 font-medium">累計</th>
                                      <th className="px-4 py-2.5 font-medium">状態</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.detailRecords.map((detailRecord, index) => {
                                      cumulativeQuantity += detailRecord.reportedQuantity;

                                      return (
                                        <tr key={detailRecord.id} className={`border-t ${c.borderCard}`}>
                                          <td className="px-4 py-2.5">{index + 1}</td>
                                          <td className="px-4 py-2.5">
                                            {formatDateTime(
                                              detailRecord.lastReportedAt ??
                                                detailRecord.completedAt ??
                                                detailRecord.startedAt,
                                            )}
                                          </td>
                                          <td className="px-4 py-2.5 font-medium text-cyan-500">
                                            {detailRecord.reportedQuantity.toLocaleString("ja-JP")} 件
                                          </td>
                                          <td className="px-4 py-2.5">
                                            {cumulativeQuantity.toLocaleString("ja-JP")} 件
                                          </td>
                                          <td className="px-4 py-2.5">
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusTone(detailRecord.status)}`}>
                                              {statusLabel(detailRecord.status)}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
