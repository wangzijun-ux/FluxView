import type {
  Shipper,
  Site,
  SiteShipperRelation,
  SiteShipperRelationStatus,
  WorkflowDefinition,
} from "./masterStore";

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

export function createUuid() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function resolveSiteShipperRelationStatus(
  relation: Pick<SiteShipperRelation, "contractEndDate" | "status">,
  now = new Date(),
): SiteShipperRelationStatus {
  if (relation.status === "suspended") return "suspended";

  if (!relation.contractEndDate) return relation.status;

  const today = formatDateInput(now);
  if (relation.contractEndDate < today) {
    return "expired";
  }

  return relation.status === "expired" ? "active" : relation.status;
}

export function sortSiteShipperRelations(relations: SiteShipperRelation[], now = new Date()) {
  return relations
    .slice()
    .sort((left, right) => {
      const leftStatus = resolveSiteShipperRelationStatus(left, now);
      const rightStatus = resolveSiteShipperRelationStatus(right, now);
      const statusWeight = { active: 0, suspended: 1, expired: 2 } satisfies Record<SiteShipperRelationStatus, number>;

      return (
        statusWeight[leftStatus] - statusWeight[rightStatus] ||
        left.contractEndDate.localeCompare(right.contractEndDate) ||
        left.createdAt.localeCompare(right.createdAt)
      );
    });
}

export function getSiteShipperRelationsForSite(relations: SiteShipperRelation[], siteId: string, now = new Date()) {
  return sortSiteShipperRelations(
    relations.filter((relation) => relation.siteId === siteId),
    now,
  );
}

export function getShippersForSite(
  siteId: string,
  shippers: Shipper[],
  relations: SiteShipperRelation[],
  now = new Date(),
) {
  const shipperMap = new Map(shippers.map((shipper) => [shipper.id, shipper]));
  const orderedRelations = getSiteShipperRelationsForSite(relations, siteId, now);
  const unique = new Set<string>();

  return orderedRelations.flatMap((relation) => {
    if (unique.has(relation.shipperId)) return [];
    const shipper = shipperMap.get(relation.shipperId);
    if (!shipper) return [];
    unique.add(relation.shipperId);
    return [shipper];
  });
}

export function getPrimaryShipperForSite(
  siteId: string,
  shippers: Shipper[],
  relations: SiteShipperRelation[],
  now = new Date(),
) {
  return getShippersForSite(siteId, shippers, relations, now)[0] ?? null;
}

export function migrateSiteShipperRelations(
  sites: Site[],
  workflows: WorkflowDefinition[],
  existing: SiteShipperRelation[] = [],
) {
  const now = new Date();
  const startDate = formatDateInput(now);
  const endDate = formatDateInput(addYears(now, 1));
  const seen = new Set(existing.map((relation) => `${relation.siteId}:${relation.shipperId}`));
  const nextRelations = [...existing];

  const pushRelation = (siteId: string, shipperId?: string) => {
    if (!siteId || !shipperId) return;
    const relationKey = `${siteId}:${shipperId}`;
    if (seen.has(relationKey)) return;

    seen.add(relationKey);
    nextRelations.push({
      id: createUuid(),
      siteId,
      shipperId,
      contractStartDate: startDate,
      contractEndDate: endDate,
      contactPerson: "",
      contactTel: "",
      contactEmail: "",
      dedicatedProcessIds: [],
      priceConfig: [],
      notes: "",
      status: "active",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  };

  sites.forEach((site) => pushRelation(site.id, site.shipperId));
  workflows.forEach((workflow) => pushRelation(workflow.siteId, workflow.shipperId));

  return nextRelations;
}

export function hasSiteShipperRelation(
  siteId: string,
  shipperId: string,
  relations: SiteShipperRelation[],
) {
  return relations.some((relation) => relation.siteId === siteId && relation.shipperId === shipperId);
}
