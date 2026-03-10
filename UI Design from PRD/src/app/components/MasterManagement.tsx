import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Brain,
  Building2,
  ChevronDown,
  Factory,
  Filter,
  MapPinned,
  Network,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import { useMasterData } from "./MasterDataContext";
import type { MasterStatus } from "./masterStore";

type MasterTab = "shipper" | "site" | "area" | "qualification" | "skill" | "dispatchCompany" | "process";

const tabItems: Array<{ id: MasterTab; label: string; icon: typeof Building2 }> = [
  { id: "shipper", label: "荷主管理", icon: Building2 },
  { id: "site", label: "拠点管理", icon: Factory },
  { id: "area", label: "エリア管理", icon: MapPinned },
  { id: "qualification", label: "資格管理", icon: BadgeCheck },
  { id: "skill", label: "スキル管理", icon: Brain },
  { id: "dispatchCompany", label: "派遣会社管理", icon: Building2 },
  { id: "process", label: "工程管理", icon: Network },
];

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.filter((option) => selectedIds.includes(option.id));
  const visibleSelected = selected.slice(0, 2);
  const hiddenCount = Math.max(selected.length - visibleSelected.length, 0);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`w-full min-h-[40px] rounded-lg border px-3 py-2 text-left text-[12px] ${c.borderCard} ${c.bgSurface}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {selected.length === 0 ? (
              <span className={c.textMuted}>{placeholder}</span>
            ) : (
              <>
                {visibleSelected.map((option) => (
                  <span
                    key={option.id}
                    className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] ${c.borderCard} ${c.bgCardHover} ${c.textSecondary}`}
                  >
                    <span className="truncate">{option.name}</span>
                  </span>
                ))}
                {hiddenCount > 0 && (
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${c.borderCard} ${c.bgCardHover} ${c.textMuted}`}>
                    +{hiddenCount}
                  </span>
                )}
              </>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 ${c.textMuted} transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className={`absolute left-0 top-[44px] z-20 w-[300px] rounded-lg border ${c.border} ${c.bgCard} p-2 shadow-xl`}>
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {options.length === 0 ? (
              <div className={`px-2 py-3 text-[12px] ${c.textMuted}`}>候補がありません</div>
            ) : (
              options.map((option) => {
                const active = selectedIds.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggle(option.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] ${
                      active ? "bg-cyan-500/15 text-cyan-300" : `${c.textSecondary} ${c.bgCardHover}`
                    }`}
                  >
                    <span>{option.name}</span>
                    {active && <span className="text-[11px]">選択中</span>}
                  </button>
                );
              })
            )}
          </div>
          <div className={`mt-2 flex items-center justify-between gap-2 border-t pt-2 ${c.borderCard}`}>
            <div className={`text-[11px] ${c.textMuted}`}>{selected.length}件選択中</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/10"
              >
                <X className="h-3.5 w-3.5" />
                クリア
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`rounded-md px-2 py-1 text-[11px] ${c.textSecondary} ${c.bgCardHover}`}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MasterManagement() {
  const c = useThemeColors();
  const {
    shippers,
    setShippers,
    sites,
    setSites,
    areas,
    setAreas,
    qualifications,
    setQualifications,
    skills,
    setSkills,
    dispatchCompanies,
    setDispatchCompanies,
    processes,
    setProcesses,
    workflows,
    setWorkflows,
    resetMasterData,
  } = useMasterData();

  const [activeTab, setActiveTab] = useState<MasterTab>("shipper");
  const [search, setSearch] = useState("");
  const [shipperStatusFilter, setShipperStatusFilter] = useState<"all" | MasterStatus>("all");
  const [siteShipperFilter, setSiteShipperFilter] = useState("all");
  const [areaSiteFilter, setAreaSiteFilter] = useState("all");
  const [dispatchCompanyStatusFilter, setDispatchCompanyStatusFilter] = useState<"all" | MasterStatus>("all");

  const [newShipperName, setNewShipperName] = useState("");
  const [newShipperStatus, setNewShipperStatus] = useState<MasterStatus>("active");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteShipperId, setNewSiteShipperId] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaDescription, setNewAreaDescription] = useState("");
  const [newAreaSiteId, setNewAreaSiteId] = useState("");
  const [newQualificationName, setNewQualificationName] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [newDispatchCompanyName, setNewDispatchCompanyName] = useState("");
  const [newDispatchCompanyContact, setNewDispatchCompanyContact] = useState("");
  const [newDispatchCompanyPhone, setNewDispatchCompanyPhone] = useState("");
  const [newDispatchCompanyUnitPrice, setNewDispatchCompanyUnitPrice] = useState("1200");
  const [newDispatchCompanyStatus, setNewDispatchCompanyStatus] = useState<MasterStatus>("active");
  const [newProcessName, setNewProcessName] = useState("");
  const [newProcessDescription, setNewProcessDescription] = useState("");

  const [newProcessUph, setNewProcessUph] = useState("100");
  const [newProcessQualificationIds, setNewProcessQualificationIds] = useState<string[]>([]);
  const [newProcessSkillIds, setNewProcessSkillIds] = useState<string[]>([]);

  const shipperMap = useMemo(() => new Map(shippers.map((x) => [x.id, x])), [shippers]);
  const siteMap = useMemo(() => new Map(sites.map((x) => [x.id, x])), [sites]);
  const qualificationMap = useMemo(() => new Map(qualifications.map((x) => [x.id, x])), [qualifications]);
  const skillMap = useMemo(() => new Map(skills.map((x) => [x.id, x])), [skills]);

  const filteredShippers = shippers.filter((x) => {
    if (shipperStatusFilter !== "all" && x.status !== shipperStatusFilter) return false;
    return x.name.toLowerCase().includes(search.toLowerCase());
  });

  const filteredSites = sites.filter((x) => {
    if (siteShipperFilter !== "all" && x.shipperId !== siteShipperFilter) return false;
    const haystack = `${x.name} ${x.address} ${shipperMap.get(x.shipperId)?.name ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const filteredAreas = areas.filter((x) => {
    if (areaSiteFilter !== "all" && x.siteId !== areaSiteFilter) return false;
    const haystack = `${x.name} ${x.description} ${siteMap.get(x.siteId)?.name ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const filteredQualifications = qualifications.filter((x) => x.name.toLowerCase().includes(search.toLowerCase()));
  const filteredSkills = skills.filter((x) => x.name.toLowerCase().includes(search.toLowerCase()));
  const filteredDispatchCompanies = dispatchCompanies.filter((x) => {
    if (dispatchCompanyStatusFilter !== "all" && x.status !== dispatchCompanyStatusFilter) return false;
    return `${x.name} ${x.contactName} ${x.phone}`.toLowerCase().includes(search.toLowerCase());
  });

  const filteredProcesses = processes.filter((x) => {
    const q = x.defaultQualificationIds.map((id) => qualificationMap.get(id)?.name ?? "").join(" ");
    const s = x.defaultSkillIds.map((id) => skillMap.get(id)?.name ?? "").join(" ");
    return `${x.name} ${x.description} ${q} ${s}`.toLowerCase().includes(search.toLowerCase());
  });

  const addShipper = () => {
    if (!newShipperName.trim()) return;
    setShippers((prev) => [...prev, { id: makeId("shipper"), name: newShipperName.trim(), status: newShipperStatus }]);
    setNewShipperName("");
  };

  const deleteShipper = (shipperId: string) => {
    const relatedSiteIds = sites.filter((x) => x.shipperId === shipperId).map((x) => x.id);
    setShippers((prev) => prev.filter((x) => x.id !== shipperId));
    setSites((prev) => prev.filter((x) => x.shipperId !== shipperId));
    setAreas((prev) => prev.filter((x) => !relatedSiteIds.includes(x.siteId)));
    setWorkflows((prev) => prev.filter((x) => x.shipperId !== shipperId));
  };

  const addSite = () => {
    if (!newSiteName.trim() || !newSiteShipperId) return;
    setSites((prev) => [...prev, { id: makeId("site"), shipperId: newSiteShipperId, name: newSiteName.trim(), address: newSiteAddress.trim() }]);
    setNewSiteName("");
    setNewSiteAddress("");
  };

  const deleteSite = (siteId: string) => {
    setSites((prev) => prev.filter((x) => x.id !== siteId));
    setAreas((prev) => prev.filter((x) => x.siteId !== siteId));
    setWorkflows((prev) => prev.filter((x) => x.siteId !== siteId));
  };

  const addArea = () => {
    if (!newAreaName.trim() || !newAreaSiteId) return;
    setAreas((prev) => [...prev, { id: makeId("area"), siteId: newAreaSiteId, name: newAreaName.trim(), description: newAreaDescription.trim() }]);
    setNewAreaName("");
    setNewAreaDescription("");
  };

  const deleteArea = (areaId: string) => {
    setAreas((prev) => prev.filter((x) => x.id !== areaId));
    setWorkflows((prev) => prev.filter((x) => x.areaId !== areaId));
  };

  const addQualification = () => {
    if (!newQualificationName.trim()) return;
    setQualifications((prev) => [...prev, { id: makeId("qual"), name: newQualificationName.trim() }]);
    setNewQualificationName("");
  };

  const addSkill = () => {
    if (!newSkillName.trim()) return;
    setSkills((prev) => [...prev, { id: makeId("skill"), name: newSkillName.trim() }]);
    setNewSkillName("");
  };

  const addDispatchCompany = () => {
    if (!newDispatchCompanyName.trim()) return;
    setDispatchCompanies((prev) => [
      ...prev,
      {
        id: makeId("dispatch"),
        name: newDispatchCompanyName.trim(),
        contactName: newDispatchCompanyContact.trim(),
        phone: newDispatchCompanyPhone.trim(),
        unitPrice: Number(newDispatchCompanyUnitPrice) || 0,
        status: newDispatchCompanyStatus,
      },
    ]);
    setNewDispatchCompanyName("");
    setNewDispatchCompanyContact("");
    setNewDispatchCompanyPhone("");
    setNewDispatchCompanyUnitPrice("1200");
    setNewDispatchCompanyStatus("active");
  };

  const deleteQualification = (qualificationId: string) => {
    setQualifications((prev) => prev.filter((x) => x.id !== qualificationId));
    setProcesses((prev) => prev.map((p) => ({ ...p, defaultQualificationIds: p.defaultQualificationIds.filter((id) => id !== qualificationId) })));
    setWorkflows((prev) => prev.map((w) => ({
      ...w,
      steps: w.steps.map((s) => ({ ...s, requiredQualificationIds: s.requiredQualificationIds.filter((id) => id !== qualificationId) })),
    })));
  };

  const deleteSkill = (skillId: string) => {
    setSkills((prev) => prev.filter((x) => x.id !== skillId));
    setProcesses((prev) => prev.map((p) => ({ ...p, defaultSkillIds: p.defaultSkillIds.filter((id) => id !== skillId) })));
    setWorkflows((prev) => prev.map((w) => ({
      ...w,
      steps: w.steps.map((s) => ({ ...s, requiredSkillIds: s.requiredSkillIds.filter((id) => id !== skillId) })),
    })));
  };

  const deleteDispatchCompany = (dispatchCompanyId: string) => {
    setDispatchCompanies((prev) => prev.filter((x) => x.id !== dispatchCompanyId));
  };

  const addProcess = () => {
    if (!newProcessName.trim()) return;
    setProcesses((prev) => [...prev, {
      id: makeId("process"),
      name: newProcessName.trim(),
      description: newProcessDescription.trim(),
      defaultQualificationIds: newProcessQualificationIds,
      defaultSkillIds: newProcessSkillIds,
      defaultHeadcount: 1,
      defaultUph: Number(newProcessUph) || 0,
    }]);
    setNewProcessName("");
    setNewProcessDescription("");
    setNewProcessQualificationIds([]);
    setNewProcessSkillIds([]);
  };

  const deleteProcess = (processId: string) => {
    setProcesses((prev) => prev.filter((x) => x.id !== processId));
    setWorkflows((prev) => prev.map((w) => ({ ...w, steps: w.steps.filter((s) => s.processId !== processId) })));
  };

  const cardClass = `${c.bgCard} border ${c.border} rounded-xl`;
  const inputClass = `${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2.5 text-[13px] ${c.textPrimary} placeholder:${c.textDimmed} focus:border-cyan-500/50 outline-none`;
  const actionButtonClass = "h-[40px] px-4 rounded-lg bg-cyan-600 text-white text-[13px] font-semibold hover:bg-cyan-500 transition-all";
  const currentCount =
    activeTab === "shipper"
      ? filteredShippers.length
      : activeTab === "site"
        ? filteredSites.length
        : activeTab === "area"
          ? filteredAreas.length
          : activeTab === "qualification"
            ? filteredQualifications.length
            : activeTab === "skill"
              ? filteredSkills.length
              : activeTab === "dispatchCompany"
                ? filteredDispatchCompanies.length
              : filteredProcesses.length;

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <button onClick={resetMasterData} className={`h-[40px] flex items-center gap-2 px-4 rounded-lg border ${c.border} ${c.bgSurface} ${c.textSecondary} text-[13px] hover:opacity-80 transition-all`}>
          <RefreshCcw className="w-4 h-4" />初期値へリセット
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`h-[38px] px-4 rounded-lg flex items-center gap-2 text-[13px] font-semibold transition-all ${active ? "bg-cyan-600 text-white" : `${c.bgSurface} border ${c.borderCard} ${c.textSecondary}`}`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      <div className={`${cardClass} p-4`}>
        <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-center">
          <div className={`flex items-center gap-2 h-[40px] px-3 rounded-lg border ${c.borderCard} ${c.bgSurface}`}>
            <Search className={`w-4 h-4 ${c.textMuted}`} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="名称・説明で検索" className={`w-full bg-transparent text-[13px] ${c.textPrimary} outline-none`} />
          </div>
          {activeTab === "shipper" && (
            <select value={shipperStatusFilter} onChange={(e) => setShipperStatusFilter(e.target.value as "all" | MasterStatus)} className={inputClass}>
              <option value="all">ステータス: すべて</option>
              <option value="active">有効</option>
              <option value="inactive">無効</option>
            </select>
          )}
          {activeTab === "site" && (
            <select value={siteShipperFilter} onChange={(e) => setSiteShipperFilter(e.target.value)} className={inputClass}>
              <option value="all">荷主: すべて</option>
              {shippers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {activeTab === "area" && (
            <select value={areaSiteFilter} onChange={(e) => setAreaSiteFilter(e.target.value)} className={inputClass}>
              <option value="all">拠点: すべて</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {activeTab === "dispatchCompany" && (
            <select value={dispatchCompanyStatusFilter} onChange={(e) => setDispatchCompanyStatusFilter(e.target.value as "all" | MasterStatus)} className={inputClass}>
              <option value="all">ステータス: すべて</option>
              <option value="active">有効</option>
              <option value="inactive">無効</option>
            </select>
          )}
          <div className={`h-[40px] px-3 rounded-lg border ${c.borderCard} ${c.bgSurface} ${c.textMuted} text-[12px] flex items-center gap-2 justify-center`}>
            <Filter className="w-3.5 h-3.5" />表示 {currentCount} 件
          </div>
        </div>
      </div>

      {activeTab === "shipper" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>荷主名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>ステータス</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2"><input value={newShipperName} onChange={(e) => setNewShipperName(e.target.value)} placeholder="新規荷主名" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2 w-[220px]"><select value={newShipperStatus} onChange={(e) => setNewShipperStatus(e.target.value as MasterStatus)} className={`${inputClass} w-full`}><option value="active">有効</option><option value="inactive">無効</option></select></td>
                  <td className="px-4 py-2 text-right"><button onClick={addShipper} className={actionButtonClass}><Plus className="w-4 h-4 inline mr-1" />追加</button></td>
                </tr>
                {filteredShippers.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2"><input value={item.name} onChange={(e) => setShippers((prev) => prev.map((x) => x.id === item.id ? { ...x, name: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2 w-[220px]"><select value={item.status} onChange={(e) => setShippers((prev) => prev.map((x) => x.id === item.id ? { ...x, status: e.target.value as MasterStatus } : x))} className={`${inputClass} w-full`}><option value="active">有効</option><option value="inactive">無効</option></select></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => deleteShipper(item.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "site" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>荷主</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>拠点名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>住所</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2 w-[240px]"><select value={newSiteShipperId} onChange={(e) => setNewSiteShipperId(e.target.value)} className={`${inputClass} w-full`}><option value="">荷主を選択</option>{shippers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                  <td className="px-4 py-2"><input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder="新規拠点名" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2"><input value={newSiteAddress} onChange={(e) => setNewSiteAddress(e.target.value)} placeholder="住所" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2 text-right"><button onClick={addSite} className={actionButtonClass}><Plus className="w-4 h-4 inline mr-1" />追加</button></td>
                </tr>
                {filteredSites.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2 w-[240px]"><select value={item.shipperId} onChange={(e) => setSites((prev) => prev.map((x) => x.id === item.id ? { ...x, shipperId: e.target.value } : x))} className={`${inputClass} w-full`}>{shippers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                    <td className="px-4 py-2"><input value={item.name} onChange={(e) => setSites((prev) => prev.map((x) => x.id === item.id ? { ...x, name: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2"><input value={item.address} onChange={(e) => setSites((prev) => prev.map((x) => x.id === item.id ? { ...x, address: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => deleteSite(item.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "area" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>拠点</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>エリア名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>説明</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2 w-[240px]"><select value={newAreaSiteId} onChange={(e) => setNewAreaSiteId(e.target.value)} className={`${inputClass} w-full`}><option value="">拠点を選択</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                  <td className="px-4 py-2"><input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} placeholder="新規エリア名" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2"><input value={newAreaDescription} onChange={(e) => setNewAreaDescription(e.target.value)} placeholder="説明" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2 text-right"><button onClick={addArea} className={actionButtonClass}><Plus className="w-4 h-4 inline mr-1" />追加</button></td>
                </tr>
                {filteredAreas.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2 w-[240px]"><select value={item.siteId} onChange={(e) => setAreas((prev) => prev.map((x) => x.id === item.id ? { ...x, siteId: e.target.value } : x))} className={`${inputClass} w-full`}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                    <td className="px-4 py-2"><input value={item.name} onChange={(e) => setAreas((prev) => prev.map((x) => x.id === item.id ? { ...x, name: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2"><input value={item.description} onChange={(e) => setAreas((prev) => prev.map((x) => x.id === item.id ? { ...x, description: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => deleteArea(item.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "qualification" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>資格名</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2"><input value={newQualificationName} onChange={(e) => setNewQualificationName(e.target.value)} placeholder="新規資格名" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2 text-right"><button onClick={addQualification} className={actionButtonClass}><Plus className="w-4 h-4 inline mr-1" />追加</button></td>
                </tr>
                {filteredQualifications.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2"><input value={item.name} onChange={(e) => setQualifications((prev) => prev.map((x) => x.id === item.id ? { ...x, name: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => deleteQualification(item.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "skill" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>スキル名</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2"><input value={newSkillName} onChange={(e) => setNewSkillName(e.target.value)} placeholder="新規スキル名" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2 text-right"><button onClick={addSkill} className={actionButtonClass}><Plus className="w-4 h-4 inline mr-1" />追加</button></td>
                </tr>
                {filteredSkills.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2"><input value={item.name} onChange={(e) => setSkills((prev) => prev.map((x) => x.id === item.id ? { ...x, name: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => deleteSkill(item.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "dispatchCompany" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>派遣会社名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>担当者</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>連絡先</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>単価</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>ステータス</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2"><input value={newDispatchCompanyName} onChange={(e) => setNewDispatchCompanyName(e.target.value)} placeholder="新規派遣会社名" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2"><input value={newDispatchCompanyContact} onChange={(e) => setNewDispatchCompanyContact(e.target.value)} placeholder="担当者名" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2"><input value={newDispatchCompanyPhone} onChange={(e) => setNewDispatchCompanyPhone(e.target.value)} placeholder="電話番号" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2 w-[140px]"><input value={newDispatchCompanyUnitPrice} onChange={(e) => setNewDispatchCompanyUnitPrice(e.target.value)} type="number" placeholder="1200" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2 w-[180px]"><select value={newDispatchCompanyStatus} onChange={(e) => setNewDispatchCompanyStatus(e.target.value as MasterStatus)} className={`${inputClass} w-full`}><option value="active">有効</option><option value="inactive">無効</option></select></td>
                  <td className="px-4 py-2 text-right"><button onClick={addDispatchCompany} className={actionButtonClass}><Plus className="w-4 h-4 inline mr-1" />追加</button></td>
                </tr>
                {filteredDispatchCompanies.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2"><input value={item.name} onChange={(e) => setDispatchCompanies((prev) => prev.map((x) => x.id === item.id ? { ...x, name: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2"><input value={item.contactName} onChange={(e) => setDispatchCompanies((prev) => prev.map((x) => x.id === item.id ? { ...x, contactName: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2"><input value={item.phone} onChange={(e) => setDispatchCompanies((prev) => prev.map((x) => x.id === item.id ? { ...x, phone: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2 w-[140px]"><input value={item.unitPrice} onChange={(e) => setDispatchCompanies((prev) => prev.map((x) => x.id === item.id ? { ...x, unitPrice: Number(e.target.value) || 0 } : x))} type="number" className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2 w-[180px]"><select value={item.status} onChange={(e) => setDispatchCompanies((prev) => prev.map((x) => x.id === item.id ? { ...x, status: e.target.value as MasterStatus } : x))} className={`${inputClass} w-full`}><option value="active">有効</option><option value="inactive">無効</option></select></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => deleteDispatchCompany(item.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "process" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>工程名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>説明</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>所要資格</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>所要スキル</th>
                  
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>標準UPH</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2"><input value={newProcessName} onChange={(e) => setNewProcessName(e.target.value)} placeholder="新規工程名" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2"><input value={newProcessDescription} onChange={(e) => setNewProcessDescription(e.target.value)} placeholder="説明" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2"><MultiSelectChips options={qualifications} selectedIds={newProcessQualificationIds} onChange={setNewProcessQualificationIds} placeholder="所要資格を選択" /></td>
                  <td className="px-4 py-2"><MultiSelectChips options={skills} selectedIds={newProcessSkillIds} onChange={setNewProcessSkillIds} placeholder="所要スキルを選択" /></td>
                  
                  <td className="px-4 py-2 w-[110px]"><input value={newProcessUph} onChange={(e) => setNewProcessUph(e.target.value)} type="number" className={`${inputClass} w-full`} /></td>
                  <td className="px-4 py-2 text-right"><button onClick={addProcess} className={actionButtonClass}><Plus className="w-4 h-4 inline mr-1" />追加</button></td>
                </tr>
                {filteredProcesses.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2"><input value={item.name} onChange={(e) => setProcesses((prev) => prev.map((x) => x.id === item.id ? { ...x, name: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2"><input value={item.description} onChange={(e) => setProcesses((prev) => prev.map((x) => x.id === item.id ? { ...x, description: e.target.value } : x))} className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2"><MultiSelectChips options={qualifications} selectedIds={item.defaultQualificationIds} onChange={(values) => setProcesses((prev) => prev.map((x) => x.id === item.id ? { ...x, defaultQualificationIds: values } : x))} placeholder="所要資格を選択" /></td>
                    <td className="px-4 py-2"><MultiSelectChips options={skills} selectedIds={item.defaultSkillIds} onChange={(values) => setProcesses((prev) => prev.map((x) => x.id === item.id ? { ...x, defaultSkillIds: values } : x))} placeholder="所要スキルを選択" /></td>
                    
                    <td className="px-4 py-2 w-[110px]"><input value={item.defaultUph} onChange={(e) => setProcesses((prev) => prev.map((x) => x.id === item.id ? { ...x, defaultUph: Number(e.target.value) || 0 } : x))} type="number" className={`${inputClass} w-full`} /></td>
                    <td className="px-4 py-2 text-right"><button onClick={() => deleteProcess(item.id)} className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={`${cardClass} p-3 text-[12px] ${c.textSecondary}`}>ワークフロー定義数: {workflows.length} 件</div>
    </div>
  );
}
