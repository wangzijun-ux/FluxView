import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  Trash2,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Mail,
  Clock,
  Key,
  UserPlus,
  Copy,
  ToggleLeft,
  ToggleRight,
  Award,
  Activity,
  Calendar,
  Zap,
} from "lucide-react";
import { useThemeColors } from "./ThemeContext";
import { useMasterData } from "./MasterDataContext";
import { defaultMasterData } from "./masterStore";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Permission {
  id: string;
  label: string;
  description: string;
  category: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: string[];      // permission ids
  userCount: number;
  isSystem: boolean;          // system roles can't be deleted
}

interface SkillAssignment {
  name: string;
  level: number;
}

interface CertificationAssignment {
  name: string;
  expiry: string;
  status: "valid" | "expiring" | "expired";
}

interface User {
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
  dispatchCompanyId?: string;
  skills: SkillAssignment[];
  certifications: CertificationAssignment[];
  performance: {
    uph: number;
    attendanceRate: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const PERMISSION_CATEGORIES = [
  "ダッシュボード",
  "工程管理",
  "配置マップ",
  "工程サマリー",
  "スタッフ管理",
  "スケジュール",
  "派遣管理",
  "原価分析",
  "通知管理",
  "システム設定",
  "ユーザー管理",
];

const allPermissions: Permission[] = [
  // ダッシュボード
  { id: "dashboard.view", label: "閲覧", description: "ダッシュボード表示", category: "ダッシュボード" },
  { id: "dashboard.export", label: "エクスポート", description: "KPIデータのCSV/PDF出力", category: "ダッシュボード" },
  // 工程管理
  { id: "process.view", label: "閲覧", description: "工程定義の参照", category: "工程管理" },
  { id: "process.edit", label: "編集", description: "工程の追加・変更・削除", category: "工程管理" },
  // 配置マップ
  { id: "livecmd.view", label: "閲覧", description: "配置マップの参照", category: "配置マップ" },
  { id: "livecmd.assign", label: "配置変更", description: "スタッフの配置変更", category: "配置マップ" },
  { id: "livecmd.timeline", label: "時間軸調整", description: "時間軸スライドと調整リスト管理", category: "配置マップ" },
  // 工程サマリー
  { id: "process.summary", label: "サマリー", description: "工程のサマリー表示", category: "工程サマリー" },
  // スタッフ管理
  { id: "staff.view", label: "閲覧", description: "スタッフ情報の参照", category: "スタッフ管理" },
  { id: "staff.edit", label: "編集", description: "スタッフ情報の追加・変更", category: "スタッフ管理" },
  { id: "staff.skill", label: "スキル管理", description: "スキル・資格の登録・更新", category: "スタッフ管理" },
  // スケジュール
  { id: "schedule.view", label: "閲覧", description: "スケジュールの参照", category: "スケジュール" },
  { id: "schedule.edit", label: "編集", description: "シフトの作成・変更", category: "スケジュール" },
  // 派遣管理
  { id: "dispatch.view", label: "閲覧", description: "派遣会社情報の参照", category: "派遣管理" },
  { id: "dispatch.edit", label: "編集", description: "派遣契約・評価の管理", category: "派遣管理" },
  // 原価分析
  { id: "cost.view", label: "閲覧", description: "原価データの参照", category: "原価分析" },
  { id: "cost.detail", label: "詳細分析", description: "荷主別詳細原価の参照", category: "原価分析" },
  { id: "cost.export", label: "エクスポート", description: "原価レポートの出力", category: "原価分析" },
  // 通知管理
  { id: "notify.view", label: "閲覧", description: "通知履歴の参照", category: "通知管理" },
  { id: "notify.send", label: "送信", description: "通知・配信の実行", category: "通知管理" },
  { id: "notify.template", label: "テンプレート管理", description: "通知テンプレートの作成・編集", category: "通知管理" },
  // システム設定
  { id: "settings.view", label: "閲覧", description: "設定の参照", category: "システム設定" },
  { id: "settings.edit", label: "編集", description: "システム設定の変更", category: "システム設定" },
  // ユーザー管理
  { id: "users.view", label: "閲覧", description: "ユーザー一覧の参照", category: "ユーザー管理" },
  { id: "users.edit", label: "編集", description: "ユーザーの追加・変更・削除", category: "ユーザー管理" },
  { id: "users.roles", label: "ロール管理", description: "ロール・権限の設定変更", category: "ユーザー管理" },
];

const ALL_PERM_IDS = allPermissions.map((p) => p.id);

const initialRoles: Role[] = [
  {
    id: "role-admin",
    name: "システム管理者",
    description: "全権限を持つ管理者。システム設定・ユーザー管理を含む全操作が可能。",
    color: "text-red-400",
    permissions: [...ALL_PERM_IDS],
    userCount: 2,
    isSystem: true,
  },
  {
    id: "role-manager",
    name: "センター長",
    description: "倉庫オペレーション全体を管理。配置変更・スケジュール・派遣管理の権限を持つ。",
    color: "text-cyan-400",
    permissions: ALL_PERM_IDS.filter((p) => !p.startsWith("users.roles") && !p.startsWith("settings.edit")),
    userCount: 3,
    isSystem: true,
  },
  {
    id: "role-leader",
    name: "現場リーダー",
    description: "担当工程の配置変更・スタッフ管理が可能。原価データの詳細は参照不可。",
    color: "text-emerald-400",
    permissions: [
      "dashboard.view", "process.view",
      "livecmd.view", "livecmd.assign", "livecmd.timeline",
      "staff.view", "staff.skill",
      "schedule.view", "schedule.edit",
      "notify.view", "notify.send",
    ],
    userCount: 5,
    isSystem: true,
  },
  {
    id: "role-viewer",
    name: "閲覧者",
    description: "全画面の閲覧のみ可能。編集・変更操作は不可。",
    color: "text-gray-400",
    permissions: ALL_PERM_IDS.filter((p) => p.endsWith(".view")),
    userCount: 4,
    isSystem: false,
  },
  {
    id: "role-dispatch-mgr",
    name: "派遣管理担当",
    description: "派遣会社との契約管理・パフォーマンス評価・原価分析に特化。",
    color: "text-orange-400",
    permissions: [
      "dashboard.view",
      "staff.view",
      "dispatch.view", "dispatch.edit",
      "cost.view", "cost.detail", "cost.export",
    ],
    userCount: 2,
    isSystem: false,
  },
];

const initialUsers: User[] = [
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
];

const USER_STORAGE_KEY = "fluxview-users-v1";
const defaultSkillNameSet = new Set(defaultMasterData.skills.map((item) => item.name));
const defaultQualificationNameSet = new Set(defaultMasterData.qualifications.map((item) => item.name));
const defaultDispatchCompanyIdSet = new Set(defaultMasterData.dispatchCompanies.map((item) => item.id));
const defaultDispatchCompanyByUserId: Record<string, string> = {
  U010: "dispatch-2",
  U015: "dispatch-4",
};

const initialSkillAliasMap: Record<string, string> = {
  "検品": "検品作業",
  "梱包": "梱包作業",
  "仕分け": "仕分け作業",
  "流通加工": "AI検品装置操作",
  "リフト操作": "フォークリフト操作",
  "ラベリング": "RFIDタグ発行",
};

const initialQualificationAliasMap: Record<string, string> = {
  "フォークリフト免許": "フォークリフト運転技能講習",
};

function normalizeUsersWithMasterData(
  users: User[],
  validSkillNames: Set<string>,
  validQualificationNames: Set<string>,
  validDispatchCompanyIds: Set<string>,
): User[] {
  return users.map((user) => ({
    ...user,
    dispatchCompanyId:
      user.employmentType === "派遣" &&
      (user.dispatchCompanyId ?? defaultDispatchCompanyByUserId[user.id]) &&
      validDispatchCompanyIds.has(user.dispatchCompanyId ?? defaultDispatchCompanyByUserId[user.id])
        ? user.dispatchCompanyId ?? defaultDispatchCompanyByUserId[user.id]
        : undefined,
    skills: user.skills.flatMap((skill) => {
      const name = initialSkillAliasMap[skill.name] ?? skill.name;
      return validSkillNames.has(name) ? [{ ...skill, name }] : [];
    }),
    certifications: user.certifications.flatMap((certification) => {
      const name = initialQualificationAliasMap[certification.name] ?? certification.name;
      return validQualificationNames.has(name) ? [{ ...certification, name }] : [];
    }),
  }));
}

function readInitialUsers() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) {
      return normalizeUsersWithMasterData(initialUsers, defaultSkillNameSet, defaultQualificationNameSet, defaultDispatchCompanyIdSet);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return normalizeUsersWithMasterData(initialUsers, defaultSkillNameSet, defaultQualificationNameSet, defaultDispatchCompanyIdSet);
    }
    return normalizeUsersWithMasterData(parsed as User[], defaultSkillNameSet, defaultQualificationNameSet, defaultDispatchCompanyIdSet);
  } catch {
    return normalizeUsersWithMasterData(initialUsers, defaultSkillNameSet, defaultQualificationNameSet, defaultDispatchCompanyIdSet);
  }
}


