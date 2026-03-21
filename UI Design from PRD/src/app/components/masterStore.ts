export type MasterStatus = "active" | "inactive";

import type { MasterIconKey } from "./masterIconOptions";

export interface Shipper {
  id: string;
  name: string;
  status: MasterStatus;
}

export interface Site {
  id: string;
  shipperId: string;
  name: string;
  address: string;
}

// Legacy compatibility only. Area is no longer a managed system concept.
export interface AreaMaster {
  id: string;
  siteId: string;
  name: string;
  description: string;
}

export interface QualificationMaster {
  id: string;
  name: string;
  iconKey?: MasterIconKey;
}

export interface SkillMaster {
  id: string;
  name: string;
  iconKey?: MasterIconKey;
}

export interface DispatchCompany {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  unitPrice: number;
  status: MasterStatus;
}

export interface ProcessMaster {
  id: string;
  name: string;
  description: string;
  defaultQualificationIds: string[];
  defaultSkillIds: string[];
  defaultHeadcount: number;
  defaultUph: number;
}

export interface WorkflowStepSetting {
  id: string;
  processId: string;
  requiredQualificationIds: string[];
  requiredSkillIds: string[];
  standardHeadcount: number;
  uph: number;
  manual?: string;
  caution?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  shipperId: string;
  siteId: string;
  steps: WorkflowStepSetting[];
  updatedAt: string;
}

export interface MasterDataSnapshot {
  shippers: Shipper[];
  sites: Site[];
  qualifications: QualificationMaster[];
  skills: SkillMaster[];
  dispatchCompanies: DispatchCompany[];
  processes: ProcessMaster[];
  workflows: WorkflowDefinition[];
}

