import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  type AreaMaster,
  defaultMasterData,
  type DispatchCompany,
  type MasterDataSnapshot,
  type ProcessMaster,
  type QualificationMaster,
  type Shipper,
  type Site,
  type SiteLayoutArea,
  type SiteShipperRelation,
  type SkillMaster,
  type WorkflowDefinition,
  type WorkflowStepSetting,
} from "./masterStore";
import {
  DEFAULT_QUALIFICATION_ICON_KEY,
  DEFAULT_SKILL_ICON_KEY,
  normalizeMasterIconKey,
} from "./masterIconOptions";
import {
  getPrimaryShipperForSite,
  getShippersForSite as listShippersForSite,
  getSiteShipperRelationsForSite as listRelationsForSite,
  migrateSiteShipperRelations,
  resolveSiteShipperRelationStatus,
} from "./siteShipperUtils";
import { ensureDemoWorkerSubmissionData } from "./workerMobileStore";

const STORAGE_KEY = "fluxview-master-data-v4";
const LEGACY_STORAGE_KEYS = ["fluxview-master-data-v3", "fluxview-master-data-v2"];
const SITE_SHIPPER_RELATIONS_STORAGE_KEY = "siteShipperRelations";
const SELECTED_SITE_KEY = "selectedSiteId";
const LEGACY_SELECTED_SITE_KEY = "fluxview-selected-site-v1";

interface MasterDataContextType {
  shippers: Shipper[];
  setShippers: Dispatch<SetStateAction<Shipper[]>>;
  sites: Site[];
  setSites: Dispatch<SetStateAction<Site[]>>;
  siteShipperRelations: SiteShipperRelation[];
  setSiteShipperRelations: Dispatch<SetStateAction<SiteShipperRelation[]>>;
  areas: AreaMaster[];
  setAreas: Dispatch<SetStateAction<AreaMaster[]>>;
  qualifications: QualificationMaster[];
  setQualifications: Dispatch<SetStateAction<QualificationMaster[]>>;
  skills: SkillMaster[];
  setSkills: Dispatch<SetStateAction<SkillMaster[]>>;
  dispatchCompanies: DispatchCompany[];
  setDispatchCompanies: Dispatch<SetStateAction<DispatchCompany[]>>;
  processes: ProcessMaster[];
  setProcesses: Dispatch<SetStateAction<ProcessMaster[]>>;
  workflows: WorkflowDefinition[];
  setWorkflows: Dispatch<SetStateAction<WorkflowDefinition[]>>;
  selectedSiteId: string;
  setSelectedSiteId: Dispatch<SetStateAction<string>>;
  getSiteShipperRelationsForSite: (siteId: string) => SiteShipperRelation[];
  getShippersForSite: (siteId: string) => Shipper[];
  getPrimaryShipperForSite: (siteId: string) => Shipper | null;
  resetMasterData: () => void;
}

const MasterDataContext = createContext<MasterDataContextType | null>(null);

const asArray = <T,>(value: unknown, fallback: T[]): T[] =>
  Array.isArray(value) ? (value as T[]) : fallback;

const defaultQualificationById = new Map(
  defaultMasterData.qualifications.map((item) => [item.id, item]),
);
const defaultQualificationByName = new Map(
  defaultMasterData.qualifications.map((item) => [item.name, item]),
);
const defaultSkillById = new Map(
  defaultMasterData.skills.map((item) => [item.id, item]),
);
const defaultSkillByName = new Map(
  defaultMasterData.skills.map((item) => [item.name, item]),
);

