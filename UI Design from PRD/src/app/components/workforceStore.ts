import { defaultMasterData, type QualificationMaster, type SkillMaster } from "./masterStore";
import { buildDeploymentWorkerIdFromUserId, readUsersFromStorage, type User } from "./userStore";

const MASTER_DATA_STORAGE_KEY = "fluxview-master-data-v3";
const LEGACY_MASTER_DATA_STORAGE_KEY = "fluxview-master-data-v2";
const FIELD_DEPLOYMENT_WORKER_NOTES_STORAGE_KEY = "fluxview-field-worker-notes-v1";
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

type WorkforceMasterData = {
  qualifications: QualificationMaster[];
  skills: SkillMaster[];
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

  return users.map((user, index) => {
    const workerId = resolveDeploymentWorkerId(user, index);
    return {
      id: workerId,
      userId: user.id,
      name: user.name,
      initials: buildInitials(user),
      color: resolveColor(index),
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
  return users.map((user, index) => ({
    id: resolveDeploymentWorkerId(user, index),
    userId: user.id,
    name: user.name,
    initials: buildInitials(user),
    color: resolveColor(index),
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
