export const CLEARANCE_COMPLETED_STATUSES = ['CLEARED', 'WAIVED'] as const;

type ClearanceCompletedStatus = (typeof CLEARANCE_COMPLETED_STATUSES)[number];

export interface ClearanceStatusRow {
  clearanceItemId: string;
  status: string;
}

export interface AdministrativeClearanceEvaluation {
  administrativelyCleared: boolean;
  requiredItemCount: number;
  completedItemCount: number;
  pendingItemCount: number;
  blockedItemCount: number;
  missingItemIds: string[];
}

/**
 * One authoritative interpretation of administrative clearance.
 *
 * Missing rows are deliberately treated as pending, not as completed. A
 * waiver is equivalent to a clearance only because the institutional waiver
 * workflow is itself restricted and auditable in ClearanceService.
 */
export function evaluateAdministrativeClearance(
  requiredItemIds: readonly string[],
  clearances: readonly ClearanceStatusRow[],
): AdministrativeClearanceEvaluation {
  const required = [...new Set(requiredItemIds)];
  const statusByItem = new Map(clearances.map((clearance) => [clearance.clearanceItemId, clearance.status]));
  const missingItemIds = required.filter((itemId) => !statusByItem.has(itemId));
  const completedItemCount = required.filter((itemId) =>
    CLEARANCE_COMPLETED_STATUSES.includes(statusByItem.get(itemId) as ClearanceCompletedStatus),
  ).length;
  const blockedItemCount = required.filter((itemId) => statusByItem.get(itemId) === 'BLOCKED').length;
  const pendingItemCount = required.length - completedItemCount - blockedItemCount;

  return {
    administrativelyCleared: required.length > 0 && missingItemIds.length === 0 && completedItemCount === required.length,
    requiredItemCount: required.length,
    completedItemCount,
    pendingItemCount: Math.max(0, pendingItemCount),
    blockedItemCount,
    missingItemIds,
  };
}