function formatDateInput(date: Date) {
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

function buildDefaultSiteLayoutAreas(siteId: string): SiteLayoutArea[] {
  return [
    {
      id: `${siteId}-area-main`,
      name: "メインエリア",
      description: "主要な作業エリア",
    },
  ];
}

function normalizeSiteLayoutAreas(value: unknown, siteId: string): SiteLayoutArea[] {
  if (!Array.isArray(value)) return buildDefaultSiteLayoutAreas(siteId);

  return value
    .map((rawArea, index) => {
      const area = rawArea as Partial<SiteLayoutArea>;
      const fallback = buildDefaultSiteLayoutAreas(siteId)[0];
      return {
        id: typeof area.id === "string" && area.id.trim() ? area.id.trim() : `${siteId}-area-${index + 1}`,
        name: typeof area.name === "string" && area.name.trim() ? area.name.trim() : `${fallback.name} ${index + 1}`,
        description: typeof area.description === "string" ? area.description.trim() : "",
      } satisfies SiteLayoutArea;
    })
    .filter((area) => area.name.length > 0);
}

function readStorageSnapshot() {
  const candidateKeys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

  for (const key of candidateKeys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as Partial<MasterDataSnapshot> & { areas?: AreaMaster[] };
      }
    } catch {
      // Ignore broken storage and continue to the next candidate.
    }
  }

  return null;
}

function normalizeShippers(value: unknown): Shipper[] {
  const source = asArray(value, defaultMasterData.shippers);

  return source.map((rawShipper, index) => {
    const shipper = rawShipper as Partial<Shipper>;
    const fallback = defaultMasterData.shippers[index];

    return {
      id: typeof shipper.id === "string" && shipper.id.trim() ? shipper.id : fallback?.id ?? `shipper-${index + 1}`,
      name: typeof shipper.name === "string" && shipper.name.trim() ? shipper.name.trim() : fallback?.name ?? `荷主 ${index + 1}`,
      status: shipper.status === "inactive" ? "inactive" : "active",
      code: typeof shipper.code === "string" ? shipper.code.trim() : fallback?.code ?? "",
      contactPerson:
        typeof shipper.contactPerson === "string"
          ? shipper.contactPerson.trim()
          : fallback?.contactPerson ?? "",
      notes: typeof shipper.notes === "string" ? shipper.notes.trim() : fallback?.notes ?? "",
    } satisfies Shipper;
  });
}

function normalizeSites(value: unknown): Site[] {
  const source = asArray(value, defaultMasterData.sites);

  return source.map((rawSite, index) => {
    const site = rawSite as Partial<Site>;
    const fallback = defaultMasterData.sites[index];
    const resolvedSiteId =
      typeof site.id === "string" && site.id.trim() ? site.id : fallback?.id ?? `site-${index + 1}`;

    return {
      id: resolvedSiteId,
      name: typeof site.name === "string" && site.name.trim() ? site.name.trim() : fallback?.name ?? `拠点 ${index + 1}`,
      address: typeof site.address === "string" && site.address.trim() ? site.address.trim() : fallback?.address ?? "住所未設定",
      shipperId: typeof site.shipperId === "string" && site.shipperId.trim() ? site.shipperId : fallback?.shipperId,
      layoutAreas:
        Array.isArray(site.layoutAreas)
          ? normalizeSiteLayoutAreas(site.layoutAreas, resolvedSiteId)
          : Array.isArray(fallback?.layoutAreas)
            ? normalizeSiteLayoutAreas(fallback.layoutAreas, resolvedSiteId)
            : buildDefaultSiteLayoutAreas(resolvedSiteId),
    } satisfies Site;
  });
}

function normalizeQualifications(value: unknown): QualificationMaster[] {
  const source = asArray(value, defaultMasterData.qualifications);

  return source.map((rawQualification, index) => {
    const qualification = rawQualification as Partial<QualificationMaster>;
    const fallback =
      defaultQualificationById.get(qualification.id ?? "") ??
      defaultQualificationByName.get(qualification.name ?? "");

    return {
      id: typeof qualification.id === "string" && qualification.id.trim() ? qualification.id : `qual-${index + 1}`,
      name: typeof qualification.name === "string" && qualification.name.trim()
        ? qualification.name.trim()
        : fallback?.name ?? `資格 ${index + 1}`,
      iconKey: normalizeMasterIconKey(
        qualification.iconKey,
        fallback?.iconKey ?? DEFAULT_QUALIFICATION_ICON_KEY,
      ),
    } satisfies QualificationMaster;
  });
}

