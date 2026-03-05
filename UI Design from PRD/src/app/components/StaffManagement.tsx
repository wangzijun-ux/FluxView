import { useState } from "react";
import {
  Search,
  Plus,
  Star,
  AlertTriangle,
  Shield,
  MoreHorizontal,
  Users,
  Award,
  UserCheck,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";

interface Worker {
  id: string;
  name: string;
  company: string;
  role: string;
  skills: { name: string; level: number }[];
  certifications: { name: string; expiry: string; status: string }[];
  status: "active" | "break" | "off";
  uph: number;
  avatar: string;
}

const workers: Worker[] = [
  { id: "W001", name: "田中 太郎", company: "正社員", role: "リーダー", skills: [{ name: "検品", level: 5 }, { name: "リフト操作", level: 4 }, { name: "危険物", level: 3 }], certifications: [{ name: "フォークリフト免許", expiry: "2027-06-15", status: "valid" }, { name: "危険物取扱者", expiry: "2026-04-01", status: "expiring" }], status: "active", uph: 168, avatar: "TT" },
  { id: "W002", name: "佐藤 花子", company: "正社員", role: "一般", skills: [{ name: "検品", level: 4 }, { name: "梱包", level: 5 }, { name: "ラベリング", level: 4 }], certifications: [{ name: "品質管理検定", expiry: "2027-12-31", status: "valid" }], status: "active", uph: 155, avatar: "SH" },
  { id: "W003", name: "鈴木 一郎", company: "派遣A社", role: "一般", skills: [{ name: "仕分け", level: 3 }, { name: "梱包", level: 3 }], certifications: [], status: "active", uph: 122, avatar: "SI" },
  { id: "W004", name: "高橋 美咲", company: "派遣B社", role: "一般", skills: [{ name: "流通加工", level: 4 }, { name: "ラベリング", level: 5 }], certifications: [], status: "break", uph: 145, avatar: "TM" },
  { id: "W005", name: "伊藤 健太", company: "正社員", role: "リーダー", skills: [{ name: "リフト操作", level: 5 }, { name: "出荷管理", level: 5 }, { name: "危険物", level: 4 }], certifications: [{ name: "フォークリフト免許", expiry: "2028-03-20", status: "valid" }, { name: "危険物取扱者", expiry: "2026-03-15", status: "expiring" }], status: "active", uph: 172, avatar: "IK" },
  { id: "W006", name: "渡辺 真由", company: "派遣A社", role: "一般", skills: [{ name: "検品", level: 2 }, { name: "梱包", level: 2 }], certifications: [], status: "off", uph: 98, avatar: "WM" },
  { id: "W007", name: "山本 健二", company: "パートナー", role: "一般", skills: [{ name: "仕分け", level: 4 }, { name: "検品", level: 3 }, { name: "梱包", level: 3 }], certifications: [], status: "active", uph: 135, avatar: "YK" },
  { id: "W008", name: "中野 由美", company: "パートナー", role: "一般", skills: [{ name: "梱包", level: 4 }, { name: "ラベリング", level: 4 }], certifications: [], status: "active", uph: 142, avatar: "NY" },
  { id: "W009", name: "松田 勝", company: "パートナー", role: "副リーダー", skills: [{ name: "リフト操作", level: 3 }, { name: "仕分け", level: 4 }], certifications: [{ name: "フォークリフト免許", expiry: "2027-09-10", status: "valid" }], status: "active", uph: 148, avatar: "MM" },
  { id: "W010", name: "加藤 雅人", company: "正社員", role: "一般", skills: [{ name: "出荷管理", level: 4 }, { name: "梱包", level: 3 }], certifications: [], status: "active", uph: 152, avatar: "KM" },
];

export function StaffManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [filterCompany, setFilterCompany] = useState("all");
  const c = useThemeColors();

  const filteredWorkers = workers.filter((w) => {
    const matchesSearch = w.name.includes(searchTerm) || w.id.includes(searchTerm);
    const matchesCompany = filterCompany === "all" || w.company === filterCompany;
    return matchesSearch && matchesCompany;
  });

  const selected = workers.find((w) => w.id === selectedWorker);

  const stats = {
    total: workers.length,
    active: workers.filter((w) => w.status === "active").length,
    expiring: workers.flatMap((w) => w.certifications.filter((cert) => cert.status === "expiring")).length,
    avgUph: Math.round(workers.reduce((acc, w) => acc + w.uph, 0) / workers.length),
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={c.textPrimary}>スタッフ・スキル管理</h1>
          <p className={`${c.textSecondary} text-[14px] mt-1`}>作業員のスキル・資格・習熟度を一元管理</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500 transition-all">
          <Plus className="w-4 h-4" />スタッフ追加
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { icon: Users, label: "登録人数", value: stats.total, iconColor: "text-cyan-400" },
          { icon: UserCheck, label: "稼働中", value: stats.active, iconColor: "text-emerald-400" },
          { icon: AlertTriangle, label: "資格期限注意", value: stats.expiring, iconColor: "text-amber-400" },
          { icon: Award, label: "平均UPH", value: stats.avgUph, iconColor: "text-violet-400" },
        ].map((stat) => (
          <div key={stat.label} className={`${c.bgCard} rounded-xl border ${c.border} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
              <span className={`text-[12px] ${c.textMuted}`}>{stat.label}</span>
            </div>
            <div className={`text-[24px] ${c.textPrimary}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className={`w-4 h-4 ${c.textMuted} absolute left-3 top-1/2 -translate-y-1/2`} />
              <input type="text" placeholder="名前・IDで検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full ${c.bgCard} border ${c.border} rounded-lg pl-10 pr-4 py-2.5 text-[13px] ${c.textPrimary} placeholder:${c.textDimmed} focus:border-cyan-500/50 outline-none`} />
            </div>
            <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}
              className={`${c.bgCard} border ${c.border} rounded-lg px-4 py-2.5 text-[13px] ${c.textSecondary} focus:border-cyan-500/50 outline-none appearance-none cursor-pointer`}>
              <option value="all">全所属</option>
              <option value="正社員">正社員</option>
              <option value="パートナー">パートナー</option>
              <option value="派遣A社">派遣A社</option>
              <option value="派遣B社">派遣B社</option>
            </select>
          </div>

          <div className={`flex-1 ${c.bgCard} rounded-xl border ${c.border} overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  {["作業員", "所属", "スキル", "UPH", "ステータス", ""].map((h) => (
                    <th key={h} className={`text-left text-[12px] ${c.textMuted} px-4 py-3`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} onClick={() => setSelectedWorker(worker.id)}
                    className={`border-b ${c.border} cursor-pointer transition-all ${selectedWorker === worker.id ? "bg-cyan-500/5" : c.bgCardHover}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 flex items-center justify-center text-[11px] text-cyan-400">{worker.avatar}</div>
                        <div>
                          <div className={`text-[13px] ${c.textPrimary}`}>{worker.name}</div>
                          <div className={`text-[11px] ${c.textMuted}`}>{worker.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-[13px] ${c.textSecondary}`}>{worker.company}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {worker.skills.slice(0, 3).map((skill) => (
                          <span key={skill.name} className={`text-[10px] px-1.5 py-0.5 rounded ${c.bgSurface} ${c.textSecondary}`}>{skill.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[13px] ${worker.uph >= 150 ? "text-cyan-400" : worker.uph >= 120 ? c.textSecondary : "text-red-400"}`}>{worker.uph}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-1 rounded-full ${worker.status === "active" ? "bg-emerald-500/15 text-emerald-400" : worker.status === "break" ? "bg-amber-500/15 text-amber-400" : "bg-gray-500/15 text-gray-400"}`}>
                        {worker.status === "active" ? "稼働中" : worker.status === "break" ? "休憩中" : "退勤"}
                      </span>
                    </td>
                    <td className="px-4 py-3"><button className={c.textDimmed}><MoreHorizontal className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className={`w-[300px] ${c.bgCard} rounded-xl border ${c.border} p-5 shrink-0 overflow-y-auto`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={c.textPrimary}>作業員詳細</h3>
              <button onClick={() => setSelectedWorker(null)} className={c.textMuted}>×</button>
            </div>
            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 flex items-center justify-center text-[18px] text-cyan-400 mx-auto mb-3">{selected.avatar}</div>
              <div className={c.textPrimary}>{selected.name}</div>
              <div className={`text-[12px] ${c.textMuted} mt-1`}>{selected.company} · {selected.role} · {selected.id}</div>
            </div>

            <div className="mb-5">
              <h4 className={`text-[12px] ${c.textMuted} mb-3 tracking-wider uppercase`}>スキル & 習熟度</h4>
              <div className="space-y-3">
                {selected.skills.map((skill) => (
                  <div key={skill.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[13px] ${c.textSecondary}`}>{skill.name}</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <Star key={level} className={`w-3 h-3 ${level <= skill.level ? "text-amber-400 fill-amber-400" : c.textDimmed}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <h4 className={`text-[12px] ${c.textMuted} mb-3 tracking-wider uppercase`}>資格・認定</h4>
              {selected.certifications.length === 0 ? (
                <p className={`text-[13px] ${c.textDimmed}`}>資格登録なし</p>
              ) : (
                <div className="space-y-2">
                  {selected.certifications.map((cert) => (
                    <div key={cert.name} className={`rounded-lg p-3 border ${cert.status === "expiring" ? "border-amber-500/30 bg-amber-500/5" : `${c.borderCard} ${c.bgSurface}`}`}>
                      <div className="flex items-center gap-2">
                        {cert.status === "expiring" ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> : <Shield className="w-3.5 h-3.5 text-emerald-400" />}
                        <span className={`text-[13px] ${c.textPrimary}`}>{cert.name}</span>
                      </div>
                      <div className={`text-[11px] ${c.textMuted} mt-1 ml-5.5`}>
                        有効期限: {cert.expiry}
                        {cert.status === "expiring" && <span className="text-amber-400 ml-2">更新間近</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className={`text-[12px] ${c.textMuted} mb-3 tracking-wider uppercase`}>パフォーマンス</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className={`${c.bgSurface} rounded-lg p-3 text-center`}>
                  <div className="text-[20px] text-cyan-400">{selected.uph}</div>
                  <div className={`text-[11px] ${c.textMuted}`}>平均UPH</div>
                </div>
                <div className={`${c.bgSurface} rounded-lg p-3 text-center`}>
                  <div className="text-[20px] text-emerald-400">96%</div>
                  <div className={`text-[11px] ${c.textMuted}`}>出勤率</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
