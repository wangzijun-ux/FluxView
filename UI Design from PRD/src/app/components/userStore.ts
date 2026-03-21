import { defaultMasterData } from "./masterStore";

export interface SkillAssignment {
  name: string;
  level: number;
}

export interface CertificationAssignment {
  name: string;
  expiry: string;
  status: "valid" | "expiring" | "expired";
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  roleIds: string[];
  status: "active" | "inactive" | "locked";
  lastLogin: string;
  createdAt: string;
  mfaEnabled: boolean;
  employmentType: "正社員" | "パートナー" | "派遣";
  unitPrice: number;
  deploymentWorkerId?: string;
  dispatchCompanyId?: string;
  skills: SkillAssignment[];
  certifications: CertificationAssignment[];
  performance: {
    uph: number;
    attendanceRate: number;
  };
}

export const USER_STORAGE_KEY = "fluxview-users-v1";
export const DEFAULT_USER_UNIT_PRICE = 1150;
const MASTER_DATA_STORAGE_KEY = "fluxview-master-data-v3";
const LEGACY_MASTER_DATA_STORAGE_KEY = "fluxview-master-data-v2";

export function buildDeploymentWorkerIdFromUserId(userId: string, fallbackIndex = 0) {
  const numericPart = Number(userId.replace(/\D/g, ""));
  if (Number.isFinite(numericPart) && numericPart > 0) {
    return `worker-${numericPart}`;
  }
  return `worker-${fallbackIndex + 1}`;
}