function normalizeSkills(value: unknown): SkillMaster[] {
  const source = asArray(value, defaultMasterData.skills);

  return source.map((rawSkill, index) => {
    const skill = rawSkill as Partial<SkillMaster>;
    const fallback =
      defaultSkillById.get(skill.id ?? "") ??
      defaultSkillByName.get(skill.name ?? "");

    return {
      id: typeof skill.id === "string" && skill.id.trim() ? skill.id : `skill-${index + 1}`,
      name: typeof skill.name === "string" && skill.name.trim()
        ? skill.name.trim()
        : fallback?.name ?? `スキル ${index + 1}`,
      iconKey: normalizeMasterIconKey(
        skill.iconKey,
        fallback?.iconKey ?? DEFAULT_SKILL_ICON_KEY,
      ),
    } satisfies SkillMaster;
  });
}

function buildCompatAreas(sites: Site[]): AreaMaster[] {
  return sites.flatMap((site) => {
    const layoutAreas = Array.isArray(site.layoutAreas)
      ? normalizeSiteLayoutAreas(site.layoutAreas, site.id)
      : buildDefaultSiteLayoutAreas(site.id);

    return layoutAreas.map((area) => ({
      id: area.id,
      siteId: site.id,
      name: area.name,
      description: area.description,
    }));
  });
}

function normalizeWorkflowSteps(value: unknown): WorkflowStepSetting[] {
  if (!Array.isArray(value)) return [];

  return value.map((rawStep, index) => {
    const step = rawStep as Partial<WorkflowStepSetting>;
    const normalizedLayoutAreaIds = Array.isArray(step.layoutAreaIds)
      ? step.layoutAreaIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : typeof (step as { layoutAreaId?: string }).layoutAreaId === "string" &&
          (step as { layoutAreaId?: string }).layoutAreaId?.trim()
        ? [(step as { layoutAreaId?: string }).layoutAreaId!.trim()]
        : [];
    return {
      id: typeof step.id === "string" && step.id.trim() ? step.id : `step-${Date.now()}-${index}`,
      processId: typeof step.processId === "string" ? step.processId : "",
      previousStepId:
        typeof step.previousStepId === "string" && step.previousStepId.trim().length > 0
          ? step.previousStepId.trim()
          : undefined,
      layoutAreaIds: normalizedLayoutAreaIds,
      requiredQualificationIds: asArray(step.requiredQualificationIds, []),
      requiredSkillIds: asArray(step.requiredSkillIds, []),
      standardHeadcount: typeof step.standardHeadcount === "number" ? step.standardHeadcount : 1,
      uph: typeof step.uph === "number" ? step.uph : 0,
      manual: typeof step.manual === "string" ? step.manual : "",
      caution: typeof step.caution === "string" ? step.caution : "",
    } satisfies WorkflowStepSetting;
  });
}

function normalizeWorkflowName(
  workflow: Partial<WorkflowDefinition> & { areaId?: string },
  shippers: Shipper[],
  sites: Site[],
  legacyAreas: Array<{ id?: string; name?: string }>,
) {
  const shipperName = shippers.find((shipper) => shipper.id === workflow.shipperId)?.name ?? "荷主";
  const siteName = sites.find((site) => site.id === workflow.siteId)?.name ?? "拠点";
  const fallbackName = `${shipperName}_${siteName}`;
  const rawName = typeof workflow.name === "string" && workflow.name.trim() ? workflow.name.trim() : fallbackName;
  const legacyAreaName = legacyAreas.find((area) => area.id === workflow.areaId)?.name;

  if (legacyAreaName && rawName === `${shipperName}_${siteName}_${legacyAreaName}`) {
    return fallbackName;
  }

  return rawName;
}

