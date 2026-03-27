import type { MasterIconKey } from "./masterIconOptions";

export type MasterStatus = "active" | "inactive";
export type SiteShipperRelationStatus = "active" | "expired" | "suspended";
export type ShipperPriceUnit = "hourly" | "piece";

export interface Shipper {
  id: string;
  name: string;
  status: MasterStatus;
  code?: string;
  contactPerson?: string;
  notes?: string;
}

export interface SiteLayoutArea {
  id: string;
  name: string;
  description: string;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  shipperId?: string;
  layoutAreas?: SiteLayoutArea[];
}

export interface SiteShipperPriceConfigItem {
  processId: string;
  processName: string;
  unitPrice: number;
  unit: ShipperPriceUnit;
}

export interface SiteShipperRelation {
  id: string;
  siteId: string;
  shipperId: string;
  contractStartDate: string;
  contractEndDate: string;
  contactPerson: string;
  contactTel: string;
  contactEmail: string;
  dedicatedProcessIds: string[];
  priceConfig: SiteShipperPriceConfigItem[];
  notes: string;
  status: SiteShipperRelationStatus;
  createdAt: string;
  updatedAt: string;
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
  previousStepId?: string;
  layoutAreaIds?: string[];
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
  siteShipperRelations: SiteShipperRelation[];
  qualifications: QualificationMaster[];
  skills: SkillMaster[];
  dispatchCompanies: DispatchCompany[];
  processes: ProcessMaster[];
  workflows: WorkflowDefinition[];
}

