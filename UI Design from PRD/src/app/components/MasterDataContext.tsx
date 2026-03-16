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
  type DispatchCompany,
  defaultMasterData,
  type AreaMaster,
  type ProcessMaster,
  type QualificationMaster,
  type Shipper,
  type Site,
  type SkillMaster,
  type WorkflowDefinition,
} from "./masterStore";
import { ensureDemoWorkerSubmissionData } from "./workerMobileStore";

const STORAGE_KEY = "fluxview-master-data-v2";
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

function readInitialData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMasterData;
    const parsed = JSON.parse(raw);
    return {
      shippers: asArray(parsed.shippers, defaultMasterData.shippers),
      sites: asArray(parsed.sites, defaultMasterData.sites),
      areas: asArray(parsed.areas, defaultMasterData.areas),
      qualifications: asArray(parsed.qualifications, defaultMasterData.qualifications),
      skills: asArray(parsed.skills, defaultMasterData.skills),
      dispatchCompanies: asArray(parsed.dispatchCompanies, defaultMasterData.dispatchCompanies),
      processes: asArray(parsed.processes, defaultMasterData.processes),
      workflows: asArray(parsed.workflows, defaultMasterData.workflows),
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
    areas: data.areas,
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
  const [areas, setAreas] = useState<AreaMaster[]>(initial.areas);
  const [qualifications, setQualifications] = useState<QualificationMaster[]>(initial.qualifications);
  const [skills, setSkills] = useState<SkillMaster[]>(initial.skills);
  const [dispatchCompanies, setDispatchCompanies] = useState<DispatchCompany[]>(initial.dispatchCompanies);
  const [processes, setProcesses] = useState<ProcessMaster[]>(initial.processes);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>(initial.workflows);
  const [selectedSiteId, setSelectedSiteId] = useState(initial.selectedSiteId);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        shippers,
        sites,
        areas,
        qualifications,
        skills,
        dispatchCompanies,
        processes,
        workflows,
      }),
    );
  }, [shippers, sites, areas, qualifications, skills, dispatchCompanies, processes, workflows]);

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
        setAreas(defaultMasterData.areas);
        setQualifications(defaultMasterData.qualifications);
        setSkills(defaultMasterData.skills);
        setDispatchCompanies(defaultMasterData.dispatchCompanies);
        setProcesses(defaultMasterData.processes);
        setWorkflows(defaultMasterData.workflows);
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
