import { useState } from "react";
import {
  Nfc,
  Globe,
  Shield,
  Server,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";

interface SettingSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  items: SettingItem[];
}

interface SettingItem {
  label: string;
  description: string;
  type: "toggle" | "select" | "status";
  value?: boolean;
  options?: string[];
  status?: "connected" | "disconnected" | "warning";
}

const settingSections: SettingSection[] = [
  {
    id: "nfc", title: "NFC & デバイス管理", description: "NFCタグとデバイスの統合設定", icon: Nfc,
    items: [
      { label: "NFCログイン", description: "タッチによる即時ログインを有効化", type: "toggle", value: true },
      { label: "バッジ一括管理", description: "作業員バッジの一括エンコード", type: "toggle", value: true },
      { label: "オフラインモード", description: "Wi-Fi不安定時のローカル保持", type: "toggle", value: true },
    ],
  },
  {
    id: "integration", title: "外部システム連携", description: "WMS/TMS/勤怠/会計システムとの接続設定", icon: Server,
    items: [
      { label: "WMS連携", description: "出荷/入荷予定の受信", type: "status", status: "connected" },
      { label: "TMS連携", description: "完了予測時刻の送信", type: "status", status: "connected" },
      { label: "勤怠システム", description: "出退勤データの同期", type: "status", status: "connected" },
      { label: "会計システム", description: "作業員別実働コスト", type: "status", status: "warning" },
    ],
  },
  {
    id: "security", title: "セキュリティ", description: "マルチテナント・データ保護設定", icon: Shield,
    items: [
      { label: "荷主データ分離", description: "荷主ごとのデータサイロ化", type: "toggle", value: true },
      { label: "アクセスログ", description: "全操作のログ記録", type: "toggle", value: true },
      { label: "2要素認証", description: "管理者ログイン時の追加認証", type: "toggle", value: false },
    ],
  },
  {
    id: "locale", title: "多言語 & ローカライズ", description: "作業員UIの言語設定", icon: Globe,
    items: [
      { label: "デフォルト言語", description: "作業員UIの表示言語", type: "select", options: ["日本語", "English", "中文", "Tiếng Việt", "Português"] },
      { label: "タイムゾーン", description: "システムの基準時刻", type: "select", options: ["Asia/Tokyo", "UTC"] },
    ],
  },
];

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState("nfc");
  const c = useThemeColors();

  const current = settingSections.find((s) => s.id === activeSection);

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6">
        <h1 className={c.textPrimary}>設定</h1>
        <p className={`${c.textSecondary} text-[14px] mt-1`}>システム設定、デバイス管理、外部連携</p>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Settings Nav */}
        <div className="w-[240px] space-y-2 shrink-0">
          {settingSections.map((section) => (
            <button key={section.id} onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                activeSection === section.id
                  ? "bg-cyan-500/10 border border-cyan-500/30"
                  : `${c.bgCard} border ${c.border} ${c.bgCardHover}`
              }`}>
              <section.icon className={`w-5 h-5 ${activeSection === section.id ? "text-cyan-400" : c.textMuted}`} />
              <div>
                <div className={`text-[14px] ${activeSection === section.id ? c.textPrimary : c.textSecondary}`}>{section.title}</div>
                <div className={`text-[11px] ${c.textDimmed}`}>{section.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Settings Content */}
        {current && (
          <div className={`flex-1 ${c.bgCard} rounded-xl border ${c.border} p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <current.icon className="w-6 h-6 text-cyan-400" />
              <div>
                <h2 className={c.textPrimary}>{current.title}</h2>
                <p className={`text-[13px] ${c.textMuted}`}>{current.description}</p>
              </div>
            </div>

            <div className="space-y-4">
              {current.items.map((item) => (
                <div key={item.label} className={`flex items-center justify-between p-4 rounded-lg ${c.bgSurface} border ${c.borderCard}`}>
                  <div>
                    <div className={`text-[14px] ${c.textPrimary}`}>{item.label}</div>
                    <div className={`text-[12px] ${c.textMuted} mt-0.5`}>{item.description}</div>
                  </div>
                  {item.type === "toggle" && (
                    <button className="text-cyan-400">
                      {item.value ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className={`w-8 h-8 ${c.textDimmed}`} />}
                    </button>
                  )}
                  {item.type === "select" && (
                    <select className={`${c.bgCard} border ${c.borderCard} rounded-lg px-3 py-1.5 text-[13px] ${c.textSecondary} outline-none cursor-pointer`}>
                      {item.options?.map((opt) => <option key={opt}>{opt}</option>)}
                    </select>
                  )}
                  {item.type === "status" && (
                    <div className="flex items-center gap-2">
                      {item.status === "connected" ? (
                        <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-[13px] text-emerald-400">接続中</span></>
                      ) : item.status === "warning" ? (
                        <><AlertCircle className="w-4 h-4 text-amber-400" /><span className="text-[13px] text-amber-400">要確認</span></>
                      ) : (
                        <><AlertCircle className="w-4 h-4 text-red-400" /><span className="text-[13px] text-red-400">未接続</span></>
                      )}
                      <button className={`ml-2 ${c.textDimmed} hover:${c.textSecondary}`}><RefreshCw className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
