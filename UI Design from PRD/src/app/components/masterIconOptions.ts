import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Bot,
  Boxes,
  ClipboardCheck,
  Forklift,
  HardHat,
  PackageCheck,
  PackageSearch,
  QrCode,
  ScanBarcode,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";

export type MasterIconKey =
  | "badge-check"
  | "shield-check"
  | "hard-hat"
  | "forklift"
  | "clipboard-check"
  | "package-search"
  | "package-check"
  | "scan-barcode"
  | "qr-code"
  | "boxes"
  | "truck"
  | "wrench"
  | "bot";

export type CapabilityTone = "qualification" | "skill";

export interface MasterIconOption {
  key: MasterIconKey;
  label: string;
  icon: LucideIcon;
}

export const DEFAULT_QUALIFICATION_ICON_KEY: MasterIconKey = "badge-check";
export const DEFAULT_SKILL_ICON_KEY: MasterIconKey = "package-search";

export const masterIconOptions: MasterIconOption[] = [
  { key: "badge-check", label: "認定", icon: BadgeCheck },
  { key: "shield-check", label: "安全", icon: ShieldCheck },
  { key: "hard-hat", label: "現場管理", icon: HardHat },
  { key: "forklift", label: "フォークリフト", icon: Forklift },
  { key: "clipboard-check", label: "管理", icon: ClipboardCheck },
  { key: "package-search", label: "ピッキング", icon: PackageSearch },
  { key: "package-check", label: "検品・梱包", icon: PackageCheck },
  { key: "scan-barcode", label: "ハンディ", icon: ScanBarcode },
  { key: "qr-code", label: "RFID", icon: QrCode },
  { key: "boxes", label: "仕分け・保管", icon: Boxes },
  { key: "truck", label: "出荷", icon: Truck },
  { key: "wrench", label: "設備・機械", icon: Wrench },
  { key: "bot", label: "自動化", icon: Bot },
];

const iconMap = new Map(masterIconOptions.map((option) => [option.key, option]));
const legacyIconKeyMap: Partial<Record<string, MasterIconKey>> = {
  package: "package-search",
  "file-check-2": "clipboard-check",
  factory: "boxes",
  "radio-tower": "qr-code",
  cog: "wrench",
};

export function normalizeMasterIconKey(
  value: unknown,
  fallback: MasterIconKey,
): MasterIconKey {
  if (typeof value !== "string") return fallback;

  if (iconMap.has(value as MasterIconKey)) {
    return value as MasterIconKey;
  }

  const legacyKey = legacyIconKeyMap[value];
  return legacyKey && iconMap.has(legacyKey) ? legacyKey : fallback;
}

export function getMasterIconOption(
  key: unknown,
  fallback: MasterIconKey = DEFAULT_SKILL_ICON_KEY,
): MasterIconOption {
  return iconMap.get(normalizeMasterIconKey(key, fallback)) ?? iconMap.get(fallback)!;
}

export function getCapabilityToneClasses(tone: CapabilityTone) {
  if (tone === "qualification") {
    return {
      accentClass: "text-emerald-500",
      surfaceClass: "border-emerald-500/20 bg-emerald-500/10",
      activeClass: "border-emerald-500/45 bg-emerald-500/12",
    };
  }

  return {
    accentClass: "text-blue-500",
    surfaceClass: "border-blue-500/20 bg-blue-500/10",
    activeClass: "border-blue-500/45 bg-blue-500/12",
  };
}
