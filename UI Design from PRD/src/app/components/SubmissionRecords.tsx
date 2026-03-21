import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Search,
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
    actualSpanMinutes !== null
      ? Math.max(0, actualSpanMinutes - (record.pausedMinutes ?? 0))
      : null;

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
    idealUph !== null && actualUph !== null && idealUph > 0
      ? (actualUph / idealUph) * 100
      : null;

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

  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [keyword, setKeyword] = useState("");
  const [filterProcessName, setFilterProcessName] = useState("all");
  const [filterWorkerId, setFilterWorkerId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<WorkerSubmissionRecord["status"] | "all">("all");
  const [filterRank, setFilterRank] = useState<"all" | "S" | "A" | "B" | "C">("all");
  const [reviewStore, setReviewStore] = useState(() => readSubmissionReviewStore());

  useEffect(() => {
    writeSubmissionReviewStore(reviewStore);
  }, [reviewStore]);

  const siteName = useMemo(
    () => sites.find((site) => site.id === selectedSiteId)?.name ?? "拠点未選択",
    [sites, selectedSiteId],
  );

  const stepUphMap = useMemo(
    () =>
      new Map(
        workflows
          .filter((workflow) => !selectedSiteId || workflow.siteId === selectedSiteId)
          .flatMap((workflow) => workflow.steps.map((step) => [step.id, step.uph] as const)),
      ),
    [workflows, selectedSiteId],
  );

  const records = useMemo(
    () =>
      sortRecords(
        buildWorkerSubmissionRecords({
          dateKey: selectedDate,
          selectedSiteId,
          sites,
          workflows,
          shippers,
          processes,
        }),
      ),
    [selectedDate, selectedSiteId, sites, workflows, shippers, processes],
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
        if (filterProcessName !== "all" && record.processName !== filterProcessName) return false;
        return true;
      }),
    [records, filterProcessName],
  );

  const workerOptions = useMemo(
    () =>
      Array.from(
        new Map(
          filteredByProcess.map((record) => [record.workerId, { id: record.workerId, label: record.workerName }]),
        ).values(),
      ),
    [filteredByProcess],
  );

  useEffect(() => {
    if (filterWorkerId !== "all" && !workerOptions.some((worker) => worker.id === filterWorkerId)) {
      setFilterWorkerId("all");
    }
  }, [filterWorkerId, workerOptions]);

  const visibleRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return filteredByProcess.filter((record) => {
      const review = resolveReviewEntry(reviewStore, record.id);

      if (filterWorkerId !== "all" && record.workerId !== filterWorkerId) return false;
      if (filterStatus !== "all" && record.status !== filterStatus) return false;
      if (filterRank !== "all" && review.rank !== filterRank) return false;

      if (!normalizedKeyword) return true;

      const haystack = [
        record.workerName,
        record.workflowName,
        record.processName,
        record.shipperName,
        review.comment,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedKeyword);
    });
  }, [filteredByProcess, filterWorkerId, filterStatus, filterRank, keyword, reviewStore]);

  const totals = useMemo(() => {
    const completedCount = visibleRecords.filter((record) => record.status === "completed").length;
    const workingCount = visibleRecords.filter((record) => record.status === "working").length;
    const uniqueWorkers = new Set(visibleRecords.map((record) => record.workerId)).size;
    const totalQuantity = visibleRecords.reduce((sum, record) => sum + record.reportedQuantity, 0);

    return {
      completedCount,
      workingCount,
      uniqueWorkers,
      totalQuantity,
      recordCount: visibleRecords.length,
    };
  }, [visibleRecords]);

  const inputClass = `h-10 w-full rounded-xl border px-3 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`;
  const tableInputClass = `h-9 w-full rounded-lg border px-3 text-[12px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`;
  const cardClass = `${c.bgCard} border ${c.border} rounded-2xl`;
  const thClass = `sticky top-0 z-10 border-b px-3 py-3 text-left text-[11px] font-semibold ${c.border} ${c.bgPanel} ${c.textSecondary}`;
  const tdClass = `border-b px-3 py-3 align-top text-[12px] ${c.borderCard}`;
  const metaLabelClass = `text-[10px] font-medium ${c.textMuted}`;
  const metaValueClass = `text-[12px] ${c.textPrimary}`;

  const summaryCards = [
    {
      icon: Send,
      label: "送信ログ数",
      value: `${totals.recordCount.toLocaleString("ja-JP")} 件`,
      sub: "現在の絞り込み結果",
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      icon: CheckCircle2,
      label: "完了ログ",
      value: `${totals.completedCount.toLocaleString("ja-JP")} 件`,
      sub: "完了済みの送信実績",
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
      label: "実績数合計",
      value: `${totals.totalQuantity.toLocaleString("ja-JP")} 件`,
      sub: "ログに記録された実績数",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ] as const;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <div className={`${cardClass} shrink-0`}>
        <div className={`flex flex-col gap-4 border-b px-5 py-4 ${c.border}`}>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={`text-lg font-semibold ${c.textPrimary}`}>送信実績</div>
              <div className={`text-sm ${c.textSecondary}`}>
                大量の送信ログを一覧で比較できるよう、予定と実績の差分とUPHを表形式で管理します。
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>拠点: {siteName}</span>
              <span className={`rounded-full px-3 py-1 ${c.bgSurface} ${c.textSecondary}`}>対象日: {selectedDate}</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="grid gap-1">
              <span className={`text-xs font-medium ${c.textSecondary}`}>対象日</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className={inputClass}
              />
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

          <label className="grid gap-1">
            <span className={`text-xs font-medium ${c.textSecondary}`}>検索</span>
            <div className="relative">
              <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${c.textMuted}`} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="作業者名 / 業務名 / 工程名 / 荷主名 / コメントで検索"
                className={`${inputClass} pl-10`}
              />
            </div>
          </label>
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
        {visibleRecords.length === 0 ? (
          <div className="flex h-full items-center justify-center p-10 text-center">
            <div>
              <MessageSquareText className={`mx-auto h-6 w-6 ${c.textMuted}`} />
              <div className={`mt-3 text-base font-medium ${c.textPrimary}`}>表示できる送信ログがありません</div>
              <div className={`mt-2 text-sm ${c.textSecondary}`}>
                対象日や絞り込み条件を変更して確認してください。
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="min-w-[1480px] w-full border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>作業者</th>
                  <th className={thClass}>業務情報</th>
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
                {visibleRecords.map((record) => {
                  const review = resolveReviewEntry(reviewStore, record.id);
                  const idealUph = stepUphMap.get(record.stepId) ?? null;
                  const metrics = buildRecordMetrics(record, idealUph);

                  return (
                    <tr key={record.id} className={c.bgCard}>
                      <td className={tdClass}>
                        <div className={`font-semibold ${c.textPrimary}`}>{record.workerName}</div>
                      </td>

                      <td className={tdClass}>
                        <div className={`font-medium ${c.textPrimary}`}>{record.workflowName}</div>
                        <div className={`mt-1 text-[11px] ${c.textSecondary}`}>{record.shipperName}</div>
                        <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] ${c.bgSurface} ${c.textSecondary}`}>
                          {record.processName}
                        </div>
                      </td>

                      <td className={tdClass}>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusTone(record.status)}`}>
                          {statusLabel(record.status)}
                        </span>
                      </td>

                      <td className={tdClass}>
                        <div className={metaLabelClass}>予定</div>
                        <div className={metaValueClass}>{record.scheduledStartTime}</div>
                        <div className={`mt-2 ${metaLabelClass}`}>実績</div>
                        <div className={metaValueClass}>{formatClock(record.startedAt)}</div>
                        <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${varianceTone(metrics.startVariance)}`}>
                          {formatVariance(metrics.startVariance)}
                        </div>
                      </td>

                      <td className={tdClass}>
                        <div className={metaLabelClass}>予定</div>
                        <div className={metaValueClass}>{record.scheduledEndTime}</div>
                        <div className={`mt-2 ${metaLabelClass}`}>実績</div>
                        <div className={metaValueClass}>{record.completedAt ? formatClock(record.completedAt) : "-"}</div>
                        <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${varianceTone(metrics.endVariance)}`}>
                          {formatVariance(metrics.endVariance)}
                        </div>
                      </td>

                      <td className={tdClass}>
                        <div className={metaLabelClass}>予定</div>
                        <div className={metaValueClass}>{formatDurationHours(metrics.scheduledDurationMinutes)}</div>
                        <div className={`mt-2 ${metaLabelClass}`}>実績</div>
                        <div className={metaValueClass}>{formatDurationHours(metrics.actualWorkingMinutes)}</div>
                        {!record.completedAt && record.startedAt ? (
                          <div className={`mt-1 text-[10px] ${c.textMuted}`}>最新送信時点</div>
                        ) : null}
                      </td>

                      <td className={tdClass}>
                        <div className={metaLabelClass}>理想</div>
                        <div className={metaValueClass}>
                          {idealUph !== null ? idealUph.toLocaleString("ja-JP") : "-"}
                        </div>
                        <div className={`mt-2 ${metaLabelClass}`}>実績</div>
                        <div className={metaValueClass}>
                          {metrics.actualUph !== null ? metrics.actualUph.toFixed(1) : "-"}
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
                              updateSubmissionReview(prev, record.id, { rank: event.target.value as "S" | "A" | "B" | "C" }),
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
                              updateSubmissionReview(prev, record.id, { comment: event.target.value }),
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
