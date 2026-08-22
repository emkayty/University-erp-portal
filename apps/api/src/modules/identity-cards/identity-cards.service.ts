import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityCardHolderType, IdentityCardStatus, Prisma, StudentStatus, EmploymentStatus, AuditAction } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { encryptPii, decryptPii } from '@uniportal/utils';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { BulkIdentityCardPdfDto } from './dto/identity-card-pdf.dto';
import { IdentityCardPdfService, type CardSettings } from './identity-card-pdf.service';
import { IdentityCardLifecycleDto, IssueIdentityCardDto } from './dto/identity-card.dto';

@Injectable()
export class IdentityCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly pdf: IdentityCardPdfService,
  ) {}

  async getMine(userId: string) {
    const card = await this.prisma.identityCard.findFirst({
      where: { status: { in: [IdentityCardStatus.ACTIVE, IdentityCardStatus.SUSPENDED] }, OR: [{ student: { userId } }, { staff: { userId } }] },
      include: this.cardInclude(),
      orderBy: { createdAt: 'desc' },
    });
    if (!card) return null;
    return this.toAuthenticated(card, { includeVerificationUrl: true });
  }

  async list(filters: { holderType?: IdentityCardHolderType; status?: IdentityCardStatus; search?: string }) {
    const search = filters.search?.trim();
    const cards = await this.prisma.identityCard.findMany({
      where: {
        holderType: filters.holderType,
        status: filters.status,
        OR: search ? [
          { cardNumber: { contains: search, mode: 'insensitive' } },
          { serialNumber: { contains: search, mode: 'insensitive' } },
          { student: { OR: [{ matricNo: { contains: search, mode: 'insensitive' } }, { firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } },
          { staff: { OR: [{ employeeNo: { contains: search, mode: 'insensitive' } }, { firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } },
        ] : undefined,
      },
      include: this.cardInclude(),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return cards.map((card) => this.toAuthenticated(card));
  }

  async bulkPdf(dto: BulkIdentityCardPdfDto, actorId: string) {
    const cardIds = [...new Set(dto.cardIds)];
    const cards = await this.prisma.identityCard.findMany({
      where: { id: { in: cardIds }, status: IdentityCardStatus.ACTIVE },
      include: this.cardInclude(),
    });
    if (cards.length !== cardIds.length) {
      throw new BadRequestException('Bulk printing accepts only active identity cards; refresh the register and remove unavailable cards.');
    }
    const byId = new Map(cards.map((card) => [card.id, card]));
    const ordered = cardIds.map((id) => byId.get(id)!).filter(Boolean);
    const settings = await this.settings.getSettings() as CardSettings;
    const buffer = await this.pdf.render(ordered, settings);
    const date = new Date().toISOString().slice(0, 10);
    await this.audit.log({
      action: AuditAction.EXPORT,
      targetTable: 'identity_cards',
      targetId: actorId,
      metadata: { type: 'IDENTITY_CARD_BULK_PDF', count: ordered.length, layout: 'A4_5_UP_DUPLEX_SHORT_EDGE' },
    }, actorId);
    return { buffer, filename: `uniportal-identity-cards-${date}.pdf`, count: ordered.length };
  }

  async issue(dto: IssueIdentityCardDto, actorId: string, actorRoles: readonly string[] = []) {
    if (actorRoles.includes('HR_MANAGER') && !actorRoles.includes('SUPER_ADMIN') && dto.holderType !== IdentityCardHolderType.STAFF) throw new BadRequestException('HR Managers may issue staff identity cards only.');
    const expiryDate = new Date(dto.expiryDate);
    if (Number.isNaN(expiryDate.getTime()) || expiryDate <= new Date()) throw new BadRequestException('Identity-card expiry date must be in the future.');
    let holderId: string;
    let identifier: string;
    let fallbackPhoto: string | null;
    if (dto.holderType === IdentityCardHolderType.STUDENT) {
      if (!dto.studentId) throw new BadRequestException('studentId is required for a student card.');
      const student = await this.prisma.student.findUnique({ where: { id: dto.studentId }, select: { id: true, matricNo: true, status: true, passportPhotoUrl: true } });
      if (!student) throw new NotFoundException('The selected student was not found.');
      if (student.status !== StudentStatus.ACTIVE) throw new BadRequestException('Only active students can receive an identity card.');
      holderId = student.id;
      identifier = student.matricNo;
      fallbackPhoto = student.passportPhotoUrl;
    } else {
      if (!dto.staffId) throw new BadRequestException('staffId is required for a staff card.');
      const staff = await this.prisma.staff.findUnique({ where: { id: dto.staffId }, select: { id: true, employeeNo: true, employmentStatus: true, photoUrl: true } });
      if (!staff) throw new NotFoundException('The selected staff member was not found.');
      if (!( [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] as string[]).includes(staff.employmentStatus)) throw new BadRequestException('Only active or approved leave staff can receive an identity card.');
      holderId = staff.id;
      identifier = staff.employeeNo;
      fallbackPhoto = staff.photoUrl;
    }
    const photoUrl = dto.photoUrl || fallbackPhoto || null;
    const token = randomBytes(32).toString('hex');
    const cardSerial = randomBytes(5).toString('hex').toUpperCase();
    const cardNumber = `${dto.holderType === IdentityCardHolderType.STUDENT ? 'STU' : 'STAFF'}-${identifier}-${new Date().getFullYear()}-${cardSerial.slice(-6)}`;
    const serialNumber = `UP-${new Date().getFullYear()}-${cardSerial}`;
    const card = await this.prisma.$transaction(async (tx) => {
      await tx.identityCard.updateMany({
        where: dto.holderType === IdentityCardHolderType.STUDENT ? { studentId: holderId, status: IdentityCardStatus.ACTIVE } : { staffId: holderId, status: IdentityCardStatus.ACTIVE },
        data: { status: IdentityCardStatus.REPLACED, lifecycleReason: 'Replaced by a newly issued identity card.' },
      });
      return tx.identityCard.create({
        data: {
          holderType: dto.holderType,
          studentId: dto.holderType === IdentityCardHolderType.STUDENT ? holderId : null,
          staffId: dto.holderType === IdentityCardHolderType.STAFF ? holderId : null,
          cardNumber,
          serialNumber,
          expiryDate,
          photoUrl,
          verificationTokenHash: this.hashToken(token),
          verificationTokenCiphertext: encryptPii(token),
          issuedById: actorId,
        },
        include: this.cardInclude(),
      });
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A card with this number already exists. Please retry the issuance.');
      throw error;
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'identity_cards', targetId: card.id, newValues: { holderType: dto.holderType, cardNumber, serialNumber, expiryDate } }, actorId);
    return { ...this.toAuthenticated(card), verificationToken: token };
  }

  async changeStatus(id: string, status: IdentityCardStatus, dto: IdentityCardLifecycleDto, actorId: string) {
    const card = await this.prisma.identityCard.findUnique({ where: { id }, include: this.cardInclude() });
    if (!card) throw new NotFoundException('Identity card not found.');
    if (card.status === IdentityCardStatus.REVOKED || card.status === IdentityCardStatus.REPLACED) throw new BadRequestException('A revoked or replaced identity card cannot be changed.');
    const updated = await this.prisma.identityCard.update({ where: { id }, data: { status, lifecycleReason: dto.reason, revokedById: status === IdentityCardStatus.REVOKED ? actorId : null }, include: this.cardInclude() });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'identity_cards', targetId: id, oldValues: { status: card.status }, newValues: { status, reason: dto.reason } }, actorId);
    return this.toAuthenticated(updated);
  }

  async verify(token: string) {
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new NotFoundException('Identity card could not be verified.');
    const card = await this.prisma.identityCard.findUnique({ where: { verificationTokenHash: this.hashToken(token) }, include: this.cardInclude() });
    if (!card) throw new NotFoundException('Identity card could not be verified.');
    const isExpired = card.expiryDate < new Date() && card.status === IdentityCardStatus.ACTIVE;
    if (isExpired) await this.prisma.identityCard.update({ where: { id: card.id }, data: { status: IdentityCardStatus.EXPIRED } });
    await this.prisma.identityCard.update({ where: { id: card.id }, data: { verificationCount: { increment: 1 }, lastVerifiedAt: new Date() } });
    const effectiveStatus = isExpired ? IdentityCardStatus.EXPIRED : card.status;
    return {
      valid: effectiveStatus === IdentityCardStatus.ACTIVE,
      cardNumber: card.cardNumber,
      serialNumber: card.serialNumber,
      holderType: card.holderType,
      name: card.student ? `${card.student.firstName} ${card.student.lastName}` : `${card.staff?.firstName ?? ''} ${card.staff?.lastName ?? ''}`.trim(),
      identifier: card.student?.matricNo ?? card.staff?.employeeNo ?? null,
      designation: card.staff?.designation ?? null,
      status: effectiveStatus,
      issueDate: card.issueDate,
      expiryDate: card.expiryDate,
    };
  }

  private cardInclude() {
    return {
      student: { select: { id: true, userId: true, matricNo: true, firstName: true, lastName: true, middleName: true, passportPhotoUrl: true, programme: { select: { name: true, code: true } }, department: { select: { name: true, code: true } } } },
      staff: { select: { id: true, userId: true, employeeNo: true, firstName: true, lastName: true, middleName: true, photoUrl: true, designation: true, department: { select: { name: true, code: true } } } },
    } as const;
  }

  private toAuthenticated(card: any, options: { includeVerificationUrl?: boolean } = {}) {
    const holder = card.student
      ? { type: 'STUDENT', id: card.student.id, userId: card.student.userId, identifier: card.student.matricNo, name: `${card.student.firstName} ${card.student.middleName ? `${card.student.middleName} ` : ''}${card.student.lastName}`, programme: card.student.programme, department: card.student.department, photoUrl: card.photoUrl || card.student.passportPhotoUrl }
      : { type: 'STAFF', id: card.staff?.id, userId: card.staff?.userId, identifier: card.staff?.employeeNo, name: `${card.staff?.firstName ?? ''} ${card.staff?.middleName ? `${card.staff.middleName} ` : ''}${card.staff?.lastName ?? ''}`.trim(), designation: card.staff?.designation, department: card.staff?.department, photoUrl: card.photoUrl || card.staff?.photoUrl };
    const authenticated = { id: card.id, holderType: card.holderType, cardNumber: card.cardNumber, serialNumber: card.serialNumber, issueDate: card.issueDate, expiryDate: card.expiryDate, status: card.status, photoUrl: holder.photoUrl, holder, lifecycleReason: card.lifecycleReason, verificationCount: card.verificationCount, lastVerifiedAt: card.lastVerifiedAt };
    if (!options.includeVerificationUrl) return authenticated;
    const verificationToken = decryptPii(card.verificationTokenCiphertext);
    return { ...authenticated, verificationUrl: `/verify/card/${verificationToken}` };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
