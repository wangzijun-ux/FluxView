import { useState } from "react";
import {
    Search,
    Plus,
    Star,
    Shield,
    Award,
    BookOpen,
    Trash2,
    Edit3,
    Check,
    X,
    Layers,
    Activity,
    Zap,
    Tag,
    ChevronRight,
    Package,
    type LucideIcon,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";

import { SkillMaster, skillMasterData } from "./processStore";

export function SkillManagement() {
    const [skills, setSkills] = useState<SkillMaster[]>(skillMasterData);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCategory, setFilterCategory] = useState("all");
    const [showAddModal, setShowAddModal] = useState(false);

    const [newSkill, setNewSkill] = useState<Partial<SkillMaster>>({
        name: "",
        category: "operation",
        description: "",
        levelMax: 5
    });

    const c = useThemeColors();

    const filteredSkills = skills.filter(s => {
        const matchesSearch = s.name.includes(searchTerm) || s.description.includes(searchTerm);
        const matchesCat = filterCategory === "all" || s.category === filterCategory;
        return matchesSearch && matchesCat;
    });

    const addSkill = () => {
        if (!newSkill.name) return;
        const skill: SkillMaster = {
            id: `${newSkill.category === 'certification' ? 'C' : 'S'}${Date.now()}`,
            name: newSkill.name,
            category: newSkill.category as any,
            description: newSkill.description || "",
            levelMax: newSkill.levelMax || 5,
        };
        setSkills([...skills, skill]);
        setNewSkill({ name: "", category: "operation", description: "", levelMax: 5 });
        setShowAddModal(false);
    };

    const deleteSkill = (id: string) => {
        setSkills(skills.filter(s => s.id !== id));
    };

    return (
        <div className="p-6 h-full flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <Award className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className={`${c.textPrimary} text-[24px] font-black tracking-tight`}>スキル管理 <span className="text-[12px] font-medium text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded ml-2 uppercase tracking-widest">Master</span></h1>
                        <p className={`${c.textSecondary} text-[14px] mt-0.5 opacity-70`}>倉庫全体で使用するスキル・資格・習熟度のマスター定義を管理します</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-violet-600 text-white text-[13px] hover:bg-violet-500 transition-all shadow-xl shadow-violet-600/20 font-black">
                    <Plus className="w-4 h-4" />新規定義を追加
                </button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-6 mb-8 shrink-0">
                <div className={`${c.bgCard} p-5 rounded-2xl border ${c.border} shadow-sm flex items-center gap-4`}>
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500"><Zap className="w-6 h-6" /></div>
                    <div>
                        <div className={`text-[11px] ${c.textMuted} font-black uppercase tracking-widest`}>作業スキル</div>
                        <div className={`text-[24px] ${c.textPrimary} font-black`}>{skills.filter(s => s.category === 'operation').length} <span className="text-[12px] font-medium text-gray-400">種類</span></div>
                    </div>
                </div>
                <div className={`${c.bgCard} p-5 rounded-2xl border ${c.border} shadow-sm flex items-center gap-4`}>
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"><Shield className="w-6 h-6" /></div>
                    <div>
                        <div className={`text-[11px] ${c.textMuted} font-black uppercase tracking-widest`}>資格・免許</div>
                        <div className={`text-[24px] ${c.textPrimary} font-black`}>{skills.filter(s => s.category === 'certification').length} <span className="text-[12px] font-medium text-gray-400">種類</span></div>
                    </div>
                </div>
                <div className={`${c.bgCard} p-5 rounded-2xl border ${c.border} shadow-sm flex items-center gap-4`}>
                    <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500"><Tag className="w-6 h-6" /></div>
                    <div>
                        <div className={`text-[11px] ${c.textMuted} font-black uppercase tracking-widest`}>統合マスター</div>
                        <div className={`text-[24px] ${c.textPrimary} font-black`}>{skills.length} <span className="text-[12px] font-medium text-gray-400">総数</span></div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
                {/* Filters */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex-1 relative">
                        <Search className={`w-5 h-5 ${c.textMuted} absolute left-4 top-1/2 -translate-y-1/2`} />
                        <input
                            type="text"
                            placeholder="スキル名や説明文で検索..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full ${c.bgCard} border ${c.border} rounded-2xl pl-12 pr-4 py-3.5 text-[14px] ${c.textPrimary} shadow-sm focus:ring-2 ring-violet-500/20 outline-none transition-all`}
                        />
                    </div>
                    <div className="flex bg-white dark:bg-gray-900 p-1 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        {["all", "operation", "certification"].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFilterCategory(cat)}
                                className={`px-6 py-2 rounded-xl text-[12px] font-black transition-all ${filterCategory === cat ? 'bg-violet-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                {cat === 'all' ? '全て' : cat === 'operation' ? '作業' : '資格'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Skill Grid */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-6">
                    <div className="grid grid-cols-2 gap-4">
                        {filteredSkills.map(skill => (
                            <div key={skill.id} className={`${c.bgCard} border ${c.border} rounded-3xl p-6 shadow-sm hover:shadow-xl hover:border-violet-500/30 transition-all group relative overflow-hidden`}>
                                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br transition-all duration-500 ${skill.category === 'certification' ? 'from-emerald-500/5 to-transparent' : 'from-blue-500/5 to-transparent'} opacity-0 group-hover:opacity-100 flex items-center justify-center`}>
                                    <Award className="w-12 h-12 opacity-10 rotate-12" />
                                </div>

                                <div className="flex items-start justify-between relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${skill.category === 'certification' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'
                                            }`}>
                                            {skill.category === 'certification' ? <Shield className="w-7 h-7" /> : <Activity className="w-7 h-7" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className={`${c.textPrimary} text-[18px] font-black`}>{skill.name}</h3>
                                                <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-widest ${skill.category === 'certification' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'
                                                    }`}>{skill.category}</span>
                                            </div>
                                            <p className={`${c.textSecondary} text-[13px] mt-1 opacity-70`}>{skill.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                        <button className="p-2 hover:bg-gray-500/10 rounded-xl text-gray-400 hover:text-violet-500 transition-all"><Edit3 className="w-5 h-5" /></button>
                                        <button onClick={() => deleteSkill(skill.id)} className="p-2 hover:bg-rose-500/10 rounded-xl text-rose-400 transition-all"><Trash2 className="w-5 h-5" /></button>
                                    </div>
                                </div>

                                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="space-y-1">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">習熟レベル</span>
                                            <div className="flex gap-1">
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                    <div key={i} className={`w-2 h-2 rounded-full ${i < skill.levelMax ? 'bg-violet-500' : 'bg-gray-200 dark:bg-gray-800'}`} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">ID</span>
                                        <span className={`text-[12px] font-mono ${c.textMuted}`}>{skill.id}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredSkills.length === 0 && (
                        <div className="h-[300px] flex flex-col items-center justify-center text-gray-400/30">
                            <BookOpen className="w-20 h-20 mb-4" />
                            <p className="text-[18px] font-black uppercase tracking-widest">SKILL NOT FOUND</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className={`w-full max-w-[480px] ${c.bgCard} rounded-[32px] border ${c.border} shadow-2xl p-8 animate-in zoom-in slide-in-from-bottom-8 duration-300`}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center"><Plus className="w-6 h-6" /></div>
                                <h2 className={`${c.textPrimary} text-[20px] font-black`}>定義を追加</h2>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-gray-500/10 rounded-xl"><X className="w-6 h-6 text-gray-400" /></button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 block">名称</label>
                                <input
                                    type="text"
                                    value={newSkill.name}
                                    onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                                    placeholder="例: フォークリフト, 検品..."
                                    className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-2xl px-5 py-4 text-[15px] outline-none focus:ring-4 ring-violet-500/10 transition-all font-bold`}
                                />
                            </div>

                            <div>
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 block">カテゴリー</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setNewSkill({ ...newSkill, category: 'operation' })}
                                        className={`px-4 py-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${newSkill.category === 'operation' ? 'border-blue-500 bg-blue-500/5 text-blue-500' : 'border-transparent bg-gray-500/5 text-gray-400'}`}
                                    >
                                        <Activity className="w-5 h-5" /><span className="text-[13px] font-black">作業スキル</span>
                                    </button>
                                    <button
                                        onClick={() => setNewSkill({ ...newSkill, category: 'certification' })}
                                        className={`px-4 py-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${newSkill.category === 'certification' ? 'border-emerald-500 bg-emerald-500/5 text-emerald-500' : 'border-transparent bg-gray-500/5 text-gray-400'}`}
                                    >
                                        <Shield className="w-5 h-5" /><span className="text-[13px] font-black">公的資格</span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 block">説明</label>
                                <textarea
                                    value={newSkill.description}
                                    onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
                                    placeholder="スキルの具体的な内容や基準..."
                                    className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-2xl px-5 py-4 text-[14px] outline-none h-32 resize-none focus:ring-4 ring-violet-500/10 transition-all`}
                                />
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button onClick={() => setShowAddModal(false)} className="flex-1 py-4 text-[14px] font-black text-gray-400 hover:text-gray-600 transition-all">キャンセル</button>
                                <button onClick={addSkill} className="flex-[2] py-4 bg-violet-600 text-white rounded-2xl text-[14px] font-black shadow-xl shadow-violet-600/30 hover:bg-violet-500 transition-all">定義を保存</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
