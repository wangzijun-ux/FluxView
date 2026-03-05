import { useState } from "react";
import {
  Plus,
  GripVertical,
  ArrowRight,
  Settings,
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
  ChevronRight,
  Layers,
  X,
  Check,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import {
  defaultProcessSteps,
  defaultAreas,
  availableProcessTemplates,
  processColorClasses,
  getProcessStepsForArea,
  type ProcessStep,
  type Area,
} from "./processStore";

const AREA_COLORS = ["cyan", "emerald", "violet", "amber", "blue", "rose", "orange", "pink", "teal", "indigo"];

export function ProcessBuilder() {
  const [areas, setAreas] = useState<Area[]>(defaultAreas);
  const [allSteps] = useState<ProcessStep[]>(defaultProcessSteps);
  const [selectedAreaId, setSelectedAreaId] = useState<string>(defaultAreas[0].id);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [showAreaEditor, setShowAreaEditor] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaDesc, setNewAreaDesc] = useState("");
  const [newAreaColor, setNewAreaColor] = useState("cyan");
  const [showNewAreaForm, setShowNewAreaForm] = useState(false);
  const c = useThemeColors();

  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? areas[0];
  const areaSteps = getProcessStepsForArea(selectedArea);
  const selectedProcess = allSteps.find((s) => s.id === selectedStep);

  // Available steps not already in this area
  const availableForArea = allSteps.filter(
    (s) => !selectedArea.processStepIds.includes(s.id)
  );

  const addStepToArea = (stepId: string) => {
    setAreas((prev) =>
      prev.map((a) =>
        a.id === selectedAreaId
          ? { ...a, processStepIds: [...a.processStepIds, stepId] }
          : a
      )
    );
  };

  const removeStepFromArea = (stepId: string) => {
    setAreas((prev) =>
      prev.map((a) =>
        a.id === selectedAreaId
          ? { ...a, processStepIds: a.processStepIds.filter((id) => id !== stepId) }
          : a
      )
    );
    if (selectedStep === stepId) setSelectedStep(null);
  };

  const moveStep = (stepId: string, direction: "up" | "down") => {
    setAreas((prev) =>
      prev.map((a) => {
        if (a.id !== selectedAreaId) return a;
        const ids = [...a.processStepIds];
        const idx = ids.indexOf(stepId);
        if (idx < 0) return a;
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= ids.length) return a;
        [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
        return { ...a, processStepIds: ids };
      })
    );
  };

  const createArea = () => {
    if (!newAreaName.trim()) return;
    const newArea: Area = {
      id: `area-${Date.now()}`,
      name: newAreaName.trim(),
      description: newAreaDesc.trim(),
      color: newAreaColor,
      processStepIds: [],
    };
    setAreas((prev) => [...prev, newArea]);
    setSelectedAreaId(newArea.id);
    setNewAreaName("");
    setNewAreaDesc("");
    setShowNewAreaForm(false);
  };

  const deleteArea = (areaId: string) => {
    if (areas.length <= 1) return;
    setAreas((prev) => prev.filter((a) => a.id !== areaId));
    if (selectedAreaId === areaId) {
      setSelectedAreaId(areas.find((a) => a.id !== areaId)?.id ?? areas[0].id);
    }
  };

  const updateAreaField = (areaId: string, field: keyof Area, value: string) => {
    setAreas((prev) =>
      prev.map((a) => (a.id === areaId ? { ...a, [field]: value } : a))
    );
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={c.textPrimary}>ノーコード工程ビルダー</h1>
          <p className={`${c.textSecondary} text-[14px] mt-1`}>エリアごとに工程フローを自由に定義</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAreaEditor(!showAreaEditor)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] transition-all ${
              showAreaEditor
                ? "bg-violet-600 text-white"
                : `${c.bgSurface} border ${c.borderCard} ${c.textSecondary} hover:opacity-80`
            }`}
          >
            <Layers className="w-4 h-4" />エリア管理
          </button>
          <button className={`flex items-center gap-2 px-4 py-2 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[13px] hover:opacity-80 transition-all`}>
            <Copy className="w-4 h-4" />テンプレート
          </button>
          <button className={`flex items-center gap-2 px-4 py-2 rounded-lg ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} text-[13px] hover:opacity-80 transition-all`}>
            <Play className="w-4 h-4" />シミュレーション
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500 transition-all">
            <Save className="w-4 h-4" />保存
          </button>
        </div>
      </div>

      {/* Area Tabs */}
      <div className={`flex items-center gap-2 mb-4 overflow-x-auto pb-1`}>
        <MapPin className={`w-4 h-4 ${c.textMuted} shrink-0`} />
        {areas.map((area) => {
          const aColors = processColorClasses[area.color] ?? processColorClasses.cyan;
          const isActive = selectedAreaId === area.id;
          return (
            <button
              key={area.id}
              onClick={() => { setSelectedAreaId(area.id); setSelectedStep(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] transition-all shrink-0 border ${
                isActive
                  ? `${aColors.bg} ${aColors.border} ${aColors.text} ring-1 ring-offset-1 ${c.isDark ? "ring-offset-gray-900" : "ring-offset-white"} ${aColors.border}`
                  : `${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:opacity-80`
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${aColors.bg} border ${aColors.border}`} />
              {area.name}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${c.bgSurface} ${c.textMuted}`}>
                {area.processStepIds.length}工程
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setShowNewAreaForm(true)}
          className={`flex items-center gap-1 px-3 py-2 rounded-xl border-2 border-dashed ${c.borderCard} ${c.textDimmed} text-[12px] hover:border-cyan-500/30 hover:text-cyan-400 transition-all shrink-0`}
        >
          <Plus className="w-3.5 h-3.5" />新規エリア
        </button>
      </div>

      {/* New Area Form (inline) */}
      {showNewAreaForm && (
        <div className={`${c.bgCard} rounded-xl border ${c.border} p-4 mb-4`}>
          <div className="flex items-center justify-between mb-3">
            <h4 className={`${c.textPrimary} text-[14px]`}>新規エリア作成</h4>
            <button onClick={() => setShowNewAreaForm(false)} className={c.textMuted}><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className={`text-[12px] ${c.textMuted} block mb-1`}>エリア名</label>
              <input
                type="text"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="例: Eエリア（返品処理）"
                className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none focus:border-cyan-500/50`}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className={`text-[12px] ${c.textMuted} block mb-1`}>説明</label>
              <input
                type="text"
                value={newAreaDesc}
                onChange={(e) => setNewAreaDesc(e.target.value)}
                placeholder="例: 返品受付・再検品"
                className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none focus:border-cyan-500/50`}
              />
            </div>
            <div>
              <label className={`text-[12px] ${c.textMuted} block mb-1`}>カラー</label>
              <div className="flex gap-1">
                {AREA_COLORS.map((col) => {
                  const cc = processColorClasses[col];
                  return (
                    <button
                      key={col}
                      onClick={() => setNewAreaColor(col)}
                      className={`w-7 h-7 rounded-lg ${cc.bg} border-2 transition-all ${
                        newAreaColor === col ? `${cc.border} ring-2 ring-offset-1 ${c.isDark ? "ring-offset-gray-900" : "ring-offset-white"} ${cc.border}` : `${c.borderCard}`
                      }`}
                    />
                  );
                })}
              </div>
            </div>
            <button
              onClick={createArea}
              disabled={!newAreaName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500 transition-all disabled:opacity-40"
            >
              <Check className="w-4 h-4" />作成
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Area Editor Panel (toggle) */}
        {showAreaEditor && (
          <div className={`w-[260px] ${c.bgCard} rounded-xl border ${c.border} p-4 shrink-0 overflow-y-auto`}>
            <h4 className={`${c.textSecondary} text-[12px] mb-3 tracking-wider uppercase`}>エリア一覧</h4>
            <div className="space-y-2">
              {areas.map((area) => {
                const aColors = processColorClasses[area.color] ?? processColorClasses.cyan;
                const isEditing = editingAreaId === area.id;
                const areaProcesses = getProcessStepsForArea(area);
                return (
                  <div
                    key={area.id}
                    className={`rounded-xl border p-3 transition-all ${
                      selectedAreaId === area.id
                        ? `${aColors.bg} ${aColors.border}`
                        : `${c.bgSurface} ${c.borderCard}`
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={area.name}
                          onChange={(e) => updateAreaField(area.id, "name", e.target.value)}
                          onBlur={() => setEditingAreaId(null)}
                          onKeyDown={(e) => e.key === "Enter" && setEditingAreaId(null)}
                          autoFocus
                          className={`flex-1 ${c.bgSurface} border ${c.borderCard} rounded px-2 py-0.5 text-[12px] ${c.textPrimary} outline-none`}
                        />
                      ) : (
                        <div
                          className={`flex items-center gap-1.5 cursor-pointer flex-1`}
                          onClick={() => { setSelectedAreaId(area.id); setSelectedStep(null); }}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full ${aColors.bg} border ${aColors.border}`} />
                          <span className={`text-[12px] ${selectedAreaId === area.id ? aColors.text : c.textPrimary}`}>
                            {area.name}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => setEditingAreaId(isEditing ? null : area.id)}
                          className={`p-0.5 rounded ${c.textMuted} hover:text-cyan-400`}
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        {areas.length > 1 && (
                          <button
                            onClick={() => deleteArea(area.id)}
                            className={`p-0.5 rounded ${c.textMuted} hover:text-red-400`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className={`text-[10px] ${c.textMuted} mb-1.5`}>{area.description}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {areaProcesses.map((step, idx) => {
                        const sc = processColorClasses[step.color];
                        return (
                          <div key={step.id} className="flex items-center gap-0.5">
                            <span className={`text-[9px] px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}>
                              {step.name}
                            </span>
                            {idx < areaProcesses.length - 1 && (
                              <ArrowRight className={`w-2.5 h-2.5 ${c.textDimmed}`} />
                            )}
                          </div>
                        );
                      })}
                      {areaProcesses.length === 0 && (
                        <span className={`text-[10px] ${c.textDimmed}`}>工程未設定</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Process Palette */}
        <div className={`w-[200px] ${c.bgCard} rounded-xl border ${c.border} p-4 shrink-0`}>
          <h4 className={`${c.textSecondary} text-[12px] mb-3 tracking-wider uppercase`}>工程パレット</h4>
          <div className="space-y-2">
            {availableProcessTemplates.map((proc) => {
              // Check if this template has a matching master step
              const masterStep = allSteps.find((s) => s.name === proc.name);
              const isInArea = masterStep
                ? selectedArea.processStepIds.includes(masterStep.id)
                : false;

              return (
                <div
                  key={proc.name}
                  onClick={() => {
                    if (masterStep && !isInArea) addStepToArea(masterStep.id);
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                    isInArea
                      ? `${c.bgSurface} ${c.borderCard} opacity-40 cursor-not-allowed`
                      : `${c.bgSurface} ${c.borderCard} cursor-pointer hover:border-cyan-500/30`
                  }`}
                >
                  <GripVertical className={`w-3.5 h-3.5 ${c.textDimmed}`} />
                  <proc.icon className={`w-4 h-4 ${c.textSecondary}`} />
                  <span className={`text-[13px] ${c.textSecondary} flex-1`}>{proc.name}</span>
                  {isInArea ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : masterStep ? (
                    <Plus className="w-3.5 h-3.5 text-cyan-400 opacity-0 group-hover:opacity-100" />
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Available for area */}
          {availableForArea.length > 0 && (
            <div className="mt-4">
              <h4 className={`${c.textSecondary} text-[10px] mb-2 tracking-wider uppercase`}>追加可能</h4>
              <div className="space-y-1">
                {availableForArea.map((step) => {
                  const sc = processColorClasses[step.color];
                  return (
                    <button
                      key={step.id}
                      onClick={() => addStepToArea(step.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${c.borderCard} ${c.bgSurface} hover:border-cyan-500/30 text-[11px] transition-all`}
                    >
                      <step.icon className={`w-3.5 h-3.5 ${sc.text}`} />
                      <span className={c.textSecondary}>{step.name}</span>
                      <Plus className="w-3 h-3 text-cyan-400 ml-auto" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Process Flow */}
        <div className={`flex-1 ${c.bgCard} rounded-xl border ${c.border} p-6 overflow-x-auto`}>
          <div className="flex items-center gap-2 mb-6">
            <div className={`w-3 h-3 rounded-full ${(processColorClasses[selectedArea.color] ?? processColorClasses.cyan).bg} border ${(processColorClasses[selectedArea.color] ?? processColorClasses.cyan).border}`} />
            <h3 className={c.textPrimary}>{selectedArea.name}</h3>
            <span className={`text-[12px] ${c.textMuted} ${c.bgSurface} px-2 py-0.5 rounded`}>
              {selectedArea.description || "フロー定義"}
            </span>
            <span className={`text-[11px] ${c.textMuted} ml-auto`}>
              {areaSteps.length}工程
            </span>
          </div>

          {areaSteps.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-[200px] ${c.textDimmed}`}>
              <Layers className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-[14px]">このエリアにはまだ工程がありません</p>
              <p className="text-[12px] mt-1">左のパレットから工程を追加してください</p>
            </div>
          ) : (
            <div className="flex items-start gap-3 overflow-x-auto pb-4">
              {areaSteps.map((step, idx) => {
                const colors = processColorClasses[step.color];
                const isSelected = selectedStep === step.id;
                return (
                  <div key={step.id} className="flex items-center gap-3">
                    <div
                      onClick={() => setSelectedStep(step.id)}
                      className={`w-[180px] rounded-xl border-2 p-4 cursor-pointer transition-all shrink-0 ${
                        isSelected
                          ? `${colors.border} ${colors.bg} ring-2 ring-cyan-500/20`
                          : `${c.borderCard} ${c.bgSurface} hover:opacity-80`
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center`}>
                          <step.icon className={`w-4 h-4 ${colors.text}`} />
                        </div>
                        <div className="flex items-center gap-0.5">
                          {idx > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); moveStep(step.id, "up"); }}
                              className={`${c.textDimmed} hover:text-cyan-400 p-0.5`}
                              title="前に移動"
                            >
                              <ChevronRight className="w-3 h-3 rotate-180" />
                            </button>
                          )}
                          {idx < areaSteps.length - 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); moveStep(step.id, "down"); }}
                              className={`${c.textDimmed} hover:text-cyan-400 p-0.5`}
                              title="後ろに移動"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeStepFromArea(step.id); }}
                            className={`${c.textDimmed} hover:text-red-400 p-0.5`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h4 className={`${c.textPrimary} text-[14px] mb-1`}>{step.name}</h4>
                      <p className={`text-[11px] ${c.textMuted}`}>WIP: {step.wipRule}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[10px] ${c.textMuted} ${c.bg} px-1.5 py-0.5 rounded`}>{step.estimatedTime}</span>
                        <span className={`text-[10px] ${c.textMuted} ${c.bg} px-1.5 py-0.5 rounded flex items-center gap-0.5`}>
                          <Users className="w-2.5 h-2.5" />{step.defaultCapacity}名
                        </span>
                        <span className={`text-[10px] ${c.textMuted} ${c.bg} px-1.5 py-0.5 rounded flex items-center gap-0.5`}>
                          <Gauge className="w-2.5 h-2.5" />{step.baseUph}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {step.requiredSkills.map((skill) => (
                          <span key={skill} className={`text-[10px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>{skill}</span>
                        ))}
                      </div>
                    </div>
                    {idx < areaSteps.length - 1 && <ArrowRight className={`w-5 h-5 ${c.textDimmed} shrink-0`} />}
                  </div>
                );
              })}
              <button
                className={`w-[60px] h-[180px] rounded-xl border-2 border-dashed ${c.borderCard} flex items-center justify-center ${c.textDimmed} hover:border-cyan-500/30 hover:text-cyan-400 transition-all shrink-0`}
                title="工程を追加"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          )}

          {/* All Areas Flow Overview */}
          <div className={`mt-6 pt-4 border-t ${c.border}`}>
            <div className="flex items-center gap-2 mb-3">
              <Layers className={`w-4 h-4 ${c.textMuted}`} />
              <h4 className={`${c.textSecondary} text-[12px] tracking-wider uppercase`}>全エリア フロー概要</h4>
            </div>
            <div className="space-y-2">
              {areas.map((area) => {
                const aColors = processColorClasses[area.color] ?? processColorClasses.cyan;
                const aSteps = getProcessStepsForArea(area);
                const isActive = area.id === selectedAreaId;
                return (
                  <button
                    key={area.id}
                    onClick={() => { setSelectedAreaId(area.id); setSelectedStep(null); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left ${
                      isActive
                        ? `${aColors.bg} ${aColors.border}`
                        : `${c.bgSurface} ${c.borderCard} hover:opacity-80`
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${aColors.bg} border ${aColors.border} shrink-0`} />
                    <span className={`text-[12px] ${isActive ? aColors.text : c.textSecondary} w-[160px] shrink-0 truncate`}>
                      {area.name}
                    </span>
                    <div className="flex items-center gap-1 flex-1 overflow-x-auto">
                      {aSteps.map((step, idx) => {
                        const sc = processColorClasses[step.color];
                        return (
                          <div key={step.id} className="flex items-center gap-1 shrink-0">
                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${sc.bg} ${sc.text}`}>
                              <step.icon className="w-2.5 h-2.5" />
                              {step.name}
                            </div>
                            {idx < aSteps.length - 1 && <ArrowRight className={`w-2.5 h-2.5 ${c.textDimmed}`} />}
                          </div>
                        );
                      })}
                      {aSteps.length === 0 && <span className={`text-[10px] ${c.textDimmed}`}>未設定</span>}
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 ${c.textDimmed} shrink-0`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Property Panel */}
        {selectedProcess && (
          <div className={`w-[280px] ${c.bgCard} rounded-xl border ${c.border} p-5 shrink-0 overflow-y-auto`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={c.textPrimary}>プロパティ</h3>
              <button onClick={() => setSelectedStep(null)} className={c.textMuted}>×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>工程名</label>
                <input type="text" value={selectedProcess.name} readOnly className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} focus:border-cyan-500/50 outline-none`} />
              </div>
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>所属エリア</label>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${c.bgSurface} border ${c.borderCard}`}>
                  <MapPin className={`w-3.5 h-3.5 ${(processColorClasses[selectedArea.color] ?? processColorClasses.cyan).text}`} />
                  <span className={`text-[13px] ${c.textPrimary}`}>{selectedArea.name}</span>
                </div>
              </div>
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>ゾーン説明</label>
                <input type="text" value={selectedProcess.zoneDescription} readOnly className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} focus:border-cyan-500/50 outline-none`} />
              </div>
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>WIP引継ぎルール</label>
                <input type="text" value={selectedProcess.wipRule} readOnly className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} focus:border-cyan-500/50 outline-none`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>想定作業時間</label>
                  <input type="text" value={selectedProcess.estimatedTime} readOnly className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`} />
                </div>
                <div>
                  <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>デフォルト定員</label>
                  <input type="text" value={`${selectedProcess.defaultCapacity}名`} readOnly className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`} />
                </div>
              </div>
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>基準UPH (1人あたり)</label>
                <input type="text" value={selectedProcess.baseUph} readOnly className={`w-full ${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`} />
              </div>
              <div>
                <label className={`text-[12px] ${c.textMuted} block mb-1.5`}>必要スキル</label>
                <div className="flex flex-wrap gap-1.5">
                  {selectedProcess.requiredSkills.map((skill) => (
                    <span key={skill} className="text-[12px] px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{skill}</span>
                  ))}
                  <button className={`text-[12px] px-2 py-1 rounded-lg border border-dashed ${c.borderCard} ${c.textMuted} hover:text-cyan-400 hover:border-cyan-500/30`}>+ 追加</button>
                </div>
              </div>
              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => removeStepFromArea(selectedProcess.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg ${c.bgSurface} border ${c.borderCard} text-red-400 text-[13px] hover:bg-red-500/10`}
                >
                  <Trash2 className="w-3.5 h-3.5" />エリアから除外
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500">
                  <Settings className="w-3.5 h-3.5" />詳細設定
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
