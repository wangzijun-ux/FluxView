import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Plus, Route, Save, Search, Trash2, X } from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import { useMasterData } from "./MasterDataContext";
import type { ProcessMaster, WorkflowDefinition, WorkflowStepSetting } from "./masterStore";

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const byUpdatedAtDesc = (a: WorkflowDefinition, b: WorkflowDefinition) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

function MultiSelectChips({
  options,
  selectedIds,
  onChange,
  placeholder,
}: {
  options: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  const selected = options.filter((option) => selectedIds.includes(option.id));

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full h-[40px] px-3 rounded-lg border ${c.borderCard} ${c.bgSurface} ${c.textSecondary} text-left text-[12px]`}
      >
        {selected.length === 0 ? placeholder : `${selected.length}件選択`}
      </button>
      {open && (
        <div className={`absolute left-0 top-[44px] z-20 w-[300px] rounded-lg border ${c.border} ${c.bgCard} p-2 shadow-xl`}>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {options.map((option) => {
              const active = selectedIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(option.id)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-[12px] ${
                    active ? "bg-cyan-500/15 text-cyan-300" : `${c.textSecondary} ${c.bgCardHover}`
                  }`}
                >
                  {option.name}
                </button>
              );
            })}
          </div>
          <div className={`mt-2 pt-2 border-t ${c.borderCard} flex items-center justify-between`}>
            <div className={`text-[11px] ${c.textMuted}`}>{selected.length}件選択中</div>
            <button type="button" onClick={() => onChange([])} className="p-1 rounded text-rose-400 hover:bg-rose-500/10">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildStepFromProcess(process: ProcessMaster): WorkflowStepSetting {
  return {
    id: makeId("step"),
    processId: process.id,
    requiredQualificationIds: process.defaultQualificationIds,
    requiredSkillIds: process.defaultSkillIds,
    standardHeadcount: process.defaultHeadcount,
    uph: process.defaultUph,
  };
}

