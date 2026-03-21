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
  type DispatchCompany,
  defaultMasterData,
  type MasterDataSnapshot,
  type ProcessMaster,
  type QualificationMaster,
  type Shipper,
  type Site,
  type SkillMaster,
  type WorkflowDefinition,
  type WorkflowStepSetting,
} from "./masterStore";
import {
  DEFAULT_QUALIFICATION_ICON_KEY,
  DEFAULT_SKILL_ICON_KEY,
  normalizeMasterIconKey,
} from "./masterIconOptions";
import { ensureDemoWorkerSubmissionData } from "./workerMobileStore";

const STORAGE_KEY = "fluxview-master-data-v3";
const LEGACY_STORAGE_KEY = "fluxview-master-data-v2";
const SELECTED_SITE_KEY = "fluxview-selected-site-v1";

interface MasterDataContextType {
  shippers: Shipper[];
  setShippers: Dispatch<SetStateAction<Shipper[]>>;
  sites: Site[];
  setSites: Dispatch<SetStateAction<Site[]>>;
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
  return sites.map((site) => ({
    id: site.id,
    siteId: site.id,
    name: site.name,
    description: site.address ?? "",
  }));
}

function normalizeWorkflowSteps(value: unknown): WorkflowStepSetting[] {
  if (!Array.isArray(value)) return [];

  return value.map((rawStep, index) => {
    const step = rawStep as Partial<WorkflowStepSetting>;
    return {
      id: typeof step.id === "string" && step.id.trim() ? step.id : `step-${Date.now()}-${index}`,
      processId: typeof step.processId === "string" ? step.processId : "",
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
  fallback: WorkflowDefinition[],
) {
  const source = Array.isArray(value) ? value : fallback;

  return source.map((rawWorkflow, index) => {
    const workflow = rawWorkflow as Partial<WorkflowDefinition> & { areaId?: string };
    return {
      id: typeof workflow.id === "string" && workflow.id.trim() ? workflow.id : `workflow-${Date.now()}-${index}`,
      name: normalizeWorkflowName(workflow, shippers, sites, legacyAreas),
      shipperId: typeof workflow.shipperId === "string" ? workflow.shipperId : shippers[0]?.id ?? "",
      siteId:
        typeof workflow.siteId === "string" && workflow.siteId
          ? workflow.siteId
          : typeof workflow.areaId === "string" && workflow.areaId
            ? workflow.areaId
            : sites[0]?.id ?? "",
      steps: normalizeWorkflowSteps(workflow.steps),
      updatedAt:
        typeof workflow.updatedAt === "string" && workflow.updatedAt
          ? workflow.updatedAt
          : new Date().toISOString(),
    } satisfies WorkflowDefinition;
  });
}

function readInitialData(): MasterDataSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return defaultMasterData;
    const parsed = JSON.parse(raw);
    const shippers = asArray(parsed.shippers, defaultMasterData.shippers);
    const sites = asArray(parsed.sites, defaultMasterData.sites);
    const legacyAreas = asArray(parsed.areas, []);

    return {
      shippers,
      sites,
      qualifications: normalizeQualifications(parsed.qualifications),
      skills: normalizeSkills(parsed.skills),
      dispatchCompanies: asArray(parsed.dispatchCompanies, defaultMasterData.dispatchCompanies),
      processes: asArray(parsed.processes, defaultMasterData.processes),
      workflows: normalizeWorkflows(parsed.workflows, shippers, sites, legacyAreas, defaultMasterData.workflows),
    };
  } catch {
    return defaultMasterData;
  }
}

function readInitialSelectedSiteId(sites: Site[]) {
  try {
    const raw = localStorage.getItem(SELECTED_SITE_KEY);
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
      return normalizeWorkflows(resolved, shippers, sites, areas, prev);
    });
  };

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
        JSON.stringify({
          shippers,
          sites,
          qualifications,
          skills,
          dispatchCompanies,
          processes,
          workflows: workflowState,
        }),
      );
  }, [shippers, sites, qualifications, skills, dispatchCompanies, processes, workflowState]);

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
      resetMasterData: () => {
        setShippers(defaultMasterData.shippers);
        setSites(defaultMasterData.sites);
        setQualifications(defaultMasterData.qualifications);
        setSkills(defaultMasterData.skills);
        setDispatchCompanies(defaultMasterData.dispatchCompanies);
        setProcesses(defaultMasterData.processes);
        setWorkflowState(defaultMasterData.workflows);
        setSelectedSiteId(defaultMasterData.sites[0]?.id ?? "");
      },
    }),
    [shippers, sites, areas, qualifications, skills, dispatchCompanies, processes, workflows, selectedSiteId],
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
