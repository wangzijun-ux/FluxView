import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Factory,
  HardDrive,
  Plus,
  Save,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { useNavigate, useParams } from "react-router";
import { useMasterData } from "./MasterDataContext";
import type { Shipper, SiteLayoutArea, SiteShipperRelation, SiteShipperRelationStatus } from "./masterStore";
import {
  createUuid,
  hasSiteShipperRelation,
  resolveSiteShipperRelationStatus,
  sortSiteShipperRelations,
} from "./siteShipperUtils";
import { useThemeColors } from "./ThemeContext";

type SiteDetailTab = "basic" | "shipper" | "equipment" | "settings";
type AddMode = "existing" | "new";
type EditableRelationStatus = "active" | "suspended";

type RelationDraft = {
  shipperName: string;
  shipperCode: string;
  shipperStatus: Shipper["status"];
  contractStartDate: string;
  contractEndDate: string;
  contactPerson: string;
  contactTel: string;
  contactEmail: string;
  dedicatedProcessIds: string[];
  status: EditableRelationStatus;
  notes: string;
};

const tabItems: Array<{ id: SiteDetailTab; label: string; icon: typeof Factory }> = [
  { id: "basic", label: "基本情報", icon: Factory },
  { id: "shipper", label: "荷主管理", icon: Users },
  { id: "equipment", label: "設備・レイアウト", icon: HardDrive },
  { id: "settings", label: "設定", icon: Settings2 },
];

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function toDisplayDate(value: string) {
  return value ? value.replaceAll("-", "/") : "-";
}

function getShipperInitials(name: string) {
  const trimmed = name.replace(/\s+/g, "");
  return Array.from(trimmed).slice(0, 2).join("").toUpperCase() || "??";
}

function getStatusMeta(status: SiteShipperRelationStatus) {
  if (status === "expired") {
    return {
      label: "期限切れ",
      badgeClass: "bg-rose-500/12 text-rose-500 border-rose-500/20",
      cardClass: "border-rose-500/30 bg-rose-500/5",
    };
  }

  if (status === "suspended") {
    return {
      label: "停止",
      badgeClass: "bg-slate-500/12 text-slate-500 border-slate-500/20",
      cardClass: "",
    };
  }

  return {
    label: "有効",
    badgeClass: "bg-emerald-500/12 text-emerald-500 border-emerald-500/20",
    cardClass: "",
  };
}

function createRelationDraft(relation: SiteShipperRelation, shipper: Shipper | null): RelationDraft {
  return {
    shipperName: shipper?.name ?? "",
    shipperCode: shipper?.code ?? "",
    shipperStatus: shipper?.status ?? "active",
    contractStartDate: relation.contractStartDate,
    contractEndDate: relation.contractEndDate,
    contactPerson: relation.contactPerson,
    contactTel: relation.contactTel,
    contactEmail: relation.contactEmail,
    dedicatedProcessIds: [...relation.dedicatedProcessIds],
    status: relation.status === "suspended" ? "suspended" : "active",
    notes: relation.notes,
  };
}