export const initialUsers: User[] = [
  { id: "U001", name: "管理者 太郎", email: "admin@fluxview.jp", avatar: "管", roleIds: ["role-admin"], status: "active", lastLogin: "2026-03-04 09:45", createdAt: "2025-04-01", mfaEnabled: true, employmentType: "正社員", skills: [{ name: "検品", level: 5 }], certifications: [], performance: { uph: 168, attendanceRate: 98 } },
  { id: "U002", name: "山田 花子", email: "yamada@fluxview.jp", avatar: "山", roleIds: ["role-admin"], status: "active", lastLogin: "2026-03-04 08:30", createdAt: "2025-04-01", mfaEnabled: true, employmentType: "正社員", skills: [{ name: "梱包", level: 5 }], certifications: [], performance: { uph: 155, attendanceRate: 96 } },
  { id: "U003", name: "田中 一郎", email: "tanaka@fluxview.jp", avatar: "田", roleIds: ["role-manager"], status: "active", lastLogin: "2026-03-04 10:00", createdAt: "2025-05-15", mfaEnabled: true, employmentType: "正社員", skills: [{ name: "仕分け", level: 4 }], certifications: [{ name: "フォークリフト免許", expiry: "2027-06-15", status: "valid" }], performance: { uph: 145, attendanceRate: 95 } },
  { id: "U004", name: "佐藤 美紀", email: "sato@fluxview.jp", avatar: "佐", roleIds: ["role-manager"], status: "active", lastLogin: "2026-03-03 17:20", createdAt: "2025-06-01", mfaEnabled: false, employmentType: "正社員", skills: [{ name: "流通加工", level: 4 }], certifications: [], performance: { uph: 138, attendanceRate: 97 } },
  { id: "U005", name: "鈴木 健太", email: "suzuki@fluxview.jp", avatar: "鈴", roleIds: ["role-manager"], status: "active", lastLogin: "2026-03-04 07:50", createdAt: "2025-06-10", mfaEnabled: true, employmentType: "正社員", skills: [{ name: "リフト操作", level: 5 }], certifications: [{ name: "フォークリフト免許", expiry: "2028-03-20", status: "valid" }], performance: { uph: 172, attendanceRate: 99 } },
  { id: "U006", name: "高橋 翔太", email: "takahashi@fluxview.jp", avatar: "高", roleIds: ["role-leader"], status: "active", lastLogin: "2026-03-04 06:15", createdAt: "2025-07-01", mfaEnabled: false, employmentType: "正社員", skills: [{ name: "検品", level: 4 }, { name: "梱包", level: 4 }], certifications: [], performance: { uph: 152, attendanceRate: 94 } },
  { id: "U007", name: "伊藤 さくら", email: "ito@fluxview.jp", avatar: "伊", roleIds: ["role-leader"], status: "active", lastLogin: "2026-03-04 06:10", createdAt: "2025-07-15", mfaEnabled: false, employmentType: "正社員", skills: [{ name: "ラベリング", level: 5 }], certifications: [], performance: { uph: 142, attendanceRate: 95 } },
  { id: "U008", name: "渡辺 大輔", email: "watanabe@fluxview.jp", avatar: "渡", roleIds: ["role-leader"], status: "inactive", lastLogin: "2026-02-28 14:30", createdAt: "2025-08-01", mfaEnabled: false, employmentType: "パートナー", skills: [{ name: "仕分け", level: 3 }], certifications: [], performance: { uph: 125, attendanceRate: 85 } },
  { id: "U009", name: "中村 由美", email: "nakamura@fluxview.jp", avatar: "中", roleIds: ["role-leader"], status: "active", lastLogin: "2026-03-04 06:20", createdAt: "2025-08-15", mfaEnabled: false, employmentType: "パートナー", skills: [{ name: "検品", level: 4 }], certifications: [], performance: { uph: 148, attendanceRate: 92 } },
  { id: "U010", name: "小林 勇気", email: "kobayashi@fluxview.jp", avatar: "小", roleIds: ["role-leader"], status: "locked", lastLogin: "2026-03-01 09:00", createdAt: "2025-09-01", mfaEnabled: false, employmentType: "派遣", dispatchCompanyId: "dispatch-2", skills: [{ name: "梱包", level: 3 }], certifications: [], performance: { uph: 115, attendanceRate: 80 } },
  { id: "U011", name: "加藤 和子", email: "kato@fluxview.jp", avatar: "加", roleIds: ["role-viewer"], status: "active", lastLogin: "2026-03-04 10:10", createdAt: "2025-09-15", mfaEnabled: false, employmentType: "正社員", skills: [], certifications: [], performance: { uph: 130, attendanceRate: 94 } },
  { id: "U012", name: "吉田 誠", email: "yoshida@fluxview.jp", avatar: "吉", roleIds: ["role-viewer"], status: "active", lastLogin: "2026-03-03 16:00", createdAt: "2025-10-01", mfaEnabled: false, employmentType: "パートナー", skills: [], certifications: [], performance: { uph: 122, attendanceRate: 88 } },
  { id: "U013", name: "松本 真司", email: "matsumoto@fluxview.jp", avatar: "松", roleIds: ["role-dispatch-mgr"], status: "active", lastLogin: "2026-03-04 09:30", createdAt: "2025-10-15", mfaEnabled: true, employmentType: "正社員", skills: [], certifications: [], performance: { uph: 140, attendanceRate: 96 } },
  { id: "U014", name: "井上 恵", email: "inoue@fluxview.jp", avatar: "井", roleIds: ["role-dispatch-mgr"], status: "active", lastLogin: "2026-03-04 08:45", createdAt: "2025-11-01", mfaEnabled: false, employmentType: "正社員", skills: [], certifications: [], performance: { uph: 128, attendanceRate: 93 } },
  { id: "U015", name: "木村 拓也", email: "kimura@fluxview.jp", avatar: "木", roleIds: ["role-viewer"], status: "inactive", lastLogin: "2026-01-15 11:00", createdAt: "2025-11-15", mfaEnabled: false, employmentType: "派遣", dispatchCompanyId: "dispatch-4", skills: [], certifications: [], performance: { uph: 110, attendanceRate: 75 } },
  { id: "U016", name: "林 由香里", email: "hayashi@fluxview.jp", avatar: "林", roleIds: ["role-viewer"], status: "active", lastLogin: "2026-03-02 13:20", createdAt: "2025-12-01", mfaEnabled: false, employmentType: "パートナー", skills: [], certifications: [], performance: { uph: 135, attendanceRate: 91 } },
].map((user, index) => ({
  ...user,
  unitPrice: DEFAULT_USER_UNIT_PRICE,
  deploymentWorkerId: buildDeploymentWorkerIdFromUserId(user.id, index),
}));

