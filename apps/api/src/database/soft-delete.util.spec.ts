import {
  SOFT_DELETE_MODELS,
  toClientPropertyName,
  softDeleteRedirectOperation,
  applySoftDeleteReadFilter,
} from './soft-delete.util';

describe('soft-delete.util (pure logic behind the P0-1 Prisma extension fix)', () => {
  describe('toClientPropertyName', () => {
    it('lowercases the first character only', () => {
      expect(toClientPropertyName('Student')).toBe('student');
      expect(toClientPropertyName('LeaveRequest')).toBe('leaveRequest');
      expect(toClientPropertyName('RoomAllocation')).toBe('roomAllocation');
    });
  });

  describe('softDeleteRedirectOperation', () => {
    it.each([...SOFT_DELETE_MODELS])('redirects delete -> update for %s', (model) => {
      expect(softDeleteRedirectOperation(model, 'delete')).toBe('update');
    });
    it.each([...SOFT_DELETE_MODELS])('redirects deleteMany -> updateMany for %s', (model) => {
      expect(softDeleteRedirectOperation(model, 'deleteMany')).toBe('updateMany');
    });
    it('does not redirect delete for a non-soft-delete model (e.g. Course)', () => {
      expect(softDeleteRedirectOperation('Course', 'delete')).toBeNull();
      expect(softDeleteRedirectOperation('Course', 'deleteMany')).toBeNull();
    });
    it('does not redirect read operations, even for soft-delete models', () => {
      expect(softDeleteRedirectOperation('Student', 'findMany')).toBeNull();
    });
    it('handles an undefined model (raw queries) without throwing', () => {
      expect(softDeleteRedirectOperation(undefined, 'delete')).toBeNull();
    });
  });

  describe('applySoftDeleteReadFilter', () => {
    it('injects deletedAt: null for a soft-delete model with no existing where', () => {
      const result = applySoftDeleteReadFilter('Student', 'findMany', undefined);
      expect(result).toEqual({ where: { deletedAt: null } });
    });

    it('merges deletedAt: null into an existing where clause without clobbering other filters', () => {
      const args = { where: { departmentId: 'dept-1' }, take: 10 };
      const result = applySoftDeleteReadFilter('Student', 'findMany', args);
      expect(result).toEqual({ where: { departmentId: 'dept-1', deletedAt: null }, take: 10 });
    });

    it('leaves the caller\'s explicit deletedAt filter alone (admin recovery use case)', () => {
      const args = { where: { deletedAt: { not: null } } };
      const result = applySoftDeleteReadFilter('Student', 'findMany', args);
      expect(result).toBe(args); // same reference — untouched
    });

    it('returns the same reference (no-op) for a non-soft-delete model', () => {
      const args = { where: { code: 'CSC101' } };
      const result = applySoftDeleteReadFilter('Course', 'findMany', args);
      expect(result).toBe(args);
    });

    it('returns the same reference (no-op) for a write operation on a soft-delete model', () => {
      const args = { data: { firstName: 'Ada' } };
      const result = applySoftDeleteReadFilter('Student', 'update', args);
      expect(result).toBe(args);
    });

    it('applies to every read op in the covered set (B5: all 8, not just findMany)', () => {
      for (const op of ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']) {
        const result = applySoftDeleteReadFilter('Student', op, {});
        expect(result).toEqual({ where: { deletedAt: null } });
      }
    });

    it('handles an undefined model (raw queries) without throwing', () => {
      const args = { where: { x: 1 } };
      expect(applySoftDeleteReadFilter(undefined, 'findMany', args)).toBe(args);
    });
  });
});
