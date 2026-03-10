import { useState } from "react";
import {
  Plus,
  GripVertical,
  ArrowRight,
  Settings as SettingsIcon,
  Trash2,
  Save,
  Play,
  Copy,
  MoreVertical,
  Users,
  Gauge,
  MapPin,
  Edit3,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Layers,
  X,
  Check,
  Package,
  ArrowLeftRight,
  Activity,
  Workflow,
  ClipboardList,
  Target,
  Search,
  BookOpen,
  Zap,
  ShieldCheck
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import {
  defaultProcessSteps,
  defaultAreas,
  processColorClasses,
  getProcessStepsForArea,
  type ProcessStep,
  type Area,
} from "./processStore";

type Site = {
  id: string;
  name: string;
  areaIds: string[];
};

type Client = {
  id: string;
  name: string;
  sites: Site[];
};

const defaultClients: Client[] = [
  {
    id: "client-1",
    name: "荷主A",
    sites: [
      { id: "site-1", name: "拠点1", areaIds: ["area-1", "area-2"] },
      { id: "site-2", name: "拠点2", areaIds: ["area-3"] },
    ],
  },
];

const AREA_COLORS = ["cyan", "emerald", "violet", "amber", "blue", "rose", "orange", "pink", "teal", "indigo"];

export function BusinessManagement() {
  const [clients, setClients] = useState<Client[]>(defaultClients);
  const [areas, setAreas] = useState<Area[]>(defaultAreas);
  const [allSteps, setAllSteps] = useState<ProcessStep[]>(defaultProcessSteps);

  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || "");
  const [selectedSiteId, setSelectedSiteId] = useState<string>(clients[0]?.sites[0]?.id || "");
  const [selectedAreaId, setSelectedAreaId] = useState<string>(areas[0]?.id || "");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  const [isAddingProcessType, setIsAddingProcessType] = useState(false);
  const [newProcessName, setNewProcessName] = useState("");
  const [newProcessColor, setNewProcessColor] = useState("cyan");

  const c = useThemeColors();

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedSite = selectedClient?.sites.find((s) => s.id === selectedSiteId);
  const siteAreaIds = selectedSite?.areaIds ?? [];
  const visibleAreas = areas.filter((a) => siteAreaIds.includes(a.id));

  const selectedArea = visibleAreas.find((a) => a.id === selectedAreaId) ?? visibleAreas[0];
  const areaSteps = selectedArea ? getProcessStepsForArea(selectedArea) : [];
  const editingStep = allSteps.find((s) => s.id === editingStepId);

  const setClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((c) => c.id === clientId);
    const firstSite = client?.sites[0];
    if (firstSite) {
      setSelectedSiteId(firstSite.id);
      setSelectedAreaId(firstSite.areaIds[0] ?? "");
    }
  };

  const setSite = (siteId: string) => {
    setSelectedSiteId(siteId);
    const site = selectedClient?.sites.find((s) => s.id === siteId);
    if (site?.areaIds?.length) {
      setSelectedAreaId(site.areaIds[0]);
    }
  };

  const selectArea = (areaId: string) => {
    setSelectedAreaId(areaId);
    const site = selectedClient?.sites.find((s) => s.areaIds.includes(areaId));
    if (site) setSelectedSiteId(site.id);
  };

  // --- Actions ---

  const addArea = () => {
    const newArea: Area = {
      id: `area-${Date.now()}`,
      name: `新規エリア ${areas.length + 1}`,
      description: "エリアの説明を追加してください",
      color: AREA_COLORS[areas.length % AREA_COLORS.length],
      processStepIds: [],
    };

    setAreas((prev) => [...prev, newArea]);
    setSelectedAreaId(newArea.id);

    // 追加したエリアを現在選択中の拠点にも紐付ける
    setClients((prev) => prev.map((client) => {
      if (client.id !== selectedClientId) return client;
      return {
        ...client,
        sites: client.sites.map((site) => {
          if (site.id !== selectedSiteId) return site;
          return { ...site, areaIds: [...site.areaIds, newArea.id] };
        }),
      };
    }));
  };

  const deleteArea = (id: string) => {
    if (areas.length <= 1) return;
    const nextAreas = areas.filter(a => a.id !== id);
    setAreas(nextAreas);
    if (selectedAreaId === id) setSelectedAreaId(nextAreas[0].id);
  };

  const addStepToArea = (stepId: string) => {
    if (!selectedAreaId) return;
    setAreas(areas.map(a => {
      if (a.id === selectedAreaId) {
        if (a.processStepIds.includes(stepId)) return a;
        return { ...a, processStepIds: [...a.processStepIds, stepId] };
      }
      return a;
    }));
  };

  const removeStepFromArea = (areaId: string, stepId: string) => {
    setAreas(areas.map(a => {
      if (a.id === areaId) {
        return { ...a, processStepIds: a.processStepIds.filter(id => id !== stepId) };
      }
      return a;
    }));
    if (editingStepId === stepId) setEditingStepId(null);
  };

  const moveStepInArea = (direction: 'up' | 'down', stepId: string) => {
    if (!selectedAreaId) return;
    setAreas(prev => prev.map(a => {
      if (a.id !== selectedAreaId) return a;
      const ids = [...a.processStepIds];
      const idx = ids.indexOf(stepId);
      if (idx === -1) return a;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= ids.length) return a;
      [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
      return { ...a, processStepIds: ids };
    }));
  };

  const createNewProcessType = () => {
    if (!newProcessName.trim()) return;
    const newStep: ProcessStep = {
      id: `p-${Date.now()}`,
      name: newProcessName.trim(),
      icon: Package,
      color: newProcessColor,
      wipRule: "標準ルール",
      estimatedTime: "30分",
      requiredSkills: [],
      zoneDescription: "作業ゾーンの説明",
      defaultCapacity: 5,
      baseUph: 100,
      tasks: ["基本作業"]
    };
    setAllSteps([...allSteps, newStep]);
    setNewProcessName("");
    setIsAddingProcessType(false);
  };

  const updateStepField = (stepId: string, field: keyof ProcessStep, value: any) => {
    setAllSteps(prev => prev.map(s => s.id === stepId ? { ...s, [field]: value } : s));
  };

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Workflow className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className={`${c.textPrimary} text-[24px] font-black tracking-tight`}>工程フロー管理 <span className="text-[12px] font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded ml-2 uppercase tracking-widest">Orchestration</span></h1>
            <p className={`${c.textSecondary} text-[14px] mt-0.5 opacity-70`}>倉庫の工程フローと運用ルールを定義します</p>
            <p className={`${c.textSecondary} text-[12px] mt-1`}>荷主名：<span className="font-bold text-indigo-400">{selectedClient?.name ?? '－'}</span> / エリア：<span className="font-bold text-indigo-400">{selectedArea?.name ?? '－'}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className={`flex items-center gap-2 px-5 py-2.5 rounded-xl ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[13px] hover:bg-gray-500/10 transition-all font-bold shadow-sm`}>
            <Play className="w-4 h-4 text-emerald-500" />シミュレート
          </button>
          <button className="flex items-center gap-2 px-7 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 font-black">
            <Save className="w-4 h-4" />設定を保持
          </button>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="flex-1 flex gap-6 min-h-0">

        {/* Column 1: ワークフローツリー (Hierarchy Tree) */}
        <div className={`w-[260px] flex flex-col border ${c.border} rounded-2xl ${c.bgCard} overflow-hidden shadow-sm`}>
          <div className={`p-4 border-b ${c.border} bg-gray-500/5`}>
            <div className="flex items-center gap-2">
              <Layers className={`w-4 h-4 text-indigo-500`} />
              <h3 className={`${c.textSecondary} text-[11px] font-black uppercase tracking-[0.2em]`}>ワークフローツリー</h3>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">荷主→拠点→エリアを選択し、右側でワークフロー編集を行います。</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
            {clients.map((client) => {
              const isClientActive = client.id === selectedClientId;
              return (
                <div key={client.id} className="space-y-2">
                  <button
                    onClick={() => setClient(client.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl font-bold ${isClientActive ? "bg-indigo-500/15 text-indigo-500" : "bg-gray-500/5 text-gray-600 hover:bg-gray-500/10"}`}
                  >
                    {client.name}
                  </button>
                  {isClientActive && (
                    <div className="pl-4 space-y-2">
                      {client.sites.map((site) => {
                        const isSiteActive = site.id === selectedSiteId;
                        return (
                          <div key={site.id}>
                            <button
                              onClick={() => setSite(site.id)}
                              className={`w-full text-left px-3 py-1 rounded-lg text-[13px] font-semibold ${isSiteActive ? "bg-indigo-500/10 text-indigo-500" : "bg-gray-500/5 text-gray-500 hover:bg-gray-500/10"}`}
                            >
                              {site.name}
                            </button>
                            {isSiteActive && (
                              <div className="mt-2 space-y-1">
                                {visibleAreas.map((area) => {
                                  const isActive = selectedAreaId === area.id;
                                  return (
                                    <button
                                      key={area.id}
                                      onClick={() => { selectArea(area.id); setEditingStepId(null); }}
                                      className={`w-full text-left px-3 py-1 rounded-lg text-[12px] ${isActive ? "bg-indigo-500/20 text-indigo-600 font-bold" : "bg-gray-500/5 text-gray-500 hover:bg-gray-500/10"}`}
                                    >
                                      {area.name}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: 工程一覧 (Process Master Palette) */}
        <div className={`w-[280px] flex flex-col border ${c.border} rounded-2xl ${c.bgCard} overflow-hidden shadow-sm`}>
          <div className={`p-4 border-b ${c.border} flex items-center justify-between bg-gray-500/5`}>
            <div className="flex items-center gap-2">
              <BookOpen className={`w-4 h-4 text-indigo-500`} />
              <h3 className={`${c.textSecondary} text-[11px] font-black uppercase tracking-[0.2em]`}>工程一覧 (Master)</h3>
            </div>
            <button onClick={() => setIsAddingProcessType(!isAddingProcessType)} className={`p-1.5 rounded-lg bg-gray-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all`}>
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-500/5 border ${c.borderCard}`}>
              <Search className="w-4 h-4 text-gray-400" />
              <input type="text" placeholder="工程を検索..." className="bg-transparent border-none text-[12px] outline-none w-full" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {isAddingProcessType && (
              <div className="p-4 rounded-2xl border-2 border-indigo-500/50 bg-white dark:bg-gray-900 shadow-xl mb-4 animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between mb-3 text-indigo-500 font-black text-[12px] uppercase">工程定義を作成</div>
                <input
                  type="text"
                  value={newProcessName}
                  onChange={(e) => setNewProcessName(e.target.value)}
                  placeholder="新しい工程名..."
                  className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-xl px-4 py-2.5 text-[13px] outline-none focus:ring-2 ring-indigo-500/20 mb-4`}
                />
                <div className="flex gap-2 mb-4 flex-wrap justify-center">
                  {AREA_COLORS.slice(0, 5).map(col => (
                    <button key={col} onClick={() => setNewProcessColor(col)} className={`w-8 h-8 rounded-xl ${processColorClasses[col].bg} border-2 ${newProcessColor === col ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-transparent"} transition-all`} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setIsAddingProcessType(false)} className="flex-1 py-2 text-[12px] font-bold text-gray-400">キャンセル</button>
                  <button onClick={createNewProcessType} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-[12px] font-black shadow-lg shadow-indigo-500/20">追加</button>
                </div>
              </div>
            )}
            {allSteps.map(step => {
              const isInArea = selectedArea?.processStepIds.includes(step.id);
              const sc = processColorClasses[step.color] || processColorClasses.cyan;
              return (
                <div
                  key={step.id}
                  onClick={() => !isInArea && addStepToArea(step.id)}
                  className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all cursor-pointer ${isInArea
                      ? "opacity-30 grayscale cursor-not-allowed bg-gray-100 dark:bg-gray-800/50 border-transparent shadow-none"
                      : "bg-white dark:bg-gray-800 border-white dark:border-gray-700 hover:border-indigo-500/30 hover:shadow-lg shadow-sm"
                    }`}
                >
                  <div className={`p-2 rounded-xl ${sc.bg} ${sc.text} shadow-inner`}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[14px] font-bold truncate">{step.name}</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{step.color}</p>
                  </div>
                  {!isInArea && <Plus className="w-4 h-4 text-indigo-500" />}
                  {isInArea && <Check className="w-4 h-4 text-emerald-500 border-2 border-emerald-500/20 rounded-full" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 3: 業務一覧 (Orchestrated Flow) */}
        <div className={`flex-1 flex flex-col border ${c.border} rounded-2xl ${c.bgCard} overflow-hidden shadow-sm`}>
          <div className={`p-4 border-b ${c.border} flex items-center justify-between bg-gray-500/5`}>
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 text-amber-500`} />
              <h3 className={`${c.textSecondary} text-[11px] font-black uppercase tracking-[0.2em]`}>工程フロー (エリア編排) - {selectedArea?.name}</h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-500/5">
            {areaSteps.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400/30">
                <Workflow className="w-20 h-20 mb-4" />
                <p className="text-[18px] font-black uppercase tracking-widest">NO OPERATIONAL FLOW</p>
                <p className="text-[13px] mt-2 font-medium">中間の「工程一覧」からマスター工程を追加してください</p>
              </div>
            ) : (
              <div className="max-w-[800px] mx-auto space-y-4">
                {areaSteps.map((step, idx) => {
                  const isActive = editingStepId === step.id;
                  const sc = processColorClasses[step.color] || processColorClasses.cyan;
                  return (
                    <div key={step.id + idx} className="relative">
                      {/* Connecting Line */}
                      {idx < areaSteps.length - 1 && (
                        <div className="absolute left-[26px] top-[70px] bottom-[-20px] w-1 bg-gradient-to-b from-indigo-500/50 to-transparent z-0" />
                      )}

                      <div className={`relative z-10 flex gap-4 transition-all duration-300 ${isActive ? 'translate-x-2' : ''}`}>
                        {/* Step Index Circle */}
                        <div className={`w-14 shrink-0 flex flex-col items-center`}>
                          <div className={`w-12 h-12 rounded-2xl border-4 ${c.bgCard} flex items-center justify-center text-[18px] font-black shadow-lg ${isActive ? 'bg-indigo-600 border-indigo-500 text-white' : 'text-indigo-500 border-indigo-500/20'}`}>
                            {idx + 1}
                          </div>
                          <div className="mt-2 flex flex-col gap-1">
                            <button onClick={() => moveStepInArea('up', step.id)} disabled={idx === 0} className="p-1 hover:bg-gray-500/10 rounded disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
                            <button onClick={() => moveStepInArea('down', step.id)} disabled={idx === areaSteps.length - 1} className="p-1 hover:bg-gray-500/10 rounded disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
                          </div>
                        </div>

                        {/* Process Card */}
                        <div
                          className={`flex-1 rounded-3xl border-2 p-5 transition-all shadow-xl group border-transparent bg-white dark:bg-gray-900 ${isActive ? 'ring-4 ring-indigo-500/10 border-indigo-500' : 'hover:border-indigo-500/30 shadow-gray-200/50 dark:shadow-none'
                            }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div
                                onClick={() => setEditingStepId(isActive ? null : step.id)}
                                className={`p-3 rounded-2xl ${sc.bg} ${sc.text} cursor-pointer hover:scale-110 transition-transform`}
                              >
                                <step.icon className="w-7 h-7" />
                              </div>
                              <div>
                                <h4 className={`${c.textPrimary} text-[18px] font-black`}>{step.name}</h4>
                                <div className="flex items-center gap-3 mt-1">
                                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{step.defaultCapacity}名</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400">
                                    <Target className="w-3.5 h-3.5" />
                                    <span>{step.baseUph} UPH</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditingStepId(isActive ? null : step.id)}
                                className={`px-4 py-1.5 rounded-lg text-[12px] font-black transition-all ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-500/10 text-gray-500 hover:bg-indigo-500/20 hover:text-indigo-500'}`}
                              >
                                {isActive ? '編集完了' : '編集'}
                              </button>
                              <button onClick={() => removeStepFromArea(selectedAreaId, step.id)} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl">
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            </div>
                          </div>

                          {/* Editable Overlay / Panel */}
                          {isActive && (
                            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
                              <div className="space-y-4">
                                <div>
                                  <label className="text-[10px] font-black uppercase text-gray-400 mb-1.5 block tracking-widest">WIP引継ぎルール (Handover)</label>
                                  <textarea
                                    value={step.wipRule}
                                    onChange={(e) => updateStepField(step.id, 'wipRule', e.target.value)}
                                    className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-xl p-3 text-[13px] outline-none focus:ring-2 ring-indigo-500/20 min-h-[80px]`}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-black uppercase text-gray-400 mb-1.5 block tracking-widest font-bold">必要スキル / 資格 (Requirements)</label>
                                  <div className="flex flex-wrap gap-2">
                                    {step.requiredSkills.map(skill => (
                                      <span key={skill} className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 text-[11px] font-black border border-indigo-500/10 flex items-center gap-2">
                                        <ShieldCheck className="w-3 h-3" /> {skill}
                                      </span>
                                    ))}
                                    <button
                                      onClick={() => {
                                        const s = prompt("スキル名を入力してください");
                                        if (s) updateStepField(step.id, 'requiredSkills', [...step.requiredSkills, s]);
                                      }}
                                      className="px-3 py-1.5 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:text-indigo-500 hover:border-indigo-500/30 text-[11px] font-bold"
                                    >
                                      + 追加
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-[10px] font-black uppercase text-gray-400 mb-1.5 block tracking-widest">基準人数 (Capacity)</label>
                                    <div className="relative">
                                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                      <input
                                        type="number"
                                        value={step.defaultCapacity}
                                        onChange={(e) => updateStepField(step.id, 'defaultCapacity', parseInt(e.target.value))}
                                        className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-xl pl-10 pr-4 py-2 text-[14px] font-bold outline-none`}
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-black uppercase text-gray-400 mb-1.5 block tracking-widest">基準UPH (Speed)</label>
                                    <div className="relative">
                                      <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                      <input
                                        type="number"
                                        value={step.baseUph}
                                        onChange={(e) => updateStepField(step.id, 'baseUph', parseInt(e.target.value))}
                                        className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-xl pl-10 pr-4 py-2 text-[14px] font-bold outline-none`}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] font-black uppercase text-gray-400 mb-1.5 block tracking-widest font-bold">サブ工程ステップ (Sub-tasks)</label>
                                  <div className="space-y-2">
                                    {step.tasks.map((task, tidx) => (
                                      <div key={task + tidx} className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                                        <span className="text-[12px] font-medium">{task}</span>
                                        <button onClick={() => updateStepField(step.id, 'tasks', step.tasks.filter(t => t !== task))}><X className="w-3.5 h-3.5 text-rose-400" /></button>
                                      </div>
                                    ))}
                                    <div className="flex gap-2">
                                      <input id={`newtask-${step.id}`} type="text" placeholder="新しい業務名..." className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 rounded-lg px-3 py-1 text-[12px] outline-none" />
                                      <button onClick={() => {
                                        const input = document.getElementById(`newtask-${step.id}`) as HTMLInputElement;
                                        if (input.value) {
                                          updateStepField(step.id, 'tasks', [...step.tasks, input.value]);
                                          input.value = '';
                                        }
                                      }} className="p-1 px-3 bg-indigo-600 text-white rounded-lg text-[11px] font-bold">追加</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {!isActive && (
                            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                              {step.tasks.map((task, tidx) => (
                                <span key={tidx} className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 whitespace-nowrap">{task}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
