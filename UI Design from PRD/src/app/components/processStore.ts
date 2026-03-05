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
  type LucideIcon,
} from "lucide-react";

// --- 型定義 ---

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
  },
  {
    id: "p3",
    name: "仕分け",
    icon: Search,
    color: "violet",
    wipRule: "ロケーション仕分け",
    estimatedTime: "60分",
    requiredSkills: ["仕分け"],
    zoneDescription: "ロケーション格納・移動",
    defaultCapacity: 8,
    baseUph: 130,
  },
  {
    id: "p4",
    name: "流通加工",
    icon: Scissors,
    color: "amber",
    wipRule: "加工指示書照合",
    estimatedTime: "90分",
    requiredSkills: ["流通加工", "ラベリング"],
    zoneDescription: "ラベリング・セット組・加工作業",
    defaultCapacity: 5,
    baseUph: 68,
  },
  {
    id: "p5",
    name: "梱包",
    icon: Box,
    color: "blue",
    wipRule: "出荷検品",
    estimatedTime: "40分",
    requiredSkills: ["梱包"],
    zoneDescription: "最終検品・梱包",
    defaultCapacity: 6,
    baseUph: 92,
  },
  {
    id: "p6",
    name: "出荷",
    icon: Truck,
    color: "rose",
    wipRule: "積込確認",
    estimatedTime: "20分",
    requiredSkills: ["リフト操作", "出荷管理"],
    zoneDescription: "積込・トラック出発管理",
    defaultCapacity: 4,
    baseUph: 160,
  },
];

/** パレット用: 追加可能な工程テンプレート */
export const availableProcessTemplates = [
  { name: "入荷", icon: Warehouse },
  { name: "検品", icon: ClipboardCheck },
  { name: "仕分け", icon: Search },
  { name: "流通加工", icon: Scissors },
  { name: "梱包", icon: Box },
  { name: "出荷", icon: Truck },
  { name: "返品処理", icon: Package },
];

/** 色クラスマップ */
export const processColorClasses: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/30",    text: "text-cyan-400" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/30",  text: "text-violet-400" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/30",   text: "text-amber-400" },
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/30",    text: "text-blue-400" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/30",    text: "text-rose-400" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/30",  text: "text-orange-400" },
  pink:    { bg: "bg-pink-500/10",    border: "border-pink-500/30",    text: "text-pink-400" },
  teal:    { bg: "bg-teal-500/10",    border: "border-teal-500/30",    text: "text-teal-400" },
  indigo:  { bg: "bg-indigo-500/10",  border: "border-indigo-500/30",  text: "text-indigo-400" },
};

// --- エリア定義（マスター） ---

export const defaultAreas: Area[] = [
  {
    id: "area-1",
    name: "Aエリア（入荷〜検品）",
    description: "入荷ドック・検品ライン",
    color: "cyan",
    processStepIds: ["p1", "p2"],
  },
  {
    id: "area-2",
    name: "Bエリア（仕分け・保管）",
    description: "仕分け・ロケーション格納",
    color: "violet",
    processStepIds: ["p3"],
  },
  {
    id: "area-3",
    name: "Cエリア（加工・梱包）",
    description: "流通加工・梱包ライン",
    color: "amber",
    processStepIds: ["p4", "p5"],
  },
  {
    id: "area-4",
    name: "Dエリア（出荷）",
    description: "積込・出荷バース",
    color: "rose",
    processStepIds: ["p6"],
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
  p3: { planned: 2400, actual: 820,  currentUph: 130, startTime: "06:00", targetEndTime: "18:00" },
  p4: { planned: 900,  actual: 310,  currentUph: 68,  startTime: "07:00", targetEndTime: "16:00" },
  p5: { planned: 1600, actual: 380,  currentUph: 92,  startTime: "08:00", targetEndTime: "18:00" },
  p6: { planned: 1400, actual: 780,  currentUph: 160, startTime: "09:00", targetEndTime: "19:00" },
};

// --- 配置マップ用: 初期スタッフ配置 ---

export const defaultSlotAssignments: Record<string, (string | null)[]> = {
  p1: ["w1", null, null, null, null],
  p2: ["w2", "w3", null, null, null, null],
  p3: [null, null, null, null, null, null, null, null],
  p4: ["w4", null, null, null, null],
  p5: ["w5", null, null, null, null, null],
  p6: ["w6", null, null, null],
};
