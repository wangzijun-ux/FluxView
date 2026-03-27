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
} from "lucide-react";
import { Autocomplete, Chip, TextField } from "@mui/material";
import { useThemeColors } from "./ThemeContext";
import { useMasterData } from "./MasterDataContext";
import { defaultMasterData } from "./masterStore";
import {
  readDeploymentWorkers,
  writeDeploymentWorkerNotes,
} from "./fieldDeploymentStore";
import {
  DEFAULT_QUALIFICATION_ICON_KEY,
  DEFAULT_SKILL_ICON_KEY,
  getCapabilityToneClasses,
  getMasterIconOption,
  type CapabilityTone,
  type MasterIconKey,
} from "./masterIconOptions";
import {
  DEFAULT_USER_UNIT_PRICE,
  USER_STORAGE_KEY,
  buildDeploymentWorkerIdFromUserId,
  normalizeUsersWithMasterData,
  readUsersFromStorage,
} from "./userStore";

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

interface ManagementTeam {
  id: string;
  name: string;
  description: string;
  memberUserIds: string[];
  themeColor: string;
  createdAt: string;
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

const defaultSkillNameSet = new Set(defaultMasterData.skills.map((item) => item.name));
const defaultQualificationNameSet = new Set(defaultMasterData.qualifications.map((item) => item.name));
const defaultDispatchCompanyIdSet = new Set(defaultMasterData.dispatchCompanies.map((item) => item.id));
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

const formatUnitPrice = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
const TEAM_STORAGE_KEY = "fluxview-management-teams-v1";
const TEAM_COLOR_OPTIONS = [
  {
    id: "blue",
    name: "ブルー",
    avatarClass: "bg-[#EEF4FF] text-[#155DFC] border border-[#B7CDFF]",
    accentClass: "bg-[#155DFC]",
    chipClass: "border-[#B7CDFF] bg-[#EEF4FF] text-[#155DFC]",
  },
  {
    id: "emerald",
    name: "グリーン",
    avatarClass: "bg-emerald-50 text-emerald-600 border border-emerald-200",
    accentClass: "bg-emerald-500",
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    id: "violet",
    name: "バイオレット",
    avatarClass: "bg-violet-50 text-violet-600 border border-violet-200",
    accentClass: "bg-violet-500",
    chipClass: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    id: "amber",
    name: "アンバー",
    avatarClass: "bg-amber-50 text-amber-600 border border-amber-200",
    accentClass: "bg-amber-500",
    chipClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    id: "rose",
    name: "ローズ",
    avatarClass: "bg-rose-50 text-rose-600 border border-rose-200",
    accentClass: "bg-rose-500",
    chipClass: "border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    id: "slate",
    name: "グレー",
    avatarClass: "bg-slate-100 text-slate-500 border border-slate-200",
    accentClass: "bg-slate-400",
    chipClass: "border-slate-200 bg-slate-100 text-slate-600",
  },
] as const;
const DEFAULT_TEAM_COLOR_ID = TEAM_COLOR_OPTIONS[0].id;

function getTeamColorOption(colorId?: string) {
  return TEAM_COLOR_OPTIONS.find((option) => option.id === colorId) ?? TEAM_COLOR_OPTIONS[0];
}

function readTeamsFromStorage(): ManagementTeam[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.description === "string" &&
          Array.isArray(item.memberUserIds) &&
          typeof item.createdAt === "string",
      )
      .map((item, index) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        memberUserIds: item.memberUserIds,
        themeColor:
          typeof item.themeColor === "string" && TEAM_COLOR_OPTIONS.some((option) => option.id === item.themeColor)
            ? item.themeColor
            : TEAM_COLOR_OPTIONS[index % TEAM_COLOR_OPTIONS.length].id,
        createdAt: item.createdAt,
      }));
  } catch {
    return [];
  }
}