export const defaultMasterData: MasterDataSnapshot = {
  shippers: [
    { id: "shipper-1", name: "東日本流通株式会社", status: "active" },
    { id: "shipper-2", name: "サンライズロジスティクス", status: "active" },
    { id: "shipper-3", name: "グローバルリンク商事", status: "active" },
    { id: "shipper-4", name: "日本トレーディングサービス", status: "active" },
    { id: "shipper-5", name: "フューチャーコマース株式会社", status: "active" },
    { id: "shipper-6", name: "オリエント物流販売", status: "active" },
    { id: "shipper-7", name: "スマートサプライ株式会社", status: "active" },
    { id: "shipper-8", name: "北関東ディストリビューション", status: "active" },
    { id: "shipper-9", name: "アーバンコマース", status: "active" },
    { id: "shipper-10", name: "ネクストバリュー株式会社", status: "active" },
  ],
  sites: [
    { id: "site-1", shipperId: "shipper-1", name: "東京第1物流センター", address: "住所未設定" },
    { id: "site-2", shipperId: "shipper-2", name: "川崎ディストリビューションセンター", address: "住所未設定" },
    { id: "site-3", shipperId: "shipper-3", name: "関東南物流センター", address: "住所未設定" },
    { id: "site-4", shipperId: "shipper-4", name: "千葉湾岸ロジスティクスセンター", address: "住所未設定" },
    { id: "site-5", shipperId: "shipper-5", name: "埼玉北物流センター", address: "住所未設定" },
    { id: "site-6", shipperId: "shipper-6", name: "東日本フルフィルメントセンター", address: "住所未設定" },
    { id: "site-7", shipperId: "shipper-7", name: "横浜EC物流センター", address: "住所未設定" },
    { id: "site-8", shipperId: "shipper-8", name: "首都圏クロスドックセンター", address: "住所未設定" },
    { id: "site-9", shipperId: "shipper-9", name: "東関東ハブセンター", address: "住所未設定" },
    { id: "site-10", shipperId: "shipper-10", name: "関東中央物流センター", address: "住所未設定" },
  ],
  qualifications: [
    { id: "qual-1", name: "フォークリフト運転技能講習", iconKey: "forklift" },
    { id: "qual-2", name: "物流技術管理士", iconKey: "clipboard-check" },
    { id: "qual-3", name: "倉庫管理主任者", iconKey: "hard-hat" },
    { id: "qual-4", name: "第一種衛生管理者", iconKey: "shield-check" },
    { id: "qual-5", name: "安全管理者", iconKey: "shield-check" },
    { id: "qual-6", name: "危険物取扱者乙種", iconKey: "hard-hat" },
    { id: "qual-7", name: "物流センター運営士", iconKey: "truck" },
    { id: "qual-8", name: "玉掛け技能講習", iconKey: "wrench" },
    { id: "qual-9", name: "クレーン運転特別教育", iconKey: "wrench" },
    { id: "qual-10", name: "RFID取扱教育", iconKey: "qr-code" },
  ],
  skills: [
    { id: "skill-1", name: "ケースピッキング", iconKey: "package-search" },
    { id: "skill-2", name: "バラピッキング", iconKey: "package-search" },
    { id: "skill-3", name: "フォークリフト操作", iconKey: "forklift" },
    { id: "skill-4", name: "ハンディターミナル操作", iconKey: "scan-barcode" },
    { id: "skill-5", name: "検品作業", iconKey: "package-check" },
    { id: "skill-6", name: "梱包作業", iconKey: "package-check" },
    { id: "skill-7", name: "仕分け作業", iconKey: "boxes" },
    { id: "skill-8", name: "棚卸作業", iconKey: "clipboard-check" },
    { id: "skill-9", name: "RFIDタグ発行", iconKey: "qr-code" },
    { id: "skill-10", name: "AI検品装置操作", iconKey: "bot" },
  ],
  dispatchCompanies: [
    { id: "dispatch-1", name: "サンワスタッフ", contactName: "石田 恒一", phone: "03-6800-1101", unitPrice: 1250, status: "active" },
    { id: "dispatch-2", name: "ロジテック人材", contactName: "藤原 真奈", phone: "044-410-2230", unitPrice: 1180, status: "active" },
    { id: "dispatch-3", name: "フルキャスト物流", contactName: "中西 恒一", phone: "03-5728-3312", unitPrice: 1350, status: "active" },
    { id: "dispatch-4", name: "テンプスタッフ物流", contactName: "岡本 彩", phone: "045-620-0875", unitPrice: 1300, status: "active" },
    { id: "dispatch-5", name: "JPワークサポート", contactName: "吉川 誠", phone: "048-600-1240", unitPrice: 1210, status: "inactive" },
  ],
  processes: [
    {
      id: "proc-1",
      name: "入荷",
      description: "入荷処理",
      defaultQualificationIds: ["qual-1"],
      defaultSkillIds: ["skill-3"],
      defaultHeadcount: 4,
      defaultUph: 120,
    },
    {
      id: "proc-2",
      name: "検品",
      description: "検品処理",
      defaultQualificationIds: ["qual-10"],
      defaultSkillIds: ["skill-5"],
      defaultHeadcount: 5,
      defaultUph: 100,
    },
    {
      id: "proc-3",
      name: "格納",
      description: "格納処理",
      defaultQualificationIds: ["qual-1"],
      defaultSkillIds: ["skill-4"],
      defaultHeadcount: 4,
      defaultUph: 110,
    },
    {
      id: "proc-4",
      name: "補充",
      description: "補充処理",
      defaultQualificationIds: ["qual-3"],
      defaultSkillIds: ["skill-7"],
      defaultHeadcount: 3,
      defaultUph: 95,
    },
    {
      id: "proc-5",
      name: "ピッキング",
      description: "ピッキング処理",
      defaultQualificationIds: ["qual-2"],
      defaultSkillIds: ["skill-1"],
      defaultHeadcount: 6,
      defaultUph: 140,
    },
    {
      id: "proc-6",
      name: "仕分け",
      description: "仕分け処理",
      defaultQualificationIds: ["qual-7"],
      defaultSkillIds: ["skill-7"],
      defaultHeadcount: 5,
      defaultUph: 130,
    },
    {
      id: "proc-7",
      name: "梱包",
      description: "梱包処理",
      defaultQualificationIds: ["qual-4"],
      defaultSkillIds: ["skill-6"],
      defaultHeadcount: 5,
      defaultUph: 125,
    },
    {
      id: "proc-8",
      name: "出荷検品",
      description: "出荷検品処理",
      defaultQualificationIds: ["qual-5"],
      defaultSkillIds: ["skill-5"],
      defaultHeadcount: 4,
      defaultUph: 115,
    },
    {
      id: "proc-9",
      name: "出荷",
      description: "出荷処理",
      defaultQualificationIds: ["qual-8"],
      defaultSkillIds: ["skill-3"],
      defaultHeadcount: 5,
      defaultUph: 135,
    },
    {
      id: "proc-10",
      name: "棚卸",
      description: "棚卸処理",
      defaultQualificationIds: ["qual-9"],
      defaultSkillIds: ["skill-8"],
      defaultHeadcount: 4,
      defaultUph: 90,
    },
  ],
  workflows: [
    {
      id: "wf-1",
      name: "東日本流通株式会社_東京第1物流センター",
      shipperId: "shipper-1",
      siteId: "site-1",
      updatedAt: new Date("2026-03-09T09:00:00.000Z").toISOString(),
      steps: [
        {
          id: "wf-1-step-1",
          processId: "proc-1",
          requiredQualificationIds: ["qual-1"],
          requiredSkillIds: ["skill-3"],
          standardHeadcount: 4,
          uph: 120,
        },
        {
          id: "wf-1-step-2",
          processId: "proc-2",
          requiredQualificationIds: ["qual-10"],
          requiredSkillIds: ["skill-5"],
          standardHeadcount: 5,
          uph: 100,
        },
        {
          id: "wf-1-step-3",
          processId: "proc-9",
          requiredQualificationIds: ["qual-8"],
          requiredSkillIds: ["skill-3"],
          standardHeadcount: 5,
          uph: 135,
        },
      ],
    },
  ],
};
