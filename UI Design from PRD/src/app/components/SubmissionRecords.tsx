import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, PauseOctagon, RotateCcw, Search, Send, Users } from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
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

function formatMinutes(value: number) {
  if (value <= 0) return "0分";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours <= 0) return `${minutes}分`;
  if (minutes === 0) return `${hours}時間`;
  return `${hours}時間${minutes}分`;
}

function latestActivityTime(record: WorkerSubmissionRecord) {
  return record.lastReportedAt ?? record.completedAt ?? record.startedAt ?? "";
}

function statusMeta(status: WorkerSubmissionRecord["status"]) {
  switch (status) {
    case "completed":
      return { label: "完了", className: "bg-emerald-500/15 text-emerald-500" };
    case "paused":
      return { label: "中断中", className: "bg-amber-500/15 text-amber-500" };
    case "working":
      return { label: "作業中", className: "bg-cyan-500/15 text-cyan-500" };
    default:
      return { label: "未着手", className: "bg-slate-500/15 text-slate-500" };
  }
}

function sortRecords(records: WorkerSubmissionRecord[]) {
  return records.slice().sort((left, right) => {
    const leftTime = latestActivityTime(left);
    const rightTime = latestActivityTime(right);
    return new Date(rightTime || 0).getTime() - new Date(leftTime || 0).getTime();
  });
}

