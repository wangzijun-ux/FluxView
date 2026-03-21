import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  FileText,
  Megaphone,
  Plus,
  Save,
  Search,
  Send,
  Shield,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMasterData } from "./MasterDataContext";
import { useThemeColors } from "./ThemeContext";
import { readWorkerNotifications, resolveDemoWorkerId, saveWorkerNotifications, type WorkerNotificationRecord } from "./workerMobileStore";

const NOTIFICATION_STORAGE_KEY = "fluxview-admin-notifications-v1";
const USER_STORAGE_KEY = "fluxview-users-v1";

type NotificationType = "move" | "announce" | "safety" | "alert";
type NotificationStatus = "sent" | "draft" | "scheduled";
type TargetMode = "site-workers" | "selected-workers" | "site-managers" | "dispatch-managers";
type DeliveryMode = "now" | "scheduled";

interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  status: NotificationStatus;
  targetMode: TargetMode;
  targetSiteId: string;
  targetUserIds: string[];
  targetLabel: string;
  createdAt: string;
  sentAt?: string;
  scheduledAt?: string;
  readRate?: number;
  source: "manual" | "system";
}

interface UserCandidate {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive" | "locked";
  employmentType?: string;
}

interface FormState {
  type: NotificationType;
  title: string;
  message: string;
  targetMode: TargetMode;
  targetSiteId: string;
  targetUserIds: string[];
  deliveryMode: DeliveryMode;
  scheduledDate: string;
  scheduledTime: string;
}

