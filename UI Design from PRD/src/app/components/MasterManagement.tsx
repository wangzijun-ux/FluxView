import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Brain,
  Building2,
  ChevronDown,
  Factory,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { Autocomplete, Chip, TextField } from "@mui/material";
import { createPortal } from "react-dom";
import { useThemeColors } from "./ThemeContext";
import { useMasterData } from "./MasterDataContext";
import type {
  DispatchCompany,
  MasterStatus,
  ProcessMaster,
  QualificationMaster,
  Shipper,
  Site,
  SkillMaster,
  WorkflowDefinition,
  WorkflowStepSetting,
} from "./masterStore";
import {
  DEFAULT_QUALIFICATION_ICON_KEY,
  DEFAULT_SKILL_ICON_KEY,
  getCapabilityToneClasses,
  getMasterIconOption,
  masterIconOptions,
  type CapabilityTone,
  type MasterIconKey,
} from "./masterIconOptions";
import { createUuid, hasSiteShipperRelation } from "./siteShipperUtils";

type MasterTab = "shipper" | "site" | "process" | "workflow" | "qualification" | "skill" | "dispatchCompany";

const tabItems: Array<{ id: MasterTab; label: string; icon: typeof Building2 }> = [
  { id: "shipper", label: "荷主マスタ", icon: Building2 },
  { id: "site", label: "拠点マスタ", icon: Factory },
  { id: "process", label: "業務マスタ", icon: Building2 },
  { id: "workflow", label: "業務フロー", icon: WorkflowIcon },
  { id: "qualification", label: "資格マスタ", icon: BadgeCheck },
  { id: "skill", label: "スキルマスタ", icon: Brain },
  { id: "dispatchCompany", label: "派遣会社マスタ", icon: Building2 },
];

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = getMasterIconOption(value, fallback);
  const SelectedIcon = selected.icon;
  const toneClasses = getCapabilityToneClasses(tone);

  useEffect(() => {
    if (!open) return undefined;

    const updateMenuPosition = () => {
      const triggerRect = containerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const menuWidth = Math.max(triggerRect.width, 312);
      const viewportWidth = window.innerWidth;
      const left = Math.min(
        Math.max(12, triggerRect.left),
        Math.max(12, viewportWidth - menuWidth - 12),
      );

      setMenuStyle({
        top: triggerRect.bottom + 4,
        left,
        width: menuWidth,
      });
    };

    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
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
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
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

      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: menuStyle.top,
                left: menuStyle.left,
                width: menuStyle.width,
              }}
              className={`z-[140] rounded-xl border ${c.border} ${c.bgCard} p-3 shadow-xl`}
            >
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function CompactMultiSelect({
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
  const selectedOptions = options.filter((option) => selectedIds.includes(option.id));

  return (
    <div className="min-w-[220px]">
      <Autocomplete
        multiple
        size="small"
        options={options}
        value={selectedOptions}
        disableCloseOnSelect
        limitTags={2}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        getOptionLabel={(option) => option.name}
        onChange={(_, values) => onChange(values.map((value) => value.id))}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => (
            <Chip
              {...getTagProps({ index })}
              key={option.id}
              label={option.name}
              size="small"
              sx={{
                borderRadius: "9999px",
                border: "1px solid #CFE8E4",
                bgcolor: "#EAF7F4",
                color: "#315B55",
                ".MuiChip-deleteIcon": { color: "#8AA9A2" },
              }}
            />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={placeholder}
            sx={{
              "& .MuiOutlinedInput-root": {
                minHeight: 40,
                borderRadius: "12px",
                fontSize: 13,
                bgcolor: "#FFFFFF",
                alignItems: "center",
                paddingTop: "3px",
                paddingBottom: "3px",
              },
              "& .MuiOutlinedInput-input": {
                paddingY: "6px",
              },
            }}
          />
        )}
      />
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
    siteShipperRelations,
    setSiteShipperRelations,
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
    selectedSiteId,
    getShippersForSite,
    getPrimaryShipperForSite,
    resetMasterData,
  } = useMasterData();

  const [activeTab, setActiveTab] = useState<MasterTab>("shipper");
  const [search, setSearch] = useState("");
  const [shipperStatusFilter, setShipperStatusFilter] = useState<"all" | MasterStatus>("all");
  const [siteShipperFilter, setSiteShipperFilter] = useState("all");
  const [dispatchCompanyStatusFilter, setDispatchCompanyStatusFilter] = useState<"all" | MasterStatus>("all");
  const [editDialog, setEditDialog] = useState<
    | { mode: "edit" | "create"; type: "shipper"; value: Shipper }
    | { mode: "edit" | "create"; type: "site"; value: Site }
    | { mode: "edit" | "create"; type: "process"; value: ProcessMaster }
    | { mode: "edit" | "create"; type: "workflow"; value: WorkflowDefinition }
    | { mode: "edit" | "create"; type: "qualification"; value: QualificationMaster }
    | { mode: "edit" | "create"; type: "skill"; value: SkillMaster }
    | { mode: "edit" | "create"; type: "dispatchCompany"; value: DispatchCompany }
    | null
  >(null);

  const shipperMap = useMemo(() => new Map(shippers.map((x) => [x.id, x])), [shippers]);
  const siteMap = useMemo(() => new Map(sites.map((x) => [x.id, x])), [sites]);
  const processMap = useMemo(() => new Map(processes.map((x) => [x.id, x])), [processes]);
  const qualificationMap = useMemo(() => new Map(qualifications.map((x) => [x.id, x])), [qualifications]);
  const skillMap = useMemo(() => new Map(skills.map((x) => [x.id, x])), [skills]);
  const activeSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );

  const filteredShippers = shippers.filter((x) => {
    if (shipperStatusFilter !== "all" && x.status !== shipperStatusFilter) return false;
    return x.name.toLowerCase().includes(search.toLowerCase());
  });

  const filteredSites = sites.filter((x) => {
    const relatedShippers = getShippersForSite(x.id);
    if (siteShipperFilter !== "all" && !relatedShippers.some((shipper) => shipper.id === siteShipperFilter)) return false;
    const haystack = `${x.name} ${x.address} ${relatedShippers.map((shipper) => shipper.name).join(" ")}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const filteredProcesses = processes.filter((x) =>
    `${x.name} ${x.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredWorkflows = workflows.filter((workflow) => {
    if (selectedSiteId && workflow.siteId !== selectedSiteId) return false;
    const processNames = workflow.steps
      .map((step) => processMap.get(step.processId)?.name ?? "")
      .join(" ");
    return `${workflow.name} ${processNames}`.toLowerCase().includes(search.toLowerCase());
  });
  const filteredQualifications = qualifications.filter((x) => x.name.toLowerCase().includes(search.toLowerCase()));
  const filteredSkills = skills.filter((x) => x.name.toLowerCase().includes(search.toLowerCase()));
  const filteredDispatchCompanies = dispatchCompanies.filter((x) => {
    if (dispatchCompanyStatusFilter !== "all" && x.status !== dispatchCompanyStatusFilter) return false;
    return `${x.name} ${x.contactName} ${x.phone}`.toLowerCase().includes(search.toLowerCase());
  });

  const tabLabelMap: Record<MasterTab, string> = {
    shipper: "荷主マスタ",
    site: "拠点マスタ",
    process: "業務マスタ",
    workflow: "業務フロー",
    qualification: "資格マスタ",
    skill: "スキルマスタ",
    dispatchCompany: "派遣会社マスタ",
  };

  const tabDescriptionMap: Record<MasterTab, string> = {
    shipper: "荷主名、対応拠点、ステータスを一画面で管理します。",
    site: "拠点情報と対応荷主の関連を整理し、現場データの基準をそろえます。",
    process: "業務ごとの標準UPH・必要条件を共通マスタとして管理します。",
    workflow: "複数の業務を束ねた業務フローを拠点単位で管理します。",
    qualification: "作業に必要な資格を登録し、業務や配置条件に利用します。",
    skill: "保有スキルを登録し、配置や要員判定の基準として利用します。",
    dispatchCompany: "派遣会社の連絡先や単価、稼働ステータスを一元管理します。",
  };

  const searchPlaceholderMap: Record<MasterTab, string> = {
    shipper: "荷主名で検索",
    site: "拠点名・住所・荷主で検索",
    process: "業務名・説明で検索",
    workflow: "業務フロー名・構成業務で検索",
    qualification: "資格名で検索",
    skill: "スキル名で検索",
    dispatchCompany: "会社名・担当者・電話番号で検索",
  };

  const statusLabelMap: Record<MasterStatus, string> = {
    active: "有効",
    inactive: "無効",
  };

  const shipperSitesMap = useMemo(() => {
    const next = new Map<string, typeof sites>();

    shippers.forEach((shipper) => {
      const uniqueSites = new Map<string, (typeof sites)[number]>();

      sites
        .filter((site) => site.shipperId === shipper.id)
        .forEach((site) => uniqueSites.set(site.id, site));

      siteShipperRelations
        .filter((relation) => relation.shipperId === shipper.id)
        .forEach((relation) => {
          const site = siteMap.get(relation.siteId);
          if (site) {
            uniqueSites.set(site.id, site);
          }
        });

      next.set(shipper.id, Array.from(uniqueSites.values()));
    });

    return next;
  }, [shippers, siteShipperRelations, siteMap, sites]);

  const activeShipperCount = filteredShippers.filter((shipper) => shipper.status === "active").length;
  const inactiveShipperCount = filteredShippers.length - activeShipperCount;
  const cloneWorkflowRecord = (workflow: WorkflowDefinition): WorkflowDefinition => ({
    ...workflow,
    steps: workflow.steps.map((step) => ({
      ...step,
      layoutAreaIds: [...(step.layoutAreaIds ?? [])],
      requiredQualificationIds: [...step.requiredQualificationIds],
      requiredSkillIds: [...step.requiredSkillIds],
    })),
  });

  const buildCreateDialogValue = (type: MasterTab) => {
    const now = new Date().toISOString();
    const primaryShipperId = selectedSiteId
      ? getPrimaryShipperForSite(selectedSiteId)?.id ?? siteMap.get(selectedSiteId)?.shipperId ?? ""
      : "";

    switch (type) {
      case "shipper":
        return { mode: "create" as const, type, value: { id: makeId("shipper"), name: "", status: "active" as MasterStatus } };
      case "site":
        return {
          mode: "create" as const,
          type,
          value: { id: makeId("site"), name: "", address: "", shipperId: primaryShipperId || undefined },
        };
      case "process":
        return {
          mode: "create" as const,
          type,
          value: {
            id: makeId("process"),
            name: "",
            description: "",
            defaultQualificationIds: [],
            defaultSkillIds: [],
            defaultHeadcount: 1,
            defaultUph: 60,
          },
        };
      case "workflow":
        return {
          mode: "create" as const,
          type,
          value: {
            id: makeId("workflow"),
            name: "",
            shipperId: primaryShipperId,
            siteId: selectedSiteId ?? "",
            steps: [],
            updatedAt: now,
          },
        };
      case "qualification":
        return {
          mode: "create" as const,
          type,
          value: { id: makeId("qual"), name: "", iconKey: DEFAULT_QUALIFICATION_ICON_KEY },
        };
      case "skill":
        return {
          mode: "create" as const,
          type,
          value: { id: makeId("skill"), name: "", iconKey: DEFAULT_SKILL_ICON_KEY },
        };
      case "dispatchCompany":
        return {
          mode: "create" as const,
          type,
          value: { id: makeId("dispatch"), name: "", contactName: "", phone: "", unitPrice: 1200, status: "active" as MasterStatus },
        };
      default:
        return null;
    }
  };

  const openEditDialog = (
    type: NonNullable<typeof editDialog>["type"],
    item: Shipper | Site | ProcessMaster | WorkflowDefinition | QualificationMaster | SkillMaster | DispatchCompany,
  ) => {
    if (type === "workflow") {
      setEditDialog({ mode: "edit", type, value: cloneWorkflowRecord(item as WorkflowDefinition) });
      return;
    }

    setEditDialog({
      mode: "edit",
      type,
      value: { ...(item as Exclude<typeof item, WorkflowDefinition>) } as NonNullable<typeof editDialog>["value"],
    });
  };

  const openCreateDialog = (type: MasterTab) => {
    const nextDialog = buildCreateDialogValue(type);
    if (!nextDialog) return;
    setEditDialog(nextDialog);
  };

  const closeEditDialog = () => setEditDialog(null);

  const handleEditDialogSave = () => {
    if (!editDialog) return;

    if (editDialog.mode === "create") {
      switch (editDialog.type) {
        case "shipper":
          setShippers((prev) => [...prev, editDialog.value]);
          break;
        case "site": {
          const newSite = {
            ...editDialog.value,
            address: editDialog.value.address.trim() || "住所未設定",
          };
          const now = new Date();
          const nowIso = now.toISOString();
          const contractStartDate = nowIso.slice(0, 10);
          const contractEndDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);

          setSites((prev) => [...prev, newSite]);

          if (newSite.shipperId) {
            setSiteShipperRelations((prev) =>
              hasSiteShipperRelation(newSite.id, newSite.shipperId as string, prev)
                ? prev
                : [
                    ...prev,
                    {
                      id: createUuid(),
                      siteId: newSite.id,
                      shipperId: newSite.shipperId as string,
                      contractStartDate,
                      contractEndDate,
                      contactPerson: shipperMap.get(newSite.shipperId as string)?.contactPerson ?? "",
                      contactTel: "",
                      contactEmail: "",
                      dedicatedProcessIds: [],
                      priceConfig: [],
                      notes: "",
                      status: "active",
                      createdAt: nowIso,
                      updatedAt: nowIso,
                    },
                  ],
            );
          }
          break;
        }
        case "process":
          setProcesses((prev) => [...prev, editDialog.value]);
          break;
        case "workflow":
          setWorkflows((prev) => [{ ...editDialog.value, updatedAt: new Date().toISOString() }, ...prev]);
          break;
        case "qualification":
          setQualifications((prev) => [...prev, editDialog.value]);
          break;
        case "skill":
          setSkills((prev) => [...prev, editDialog.value]);
          break;
        case "dispatchCompany":
          setDispatchCompanies((prev) => [...prev, editDialog.value]);
          break;
        default:
          break;
      }

      setEditDialog(null);
      return;
    }

    switch (editDialog.type) {
      case "shipper":
        setShippers((prev) => prev.map((item) => (item.id === editDialog.value.id ? editDialog.value : item)));
        break;
      case "site":
        setSites((prev) => prev.map((item) => (item.id === editDialog.value.id ? editDialog.value : item)));
        break;
      case "process":
        setProcesses((prev) => prev.map((item) => (item.id === editDialog.value.id ? editDialog.value : item)));
        break;
      case "workflow":
        setWorkflows((prev) =>
          prev.map((item) =>
            item.id === editDialog.value.id
              ? { ...editDialog.value, updatedAt: new Date().toISOString() }
              : item,
          ),
        );
        break;
      case "qualification":
        setQualifications((prev) => prev.map((item) => (item.id === editDialog.value.id ? editDialog.value : item)));
        break;
      case "skill":
        setSkills((prev) => prev.map((item) => (item.id === editDialog.value.id ? editDialog.value : item)));
        break;
      case "dispatchCompany":
        setDispatchCompanies((prev) => prev.map((item) => (item.id === editDialog.value.id ? editDialog.value : item)));
        break;
      default:
        break;
    }

    setEditDialog(null);
  };

  const editDialogSaveDisabled =
    editDialog?.type === "shipper"
      ? !editDialog.value.name.trim()
      : editDialog?.type === "site"
        ? !editDialog.value.name.trim() || !editDialog.value.address.trim()
        : editDialog?.type === "process"
          ? !editDialog.value.name.trim()
          : editDialog?.type === "workflow"
            ? !editDialog.value.name.trim() || editDialog.value.steps.length === 0
            : editDialog?.type === "qualification"
              ? !editDialog.value.name.trim()
              : editDialog?.type === "skill"
                ? !editDialog.value.name.trim()
                : editDialog?.type === "dispatchCompany"
                  ? !editDialog.value.name.trim()
                  : true;

  const renderTagList = (labels: string[], emptyLabel = "未設定") =>
    labels.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {labels.map((label) => (
          <span
            key={label}
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${c.borderCard} ${c.bgSurface} ${c.textSecondary}`}
          >
            {label}
          </span>
        ))}
      </div>
    ) : (
      <span className={`text-[12px] ${c.textSecondary}`}>{emptyLabel}</span>
    );

  const renderShipperManagementSection = () => (
    <section className={`${cardClass} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px]">
          <thead className={`${c.bgSurface}`}>
            <tr className={`border-b ${c.border}`}>
              <th className={`px-5 py-3 text-left text-[12px] font-semibold ${c.textMuted}`}>荷主名</th>
              <th className={`px-5 py-3 text-left text-[12px] font-semibold ${c.textMuted}`}>対応拠点</th>
              <th className={`px-5 py-3 text-left text-[12px] font-semibold ${c.textMuted}`}>ステータス</th>
              <th className={`px-5 py-3 text-right text-[12px] font-semibold ${c.textMuted}`}>操作</th>
            </tr>
          </thead>

          <tbody>
            {filteredShippers.map((item) => {
              const relatedSites = shipperSitesMap.get(item.id) ?? [];

              return (
                <tr key={item.id} className={`border-b ${c.borderCard} bg-white transition-colors hover:bg-slate-50/80`}>
                  <td className={`px-5 py-3 align-top text-[13px] font-medium ${c.textPrimary}`}>{item.name}</td>
                  <td className="px-5 py-3 align-top">{renderTagList(relatedSites.map((site) => site.name))}</td>
                  <td className="px-5 py-3 align-top">
                    <span
                      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        item.status === "active"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {statusLabelMap[item.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right align-top">
                    <button
                      type="button"
                      onClick={() => openEditDialog("shipper", item)}
                      className={`mr-2 ${iconButtonClass}`}
                      aria-label={`${item.name}を編集`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteShipper(item.id)}
                      className={iconDeleteButtonClass}
                      aria-label={`${item.name}を削除`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-[12px] ${c.border} ${c.textMuted} bg-white`}>
        <div className="flex flex-wrap items-center gap-4">
          <span>荷主数 {filteredShippers.length} 件</span>
          <span>有効 {activeShipperCount} 件</span>
          <span>無効 {inactiveShipperCount} 件</span>
        </div>
        <span>{search ? `検索条件: 「${search}」` : "検索条件: なし"}</span>
      </div>
    </section>
  );
  const addShipper = () => {
    if (!newShipperName.trim()) return;
    setShippers((prev) => [
      ...prev,
      {
        id: makeId("shipper"),
        name: newShipperName.trim(),
        status: newShipperStatus,
      },
    ]);
    setNewShipperName("");
  };

  const deleteShipper = (shipperId: string) => {
    setShippers((prev) => prev.filter((x) => x.id !== shipperId));
    setSites((prev) => prev.map((x) => (x.shipperId === shipperId ? { ...x, shipperId: undefined } : x)));
    setSiteShipperRelations((prev) => prev.filter((relation) => relation.shipperId !== shipperId));
    setWorkflows((prev) => prev.filter((x) => x.shipperId !== shipperId));
  };

  const addSite = () => {
    if (!newSiteName.trim()) return;

    const siteId = makeId("site");
    const now = new Date();
    const contractStartDate = now.toISOString().slice(0, 10);
    const contractEndDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);

    setSites((prev) => [
      ...prev,
      {
        id: siteId,
        shipperId: newSiteShipperId || undefined,
        name: newSiteName.trim(),
        address: newSiteAddress.trim() || "住所未設定",
      },
    ]);

    if (newSiteShipperId) {
      setSiteShipperRelations((prev) =>
        hasSiteShipperRelation(siteId, newSiteShipperId, prev)
          ? prev
          : [
              ...prev,
              {
                id: createUuid(),
                siteId,
                shipperId: newSiteShipperId,
                contractStartDate,
                contractEndDate,
                contactPerson: shipperMap.get(newSiteShipperId)?.contactPerson ?? "",
                contactTel: "",
                contactEmail: "",
                dedicatedProcessIds: [],
                priceConfig: [],
                notes: "",
                status: "active",
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
              },
            ],
      );
    }

    setNewSiteName("");
    setNewSiteAddress("");
    setNewSiteShipperId("");
  };

  const addProcess = () => {
    if (!newProcessName.trim()) return;

    setProcesses((prev) => [
      ...prev,
      {
        id: makeId("process"),
        name: newProcessName.trim(),
        description: newProcessDescription.trim(),
        defaultQualificationIds: newProcessQualificationIds,
        defaultSkillIds: newProcessSkillIds,
        defaultHeadcount: Math.max(0, Number(newProcessHeadcount) || 0),
        defaultUph: Math.max(0, Number(newProcessUph) || 0),
      },
    ]);
    setNewProcessName("");
    setNewProcessDescription("");
    setNewProcessHeadcount("1");
    setNewProcessUph("60");
    setNewProcessQualificationIds([]);
    setNewProcessSkillIds([]);
  };

  const buildWorkflowSteps = (processIds: string[], previousSteps: WorkflowStepSetting[] = []) =>
    processIds.flatMap((processId) => {
      const process = processMap.get(processId);
      if (!process) return [];

      const existingStep = previousSteps.find((step) => step.processId === processId);
      return [
        {
          id: existingStep?.id ?? makeId("step"),
          processId: process.id,
          layoutAreaIds: [...(existingStep?.layoutAreaIds ?? [])],
          requiredQualificationIds: [...(existingStep?.requiredQualificationIds ?? process.defaultQualificationIds)],
          requiredSkillIds: [...(existingStep?.requiredSkillIds ?? process.defaultSkillIds)],
          standardHeadcount: existingStep?.standardHeadcount ?? process.defaultHeadcount,
          uph: existingStep?.uph ?? process.defaultUph,
          manual: existingStep?.manual ?? "",
          caution: existingStep?.caution ?? "",
        },
      ];
    });

  const addWorkflow = () => {
    if (!newWorkflowName.trim() || !selectedSiteId || newWorkflowProcessIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const primaryShipperId = getPrimaryShipperForSite(selectedSiteId)?.id ?? siteMap.get(selectedSiteId)?.shipperId ?? "";
    setWorkflows((prev) => [
      {
        id: makeId("workflow"),
        name: newWorkflowName.trim(),
        shipperId: primaryShipperId,
        siteId: selectedSiteId,
        steps: buildWorkflowSteps(newWorkflowProcessIds),
        updatedAt: now,
      },
      ...prev,
    ]);
    setNewWorkflowName("");
    setNewWorkflowProcessIds([]);
  };

  const deleteWorkflow = (workflowId: string) => {
    setWorkflows((prev) => prev.filter((workflow) => workflow.id !== workflowId));
  };

  const updateWorkflowRecord = (
    workflowId: string,
    mutate: (workflow: (typeof workflows)[number]) => (typeof workflows)[number],
  ) => {
    const updatedAt = new Date().toISOString();
    setWorkflows((prev) =>
      prev.map((workflow) =>
        workflow.id === workflowId ? { ...mutate(workflow), updatedAt } : workflow,
      ),
    );
  };

  const deleteProcess = (processId: string) => {
    const now = new Date().toISOString();
    setProcesses((prev) => prev.filter((x) => x.id !== processId));
    setSiteShipperRelations((prev) =>
      prev.map((relation) => ({
        ...relation,
        dedicatedProcessIds: relation.dedicatedProcessIds.filter((id) => id !== processId),
        updatedAt: relation.dedicatedProcessIds.includes(processId) ? now : relation.updatedAt,
      })),
    );
    setWorkflows((prev) =>
      prev.map((workflow) => ({
        ...workflow,
        steps: workflow.steps.filter((step) => step.processId !== processId),
        updatedAt: workflow.steps.some((step) => step.processId === processId) ? now : workflow.updatedAt,
      })),
    );
  };

  const deleteSite = (siteId: string) => {
    setSites((prev) => prev.filter((x) => x.id !== siteId));
    setSiteShipperRelations((prev) => prev.filter((relation) => relation.siteId !== siteId));
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

  const cardClass = `${c.bgCard} border ${c.border} rounded-[24px] shadow-[0_20px_48px_-36px_rgba(15,23,42,0.35)]`;
  const inputClass = `${c.bgSurface} border ${c.borderCard} rounded-xl px-3 py-2.5 text-[13px] ${c.textPrimary} placeholder:${c.textDimmed} focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-100 outline-none`;
  const actionButtonClass = "inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-[#155DFC] px-4 text-[13px] font-semibold text-white transition-all hover:bg-[#0F4FE3]";
  const secondaryButtonClass = `inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border px-4 text-[13px] font-semibold transition-all ${c.borderCard} ${c.bgCard} ${c.textSecondary} hover:bg-slate-50`;
  const iconButtonBaseClass = "inline-flex items-center justify-center rounded-xl border border-transparent bg-transparent transition-all";
  const editIconButtonClass = `${iconButtonBaseClass} text-slate-500 hover:border-[#B7CDFF] hover:bg-[#EEF4FF] hover:text-[#155DFC]`;
  const deleteIconButtonClass = `${iconButtonBaseClass} text-rose-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600`;
  const iconButtonClass = `h-10 w-10 ${editIconButtonClass}`;
  const iconDeleteButtonClass = `h-10 w-10 ${deleteIconButtonClass}`;
  const compactIconButtonClass = `h-[36px] w-[36px] ${editIconButtonClass}`;
  const compactDeleteButtonClass = `h-[36px] w-[36px] ${deleteIconButtonClass}`;
  const createButtonLabelMap: Record<MasterTab, string> = {
    shipper: "荷主を追加",
    site: "拠点を追加",
    process: "業務を追加",
    workflow: "業務フローを追加",
    qualification: "資格を追加",
    skill: "スキルを追加",
    dispatchCompany: "派遣会社を追加",
  };
  const currentCount =
    activeTab === "shipper"
      ? filteredShippers.length
      : activeTab === "site"
        ? filteredSites.length
        : activeTab === "process"
          ? filteredProcesses.length
          : activeTab === "workflow"
            ? filteredWorkflows.length
        : activeTab === "qualification"
            ? filteredQualifications.length
      : activeTab === "skill"
              ? filteredSkills.length
              : filteredDispatchCompanies.length;
  const createDisabled = activeTab === "workflow" && !selectedSiteId;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-3">
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex h-[42px] items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-all ${
                  active
                    ? "border-[#155DFC] bg-[#155DFC] text-white shadow-[0_12px_32px_-18px_rgba(21,93,252,0.9)]"
                    : `${c.borderCard} bg-white/85 ${c.textSecondary} hover:border-[#B7CDFF] hover:text-[#155DFC]`
                }`}
              >
                <Icon className="h-4 w-4" />
                {tabLabelMap[tab.id]}
              </button>
            );
          })}
        </div>

        <div className={activeTab === "shipper" ? "space-y-4" : `${cardClass} p-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex h-[44px] min-w-[280px] flex-1 items-center gap-2 rounded-xl border px-3 ${c.borderCard} bg-white`}>
              <Search className={`h-4 w-4 ${c.textMuted}`} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholderMap[activeTab]}
                className={`w-full bg-transparent text-[13px] ${c.textPrimary} outline-none`}
              />
            </div>
            {activeTab === "shipper" && (
              <select value={shipperStatusFilter} onChange={(e) => setShipperStatusFilter(e.target.value as "all" | MasterStatus)} className={`${inputClass} min-w-[170px]`}>
                <option value="all">ステータス: すべて</option>
                <option value="active">有効</option>
                <option value="inactive">無効</option>
              </select>
            )}
            {activeTab === "site" && (
              <select value={siteShipperFilter} onChange={(e) => setSiteShipperFilter(e.target.value)} className={`${inputClass} min-w-[180px]`}>
                <option value="all">荷主: すべて</option>
                {shippers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {activeTab === "dispatchCompany" && (
              <select value={dispatchCompanyStatusFilter} onChange={(e) => setDispatchCompanyStatusFilter(e.target.value as "all" | MasterStatus)} className={`${inputClass} min-w-[170px]`}>
                <option value="all">ステータス: すべて</option>
                <option value="active">有効</option>
                <option value="inactive">無効</option>
              </select>
            )}
            <div className={`inline-flex h-[42px] items-center gap-2 rounded-xl border px-4 text-[12px] ${c.borderCard} ${c.bgSurface} ${c.textMuted}`}>
              <Filter className="h-3.5 w-3.5" />
              表示中 {currentCount} 件
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openCreateDialog(activeTab)}
                disabled={createDisabled}
                className={`${actionButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <Plus className="h-4 w-4" />
                {createButtonLabelMap[activeTab]}
              </button>
            </div>
          </div>

        </div>

        {activeTab === "shipper" ? renderShipperManagementSection() : null}

        {activeTab === "site" && (
          <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>拠点名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>住所</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>主担当荷主</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>関連荷主</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className={`px-4 py-2 text-[13px] font-medium ${c.textPrimary}`}>{item.name}</td>
                    <td className={`px-4 py-2 text-[12px] ${c.textSecondary}`}>{item.address}</td>
                    <td className={`px-4 py-2 text-[12px] ${c.textSecondary}`}>{item.shipperId ? shipperMap.get(item.shipperId)?.name ?? "未設定" : "未設定"}</td>
                    <td className="px-4 py-2">{renderTagList(getShippersForSite(item.id).map((shipper) => shipper.name))}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditDialog("site", item)}
                          className={compactIconButtonClass}
                          aria-label={`${item.name}を編集`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteSite(item.id)} className={compactDeleteButtonClass}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
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
            <table className="w-full min-w-[1240px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>業務名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>説明</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>標準UPH</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>既定資格</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>既定スキル</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcesses.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className={`px-4 py-2 align-top text-[13px] font-medium ${c.textPrimary}`}>{item.name}</td>
                    <td className={`px-4 py-2 align-top text-[12px] ${c.textSecondary}`}>{item.description || "-"}</td>
                    <td className={`px-4 py-2 align-top text-[13px] ${c.textPrimary}`}>{item.defaultUph}</td>
                    <td className="px-4 py-2 align-top">
                      {renderTagList(item.defaultQualificationIds.map((id) => qualificationMap.get(id)?.name ?? "").filter(Boolean))}
                    </td>
                    <td className="px-4 py-2 align-top">
                      {renderTagList(item.defaultSkillIds.map((id) => skillMap.get(id)?.name ?? "").filter(Boolean))}
                    </td>
                    <td className="px-4 py-2 text-right align-top">
                      <button
                        type="button"
                        onClick={() => openEditDialog("process", item)}
                        className={`mr-2 ${iconButtonClass}`}
                        aria-label={`${item.name}を編集`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteProcess(item.id)}
                        className={iconDeleteButtonClass}
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

        {activeTab === "workflow" && (
          <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px]">
              <thead>
                <tr className={`border-b ${c.border}`}>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>業務フロー名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>構成業務</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>更新日時</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkflows.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className={`px-4 py-2 align-top text-[13px] font-medium ${c.textPrimary}`}>{item.name}</td>
                    <td className="px-4 py-2 align-top">
                      {renderTagList(item.steps.map((step) => processMap.get(step.processId)?.name ?? "").filter(Boolean))}
                      <div className={`mt-2 text-[11px] ${c.textMuted}`}>{item.steps.length} 件の業務で構成</div>
                    </td>
                    <td className={`px-4 py-2 align-top text-[12px] ${c.textSecondary}`}>
                      {formatDateTime(item.updatedAt)}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditDialog("workflow", item)}
                          className={compactIconButtonClass}
                          aria-label={`${item.name}を編集`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteWorkflow(item.id)}
                          className={compactDeleteButtonClass}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
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
                {filteredQualifications.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2 w-[108px]">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${c.borderCard} ${c.bgSurface}`}>
                        {(() => {
                          const Icon = getMasterIconOption(item.iconKey, DEFAULT_QUALIFICATION_ICON_KEY).icon;
                          return <Icon className="h-4 w-4 text-emerald-600" />;
                        })()}
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-[13px] font-medium ${c.textPrimary}`}>{item.name}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEditDialog("qualification", item)}
                        className={`mr-2 ${iconButtonClass}`}
                        aria-label={`${item.name}を編集`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteQualification(item.id)}
                        className={iconDeleteButtonClass}
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
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>謫堺ｽ・</th>
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
                {filteredSkills.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className="px-4 py-2 w-[108px]">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${c.borderCard} ${c.bgSurface}`}>
                        {(() => {
                          const Icon = getMasterIconOption(item.iconKey, DEFAULT_SKILL_ICON_KEY).icon;
                          return <Icon className="h-4 w-4 text-cyan-600" />;
                        })()}
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-[13px] font-medium ${c.textPrimary}`}>{item.name}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEditDialog("skill", item)}
                        className={`mr-2 ${iconButtonClass}`}
                        aria-label={`${item.name}を編集`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteSkill(item.id)}
                        className={iconDeleteButtonClass}
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
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>謫堺ｽ・</th>
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
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>担当者名</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>電話番号</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>単価</th>
                  <th className={`px-4 py-3 text-left text-[12px] ${c.textMuted}`}>ステータス</th>
                  <th className={`px-4 py-3 text-right text-[12px] ${c.textMuted}`}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDispatchCompanies.map((item) => (
                  <tr key={item.id} className={`border-b ${c.borderCard} ${c.bgCardHover}`}>
                    <td className={`px-4 py-2 text-[13px] font-medium ${c.textPrimary}`}>{item.name}</td>
                    <td className={`px-4 py-2 text-[12px] ${c.textSecondary}`}>{item.contactName || "-"}</td>
                    <td className={`px-4 py-2 text-[12px] ${c.textSecondary}`}>{item.phone || "-"}</td>
                    <td className={`px-4 py-2 w-[140px] text-[13px] ${c.textPrimary}`}>{item.unitPrice.toLocaleString()} 円</td>
                    <td className="px-4 py-2 w-[180px]">
                      <span
                        className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          item.status === "active"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {statusLabelMap[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEditDialog("dispatchCompany", item)}
                        className={`mr-2 ${iconButtonClass}`}
                        aria-label={`${item.name}を編集`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => deleteDispatchCompany(item.id)} className={iconDeleteButtonClass}><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}

        <EditDialogShell
          open={Boolean(editDialog)}
          title={
            editDialog?.type === "shipper"
              ? editDialog.mode === "create"
                ? "荷主を追加"
                : "荷主を編集"
              : editDialog?.type === "site"
                ? editDialog.mode === "create"
                  ? "拠点を追加"
                  : "拠点を編集"
                : editDialog?.type === "process"
                  ? editDialog.mode === "create"
                    ? "業務を追加"
                    : "業務を編集"
                  : editDialog?.type === "workflow"
                    ? editDialog.mode === "create"
                      ? "業務フローを追加"
                      : "業務フローを編集"
                    : editDialog?.type === "qualification"
                      ? editDialog.mode === "create"
                        ? "資格を追加"
                        : "資格を編集"
                      : editDialog?.type === "skill"
                        ? editDialog.mode === "create"
                          ? "スキルを追加"
                          : "スキルを編集"
                        : editDialog?.type === "dispatchCompany"
                          ? editDialog.mode === "create"
                            ? "派遣会社を追加"
                            : "派遣会社を編集"
                          : ""
          }
          description={
            editDialog?.type === "shipper"
              ? editDialog.mode === "create"
                ? "荷主名とステータスを入力して追加します。"
                : "荷主名とステータスを更新します。"
              : editDialog?.type === "site"
                ? editDialog.mode === "create"
                  ? "拠点情報を入力して追加します。"
                  : "拠点名と住所を更新します。"
                : editDialog?.type === "process"
                ? editDialog.mode === "create"
                    ? "標準UPHと必要条件を設定して追加します。"
                    : "標準UPHと必要条件をまとめて編集します。"
                  : editDialog?.type === "workflow"
                    ? editDialog.mode === "create"
                      ? "構成業務を選んで業務フローを追加します。"
                      : "業務フロー名と構成業務を編集します。"
                    : editDialog?.type === "qualification"
                      ? editDialog.mode === "create"
                        ? "資格名とアイコンを設定して追加します。"
                        : "資格名とアイコンを編集します。"
                      : editDialog?.type === "skill"
                        ? editDialog.mode === "create"
                          ? "スキル名とアイコンを設定して追加します。"
                          : "スキル名とアイコンを編集します。"
                        : editDialog?.type === "dispatchCompany"
                          ? editDialog.mode === "create"
                            ? "派遣会社の基本情報を入力して追加します。"
                            : "派遣会社の基本情報を編集します。"
                          : undefined
          }
          onClose={closeEditDialog}
          onSave={handleEditDialogSave}
          saveLabel={editDialog?.mode === "create" ? "追加" : "保存"}
          saveDisabled={editDialogSaveDisabled}
        >
          {editDialog?.type === "shipper" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>荷主名</span>
                  <input
                    value={editDialog.value.name}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "shipper"
                          ? { ...prev, value: { ...prev.value, name: event.target.value } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  />
                </label>
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>ステータス</span>
                  <select
                    value={editDialog.value.status}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "shipper"
                          ? { ...prev, value: { ...prev.value, status: event.target.value as MasterStatus } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  >
                    <option value="active">有効</option>
                    <option value="inactive">無効</option>
                  </select>
                </label>
              </div>
              <div className="space-y-2">
                <span className={`text-[12px] font-semibold ${c.textMuted}`}>対応拠点</span>
                {renderTagList((shipperSitesMap.get(editDialog.value.id) ?? []).map((site) => site.name))}
              </div>
            </>
          ) : null}

          {editDialog?.type === "site" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>拠点名</span>
                  <input
                    value={editDialog.value.name}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "site"
                          ? { ...prev, value: { ...prev.value, name: event.target.value } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  />
                </label>
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>代表荷主</span>
                  <select
                    value={editDialog.value.shipperId ?? ""}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "site"
                          ? {
                              ...prev,
                              value: {
                                ...prev.value,
                                shipperId: event.target.value ? event.target.value : undefined,
                              },
                            }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  >
                    <option value="">未設定</option>
                    {shippers.map((shipper) => (
                      <option key={shipper.id} value={shipper.id}>
                        {shipper.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="space-y-2">
                <span className={`text-[12px] font-semibold ${c.textMuted}`}>住所</span>
                <input
                  value={editDialog.value.address}
                  onChange={(event) =>
                    setEditDialog((prev) =>
                      prev?.type === "site"
                        ? { ...prev, value: { ...prev.value, address: event.target.value } }
                        : prev,
                    )
                  }
                  className={`${inputClass} w-full`}
                />
              </label>
              <div className="space-y-2">
                <span className={`text-[12px] font-semibold ${c.textMuted}`}>関連荷主</span>
                {renderTagList(getShippersForSite(editDialog.value.id).map((shipper) => shipper.name))}
              </div>
            </>
          ) : null}

          {editDialog?.type === "process" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>業務名</span>
                  <input
                    value={editDialog.value.name}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "process"
                          ? { ...prev, value: { ...prev.value, name: event.target.value } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  />
                </label>
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>説明</span>
                  <input
                    value={editDialog.value.description}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "process"
                          ? { ...prev, value: { ...prev.value, description: event.target.value } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-1">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>標準UPH</span>
                  <input
                    value={editDialog.value.defaultUph}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "process"
                          ? {
                              ...prev,
                              value: { ...prev.value, defaultUph: Math.max(0, Number(event.target.value) || 0) },
                            }
                          : prev,
                      )
                    }
                    type="number"
                    min="0"
                    className={`${inputClass} w-full`}
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>既定資格</span>
                  <CompactMultiSelect
                    options={qualifications}
                    selectedIds={editDialog.value.defaultQualificationIds}
                    onChange={(ids) =>
                      setEditDialog((prev) =>
                        prev?.type === "process"
                          ? { ...prev, value: { ...prev.value, defaultQualificationIds: ids } }
                          : prev,
                      )
                    }
                    placeholder="資格を選択"
                  />
                </div>
                <div className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>既定スキル</span>
                  <CompactMultiSelect
                    options={skills}
                    selectedIds={editDialog.value.defaultSkillIds}
                    onChange={(ids) =>
                      setEditDialog((prev) =>
                        prev?.type === "process"
                          ? { ...prev, value: { ...prev.value, defaultSkillIds: ids } }
                          : prev,
                      )
                    }
                    placeholder="スキルを選択"
                  />
                </div>
              </div>
            </>
          ) : null}

          {editDialog?.type === "workflow" ? (
            <>
              <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>業務フロー名</span>
                  <input
                    value={editDialog.value.name}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "workflow"
                          ? { ...prev, value: { ...prev.value, name: event.target.value } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  />
                </label>
                <div className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>対象拠点</span>
                  <div className={`${inputClass} flex min-h-[44px] items-center bg-slate-50 text-[13px] ${c.textSecondary}`}>
                    {siteMap.get(editDialog.value.siteId)?.name ?? "未設定"}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <span className={`text-[12px] font-semibold ${c.textMuted}`}>構成業務</span>
                <CompactMultiSelect
                  options={processes}
                  selectedIds={editDialog.value.steps.map((step) => step.processId)}
                  onChange={(ids) =>
                    setEditDialog((prev) =>
                      prev?.type === "workflow"
                        ? { ...prev, value: { ...prev.value, steps: buildWorkflowSteps(ids, prev.value.steps) } }
                        : prev,
                    )
                  }
                  placeholder="業務を選択"
                />
                <p className={`text-[11px] ${c.textMuted}`}>選択した内容で業務フローを更新します。</p>
              </div>
            </>
          ) : null}

          {editDialog?.type === "qualification" ? (
            <div className="grid gap-4 md:grid-cols-[120px_1fr]">
              <div className="space-y-2">
                <span className={`text-[12px] font-semibold ${c.textMuted}`}>アイコン</span>
                <IconPicker
                  value={editDialog.value.iconKey ?? DEFAULT_QUALIFICATION_ICON_KEY}
                  onChange={(iconKey) =>
                    setEditDialog((prev) =>
                      prev?.type === "qualification"
                        ? { ...prev, value: { ...prev.value, iconKey } }
                        : prev,
                    )
                  }
                  fallback={DEFAULT_QUALIFICATION_ICON_KEY}
                  tone="qualification"
                />
              </div>
              <label className="space-y-2">
                <span className={`text-[12px] font-semibold ${c.textMuted}`}>資格名</span>
                <input
                  value={editDialog.value.name}
                  onChange={(event) =>
                    setEditDialog((prev) =>
                      prev?.type === "qualification"
                        ? { ...prev, value: { ...prev.value, name: event.target.value } }
                        : prev,
                    )
                  }
                  className={`${inputClass} w-full`}
                />
              </label>
            </div>
          ) : null}

          {editDialog?.type === "skill" ? (
            <div className="grid gap-4 md:grid-cols-[120px_1fr]">
              <div className="space-y-2">
                <span className={`text-[12px] font-semibold ${c.textMuted}`}>アイコン</span>
                <IconPicker
                  value={editDialog.value.iconKey ?? DEFAULT_SKILL_ICON_KEY}
                  onChange={(iconKey) =>
                    setEditDialog((prev) =>
                      prev?.type === "skill"
                        ? { ...prev, value: { ...prev.value, iconKey } }
                        : prev,
                    )
                  }
                  fallback={DEFAULT_SKILL_ICON_KEY}
                  tone="skill"
                />
              </div>
              <label className="space-y-2">
                <span className={`text-[12px] font-semibold ${c.textMuted}`}>スキル名</span>
                <input
                  value={editDialog.value.name}
                  onChange={(event) =>
                    setEditDialog((prev) =>
                      prev?.type === "skill"
                        ? { ...prev, value: { ...prev.value, name: event.target.value } }
                        : prev,
                    )
                  }
                  className={`${inputClass} w-full`}
                />
              </label>
            </div>
          ) : null}

          {editDialog?.type === "dispatchCompany" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>派遣会社名</span>
                  <input
                    value={editDialog.value.name}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "dispatchCompany"
                          ? { ...prev, value: { ...prev.value, name: event.target.value } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  />
                </label>
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>担当者名</span>
                  <input
                    value={editDialog.value.contactName}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "dispatchCompany"
                          ? { ...prev, value: { ...prev.value, contactName: event.target.value } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>電話番号</span>
                  <input
                    value={editDialog.value.phone}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "dispatchCompany"
                          ? { ...prev, value: { ...prev.value, phone: event.target.value } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  />
                </label>
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>単価</span>
                  <input
                    value={editDialog.value.unitPrice}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "dispatchCompany"
                          ? { ...prev, value: { ...prev.value, unitPrice: Math.max(0, Number(event.target.value) || 0) } }
                          : prev,
                      )
                    }
                    type="number"
                    min="0"
                    className={`${inputClass} w-full`}
                  />
                </label>
                <label className="space-y-2">
                  <span className={`text-[12px] font-semibold ${c.textMuted}`}>ステータス</span>
                  <select
                    value={editDialog.value.status}
                    onChange={(event) =>
                      setEditDialog((prev) =>
                        prev?.type === "dispatchCompany"
                          ? { ...prev, value: { ...prev.value, status: event.target.value as MasterStatus } }
                          : prev,
                      )
                    }
                    className={`${inputClass} w-full`}
                  >
                    <option value="active">有効</option>
                    <option value="inactive">無効</option>
                  </select>
                </label>
              </div>
            </>
          ) : null}
        </EditDialogShell>

      </div>
    </div>
  );
}

function EditDialogShell({
  open,
  title,
  description,
  onClose,
  onSave,
  saveLabel,
  saveDisabled,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  const c = useThemeColors();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/35 px-4 py-6">
      <button type="button" aria-label="閉じる" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className={`relative z-[121] flex max-h-[calc(100vh-48px)] w-full max-w-[720px] flex-col overflow-hidden rounded-[28px] border ${c.border} ${c.bgCard} shadow-[0_28px_80px_-32px_rgba(15,23,42,0.45)]`}>
        <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${c.border}`}>
          <div>
            <h2 className={`text-[18px] font-semibold ${c.textPrimary}`}>{title}</h2>
            {description ? <p className={`mt-1 text-[12px] leading-5 ${c.textSecondary}`}>{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-all hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700`}
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">{children}</div>
        </div>

        <div className={`flex items-center justify-end gap-3 border-t px-6 py-4 ${c.border}`}>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-[42px] items-center justify-center rounded-xl border px-4 text-[13px] font-semibold transition-all ${c.borderCard} ${c.bgSurface} ${c.textSecondary} hover:bg-slate-50`}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            className="inline-flex h-[42px] items-center justify-center rounded-xl bg-[#155DFC] px-4 text-[13px] font-semibold text-white transition-all hover:bg-[#0F4FE3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveLabel ?? "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}