function normalizeWorkflows(
  value: unknown,
  shippers: Shipper[],
  sites: Site[],
  legacyAreas: Array<{ id?: string; name?: string }>,
  siteShipperRelations: SiteShipperRelation[],
  fallback: WorkflowDefinition[],
) {
  const source = Array.isArray(value) ? value : fallback;

  return source.map((rawWorkflow, index) => {
    const workflow = rawWorkflow as Partial<WorkflowDefinition> & { areaId?: string };
    const siteId =
      typeof workflow.siteId === "string" && workflow.siteId
        ? workflow.siteId
        : typeof workflow.areaId === "string" && workflow.areaId
          ? workflow.areaId
          : sites[0]?.id ?? "";
    const shipperId =
      typeof workflow.shipperId === "string" && workflow.shipperId
        ? workflow.shipperId
        : getPrimaryShipperForSite(siteId, shippers, siteShipperRelations)?.id ??
          sites.find((site) => site.id === siteId)?.shipperId ??
          shippers[0]?.id ??
          "";

    return {
      id: typeof workflow.id === "string" && workflow.id.trim() ? workflow.id : `workflow-${Date.now()}-${index}`,
      name: normalizeWorkflowName({ ...workflow, siteId, shipperId }, shippers, sites, legacyAreas),
      shipperId,
      siteId,
      steps: normalizeWorkflowSteps(workflow.steps),
      updatedAt:
        typeof workflow.updatedAt === "string" && workflow.updatedAt
          ? workflow.updatedAt
          : new Date().toISOString(),
    } satisfies WorkflowDefinition;
  });
}

function normalizeSiteShipperRelations(
  value: unknown,
  sites: Site[],
  shippers: Shipper[],
  workflows: WorkflowDefinition[],
) {
  const source = Array.isArray(value) ? value : [];
  const siteIds = new Set(sites.map((site) => site.id));
  const shipperIds = new Set(shippers.map((shipper) => shipper.id));
  const defaultStartDate = formatDateInput(new Date());
  const defaultEndDate = formatDateInput(addYears(new Date(), 1));

  const normalized = source
    .map((rawRelation) => {
      const relation = rawRelation as Partial<SiteShipperRelation>;
      if (
        typeof relation.siteId !== "string" ||
        !siteIds.has(relation.siteId) ||
        typeof relation.shipperId !== "string" ||
        !shipperIds.has(relation.shipperId)
      ) {
        return null;
      }

      const status = relation.status === "suspended" || relation.status === "expired" ? relation.status : "active";

      return {
        id: typeof relation.id === "string" && relation.id.trim() ? relation.id : `${relation.siteId}-${relation.shipperId}`,
        siteId: relation.siteId,
        shipperId: relation.shipperId,
        contractStartDate:
          typeof relation.contractStartDate === "string" && relation.contractStartDate
            ? relation.contractStartDate
            : defaultStartDate,
        contractEndDate:
          typeof relation.contractEndDate === "string" && relation.contractEndDate
            ? relation.contractEndDate
            : defaultEndDate,
        contactPerson: typeof relation.contactPerson === "string" ? relation.contactPerson : "",
        contactTel: typeof relation.contactTel === "string" ? relation.contactTel : "",
        contactEmail: typeof relation.contactEmail === "string" ? relation.contactEmail : "",
        dedicatedProcessIds: asArray(relation.dedicatedProcessIds, []),
        priceConfig: asArray(relation.priceConfig, []),
        notes: typeof relation.notes === "string" ? relation.notes : "",
        status,
        createdAt:
          typeof relation.createdAt === "string" && relation.createdAt
            ? relation.createdAt
            : new Date().toISOString(),
        updatedAt:
          typeof relation.updatedAt === "string" && relation.updatedAt
            ? relation.updatedAt
            : new Date().toISOString(),
      } satisfies SiteShipperRelation;
    })
    .filter((relation): relation is SiteShipperRelation => Boolean(relation));

  return migrateSiteShipperRelations(sites, workflows, normalized);
}

