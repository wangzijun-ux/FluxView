/**
 * 共有工程定義ストア
 * 工程ビルダー(ProcessBuilder)と配置マップ(LiveCommand)で
 * 同一の工程フローを参照するための単一データソース。
 *
 * エリア(Area)ごとに工程フローを定義可能。
 */

import {
  Warehouse,
  ClipboardCheck,
  Search,
  Scissors,
  Box,
  Truck,
  Package,
  Star,
  Shield,
  Award,
  Activity,
  Zap,
  Tag,
  type LucideIcon,
} from "lucide-react";

// --- 型定義 ---

export interface SkillMaster {
  id: string;
  name: string;
  category: "operation" | "certification" | "soft-skill";
  description: string;
  levelMax: number;
}

export interface Worker {
  id: string;
  name: string;
  initials: string;
  color: string;
  skills: { label: string; icon: string }[];
  status: "active" | "break" | "absent";
  shiftStart?: string;  // "08:00"
  shiftEnd?: string;    // "17:00"
  actualStart?: string; // "07:55"
  actualEnd?: string;   // "17:05"
  category: "正社員" | "パートナー" | "派遣";
}

export interface ProcessStep {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;          // テーマカラーキー (cyan, emerald, violet, …)
  wipRule: string;
  estimatedTime: string;
  requiredSkills: string[];
  /** 配置マップ用: ゾーン説明 */
  zoneDescription: string;
  /** 配置マップ用: デフォルト定員 */
  defaultCapacity: number;
  /** 配置マップ用: 基準 UPH（1人あたり） */
  baseUph: number;
  tasks: string[];
}

export interface ZoneSlot { workerId: string | null; }

export interface Zone {
  processId: string;
  areaId: string;
  name: string;
  description: string;
  color: string;
  icon: ProcessStep["icon"];
  capacity: number;
  baseUph: number;
  requiredSkills: string[];
  slots: ZoneSlot[];
  production: ZoneProduction;
}

export interface StaffChange {
  workerId: string;
  workerName: string;
  fromZone: string | null;   // null = プール
  toZone: string | null;     // null = プール
}

export interface AdjustmentEntry {
  id: string;
  scheduledTime: string;   // "HH:MM"
  createdAt: string;
  changes: StaffChange[];
  status: "pending" | "notified" | "applied";
  memo: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;       // "2026-03-07"
  workerId: string;
  shiftStart: string;
  shiftEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: "on-time" | "late" | "early-leave" | "absent" | "working";
}

export interface ZoneProduction {
  planned: number;
  actual: number;
  currentUph: number;
  startTime: string;
  targetEndTime: string;
}

/** エリア定義 */
export interface Area {
  id: string;
  name: string;
  description: string;
  color: string;           // テーマカラーキー
  processStepIds: string[]; // このエリアで使用する工程IDの順序
}

// --- マスター工程定義 ---

export const defaultProcessSteps: ProcessStep[] = [
  {
    id: "p1",
    name: "入荷",
    icon: Warehouse,
    color: "cyan",
    wipRule: "数量照合",
    estimatedTime: "30分",
    requiredSkills: ["リフト操作"],
    zoneDescription: "トラック荷卸し・数量照合",
    defaultCapacity: 5,
    baseUph: 145,
    tasks: ["トラック荷卸し", "パレット搬送", "数量照合"],
  },
  {
    id: "p2",
    name: "検品",
    icon: ClipboardCheck,
    color: "emerald",
    wipRule: "品質チェック",
    estimatedTime: "45分",
    requiredSkills: ["検品", "品質管理"],
    zoneDescription: "外観・品質チェック",
    defaultCapacity: 6,
    baseUph: 110,
    tasks: ["外観目視チェック", "バーコードスキャン", "不良品仕分け"],
  },
  {
    id: "p3",
    name: "格納",
    icon: Search,
    color: "violet",
    wipRule: "ロケーション格納",
    estimatedTime: "60分",
    requiredSkills: ["仕分け"],
    zoneDescription: "ロケーション格納・移動",
    defaultCapacity: 8,
    baseUph: 130,
    tasks: ["送り状照合", "エリア別仕分け", "棚入れ作業"],
  },
];

