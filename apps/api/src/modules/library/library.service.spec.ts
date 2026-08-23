import { BadRequestException, ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LoanStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { LibraryService } from './library.service';

class FakeDecimal { constructor(public v: number) {} toNumber() { return this.v; } }

const makeItem = (o: Partial<Record<string,unknown>> = {}) => ({
  id: 'item-1', accessionNo: 'LIB001', title: 'Introduction to Algorithms',
  author: 'Cormen et al.', isbn: '9780262033848', totalCopies: 3, availableCopies: 2,
  category: 'TEXTBOOK', isActive: true, ...o,
});

const makeLoan = (o: Partial<Record<string,unknown>> = {}) => ({
  id: 'loan-1', libraryItemId: 'item-1', userId: 'user-1',
  dueDate: new Date(Date.now() + 14 * 86400_000), // 14 days from now
  borrowedAt: new Date(), returnedAt: null, renewalCount: 0,
  fineAmount: new FakeDecimal(0), finePaid: false, status: LoanStatus.ACTIVE,
  deletedAt: null, ...o,
});

describe('LibraryService', () => {
  let svc: LibraryService;
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    prisma = {
      libraryItem: {
        findUnique:        jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeItem()),
        create:            jest.fn().mockResolvedValue(makeItem()),
        findMany:          jest.fn().mockResolvedValue([]),
        count:             jest.fn().mockResolvedValue(0),
        update:            jest.fn().mockResolvedValue(makeItem()),
        updateMany:        jest.fn().mockResolvedValue({ count: 1 }),
      },
      libraryLoan: {
        findFirst:         jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeLoan()),
        create:            jest.fn().mockResolvedValue(makeLoan()),
        update:            jest.fn().mockResolvedValue(makeLoan()),
        updateMany:        jest.fn().mockResolvedValue({ count: 1 }),
        count:             jest.fn().mockResolvedValue(0),
        findMany:          jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: Function) => fn(prisma)),
    } as never;
    audit = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService,  useValue: audit },
      ],
    }).compile();
    svc = module.get<LibraryService>(LibraryService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createItem()', () => {
    it('creates a library item with correct available copies = total copies', async () => {
      await svc.createItem({ accessionNo: 'LIB001', title: 'Algo', category: 'TEXTBOOK' as never, totalCopies: 3 }, 'staff-1');
      expect(prisma.libraryItem.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ totalCopies: 3, availableCopies: 3 }),
      }));
    });

    it('rejects duplicate accession number', async () => {
      prisma.libraryItem.findUnique.mockResolvedValueOnce(makeItem());
      await expect(svc.createItem({ accessionNo: 'LIB001', title: 'Algo', category: 'TEXTBOOK' as never, totalCopies: 1 }, 'staff-1'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('borrowItem()', () => {
    const dto = { libraryItemId: 'item-1', dueDate: new Date(Date.now() + 86400_000 * 7).toISOString() };

    it('creates loan and decrements availableCopies atomically', async () => {
      await svc.borrowItem(dto, 'user-1');
      expect(prisma.libraryLoan.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ libraryItemId: 'item-1', userId: 'user-1', status: 'ACTIVE' }),
      }));
      expect(prisma.libraryItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'item-1', availableCopies: { gt: 0 } }),
        data: { availableCopies: { decrement: 1 } },
      }));
    });

    it('rejects when no copies available', async () => {
      prisma.libraryItem.findUniqueOrThrow.mockResolvedValueOnce(makeItem({ availableCopies: 0 }));
      await expect(svc.borrowItem(dto, 'user-1')).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.libraryLoan.create).not.toHaveBeenCalled();
    });

    it('rejects when borrowing limit (3) reached', async () => {
      prisma.libraryLoan.count.mockResolvedValueOnce(3);
      await expect(svc.borrowItem(dto, 'user-1')).rejects.toThrow('Maximum of 3');
    });

    it('rejects duplicate active loan for same item', async () => {
      prisma.libraryLoan.findFirst.mockResolvedValueOnce(makeLoan());
      await expect(svc.borrowItem(dto, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('rejects due date in the past', async () => {
      await expect(svc.borrowItem({ libraryItemId: 'item-1', dueDate: '2020-01-01' }, 'user-1'))
        .rejects.toThrow('future');
    });
  });

  describe('returnItem()', () => {
    it('marks loan RETURNED and increments availableCopies atomically', async () => {
      const result = await svc.returnItem('loan-1', 'user-1');
      expect(result.overdueDays).toBe(0);
      expect(result.fineAmount).toBe(0);
      expect(prisma.libraryLoan.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'loan-1', status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } }),
        data: expect.objectContaining({ status: LoanStatus.RETURNED }),
      }));
      expect(prisma.libraryItem.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { availableCopies: { increment: 1 } },
      }));
    });

    it('calculates fine for overdue returns (₦50/day)', async () => {
      const overdueLoan = makeLoan({ dueDate: new Date(Date.now() - 3 * 86400_000) }); // 3 days overdue
      prisma.libraryLoan.findUniqueOrThrow.mockResolvedValueOnce(overdueLoan);
      const result = await svc.returnItem('loan-1', 'user-1');
      expect(result.overdueDays).toBe(3);
      expect(result.fineAmount).toBe(150); // 3 × ₦50
    });

    it('rejects returning an already-returned loan', async () => {
      prisma.libraryLoan.findUniqueOrThrow.mockResolvedValueOnce(makeLoan({ status: LoanStatus.RETURNED }));
      await expect(svc.returnItem('loan-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('rejects a student attempting to return another user\'s loan', async () => {
      prisma.libraryLoan.findUniqueOrThrow.mockResolvedValueOnce(makeLoan({ userId: 'other-user' }));
      await expect(svc.returnItem('loan-1', 'user-1', 'STUDENT')).rejects.toThrow(ForbiddenException);
      expect(prisma.libraryLoan.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('renewLoan()', () => {
    it('extends due date by 14 days and increments renewal count', async () => {
      await svc.renewLoan('loan-1', 'user-1');
      expect(prisma.libraryLoan.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ renewalCount: { increment: 1 } }),
      }));
    });

    it('rejects renewal when max (2) renewals reached', async () => {
      prisma.libraryLoan.findUniqueOrThrow.mockResolvedValueOnce(makeLoan({ renewalCount: 2 }));
      await expect(svc.renewLoan('loan-1', 'user-1')).rejects.toThrow('Maximum 2');
    });

    it('rejects renewal of non-ACTIVE loan', async () => {
      prisma.libraryLoan.findUniqueOrThrow.mockResolvedValueOnce(makeLoan({ status: LoanStatus.OVERDUE }));
      await expect(svc.renewLoan('loan-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });
});