function CapabilityIconChip({
  title,
  tone,
  iconKey,
  sizeClass = "h-5 w-5",
  iconSizeClass = "h-3 w-3",
  roundedClass = "rounded-md",
}: {
  title: string;
  tone: CapabilityTone;
  iconKey?: MasterIconKey;
  sizeClass?: string;
  iconSizeClass?: string;
  roundedClass?: string;
}) {
  const toneClasses = getCapabilityToneClasses(tone);
  const fallbackIconKey =
    tone === "qualification" ? DEFAULT_QUALIFICATION_ICON_KEY : DEFAULT_SKILL_ICON_KEY;
  const iconOption = getMasterIconOption(iconKey, fallbackIconKey);
  const Icon = iconOption.icon;

  return (
    <div
      title={title}
      aria-label={title}
      className={`${sizeClass} ${roundedClass} border flex items-center justify-center ${toneClasses.surfaceClass}`}
    >
      <Icon className={`${iconSizeClass} ${toneClasses.accentClass}`} />
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
    <div className="min-w-0">
      <Autocomplete
        multiple
        size="small"
        options={options}
        value={selectedOptions}
        disableCloseOnSelect
        limitTags={3}
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
  const skillMasterMap = useMemo(() => new Map(skills.map((item) => [item.name, item])), [skills]);
  const qualificationMasterMap = useMemo(
    () => new Map(qualifications.map((item) => [item.name, item])),
    [qualifications],
  );
  const capabilityOptions = useMemo(
    () => Array.from(new Set([...skills.map((item) => item.name), ...qualifications.map((item) => item.name)])).sort((a, b) => a.localeCompare(b, "ja")),
    [skills, qualifications],
  );

  // Tab state
  const [activeTab, setActiveTab] = useState<"users" | "roles" | "teams">("users");

  // User management state
  const [users, setUsers] = useState<User[]>(() => readUsersFromStorage());
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [teams, setTeams] = useState<ManagementTeam[]>(() => readTeamsFromStorage());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmpType, setFilterEmpType] = useState("all");
  const [userDialogMode, setUserDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [filterSkill, setFilterSkill] = useState("all");
  const [deploymentWorkersDraft, setDeploymentWorkersDraft] = useState(() => readDeploymentWorkers());
  const deploymentWorkerNoteMap = useMemo(
    () => new Map(deploymentWorkersDraft.map((worker) => [worker.id, worker.note ?? ""])),
    [deploymentWorkersDraft],
  );
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRoleIds, setNewUserRoleIds] = useState<string[]>(
    initialRoles[3]?.id ?? initialRoles[0]?.id ?? "" ? [initialRoles[3]?.id ?? initialRoles[0]?.id ?? ""] : [],
  );
  const [newUserEmploymentType, setNewUserEmploymentType] = useState<"正社員" | "パートナー" | "派遣">("正社員");
  const [newUserDispatchCompanyId, setNewUserDispatchCompanyId] = useState(defaultMasterData.dispatchCompanies[0]?.id ?? "");
  const [newUserStatus, setNewUserStatus] = useState<"active" | "inactive">("active");
  const [newUserUnitPrice, setNewUserUnitPrice] = useState(String(DEFAULT_USER_UNIT_PRICE));

  // Role management state
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(PERMISSION_CATEGORIES));
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [teamSearchTerm, setTeamSearchTerm] = useState("");
  const [teamDialogMode, setTeamDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [newTeamMemberIds, setNewTeamMemberIds] = useState<string[]>([]);
  const [newTeamThemeColor, setNewTeamThemeColor] = useState<string>(DEFAULT_TEAM_COLOR_ID);

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
    localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    setDeploymentWorkersDraft((prev) => {
      const draftNoteMap = new Map(prev.map((worker) => [worker.id, worker.note ?? ""]));
      return readDeploymentWorkers().map((worker) => ({
        ...worker,
        note: draftNoteMap.get(worker.id) ?? worker.note ?? "",
      }));
    });
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

  const selectedUser = userDialogMode === "edit" && editingUserId ? users.find((u) => u.id === editingUserId) : null;
  const selectedRole = selectedRoleId ? roles.find((r) => r.id === selectedRoleId) : null;
  const getRoleName = (roleId: string) => roles.find((r) => r.id === roleId)?.name ?? "不明";
  const getRoleColor = (roleId: string) => roles.find((r) => r.id === roleId)?.color ?? "text-gray-400";
  const selectedTeam = teamDialogMode === "edit" && editingTeamId ? teams.find((team) => team.id === editingTeamId) : null;
  const teamMemberOptions = useMemo(
    () => users.map((user) => ({ id: user.id, name: `${user.name} (${user.email})` })),
    [users],
  );
  const filteredTeams = useMemo(() => {
    const keyword = teamSearchTerm.trim().toLowerCase();
    if (!keyword) return teams;
    return teams.filter((team) => {
      const memberNames = team.memberUserIds
        .map((memberId) => users.find((user) => user.id === memberId)?.name ?? "")
        .join(" ");
      return `${team.name} ${team.description} ${memberNames}`.toLowerCase().includes(keyword);
    });
  }, [teamSearchTerm, teams, users]);
  const userTeamMap = useMemo(() => {
    const map = new Map<string, ManagementTeam>();
    teams.forEach((team) => {
      team.memberUserIds.forEach((memberId) => {
        if (!map.has(memberId)) {
          map.set(memberId, team);
        }
      });
    });
    return map;
  }, [teams]);
  const getUserAvatarTone = (userId: string) => {
    const team = userTeamMap.get(userId);
    if (!team) {
      return {
        avatarClass: "bg-slate-100 text-slate-500 border border-slate-200",
        chipClass: "border-slate-200 bg-slate-100 text-slate-600",
      };
    }
    const option = getTeamColorOption(team.themeColor);
    return {
      avatarClass: option.avatarClass,
      chipClass: option.chipClass,
    };
  };

  const resetNewUserForm = () => {
    setNewUserName("");
    setNewUserEmail("");
    setNewUserRoleIds(initialRoles[3]?.id ?? initialRoles[0]?.id ?? "" ? [initialRoles[3]?.id ?? initialRoles[0]?.id ?? ""] : []);
    setNewUserEmploymentType("正社員");
    setNewUserDispatchCompanyId("");
    setNewUserStatus("active");
    setNewUserUnitPrice(String(DEFAULT_USER_UNIT_PRICE));
  };

  const resetTeamForm = () => {
    setNewTeamName("");
    setNewTeamDescription("");
    setNewTeamMemberIds([]);
    setNewTeamThemeColor(DEFAULT_TEAM_COLOR_ID);
  };

  const openCreateTeamDialog = () => {
    resetTeamForm();
    setEditingTeamId(null);
    setTeamDialogMode("create");
  };

  const openEditTeamDialog = (teamId: string) => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    setNewTeamName(team.name);
    setNewTeamDescription(team.description);
    setNewTeamMemberIds(team.memberUserIds);
    setNewTeamThemeColor(team.themeColor ?? DEFAULT_TEAM_COLOR_ID);
    setEditingTeamId(team.id);
    setTeamDialogMode("edit");
  };

  const closeTeamDialog = () => {
    setTeamDialogMode(null);
    setEditingTeamId(null);
    resetTeamForm();
  };

  const openCreateUserDialog = () => {
    resetNewUserForm();
    setEditingUserId(null);
    setUserDialogMode("create");
  };

  const openEditUserDialog = (userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user) return;

    setNewUserName(user.name);
    setNewUserEmail(user.email);
    setNewUserRoleIds(user.roleIds.length > 0 ? user.roleIds : (initialRoles[3]?.id ?? initialRoles[0]?.id ?? "" ? [initialRoles[3]?.id ?? initialRoles[0]?.id ?? ""] : []));
    setNewUserEmploymentType(user.employmentType);
    setNewUserDispatchCompanyId(user.dispatchCompanyId ?? "");
    setNewUserStatus(user.status === "locked" ? "inactive" : user.status);
    setNewUserUnitPrice(String(user.unitPrice));
    setEditingUserId(user.id);
    setUserDialogMode("edit");
  };

  const closeUserDialog = () => {
    setUserDialogMode(null);
    setEditingUserId(null);
    resetNewUserForm();
  };

  const updateDeploymentWorkerNoteDraft = (workerId: string, note: string) => {
    setDeploymentWorkersDraft((prev) =>
      prev.map((worker) => (worker.id === workerId ? { ...worker, note } : worker)),
    );
  };

  const commitDeploymentWorkerNote = (workerId: string) => {
    const nextWorkers = deploymentWorkersDraft.map((worker) =>
      worker.id === workerId ? { ...worker, note: (worker.note ?? "").trim() } : worker,
    );

    setDeploymentWorkersDraft(nextWorkers);
    writeDeploymentWorkerNotes(
      Object.fromEntries(nextWorkers.map((worker) => [worker.id, worker.note ?? ""])),
    );
    showToast("配置備考を更新しました");
  };

  // User actions
  const saveUserDialog = () => {
    const name = newUserName.trim();
    const email = newUserEmail.trim();
    const parsedUnitPrice = Number(newUserUnitPrice);
    const nextUnitPrice = Number.isFinite(parsedUnitPrice) && parsedUnitPrice >= 0
      ? Math.round(parsedUnitPrice)
      : DEFAULT_USER_UNIT_PRICE;

    if (!name || !email || newUserRoleIds.length === 0) return;
    if (newUserEmploymentType === "派遣" && !newUserDispatchCompanyId) return;
    if (users.some((user) => user.id !== editingUserId && user.email.toLowerCase() === email.toLowerCase())) {
      showToast("同じメールアドレスのユーザーが存在します");
      return;
    }

    if (userDialogMode === "edit" && editingUserId) {
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id !== editingUserId) return user;
          return {
            ...user,
            name,
            email,
            avatar: Array.from(name)[0] ?? user.avatar,
            roleIds: newUserRoleIds,
            status: user.status === "locked" ? "locked" : newUserStatus,
            employmentType: newUserEmploymentType,
            unitPrice: nextUnitPrice,
            dispatchCompanyId: newUserEmploymentType === "派遣" ? newUserDispatchCompanyId : undefined,
          };
        }),
      );
      showToast("ユーザーを更新しました");
      closeUserDialog();
      return;
    }

    const nextNumber = users.reduce((max, user) => Math.max(max, Number(user.id.replace(/\D/g, "")) || 0), 0) + 1;
    const nextId = `U${String(nextNumber).padStart(3, "0")}`;
    const avatar = Array.from(name)[0] ?? "新";

    setUsers((prev) => [
      ...prev,
      {
        id: nextId,
        deploymentWorkerId: buildDeploymentWorkerIdFromUserId(nextId, nextNumber - 1),
        name,
        email,
        avatar,
        roleIds: newUserRoleIds,
        status: newUserStatus,
        lastLogin: "未ログイン",
        createdAt: new Date().toISOString().slice(0, 10),
        mfaEnabled: false,
        employmentType: newUserEmploymentType,
        unitPrice: nextUnitPrice,
        dispatchCompanyId: newUserEmploymentType === "派遣" ? newUserDispatchCompanyId : undefined,
        skills: [],
        certifications: [],
        performance: { uph: 0, attendanceRate: 0 },
      },
    ]);
    closeUserDialog();
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

  const saveTeamDialog = () => {
    const name = newTeamName.trim();
    const description = newTeamDescription.trim();
    if (!name) return;

    if (
      teams.some(
        (team) => team.id !== editingTeamId && team.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      showToast("同じ名前のチームが既に存在します");
      return;
    }

    if (teamDialogMode === "edit" && editingTeamId) {
      setTeams((prev) =>
        prev.map((team) =>
          team.id === editingTeamId
            ? {
                ...team,
                name,
                description,
                memberUserIds: newTeamMemberIds,
                themeColor: newTeamThemeColor,
              }
            : team,
        ),
      );
      showToast("チームを更新しました");
      closeTeamDialog();
      return;
    }

    setTeams((prev) => [
      ...prev,
      {
        id: `team-${Date.now()}`,
        name,
        description,
        memberUserIds: newTeamMemberIds,
        themeColor: newTeamThemeColor,
        createdAt: new Date().toISOString().slice(0, 10),
      },
    ]);
    showToast("チームを追加しました");
    closeTeamDialog();
  };

  const deleteTeam = (teamId: string) => {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    setTeams((prev) => prev.filter((item) => item.id !== teamId));
    if (editingTeamId === teamId) closeTeamDialog();
    showToast(`チーム「${team.name}」を削除しました`);
  };

  const unlockUser = (userId: string) => {
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, status: "active" } : u));
    showToast("ロックを解除しました");
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
    teams: teams.length,
    teamMembers: new Set(teams.flatMap((team) => team.memberUserIds)).size,
    emptyTeams: teams.filter((team) => team.memberUserIds.length === 0).length,
  };
  const cardClass = `${c.bgCard} border ${c.border} rounded-2xl shadow-[0_20px_48px_-36px_rgba(15,23,42,0.35)]`;
  const panelClass = `rounded-2xl border ${c.borderCard} ${c.bgPanel}`;
  const surfaceCardClass = `rounded-xl border ${c.borderCard} ${c.bgSurface}`;
  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textPrimary} placeholder:${c.textDimmed}`;
  const selectClass = `${inputClass} cursor-pointer ${c.textSecondary}`;
  const filterSelectClass = `h-10 min-w-[124px] rounded-xl border px-3 text-[12px] outline-none transition ${c.bgInput} ${c.borderCard} ${c.textSecondary} cursor-pointer`;
  const primaryButtonClass =
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:bg-[#0F4FE3]";
  const secondaryButtonClass = `inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[13px] font-semibold transition ${c.borderCard} ${c.bgCard} ${c.textSecondary} hover:border-[#B7CDFF] hover:text-[#155DFC]`;
  const userDialogSaveDisabled =
    !newUserName.trim() ||
    !newUserEmail.trim() ||
    newUserRoleIds.length === 0 ||
    (newUserEmploymentType === "派遣" && !newUserDispatchCompanyId);

  /* ================================================================ */

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden p-6">

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
      <div className={`${cardClass} shrink-0`}>
        <div className={`flex flex-col gap-4 border-b px-5 py-4 ${c.border}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setActiveTab("users")}
                className={`inline-flex h-[42px] items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-all ${
                  activeTab === "users"
                    ? "border-[#155DFC] bg-[#155DFC] text-white shadow-[0_12px_32px_-18px_rgba(21,93,252,0.9)]"
                    : `${c.borderCard} bg-white/85 ${c.textSecondary} hover:border-[#B7CDFF] hover:text-[#155DFC]`
                }`}
              >
                <Users className="h-4 w-4" />
                ユーザー一覧
              </button>
              <button
                onClick={() => setActiveTab("roles")}
                className={`inline-flex h-[42px] items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-all ${
                  activeTab === "roles"
                    ? "border-violet-500 bg-violet-600 text-white shadow-[0_12px_32px_-18px_rgba(124,58,237,0.9)]"
                    : `${c.borderCard} bg-white/85 ${c.textSecondary} hover:border-violet-200 hover:text-violet-700`
                }`}
              >
                <Shield className="h-4 w-4" />
                ロール・権限設定
              </button>
              <button
                onClick={() => setActiveTab("teams")}
                className={`inline-flex h-[42px] items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-all ${
                  activeTab === "teams"
                    ? "border-[#155DFC] bg-[#155DFC] text-white shadow-[0_12px_32px_-18px_rgba(21,93,252,0.9)]"
                    : `${c.borderCard} bg-white/85 ${c.textSecondary} hover:border-[#B7CDFF] hover:text-[#155DFC]`
                }`}
              >
                <Users className="h-4 w-4" />
                チーム
              </button>
            </div>

            <div className="flex items-center gap-3">
              {activeTab === "users" && (
                <button onClick={openCreateUserDialog} className={`${primaryButtonClass} bg-[#155DFC]`}>
                <UserPlus className="w-4 h-4" />ユーザー追加
                </button>
              )}
              {activeTab === "roles" && (
                <button onClick={() => setShowAddRole(!showAddRole)} className={`${primaryButtonClass} bg-violet-600`}>
                <Plus className="w-4 h-4" />ロール追加
                </button>
              )}
              {activeTab === "teams" && (
                <button onClick={openCreateTeamDialog} className={`${primaryButtonClass} bg-[#155DFC]`}>
                  <Plus className="w-4 h-4" />チーム追加
                </button>
              )}
            </div>
          </div>

        </div>

        <div className="overflow-x-auto px-5 py-5">
          <div className="flex min-w-max gap-3">
            {(activeTab === "teams"
              ? [
                  { icon: Users, label: "総チーム", value: stats.teams, iconColor: "text-[#155DFC]", bgIcon: "bg-[#155DFC]/10" },
                  { icon: UserPlus, label: "所属ユーザー", value: stats.teamMembers, iconColor: "text-emerald-400", bgIcon: "bg-emerald-500/10" },
                  { icon: ShieldAlert, label: "空チーム", value: stats.emptyTeams, iconColor: "text-amber-400", bgIcon: "bg-amber-500/10" },
                ]
              : [
                  { icon: Users, label: "総ユーザー", value: stats.total, iconColor: "text-cyan-400", bgIcon: "bg-cyan-500/10" },
                  { icon: ShieldCheck, label: "有効", value: stats.active, iconColor: "text-emerald-400", bgIcon: "bg-emerald-500/10" },
                  { icon: ShieldAlert, label: "ロック中", value: stats.locked, iconColor: "text-red-400", bgIcon: "bg-red-500/10" },
                  { icon: Key, label: "MFA有効", value: stats.mfaEnabled, iconColor: "text-amber-400", bgIcon: "bg-amber-500/10" },
                  { icon: Shield, label: "ロール数", value: stats.roles, iconColor: "text-violet-400", bgIcon: "bg-violet-500/10" },
                ]).map((s) => (
              <div key={s.label} className={`w-[188px] shrink-0 rounded-2xl border p-4 ${c.borderCard} ${c.bgPanel}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-xs ${c.textSecondary}`}>{s.label}</div>
                    <div className={`mt-1 text-lg font-semibold ${c.textPrimary} tabular-nums`}>{s.value}</div>
                  </div>
                  <div className={`rounded-xl p-2 ${s.bgIcon}`}>
                    <s.icon className={`h-5 w-5 ${s.iconColor}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════ */}
      {/* USERS TAB                           */}
      {/* ═══════════════════════════════════ */}
      {activeTab === "users" && (
        <div className="min-h-0 flex-1 pt-4">
          <div className="grid h-full min-h-0 gap-4 grid-cols-1">
          {/* User List */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className={`${cardClass} flex-1 overflow-hidden`}>
              {/* Filters */}
              <div className={`border-b px-5 py-4 ${c.border}`}>
                <div className="grid items-center gap-3 xl:grid-cols-[minmax(260px,1.35fr)_repeat(4,minmax(120px,0.72fr))_auto]">
                  <div className="relative min-w-0">
                    <Search className={`w-4 h-4 ${c.textMuted} absolute left-3 top-1/2 -translate-y-1/2`} />
                    <input
                      type="text"
                      placeholder="名前・メール・IDで検索..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`${inputClass} pl-10 pr-4`}
                    />
                  </div>
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className={filterSelectClass}
                  >
                    <option value="all">全ロール</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className={filterSelectClass}
                  >
                    <option value="all">全ステータス</option>
                    <option value="active">有効</option>
                    <option value="inactive">無効</option>
                    <option value="locked">ロック</option>
                  </select>
                  <select
                    value={filterEmpType}
                    onChange={(e) => setFilterEmpType(e.target.value)}
                    className={filterSelectClass}
                  >
                    <option value="all">全雇用形態</option>
                    <option value="正社員">正社員</option>
                    <option value="パートナー">パートナー</option>
                    <option value="派遣">派遣</option>
                  </select>
                  <select
                    value={filterSkill}
                    onChange={(e) => setFilterSkill(e.target.value)}
                    className={`${filterSelectClass} min-w-[138px]`}
                  >
                    <option value="all">全スキル・資格</option>
                    {capabilityOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <span className={`justify-self-end inline-flex items-center rounded-full border px-3 py-1 text-[12px] ${c.borderCard} ${c.textMuted} ${c.bgPanel}`}>
                    {filteredUsers.length}件
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full">
                  <thead className={`sticky top-0 z-10 backdrop-blur ${c.bgSurface}`}>
                    <tr className={`border-b ${c.border}`}>
                      {["ユーザー", "スキル・資格", "ロール", "雇用形態", "単価", "ステータス", "MFA", "最終ログイン", "操作"].map((h) => (
                        <th key={h} className={`text-left text-[11px] font-medium ${c.textMuted} px-5 py-3.5 whitespace-nowrap`}>
                          {h === "操作" ? "" : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const st = statusConfig[user.status];
                      const avatarTone = getUserAvatarTone(user.id);
                      return (
                        <tr
                          key={user.id}
                          onClick={() => openEditUserDialog(user.id)}
                          className={`border-b ${c.border} cursor-pointer transition-colors ${
                            c.isDark
                              ? "hover:bg-slate-900/60"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] shrink-0 ${avatarTone.avatarClass}`}>
                                {user.avatar}
                              </div>
                              <div className="min-w-0">
                                <div className={`text-[13px] font-medium ${c.textPrimary}`}>{user.name}</div>
                                <div className={`truncate text-[11px] ${c.textMuted}`}>{user.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex max-w-[140px] flex-wrap gap-1.5">
                              {user.skills.slice(0, 2).map(s => (
                                <CapabilityIconChip
                                  key={s.name}
                                  title={s.name}
                                  tone="skill"
                                  iconKey={skillMasterMap.get(s.name)?.iconKey}
                                />
                              ))}
                              {user.certifications.slice(0, 1).map(c => (
                                <CapabilityIconChip
                                  key={c.name}
                                  title={c.name}
                                  tone="qualification"
                                  iconKey={qualificationMasterMap.get(c.name)?.iconKey}
                                />
                              ))}
                              {(user.skills.length + user.certifications.length) > 3 && (
                                <span className={`text-[10px] ${c.textMuted} self-center ml-1`}>+{user.skills.length + user.certifications.length - 3}</span>
                              )}
                              {(user.skills.length === 0 && user.certifications.length === 0) && (
                                <span className={`text-[10px] ${c.textDimmed}`}>未登録</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1.5">
                              {user.roleIds.map(rid => (
                                <span key={rid} className={`text-[10px] px-2.5 py-1 rounded-full bg-gray-500/5 ${getRoleColor(rid)}`}>
                                  {getRoleName(rid)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex w-fit text-[11px] px-2.5 py-1 rounded-full ${empTypeColor[user.employmentType] ?? ""}`}>{user.employmentType}</span>
                              {user.employmentType === "派遣" && (
                                <span className={`text-[10px] ${c.textMuted}`}>
                                  {user.dispatchCompanyId ? dispatchCompanyMap.get(user.dispatchCompanyId)?.name ?? "会社未設定" : "会社未設定"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span className={`text-[12px] font-medium ${c.textPrimary} tabular-nums`}>{formatUnitPrice(user.unitPrice)}</span>
                              <span className={`text-[10px] ${c.textMuted}`}>個別設定</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                              <span className={`text-[11px] px-2.5 py-1 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            {user.mfaEnabled ? (
                              <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <span className={`text-[11px] ${c.textDimmed}`}>—</span>
                            )}
                          </td>
                          <td className={`px-5 py-4 text-[12px] ${c.textSecondary} tabular-nums`}>{user.lastLogin}</td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditUserDialog(user.id);
                              }}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                                c.isDark
                                  ? `border-slate-800 text-slate-400 hover:border-slate-600 hover:bg-slate-900`
                                  : `border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-100`
                              }`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-5 py-12 text-center">
                          <div className={`text-[13px] ${c.textMuted}`}>条件に一致するユーザーが見つかりません。</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {userDialogMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          onClick={closeUserDialog}
        >
          <div
            className={`${cardClass} flex max-h-[calc(100vh-40px)] w-full max-w-5xl flex-col overflow-hidden`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${c.border}`}>
              <div>
                <div className={`text-lg font-semibold ${c.textPrimary}`}>
                  {userDialogMode === "create" ? "ユーザーを追加" : "ユーザーを編集"}
                </div>
                <div className={`mt-1 text-[12px] ${c.textMuted}`}>
                  {userDialogMode === "create"
                    ? "基本情報を入力して新しいユーザーを登録します。"
                    : "ユーザーの基本情報と現場スキルをまとめて編集します。"}
                </div>
              </div>
              <button type="button" onClick={closeUserDialog} className={`${c.textMuted} transition hover:opacity-70`}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-5">
                <div className={`${panelClass} p-4`}>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>氏名</span>
                      <input
                        type="text"
                        value={newUserName}
                        onChange={(event) => setNewUserName(event.target.value)}
                        placeholder="氏名を入力"
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>メールアドレス</span>
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(event) => setNewUserEmail(event.target.value)}
                        placeholder="メールアドレスを入力"
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-1.5 md:col-span-2 xl:col-span-3">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>付与ロール</span>
                      <CompactMultiSelect
                        options={roles.map((role) => ({ id: role.id, name: role.name }))}
                        selectedIds={newUserRoleIds}
                        onChange={setNewUserRoleIds}
                        placeholder="ロールを選択"
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>雇用形態</span>
                      <select
                        value={newUserEmploymentType}
                        onChange={(event) => setNewUserEmploymentType(event.target.value as "正社員" | "パートナー" | "派遣")}
                        className={selectClass}
                      >
                        <option value="正社員">正社員</option>
                        <option value="パートナー">パートナー</option>
                        <option value="派遣">派遣</option>
                      </select>
                    </label>
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>ステータス</span>
                      <select value={newUserStatus} onChange={(event) => setNewUserStatus(event.target.value as "active" | "inactive")} className={selectClass}>
                        <option value="active">有効</option>
                        <option value="inactive">無効</option>
                      </select>
                    </label>
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>単価</span>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={newUserUnitPrice}
                          onChange={(event) => setNewUserUnitPrice(event.target.value)}
                          placeholder="単価"
                          className={`${inputClass} pr-12`}
                        />
                        <span className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] ${c.textMuted}`}>円/時</span>
                      </div>
                    </label>
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>派遣会社</span>
                      {newUserEmploymentType === "派遣" ? (
                        <select value={newUserDispatchCompanyId} onChange={(event) => setNewUserDispatchCompanyId(event.target.value)} className={selectClass}>
                          <option value="">{dispatchCompanies.length === 0 ? "派遣会社マスタが未登録です" : "派遣会社を選択"}</option>
                          {dispatchCompanies.map((company) => (
                            <option key={company.id} value={company.id}>{company.name}</option>
                          ))}
                        </select>
                      ) : (
                        <div className={`flex h-10 items-center rounded-xl border px-3 text-[12px] ${c.borderCard} ${c.bgInput} ${c.textMuted}`}>
                          派遣以外の雇用形態では派遣会社の指定は不要です
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {selectedUser && (
                  <>
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className={`${panelClass} p-4`}>
                        <div className={`text-[11px] ${c.textMuted}`}>ユーザーID</div>
                        <div className={`mt-1 text-[14px] font-semibold ${c.textPrimary}`}>{selectedUser.id}</div>
                      </div>
                      <div className={`${panelClass} p-4`}>
                        <div className={`text-[11px] ${c.textMuted}`}>最終ログイン</div>
                        <div className={`mt-1 text-[14px] font-semibold ${c.textPrimary} tabular-nums`}>{selectedUser.lastLogin}</div>
                      </div>
                      <div className={`${panelClass} p-4`}>
                        <div className={`text-[11px] ${c.textMuted}`}>作成日</div>
                        <div className={`mt-1 text-[14px] font-semibold ${c.textPrimary} tabular-nums`}>{selectedUser.createdAt}</div>
                      </div>
                      <div className={`${panelClass} p-4`}>
                        <div className={`text-[11px] ${c.textMuted}`}>MFA</div>
                        <div className="mt-1 flex items-center gap-2">
                          {selectedUser.mfaEnabled ? (
                            <>
                              <ShieldCheck className="h-4 w-4 text-emerald-400" />
                              <span className="text-[14px] font-semibold text-emerald-400">有効</span>
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="h-4 w-4 text-amber-400" />
                              <span className="text-[14px] font-semibold text-amber-400">無効</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className={`${panelClass} p-4`}>
                        <h4 className={`mb-4 flex items-center gap-2 text-[12px] font-black uppercase tracking-widest ${c.textMuted}`}>
                          <Award className="h-4 w-4 text-violet-400" />
                          スキル
                        </h4>
                        <div className="space-y-2">
                          {selectedUser.skills.map((skill) => (
                            <div key={skill.name} className="group flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button onClick={() => removeSkillFromUser(selectedUser.id, skill.name)} className="rounded p-1 text-rose-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/10">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                                <CapabilityIconChip
                                  title={skill.name}
                                  tone="skill"
                                  iconKey={skillMasterMap.get(skill.name)?.iconKey}
                                  sizeClass="h-7 w-7"
                                  iconSizeClass="h-4 w-4"
                                  roundedClass="rounded-lg"
                                />
                                <span className={`text-[13px] ${c.textSecondary}`}>{skill.name}</span>
                              </div>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((level) => (
                                  <button
                                    key={level}
                                    onClick={() => updateSkillLevel(selectedUser.id, skill.name, level)}
                                    className={`h-1.5 w-1.5 rounded-full transition-all ${level <= skill.level ? "bg-violet-500 hover:bg-violet-400" : "bg-gray-200 hover:bg-gray-300 dark:bg-gray-800"}`}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="relative group/addskill">
                            <button className={`w-full rounded-xl border-2 border-dashed px-3 py-2 text-[11px] font-bold ${c.textMuted} transition hover:border-violet-500/30 hover:text-violet-500`}>
                              <Plus className="mr-1 inline h-3 w-3" /> スキルを追加
                            </button>
                            <div className={`absolute top-full left-0 z-20 mt-1 max-h-[200px] w-full overflow-y-auto rounded-xl border p-2 opacity-0 invisible shadow-2xl transition group-hover/addskill:visible group-hover/addskill:opacity-100 ${c.bgCard} ${c.borderCard}`}>
                              <div className="space-y-1">
                                {skills.filter((item) => !selectedUser.skills.find((skill) => skill.name === item.name)).map((item) => (
                                  <button key={item.id} onClick={() => addSkillToUser(selectedUser.id, item.name)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${c.textSecondary} hover:bg-violet-500/10 hover:text-violet-500`}>
                                    <CapabilityIconChip
                                      title={item.name}
                                      tone="skill"
                                      iconKey={item.iconKey}
                                      sizeClass="h-6 w-6"
                                      iconSizeClass="h-3.5 w-3.5"
                                      roundedClass="rounded-lg"
                                    />
                                    <span>{item.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`${panelClass} p-4`}>
                        <h4 className={`mb-4 flex items-center gap-2 text-[12px] font-black uppercase tracking-widest ${c.textMuted}`}>
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                          資格
                        </h4>
                        <div className="space-y-2">
                          {selectedUser.certifications.map((cert) => (
                            <div key={cert.name} className={`group flex items-center justify-between rounded-xl border p-2 ${c.borderCard} ${c.bgSurface}`}>
                              <div className="flex items-center gap-3">
                                <button onClick={() => removeCertFromUser(selectedUser.id, cert.name)} className="rounded p-1 text-rose-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/10">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                                <CapabilityIconChip
                                  title={cert.name}
                                  tone="qualification"
                                  iconKey={qualificationMasterMap.get(cert.name)?.iconKey}
                                  sizeClass="h-7 w-7"
                                  iconSizeClass="h-4 w-4"
                                  roundedClass="rounded-lg"
                                />
                                <div>
                                  <div className={`text-[12px] font-bold ${c.textPrimary}`}>{cert.name}</div>
                                  <div className={`text-[10px] ${c.textMuted}`}>{cert.expiry}まで</div>
                                </div>
                              </div>
                              <ShieldCheck className={`h-4 w-4 ${cert.status === "valid" ? "text-emerald-500" : "text-amber-500"}`} />
                            </div>
                          ))}
                          <div className="relative group/addcert">
                            <button className={`w-full rounded-xl border-2 border-dashed px-3 py-2 text-[11px] font-bold ${c.textMuted} transition hover:border-emerald-500/30 hover:text-emerald-500`}>
                              <Plus className="mr-1 inline h-3 w-3" /> 資格証を登録
                            </button>
                            <div className={`absolute top-full left-0 z-20 mt-1 max-h-[200px] w-full overflow-y-auto rounded-xl border p-2 opacity-0 invisible shadow-2xl transition group-hover/addcert:visible group-hover/addcert:opacity-100 ${c.bgCard} ${c.borderCard}`}>
                              <div className="space-y-1">
                                {qualifications.filter((item) => !selectedUser.certifications.find((certification) => certification.name === item.name)).map((item) => (
                                  <button key={item.id} onClick={() => addCertToUser(selectedUser.id, item.name)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${c.textSecondary} hover:bg-emerald-500/10 hover:text-emerald-500`}>
                                    <CapabilityIconChip
                                      title={item.name}
                                      tone="qualification"
                                      iconKey={item.iconKey}
                                      sizeClass="h-6 w-6"
                                      iconSizeClass="h-3.5 w-3.5"
                                      roundedClass="rounded-lg"
                                    />
                                    <span>{item.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                      <div className={`${panelClass} p-4`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className={`text-[12px] font-semibold ${c.textPrimary}`}>配置備考</div>
                            <div className={`mt-1 text-[10px] ${c.textMuted}`}>現場配置の人員カードに表示する備考です</div>
                          </div>
                          {selectedUser.deploymentWorkerId ? (
                            <span className={`text-[10px] ${c.textMuted}`}>現場配置連携済み</span>
                          ) : (
                            <span className={`text-[10px] ${c.textDimmed}`}>未連携</span>
                          )}
                        </div>
                        {selectedUser.deploymentWorkerId ? (
                          <input
                            type="text"
                            value={deploymentWorkerNoteMap.get(selectedUser.deploymentWorkerId) ?? ""}
                            onChange={(event) => updateDeploymentWorkerNoteDraft(selectedUser.deploymentWorkerId!, event.target.value)}
                            onBlur={() => commitDeploymentWorkerNote(selectedUser.deploymentWorkerId!)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                            }}
                            placeholder="例: 梱包担当"
                            className={`mt-3 ${inputClass}`}
                          />
                        ) : (
                          <div className={`mt-3 rounded-lg border border-dashed px-3 py-2 text-[11px] ${c.borderCard} ${c.textMuted}`}>
                            このユーザーは現場配置カード用の作業者データに未連携です
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className={`${panelClass} p-3 text-center`}>
                          <div className="text-[18px] font-black text-cyan-400">{selectedUser.performance.uph}</div>
                          <div className="text-[10px] font-bold uppercase text-gray-400">平均UPH</div>
                        </div>
                        <div className={`${panelClass} p-3 text-center`}>
                          <div className="text-[18px] font-black text-emerald-400">{selectedUser.performance.attendanceRate}%</div>
                          <div className="text-[10px] font-bold uppercase text-gray-400">出勤率</div>
                        </div>
                        <div className={`${panelClass} p-3 text-center`}>
                          <div className="text-[18px] font-black tabular-nums text-amber-400">{formatUnitPrice(selectedUser.unitPrice)}</div>
                          <div className="text-[10px] font-bold uppercase text-gray-400">単価</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <button className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-[12px] transition ${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:opacity-80`}>
                        <Mail className="h-3.5 w-3.5" />パスワードリセットメール送信
                      </button>
                      <button className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-[12px] transition ${c.bgSurface} ${c.borderCard} ${c.textSecondary} hover:opacity-80`}>
                        <Clock className="h-3.5 w-3.5" />アクセスログ表示
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2 border-t px-6 py-4 ${c.border}`}>
              <button type="button" onClick={closeUserDialog} className={secondaryButtonClass}>
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveUserDialog}
                disabled={userDialogSaveDisabled}
                className={`${primaryButtonClass} bg-[#155DFC] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100`}
              >
                {userDialogMode === "create" ? "追加" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {teamDialogMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          onClick={closeTeamDialog}
        >
          <div
            className={`${cardClass} flex max-h-[calc(100vh-40px)] w-full max-w-3xl flex-col overflow-hidden`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${c.border}`}>
              <div>
                <div className={`text-lg font-semibold ${c.textPrimary}`}>
                  {teamDialogMode === "create" ? "チームを追加" : "チームを編集"}
                </div>
                <div className={`mt-1 text-[12px] ${c.textMuted}`}>
                  管理チーム名、説明、所属メンバーを設定します。
                </div>
              </div>
              <button type="button" onClick={closeTeamDialog} className={`${c.textMuted} transition hover:opacity-70`}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-5">
                <div className={`${panelClass} p-4`}>
                  <div className="grid gap-4">
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>チーム名</span>
                      <input
                        type="text"
                        value={newTeamName}
                        onChange={(event) => setNewTeamName(event.target.value)}
                        placeholder="例: 朝礼運営チーム"
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>説明</span>
                      <textarea
                        value={newTeamDescription}
                        onChange={(event) => setNewTeamDescription(event.target.value)}
                        rows={3}
                        placeholder="チームの役割や担当範囲を入力"
                        className={`${inputClass} resize-none py-3`}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>メンバー</span>
                      <CompactMultiSelect
                        options={teamMemberOptions}
                        selectedIds={newTeamMemberIds}
                        onChange={setNewTeamMemberIds}
                        placeholder="メンバーを選択"
                      />
                    </label>
                    <div className="grid gap-1.5">
                      <span className={`text-xs font-medium ${c.textSecondary}`}>テーマカラー</span>
                      <div className="flex flex-wrap gap-2">
                        {TEAM_COLOR_OPTIONS.map((option) => {
                          const selected = newTeamThemeColor === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setNewTeamThemeColor(option.id)}
                              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] transition ${
                                selected
                                  ? "border-[#155DFC] bg-[#EEF4FF] text-[#155DFC]"
                                  : `${c.borderCard} ${c.bgSurface} ${c.textSecondary}`
                              }`}
                            >
                              <span className={`inline-flex h-4 w-4 rounded-full ${option.accentClass}`} />
                              {option.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`${panelClass} p-4`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className={`text-[12px] font-semibold ${c.textPrimary}`}>選択中のメンバー</div>
                    <div className={`text-[11px] ${c.textMuted}`}>{newTeamMemberIds.length}名</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {newTeamMemberIds.length > 0 ? (
                      newTeamMemberIds.map((memberId) => {
                        const member = users.find((user) => user.id === memberId);
                        if (!member) return null;
                        return (
                          <span
                            key={memberId}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] ${c.borderCard} ${c.bgSurface} ${c.textPrimary}`}
                          >
                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${getUserAvatarTone(member.id).avatarClass}`}>
                              {member.avatar}
                            </span>
                            {member.name}
                          </span>
                        );
                      })
                    ) : (
                      <div className={`text-[12px] ${c.textMuted}`}>まだメンバーが選択されていません</div>
                    )}
                  </div>
                </div>

                {selectedTeam ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={`${panelClass} p-4`}>
                      <div className={`text-[11px] ${c.textMuted}`}>チームID</div>
                      <div className={`mt-1 text-[14px] font-semibold ${c.textPrimary}`}>{selectedTeam.id}</div>
                    </div>
                    <div className={`${panelClass} p-4`}>
                      <div className={`text-[11px] ${c.textMuted}`}>作成日</div>
                      <div className={`mt-1 text-[14px] font-semibold ${c.textPrimary} tabular-nums`}>{selectedTeam.createdAt}</div>
                    </div>
                    <div className={`${panelClass} p-4 md:col-span-2`}>
                      <div className={`text-[11px] ${c.textMuted}`}>テーマカラー</div>
                      <div className="mt-2">
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] ${getTeamColorOption(selectedTeam.themeColor).chipClass}`}>
                          <span className={`inline-flex h-4 w-4 rounded-full ${getTeamColorOption(selectedTeam.themeColor).accentClass}`} />
                          {getTeamColorOption(selectedTeam.themeColor).name}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2 border-t px-6 py-4 ${c.border}`}>
              <button type="button" onClick={closeTeamDialog} className={secondaryButtonClass}>
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveTeamDialog}
                disabled={!newTeamName.trim()}
                className={`${primaryButtonClass} bg-[#155DFC] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100`}
              >
                {teamDialogMode === "create" ? "追加" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "teams" && (
        <div className="min-h-0 flex-1 pt-4">
          <div className={`${cardClass} flex h-full flex-col overflow-hidden`}>
            <div className={`border-b px-5 py-4 ${c.border}`}>
              <div className="grid items-center gap-3 xl:grid-cols-[minmax(260px,1fr)_auto]">
                <div className="relative min-w-0">
                  <Search className={`w-4 h-4 ${c.textMuted} absolute left-3 top-1/2 -translate-y-1/2`} />
                  <input
                    type="text"
                    placeholder="チーム名・説明・メンバー名で検索..."
                    value={teamSearchTerm}
                    onChange={(event) => setTeamSearchTerm(event.target.value)}
                    className={`${inputClass} pl-10 pr-4`}
                  />
                </div>
                <div className={`justify-self-end text-[12px] ${c.textMuted}`}>{filteredTeams.length}件</div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full border-collapse">
                <thead className={`${c.bgSurface} ${c.textSecondary}`}>
                  <tr>
                    {["チーム", "説明", "メンバー", "作成日", "操作"].map((h) => (
                      <th key={h} className={`border-b px-5 py-3 text-left text-[12px] font-semibold ${c.border}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((team) => (
                    <tr
                      key={team.id}
                      className={`border-b transition ${c.border} ${c.bgCardHover}`}
                    >
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-3 w-3 rounded-full ${getTeamColorOption(team.themeColor).accentClass}`} />
                          <div className={`text-[13px] font-semibold ${c.textPrimary}`}>{team.name}</div>
                        </div>
                        <div className={`mt-1 text-[11px] ${c.textMuted}`}>{team.id}</div>
                      </td>
                      <td className={`px-5 py-4 align-top text-[12px] ${c.textSecondary}`}>
                        {team.description || "説明未設定"}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-wrap gap-2">
                          {team.memberUserIds.length > 0 ? (
                            team.memberUserIds.map((memberId) => {
                              const member = users.find((user) => user.id === memberId);
                              if (!member) return null;
                              return (
                                <span
                                  key={memberId}
                                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] ${c.borderCard} ${c.bgSurface} ${c.textPrimary}`}
                                >
                                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${getUserAvatarTone(member.id).avatarClass}`}>
                                    {member.avatar}
                                  </span>
                                  {member.name}
                                </span>
                              );
                            })
                          ) : (
                            <span className={`text-[11px] ${c.textMuted}`}>メンバー未設定</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-5 py-4 align-top text-[12px] tabular-nums ${c.textSecondary}`}>{team.createdAt}</td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditTeamDialog(team.id)}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition ${c.borderCard} ${c.bgCard} ${c.textSecondary} hover:border-[#B7CDFF] hover:text-[#155DFC]`}
                            aria-label={`${team.name} を編集`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTeam(team.id)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-rose-500 transition hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`${team.name} を削除`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTeams.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center">
                        <div className={`text-[13px] ${c.textMuted}`}>管理チームがまだ登録されていません。</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════ */}
      {/* ROLES TAB                           */}
      {/* ═══════════════════════════════════ */}
      {activeTab === "roles" && (
        <div className="min-h-0 flex-1 pt-4">
          <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Role List */}
          <div className={`${cardClass} flex flex-col overflow-hidden`}>
            <div className={`p-4 border-b ${c.border}`}>
              <h3 className={`${c.textPrimary} text-[14px] mb-1`}>ロール一覧</h3>
              <p className={`text-[11px] ${c.textMuted}`}>クリックして権限を編集</p>
            </div>

            {/* Add Role Form */}
            {showAddRole && (
              <div className={`p-4 border-b ${c.border} ${c.bgSurface}`}>
                <input type="text" placeholder="ロール名" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)}
                  className={`${inputClass} mb-2`} />
                <input type="text" placeholder="説明（任意）" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)}
                  className={`${inputClass} mb-2 text-[12px] ${c.textSecondary}`} />
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
          <div className={`${cardClass} flex flex-col overflow-hidden`}>
            {selectedRole ? (
              <>
                {/* Role Header */}
                <div className={`px-6 py-4 border-b ${c.border}`}>
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
                        <div key={cat} className={`rounded-xl border ${c.borderCard} overflow-hidden ${c.bgPanel}`}>
                          {/* Category Header */}
                          <div className={`flex items-center justify-between px-4 py-3 cursor-pointer ${c.bgCardHover}`}
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
                  <div className={`mt-5 ${panelClass} p-4`}>
                    <h4 className={`text-[13px] ${c.textPrimary} mb-3 flex items-center gap-2`}>
                      <Users className="w-4 h-4 text-violet-400" />
                      このロールのユーザー
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {users.filter((u) => u.roleIds.includes(selectedRole.id)).map((u) => {
                        const st = statusConfig[u.status];
                        const avatarTone = getUserAvatarTone(u.id);
                        return (
                          <div key={u.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${c.border} ${c.bgSurface}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${avatarTone.avatarClass}`}>{u.avatar}</div>
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
        </div>
      )}
    </div>
  );
}