/** パレット用: 追加可能な工程テンプレート */
export const availableProcessTemplates = [
  { name: "入荷", icon: Warehouse },
  { name: "検品", icon: ClipboardCheck },
  { name: "格納", icon: Search },
];

export const skillMasterData: SkillMaster[] = [
  { id: "S001", name: "検品", category: "operation", description: "外観・数量の照合、不良品チェック", levelMax: 5 },
  { id: "S002", name: "梱包", category: "operation", description: "段ボール組立て、緩衝材封入、封緘", levelMax: 5 },
  { id: "S003", name: "仕分け", category: "operation", description: "ロケーション別・配送ルート別の仕分け", levelMax: 5 },
  { id: "S004", name: "ラベリング", category: "operation", description: "送り状・商品ラベルの貼付", levelMax: 5 },
  { id: "S005", name: "リフト操作", category: "certification", description: "カウンター・リーチ式フォークリフトの運転", levelMax: 5 },
  { id: "S006", name: "危険物", category: "certification", description: "危険物（乙四等）の取扱管理", levelMax: 3 },
  { id: "S007", name: "品質管理", category: "operation", description: "品質基準の策定と遵守状況の確認", levelMax: 5 },
  { id: "S008", name: "出荷管理", category: "operation", description: "出荷伝票の発行と配送車両の誘導", levelMax: 5 },
  { id: "C001", name: "フォークリフト免許", category: "certification", description: "公的機関発行のフォークリフト運転技能講習修了証", levelMax: 1 },
  { id: "C002", name: "危険物取扱者", category: "certification", description: "消防法に基づく危険物取扱者免状", levelMax: 1 },
];

/** 色クラスマップ */
export const processColorClasses: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  violet: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-400" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  rose: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400" },
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400" },
  pink: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-400" },
  teal: { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400" },
  indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400" },
};

// --- エリア定義（マスター） ---

export const defaultAreas: Area[] = [
  {
    id: "area-1",
    name: "Aエリア",
    description: "入荷・検品エリア",
    color: "cyan",
    processStepIds: ["p1", "p2"],
  },
  {
    id: "area-2",
    name: "Bエリア",
    description: "検品・格納エリア",
    color: "emerald",
    processStepIds: ["p2", "p3"],
  },
  {
    id: "area-3",
    name: "3F梱包場",
    description: "格納エリア",
    color: "violet",
    processStepIds: ["p3"],
  },
];

/** エリアIDから工程ステップ配列を取得するヘルパー */
export function getProcessStepsForArea(area: Area): ProcessStep[] {
  return area.processStepIds
    .map((id) => defaultProcessSteps.find((s) => s.id === id))
    .filter((s): s is ProcessStep => !!s);
}

// --- 配置マップ用: 初期生産データ ---

/** processId → 初期生産数値 */
export const defaultProductionData: Record<string, ZoneProduction> = {
  p1: { planned: 1200, actual: 680, currentUph: 145, startTime: "06:00", targetEndTime: "15:00" },
  p2: { planned: 1800, actual: 1020, currentUph: 110, startTime: "06:30", targetEndTime: "17:00" },
  p3: { planned: 2400, actual: 820, currentUph: 130, startTime: "06:00", targetEndTime: "18:00" },
};

// --- 配置マップ用: 初期スタッフ配置 ---

export const defaultSlotAssignments: Record<string, (string | null)[]> = {
  p1: ["w1", null, null, null, null],
  p2: ["w2", "w3", null, null, null, null],
  p3: [null, null, null, null, null, null, null, null],
};