/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusConfig = {
  active: { label: "有効", bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-400" },
  inactive: { label: "無効", bg: "bg-gray-500/15", text: "text-gray-400", dot: "bg-gray-400" },
  locked: { label: "ロック", bg: "bg-red-500/15", text: "text-red-400", dot: "bg-red-400" },
};

const empTypeColor: Record<string, string> = {
  "正社員": "bg-cyan-500/15 text-cyan-400",
  "パートナー": "bg-violet-500/15 text-violet-400",
  "派遣": "bg-orange-500/15 text-orange-400",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function UserManagement() {
  const c = useThemeColors();
  const { qualifications, skills, dispatchCompanies } = useMasterData();
  const masterSkillNameSet = useMemo(() => new Set(skills.map((item) => item.name)), [skills]);
  const masterQualificationNameSet = useMemo(() => new Set(qualifications.map((item) => item.name)), [qualifications]);
  const masterDispatchCompanyIdSet = useMemo(() => new Set(dispatchCompanies.map((item) => item.id)), [dispatchCompanies]);
  const dispatchCompanyMap = useMemo(() => new Map(dispatchCompanies.map((item) => [item.id, item])), [dispatchCompanies]);
  const capabilityOptions = useMemo(
    () => Array.from(new Set([...skills.map((item) => item.name), ...qualifications.map((item) => item.name)])).sort((a, b) => a.localeCompare(b, "ja")),
    [skills, qualifications],
  );

  // Tab state
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");

  // User management state
  const [users, setUsers] = useState<User[]>(() => readInitialUsers());
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmpType, setFilterEmpType] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [filterSkill, setFilterSkill] = useState("all");
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRoleId, setNewUserRoleId] = useState(initialRoles[3]?.id ?? initialRoles[0]?.id ?? "");
  const [newUserEmploymentType, setNewUserEmploymentType] = useState<"正社員" | "パートナー" | "派遣">("正社員");
  const [newUserDispatchCompanyId, setNewUserDispatchCompanyId] = useState(defaultMasterData.dispatchCompanies[0]?.id ?? "");
  const [newUserStatus, setNewUserStatus] = useState<"active" | "inactive">("active");

  // Role management state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(PERMISSION_CATEGORIES));
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };

  useEffect(() => {
    setUsers((prev) => normalizeUsersWithMasterData(prev, masterSkillNameSet, masterQualificationNameSet, masterDispatchCompanyIdSet));
  }, [masterSkillNameSet, masterQualificationNameSet, masterDispatchCompanyIdSet]);

  useEffect(() => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (filterSkill !== "all" && !capabilityOptions.includes(filterSkill)) {
      setFilterSkill("all");
    }
  }, [capabilityOptions, filterSkill]);

  useEffect(() => {
    if (newUserEmploymentType !== "派遣") {
      setNewUserDispatchCompanyId("");
      return;
    }
    if (!newUserDispatchCompanyId || !dispatchCompanies.some((item) => item.id === newUserDispatchCompanyId)) {
      setNewUserDispatchCompanyId(dispatchCompanies[0]?.id ?? "");
    }
  }, [dispatchCompanies, newUserDispatchCompanyId, newUserEmploymentType]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch = u.name.includes(searchTerm) || u.email.includes(searchTerm) || u.id.includes(searchTerm);
      const matchRole = filterRole === "all" || u.roleIds.includes(filterRole);
      const matchStatus = filterStatus === "all" || u.status === filterStatus;
      const matchEmpType = filterEmpType === "all" || u.employmentType === filterEmpType;
      const matchSkill = filterSkill === "all" ||
        u.skills.some(s => s.name === filterSkill) ||
        u.certifications.some(c => c.name === filterSkill);
      return matchSearch && matchRole && matchStatus && matchEmpType && matchSkill;
    });
  }, [users, searchTerm, filterRole, filterStatus, filterEmpType, filterSkill]);

  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) : null;
  const selectedRole = selectedRoleId ? roles.find((r) => r.id === selectedRoleId) : null;
  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? "不明";
  const getRoleColor = (roleId: string) => roles.find((r) => r.id === roleId)?.color ?? "text-gray-400";
  const resetNewUserForm = () => {
    setNewUserName("");
    setNewUserEmail("");
    setNewUserRoleId(initialRoles[3]?.id ?? initialRoles[0]?.id ?? "");
    setNewUserEmploymentType("正社員");
    setNewUserDispatchCompanyId("");
    setNewUserStatus("active");
  };

  // User actions
  const addNewUser = () => {
    const name = newUserName.trim();
    const email = newUserEmail.trim();

    if (!name || !email || !newUserRoleId) return;
    if (newUserEmploymentType === "派遣" && !newUserDispatchCompanyId) return;
    if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      showToast("同じメールアドレスのユーザーが存在します");
      return;
    }

    const nextNumber = users.reduce((max, user) => Math.max(max, Number(user.id.replace(/\D/g, "")) || 0), 0) + 1;
    const nextId = `U${String(nextNumber).padStart(3, "0")}`;
    const avatar = Array.from(name)[0] ?? "新";

    setUsers((prev) => [
      ...prev,
      {
        id: nextId,
        name,
        email,
        avatar,
        roleIds: [newUserRoleId],
        status: newUserStatus,
        lastLogin: "未ログイン",
        createdAt: new Date().toISOString().slice(0, 10),
        mfaEnabled: false,
        employmentType: newUserEmploymentType,
        dispatchCompanyId: newUserEmploymentType === "派遣" ? newUserDispatchCompanyId : undefined,
        skills: [],
        certifications: [],
        performance: { uph: 0, attendanceRate: 0 },
      },
    ]);
    setShowAddUser(false);
    resetNewUserForm();
    showToast("ユーザーを追加しました");
  };

  const toggleUserStatus = (userId: string) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u;
      const next = u.status === "active" ? "inactive" : "active";
      return { ...u, status: next };
    }));
    showToast("ステータスを更新しました");
  };

  const unlockUser = (userId: string) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: "active" } : u));
    showToast("ロックを解除しました");
  };

  const changeUserRole = (userId: string, targetRoleId: string) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u;
      const has = u.roleIds.includes(targetRoleId);
      const nextRoles = has
        ? u.roleIds.filter(r => r !== targetRoleId)
        : [...u.roleIds, targetRoleId];

      // Prevent deleting last role
      if (nextRoles.length === 0) return u;

      return { ...u, roleIds: nextRoles };
    }));
    showToast("ロールを更新しました");
  };

  const addSkillToUser = (userId: string, skillName: string) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u;
      if (!masterSkillNameSet.has(skillName)) return u;
      if (u.skills.find(s => s.name === skillName)) return u;
      const newSkill: SkillAssignment = { name: skillName, level: 1 };
      return { ...u, skills: [...u.skills, newSkill] };
    }));
    showToast("スキルを追加しました");
  };

  const removeSkillFromUser = (userId: string, skillName: string) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u;
      return { ...u, skills: u.skills.filter(s => s.name !== skillName) };
    }));
  };

  const updateSkillLevel = (userId: string, skillName: string, level: number) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u;
      return { ...u, skills: u.skills.map(s => s.name === skillName ? { ...s, level } : s) };
    }));
  };

  const addCertToUser = (userId: string, certName: string) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u;
      if (!masterQualificationNameSet.has(certName)) return u;
      if (u.certifications.find(c => c.name === certName)) return u;
      const newCert: CertificationAssignment = {
        name: certName,
        expiry: "2027-12-31",
        status: "valid"
      };
      return { ...u, certifications: [...u.certifications, newCert] };
    }));
    showToast("資格を登録しました");
  };

  const removeCertFromUser = (userId: string, certName: string) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u;
      return { ...u, certifications: u.certifications.filter(c => c.name !== certName) };
    }));
  };

  // Role actions
  const togglePermission = (roleId: string, permId: string) => {
    setRoles((prev) => prev.map((r) => {
      if (r.id !== roleId) return r;
      const has = r.permissions.includes(permId);
      return { ...r, permissions: has ? r.permissions.filter((p) => p !== permId) : [...r.permissions, permId] };
    }));
  };

  const toggleCategoryAll = (roleId: string, category: string) => {
    const catPerms = allPermissions.filter((p) => p.category === category).map((p) => p.id);
    setRoles((prev) => prev.map((r) => {
      if (r.id !== roleId) return r;
      const allGranted = catPerms.every((p) => r.permissions.includes(p));
      if (allGranted) {
        return { ...r, permissions: r.permissions.filter((p) => !catPerms.includes(p)) };
      } else {
        const newPerms = new Set([...r.permissions, ...catPerms]);
        return { ...r, permissions: [...newPerms] };
      }
    }));
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const addNewRole = () => {
    if (!newRoleName.trim()) return;
    const newRole: Role = {
      id: `role-${Date.now()}`,
      name: newRoleName.trim(),
      description: newRoleDesc.trim() || `${newRoleName}のカスタムロール`,
      color: "text-blue-400",
      permissions: [],
      userCount: 0,
      isSystem: false,
    };
    setRoles((prev) => [...prev, newRole]);
    setSelectedRoleId(newRole.id);
    setNewRoleName("");
    setNewRoleDesc("");
    setShowAddRole(false);
    showToast(`ロール「${newRole.name}」を作成しました`);
  };

  const duplicateRole = (roleId: string) => {
    const src = roles.find((r) => r.id === roleId);
    if (!src) return;
    const dup: Role = {
      ...src,
      id: `role-${Date.now()}`,
      name: `${src.name}（コピー）`,
      userCount: 0,
      isSystem: false,
    };
    setRoles((prev) => [...prev, dup]);
    setSelectedRoleId(dup.id);
    showToast(`ロール「${dup.name}」を作成しました`);
  };

  const deleteRole = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role || role.isSystem) return;

    // Remove the role from all users
    setUsers((prev) => prev.map((u) => {
      if (!u.roleIds.includes(roleId)) return u;
      const nextRoles = u.roleIds.filter(rid => rid !== roleId);
      return { ...u, roleIds: nextRoles.length > 0 ? nextRoles : ["role-viewer"] };
    }));

    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    if (selectedRoleId === roleId) setSelectedRoleId(null);
    showToast(`ロール「${role.name}」を削除しました`);
  };

  // Stats
  const stats = {
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    locked: users.filter((u) => u.status === "locked").length,
    mfaEnabled: users.filter((u) => u.mfaEnabled).length,
    roles: roles.length,
  };

  /* ================================================================ */

  return (
    <div className={`h-full flex flex-col ${c.isDark ? "bg-[#0d0d1a]" : "bg-gray-50"} relative`}>

      {/* Toast */}
      {toastMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <div className={`flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg ${c.isDark ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300" : "bg-emerald-50 border border-emerald-200 text-emerald-700"
            }`}>
            <Check className="w-4 h-4" /><span className="text-[13px]">{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`${c.bgCard} border-b ${c.border} px-6 py-4`}>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-3">
            {activeTab === "users" && (
              <button onClick={() => setShowAddUser(!showAddUser)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-[13px] hover:bg-cyan-500 transition-all">
                <UserPlus className="w-4 h-4" />ユーザー追加
              </button>
            )}
            {activeTab === "roles" && (
              <button onClick={() => setShowAddRole(!showAddRole)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-[13px] hover:bg-violet-500 transition-all">
                <Plus className="w-4 h-4" />ロール追加
              </button>
            )}
          </div>
        </div>

        {activeTab === "users" && showAddUser && (
          <div className={`mt-4 rounded-xl border ${c.border} ${c.bgSurface} p-4`}>
            <div className="grid gap-3 md:grid-cols-[1.1fr_1.1fr_0.9fr_0.9fr]">
              <input
                type="text"
                placeholder="氏名"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className={`w-full ${c.bgCard} border ${c.border} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`}
              />
              <input
                type="email"
                placeholder="メールアドレス"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className={`w-full ${c.bgCard} border ${c.border} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`}
              />
              <select value={newUserRoleId} onChange={(e) => setNewUserRoleId(e.target.value)} className={`${c.bgCard} border ${c.border} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`}>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              <select value={newUserEmploymentType} onChange={(e) => setNewUserEmploymentType(e.target.value as "正社員" | "パートナー" | "派遣")} className={`${c.bgCard} border ${c.border} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`}>
                <option value="正社員">正社員</option>
                <option value="パートナー">パートナー</option>
                <option value="派遣">派遣</option>
              </select>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_0.8fr_auto]">
              {newUserEmploymentType === "派遣" ? (
                <select value={newUserDispatchCompanyId} onChange={(e) => setNewUserDispatchCompanyId(e.target.value)} className={`${c.bgCard} border ${c.border} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`}>
                  <option value="">{dispatchCompanies.length === 0 ? "派遣会社マスタが未登録です" : "派遣会社を選択"}</option>
                  {dispatchCompanies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              ) : (
                <div className={`flex items-center rounded-lg border ${c.border} ${c.bgCard} px-3 text-[12px] ${c.textMuted}`}>
                  派遣以外の雇用形態では派遣会社の指定は不要です
                </div>
              )}

              <select value={newUserStatus} onChange={(e) => setNewUserStatus(e.target.value as "active" | "inactive")} className={`${c.bgCard} border ${c.border} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none`}>
                <option value="active">有効</option>
                <option value="inactive">無効</option>
              </select>

              <div className="flex items-center justify-end gap-2">
                <button onClick={() => { setShowAddUser(false); resetNewUserForm(); }} className={`px-3 py-2 rounded-lg text-[12px] ${c.textMuted}`}>キャンセル</button>
                <button
                  onClick={addNewUser}
                  disabled={!newUserName.trim() || !newUserEmail.trim() || !newUserRoleId || (newUserEmploymentType === "派遣" && !newUserDispatchCompanyId)}
                  className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-[12px] disabled:opacity-30 hover:bg-cyan-500 transition-all"
                >
                  登録
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mt-4">
          {[
            { icon: Users, label: "総ユーザー", value: stats.total, iconColor: "text-cyan-400", bgIcon: "bg-cyan-500/10" },
            { icon: ShieldCheck, label: "有効", value: stats.active, iconColor: "text-emerald-400", bgIcon: "bg-emerald-500/10" },
            { icon: ShieldAlert, label: "ロック中", value: stats.locked, iconColor: "text-red-400", bgIcon: "bg-red-500/10" },
            { icon: Key, label: "MFA有効", value: stats.mfaEnabled, iconColor: "text-amber-400", bgIcon: "bg-amber-500/10" },
            { icon: Shield, label: "ロール数", value: stats.roles, iconColor: "text-violet-400", bgIcon: "bg-violet-500/10" },
          ].map((s) => (
            <div key={s.label} className={`${c.bgSurface} rounded-xl p-3 flex items-center gap-3`}>
              <div className={`w-9 h-9 rounded-lg ${s.bgIcon} flex items-center justify-center`}>
                <s.icon className={`w-4 h-4 ${s.iconColor}`} />
              </div>
              <div>
                <div className={`text-[11px] ${c.textMuted}`}>{s.label}</div>
                <div className={`text-[20px] ${c.textPrimary} tabular-nums`}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 mt-4 -mb-4">
          <button onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-5 py-3 text-[13px] transition-all border-b-2 ${activeTab === "users" ? `${c.textPrimary} border-cyan-500` : `${c.textMuted} border-transparent`
              }`}>
            <Users className="w-4 h-4" />ユーザー一覧
          </button>
          <button onClick={() => setActiveTab("roles")}
            className={`flex items-center gap-2 px-5 py-3 text-[13px] transition-all border-b-2 ${activeTab === "roles" ? `${c.textPrimary} border-violet-500` : `${c.textMuted} border-transparent`
              }`}>
            <Shield className="w-4 h-4" />ロール・権限設定
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════ */}
      {/* USERS TAB                           */}
      {/* ═══════════════════════════════════ */}
      {activeTab === "users" && (
        <div className="flex-1 flex overflow-hidden">
          {/* User List */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Filters */}
            <div className={`px-5 py-3 border-b ${c.border} flex items-center gap-3 ${c.bgCard}`}>
              <div className="relative flex-1 max-w-[300px]">
                <Search className={`w-4 h-4 ${c.textMuted} absolute left-3 top-1/2 -translate-y-1/2`} />
                <input type="text" placeholder="名前・メール・IDで検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full ${c.bgSurface} border ${c.border} rounded-lg pl-10 pr-4 py-2 text-[13px] ${c.textPrimary} focus:border-cyan-500/50 outline-none`} />
              </div>
              <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
                className={`${c.bgSurface} border ${c.border} rounded-lg px-3 py-2 text-[12px] ${c.textSecondary} outline-none cursor-pointer`}>
                <option value="all">全ロール</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className={`${c.bgSurface} border ${c.border} rounded-lg px-3 py-2 text-[12px] ${c.textSecondary} outline-none cursor-pointer`}>
                <option value="all">全ステータス</option>
                <option value="active">有効</option>
                <option value="inactive">無効</option>
                <option value="locked">ロック</option>
              </select>
              <select value={filterEmpType} onChange={(e) => setFilterEmpType(e.target.value)}
                className={`${c.bgSurface} border ${c.border} rounded-lg px-3 py-2 text-[12px] ${c.textSecondary} outline-none cursor-pointer`}>
                <option value="all">全雇用形態</option>
                <option value="正社員">正社員</option>
                <option value="パートナー">パートナー</option>
                <option value="派遣">派遣</option>
              </select>
              <select value={filterSkill} onChange={(e) => setFilterSkill(e.target.value)}
                className={`${c.bgSurface} border ${c.border} rounded-lg px-3 py-2 text-[12px] ${c.textSecondary} outline-none cursor-pointer max-w-[150px]`}>
                <option value="all">全スキル・資格</option>
                {capabilityOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <span className={`text-[12px] ${c.textMuted} ml-auto`}>{filteredUsers.length}件</span>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className={`sticky top-0 z-10 ${c.bgCard}`}>
                  <tr className={`border-b ${c.border}`}>
                    {["ユーザー", "スキル・資格", "ロール", "雇用形態", "ステータス", "MFA", "最終ログイン", "操作"].map((h) => (
                      <th key={h} className={`text-left text-[11px] ${c.textMuted} px-4 py-3 whitespace-nowrap`}>{h === "操作" ? "" : h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const st = statusConfig[user.status];
                    const isSelected = selectedUserId === user.id;
                    return (
                      <tr key={user.id} onClick={() => setSelectedUserId(isSelected ? null : user.id)}
                        className={`border-b ${c.border} cursor-pointer transition-all ${isSelected ? "bg-cyan-500/5" : c.bgCardHover}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] shrink-0 ${user.status === "active" ? "bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/20"
                              : user.status === "locked" ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                              }`}>
                              {user.avatar}
                            </div>
                            <div>
                              <div className={`text-[13px] ${c.textPrimary}`}>{user.name}</div>
                              <div className={`text-[11px] ${c.textMuted}`}>{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-[140px]">
                            {user.skills.slice(0, 2).map(s => (
                              <div key={s.name} className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center text-violet-500" title={s.name}>
                                <Award className="w-3 h-3" />
                              </div>
                            ))}
                            {user.certifications.slice(0, 1).map(c => (
                              <div key={c.name} className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-500" title={c.name}>
                                <ShieldCheck className="w-3 h-3" />
                              </div>
                            ))}
                            {(user.skills.length + user.certifications.length) > 3 && (
                              <span className={`text-[10px] ${c.textMuted} self-center ml-1`}>+{user.skills.length + user.certifications.length - 3}</span>
                            )}
                            {(user.skills.length === 0 && user.certifications.length === 0) && (
                              <span className={`text-[10px] ${c.textDimmed}`}>未登録</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {user.roleIds.map(rid => (
                              <span key={rid} className={`text-[10px] px-2 py-0.5 rounded-md bg-gray-500/5 ${getRoleColor(rid)}`}>
                                {getRoleName(rid)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex w-fit text-[11px] px-2 py-0.5 rounded-full ${empTypeColor[user.employmentType] ?? ""}`}>{user.employmentType}</span>
                            {user.employmentType === "派遣" && (
                              <span className={`text-[10px] ${c.textMuted}`}>
                                {user.dispatchCompanyId ? dispatchCompanyMap.get(user.dispatchCompanyId)?.name ?? "会社未設定" : "会社未設定"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {user.mfaEnabled ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <span className={`text-[11px] ${c.textDimmed}`}>—</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-[12px] ${c.textSecondary} tabular-nums`}>{user.lastLogin}</td>
                        <td className="px-4 py-3">
                          <button className={c.textDimmed}><MoreHorizontal className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* User Detail Panel */}
          {selectedUser && (
            <div className={`w-[320px] ${c.bgCard} border-l ${c.border} flex flex-col shrink-0 overflow-y-auto`}>
              <div className={`p-5 border-b ${c.border}`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`${c.textPrimary} text-[14px]`}>ユーザー詳細</h3>
                  <button onClick={() => setSelectedUserId(null)} className={c.textMuted}><X className="w-4 h-4" /></button>
                </div>

                {/* Profile */}
                <div className="text-center mb-5">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-[22px] mx-auto mb-3 ${selectedUser.status === "active" ? "bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-400 border-2 border-cyan-500/20"
                    : selectedUser.status === "locked" ? "bg-red-500/10 text-red-400 border-2 border-red-500/20"
                      : "bg-gray-500/10 text-gray-400 border-2 border-gray-500/20"
                    }`}>
                    {selectedUser.avatar}
                  </div>
                  <div className={c.textPrimary}>{selectedUser.name}</div>
                  <div className={`text-[12px] ${c.textMuted} mt-0.5`}>{selectedUser.email}</div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${empTypeColor[selectedUser.employmentType]}`}>{selectedUser.employmentType}</span>
                    <span className={`text-[11px] ${c.textDimmed}`}>{selectedUser.id}</span>
                  </div>
                  {selectedUser.employmentType === "派遣" && (
                    <div className={`mt-2 text-[11px] ${c.textMuted}`}>
                      派遣会社: {selectedUser.dispatchCompanyId ? dispatchCompanyMap.get(selectedUser.dispatchCompanyId)?.name ?? "未設定" : "未設定"}
                    </div>
                  )}
                </div>

                {/* Status & Actions */}
                <div className="space-y-3">
                  <div className={`flex items-center justify-between p-3 rounded-lg ${c.bgSurface}`}>
                    <span className={`text-[12px] ${c.textSecondary}`}>ステータス</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[12px] px-2 py-0.5 rounded-full ${statusConfig[selectedUser.status].bg} ${statusConfig[selectedUser.status].text}`}>
                        {statusConfig[selectedUser.status].label}
                      </span>
                      {selectedUser.status === "locked" ? (
                        <button onClick={() => unlockUser(selectedUser.id)} className="text-[11px] text-cyan-400 hover:underline">解除</button>
                      ) : (
                        <button onClick={() => toggleUserStatus(selectedUser.id)}
                          className={`text-[11px] ${selectedUser.status === "active" ? "text-amber-400" : "text-emerald-400"} hover:underline`}>
                          {selectedUser.status === "active" ? "無効化" : "有効化"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={`p-3 rounded-lg ${c.bgSurface} space-y-2`}>
                    <div className={`text-[12px] ${c.textSecondary} mb-2`}>付与ロール</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedUser.roleIds.map(rid => (
                        <div key={rid} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${c.bgCard} border ${c.borderCard} ${getRoleColor(rid)}`}>
                          <span className="text-[11px] font-bold">{getRoleName(rid)}</span>
                          <button onClick={() => changeUserRole(selectedUser.id, rid)} className="hover:text-red-400 transition-all">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="relative group/addrole pt-2">
                      <button className="w-full py-1.5 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg text-[10px] text-gray-400 hover:border-cyan-500/30 hover:text-cyan-500 transition-all">
                        + ロールを追加
                      </button>
                      <div className="absolute bottom-full left-0 w-full mb-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-2xl opacity-0 invisible group-hover/addrole:opacity-100 group-hover/addrole:visible p-2 z-20 space-y-1">
                        {roles.filter(r => !selectedUser.roleIds.includes(r.id)).map(r => (
                          <button key={r.id} onClick={() => changeUserRole(selectedUser.id, r.id)} className={`w-full text-left px-3 py-2 rounded-lg text-xs ${c.textSecondary} hover:bg-cyan-500/10 hover:text-cyan-500 transition-all`}>
                            {r.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between p-3 rounded-lg ${c.bgSurface}`}>
                    <span className={`text-[12px] ${c.textSecondary}`}>MFA (2要素認証)</span>
                    <div className="flex items-center gap-1.5">
                      {selectedUser.mfaEnabled ? (
                        <><ShieldCheck className="w-4 h-4 text-emerald-400" /><span className="text-[11px] text-emerald-400">有効</span></>
                      ) : (
                        <><ShieldAlert className="w-4 h-4 text-amber-400" /><span className="text-[11px] text-amber-400">無効</span></>
                      )}
                    </div>
                  </div>

                  <div className={`p-3 rounded-lg ${c.bgSurface} space-y-2`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[12px] ${c.textSecondary}`}>最終ログイン</span>
                      <span className={`text-[12px] ${c.textPrimary} tabular-nums`}>{selectedUser.lastLogin}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[12px] ${c.textSecondary}`}>作成日</span>
                      <span className={`text-[12px] ${c.textPrimary} tabular-nums`}>{selectedUser.createdAt}</span>
                    </div>
                  </div>
                </div>

                {/* Operational Data (Skills & Performance) */}
                <div className="mt-6 pt-6 border-t border-dashed border-gray-200 dark:border-gray-800">
                  <h4 className={`text-[12px] ${c.textMuted} mb-4 flex items-center gap-2 uppercase tracking-widest font-black`}>
                    <Award className="w-4 h-4 text-violet-400" />
                    現場スキル・資格
                  </h4>

                  <div className="space-y-4">
                    {/* Skills */}
                    <div className="space-y-2">
                      {selectedUser.skills.map(skill => (
                        <div key={skill.name} className="flex items-center justify-between group">
                          <div className="flex items-center gap-2">
                            <button onClick={() => removeSkillFromUser(selectedUser.id, skill.name)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/10 rounded text-rose-400 transition-all">
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <span className={`text-[13px] ${c.textSecondary}`}>{skill.name}</span>
                          </div>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(l => (
                              <button
                                key={l}
                                onClick={() => updateSkillLevel(selectedUser.id, skill.name, l)}
                                className={`w-1.5 h-1.5 rounded-full transition-all ${l <= skill.level ? 'bg-violet-500 hover:bg-violet-400' : 'bg-gray-200 dark:bg-gray-800 hover:bg-gray-300'}`}
                              />
                            ))}
                          </div>
                        </div>
                      ))}

                      <div className="relative group/add">
                        <button className="w-full py-2 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-[11px] text-gray-400 font-bold hover:border-violet-500/30 hover:text-violet-500 transition-all flex items-center justify-center gap-2">
                          <Plus className="w-3 h-3" /> スキルを追加
                        </button>
                        <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-2xl opacity-0 invisible group-hover/add:opacity-100 group-hover/add:visible p-2 z-20 space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                          {skills.filter((item) => !selectedUser.skills.find((skill) => skill.name === item.name)).map((item) => (
                            <button key={item.id} onClick={() => addSkillToUser(selectedUser.id, item.name)} className={`w-full text-left px-3 py-2 rounded-lg text-xs ${c.textSecondary} hover:bg-violet-500/10 hover:text-violet-500 transition-all`}>
                              {item.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Certifications */}
                    <div className="space-y-2">
                      {selectedUser.certifications.map(cert => (
                        <div key={cert.name} className={`p-2 rounded-xl border ${c.borderCard} bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between group`}>
                          <div className="flex items-center gap-3">
                            <button onClick={() => removeCertFromUser(selectedUser.id, cert.name)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/10 rounded text-rose-400 transition-all">
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <div>
                              <div className={`text-[12px] ${c.textPrimary} font-bold`}>{cert.name}</div>
                              <div className={`text-[10px] ${c.textMuted}`}>{cert.expiry}まで</div>
                            </div>
                          </div>
                          <ShieldCheck className={`w-4 h-4 ${cert.status === 'valid' ? 'text-emerald-500' : 'text-amber-500'}`} />
                        </div>
                      ))}

                      <div className="relative group/addcert">
                        <button className="w-full py-2 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-[11px] text-gray-400 font-bold hover:border-violet-500/30 hover:text-violet-500 transition-all flex items-center justify-center gap-2">
                          <Plus className="w-3 h-3" /> 資格証を登録
                        </button>
                        <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-2xl opacity-0 invisible group-hover/addcert:opacity-100 group-hover/addcert:visible p-2 z-20 space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                          {qualifications.filter((item) => !selectedUser.certifications.find((certification) => certification.name === item.name)).map((item) => (
                            <button key={item.id} onClick={() => addCertToUser(selectedUser.id, item.name)} className={`w-full text-left px-3 py-2 rounded-lg text-xs ${c.textSecondary} hover:bg-emerald-500/10 hover:text-emerald-500 transition-all`}>
                              {item.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Performance */}
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className={`${c.bgSurface} p-3 rounded-2xl text-center border-2 border-transparent hover:border-cyan-500/20 transition-all`}>
                      <div className="text-[18px] font-black text-cyan-400">{selectedUser.performance.uph}</div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase">平均UPH</div>
                    </div>
                    <div className={`${c.bgSurface} p-3 rounded-2xl text-center border-2 border-transparent hover:border-emerald-500/20 transition-all`}>
                      <div className="text-[18px] font-black text-emerald-400">{selectedUser.performance.attendanceRate}%</div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase">出勤率</div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-5 space-y-2">
                  <button className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[12px] ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} hover:opacity-80 transition-all`}>
                    <Mail className="w-3.5 h-3.5" />パスワードリセットメール送信
                  </button>
                  <button className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[12px] ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} hover:opacity-80 transition-all`}>
                    <Clock className="w-3.5 h-3.5" />アクセスログ表示
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════ */}
      {/* ROLES TAB                           */}
      {/* ═══════════════════════════════════ */}
      {activeTab === "roles" && (
        <div className="flex-1 flex overflow-hidden">
          {/* Role List */}
          <div className={`w-[320px] ${c.bgCard} border-r ${c.border} flex flex-col shrink-0`}>
            <div className={`p-4 border-b ${c.border}`}>
              <h3 className={`${c.textPrimary} text-[14px] mb-1`}>ロール一覧</h3>
              <p className={`text-[11px] ${c.textMuted}`}>クリックして権限を編集</p>
            </div>

            {/* Add Role Form */}
            {showAddRole && (
              <div className={`p-4 border-b ${c.border} ${c.bgSurface}`}>
                <input type="text" placeholder="ロール名" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
                  className={`w-full ${c.bgCard} border ${c.border} rounded-lg px-3 py-2 text-[13px] ${c.textPrimary} outline-none mb-2`} />
                <input type="text" placeholder="説明（任意）" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)}
                  className={`w-full ${c.bgCard} border ${c.border} rounded-lg px-3 py-2 text-[12px] ${c.textSecondary} outline-none mb-2`} />
                <div className="flex items-center gap-2">
                  <button onClick={addNewRole} disabled={!newRoleName.trim()}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[12px] disabled:opacity-30 hover:bg-violet-500 transition-all">作成</button>
                  <button onClick={() => setShowAddRole(false)} className={`px-3 py-1.5 rounded-lg text-[12px] ${c.textMuted}`}>キャンセル</button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {roles.map((role) => {
                const isSelected = selectedRoleId === role.id;
                const assignedCount = users.filter((u) => u.roleIds.includes(role.id)).length;
                return (
                  <div key={role.id} onClick={() => setSelectedRoleId(isSelected ? null : role.id)}
                    className={`rounded-xl border p-4 cursor-pointer transition-all ${isSelected ? `border-violet-500/40 ${c.isDark ? "bg-violet-500/5" : "bg-violet-50"}` : `${c.border} ${c.bgCardHover}`
                      }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Shield className={`w-4 h-4 ${role.color}`} />
                        <span className={`text-[13px] ${c.textPrimary}`}>{role.name}</span>
                      </div>
                      {role.isSystem && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${c.bgSurface} ${c.textDimmed}`}>システム</span>
                      )}
                    </div>
                    <p className={`text-[11px] ${c.textMuted} mb-2 line-clamp-2`}>{role.description}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] ${c.textSecondary}`}>
                        <Users className="w-3 h-3 inline mr-1" />{assignedCount}名
                      </span>
                      <span className={`text-[10px] ${c.textDimmed}`}>
                        {role.permissions.length}/{allPermissions.length} 権限
                      </span>
                    </div>
                    {/* Permission coverage bar */}
                    <div className={`w-full h-1 rounded-full mt-2 ${c.isDark ? "bg-gray-800" : "bg-gray-200"} overflow-hidden`}>
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${(role.permissions.length / allPermissions.length) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Permission Matrix */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedRole ? (
              <>
                {/* Role Header */}
                <div className={`px-6 py-4 border-b ${c.border} ${c.bgCard}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Shield className={`w-5 h-5 ${selectedRole.color}`} />
                        <h2 className={`${c.textPrimary} text-[16px]`}>{selectedRole.name}</h2>
                        {selectedRole.isSystem && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.bgSurface} ${c.textMuted}`}>システムロール</span>
                        )}
                      </div>
                      <p className={`text-[13px] ${c.textSecondary} mt-1`}>{selectedRole.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => duplicateRole(selectedRole.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] ${c.bgSurface} border ${c.borderCard} ${c.textSecondary} hover:opacity-80 transition-all`}>
                        <Copy className="w-3.5 h-3.5" />複製
                      </button>
                      {!selectedRole.isSystem && (
                        <button onClick={() => deleteRole(selectedRole.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />削除
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3">
                    <span className={`text-[12px] ${c.textMuted}`}>
                      割当ユーザー: <span className={c.textPrimary}>{users.filter((u) => u.roleIds.includes(selectedRole.id)).length}名</span>
                    </span>
                    <span className={`text-[12px] ${c.textMuted}`}>
                      権限数: <span className="text-violet-400">{selectedRole.permissions.length}</span> / {allPermissions.length}
                    </span>
                  </div>
                </div>

                {/* Permission Grid */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <div className="space-y-2">
                    {PERMISSION_CATEGORIES.map((cat) => {
                      const catPerms = allPermissions.filter((p) => p.category === cat);
                      const grantedCount = catPerms.filter((p) => selectedRole.permissions.includes(p.id)).length;
                      const allGranted = grantedCount === catPerms.length;
                      const isExpanded = expandedCategories.has(cat);

                      return (
                        <div key={cat} className={`rounded-xl border ${c.border} overflow-hidden`}>
                          {/* Category Header */}
                          <div className={`flex items-center justify-between px-4 py-3 cursor-pointer ${c.bgCard} ${c.bgCardHover}`}
                            onClick={() => toggleCategory(cat)}>
                            <div className="flex items-center gap-3">
                              <button className={c.textMuted}>
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                              <span className={`text-[13px] ${c.textPrimary}`}>{cat}</span>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full ${allGranted ? "bg-emerald-500/15 text-emerald-400" : grantedCount > 0 ? "bg-amber-500/15 text-amber-400" : "bg-gray-500/15 text-gray-400"
                                }`}>
                                {grantedCount}/{catPerms.length}
                              </span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleCategoryAll(selectedRole.id, cat); }}
                              className={`text-[11px] px-2.5 py-1 rounded-lg transition-all ${allGranted
                                ? `${c.bgSurface} ${c.textSecondary}`
                                : "bg-violet-600/80 text-white hover:bg-violet-500"
                                }`}
                            >
                              {allGranted ? "全解除" : "全許可"}
                            </button>
                          </div>

                          {/* Permission Items */}
                          {isExpanded && (
                            <div className={`border-t ${c.border}`}>
                              {catPerms.map((perm) => {
                                const granted = selectedRole.permissions.includes(perm.id);
                                return (
                                  <div key={perm.id}
                                    className={`flex items-center justify-between px-4 py-2.5 border-b last:border-b-0 ${c.border} ${c.bgCardHover} transition-colors`}>
                                    <div className="flex items-center gap-3">
                                      <div className="w-5 h-5 flex items-center justify-center">
                                        {granted ? (
                                          <div className="w-4 h-4 rounded bg-emerald-500/20 flex items-center justify-center">
                                            <Check className="w-3 h-3 text-emerald-400" />
                                          </div>
                                        ) : (
                                          <div className={`w-4 h-4 rounded ${c.isDark ? "bg-gray-800" : "bg-gray-200"}`} />
                                        )}
                                      </div>
                                      <div>
                                        <div className={`text-[13px] ${c.textPrimary}`}>{perm.label}</div>
                                        <div className={`text-[11px] ${c.textMuted}`}>{perm.description}</div>
                                      </div>
                                    </div>
                                    <button onClick={() => togglePermission(selectedRole.id, perm.id)}
                                      className="shrink-0">
                                      {granted ? (
                                        <ToggleRight className="w-8 h-8 text-emerald-400" />
                                      ) : (
                                        <ToggleLeft className={`w-8 h-8 ${c.textDimmed}`} />
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Assigned Users for this Role */}
                  <div className={`mt-5 ${c.bgCard} rounded-xl border ${c.border} p-4`}>
                    <h4 className={`text-[13px] ${c.textPrimary} mb-3 flex items-center gap-2`}>
                      <Users className="w-4 h-4 text-violet-400" />
                      このロールのユーザー
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {users.filter((u) => u.roleIds.includes(selectedRole.id)).map((u) => {
                        const st = statusConfig[u.status];
                        return (
                          <div key={u.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${c.border} ${c.bgSurface}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${u.status === "active" ? "bg-cyan-500/15 text-cyan-400" : "bg-gray-500/15 text-gray-400"
                              }`}>{u.avatar}</div>
                            <span className={`text-[12px] ${c.textPrimary}`}>{u.name}</span>
                            <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          </div>
                        );
                      })}
                      {users.filter((u) => u.roleIds.includes(selectedRole.id)).length === 0 && (
                        <span className={`text-[12px] ${c.textDimmed}`}>割当ユーザーなし</span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* No role selected */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Shield className={`w-12 h-12 mx-auto mb-3 ${c.textDimmed} opacity-30`} />
                  <p className={`text-[14px] ${c.textMuted}`}>左からロールを選択してください</p>
                  <p className={`text-[12px] ${c.textDimmed} mt-1`}>権限の閲覧・編集が行えます</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