function readInitialData(): MasterDataSnapshot {
  try {
    const parsed = readStorageSnapshot();
    if (!parsed) {
      return {
        ...defaultMasterData,
        sites: normalizeSites(defaultMasterData.sites),
      };
    }

    const shippers = normalizeShippers(parsed.shippers);
    const sites = normalizeSites(parsed.sites);
    const legacyAreas = asArray(parsed.areas, []);
    const rawRelations = (() => {
      const dedicated = localStorage.getItem(SITE_SHIPPER_RELATIONS_STORAGE_KEY);

      if (dedicated) {
        try {
          return JSON.parse(dedicated);
        } catch {
          // Ignore broken dedicated relation storage and fall back to the snapshot payload.
        }
      }

      return parsed.siteShipperRelations;
    })();

    const provisionalWorkflows = normalizeWorkflows(
      parsed.workflows,
      shippers,
      sites,
      legacyAreas,
      [],
      defaultMasterData.workflows,
    );
    const siteShipperRelations = normalizeSiteShipperRelations(rawRelations, sites, shippers, provisionalWorkflows);
    const workflows = normalizeWorkflows(
      parsed.workflows,
      shippers,
      sites,
      legacyAreas,
      siteShipperRelations,
      defaultMasterData.workflows,
    );

    return {
      shippers,
      sites,
      siteShipperRelations: normalizeSiteShipperRelations(rawRelations, sites, shippers, workflows),
      qualifications: normalizeQualifications(parsed.qualifications),
      skills: normalizeSkills(parsed.skills),
      dispatchCompanies: asArray(parsed.dispatchCompanies, defaultMasterData.dispatchCompanies),
      processes: asArray(parsed.processes, defaultMasterData.processes),
      workflows,
    };
  } catch {
    return {
      ...defaultMasterData,
      sites: normalizeSites(defaultMasterData.sites),
    };
  }
}

function readInitialSelectedSiteId(sites: Site[]) {
  try {
    const raw = localStorage.getItem(SELECTED_SITE_KEY) ?? localStorage.getItem(LEGACY_SELECTED_SITE_KEY);
    if (raw && sites.some((site) => site.id === raw)) return raw;
  } catch {
    // Ignore localStorage errors and fall back to the first site.
  }
  return sites[0]?.id ?? "";
}

function prepareInitialState() {
  const data = readInitialData();
  const selectedSiteId = readInitialSelectedSiteId(data.sites);

  ensureDemoWorkerSubmissionData({
    sites: data.sites,
    workflows: data.workflows,
    shippers: data.shippers,
    processes: data.processes,
  });

  return {
    ...data,
    selectedSiteId,
  };
}