function buildDefaultRelation(siteId: string, shipper: Shipper): SiteShipperRelation {
  const now = new Date();
  return {
    id: createUuid(),
    siteId,
    shipperId: shipper.id,
    contractStartDate: toDateInput(now),
    contractEndDate: toDateInput(addYears(now, 1)),
    contactPerson: shipper.contactPerson ?? "",
    contactTel: "",
    contactEmail: "",
    dedicatedProcessIds: [],
    priceConfig: [],
    notes: shipper.notes ?? "",
    status: "active",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function SiteDetailPage() {
  const c = useThemeColors();
  const navigate = useNavigate();
  const params = useParams();
  const siteId = params.siteId ?? "";
  const syncFromRouteRef = useRef(false);

  const {
    sites,
    setSites,
    shippers,
    setShippers,
    siteShipperRelations,
    setSiteShipperRelations,
    processes,
    workflows,
    selectedSiteId,
    setSelectedSiteId,
  } = useMasterData();

  const site = useMemo(
    () => sites.find((currentSite) => currentSite.id === siteId) ?? null,
    [siteId, sites],
  );
  const shipperMap = useMemo(() => new Map(shippers.map((shipper) => [shipper.id, shipper])), [shippers]);
  const processMap = useMemo(() => new Map(processes.map((process) => [process.id, process])), [processes]);
  const siteRelations = useMemo(
    () => sortSiteShipperRelations(siteShipperRelations.filter((relation) => relation.siteId === siteId)),
    [siteId, siteShipperRelations],
  );
  const siteWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.siteId === siteId),
    [siteId, workflows],
  );

  const [activeTab, setActiveTab] = useState<SiteDetailTab>("shipper");
  const [basicDraft, setBasicDraft] = useState({ name: "", address: "" });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("existing");
  const [existingSearch, setExistingSearch] = useState("");
  const [selectedExistingShipperIds, setSelectedExistingShipperIds] = useState<string[]>([]);
  const [newShipperDraft, setNewShipperDraft] = useState({
    name: "",
    code: "",
    status: "active" as Shipper["status"],
    contactPerson: "",
    contactTel: "",
    contactEmail: "",
    notes: "",
  });
  const [editingRelationId, setEditingRelationId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RelationDraft | null>(null);
  const [confirmUnlinkRelationId, setConfirmUnlinkRelationId] = useState<string | null>(null);

  useEffect(() => {
    if (!site) return;
    setBasicDraft({ name: site.name, address: site.address });
  }, [site]);

  useEffect(() => {
    if (!siteId) return;

    if (!syncFromRouteRef.current) {
      syncFromRouteRef.current = true;
      if (siteId !== selectedSiteId) {
        setSelectedSiteId(siteId);
      }
      return;
    }

    if (selectedSiteId && selectedSiteId !== siteId) {
      navigate(`/master/sites/${selectedSiteId}`, { replace: true });
    }
  }, [navigate, selectedSiteId, setSelectedSiteId, siteId]);

  const filteredExistingShippers = useMemo(() => {
    const keyword = existingSearch.trim().toLowerCase();
    return shippers.filter((shipper) => {
      const bag = `${shipper.name} ${shipper.code ?? ""} ${shipper.contactPerson ?? ""}`.toLowerCase();
      return bag.includes(keyword);
    });
  }, [existingSearch, shippers]);

  const editingRelation = useMemo(
    () => siteShipperRelations.find((relation) => relation.id === editingRelationId) ?? null,
    [editingRelationId, siteShipperRelations],
  );
  const editingShipper = useMemo(
    () => (editingRelation ? shipperMap.get(editingRelation.shipperId) ?? null : null),
    [editingRelation, shipperMap],
  );

  const activeRelationCount = siteRelations.filter(
    (relation) => resolveSiteShipperRelationStatus(relation) === "active",
  ).length;
  const expiredRelationCount = siteRelations.filter(
    (relation) => resolveSiteShipperRelationStatus(relation) === "expired",
  ).length;
  const suspendedRelationCount = siteRelations.filter(
    (relation) => resolveSiteShipperRelationStatus(relation) === "suspended",
  ).length;

  const inputClass = `${c.bgSurface} border ${c.borderCard} rounded-xl px-3 py-2.5 text-[13px] ${c.textPrimary} placeholder:${c.textDimmed} outline-none focus:border-cyan-500/50`;
  const readonlyInputClass = `w-full ${c.bgSurface} border ${c.borderCard} rounded-xl px-3 py-2.5 text-[13px] ${c.textSecondary}`;
  const surfaceClass = `${c.bgCard} border ${c.border} rounded-2xl`;
  const mutedSurfaceClass = `${c.bgSurface} border ${c.borderCard} rounded-2xl`;
  const sectionTitleClass = `flex items-center gap-2 text-[13px] font-semibold ${c.textPrimary}`;
  const fieldLabelClass = "mb-1.5 text-[12px] font-medium text-slate-500";

  if (!site) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-6">
        <div className={`${surfaceClass} max-w-[520px] p-8 text-center`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
            <Factory className="h-7 w-7" />
          </div>
          <div className={`mt-4 text-lg font-semibold ${c.textPrimary}`}>拠点が見つかりません</div>
          <div className={`mt-2 text-sm leading-6 ${c.textSecondary}`}>
            指定された拠点IDに対応するデータがありません。マスタ管理に戻って対象拠点を確認してください。
          </div>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => navigate("/master-management")}
              className="inline-flex h-[40px] items-center gap-2 rounded-xl bg-[#155DFC] px-4 text-[13px] font-semibold text-white transition hover:bg-[#0F4FE3]"
            >
              <ArrowLeft className="h-4 w-4" />
              マスタ管理へ戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  const siteLayoutAreas = site.layoutAreas ?? [];

  const updateSiteLayoutAreas = (updater: (current: SiteLayoutArea[]) => SiteLayoutArea[]) => {
    setSites((prev) =>
      prev.map((currentSite) =>
        currentSite.id === site.id
          ? {
              ...currentSite,
              layoutAreas: updater(currentSite.layoutAreas ?? []),
            }
          : currentSite,
      ),
    );
  };

  const addLayoutArea = () => {
    const nextIndex = siteLayoutAreas.length + 1;
    updateSiteLayoutAreas((current) => [
      ...current,
      {
        id: makeId(`${site.id}-area`),
        name: `新規エリア ${nextIndex}`,
        description: "",
      },
    ]);
  };

  const updateLayoutArea = (areaId: string, patch: Partial<SiteLayoutArea>) => {
    updateSiteLayoutAreas((current) =>
      current.map((area) => (area.id === areaId ? { ...area, ...patch } : area)),
    );
  };

  const removeLayoutArea = (areaId: string) => {
    updateSiteLayoutAreas((current) => current.filter((area) => area.id !== areaId));
  };

  const saveBasicInfo = () => {
    if (!basicDraft.name.trim()) return;

    setSites((prev) =>
      prev.map((currentSite) =>
        currentSite.id === site.id
          ? {
              ...currentSite,
              name: basicDraft.name.trim(),
              address: basicDraft.address.trim() || "住所未設定",
            }
          : currentSite,
      ),
    );
  };

  const openEditModal = (relation: SiteShipperRelation) => {
    setEditingRelationId(relation.id);
    setEditDraft(createRelationDraft(relation, shipperMap.get(relation.shipperId) ?? null));
  };

  const closeEditModal = () => {
    setEditingRelationId(null);
    setEditDraft(null);
    setConfirmUnlinkRelationId(null);
  };

  const saveRelation = () => {
    if (!editingRelation || !editDraft) return;
    const shipperName = editDraft.shipperName.trim();
    if (!shipperName) return;

    const normalizedRelationStatus = editDraft.shipperStatus === "inactive" ? "suspended" : "active";

    setShippers((prev) =>
      prev.map((shipper) =>
        shipper.id === editingRelation.shipperId
          ? {
              ...shipper,
              name: shipperName,
              code: editDraft.shipperCode.trim(),
              contactPerson: editDraft.contactPerson.trim(),
              notes: editDraft.notes.trim(),
              status: editDraft.shipperStatus,
            }
          : shipper,
      ),
    );

    setSiteShipperRelations((prev) =>
      prev.map((relation) =>
        relation.id === editingRelation.id
          ? {
              ...relation,
              contactPerson: editDraft.contactPerson.trim(),
              contactTel: editDraft.contactTel.trim(),
              contactEmail: editDraft.contactEmail.trim(),
              status: normalizedRelationStatus,
              notes: editDraft.notes.trim(),
              updatedAt: new Date().toISOString(),
            }
          : relation,
      ),
    );

    closeEditModal();
  };

  const unlinkRelation = () => {
    if (!confirmUnlinkRelationId) return;
    setSiteShipperRelations((prev) => prev.filter((relation) => relation.id !== confirmUnlinkRelationId));
    closeEditModal();
  };

  const linkSelectedExistingShippers = () => {
    if (selectedExistingShipperIds.length === 0) return;

    const nextRelations = selectedExistingShipperIds
      .map((shipperIdValue) => shipperMap.get(shipperIdValue))
      .filter((shipper): shipper is Shipper => Boolean(shipper))
      .map((shipper) => buildDefaultRelation(site.id, shipper));

    setSiteShipperRelations((prev) => [
      ...prev,
      ...nextRelations.filter((relation) => !hasSiteShipperRelation(site.id, relation.shipperId, prev)),
    ]);

    setSelectedExistingShipperIds([]);
    setExistingSearch("");
    setAddModalOpen(false);
  };

  const createAndLinkShipper = () => {
    if (!newShipperDraft.name.trim()) return;

    const newShipper: Shipper = {
      id: makeId("shipper"),
      name: newShipperDraft.name.trim(),
      code: newShipperDraft.code.trim(),
      contactPerson: newShipperDraft.contactPerson.trim(),
      notes: newShipperDraft.notes.trim(),
      status: newShipperDraft.status,
    };

    const newRelation = {
      ...buildDefaultRelation(site.id, newShipper),
      contactTel: newShipperDraft.contactTel.trim(),
      contactEmail: newShipperDraft.contactEmail.trim(),
    };

    setShippers((prev) => [...prev, newShipper]);
    setSiteShipperRelations((prev) => [...prev, newRelation]);
    setNewShipperDraft({ name: "", code: "", status: "active", contactPerson: "", contactTel: "", contactEmail: "", notes: "" });
    setAddModalOpen(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <section className={`${surfaceClass} p-5`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/master-management")}
              className={`mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              マスタ管理へ戻る
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
                <Factory className="h-7 w-7" />
              </div>
              <div>
                <div className={`text-[24px] font-semibold ${c.textPrimary}`}>{site.name}</div>
                <div className={`mt-1 text-sm ${c.textSecondary}`}>{site.address}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "関連荷主", value: siteRelations.length, tone: "text-cyan-500" },
              { label: "有効契約", value: activeRelationCount, tone: "text-emerald-500" },
              { label: "期限切れ", value: expiredRelationCount, tone: "text-rose-500" },
              { label: "業務定義", value: siteWorkflows.length, tone: "text-violet-500" },
            ].map((item) => (
              <div key={item.label} className={`${mutedSurfaceClass} min-w-[132px] px-4 py-3`}>
                <div className={`text-[12px] ${c.textMuted}`}>{item.label}</div>
                <div className={`mt-1 text-[22px] font-semibold ${item.tone}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex h-[40px] items-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition-all ${
                active ? "bg-[#155DFC] text-white" : `${c.bgSurface} border ${c.borderCard} ${c.textSecondary}`
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "basic" && (
        <section className={`${surfaceClass} p-5`}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section className={`${mutedSurfaceClass} p-5`}>
              <div className={sectionTitleClass}>
                <Building2 className="h-4 w-4 text-cyan-500" />
                <span>拠点基本情報</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className={fieldLabelClass}>拠点名</div>
                  <input value={basicDraft.name} onChange={(event) => setBasicDraft((prev) => ({ ...prev, name: event.target.value }))} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <div className={fieldLabelClass}>住所</div>
                  <textarea value={basicDraft.address} onChange={(event) => setBasicDraft((prev) => ({ ...prev, address: event.target.value }))} className={`${inputClass} min-h-[120px] w-full resize-y`} />
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button variant="contained" startIcon={<Save size={16} />} onClick={saveBasicInfo}>保存</Button>
              </div>
            </section>
            <section className={`${mutedSurfaceClass} p-5`}>
              <div className={sectionTitleClass}>
                <Factory className="h-4 w-4 text-cyan-500" />
                <span>概要</span>
              </div>
              <div className="mt-4 grid gap-3">
                {[
                  { label: "関連荷主", value: `${siteRelations.length} 件` },
                  { label: "有効契約", value: `${activeRelationCount} 件` },
                  { label: "停止契約", value: `${suspendedRelationCount} 件` },
                  { label: "業務フロー", value: `${siteWorkflows.length} 件` },
                ].map((item) => (
                  <div key={item.label} className={`${c.bgCard} rounded-2xl border ${c.border} px-4 py-3`}>
                    <div className={`text-[12px] ${c.textMuted}`}>{item.label}</div>
                    <div className={`mt-1 text-[18px] font-semibold ${c.textPrimary}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {activeTab === "shipper" && (
        <section className={`${surfaceClass} p-5`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className={`text-[18px] font-semibold ${c.textPrimary}`}>荷主一覧</div>
              <div className={`mt-1 text-sm ${c.textSecondary}`}>荷主ごとの基本情報と拠点連絡先を管理します。</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => { setAddMode("existing"); setSelectedExistingShipperIds([]); setExistingSearch(""); setAddModalOpen(true); }}>既存荷主を紐付け</Button>
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => { setAddMode("new"); setSelectedExistingShipperIds([]); setExistingSearch(""); setAddModalOpen(true); }}>新規荷主を追加</Button>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {siteRelations.length === 0 ? (
              <div className={`${mutedSurfaceClass} px-5 py-10 text-center`}>
                <div className={`text-[15px] font-semibold ${c.textPrimary}`}>まだ荷主が紐付いていません</div>
                <div className={`mt-2 text-sm ${c.textSecondary}`}>既存荷主の紐付けか、新規荷主の作成から始められます。</div>
              </div>
            ) : (
              siteRelations.map((relation) => {
                const shipper = shipperMap.get(relation.shipperId) ?? null;
                const statusMeta = getStatusMeta(resolveSiteShipperRelationStatus(relation));
                return (
                  <button key={relation.id} type="button" onClick={() => openEditModal(relation)} className={`${mutedSurfaceClass} ${statusMeta.cardClass} w-full p-4 text-left transition hover:border-cyan-400/50`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-[13px] font-semibold text-cyan-600">
                          {getShipperInitials(shipper?.name ?? relation.shipperId)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`text-[15px] font-semibold ${c.textPrimary}`}>{shipper?.name ?? relation.shipperId}</div>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                          </div>
                          <div className={`mt-1 text-[13px] ${c.textSecondary}`}>{shipper?.code ? `コード: ${shipper.code}` : "コード未設定"}</div>
                          <div className="mt-2 grid gap-1 sm:grid-cols-2">
                            <div className={`text-[12px] ${c.textSecondary}`}>担当者: {relation.contactPerson || shipper?.contactPerson || "-"}</div>
                            <div className={`text-[12px] ${c.textSecondary}`}>電話: {relation.contactTel || "-"}</div>
                            <div className={`text-[12px] ${c.textSecondary}`}>メール: {relation.contactEmail || "-"}</div>
                            <div className={`truncate text-[12px] ${c.textSecondary}`}>メモ: {relation.notes || shipper?.notes || "-"}</div>
                          </div>
                        </div>
                      </div>
                      <div className={`shrink-0 text-[12px] ${c.textMuted}`}>更新: {toDisplayDate(relation.updatedAt.slice(0, 10))}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}

      {activeTab === "equipment" && (
        <section className={`${surfaceClass} p-5`}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className={`${mutedSurfaceClass} p-5`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className={sectionTitleClass}>
                    <HardDrive className="h-4 w-4 text-cyan-500" />
                    <span>設備・レイアウト / 区域管理</span>
                  </div>
                  <div className={`mt-2 text-sm leading-6 ${c.textSecondary}`}>
                    拠点内の作業区域を管理します。区域名と説明を整備しておくと、後続の設備台帳や配置設計にも流用しやすくなります。
                  </div>
                </div>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={addLayoutArea}>
                  区域を追加
                </Button>
              </div>

              <div className="mt-5 grid gap-4">
                {siteLayoutAreas.length === 0 ? (
                  <div className={`${c.bgCard} rounded-2xl border border-dashed ${c.border} px-5 py-10 text-center`}>
                    <div className={`text-[15px] font-semibold ${c.textPrimary}`}>まだ区域が登録されていません</div>
                    <div className={`mt-2 text-sm ${c.textSecondary}`}>必要な区域を追加して、作業エリアの単位を整理できます。</div>
                  </div>
                ) : (
                  siteLayoutAreas.map((area, index) => (
                    <div key={area.id} className={`${c.bgCard} rounded-2xl border ${c.border} p-4`}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-sm font-semibold text-cyan-600">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={fieldLabelClass}>区域名</div>
                            <input
                              value={area.name}
                              onChange={(event) => updateLayoutArea(area.id, { name: event.target.value })}
                              placeholder="区域名を入力"
                              className={inputClass}
                            />
                          </div>
                        </div>
                        <Button color="error" onClick={() => removeLayoutArea(area.id)}>
                          削除
                        </Button>
                      </div>

                      <div className="mt-4">
                        <div className={fieldLabelClass}>説明</div>
                        <textarea
                          value={area.description}
                          onChange={(event) => updateLayoutArea(area.id, { description: event.target.value })}
                          placeholder="この区域で扱う作業やレイアウトメモ"
                          className={`${inputClass} min-h-[104px] w-full resize-y`}
                        />
                      </div>

                      <div className={`mt-3 text-[11px] ${c.textMuted}`}>区域ID: {area.id}</div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="grid gap-4">
              <section className={`${mutedSurfaceClass} p-5`}>
                <div className={sectionTitleClass}>
                  <HardDrive className="h-4 w-4 text-cyan-500" />
                  <span>概要</span>
                </div>
                <div className="mt-4 grid gap-3">
                  {[
                    { label: "登録区域", value: `${siteLayoutAreas.length} 件` },
                    { label: "工程マスタ", value: `${processMap.size} 件` },
                    { label: "業務フロー", value: `${siteWorkflows.length} 件` },
                  ].map((item) => (
                    <div key={item.label} className={`${c.bgCard} rounded-2xl border ${c.border} px-4 py-3`}>
                      <div className={`text-[12px] ${c.textMuted}`}>{item.label}</div>
                      <div className={`mt-1 text-[18px] font-semibold ${c.textPrimary}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={`${mutedSurfaceClass} p-5`}>
                <div className={sectionTitleClass}>
                  <Settings2 className="h-4 w-4 text-cyan-500" />
                  <span>次に追加しやすい項目</span>
                </div>
                <div className={`mt-3 text-sm leading-6 ${c.textSecondary}`}>
                  設備台帳、保管ロケーション、導線メモ、区域ごとの最大人員などは、この区域定義の上に追加できます。
                </div>
              </section>
            </div>
          </div>
        </section>
      )}

      {activeTab === "settings" && (
        <section className={`${surfaceClass} p-5`}>
          <section className={`${mutedSurfaceClass} p-5`}>
            <div className={sectionTitleClass}>
              <Settings2 className="h-4 w-4 text-cyan-500" />
              <span>拠点設定</span>
            </div>
            <div className={`mt-3 text-sm leading-6 ${c.textSecondary}`}>
              拠点単位の追加設定は今後このタブに集約します。
            </div>
          </section>
        </section>
      )}

      <Dialog open={addModalOpen} fullWidth maxWidth={addMode === "existing" ? "md" : "lg"} onClose={(_, reason) => { if (reason === "backdropClick") return; setAddModalOpen(false); }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{addMode === "existing" ? "既存荷主を紐付け" : "新しい荷主を追加"}</DialogTitle>
        <DialogContent>
          {addMode === "existing" ? (
            <div className="grid gap-3 pt-2">
              <div>
                <div className={fieldLabelClass}>荷主を検索</div>
                <input value={existingSearch} onChange={(event) => setExistingSearch(event.target.value)} placeholder="荷主名、コード、担当者名で検索" className={inputClass} />
              </div>
              {filteredExistingShippers.map((shipper) => {
                const linked = hasSiteShipperRelation(site.id, shipper.id, siteShipperRelations);
                const selected = selectedExistingShipperIds.includes(shipper.id);
                return (
                  <label key={shipper.id} className={`${mutedSurfaceClass} flex cursor-pointer items-start gap-3 p-4 ${linked ? "opacity-50" : ""}`}>
                    <input type="checkbox" checked={selected} disabled={linked} onChange={(event) => setSelectedExistingShipperIds((prev) => event.target.checked ? [...prev, shipper.id] : prev.filter((id) => id !== shipper.id))} className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                    <div>
                      <div className={`text-[14px] font-semibold ${c.textPrimary}`}>{shipper.name}</div>
                      <div className={`mt-1 text-[12px] ${c.textSecondary}`}>{shipper.code ? `コード: ${shipper.code}` : "コード未設定"}</div>
                      <div className={`mt-1 text-[12px] ${c.textSecondary}`}>{linked ? "この拠点に紐付け済みです" : `担当者: ${shipper.contactPerson || "-"}`}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="grid gap-4">
                <section className={`${mutedSurfaceClass} p-5`}>
                  <div className={sectionTitleClass}><Building2 className="h-4 w-4 text-cyan-500" /><span>識別・表示</span></div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2"><div className={fieldLabelClass}>荷主名</div><input value={newShipperDraft.name} onChange={(event) => setNewShipperDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="正式名称を入力" className={inputClass} /></div>
                    <div><div className={fieldLabelClass}>略称 / 表示コード</div><input value={newShipperDraft.code} onChange={(event) => setNewShipperDraft((prev) => ({ ...prev, code: event.target.value }))} placeholder="短縮名またはコード" className={inputClass} /></div>
                    <div><div className={fieldLabelClass}>ステータス</div><select value={newShipperDraft.status} onChange={(event) => setNewShipperDraft((prev) => ({ ...prev, status: event.target.value as Shipper["status"] }))} className={inputClass}><option value="active">有効</option><option value="inactive">停止</option></select></div>
                    <div className="sm:col-span-2"><div className={fieldLabelClass}>対応拠点</div><input value={site.name} readOnly className={readonlyInputClass} /></div>
                  </div>
                </section>
                <section className={`${mutedSurfaceClass} p-5`}>
                  <div className={sectionTitleClass}><Settings2 className="h-4 w-4 text-cyan-500" /><span>備考</span></div>
                  <div className="mt-4"><textarea value={newShipperDraft.notes} onChange={(event) => setNewShipperDraft((prev) => ({ ...prev, notes: event.target.value }))} placeholder="荷主固有の運用メモ" className={`${inputClass} min-h-[160px] w-full resize-y`} /></div>
                </section>
              </div>
              <section className={`${mutedSurfaceClass} p-5`}>
                <div className={sectionTitleClass}><Users className="h-4 w-4 text-cyan-500" /><span>連絡先</span></div>
                <div className="mt-4 grid gap-4">
                  <div><div className={fieldLabelClass}>担当者名</div><input value={newShipperDraft.contactPerson} onChange={(event) => setNewShipperDraft((prev) => ({ ...prev, contactPerson: event.target.value }))} placeholder="担当者名" className={inputClass} /></div>
                  <div><div className={fieldLabelClass}>連絡先（電話）</div><input value={newShipperDraft.contactTel} onChange={(event) => setNewShipperDraft((prev) => ({ ...prev, contactTel: event.target.value }))} placeholder="電話番号" className={inputClass} /></div>
                  <div><div className={fieldLabelClass}>連絡先（メール）</div><input value={newShipperDraft.contactEmail} onChange={(event) => setNewShipperDraft((prev) => ({ ...prev, contactEmail: event.target.value }))} placeholder="メールアドレス" className={inputClass} /></div>
                </div>
              </section>
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setAddModalOpen(false)}>キャンセル</Button>
          {addMode === "existing" ? <Button variant="contained" onClick={linkSelectedExistingShippers} disabled={selectedExistingShipperIds.length === 0}>紐付ける</Button> : <Button variant="contained" onClick={createAndLinkShipper} disabled={!newShipperDraft.name.trim()}>作成して紐付ける</Button>}
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(editingRelation && editDraft)}
        fullWidth
        maxWidth="md"
        onClose={(_, reason) => {
          if (reason === "backdropClick") return;
          closeEditModal();
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>{editingShipper?.name ?? "荷主詳細"}</DialogTitle>
        <DialogContent>
          {editingRelation && editDraft && (
            <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="grid gap-4">
                <section className={`${mutedSurfaceClass} p-5`}>
                  <div className={sectionTitleClass}>
                    <Building2 className="h-4 w-4 text-cyan-500" />
                    <span>識別・表示</span>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <div className={fieldLabelClass}>荷主名</div>
                      <input value={editDraft.shipperName} onChange={(event) => setEditDraft((prev) => prev ? { ...prev, shipperName: event.target.value } : prev)} className={inputClass} />
                    </div>
                    <div>
                      <div className={fieldLabelClass}>略称 / 表示コード</div>
                      <input value={editDraft.shipperCode} onChange={(event) => setEditDraft((prev) => prev ? { ...prev, shipperCode: event.target.value } : prev)} className={inputClass} />
                    </div>
                    <div>
                      <div className={fieldLabelClass}>ステータス</div>
                      <select value={editDraft.shipperStatus} onChange={(event) => setEditDraft((prev) => prev ? { ...prev, shipperStatus: event.target.value as Shipper["status"] } : prev)} className={inputClass}>
                        <option value="active">有効</option>
                        <option value="inactive">停止</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <div className={fieldLabelClass}>対応拠点</div>
                      <input value={site.name} readOnly className={readonlyInputClass} />
                    </div>
                  </div>
                </section>
                <section className={`${mutedSurfaceClass} p-5`}>
                  <div className={sectionTitleClass}>
                    <Settings2 className="h-4 w-4 text-cyan-500" />
                    <span>備考</span>
                  </div>
                  <div className="mt-4">
                    <textarea value={editDraft.notes} onChange={(event) => setEditDraft((prev) => prev ? { ...prev, notes: event.target.value } : prev)} className={`${inputClass} min-h-[160px] w-full resize-y`} />
                  </div>
                </section>
              </div>
              <div className="grid gap-4">
                <section className={`${mutedSurfaceClass} p-5`}>
                  <div className={sectionTitleClass}>
                    <Factory className="h-4 w-4 text-cyan-500" />
                    <span>管理情報</span>
                  </div>
                  <div className="mt-4">
                    <div className={fieldLabelClass}>荷主ID</div>
                    <input value={editingRelation.shipperId} readOnly className={readonlyInputClass} />
                  </div>
                </section>
                <section className={`${mutedSurfaceClass} p-5`}>
                  <div className={sectionTitleClass}>
                    <Users className="h-4 w-4 text-cyan-500" />
                    <span>連絡先</span>
                  </div>
                  <div className="mt-4 grid gap-4">
                    <div>
                      <div className={fieldLabelClass}>担当者名</div>
                      <input value={editDraft.contactPerson} onChange={(event) => setEditDraft((prev) => prev ? { ...prev, contactPerson: event.target.value } : prev)} className={inputClass} />
                    </div>
                    <div>
                      <div className={fieldLabelClass}>連絡先（電話）</div>
                      <input value={editDraft.contactTel} onChange={(event) => setEditDraft((prev) => prev ? { ...prev, contactTel: event.target.value } : prev)} className={inputClass} />
                    </div>
                    <div>
                      <div className={fieldLabelClass}>連絡先（メール）</div>
                      <input value={editDraft.contactEmail} onChange={(event) => setEditDraft((prev) => prev ? { ...prev, contactEmail: event.target.value } : prev)} className={inputClass} />
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between", px: 3, pb: 3 }}>
          <Button
            color="error"
            startIcon={<Trash2 size={16} />}
            onClick={() => editingRelation && setConfirmUnlinkRelationId(editingRelation.id)}
          >
            紐付け解除
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={closeEditModal}>キャンセル</Button>
            <Button variant="contained" onClick={saveRelation}>
              保存
            </Button>
          </div>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(confirmUnlinkRelationId)}
        onClose={(_, reason) => {
          if (reason === "backdropClick") return;
          setConfirmUnlinkRelationId(null);
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>紐付けを解除しますか？</DialogTitle>
        <DialogContent>
          <div className="pt-2 text-[13px] leading-6 text-slate-600">
            この拠点との紐付けを解除します。荷主マスタは削除されません。
          </div>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setConfirmUnlinkRelationId(null)}>キャンセル</Button>
          <Button color="error" variant="contained" onClick={unlinkRelation}>
            解除する
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