export const INITIAL_WORKERS: Worker[] = [
  { id: "w1", name: "田中 太郎", initials: "田", color: "bg-blue-500", skills: [{ label: "L", icon: "✅" }, { label: "FL", icon: "🔑" }], status: "active", shiftStart: "06:00", shiftEnd: "15:00", actualStart: "05:55", category: "正社員" },
  { id: "w2", name: "渡辺 謙", initials: "渡", color: "bg-emerald-500", skills: [{ label: "検品", icon: "🔍" }], status: "active", shiftStart: "08:00", shiftEnd: "17:00", actualStart: "08:05", category: "正社員" },
  { id: "w3", name: "佐藤 花子", initials: "佐", color: "bg-violet-500", skills: [{ label: "検品", icon: "🔍" }, { label: "品質", icon: "○" }], status: "active", shiftStart: "08:00", shiftEnd: "17:00", actualStart: "07:58", category: "パートナー" },
  { id: "w4", name: "高橋 優子", initials: "高", color: "bg-amber-500", skills: [{ label: "加工", icon: "✂" }, { label: "ラベル", icon: "🏷" }], status: "active", shiftStart: "09:00", shiftEnd: "18:00", actualStart: "08:50", category: "パートナー" },
  { id: "w5", name: "伊藤 健", initials: "伊", color: "bg-rose-400", skills: [{ label: "梱包", icon: "📦" }], status: "active", shiftStart: "06:00", shiftEnd: "15:00", actualStart: "06:10", category: "正社員" },
  { id: "w6", name: "鈴木 一郎", initials: "鈴", color: "bg-orange-500", skills: [{ label: "FL", icon: "🔑" }, { label: "出荷", icon: "🚛" }], status: "active", shiftStart: "08:00", shiftEnd: "17:00", actualStart: "08:00", category: "派遣" },
  { id: "w7", name: "小林 さくら", initials: "小", color: "bg-pink-400", skills: [{ label: "New", icon: "🌱" }], status: "active", shiftStart: "10:00", shiftEnd: "19:00", actualStart: "09:55", category: "派遣" },
  { id: "w8", name: "中村 敏", initials: "中", color: "bg-gray-400", skills: [{ label: "FL", icon: "🔑" }], status: "absent", shiftStart: "08:00", shiftEnd: "17:00", category: "パートナー" },
  { id: "w9", name: "山田 裕子", initials: "山", color: "bg-teal-500", skills: [{ label: "仕分", icon: "📋" }], status: "active", shiftStart: "06:00", shiftEnd: "15:00", actualStart: "05:50", category: "正社員" },
  { id: "w10", name: "松本 翔", initials: "松", color: "bg-indigo-500", skills: [{ label: "仕分", icon: "📋" }, { label: "FL", icon: "🔑" }], status: "active", shiftStart: "09:00", shiftEnd: "18:00", actualStart: "09:05", category: "派遣" },
];

export const MOCK_ATTENDANCE_HISTORY: AttendanceRecord[] = [
  // 2026-03-07 (Today/Recent)
  { id: "h1", date: "2026-03-07", workerId: "w1", shiftStart: "06:00", shiftEnd: "15:00", actualStart: "05:55", status: "working" },
  { id: "h2", date: "2026-03-07", workerId: "w2", shiftStart: "08:00", shiftEnd: "17:00", actualStart: "08:05", status: "working" },
  { id: "h3", date: "2026-03-07", workerId: "w8", shiftStart: "08:00", shiftEnd: "17:00", status: "absent" },
  // 2026-03-06
  { id: "h4", date: "2026-03-06", workerId: "w1", shiftStart: "06:00", shiftEnd: "15:00", actualStart: "06:00", actualEnd: "15:05", status: "on-time" },
  { id: "h5", date: "2026-03-06", workerId: "w2", shiftStart: "08:00", shiftEnd: "17:00", actualStart: "08:15", actualEnd: "17:00", status: "late" },
  { id: "h6", date: "2026-03-06", workerId: "w3", shiftStart: "08:00", shiftEnd: "17:00", actualStart: "07:55", actualEnd: "17:10", status: "on-time" },
  // 2026-03-05
  { id: "h7", date: "2026-03-05", workerId: "w1", shiftStart: "06:00", shiftEnd: "15:00", actualStart: "05:58", actualEnd: "15:02", status: "on-time" },
  { id: "h8", date: "2026-03-05", workerId: "w2", shiftStart: "08:00", shiftEnd: "17:00", actualStart: "07:59", actualEnd: "17:00", status: "on-time" },
];
