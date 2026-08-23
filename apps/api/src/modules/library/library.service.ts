import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, LoanStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type { BorrowItemDto, CreateLibraryItemDto, SearchLibraryDto } from './dto/library.dto';

const MAX_ACTIVE_LOANS   = 3;   // configurable via InstitutionSettings in P9
const FINE_PER_DAY       = 50;  // ₦50 per day overdue (configurable)
const MAX_RENEWAL_COUNT  = 2;

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit:  AuditService,
  ) {}

  // ── Items ──────────────────────────────────────────────────────────────────
  async createItem(dto: CreateLibraryItemDto, actorId: string) {
    const existing = await this.prisma.libraryItem.findUnique({
      where: { accessionNo: dto.accessionNo },
    });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'Accession number already exists' });

    const item = await this.prisma.libraryItem.create({
      data: {
        accessionNo:     dto.accessionNo,
        title:           dto.title,
        author:          dto.author ?? null,
        isbn:            dto.isbn ?? null,
        publisher:       dto.publisher ?? null,
        publishYear:     dto.publishYear ?? null,
        category:        dto.category,
        totalCopies:     dto.totalCopies,
        availableCopies: dto.totalCopies,
        shelfLocation:   dto.shelfLocation ?? null,
        isActive:        true,
      },
    });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'library_items', targetId: item.id,
      newValues: { accessionNo: item.accessionNo, title: item.title },
    }, actorId);
    return item;
  }

  async search(dto: SearchLibraryDto) {
    const { q, category, page = 1, pageSize = 20 } = dto;
    const where: Record<string, unknown> = { isActive: true };

    if (category) where['category'] = category;

    // Full-text search uses PostgreSQL ts_query via Prisma raw (GIN index on title||author)
    // For simple cases, Prisma string contains suffices; raw FTS used for production scale
    if (q) {
      where['OR'] = [
        { title:  { contains: q, mode: 'insensitive' } },
        { author: { contains: q, mode: 'insensitive' } },
        { isbn:   { equals: q } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.libraryItem.findMany({
        where: where as Prisma.LibraryItemWhereInput,
        orderBy: { title: 'asc' },
        skip:  (page - 1) * pageSize,
        take:  pageSize,
      }),
      this.prisma.libraryItem.count({
        where: where as Prisma.LibraryItemWhereInput,
      }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: string) {
    return this.prisma.libraryItem.findUniqueOrThrow({ where: { id } });
  }

  // ── Borrowing ──────────────────────────────────────────────────────────────
  async borrowItem(dto: BorrowItemDto, userId: string) {
    const item = await this.prisma.libraryItem.findUniqueOrThrow({ where: { id: dto.libraryItemId } });

    if (item.availableCopies <= 0) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `No copies of "${item.title}" are currently available`,
      });
    }

    // Check borrowing limit
    const activeLoans = await this.prisma.libraryLoan.count({
      where: { userId, status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } },
    });
    if (activeLoans >= MAX_ACTIVE_LOANS) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Maximum of ${MAX_ACTIVE_LOANS} books can be borrowed at a time`,
      });
    }

    // Prevent duplicate active loan for same item
    const existing = await this.prisma.libraryLoan.findFirst({
      where: { userId, libraryItemId: dto.libraryItemId, status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } },
    });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'You already have an active loan for this item' });

    const dueDate = new Date(dto.dueDate);
    if (dueDate <= new Date()) throw new BadRequestException('Due date must be in the future');

    const loan = await this.prisma.$transaction(async (tx) => {
      // Recheck all borrower invariants inside the transaction. The preflight
      // reads above keep common failures fast; these checks close the race
      // between concurrent requests for the same user or item.
      const [recheckedActiveLoans, recheckedDuplicate] = await Promise.all([
        tx.libraryLoan.count({ where: { userId, status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } } }),
        tx.libraryLoan.findFirst({ where: { userId, libraryItemId: dto.libraryItemId, status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] } } }),
      ]);
      if (recheckedActiveLoans >= MAX_ACTIVE_LOANS) {
        throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: `Maximum of ${MAX_ACTIVE_LOANS} books can be borrowed at a time` });
      }
      if (recheckedDuplicate) {
        throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'You already have an active loan for this item' });
      }

      const reserved = await tx.libraryItem.updateMany({
        where: { id: dto.libraryItemId, availableCopies: { gt: 0 } },
        data: { availableCopies: { decrement: 1 } },
      });
      if (reserved.count !== 1) {
        throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: `No copies of "${item.title}" are currently available` });
      }

      return tx.libraryLoan.create({
        data: {
          libraryItemId: dto.libraryItemId,
          userId,
          dueDate,
          status: LoanStatus.ACTIVE,
        },
      });
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'library_loans', targetId: loan.id,
      newValues: { itemId: dto.libraryItemId, dueDate: dueDate.toISOString() },
    }, userId);

    return loan;
  }

  async returnItem(loanId: string, userId: string, actorRole = 'STUDENT') {
    const loan = await this.prisma.libraryLoan.findUniqueOrThrow({ where: { id: loanId } });

    if (!['STAFF', 'HOD', 'REGISTRAR', 'SUPER_ADMIN'].includes(actorRole) && loan.userId !== userId) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'You may only return your own library loans' });
    }
    if (loan.status === LoanStatus.RETURNED) {
      throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'This loan has already been returned' });
    }

    const returnDate = new Date();
    const overdueDays = Math.max(
      0,
      Math.floor((returnDate.getTime() - loan.dueDate.getTime()) / 86400_000),
    );
    const fine = overdueDays * FINE_PER_DAY;

    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.libraryLoan.updateMany({
        where: {
          id: loanId,
          status: { in: [LoanStatus.ACTIVE, LoanStatus.OVERDUE] },
          ...(!['STAFF', 'HOD', 'REGISTRAR', 'SUPER_ADMIN'].includes(actorRole) ? { userId } : {}),
        },
        data: { status: LoanStatus.RETURNED, returnedAt: returnDate, fineAmount: fine },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'This loan was already returned or is no longer yours' });
      }
      await tx.libraryItem.update({
        where: { id: loan.libraryItemId },
        data: { availableCopies: { increment: 1 } },
      });
    });

    return { message: 'Book returned successfully', overdueDays, fineAmount: fine };
  }

  async renewLoan(loanId: string, userId: string) {
    const loan = await this.prisma.libraryLoan.findUniqueOrThrow({ where: { id: loanId } });

    if (loan.userId !== userId) throw new BadRequestException('Loan does not belong to you');
    if (loan.status !== LoanStatus.ACTIVE) throw new BadRequestException(`Cannot renew a ${loan.status} loan`);
    if (loan.renewalCount >= MAX_RENEWAL_COUNT) throw new BadRequestException(`Maximum ${MAX_RENEWAL_COUNT} renewals allowed`);

    const newDueDate = new Date(loan.dueDate);
    newDueDate.setDate(newDueDate.getDate() + 14); // 2-week extension

    return this.prisma.libraryLoan.update({
      where: { id: loanId },
      data:  { dueDate: newDueDate, renewalCount: { increment: 1 } },
    });
  }

  async getUserLoans(userId: string) {
    return this.prisma.libraryLoan.findMany({
      where:   { userId },
      include: { libraryItem: { select: { title: true, author: true, accessionNo: true } } },
      orderBy: { borrowedAt: 'desc' },
    });
  }

  async getOverdueLoans() {
    const now = new Date();
    const loans = await this.prisma.libraryLoan.findMany({
      where: { status: LoanStatus.ACTIVE, dueDate: { lt: now } },
      include: {
        libraryItem: { select: { title: true } },
        user:        { select: { email: true } },
      },
    });
    // Bulk-update status to OVERDUE
    if (loans.length > 0) {
      await this.prisma.libraryLoan.updateMany({
        where: { id: { in: loans.map((l) => l.id) } },
        data:  { status: LoanStatus.OVERDUE },
      });
    }
    return loans;
  }
}