export function SubmissionRecords() {
  const c = useThemeColors();
  const { selectedSiteId, sites, workflows, shippers, areas, processes } = useMasterData();

  const [selectedDate, setSelectedDate] = useState(() => toDateInput(new Date()));
  const [activeTab, setActiveTab] = useState<"summary" | "log">("summary");
  const [filterShipperId, setFilterShipperId] = useState("all");
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterProcessId, setFilterProcessId] = useState("all");
  const [filterWorkerId, setFilterWorkerId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<WorkerSubmissionRecord["status"] | "all">("all");
  const [keyword, setKeyword] = useState("");

  const records = useMemo(
    () =>
      sortRecords(
        buildWorkerSubmissionRecords({
          dateKey: selectedDate,
          selectedSiteId,
          sites,
          workflows,
          shippers,
          areas,
          processes,
        }),
      ),
    [selectedDate, selectedSiteId, sites, workflows, shippers, areas, processes],
  );

  const shipperOptions = useMemo(
    () => Array.from(new Map(records.map((record) => [record.shipperName, { id: record.shipperName, label: record.shipperName }])).values()),
    [records],
  );

  const areaOptions = useMemo(() => {
    const candidates = filterShipperId === "all" ? records : records.filter((record) => record.shipperName === filterShipperId);
    return Array.from(new Map(candidates.map((record) => [record.areaName, { id: record.areaName, label: record.areaName }])).values());
  }, [records, filterShipperId]);

  const processOptions = useMemo(() => {
    const candidates = records.filter((record) => {
      if (filterShipperId !== "all" && record.shipperName !== filterShipperId) return false;
      if (filterAreaId !== "all" && record.areaName !== filterAreaId) return false;
      return true;
    });
    return Array.from(new Map(candidates.map((record) => [record.processName, { id: record.processName, label: record.processName }])).values());
  }, [records, filterShipperId, filterAreaId]);

  const aggregateRecords = useMemo(
    () =>
      records.filter((record) => {
        if (filterShipperId !== "all" && record.shipperName !== filterShipperId) return false;
        if (filterAreaId !== "all" && record.areaName !== filterAreaId) return false;
        if (filterProcessId !== "all" && record.processName !== filterProcessId) return false;
        return true;
      }),
    [records, filterShipperId, filterAreaId, filterProcessId],
  );

  const workerOptions = useMemo(
    () => Array.from(new Map(aggregateRecords.map((record) => [record.workerId, { id: record.workerId, label: record.workerName }])).values()),
    [aggregateRecords],
  );

  useEffect(() => {
    if (filterAreaId !== "all" && !areaOptions.some((option) => option.id === filterAreaId)) {
      setFilterAreaId("all");
    }
  }, [filterAreaId, areaOptions]);

  useEffect(() => {
    if (filterProcessId !== "all" && !processOptions.some((option) => option.id === filterProcessId)) {
      setFilterProcessId("all");
    }
  }, [filterProcessId, processOptions]);

  useEffect(() => {
    if (filterWorkerId !== "all" && !workerOptions.some((option) => option.id === filterWorkerId)) {
      setFilterWorkerId("all");
    }
  }, [filterWorkerId, workerOptions]);

  const detailRecords = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return aggregateRecords.filter((record) => {
      if (filterWorkerId !== "all" && record.workerId !== filterWorkerId) return false;
      if (filterStatus !== "all" && record.status !== filterStatus) return false;
      if (!normalizedKeyword) return true;
      const haystack = `${record.workerName} ${record.workflowName} ${record.shipperName} ${record.areaName} ${record.processName}`.toLowerCase();
      return haystack.includes(normalizedKeyword);
    });
  }, [aggregateRecords, filterWorkerId, filterStatus, keyword]);

  const totals = useMemo(() => {
    const completedCount = aggregateRecords.filter((record) => record.status === "completed").length;
    const uniqueWorkers = new Set(aggregateRecords.map((record) => record.workerId)).size;
    const totalQuantity = aggregateRecords.reduce((sum, record) => sum + record.reportedQuantity, 0);
    const pausedMinutes = aggregateRecords.reduce((sum, record) => sum + record.pausedMinutes, 0);

    return {
      completedCount,
      uniqueWorkers,
      totalQuantity,
      pausedMinutes,
      recordCount: aggregateRecords.length,
    };
  }, [aggregateRecords]);

  const stepSummaries = useMemo(() => {
    const summaryMap = new Map<
      string,
      {
        key: string;
        workflowName: string;
        shipperName: string;
        areaName: string;
        processName: string;
        totalQuantity: number;
        recordCount: number;
        pausedMinutes: number;
        workerCount: number;
        latestReportedAt?: string;
      }
    >();

    aggregateRecords.forEach((record) => {
      const current = summaryMap.get(record.stepId) ?? {
        key: record.stepId,
        workflowName: record.workflowName,
        shipperName: record.shipperName,
        areaName: record.areaName,
        processName: record.processName,
        totalQuantity: 0,
        recordCount: 0,
        pausedMinutes: 0,
        workerCount: 0,
        latestReportedAt: undefined,
      };

      current.totalQuantity += record.reportedQuantity;
      current.recordCount += 1;
      current.pausedMinutes += record.pausedMinutes;
      current.workerCount += 1;

      const currentLatest = current.latestReportedAt ? new Date(current.latestReportedAt).getTime() : 0;
      const nextLatest = latestActivityTime(record) ? new Date(latestActivityTime(record)).getTime() : 0;
      if (nextLatest > currentLatest) current.latestReportedAt = latestActivityTime(record);

      summaryMap.set(record.stepId, current);
    });

    return Array.from(summaryMap.values()).sort((left, right) => {
      if (right.totalQuantity !== left.totalQuantity) return right.totalQuantity - left.totalQuantity;
      return left.processName.localeCompare(right.processName, "ja");
    });
  }, [aggregateRecords]);

  const cardClass = `${c.bgCard} border ${c.border} rounded-xl`;
  const inputClass = `h-10 w-full rounded-lg border px-3 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary}`;

  const resetFilters = () => {
    setFilterShipperId("all");
    setFilterAreaId("all");
    setFilterProcessId("all");
    setFilterWorkerId("all");
    setFilterStatus("all");
    setKeyword("");
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: Send,
            label: "送信件数",
            value: `${totals.recordCount.toLocaleString("ja-JP")}件`,
            sub: "送信記録として登録された件数",
            color: "text-cyan-500",
            bg: "bg-cyan-500/10",
          },
          {
            icon: CheckCircle2,
            label: "処理数量実績",
            value: `${totals.totalQuantity.toLocaleString("ja-JP")}個`,
            sub: "送信済み数量の合計",
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
          },
          {
            icon: PauseOctagon,
            label: "中断時間合計",
            value: formatMinutes(totals.pausedMinutes),
            sub: "休憩・中断時間の累計",
            color: "text-amber-500",
            bg: "bg-amber-500/10",
          },
          {
            icon: Users,
            label: "対象作業者数",
            value: `${totals.uniqueWorkers.toLocaleString("ja-JP")}名`,
            sub: `完了 ${totals.completedCount.toLocaleString("ja-JP")} 件`,
            color: "text-violet-500",
            bg: "bg-violet-500/10",
          },
        ].map((item) => (
          <div key={item.label} className={`${cardClass} flex items-center gap-3 p-4`}>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.bg}`}>
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
            <div>
              <div className={`text-[11px] ${c.textMuted}`}>{item.label}</div>
              <div className={`text-[20px] ${c.textPrimary} tabular-nums`}>{item.value}</div>
              <div className={`text-[11px] ${c.textSecondary}`}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={`${cardClass} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={`text-[14px] font-semibold ${c.textPrimary}`}>送信実績の絞り込み</div>
            <div className={`mt-1 text-[12px] ${c.textSecondary}`}>
              上段で集計条件、下段で明細条件を指定します。
            </div>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[13px] ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
          >
            <RotateCcw className="h-4 w-4" />
            条件をクリア
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <div className={`mb-1.5 text-[12px] ${c.textSecondary}`}>作業日</div>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <div className={`mb-1.5 text-[12px] ${c.textSecondary}`}>荷主</div>
            <select value={filterShipperId} onChange={(event) => setFilterShipperId(event.target.value)} className={inputClass}>
              <option value="all">すべて</option>
              {shipperOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className={`mb-1.5 text-[12px] ${c.textSecondary}`}>エリア</div>
            <select value={filterAreaId} onChange={(event) => setFilterAreaId(event.target.value)} className={inputClass}>
              <option value="all">すべて</option>
              {areaOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className={`mb-1.5 text-[12px] ${c.textSecondary}`}>工程</div>
            <select value={filterProcessId} onChange={(event) => setFilterProcessId(event.target.value)} className={inputClass}>
              <option value="all">すべて</option>
              {processOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={`mt-4 border-t pt-4 ${c.borderCard}`}>
          <div className={`mb-3 text-[12px] font-medium ${c.textSecondary}`}>明細条件</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_220px_minmax(0,1fr)]">
            <label className="block">
              <div className={`mb-1.5 text-[12px] ${c.textSecondary}`}>作業者</div>
              <select value={filterWorkerId} onChange={(event) => setFilterWorkerId(event.target.value)} className={inputClass}>
                <option value="all">すべて</option>
                {workerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className={`mb-1.5 text-[12px] ${c.textSecondary}`}>状態</div>
              <select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value as WorkerSubmissionRecord["status"] | "all")}
                className={inputClass}
              >
                <option value="all">すべて</option>
                <option value="working">作業中</option>
                <option value="paused">中断中</option>
                <option value="completed">完了</option>
              </select>
            </label>
            <label className="block">
              <div className={`mb-1.5 text-[12px] ${c.textSecondary}`}>キーワード</div>
              <div className="relative">
                <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${c.textMuted}`} />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="作業者、荷主、エリア、工程で検索"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className={`border-b px-4 py-3 ${c.borderCard}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className={`text-[14px] font-semibold ${c.textPrimary}`}>
                {activeTab === "summary" ? "工程別送信集計" : "送信ログ一覧"}
              </div>
              <div className={`mt-1 text-[12px] ${c.textSecondary}`}>
                {activeTab === "summary"
                  ? "工程ごとの送信件数、数量、人数、停止時間を集計します。"
                  : "作業者ごとの開始・終了・数量・停止時間を時系列で確認します。"}
              </div>
            </div>
            <div className={`inline-flex rounded-xl border p-1 ${c.borderCard} ${c.bgSurface}`}>
              <button
                type="button"
                onClick={() => setActiveTab("summary")}
                className={`rounded-lg px-3 py-2 text-[12px] font-medium transition ${
                  activeTab === "summary" ? "bg-cyan-500 text-white" : `${c.textSecondary}`
                }`}
              >
                工程別送信集計
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("log")}
                className={`rounded-lg px-3 py-2 text-[12px] font-medium transition ${
                  activeTab === "log" ? "bg-cyan-500 text-white" : `${c.textSecondary}`
                }`}
              >
                送信ログ一覧
              </button>
            </div>
          </div>
        </div>

        {activeTab === "summary" ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[760px]">
              <thead className={c.bgCard}>
                <tr className={`border-b ${c.borderCard}`}>
                  {["荷主", "エリア", "工程", "実績数量", "送信件数", "作業者数", "中断時間", "最新送信"].map((header) => (
                    <th key={header} className={`px-4 py-3 text-left text-[12px] font-medium ${c.textMuted}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stepSummaries.map((row) => (
                  <tr key={row.key} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className={`px-4 py-3 text-[13px] ${c.textPrimary}`}>{row.shipperName}</td>
                    <td className={`px-4 py-3 text-[13px] ${c.textPrimary}`}>{row.areaName}</td>
                    <td className="px-4 py-3">
                      <div className={`text-[13px] ${c.textPrimary}`}>{row.processName}</div>
                      <div className={`mt-0.5 text-[11px] ${c.textSecondary}`}>{row.workflowName}</div>
                    </td>
                    <td className={`px-4 py-3 text-[13px] font-semibold text-cyan-500 tabular-nums`}>
                      {row.totalQuantity.toLocaleString("ja-JP")}個
                    </td>
                    <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>
                      {row.recordCount.toLocaleString("ja-JP")}件
                    </td>
                    <td className={`px-4 py-3 text-[13px] ${c.textPrimary} tabular-nums`}>
                      {row.workerCount.toLocaleString("ja-JP")}名
                    </td>
                    <td className={`px-4 py-3 text-[13px] ${c.textPrimary}`}>{formatMinutes(row.pausedMinutes)}</td>
                    <td className={`px-4 py-3 text-[13px] ${c.textSecondary}`}>{formatDateTime(row.latestReportedAt)}</td>
                  </tr>
                ))}
                {stepSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`px-4 py-12 text-center text-[13px] ${c.textMuted}`}>
                      条件に一致する工程別送信集計がありません。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[880px]">
              <thead className={c.bgCard}>
                <tr className={`border-b ${c.borderCard}`}>
                  {["作業者", "作業内容", "開始", "終了", "数量", "中断", "状態", "送信時刻"].map((header) => (
                    <th key={header} className={`px-4 py-3 text-left text-[12px] font-medium ${c.textMuted}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRecords.map((record) => {
                  const meta = statusMeta(record.status);
                  return (
                    <tr key={record.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                      <td className="px-4 py-3">
                        <div className={`text-[13px] ${c.textPrimary}`}>{record.workerName}</div>
                        <div className={`mt-0.5 text-[11px] ${c.textSecondary}`}>{record.siteName}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`text-[13px] ${c.textPrimary}`}>{record.processName}</div>
                        <div className={`mt-0.5 text-[11px] ${c.textSecondary}`}>
                          {record.shipperName} / {record.areaName}
                        </div>
                        <div className={`mt-0.5 text-[11px] ${c.textMuted}`}>{record.workflowName}</div>
                      </td>
                      <td className={`px-4 py-3 text-[13px] ${c.textPrimary}`}>
                        {record.startedAt ? formatDateTime(record.startedAt) : `${record.scheduledStartTime} 予定`}
                      </td>
                      <td className={`px-4 py-3 text-[13px] ${c.textPrimary}`}>
                        {record.completedAt ? formatDateTime(record.completedAt) : `${record.scheduledEndTime} 予定`}
                      </td>
                      <td className={`px-4 py-3 text-[13px] font-semibold text-cyan-500 tabular-nums`}>
                        {record.reportedQuantity.toLocaleString("ja-JP")}個
                      </td>
                      <td className={`px-4 py-3 text-[13px] ${c.textPrimary}`}>{formatMinutes(record.pausedMinutes)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${meta.className}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-[13px] ${c.textSecondary}`}>{formatDateTime(record.lastReportedAt)}</td>
                    </tr>
                  );
                })}
                {detailRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={`px-4 py-12 text-center text-[13px] ${c.textMuted}`}>
                      条件に一致する送信ログがありません。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