const typeConfig: Record<NotificationType, { icon: LucideIcon; label: string; bg: string; text: string; border: string }> = {
  move: { icon: Users, label: "移動指示", bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30" },
  announce: { icon: Megaphone, label: "全体連絡", bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/30" },
  safety: { icon: Shield, label: "安全注意", bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  alert: { icon: AlertTriangle, label: "緊急アラート", bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30" },
};

const targetModeLabels: Record<TargetMode, string> = {
  "site-workers": "拠点の全作業員",
  "selected-workers": "個別作業員",
  "site-managers": "現場管理者",
  "dispatch-managers": "派遣会社担当",
};

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateTime(value?: string) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDateTimeShort(value?: string) {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function combineDateTime(dateValue: string, timeValue: string) {
  return new Date(`${dateValue}T${timeValue || "09:00"}:00`).toISOString();
}

function calcReadRate(seed: string, type: NotificationType) {
  const base = type === "alert" ? 92 : type === "safety" ? 88 : type === "move" ? 81 : 75;
  const extra = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 11;
  return Math.min(99, base + extra);
}

function readStorage<T>(key: string, fallback: T) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readUserCandidates() {
  return readStorage<UserCandidate[]>(USER_STORAGE_KEY, []).filter((user) => user.id && user.name);
}

function createSeedNotifications(nowIso: string): NotificationRecord[] {
  return [
    { id: "N001", title: "B棟への移動指示", message: "B棟の人員不足のため、検品完了後にB棟へ移動してください。", type: "move", status: "sent", targetMode: "selected-workers", targetSiteId: "", targetUserIds: [], targetLabel: "田中太郎、佐藤花子 他3名", createdAt: nowIso, sentAt: nowIso, readRate: 80, source: "system" },
    { id: "N002", title: "安全注意: 3番フォークリフト点検中", message: "A棟3番レーンのフォークリフトが定期点検中です。迂回路を使用してください。", type: "safety", status: "sent", targetMode: "site-workers", targetSiteId: "", targetUserIds: [], targetLabel: "A棟全作業員", createdAt: nowIso, sentAt: new Date(new Date(nowIso).getTime() - 1000 * 60 * 42).toISOString(), readRate: 95, source: "system" },
    { id: "N003", title: "明日の出勤時間変更", message: "大口出荷対応のため、明日の出勤時間は 05:30 開始です。", type: "announce", status: "scheduled", targetMode: "site-workers", targetSiteId: "", targetUserIds: [], targetLabel: "全作業員", createdAt: nowIso, scheduledAt: new Date(new Date(nowIso).getTime() + 1000 * 60 * 60 * 2).toISOString(), source: "manual" },
    { id: "N004", title: "緊急: B棟進捗遅延", message: "B棟の進捗が計画比30%遅延。応援要員を追加配置してください。", type: "alert", status: "sent", targetMode: "site-managers", targetSiteId: "", targetUserIds: [], targetLabel: "現場管理者", createdAt: nowIso, sentAt: new Date(new Date(nowIso).getTime() - 1000 * 60 * 15).toISOString(), readRate: 100, source: "system" },
  ];
}

function readNotificationRecords() {
  const stored = readStorage<NotificationRecord[]>(NOTIFICATION_STORAGE_KEY, []);
  if (stored.length > 0) {
    return stored.slice().sort((left, right) => new Date(right.sentAt ?? right.scheduledAt ?? right.createdAt).getTime() - new Date(left.sentAt ?? left.scheduledAt ?? left.createdAt).getTime());
  }
  const seeded = createSeedNotifications(new Date().toISOString());
  writeStorage(NOTIFICATION_STORAGE_KEY, seeded);
  return seeded;
}

function resolveTargetLabel(record: NotificationRecord, usersById: Map<string, UserCandidate>, siteName: string) {
  if (record.targetMode === "selected-workers") {
    const names = record.targetUserIds.map((id) => usersById.get(id)?.name).filter(Boolean) as string[];
    if (names.length === 0) return record.targetLabel || "個別作業員";
    return names.length > 3 ? `${names.slice(0, 3).join("、")} 他${names.length - 3}名` : names.join("、");
  }
  if (record.targetMode === "site-workers" && siteName) return `${siteName} の全作業員`;
  if (record.targetMode === "site-managers" && siteName) return `${siteName} の現場管理者`;
  if (record.targetMode === "dispatch-managers" && siteName) return `${siteName} の派遣会社担当`;
  return record.targetLabel || targetModeLabels[record.targetMode];
}

function buildEmptyForm(defaultSiteId: string): FormState {
  const now = new Date();
  return {
    type: "announce",
    title: "",
    message: "",
    targetMode: "site-workers",
    targetSiteId: defaultSiteId,
    targetUserIds: [],
    deliveryMode: "now",
    scheduledDate: toDateInput(now),
    scheduledTime: toTimeInput(new Date(now.getTime() + 1000 * 60 * 30)),
  };
}

export function NotificationManagement() {
  const c = useThemeColors();
  const { sites, selectedSiteId } = useMasterData();
  const [records, setRecords] = useState<NotificationRecord[]>(() => readNotificationRecords());
  const [selectedType, setSelectedType] = useState<NotificationType | "all">("all");
  const [selectedStatus, setSelectedStatus] = useState<NotificationStatus | "all">("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<FormState>(() => buildEmptyForm(selectedSiteId));

  const users = useMemo(() => readUserCandidates(), []);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const sitesById = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const defaultSiteId = selectedSiteId || sites[0]?.id || "";

  useEffect(() => {
    if (!selectedNotificationId && records[0]?.id) setSelectedNotificationId(records[0].id);
  }, [records, selectedNotificationId]);

  useEffect(() => {
    if (!createOpen) {
      setForm(buildEmptyForm(defaultSiteId));
      setFormError("");
    }
  }, [createOpen, defaultSiteId]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    if (selectedType !== "all" && record.type !== selectedType) return false;
    if (selectedStatus !== "all" && record.status !== selectedStatus) return false;
    if (!searchKeyword.trim()) return true;
    const keyword = searchKeyword.trim().toLowerCase();
    return [record.title, record.message, record.targetLabel, targetModeLabels[record.targetMode], sitesById.get(record.targetSiteId)?.name ?? ""].some((value) => value.toLowerCase().includes(keyword));
  }), [records, searchKeyword, selectedStatus, selectedType, sitesById]);

  const selected = useMemo(
    () => records.find((record) => record.id === selectedNotificationId) ?? filteredRecords[0] ?? null,
    [filteredRecords, records, selectedNotificationId],
  );

  const sentCount = records.filter((record) => record.status === "sent").length;
  const scheduledCount = records.filter((record) => record.status === "scheduled").length;
  const draftCount = records.filter((record) => record.status === "draft").length;
  const averageReadRate = records.filter((record) => record.readRate !== undefined).length > 0
    ? Math.round(records.filter((record) => record.readRate !== undefined).reduce((sum, record) => sum + (record.readRate ?? 0), 0) / records.filter((record) => record.readRate !== undefined).length)
    : 0;
  const selectedUsers = form.targetUserIds.map((userId) => usersById.get(userId)).filter(Boolean) as UserCandidate[];

  const persistRecords = (nextRecords: NotificationRecord[]) => {
    const sorted = nextRecords.slice().sort((left, right) => new Date(right.sentAt ?? right.scheduledAt ?? right.createdAt).getTime() - new Date(left.sentAt ?? left.scheduledAt ?? left.createdAt).getTime());
    setRecords(sorted);
    writeStorage(NOTIFICATION_STORAGE_KEY, sorted);
  };

  const openCreate = (prefill?: Partial<FormState>) => {
    setCreateOpen(true);
    setForm({ ...buildEmptyForm(defaultSiteId), ...prefill, targetSiteId: prefill?.targetSiteId ?? defaultSiteId, targetUserIds: prefill?.targetUserIds ?? [] });
    setFormError("");
  };

  const dispatchToWorkerStore = (record: NotificationRecord) => {
    if (record.targetMode !== "site-workers" && record.targetMode !== "selected-workers") return;
    const deliverAt = record.status === "scheduled" ? record.scheduledAt ?? record.createdAt : record.sentAt ?? record.createdAt;
    const workerRecords = readWorkerNotifications();
    const next = workerRecords.filter((workerRecord) => !workerRecord.id.startsWith(`manual:${record.id}:`));
    const targetWorkerIds = record.targetMode === "selected-workers" ? record.targetUserIds.map((userId) => resolveDemoWorkerId(userId)) : [null];

    targetWorkerIds.forEach((workerId, index) => {
      next.push({
        id: `manual:${record.id}:${workerId ?? "all"}:${index}`,
        siteId: record.targetSiteId,
        workerId,
        type: "announce",
        title: record.type === "alert" ? `【緊急】${record.title}` : record.title,
        message: record.message,
        createdAt: record.createdAt,
        deliverAt,
      } satisfies WorkerNotificationRecord);
    });

    saveWorkerNotifications(next);
  };

  const createNotification = (status: NotificationStatus) => {
    const title = form.title.trim();
    const message = form.message.trim();
    if (!title) return setFormError("タイトルを入力してください。");
    if (!message) return setFormError("メッセージを入力してください。");
    if (!form.targetSiteId) return setFormError("対象拠点を選択してください。");
    if (form.targetMode === "selected-workers" && form.targetUserIds.length === 0) return setFormError("個別作業員を1名以上選択してください。");
    if (status === "scheduled" && (!form.scheduledDate || !form.scheduledTime)) return setFormError("予約送信の日時を入力してください。");

    const nowIso = new Date().toISOString();
    const targetSiteName = sitesById.get(form.targetSiteId)?.name ?? "未設定拠点";
    const targetLabel = form.targetMode === "selected-workers"
      ? (selectedUsers.length > 3 ? `${selectedUsers.slice(0, 3).map((user) => user.name).join("、")} 他${selectedUsers.length - 3}名` : selectedUsers.map((user) => user.name).join("、"))
      : `${targetSiteName} / ${targetModeLabels[form.targetMode]}`;
    const nextRecord: NotificationRecord = {
      id: `manual-${Date.now()}`,
      title,
      message,
      type: form.type,
      status,
      targetMode: form.targetMode,
      targetSiteId: form.targetSiteId,
      targetUserIds: form.targetUserIds,
      targetLabel,
      createdAt: nowIso,
      sentAt: status === "sent" ? nowIso : undefined,
      scheduledAt: status === "scheduled" ? combineDateTime(form.scheduledDate, form.scheduledTime) : undefined,
      readRate: status === "sent" ? calcReadRate(title + message, form.type) : undefined,
      source: "manual",
    };

    persistRecords([nextRecord, ...records]);
    setSelectedNotificationId(nextRecord.id);
    setCreateOpen(false);
    if (status !== "draft") dispatchToWorkerStore(nextRecord);
  };

  const resendSelected = () => {
    if (!selected) return;
    const nowIso = new Date().toISOString();
    const resent: NotificationRecord = { ...selected, id: `resent-${Date.now()}`, createdAt: nowIso, sentAt: nowIso, scheduledAt: undefined, status: "sent", readRate: calcReadRate(selected.title + nowIso, selected.type), source: "manual" };
    persistRecords([resent, ...records]);
    setSelectedNotificationId(resent.id);
    dispatchToWorkerStore(resent);
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "送信済み", value: sentCount, tone: "text-emerald-400" },
            { label: "予約送信", value: scheduledCount, tone: "text-blue-400" },
            { label: "下書き", value: draftCount, tone: c.textSecondary },
            { label: "平均既読率", value: `${averageReadRate}%`, tone: "text-cyan-400" },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl border px-4 py-3 ${c.bgCard} ${c.border}`}>
              <div className={`text-[11px] ${c.textMuted}`}>{item.label}</div>
              <div className={`mt-2 text-[22px] font-semibold tabular-nums ${item.tone}`}>{item.value}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => openCreate()} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-cyan-500">
          <Plus className="h-4 w-4" />新規通知作成
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className={`flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border px-3 py-2 ${c.bgCard} ${c.border}`}>
          <Search className={`h-4 w-4 ${c.textMuted}`} />
          <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} placeholder="タイトル、本文、対象で検索" className={`w-full bg-transparent text-[13px] ${c.textPrimary} outline-none placeholder:text-slate-400`} />
        </div>
        {([{"key":"all","label":"すべて"},{"key":"move","label":"移動指示"},{"key":"announce","label":"全体連絡"},{"key":"safety","label":"安全注意"},{"key":"alert","label":"緊急"}] as const).map((filter) => (
          <button key={filter.key} type="button" onClick={() => setSelectedType(filter.key)} className={`rounded-xl border px-3 py-2 text-[12px] transition ${selectedType === filter.key ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" : `${c.bgCard} ${c.border} ${c.textSecondary}`}`}>
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([{"key":"all","label":"全ステータス"},{"key":"sent","label":"送信済み"},{"key":"scheduled","label":"予約送信"},{"key":"draft","label":"下書き"}] as const).map((filter) => (
          <button key={filter.key} type="button" onClick={() => setSelectedStatus(filter.key)} className={`rounded-xl border px-3 py-2 text-[12px] transition ${selectedStatus === filter.key ? "border-violet-500/30 bg-violet-500/10 text-violet-400" : `${c.bgCard} ${c.border} ${c.textSecondary}`}`}>
            {filter.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {filteredRecords.length === 0 ? (
            <div className={`rounded-2xl border border-dashed px-6 py-12 text-center ${c.bgCard} ${c.border}`}>
              <div className={`text-[15px] font-semibold ${c.textPrimary}`}>通知はありません</div>
              <div className={`mt-2 text-[13px] ${c.textSecondary}`}>条件に一致する通知が無いか、まだ通知が作成されていません。</div>
            </div>
          ) : filteredRecords.map((record) => {
            const config = typeConfig[record.type];
            const siteName = sitesById.get(record.targetSiteId)?.name ?? "全拠点";
            const statusLabel = record.status === "sent" ? "送信済み" : record.status === "scheduled" ? "予約送信" : "下書き";
            return (
              <button key={record.id} type="button" onClick={() => setSelectedNotificationId(record.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.id === record.id ? `${config.border} ${config.bg}` : `${c.border} ${c.bgCard} ${c.bgCardHover}`}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.bg}`}>
                    <config.icon className={`h-4 w-4 ${config.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className={`truncate text-[14px] font-semibold ${c.textPrimary}`}>{record.title}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${record.status === "sent" ? "bg-emerald-500/15 text-emerald-400" : record.status === "scheduled" ? "bg-blue-500/15 text-blue-400" : "bg-slate-500/15 text-slate-400"}`}>{statusLabel}</span>
                    </div>
                    <div className={`mt-1 line-clamp-2 text-[13px] ${c.textSecondary}`}>{record.message}</div>
                    <div className={`mt-3 flex flex-wrap items-center gap-3 text-[11px] ${c.textMuted}`}>
                      <span className={config.text}>{config.label}</span>
                      <span>{resolveTargetLabel(record, usersById, siteName)}</span>
                      <span>{siteName}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{record.status === "scheduled" ? formatDateTimeShort(record.scheduledAt) : formatDateTimeShort(record.sentAt ?? record.createdAt)}</span>
                      {record.readRate !== undefined && <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" />既読 {record.readRate}%</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className={`hidden w-[360px] min-w-0 shrink-0 rounded-2xl border p-5 lg:flex lg:flex-col ${c.bgCard} ${c.border}`}>
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-[18px] font-semibold ${c.textPrimary}`}>通知詳細</div>
                  <div className={`mt-1 text-[12px] ${c.textMuted}`}>作成内容、対象、送信状態を確認できます。</div>
                </div>
                <button type="button" onClick={() => setSelectedNotificationId(null)} className={`text-[18px] ${c.textMuted}`}>×</button>
              </div>

              <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 ${typeConfig[selected.type].bg}`}>
                  {(() => { const Icon = typeConfig[selected.type].icon; return <Icon className={`h-4 w-4 ${typeConfig[selected.type].text}`} />; })()}
                  <span className={`text-[13px] font-medium ${typeConfig[selected.type].text}`}>{typeConfig[selected.type].label}</span>
                </div>
                <div className="min-w-0">
                  <div className={`text-[12px] ${c.textMuted}`}>タイトル</div>
                  <div className={`mt-1 break-words text-[15px] font-semibold ${c.textPrimary}`}>{selected.title}</div>
                </div>
                <div className="min-w-0">
                  <div className={`text-[12px] ${c.textMuted}`}>本文</div>
                  <div className={`mt-1 rounded-xl p-3 text-[13px] leading-6 break-words whitespace-pre-wrap ${c.bgSurface} ${c.textSecondary}`}>{selected.message}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`min-w-0 rounded-xl border px-3 py-3 ${c.bgSurface} ${c.borderCard}`}><div className={`text-[11px] ${c.textMuted}`}>対象拠点</div><div className={`mt-1 break-words text-[13px] ${c.textPrimary}`}>{sitesById.get(selected.targetSiteId)?.name ?? "全拠点"}</div></div>
                  <div className={`min-w-0 rounded-xl border px-3 py-3 ${c.bgSurface} ${c.borderCard}`}><div className={`text-[11px] ${c.textMuted}`}>配信対象</div><div className={`mt-1 break-words text-[13px] ${c.textPrimary}`}>{resolveTargetLabel(selected, usersById, sitesById.get(selected.targetSiteId)?.name ?? "")}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`min-w-0 rounded-xl border px-3 py-3 ${c.bgSurface} ${c.borderCard}`}><div className={`text-[11px] ${c.textMuted}`}>作成日時</div><div className={`mt-1 break-words text-[13px] ${c.textPrimary}`}>{formatDateTime(selected.createdAt)}</div></div>
                  <div className={`min-w-0 rounded-xl border px-3 py-3 ${c.bgSurface} ${c.borderCard}`}><div className={`text-[11px] ${c.textMuted}`}>{selected.status === "scheduled" ? "送信予定" : "送信日時"}</div><div className={`mt-1 break-words text-[13px] ${c.textPrimary}`}>{formatDateTime(selected.status === "scheduled" ? selected.scheduledAt : selected.sentAt ?? selected.createdAt)}</div></div>
                </div>
                {selected.readRate !== undefined && (
                  <div>
                    <div className={`text-[12px] ${c.textMuted}`}>既読率</div>
                    <div className="mt-2 flex items-center gap-3"><div className={`h-2 flex-1 overflow-hidden rounded-full ${c.bgSurface}`}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${selected.readRate}%` }} /></div><span className="text-[13px] font-medium text-emerald-400">{selected.readRate}%</span></div>
                  </div>
                )}
                <div className="min-w-0">
                  <div className={`text-[12px] ${c.textMuted}`}>作業員端末プレビュー</div>
                  <div className="mt-2 min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2">{(() => { const Icon = typeConfig[selected.type].icon; return <Icon className="h-5 w-5 text-slate-700" />; })()}<span className="text-[13px] font-medium text-slate-700">{typeConfig[selected.type].label}</span></div>
                    <div className="mt-2 break-words text-[16px] font-semibold text-slate-900">{selected.title}</div>
                    <div className="mt-1 break-words whitespace-pre-wrap text-[14px] leading-6 text-slate-600">{selected.message}</div>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex gap-2 pt-5">
                <button type="button" onClick={() => openCreate({ type: selected.type, title: selected.title, message: selected.message, targetMode: selected.targetMode, targetSiteId: selected.targetSiteId || defaultSiteId, targetUserIds: selected.targetUserIds, deliveryMode: selected.status === "scheduled" ? "scheduled" : "now", scheduledDate: selected.scheduledAt ? toDateInput(new Date(selected.scheduledAt)) : toDateInput(new Date()), scheduledTime: selected.scheduledAt ? toTimeInput(new Date(selected.scheduledAt)) : "09:00" })} className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-medium ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>
                  <span className="inline-flex items-center gap-2"><Copy className="h-3.5 w-3.5" />複製</span>
                </button>
                <button type="button" onClick={resendSelected} className="flex-1 rounded-xl bg-cyan-600 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-cyan-500">
                  <span className="inline-flex items-center gap-2"><Send className="h-3.5 w-3.5" />再送信</span>
                </button>
              </div>
            </>
          ) : <div className={`flex h-full items-center justify-center text-[13px] ${c.textSecondary}`}>通知を選択すると詳細を表示します。</div>}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className={`flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border ${c.bgCard} ${c.border}`}>
            <div className={`flex items-start justify-between border-b px-6 py-5 ${c.border}`}>
              <div><div className={`text-[20px] font-semibold ${c.textPrimary}`}>新規通知作成</div><div className={`mt-1 text-[13px] ${c.textSecondary}`}>即時送信、予約送信、下書き保存をこの画面でまとめて行います。</div></div>
              <button type="button" onClick={() => setCreateOpen(false)} className={`rounded-full p-2 ${c.textMuted} ${c.bgSurface}`}><X className="h-4 w-4" /></button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                  <div>
                    <div className={`mb-2 text-[12px] font-medium ${c.textMuted}`}>通知種別</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(Object.entries(typeConfig) as Array<[NotificationType, typeof typeConfig[NotificationType]]>).map(([type, config]) => (
                        <button key={type} type="button" onClick={() => setForm((prev) => ({ ...prev, type }))} className={`flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${form.type === type ? `${config.border} ${config.bg}` : `${c.border} ${c.bgSurface}`}`}>
                          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${config.bg}`}><config.icon className={`h-4 w-4 ${config.text}`} /></div>
                          <div><div className={`text-[13px] font-semibold ${c.textPrimary}`}>{config.label}</div><div className={`text-[11px] ${c.textMuted}`}>{type === "move" ? "工程移動や応援指示" : type === "announce" ? "全体向けの案内" : type === "safety" ? "安全確認や注意喚起" : "至急対応が必要な通知"}</div></div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={`mb-2 block text-[12px] font-medium ${c.textMuted}`}>対象拠点</label>
                      <select value={form.targetSiteId} onChange={(event) => setForm((prev) => ({ ...prev, targetSiteId: event.target.value }))} className={`min-h-[44px] w-full rounded-xl border px-3 py-2 text-[13px] outline-none ${c.bgSurface} ${c.borderCard} ${c.textPrimary}`}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>
                    </div>
                    <div>
                      <label className={`mb-2 block text-[12px] font-medium ${c.textMuted}`}>配信方法</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setForm((prev) => ({ ...prev, deliveryMode: "now" }))} className={`min-h-[44px] rounded-xl border px-3 py-2 text-[13px] transition ${form.deliveryMode === "now" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" : `${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}`}>今すぐ送信</button>
                        <button type="button" onClick={() => setForm((prev) => ({ ...prev, deliveryMode: "scheduled" }))} className={`min-h-[44px] rounded-xl border px-3 py-2 text-[13px] transition ${form.deliveryMode === "scheduled" ? "border-violet-500/30 bg-violet-500/10 text-violet-400" : `${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}`}>日時指定</button>
                      </div>
                    </div>
                  </div>
                  {form.deliveryMode === "scheduled" && <div className="grid gap-4 md:grid-cols-2"><div><label className={`mb-2 block text-[12px] font-medium ${c.textMuted}`}>送信日</label><input type="date" value={form.scheduledDate} onChange={(event) => setForm((prev) => ({ ...prev, scheduledDate: event.target.value }))} className={`min-h-[44px] w-full rounded-xl border px-3 py-2 text-[13px] outline-none ${c.bgSurface} ${c.borderCard} ${c.textPrimary}`} /></div><div><label className={`mb-2 block text-[12px] font-medium ${c.textMuted}`}>送信時刻</label><input type="time" value={form.scheduledTime} onChange={(event) => setForm((prev) => ({ ...prev, scheduledTime: event.target.value }))} className={`min-h-[44px] w-full rounded-xl border px-3 py-2 text-[13px] outline-none ${c.bgSurface} ${c.borderCard} ${c.textPrimary}`} /></div></div>}
                  <div>
                    <div className={`mb-2 text-[12px] font-medium ${c.textMuted}`}>配信対象</div>
                    <div className="grid gap-2 sm:grid-cols-2">{([{"key":"site-workers","label":"拠点の全作業員"},{"key":"selected-workers","label":"個別作業員"},{"key":"site-managers","label":"現場管理者"},{"key":"dispatch-managers","label":"派遣会社担当"}] as const).map((option) => <button key={option.key} type="button" onClick={() => setForm((prev) => ({ ...prev, targetMode: option.key, targetUserIds: option.key === "selected-workers" ? prev.targetUserIds : [] }))} className={`min-h-[48px] rounded-2xl border px-4 py-3 text-left text-[13px] transition ${form.targetMode === option.key ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : `${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}`}>{option.label}</button>)}</div>
                  </div>
                  {form.targetMode === "selected-workers" && <div><div className={`mb-2 text-[12px] font-medium ${c.textMuted}`}>対象作業員</div><div className={`rounded-2xl border p-3 ${c.bgSurface} ${c.borderCard}`}><div className="mb-3 flex flex-wrap gap-2">{selectedUsers.length === 0 ? <span className={`text-[12px] ${c.textMuted}`}>まだ選択されていません</span> : selectedUsers.map((user) => <span key={user.id} className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-[12px] text-cyan-400">{user.name}<button type="button" onClick={() => setForm((prev) => ({ ...prev, targetUserIds: prev.targetUserIds.filter((id) => id !== user.id) }))} aria-label={`${user.name} を除外`}><X className="h-3 w-3" /></button></span>)}</div><div className="grid max-h-[220px] gap-2 overflow-y-auto pr-1">{users.filter((user) => user.status === "active").map((user) => { const selectedUser = form.targetUserIds.includes(user.id); return <button key={user.id} type="button" onClick={() => setForm((prev) => ({ ...prev, targetUserIds: selectedUser ? prev.targetUserIds.filter((id) => id !== user.id) : [...prev.targetUserIds, user.id] }))} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-[13px] transition ${selectedUser ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : `${c.borderCard} ${c.bgCard}`}`}><div><div className={`${c.textPrimary}`}>{user.name}</div><div className={`text-[11px] ${c.textMuted}`}>{user.email}</div></div><span className={`text-[11px] ${c.textMuted}`}>{user.employmentType ?? "未設定"}</span></button>; })}</div></div></div>}
                  <div><label className={`mb-2 block text-[12px] font-medium ${c.textMuted}`}>タイトル</label><input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="例: 午後便対応のため出荷レーンへ応援をお願いします" className={`min-h-[44px] w-full rounded-xl border px-3 py-2 text-[13px] outline-none ${c.bgSurface} ${c.borderCard} ${c.textPrimary}`} /></div>
                  <div><label className={`mb-2 block text-[12px] font-medium ${c.textMuted}`}>メッセージ</label><textarea value={form.message} onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))} rows={6} placeholder="作業員端末に表示する本文を入力します。" className={`w-full rounded-2xl border px-3 py-3 text-[13px] leading-6 outline-none ${c.bgSurface} ${c.borderCard} ${c.textPrimary}`} /><div className={`mt-2 text-right text-[11px] ${c.textMuted}`}>{form.message.length} 文字</div></div>
                </div>
              </div>
              <div className={`border-l px-6 py-5 ${c.border}`}>
                <div className={`text-[12px] font-medium ${c.textMuted}`}>送信プレビュー</div>
                <div className="mt-3 rounded-3xl border-2 border-slate-200 bg-white p-5"><div className="flex items-center gap-2">{(() => { const Icon = typeConfig[form.type].icon; return <Icon className={`h-5 w-5 ${typeConfig[form.type].text}`} />; })()}<div><div className="text-[13px] font-medium text-slate-700">{typeConfig[form.type].label}</div><div className="text-[11px] text-slate-500">{form.deliveryMode === "scheduled" ? `${form.scheduledDate} ${form.scheduledTime} に送信` : "作成後すぐに送信"}</div></div></div><div className="mt-4 text-[18px] font-semibold text-slate-900">{form.title || "タイトル未入力"}</div><div className="mt-2 whitespace-pre-wrap text-[14px] leading-7 text-slate-600">{form.message || "ここに本文が表示されます。"}</div></div>
                <div className={`mt-5 rounded-2xl border p-4 ${c.bgSurface} ${c.borderCard}`}><div className={`text-[12px] font-medium ${c.textMuted}`}>作成内容の要約</div><div className={`mt-3 space-y-3 text-[13px] ${c.textSecondary}`}><div className="flex items-center gap-2"><FileText className="h-4 w-4" /><span>{typeConfig[form.type].label}</span></div><div className="flex items-center gap-2"><Users className="h-4 w-4" /><span>{form.targetMode === "selected-workers" ? (selectedUsers.length > 0 ? `${selectedUsers.length}名を選択中` : "個別作業員を選択してください") : targetModeLabels[form.targetMode]}</span></div><div className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /><span>{sitesById.get(form.targetSiteId)?.name ?? "未選択拠点"}</span></div><div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /><span>{form.deliveryMode === "scheduled" ? `${form.scheduledDate} ${form.scheduledTime}` : "即時送信"}</span></div></div></div>
                {formError && <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">{formError}</div>}
              </div>
            </div>
            <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 ${c.border}`}>
              <div className={`text-[12px] ${c.textMuted}`}>下書き保存なら作業員端末へは配信されません。</div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => setCreateOpen(false)} className={`min-h-[40px] rounded-xl border px-4 py-2 text-[13px] ${c.bgSurface} ${c.borderCard} ${c.textSecondary}`}>キャンセル</button><button type="button" onClick={() => createNotification("draft")} className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-medium ${c.bgSurface} ${c.borderCard} ${c.textPrimary}`}><Save className="h-3.5 w-3.5" />下書き保存</button><button type="button" onClick={() => createNotification(form.deliveryMode === "scheduled" ? "scheduled" : "sent")} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-cyan-500">{form.deliveryMode === "scheduled" ? <CalendarClock className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}{form.deliveryMode === "scheduled" ? "予約作成" : "送信"}</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