const defaultSkillNameSet = new Set(defaultMasterData.skills.map((item) => item.name));
const defaultQualificationNameSet = new Set(defaultMasterData.qualifications.map((item) => item.name));
const defaultDispatchCompanyIdSet = new Set(defaultMasterData.dispatchCompanies.map((item) => item.id));
const defaultDispatchCompanyByUserId: Record<string, string> = {
  U010: "dispatch-2",
  U015: "dispatch-4",
};

const initialSkillAliasMap: Record<string, string> = {
  検品: "検品作業",
  梱包: "梱包作業",
  仕分け: "仕分け作業",
  流通加工: "AI検品装置操作",
  リフト操作: "フォークリフト操作",
  ラベリング: "RFIDタグ発行",
};

const initialQualificationAliasMap: Record<string, string> = {
  フォークリフト免許: "フォークリフト運転技能講習",
};

function isUserStatus(value: unknown): value is User["status"] {
  return value === "active" || value === "inactive" || value === "locked";
}

function isEmploymentType(value: unknown): value is User["employmentType"] {
  return value === "正社員" || value === "パートナー" || value === "派遣";
}

function normalizeSkillAssignments(value: unknown, validSkillNames: Set<string>) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rawSkill) => {
    const skill = rawSkill as Partial<SkillAssignment>;
    const name = initialSkillAliasMap[skill.name ?? ""] ?? skill.name;
    if (!name || !validSkillNames.has(name)) return [];
    return [{
      name,
      level: typeof skill.level === "number" ? skill.level : 1,
    } satisfies SkillAssignment];
  });
}

function normalizeCertificationAssignments(value: unknown, validQualificationNames: Set<string>) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rawCertification) => {
    const certification = rawCertification as Partial<CertificationAssignment>;
    const name = initialQualificationAliasMap[certification.name ?? ""] ?? certification.name;
    if (!name || !validQualificationNames.has(name)) return [];
    return [{
      name,
      expiry: typeof certification.expiry === "string" ? certification.expiry : "",
      status:
        certification.status === "expiring" || certification.status === "expired"
          ? certification.status
          : "valid",
    } satisfies CertificationAssignment];
  });
}

export function normalizeUsersWithMasterData(
  users: User[],
  validSkillNames: Set<string>,
  validQualificationNames: Set<string>,
  validDispatchCompanyIds: Set<string>,
): User[] {
  return users.map((rawUser, index) => {
    const fallback = initialUsers.find((user) => user.id === rawUser.id);
    const user = rawUser as Partial<User>;
    const resolvedEmploymentType = isEmploymentType(user.employmentType)
      ? user.employmentType
      : fallback?.employmentType ?? "正社員";
    const resolvedDispatchCompanyId = user.dispatchCompanyId ?? defaultDispatchCompanyByUserId[user.id ?? ""];

    return {
      id: typeof user.id === "string" && user.id.trim() ? user.id : fallback?.id ?? `U${String(index + 1).padStart(3, "0")}`,
      name: typeof user.name === "string" && user.name.trim() ? user.name.trim() : fallback?.name ?? `ユーザー ${index + 1}`,
      email: typeof user.email === "string" && user.email.trim() ? user.email.trim() : fallback?.email ?? "",
      avatar: typeof user.avatar === "string" && user.avatar.trim() ? user.avatar.trim() : fallback?.avatar ?? "新",
      roleIds: Array.isArray(user.roleIds) ? user.roleIds.filter((roleId): roleId is string => typeof roleId === "string") : fallback?.roleIds ?? [],
      status: isUserStatus(user.status) ? user.status : fallback?.status ?? "active",
      lastLogin: typeof user.lastLogin === "string" ? user.lastLogin : fallback?.lastLogin ?? "未ログイン",
      createdAt: typeof user.createdAt === "string" ? user.createdAt : fallback?.createdAt ?? new Date().toISOString().slice(0, 10),
      mfaEnabled: typeof user.mfaEnabled === "boolean" ? user.mfaEnabled : fallback?.mfaEnabled ?? false,
      employmentType: resolvedEmploymentType,
      unitPrice: Number.isFinite(user.unitPrice) ? Math.max(0, Math.round(user.unitPrice)) : fallback?.unitPrice ?? DEFAULT_USER_UNIT_PRICE,
      deploymentWorkerId:
        typeof user.deploymentWorkerId === "string" && user.deploymentWorkerId.trim()
          ? user.deploymentWorkerId.trim()
          : buildDeploymentWorkerIdFromUserId(typeof user.id === "string" ? user.id : fallback?.id ?? "", index),
      dispatchCompanyId:
        resolvedEmploymentType === "派遣" &&
        typeof resolvedDispatchCompanyId === "string" &&
        validDispatchCompanyIds.has(resolvedDispatchCompanyId)
          ? resolvedDispatchCompanyId
          : undefined,
      skills: normalizeSkillAssignments(user.skills, validSkillNames),
      certifications: normalizeCertificationAssignments(user.certifications, validQualificationNames),
      performance: {
        uph:
          typeof user.performance?.uph === "number"
            ? user.performance.uph
            : fallback?.performance.uph ?? 0,
        attendanceRate:
          typeof user.performance?.attendanceRate === "number"
            ? user.performance.attendanceRate
            : fallback?.performance.attendanceRate ?? 0,
      },
    } satisfies User;
  });
}