export function WorkflowManagement() {
  const c = useThemeColors();
  const { shippers, sites, areas, qualifications, skills, processes, workflows, setWorkflows } = useMasterData();

  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [newName, setNewName] = useState("");
  const [newShipperId, setNewShipperId] = useState("");
  const [newSiteId, setNewSiteId] = useState("");
  const [newAreaId, setNewAreaId] = useState("");

  const [filterShipperId, setFilterShipperId] = useState("all");
  const [filterSiteId, setFilterSiteId] = useState("all");
  const [filterAreaId, setFilterAreaId] = useState("all");
  const [filterProcessId, setFilterProcessId] = useState("all");
  const [filterKeyword, setFilterKeyword] = useState("");

  useEffect(() => {
    if (!newShipperId && shippers.length > 0) setNewShipperId(shippers[0].id);
  }, [newShipperId, shippers]);

  useEffect(() => {
    const availableSites = sites.filter((s) => s.shipperId === newShipperId);
    if (availableSites.length > 0) {
      if (!availableSites.some((s) => s.id === newSiteId)) setNewSiteId(availableSites[0].id);
      return;
    }
    setNewSiteId("");
  }, [newShipperId, newSiteId, sites]);

  useEffect(() => {
    const availableAreas = areas.filter((a) => a.siteId === newSiteId);
    if (availableAreas.length > 0) {
      if (!availableAreas.some((a) => a.id === newAreaId)) setNewAreaId(availableAreas[0].id);
      return;
    }
    setNewAreaId("");
  }, [newSiteId, newAreaId, areas]);

  const shipperMap = useMemo(() => new Map(shippers.map((x) => [x.id, x])), [shippers]);
  const siteMap = useMemo(() => new Map(sites.map((x) => [x.id, x])), [sites]);
  const areaMap = useMemo(() => new Map(areas.map((x) => [x.id, x])), [areas]);
  const processMap = useMemo(() => new Map(processes.map((x) => [x.id, x])), [processes]);

  const filteredSites = sites.filter((s) => filterShipperId === "all" || s.shipperId === filterShipperId);
  const filteredAreas = areas.filter((a) => filterSiteId === "all" || a.siteId === filterSiteId);

  const filteredWorkflows = workflows
    .filter((wf) => {
      if (filterShipperId !== "all" && wf.shipperId !== filterShipperId) return false;
      if (filterSiteId !== "all" && wf.siteId !== filterSiteId) return false;
      if (filterAreaId !== "all" && wf.areaId !== filterAreaId) return false;
      if (filterProcessId !== "all" && !wf.steps.some((s) => s.processId === filterProcessId)) return false;
      if (!filterKeyword.trim()) return true;
      const bag = `${wf.name} ${shipperMap.get(wf.shipperId)?.name ?? ""} ${siteMap.get(wf.siteId)?.name ?? ""} ${areaMap.get(wf.areaId)?.name ?? ""}`.toLowerCase();
      return bag.includes(filterKeyword.toLowerCase());
    })
    .sort(byUpdatedAtDesc);

  useEffect(() => {
    if (filteredWorkflows.length > 0 && !filteredWorkflows.some((x) => x.id === selectedWorkflowId)) {
      setSelectedWorkflowId(filteredWorkflows[0].id);
    }
    if (filteredWorkflows.length === 0) setSelectedWorkflowId("");
  }, [filteredWorkflows, selectedWorkflowId]);

  const selectedWorkflow = workflows.find((x) => x.id === selectedWorkflowId);

  const updateWorkflow = (workflowId: string, mutate: (wf: WorkflowDefinition) => WorkflowDefinition) => {
    setWorkflows((prev) => prev.map((wf) => (wf.id === workflowId ? { ...mutate(wf), updatedAt: new Date().toISOString() } : wf)));
  };

  const createWorkflow = () => {
    if (!newShipperId || !newSiteId || !newAreaId) return;
    const autoName = `${shipperMap.get(newShipperId)?.name ?? ""}_${siteMap.get(newSiteId)?.name ?? ""}_${areaMap.get(newAreaId)?.name ?? ""}`;
    const firstStepProcess = processes[0];
    const workflow: WorkflowDefinition = {
      id: makeId("workflow"),
      name: newName.trim() || autoName,
      shipperId: newShipperId,
      siteId: newSiteId,
      areaId: newAreaId,
      steps: firstStepProcess ? [buildStepFromProcess(firstStepProcess)] : [],
      updatedAt: new Date().toISOString(),
    };
    setWorkflows((prev) => [workflow, ...prev]);
    setSelectedWorkflowId(workflow.id);
    setNewName("");
  };

  const deleteWorkflow = (workflowId: string) => {
    setWorkflows((prev) => prev.filter((wf) => wf.id !== workflowId));
  };

  const addStep = (workflowId: string) => {
    const defaultProcess = processes[0];
    if (!defaultProcess) return;
    updateWorkflow(workflowId, (wf) => ({ ...wf, steps: [...wf.steps, buildStepFromProcess(defaultProcess)] }));
  };

  const updateStep = (workflowId: string, stepId: string, mutate: (step: WorkflowStepSetting) => WorkflowStepSetting) => {
    updateWorkflow(workflowId, (wf) => ({ ...wf, steps: wf.steps.map((s) => (s.id === stepId ? mutate(s) : s)) }));
  };

  const removeStep = (workflowId: string, stepId: string) => {
    updateWorkflow(workflowId, (wf) => ({ ...wf, steps: wf.steps.filter((s) => s.id !== stepId) }));
  };

  const moveStep = (workflowId: string, stepId: string, dir: "up" | "down") => {
    updateWorkflow(workflowId, (wf) => {
      const next = [...wf.steps];
      const index = next.findIndex((s) => s.id === stepId);
      if (index < 0) return wf;
      const target = dir === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return wf;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...wf, steps: next };
    });
  };

  const inputClass = `${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2.5 text-[13px] ${c.textPrimary} placeholder:${c.textDimmed} focus:border-cyan-500/50 outline-none`;
  const cardClass = `${c.bgCard} border ${c.border} rounded-xl p-4`;
  const actionButtonClass = "rounded-lg bg-cyan-600 text-white text-[13px] font-semibold px-4 py-2 hover:bg-cyan-500 transition-all";

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className={`${cardClass} space-y-3`}>
        <div className="flex items-center gap-2 text-[13px] font-semibold"><Filter className="w-4 h-4" />フィルター</div>
        <div className="grid md:grid-cols-5 gap-3">
          <select value={filterShipperId} onChange={(e) => setFilterShipperId(e.target.value)} className={inputClass}><option value="all">荷主: すべて</option>{shippers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={filterSiteId} onChange={(e) => setFilterSiteId(e.target.value)} className={inputClass}><option value="all">拠点: すべて</option>{filteredSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={filterAreaId} onChange={(e) => setFilterAreaId(e.target.value)} className={inputClass}><option value="all">エリア: すべて</option>{filteredAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select value={filterProcessId} onChange={(e) => setFilterProcessId(e.target.value)} className={inputClass}><option value="all">工程: すべて</option>{processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <div className={`flex items-center gap-2 h-[40px] px-3 rounded-lg border ${c.borderCard} ${c.bgSurface}`}><Search className={`w-4 h-4 ${c.textMuted}`} /><input value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)} placeholder="キーワード" className={`w-full bg-transparent text-[13px] ${c.textPrimary} outline-none`} /></div>
        </div>
      </div>

      <div className={`${cardClass} space-y-3`}>
        <div className="text-[13px] font-semibold">新規ワークフロー</div>
        <div className="grid md:grid-cols-5 gap-3">
          <select value={newShipperId} onChange={(e) => setNewShipperId(e.target.value)} className={inputClass}><option value="">荷主を選択</option>{shippers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={newSiteId} onChange={(e) => setNewSiteId(e.target.value)} className={inputClass}><option value="">拠点を選択</option>{sites.filter((s) => s.shipperId === newShipperId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)} className={inputClass}><option value="">エリアを選択</option>{areas.filter((a) => a.siteId === newSiteId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="名前(任意)" className={inputClass} />
          <button onClick={createWorkflow} className={actionButtonClass}><Plus className="w-4 h-4 inline mr-1" />作成</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-4 min-h-0">
        <div className={`${cardClass} min-h-[440px] overflow-hidden`}>
          <div className="text-[13px] font-semibold mb-3">ワークフロー一覧 ({filteredWorkflows.length})</div>
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full min-w-[340px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`py-2 text-left text-[12px] ${c.textMuted}`}>名称</th>
                  <th className={`py-2 text-right text-[12px] ${c.textMuted}`}>工程</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkflows.map((wf) => {
                  const active = wf.id === selectedWorkflowId;
                  return (
                    <tr key={wf.id} onClick={() => setSelectedWorkflowId(wf.id)} className={`cursor-pointer border-b ${c.borderCard} ${active ? "bg-cyan-500/10" : ""}`}>
                      <td className="py-2 pr-2">
                        <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{wf.name}</div>
                        <div className={`text-[11px] ${c.textMuted}`}>{shipperMap.get(wf.shipperId)?.name ?? "-"}</div>
                      </td>
                      <td className={`py-2 text-right text-[12px] ${c.textSecondary}`}>{wf.steps.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${cardClass} min-h-[440px]`}>
          {!selectedWorkflow && <div className={`h-full flex items-center justify-center ${c.textSecondary}`}>ワークフローを選択してください</div>}

          {selectedWorkflow && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className={`${c.textPrimary} font-bold text-lg`}>{selectedWorkflow.name}</div>
                  <div className={`text-[12px] ${c.textSecondary} mt-1`}>{shipperMap.get(selectedWorkflow.shipperId)?.name ?? "-"} / {siteMap.get(selectedWorkflow.siteId)?.name ?? "-"} / {areaMap.get(selectedWorkflow.areaId)?.name ?? "-"}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => addStep(selectedWorkflow.id)} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500 transition-all"><Plus className="w-4 h-4 inline mr-1" />工程追加</button>
                  <button onClick={() => deleteWorkflow(selectedWorkflow.id)} className="px-3 py-2 rounded-lg border border-rose-500 text-rose-500 text-[13px] hover:bg-rose-500/10 transition-all"><Trash2 className="w-4 h-4 inline mr-1" />削除</button>
                </div>
              </div>

              <div className="overflow-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className={`border-b ${c.border}`}>
                      <th className={`px-2 py-2 text-left text-[12px] ${c.textMuted}`}>#</th>
                      <th className={`px-2 py-2 text-left text-[12px] ${c.textMuted}`}>工程</th>
                      <th className={`px-2 py-2 text-left text-[12px] ${c.textMuted}`}>人数</th>
                      <th className={`px-2 py-2 text-left text-[12px] ${c.textMuted}`}>UPH</th>
                      <th className={`px-2 py-2 text-left text-[12px] ${c.textMuted}`}>資格</th>
                      <th className={`px-2 py-2 text-left text-[12px] ${c.textMuted}`}>スキル</th>
                      <th className={`px-2 py-2 text-right text-[12px] ${c.textMuted}`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedWorkflow.steps.map((step, index) => (
                      <tr key={step.id} className={`border-b ${c.borderCard}`}>
                        <td className={`px-2 py-2 text-[12px] ${c.textSecondary}`}>{index + 1}</td>
                        <td className="px-2 py-2">
                          <select value={step.processId} onChange={(e) => {
                            const process = processMap.get(e.target.value);
                            updateStep(selectedWorkflow.id, step.id, (src) => ({
                              ...src,
                              processId: e.target.value,
                              requiredQualificationIds: process?.defaultQualificationIds ?? src.requiredQualificationIds,
                              requiredSkillIds: process?.defaultSkillIds ?? src.requiredSkillIds,
                              standardHeadcount: process?.defaultHeadcount ?? src.standardHeadcount,
                              uph: process?.defaultUph ?? src.uph,
                            }));
                          }} className={`${inputClass} w-[180px]`}>
                            {processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2"><input type="number" value={step.standardHeadcount} onChange={(e) => updateStep(selectedWorkflow.id, step.id, (src) => ({ ...src, standardHeadcount: Number(e.target.value) || 1 }))} className={`${inputClass} w-[100px]`} /></td>
                        <td className="px-2 py-2"><input type="number" value={step.uph} onChange={(e) => updateStep(selectedWorkflow.id, step.id, (src) => ({ ...src, uph: Number(e.target.value) || 0 }))} className={`${inputClass} w-[100px]`} /></td>
                        <td className="px-2 py-2"><MultiSelectChips options={qualifications} selectedIds={step.requiredQualificationIds} onChange={(values) => updateStep(selectedWorkflow.id, step.id, (src) => ({ ...src, requiredQualificationIds: values }))} placeholder="資格を選択" /></td>
                        <td className="px-2 py-2"><MultiSelectChips options={skills} selectedIds={step.requiredSkillIds} onChange={(values) => updateStep(selectedWorkflow.id, step.id, (src) => ({ ...src, requiredSkillIds: values }))} placeholder="スキルを選択" /></td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => moveStep(selectedWorkflow.id, step.id, "up")} className={`p-2 rounded-lg border ${c.border}`} disabled={index === 0}><ArrowUp className="w-4 h-4" /></button>
                            <button onClick={() => moveStep(selectedWorkflow.id, step.id, "down")} className={`p-2 rounded-lg border ${c.border}`} disabled={index === selectedWorkflow.steps.length - 1}><ArrowDown className="w-4 h-4" /></button>
                            <button onClick={() => removeStep(selectedWorkflow.id, step.id)} className="p-2 rounded-lg border border-rose-500 text-rose-500"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={`flex items-center text-[12px] ${c.textMuted}`}><Save className="w-3.5 h-3.5 mr-1" />変更は自動保存</div>
              {selectedWorkflow.steps.length === 0 && <div className={`text-[13px] ${c.textSecondary} py-6 text-center`}>工程が未登録です</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
