import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Brain,
  Building2,
  ChevronDown,
  Factory,
  Filter,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import { useMasterData } from "./MasterDataContext";
import type { MasterStatus } from "./masterStore";
import {
  DEFAULT_QUALIFICATION_ICON_KEY,
  DEFAULT_SKILL_ICON_KEY,
  getCapabilityToneClasses,
  getMasterIconOption,
  masterIconOptions,
  type CapabilityTone,
  type MasterIconKey,
} from "./masterIconOptions";

type MasterTab = "shipper" | "site" | "qualification" | "skill" | "dispatchCompany";

const tabItems: Array<{ id: MasterTab; label: string; icon: typeof Building2 }> = [
  { id: "shipper", label: "荷主管理", icon: Building2 },
  { id: "site", label: "拠点管理", icon: Factory },
  { id: "qualification", label: "資格管理", icon: BadgeCheck },
  { id: "skill", label: "スキル管理", icon: Brain },
  { id: "dispatchCompany", label: "派遣会社管理", icon: Building2 },
];

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

function IconPicker({
  value,
  onChange,
  fallback,
  tone,
}: {
  value: MasterIconKey;
  onChange: (key: MasterIconKey) => void;
  fallback: MasterIconKey;
  tone: CapabilityTone;
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = getMasterIconOption(value, fallback);
  const SelectedIcon = selected.icon;
  const toneClasses = getCapabilityToneClasses(tone);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="アイコンを選択"
        className={`flex h-[40px] w-full items-center justify-between gap-2 rounded-lg border px-3 ${c.borderCard} ${c.bgSurface}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${toneClasses.surfaceClass}`}>
            <SelectedIcon className={`h-4 w-4 ${toneClasses.accentClass}`} />
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 ${c.textMuted} transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className={`absolute left-0 top-[44px] z-20 w-[312px] rounded-xl border ${c.border} ${c.bgCard} p-3 shadow-xl`}>
          <div className="grid grid-cols-4 gap-2">
            {masterIconOptions.map((option) => {
              const Icon = option.icon;
              const active = option.key === selected.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  title={option.label}
                  aria-label={option.label}
                  onClick={() => {
                    onChange(option.key);
                    setOpen(false);
                  }}
                  className={`flex h-12 items-center justify-center rounded-xl border transition-all ${
                    active
                      ? toneClasses.activeClass
                      : `${c.borderCard} ${c.bgCardHover}`
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${toneClasses.surfaceClass}`}>
                    <Icon className={`h-4 w-4 ${toneClasses.accentClass}`} />
                  </span>
                </button>
              );
            })}
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
  const [dispatchCompanyStatusFilter, setDispatchCompanyStatusFilter] = useState<"all" | MasterStatus>("all");

  const [newShipperName, setNewShipperName] = useState("");
  const [newShipperStatus, setNewShipperStatus] = useState<MasterStatus>("active");
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteShipperId, setNewSiteShipperId] = useState("");
  const [newQualificationName, setNewQualificationName] = useState("");
  const [newQualificationIconKey, setNewQualificationIconKey] = useState<MasterIconKey>(DEFAULT_QUALIFICATION_ICON_KEY);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillIconKey, setNewSkillIconKey] = useState<MasterIconKey>(DEFAULT_SKILL_ICON_KEY);
  const [newDispatchCompanyName, setNewDispatchCompanyName] = useState("");
  const [newDispatchCompanyContact, setNewDispatchCompanyContact] = useState("");
  const [newDispatchCompanyPhone, setNewDispatchCompanyPhone] = useState("");
  const [newDispatchCompanyUnitPrice, setNewDispatchCompanyUnitPrice] = useState("1200");
  const [newDispatchCompanyStatus, setNewDispatchCompanyStatus] = useState<MasterStatus>("active");

  const shipperMap = useMemo(() => new Map(shippers.map((x) => [x.id, x])), [shippers]);

  const filteredShippers = shippers.filter((x) => {
    if (shipperStatusFilter !== "all" && x.status !== shipperStatusFilter) return false;
    return x.name.toLowerCase().includes(search.toLowerCase());
  });

  const filteredSites = sites.filter((x) => {
    if (siteShipperFilter !== "all" && x.shipperId !== siteShipperFilter) return false;
    const haystack = `${x.name} ${x.address} ${shipperMap.get(x.shipperId)?.name ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const filteredQualifications = qualifications.filter((x) => x.name.toLowerCase().includes(search.toLowerCase()));
  const filteredSkills = skills.filter((x) => x.name.toLowerCase().includes(search.toLowerCase()));
  const filteredDispatchCompanies = dispatchCompanies.filter((x) => {
    if (dispatchCompanyStatusFilter !== "all" && x.status !== dispatchCompanyStatusFilter) return false;
    return `${x.name} ${x.contactName} ${x.phone}`.toLowerCase().includes(search.toLowerCase());
  });

  const addShipper = () => {
    if (!newShipperName.trim()) return;
    setShippers((prev) => [...prev, { id: makeId("shipper"), name: newShipperName.trim(), status: newShipperStatus }]);
    setNewShipperName("");
  };

  const deleteShipper = (shipperId: string) => {
    setShippers((prev) => prev.filter((x) => x.id !== shipperId));
    setSites((prev) => prev.filter((x) => x.shipperId !== shipperId));
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
    setWorkflows((prev) => prev.filter((x) => x.siteId !== siteId));
  };

  const addQualification = () => {
    if (!newQualificationName.trim()) return;
    setQualifications((prev) => [
      ...prev,
      { id: makeId("qual"), name: newQualificationName.trim(), iconKey: newQualificationIconKey },
    ]);
    setNewQualificationName("");
    setNewQualificationIconKey(DEFAULT_QUALIFICATION_ICON_KEY);
  };

  const addSkill = () => {
    if (!newSkillName.trim()) return;
    setSkills((prev) => [
      ...prev,
      { id: makeId("skill"), name: newSkillName.trim(), iconKey: newSkillIconKey },
    ]);
    setNewSkillName("");
    setNewSkillIconKey(DEFAULT_SKILL_ICON_KEY);
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

  const cardClass = `${c.bgCard} border ${c.border} rounded-xl`;
  const inputClass = `${c.bgSurface} border ${c.borderCard} rounded-lg px-3 py-2.5 text-[13px] ${c.textPrimary} placeholder:${c.textDimmed} focus:border-cyan-500/50 outline-none`;
  const actionButtonClass = "h-[40px] px-4 rounded-lg bg-cyan-600 text-white text-[13px] font-semibold hover:bg-cyan-500 transition-all";
  const currentCount =
    activeTab === "shipper"
      ? filteredShippers.length
      : activeTab === "site"
        ? filteredSites.length
        : activeTab === "qualification"
            ? filteredQualifications.length
            : activeTab === "skill"
              ? filteredSkills.length
              : filteredDispatchCompanies.length;

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

      {activeTab === "qualification" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>アイコン</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>資格名</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2 w-[108px]">
                    <IconPicker
                      value={newQualificationIconKey}
                      onChange={setNewQualificationIconKey}
                      fallback={DEFAULT_QUALIFICATION_ICON_KEY}
                      tone="qualification"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={newQualificationName}
                      onChange={(e) => setNewQualificationName(e.target.value)}
                      placeholder="新規資格名"
                      className={`${inputClass} w-full`}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={addQualification} className={actionButtonClass}>
                      <Plus className="w-4 h-4 inline mr-1" />
                      追加
                    </button>
                  </td>
                </tr>
                {filteredQualifications.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2 w-[108px]">
                      <IconPicker
                        value={item.iconKey ?? DEFAULT_QUALIFICATION_ICON_KEY}
                        onChange={(iconKey) =>
                          setQualifications((prev) =>
                            prev.map((x) => (x.id === item.id ? { ...x, iconKey } : x)),
                          )
                        }
                        fallback={DEFAULT_QUALIFICATION_ICON_KEY}
                        tone="qualification"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={item.name}
                        onChange={(e) =>
                          setQualifications((prev) =>
                            prev.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        className={`${inputClass} w-full`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => deleteQualification(item.id)}
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {false && activeTab === "qualification" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
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
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>アイコン</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>スキル名</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr className={`border-b ${c.borderCard} ${c.bgSurface}`}>
                  <td className="px-4 py-2 w-[108px]">
                    <IconPicker
                      value={newSkillIconKey}
                      onChange={setNewSkillIconKey}
                      fallback={DEFAULT_SKILL_ICON_KEY}
                      tone="skill"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      placeholder="新規スキル名"
                      className={`${inputClass} w-full`}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={addSkill} className={actionButtonClass}>
                      <Plus className="w-4 h-4 inline mr-1" />
                      追加
                    </button>
                  </td>
                </tr>
                {filteredSkills.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2 w-[108px]">
                      <IconPicker
                        value={item.iconKey ?? DEFAULT_SKILL_ICON_KEY}
                        onChange={(iconKey) =>
                          setSkills((prev) =>
                            prev.map((x) => (x.id === item.id ? { ...x, iconKey } : x)),
                          )
                        }
                        fallback={DEFAULT_SKILL_ICON_KEY}
                        tone="skill"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={item.name}
                        onChange={(e) =>
                          setSkills((prev) =>
                            prev.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        className={`${inputClass} w-full`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => deleteSkill(item.id)}
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {false && activeTab === "skill" && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
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

      <div className={`${cardClass} p-3 text-[12px] ${c.textSecondary}`}>業務定義数: {workflows.length} 件</div>
    </div>
  );
}