function readValidationSets() {
  if (typeof window === "undefined") {
    return {
      skillNames: defaultSkillNameSet,
      qualificationNames: defaultQualificationNameSet,
      dispatchCompanyIds: defaultDispatchCompanyIdSet,
    };
  }

  try {
    const raw = window.localStorage.getItem(MASTER_DATA_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_MASTER_DATA_STORAGE_KEY);
    if (!raw) {
      return {
        skillNames: defaultSkillNameSet,
        qualificationNames: defaultQualificationNameSet,
        dispatchCompanyIds: defaultDispatchCompanyIdSet,
      };
    }

    const parsed = JSON.parse(raw) as Partial<{
      skills: Array<{ name?: string }>;
      qualifications: Array<{ name?: string }>;
      dispatchCompanies: Array<{ id?: string }>;
    }>;

    return {
      skillNames: new Set(
        (Array.isArray(parsed.skills) ? parsed.skills : defaultMasterData.skills)
          .flatMap((item) => (typeof item?.name === "string" && item.name.trim() ? [item.name.trim()] : [])),
      ),
      qualificationNames: new Set(
        (Array.isArray(parsed.qualifications) ? parsed.qualifications : defaultMasterData.qualifications)
          .flatMap((item) => (typeof item?.name === "string" && item.name.trim() ? [item.name.trim()] : [])),
      ),
      dispatchCompanyIds: new Set(
        (Array.isArray(parsed.dispatchCompanies) ? parsed.dispatchCompanies : defaultMasterData.dispatchCompanies)
          .flatMap((item) => (typeof item?.id === "string" && item.id.trim() ? [item.id.trim()] : [])),
      ),
    };
  } catch {
    return {
      skillNames: defaultSkillNameSet,
      qualificationNames: defaultQualificationNameSet,
      dispatchCompanyIds: defaultDispatchCompanyIdSet,
    };
  }
}

export function readUsersFromStorage() {
  const validationSets = readValidationSets();

  if (typeof window === "undefined") {
    return normalizeUsersWithMasterData(
      initialUsers,
      validationSets.skillNames,
      validationSets.qualificationNames,
      validationSets.dispatchCompanyIds,
    );
  }

  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) {
      return normalizeUsersWithMasterData(
        initialUsers,
        validationSets.skillNames,
        validationSets.qualificationNames,
        validationSets.dispatchCompanyIds,
      );
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return normalizeUsersWithMasterData(
        initialUsers,
        validationSets.skillNames,
        validationSets.qualificationNames,
        validationSets.dispatchCompanyIds,
      );
    }
    return normalizeUsersWithMasterData(
      parsed as User[],
      validationSets.skillNames,
      validationSets.qualificationNames,
      validationSets.dispatchCompanyIds,
    );
  } catch {
    return normalizeUsersWithMasterData(
      initialUsers,
      validationSets.skillNames,
      validationSets.qualificationNames,
      validationSets.dispatchCompanyIds,
    );
  }
}