export function MasterDataProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => prepareInitialState(), []);

  const [shippers, setShippers] = useState<Shipper[]>(initial.shippers);
  const [sites, setSites] = useState<Site[]>(initial.sites);
  const [siteShipperRelations, setSiteShipperRelations] = useState<SiteShipperRelation[]>(initial.siteShipperRelations);
  const [qualifications, setQualifications] = useState<QualificationMaster[]>(initial.qualifications);
  const [skills, setSkills] = useState<SkillMaster[]>(initial.skills);
  const [dispatchCompanies, setDispatchCompanies] = useState<DispatchCompany[]>(initial.dispatchCompanies);
  const [processes, setProcesses] = useState<ProcessMaster[]>(initial.processes);
  const [workflowState, setWorkflowState] = useState<WorkflowDefinition[]>(initial.workflows);
  const [selectedSiteId, setSelectedSiteId] = useState(initial.selectedSiteId);

  const areas = useMemo(() => buildCompatAreas(sites), [sites]);
  const workflows = useMemo(
    () => workflowState.map((workflow) => ({ ...workflow, areaId: workflow.siteId }) as WorkflowDefinition),
    [workflowState],
  );

  const setAreas: Dispatch<SetStateAction<AreaMaster[]>> = () => {
    // Area is no longer a managed system concept. Keep a no-op setter for legacy consumers.
  };

  const setWorkflows: Dispatch<SetStateAction<WorkflowDefinition[]>> = (value) => {
    setWorkflowState((prev) => {
      const compatPrev = prev.map((workflow) => ({ ...workflow, areaId: workflow.siteId }) as WorkflowDefinition);
      const resolved = typeof value === "function"
        ? (value as (current: WorkflowDefinition[]) => WorkflowDefinition[])(compatPrev)
        : value;

      return normalizeWorkflows(resolved, shippers, sites, areas, siteShipperRelations, prev);
    });
  };

  useEffect(() => {
    setSiteShipperRelations((prev) => {
      const siteIds = new Set(sites.map((site) => site.id));
      const shipperIds = new Set(shippers.map((shipper) => shipper.id));
      const next = prev.filter(
        (relation) => siteIds.has(relation.siteId) && shipperIds.has(relation.shipperId),
      );

      return next.length === prev.length ? prev : next;
    });
  }, [sites, shippers]);

  useEffect(() => {
    setSites((prev) => {
      const next = prev.map((site) => {
        const primaryShipperId = getPrimaryShipperForSite(site.id, shippers, siteShipperRelations)?.id;
        return site.shipperId === primaryShipperId ? site : { ...site, shipperId: primaryShipperId };
      });

      return next.every((site, index) => site === prev[index]) ? prev : next;
    });
  }, [shippers, siteShipperRelations]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        shippers,
        sites,
        siteShipperRelations,
        qualifications,
        skills,
        dispatchCompanies,
        processes,
        workflows: workflowState,
      }),
    );
    localStorage.setItem(
      SITE_SHIPPER_RELATIONS_STORAGE_KEY,
      JSON.stringify(siteShipperRelations),
    );
  }, [shippers, sites, siteShipperRelations, qualifications, skills, dispatchCompanies, processes, workflowState]);

  useEffect(() => {
    if (selectedSiteId && sites.some((site) => site.id === selectedSiteId)) return;
    setSelectedSiteId(sites[0]?.id ?? "");
  }, [selectedSiteId, sites]);

  useEffect(() => {
    localStorage.setItem(SELECTED_SITE_KEY, selectedSiteId);
  }, [selectedSiteId]);

  const value = useMemo<MasterDataContextType>(
    () => ({
      shippers,
      setShippers,
      sites,
      setSites,
      siteShipperRelations,
      setSiteShipperRelations,
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
      selectedSiteId,
      setSelectedSiteId,
      getSiteShipperRelationsForSite: (siteId: string) =>
        listRelationsForSite(siteShipperRelations, siteId).map((relation) => ({
          ...relation,
          status: resolveSiteShipperRelationStatus(relation),
        })),
      getShippersForSite: (siteId: string) =>
        listShippersForSite(siteId, shippers, siteShipperRelations),
      getPrimaryShipperForSite: (siteId: string) =>
        getPrimaryShipperForSite(siteId, shippers, siteShipperRelations),
      resetMasterData: () => {
        setShippers(defaultMasterData.shippers);
        setSites(normalizeSites(defaultMasterData.sites));
        setSiteShipperRelations(defaultMasterData.siteShipperRelations);
        setQualifications(defaultMasterData.qualifications);
        setSkills(defaultMasterData.skills);
        setDispatchCompanies(defaultMasterData.dispatchCompanies);
        setProcesses(defaultMasterData.processes);
        setWorkflowState(defaultMasterData.workflows);
        setSelectedSiteId(defaultMasterData.sites[0]?.id ?? "");
      },
    }),
    [
      shippers,
      sites,
      siteShipperRelations,
      areas,
      qualifications,
      skills,
      dispatchCompanies,
      processes,
      workflows,
      selectedSiteId,
    ],
  );

  return <MasterDataContext.Provider value={value}>{children}</MasterDataContext.Provider>;
}

export function useMasterData() {
  const context = useContext(MasterDataContext);
  if (!context) {
    throw new Error("useMasterData must be used within MasterDataProvider");
  }
  return context;
}
