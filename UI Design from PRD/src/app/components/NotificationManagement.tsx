import { useState } from "react";
import {
  Send,
  Plus,
  Users,
  AlertTriangle,
  Megaphone,
  Shield,
  Clock,
  CheckCircle2,
  Edit,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "move" | "announce" | "safety" | "alert";
  target: string;
  status: "sent" | "draft" | "scheduled";
  sentAt?: string;
  scheduledAt?: string;
  readRate?: number;
}

const notifications: Notification[] = [
  { id: "N001", title: "B棟からE棟への移動指示", message: "梱包ラインの人員不足のため、検品完了後にE棟へ移動してください。", type: "move", target: "田中太郎、佐藤花子 他3名", status: "sent", sentAt: "14:32", readRate: 80 },
  { id: "N002", title: "安全注意: 3番フォークリフト点検中", message: "A棟3番レーンのフォークリフトが定期点検中です。迂回路を使用してください。", type: "safety", target: "A棟全作業員", status: "sent", sentAt: "13:15", readRate: 95 },
  { id: "N003", title: "【全体連絡】明日の出勤時間変更", message: "3月5日は大口出荷対応のため、出勤時間が5:30に変更となります。", type: "announce", target: "全作業員", status: "scheduled", scheduledAt: "17:00" },
  { id: "N004", title: "緊急: C棟仕分けエリア進捗遅延", message: "仕分けエリアの進捗が計画比30%遅延。追加人員の配置が必要です。", type: "alert", target: "現場管理者", status: "sent", sentAt: "14:05", readRate: 100 },
  { id: "N005", title: "休憩時間のお知らせ", message: "15:00-15:15の休憩時間になります。作業を一時中断してください。", type: "announce", target: "全作業員", status: "draft" },
];

const typeConfig = {
  move: { icon: Users, label: "移動指示", bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/30" },
  announce: { icon: Megaphone, label: "全体連絡", bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/30" },
  safety: { icon: Shield, label: "安全注意", bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  alert: { icon: AlertTriangle, label: "緊急アラート", bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
};

export function NotificationManagement() {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedNotification, setSelectedNotification] = useState<string | null>(null);
  const c = useThemeColors();

  const filtered = selectedType === "all" ? notifications : notifications.filter((n) => n.type === selectedType);
  const selected = notifications.find((n) => n.id === selectedNotification);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={c.textPrimary}>通知・配信管理</h1>
          <p className={`${c.textSecondary} text-[14px] mt-1`}>移動指示、お知らせ、安全注意事項の一括配信</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500 transition-all">
          <Plus className="w-4 h-4" />新規通知作成
        </button>
      </div>

      {/* Type Filter */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: "all", label: "すべて" },
          { key: "move", label: "移動指示" },
          { key: "announce", label: "全体連絡" },
          { key: "safety", label: "安全注意" },
          { key: "alert", label: "緊急" },
        ].map((filter) => (
          <button key={filter.key} onClick={() => setSelectedType(filter.key)}
            className={`px-4 py-2 rounded-lg text-[13px] transition-all ${
              selectedType === filter.key
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                : `${c.bgCard} ${c.textSecondary} border ${c.border} ${c.bgCardHover}`
            }`}>
            {filter.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {filtered.map((notif) => {
            const config = typeConfig[notif.type];
            return (
              <div key={notif.id} onClick={() => setSelectedNotification(notif.id)}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${
                  selectedNotification === notif.id ? `${config.border} ${config.bg}` : `${c.border} ${c.bgCard} ${c.bgCardHover}`
                }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <config.icon className={`w-4 h-4 ${config.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`${c.textPrimary} text-[14px] truncate`}>{notif.title}</h4>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                        notif.status === "sent" ? "bg-emerald-500/15 text-emerald-400"
                          : notif.status === "scheduled" ? "bg-blue-500/15 text-blue-400"
                          : "bg-gray-500/15 text-gray-400"
                      }`}>
                        {notif.status === "sent" ? "送信済" : notif.status === "scheduled" ? "予約済" : "下書き"}
                      </span>
                    </div>
                    <p className={`text-[13px] ${c.textMuted} mt-1 truncate`}>{notif.message}</p>
                    <div className={`flex items-center gap-4 mt-2 text-[11px] ${c.textDimmed}`}>
                      <span className={config.text}>{config.label}</span>
                      <span>対象: {notif.target}</span>
                      {notif.sentAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{notif.sentAt}</span>}
                      {notif.readRate !== undefined && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />既読 {notif.readRate}%</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className={`w-[320px] ${c.bgCard} rounded-xl border ${c.border} p-5 shrink-0 flex flex-col`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={c.textPrimary}>通知詳細</h3>
              <button onClick={() => setSelectedNotification(null)} className={c.textMuted}>×</button>
            </div>
            <div className="space-y-4 flex-1">
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>種別</label>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${typeConfig[selected.type].bg}`}>
                  {(() => { const Icon = typeConfig[selected.type].icon; return <Icon className={`w-3.5 h-3.5 ${typeConfig[selected.type].text}`} />; })()}
                  <span className={`text-[13px] ${typeConfig[selected.type].text}`}>{typeConfig[selected.type].label}</span>
                </div>
              </div>
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>タイトル</label>
                <p className={`text-[14px] ${c.textPrimary}`}>{selected.title}</p>
              </div>
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>メッセージ</label>
                <p className={`text-[13px] ${c.textSecondary} ${c.bgSurface} rounded-lg p-3`}>{selected.message}</p>
              </div>
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>配信対象</label>
                <p className={`text-[13px] ${c.textSecondary}`}>{selected.target}</p>
              </div>
              {selected.readRate !== undefined && (
                <div>
                  <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>既読率</label>
                  <div className="flex items-center gap-3">
                    <div className={`flex-1 h-2 rounded-full ${c.bgSurface} overflow-hidden`}>
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${selected.readRate}%` }} />
                    </div>
                    <span className="text-[13px] text-emerald-400">{selected.readRate}%</span>
                  </div>
                </div>
              )}
              {/* Worker View Preview */}
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>作業員表示プレビュー</label>
                <div className="bg-white rounded-xl p-4 border-2 border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    {(() => { const Icon = typeConfig[selected.type].icon; return <Icon className="w-5 h-5 text-gray-800" />; })()}
                    <span className="text-gray-800 text-[14px]">{typeConfig[selected.type].label}</span>
                  </div>
                  <p className="text-gray-900 text-[16px]">{selected.title}</p>
                  <p className="text-gray-600 text-[14px] mt-1">{selected.message}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[13px] hover:opacity-80`}>
                <Edit className="w-3.5 h-3.5" />編集
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500">
                <Send className="w-3.5 h-3.5" />再送信
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