export const defaultMasterData: MasterDataSnapshot = {
  shippers: [
    { id: "shipper-1", name: "東日本流通株式会社", status: "active", code: "EJ-001", contactPerson: "佐藤 大地", notes: "入荷から出荷まで一貫運用" },
    { id: "shipper-2", name: "サンライズロジスティクス", status: "active", code: "SR-002", contactPerson: "高橋 美咲", notes: "納品前検品が必須" },
    { id: "shipper-3", name: "グローバルリンク商事", status: "active", code: "GL-003", contactPerson: "田村 恒一", notes: "EC向け波動あり" },
    { id: "shipper-4", name: "日本トレーディングサービス", status: "active", code: "NT-004", contactPerson: "井上 結衣", notes: "返品頻度が高い" },
    { id: "shipper-5", name: "フューチャーコマース株式会社", status: "active", code: "FC-005", contactPerson: "山本 彩乃", notes: "新商品比率が高い" },
    { id: "shipper-6", name: "オリエント物流販売", status: "active", code: "OR-006", contactPerson: "村上 蓮", notes: "出荷ピークは午後帯" },
    { id: "shipper-7", name: "スマートサプライ株式会社", status: "active", code: "SS-007", contactPerson: "木村 遥", notes: "冷蔵帯案件あり" },
    { id: "shipper-8", name: "北関東ディストリビューション", status: "active", code: "KK-008", contactPerson: "和田 拓海", notes: "通い箱運用" },
    { id: "shipper-9", name: "アーバンコマース", status: "active", code: "UC-009", contactPerson: "小林 海斗", notes: "夜間出荷が中心" },
    { id: "shipper-10", name: "ネクストバリュー株式会社", status: "active", code: "NV-010", contactPerson: "石井 未来", notes: "販促同梱あり" },
  ],
  sites: [
    { id: "site-1", shipperId: "shipper-1", name: "東京第1物流センター", address: "東京都江東区青海 2-4-32" },
    { id: "site-2", shipperId: "shipper-2", name: "川崎ディストリビューションセンター", address: "神奈川県川崎市川崎区東扇島 12-8" },
    { id: "site-3", shipperId: "shipper-3", name: "関東南物流センター", address: "神奈川県相模原市中央区田名塩田 1-7-1" },
    { id: "site-4", shipperId: "shipper-4", name: "千葉湾岸ロジスティクスセンター", address: "千葉県船橋市浜町 2-6-25" },
    { id: "site-5", shipperId: "shipper-5", name: "埼玉北物流センター", address: "埼玉県加須市新利根 1-1-4" },
    { id: "site-6", shipperId: "shipper-6", name: "東日本フルフィルメントセンター", address: "埼玉県久喜市清久町 45-3" },
    { id: "site-7", shipperId: "shipper-7", name: "横浜EC物流センター", address: "神奈川県横浜市鶴見区大黒ふ頭 22-1" },
    { id: "site-8", shipperId: "shipper-8", name: "首都圏クロスドックセンター", address: "埼玉県三郷市インター南 3-5-9" },
    { id: "site-9", shipperId: "shipper-9", name: "東関東ハブセンター", address: "千葉県市川市高谷新町 7-1" },
    { id: "site-10", shipperId: "shipper-10", name: "関東中央物流センター", address: "茨城県つくばみらい市筒戸 1500-2" },
  ],
  siteShipperRelations: [
    {
      id: "relation-1",
      siteId: "site-1",
      shipperId: "shipper-1",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "佐藤 大地",
      contactTel: "03-6205-1101",
      contactEmail: "sato@ej-logi.example.com",
      dedicatedProcessIds: ["proc-1", "proc-2", "proc-9"],
      priceConfig: [{ processId: "proc-1", processName: "入荷", unitPrice: 850, unit: "hourly" }],
      notes: "入荷から出荷まで一貫運用",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-20T09:00:00.000Z",
    },
    {
      id: "relation-2",
      siteId: "site-1",
      shipperId: "shipper-3",
      contractStartDate: "2026-02-01",
      contractEndDate: "2026-09-30",
      contactPerson: "田村 恒一",
      contactTel: "03-6205-1102",
      contactEmail: "tamura@global-link.example.com",
      dedicatedProcessIds: ["proc-5", "proc-7"],
      priceConfig: [{ processId: "proc-5", processName: "ピッキング", unitPrice: 92, unit: "piece" }],
      notes: "EC波動対応の増枠案件",
      status: "active",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-03-18T08:30:00.000Z",
    },
    {
      id: "relation-3",
      siteId: "site-2",
      shipperId: "shipper-2",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "高橋 美咲",
      contactTel: "044-280-2201",
      contactEmail: "takahashi@sunrise.example.com",
      dedicatedProcessIds: ["proc-1", "proc-8", "proc-9"],
      priceConfig: [{ processId: "proc-8", processName: "出荷検品", unitPrice: 860, unit: "hourly" }],
      notes: "午後便締切が早い",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-20T09:15:00.000Z",
    },
    {
      id: "relation-4",
      siteId: "site-3",
      shipperId: "shipper-3",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "田村 恒一",
      contactTel: "042-700-3301",
      contactEmail: "tamura@global-link.example.com",
      dedicatedProcessIds: ["proc-3", "proc-5"],
      priceConfig: [],
      notes: "補充頻度高め",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z",
    },
    {
      id: "relation-5",
      siteId: "site-4",
      shipperId: "shipper-4",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "井上 結衣",
      contactTel: "047-420-4401",
      contactEmail: "inoue@n-trading.example.com",
      dedicatedProcessIds: ["proc-2", "proc-6"],
      priceConfig: [],
      notes: "返品検品を含む",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-12T11:00:00.000Z",
    },
    {
      id: "relation-6",
      siteId: "site-5",
      shipperId: "shipper-5",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "山本 彩乃",
      contactTel: "0480-72-5501",
      contactEmail: "yamamoto@future-commerce.example.com",
      dedicatedProcessIds: ["proc-5", "proc-7", "proc-8"],
      priceConfig: [],
      notes: "販促物の同梱あり",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-05T09:40:00.000Z",
    },
    {
      id: "relation-7",
      siteId: "site-6",
      shipperId: "shipper-6",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "村上 蓮",
      contactTel: "0480-23-6601",
      contactEmail: "murakami@orient.example.com",
      dedicatedProcessIds: ["proc-1", "proc-3", "proc-9"],
      priceConfig: [],
      notes: "大型案件",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-08T14:20:00.000Z",
    },
    {
      id: "relation-8",
      siteId: "site-7",
      shipperId: "shipper-7",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "木村 遥",
      contactTel: "045-510-7701",
      contactEmail: "kimura@smart-supply.example.com",
      dedicatedProcessIds: ["proc-2", "proc-5", "proc-7"],
      priceConfig: [],
      notes: "温度帯別の梱包ルールあり",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-14T13:10:00.000Z",
    },
    {
      id: "relation-9",
      siteId: "site-8",
      shipperId: "shipper-8",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "和田 拓海",
      contactTel: "048-950-8801",
      contactEmail: "wada@kkd.example.com",
      dedicatedProcessIds: ["proc-1", "proc-6", "proc-9"],
      priceConfig: [],
      notes: "クロスドック案件",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-07T08:45:00.000Z",
    },
    {
      id: "relation-10",
      siteId: "site-9",
      shipperId: "shipper-9",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "小林 海斗",
      contactTel: "047-328-9901",
      contactEmail: "kobayashi@urban.example.com",
      dedicatedProcessIds: ["proc-5", "proc-8", "proc-9"],
      priceConfig: [],
      notes: "夜間出荷中心",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-11T16:20:00.000Z",
    },
    {
      id: "relation-11",
      siteId: "site-10",
      shipperId: "shipper-10",
      contractStartDate: "2026-01-01",
      contractEndDate: "2026-12-31",
      contactPerson: "石井 未来",
      contactTel: "0297-52-1001",
      contactEmail: "ishii@next-value.example.com",
      dedicatedProcessIds: ["proc-3", "proc-5", "proc-7"],
      priceConfig: [],
      notes: "販促波動案件",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-09T15:00:00.000Z",
    },
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
    {
      id: "wf-2",
      name: "グローバルリンク商事_EC波動対応",
      shipperId: "shipper-3",
      siteId: "site-1",
      updatedAt: new Date("2026-03-18T08:30:00.000Z").toISOString(),
      steps: [
        {
          id: "wf-2-step-1",
          processId: "proc-5",
          requiredQualificationIds: ["qual-2"],
          requiredSkillIds: ["skill-1"],
          standardHeadcount: 6,
          uph: 140,
        },
        {
          id: "wf-2-step-2",
          processId: "proc-7",
          requiredQualificationIds: ["qual-4"],
          requiredSkillIds: ["skill-6"],
          standardHeadcount: 5,
          uph: 125,
        },
      ],
    },
  ],
};
