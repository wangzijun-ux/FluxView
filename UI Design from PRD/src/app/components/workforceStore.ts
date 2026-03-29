import { defaultMasterData, type QualificationMaster, type SkillMaster } from "./masterStore";
import { buildDeploymentWorkerIdFromUserId, readUsersFromStorage, type User } from "./userStore";

const MASTER_DATA_STORAGE_KEY = "fluxview-master-data-v3";
const LEGACY_MASTER_DATA_STORAGE_KEY = "fluxview-master-data-v2";
const FIELD_DEPLOYMENT_WORKER_NOTES_STORAGE_KEY = "fluxview-field-worker-notes-v1";
const MANAGEMENT_TEAM_STORAGE_KEY = "fluxview-management-teams-v1";
const DEPLOYMENT_COLORS = [
  "bg-pink-500",
  "bg-teal-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
  "bg-lime-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-slate-400",
  "bg-gray-400",
] as const;
const TEAM_COLOR_CLASS_MAP = {
  blue: "bg-[#155DFC]",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  slate: "bg-slate-400",
} as const;

type WorkforceMasterData = {
  qualifications: QualificationMaster[];
  skills: SkillMaster[];
};

type StoredManagementTeam = {
  id: string;
  memberUserIds: string[];
  themeColor?: string;
};

export type DeploymentWorkerStatus = "active" | "break" | "absent";
export type AttendanceWorkerCategory = User["employmentType"];

export interface DeploymentWorker {
  id: string;
  userId: string;
  name: string;
  initials: string;
  color: string;
  qualificationIds: string[];
  skillIds: string[];
  status: DeploymentWorkerStatus;
  note?: string;
}

export interface AttendanceWorker {
  id: string;
  userId: string;
  name: string;
  initials: string;
  color: string;
  skills: { label: string; icon: string }[];
  status: DeploymentWorkerStatus;
  shiftStart?: string;
  shiftEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  category: AttendanceWorkerCategory;
}

function readJsonStorage<T>(storageKey: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function readMasterData(): WorkforceMasterData {
  const stored = readJsonStorage<Partial<WorkforceMasterData>>(MASTER_DATA_STORAGE_KEY)
    ?? readJsonStorage<Partial<WorkforceMasterData>>(LEGACY_MASTER_DATA_STORAGE_KEY);

  return {
    qualifications: Array.isArray(stored?.qualifications) ? stored.qualifications : defaultMasterData.qualifications,
    skills: Array.isArray(stored?.skills) ? stored.skills : defaultMasterData.skills,
  };
}

function normalizeName(value: string) {
  return value.replace(/[\s\u3000]/g, "");
}

function buildInitials(user: User) {
  if (user.avatar?.trim()) return user.avatar.trim().slice(0, 2);
  const normalized = normalizeName(user.name);
  return Array.from(normalized).slice(0, 2).join("") || "員";
}

function resolveColor(index: number) {
  return DEPLOYMENT_COLORS[index % DEPLOYMENT_COLORS.length];
}

function readManagementTeams() {
  const teams = readJsonStorage<StoredManagementTeam[]>(MANAGEMENT_TEAM_STORAGE_KEY);
  if (!Array.isArray(teams)) return [];
  return teams.filter(
    (team): team is StoredManagementTeam =>
      !!team &&
      typeof team.id === "string" &&
      Array.isArray(team.memberUserIds),
  );
}

function buildTeamColorMap() {
  const colorMap = new Map<string, string>();
  readManagementTeams().forEach((team) => {
    const teamColorClass =
      (team.themeColor && TEAM_COLOR_CLASS_MAP[team.themeColor as keyof typeof TEAM_COLOR_CLASS_MAP]) ||
      TEAM_COLOR_CLASS_MAP.blue;
    team.memberUserIds.forEach((userId) => {
      if (!colorMap.has(userId)) {
        colorMap.set(userId, teamColorClass);
      }
    });
  });
  return colorMap;
}

function mapUserStatus(status: User["status"]): DeploymentWorkerStatus {
  switch (status) {
    case "inactive":
      return "absent";
    case "locked":
      return "break";
    default:
      return "active";
  }
}

function createDefaultNote(user: User) {
  const primarySkill = user.skills[0]?.name ?? "";
  if (!primarySkill) return "新人";
  if (primarySkill.includes("ピッキング")) return "ピッキング担当";
  if (primarySkill.includes("梱包")) return "梱包担当";
  if (primarySkill.includes("検品")) return "検品担当";
  if (primarySkill.includes("仕分け")) return "仕分け担当";
  if (primarySkill.includes("フォークリフト")) return "リフト担当";
  if (primarySkill.includes("RFID")) return "RFID担当";
  return `${primarySkill.replace(/作業|操作/g, "")}担当`;
}

function buildCapabilityIdMap<T extends { id: string; name: string }>(items: T[]) {
  return new Map(items.map((item) => [item.name, item.id]));
}

function resolveDeploymentWorkerId(user: User, index: number) {
  return user.deploymentWorkerId?.trim() || buildDeploymentWorkerIdFromUserId(user.id, index);
}

function buildAttendanceSkillChips(user: User) {
  return user.skills.map((skill) => ({
    label: skill.name.replace(/作業|操作/g, ""),
    icon: "•",
  }));
}

export function readDeploymentWorkers() {
  const users = readUsersFromStorage();
  const masterData = readMasterData();
  const qualificationIdByName = buildCapabilityIdMap(masterData.qualifications);
  const skillIdByName = buildCapabilityIdMap(masterData.skills);
  const storedNotes = readJsonStorage<Record<string, string>>(FIELD_DEPLOYMENT_WORKER_NOTES_STORAGE_KEY) ?? {};
  const teamColorMap = buildTeamColorMap();

  return users.map((user, index) => {
    const workerId = resolveDeploymentWorkerId(user, index);
    return {
      id: workerId,
      userId: user.id,
      name: user.name,
      initials: buildInitials(user),
      color: teamColorMap.get(user.id) ?? TEAM_COLOR_CLASS_MAP.slate ?? resolveColor(index),
      qualificationIds: user.certifications.flatMap((item) => qualificationIdByName.get(item.name) ?? []),
      skillIds: user.skills.flatMap((item) => skillIdByName.get(item.name) ?? []),
      status: mapUserStatus(user.status),
      note:
        typeof storedNotes[workerId] === "string" && storedNotes[workerId].trim()
          ? storedNotes[workerId].trim()
          : createDefaultNote(user),
    } satisfies DeploymentWorker;
  });
}

export function readAttendanceWorkers() {
  const users = readUsersFromStorage();
  const teamColorMap = buildTeamColorMap();
  return users.map((user, index) => ({
    id: resolveDeploymentWorkerId(user, index),
    userId: user.id,
    name: user.name,
    initials: buildInitials(user),
    color: teamColorMap.get(user.id) ?? TEAM_COLOR_CLASS_MAP.slate ?? resolveColor(index),
    skills: buildAttendanceSkillChips(user),
    status: mapUserStatus(user.status),
    category: user.employmentType,
  })) satisfies AttendanceWorker[];
}

export function resolveDeploymentWorkerIdForUser(userId: string) {
  const users = readUsersFromStorage();
  const userIndex = users.findIndex((user) => user.id === userId);
  if (userIndex === -1) {
    return readDeploymentWorkers().find((worker) => worker.status === "active")?.id ?? "worker-1";
  }

  return resolveDeploymentWorkerId(users[userIndex], userIndex);
}
