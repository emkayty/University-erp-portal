import { evaluateAdministrativeClearance } from './clearance-evaluator';

describe('evaluateAdministrativeClearance', () => {
  it('fails closed when no required items are configured', () => {
    expect(evaluateAdministrativeClearance([], [])).toMatchObject({
      administrativelyCleared: false,
      requiredItemCount: 0,
      completedItemCount: 0,
      pendingItemCount: 0,
      blockedItemCount: 0,
      missingItemIds: [],
    });
  });

  it('treats a missing required row as pending', () => {
    expect(evaluateAdministrativeClearance(['fees', 'library'], [
      { clearanceItemId: 'fees', status: 'CLEARED' },
    ])).toMatchObject({
      administrativelyCleared: false,
      requiredItemCount: 2,
      completedItemCount: 1,
      pendingItemCount: 1,
      missingItemIds: ['library'],
    });
  });

  it('treats a restricted, auditable WAIVED status as complete', () => {
    expect(evaluateAdministrativeClearance(['fees', 'library'], [
      { clearanceItemId: 'fees', status: 'CLEARED' },
      { clearanceItemId: 'library', status: 'WAIVED' },
    ]).administrativelyCleared).toBe(true);
  });

  it('does not treat BLOCKED as complete', () => {
    expect(evaluateAdministrativeClearance(['fees'], [
      { clearanceItemId: 'fees', status: 'BLOCKED' },
    ])).toMatchObject({
      administrativelyCleared: false,
      blockedItemCount: 1,
      pendingItemCount: 0,
    });
  });

  it('deduplicates required item identifiers before evaluation', () => {
    expect(evaluateAdministrativeClearance(['fees', 'fees'], [
      { clearanceItemId: 'fees', status: 'CLEARED' },
    ])).toMatchObject({
      administrativelyCleared: true,
      requiredItemCount: 1,
    });
  });
});
