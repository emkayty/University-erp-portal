import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, CampaignStatus, DonationStatus, Prisma } from '@prisma/client';
import { getDegreeClass } from '@uniportal/utils';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateCampaignDto, CreateDonationDto, GetAlumniQueryDto,
  UpdateAlumniProfileDto, UpdateCampaignStatusDto, UpdateDonationStatusDto,
} from './dto/alumni.dto';

@Injectable()
export class AlumniService {
  private readonly logger = new Logger(AlumniService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Alumni Profiles ───────────────────────────────────────────────────────

  /**
   * Creates an alumni record for a newly-graduated student. Idempotent —
   * safe to call more than once for the same student.
   *
   * Deep-audit fix (Aug 2026): this docblock previously read "Called by
   * event handler in StudentsService when status → GRADUATED" — no such
   * event handler existed anywhere in the codebase (confirmed: zero
   * @OnEvent listeners in the entire project), and nothing anywhere ever
   * set a student's status to GRADUATED in the first place. This method
   * itself was always correctly built; it was simply never invoked by
   * anything. It's now called directly, in the same transaction, from
   * StudentsService.graduate() — see that method for the full
   * academic-and-administrative eligibility check that must pass first.
   * See docs/CHANGELOG.md finding 1.1 for the full account.
   *
   * Accepts an optional transaction client (db) so a caller already inside
   * a $transaction/runExclusive block — as StudentsService.graduate() is —
   * can pass its `tx` through and have this participate in that same
   * atomic transaction. Without this, the alumni row would be created via
   * AlumniService's own ambient PrismaService, outside the caller's
   * transaction — meaning a later failure in that transaction (e.g. the
   * audit log or outbox write) would roll back the Student.status update
   * and StudentAcademicHistory snapshot, but NOT this already-committed
   * alumni row, leaving an alumni record for a student who, from
   * Student.status's point of view, never actually graduated. Defaults to
   * this.prisma so this method still works if ever called standalone,
   * outside any transaction (no such call site exists today, but the
   * option costs nothing to keep open).
   */
  async createAlumniFromStudent(
    studentId: string,
    userId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const student = await db.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { programme: true },
    });

    const existing = await db.alumni.findUnique({ where: { studentId } });
    if (existing) {
      this.logger.warn(`Alumni record already exists for student ${studentId}`);
      return existing;
    }

    // Deep-audit fix (Aug 2026): this used to hand-roll its own copy of the
    // degree-classification boundaries, duplicating (and risking silent
    // drift from) the single shared implementation results.service.ts
    // already uses for transcripts. Now calls the same shared function, so
    // there is exactly one place these boundaries are defined.
    const classAwarded = getDegreeClass(student.cgpa.toNumber());

    const alumni = await db.alumni.create({
      data: {
        userId,
        studentId,
        graduationYear: new Date().getFullYear(),
        programme:      student.programme.name,
        classAwarded,
        cgpaAtGrad:     student.cgpa,
        isProfilePublic: true,
      },
    });

    this.logger.log(`Alumni record auto-created for student ${studentId} (userId ${userId})`);
    return alumni;
  }

  async updateProfile(alumniId: string, dto: UpdateAlumniProfileDto, actorId: string, actorRole?: string) {
    const alumni = await this.prisma.alumni.findUniqueOrThrow({ where: { id: alumniId } });
    const isOwner = alumni.userId === actorId;
    const isAdministrator = actorRole === 'VC' || actorRole === 'SUPER_ADMIN';
    if (!isOwner && !isAdministrator) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only the alumni owner or an authorized administrator may update this profile.' });
    }

    const updated = await this.prisma.alumni.update({
      where: { id: alumniId },
      data: {
        occupation:      dto.occupation      ?? alumni.occupation,
        employer:        dto.employer        ?? alumni.employer,
        industry:        dto.industry        ?? alumni.industry,
        linkedinUrl:     dto.linkedinUrl     ?? alumni.linkedinUrl,
        currentCountry:  dto.currentCountry  ?? alumni.currentCountry,
        currentCity:     dto.currentCity     ?? alumni.currentCity,
        bio:             dto.bio             ?? alumni.bio,
        isProfilePublic: dto.isProfilePublic ?? alumni.isProfilePublic,
      },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'alumni', targetId: alumniId,
      newValues: { ...dto },
    }, actorId);

    return updated;
  }

  async getAlumni(query: GetAlumniQueryDto) {
    const { q, industry, currentCountry, graduationYear, page = 1, pageSize = 20 } = query;
    const where: Record<string, unknown> = { isProfilePublic: true };

    if (industry)        where['industry']       = { contains: industry, mode: 'insensitive' };
    if (currentCountry)  where['currentCountry'] = { contains: currentCountry, mode: 'insensitive' };
    if (graduationYear)  where['graduationYear'] = Number(graduationYear);

    const [alumni, total] = await this.prisma.$transaction([
      this.prisma.alumni.findMany({
        where: where as Prisma.AlumniWhereInput,
        orderBy: { graduationYear: 'desc' },
        skip: (page - 1) * pageSize, take: pageSize,
        // Exclude userId for privacy — only show professional profile
        select: {
          id: true, graduationYear: true, programme: true, classAwarded: true,
          occupation: true, employer: true, industry: true,
          currentCountry: true, currentCity: true, bio: true,
          linkedinUrl: true, createdAt: true,
        },
      }),
      this.prisma.alumni.count({
        where: where as Prisma.AlumniWhereInput,
      }),
    ]);

    return { alumni, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getAlumniById(alumniId: string, actorId: string, actorRole?: string) {
    const alumni = await this.prisma.alumni.findUniqueOrThrow({
      where: { id: alumniId },
      select: {
        id: true, userId: true, studentId: true, graduationYear: true, programme: true,
        classAwarded: true, cgpaAtGrad: true, occupation: true, employer: true,
        industry: true, linkedinUrl: true, currentCountry: true, currentCity: true,
        bio: true, isProfilePublic: true, createdAt: true, updatedAt: true,
      },
    });
    const isOwner = alumni.userId === actorId;
    const isAuthorizedStaff = actorRole === 'VC' || actorRole === 'SUPER_ADMIN' || actorRole === 'STAFF';
    if (!alumni.isProfilePublic && !isOwner && !isAuthorizedStaff) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'This alumni profile is private.' });
    }
    const { userId: _userId, ...profile } = alumni;
    if (isOwner || isAuthorizedStaff) return profile;
    const { studentId: _studentId, cgpaAtGrad: _cgpaAtGrad, ...publicProfile } = profile;
    return publicProfile;
  }

  async getMyAlumniProfile(userId: string) {
    const alumni = await this.prisma.alumni.findUnique({ where: { userId } });
    // Deep-audit fix (Aug 2026): this message used to say "Graduate
    // students are registered automatically" — true now that
    // StudentsService.graduate() actually creates the alumni record as
    // part of graduating, but worth being specific for anyone who
    // genuinely graduated before this fix existed (their alumni record
    // was never backfilled) versus someone who simply hasn't graduated.
    if (!alumni) throw new NotFoundException({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Alumni profile not found. This is created automatically when you graduate — ' +
        'if you graduated before this feature existed, ask the registrar to create it retroactively.',
    });
    return alumni;
  }

  // ── Campaigns ─────────────────────────────────────────────────────────────

  async createCampaign(dto: CreateCampaignDto, actorId: string) {
    const campaign = await this.prisma.campaign.create({
      data: {
        title:        dto.title,
        description:  dto.description,
        targetAmount: dto.targetAmount,
        raisedAmount: '0',
        currency:     dto.currency ?? 'NGN',
        startDate:    new Date(dto.startDate),
        endDate:      dto.endDate ? new Date(dto.endDate) : null,
        status:       CampaignStatus.ACTIVE,
        imageUrl:     dto.imageUrl ?? null,
        createdById:  actorId,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'campaigns', targetId: campaign.id,
      newValues: { title: dto.title, targetAmount: dto.targetAmount },
    }, actorId);

    return campaign;
  }

  async updateCampaignStatus(campaignId: string, dto: UpdateCampaignStatusDto, actorId: string) {
    const campaign = await this.prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

    if (campaign.status === CampaignStatus.CANCELLED) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Cannot update a cancelled campaign' });
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data:  { status: dto.status },
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'campaigns', targetId: campaignId,
      oldValues: { status: campaign.status }, newValues: { status: dto.status },
    }, actorId);

    return updated;
  }

  async getCampaigns(includeAll = false) {
    const where = includeAll ? {} : { status: CampaignStatus.ACTIVE };
    return this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, description: true, targetAmount: true,
        raisedAmount: true, currency: true, startDate: true, endDate: true,
        status: true, imageUrl: true,
        _count: { select: { donations: { where: { status: DonationStatus.COMPLETED } } } },
      },
    });
  }

  async getCampaignById(campaignId: string) {
    return this.prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: {
        donations: {
          where: { status: DonationStatus.COMPLETED },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, amount: true, isAnonymous: true, message: true, createdAt: true,
            // Only show donorName when NOT anonymous
            donorName: true,
          },
        },
      },
    });
  }

  // ── Donations ─────────────────────────────────────────────────────────────

  async createDonation(dto: CreateDonationDto, actorId: string, actorRole?: string) {
    const campaign = await this.prisma.campaign.findUniqueOrThrow({ where: { id: dto.campaignId } });

    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Donations are only accepted for active campaigns' });
    }

    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(dto.amount);
    } catch {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Donation amount must be a valid decimal amount greater than zero' });
    }
    if (!amount.isFinite() || amount.lte(0)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Donation amount must be greater than zero' });
    }

    // A self-service actor may only associate a donation with their own alumni
    // record. Privileged Finance/administrative actors can record a donor on
    // behalf of an alumnus, but completion remains a separate Finance action.
    if (dto.alumniId && !['STAFF', 'BURSAR', 'VC', 'SUPER_ADMIN'].includes(actorRole ?? '')) {
      const ownedAlumni = await this.prisma.alumni.findFirst({
        where: { id: dto.alumniId, userId: actorId },
        select: { id: true },
      });
      if (!ownedAlumni) {
        throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'You may only associate a donation with your own alumni profile' });
      }
    }

    const donation = await this.prisma.donation.create({
      data: {
        campaignId:  dto.campaignId,
        alumniId:    dto.alumniId    ?? null,
        donorName:   dto.isAnonymous ? null : (dto.donorName  ?? null),
        donorEmail:  dto.donorEmail  ?? null,
        amount,
        currency:    campaign.currency,
        isAnonymous: dto.isAnonymous ?? false,
        message:     dto.message     ?? null,
        status:      DonationStatus.PENDING,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'donations', targetId: donation.id,
      newValues: { campaignId: dto.campaignId, amount: dto.amount, isAnonymous: dto.isAnonymous },
    }, actorId);

    return {
      id:         donation.id,
      campaignId: donation.campaignId,
      amount:     donation.amount,
      status:     donation.status,
      // No provider intent is created by the current schema/integration
      // contract. Keep the response honest and leave public totals unchanged
      // until audited Finance reconciliation supplies external proof.
      message: 'Donation recorded as pending. No payment gateway was initiated; Finance reconciliation is required before it is counted as completed.',
    };
  }

  async completeDonation(donationId: string, dto: UpdateDonationStatusDto, actorId: string, actorRole?: string) {
    if (actorRole !== 'BURSAR' && actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only Finance reconciliation officers may update donation settlement status' });
    }
    if (dto.status === 'REFUNDED') {
      throw new UnprocessableEntityException({
        code: 'DONATION_REFUND_LEDGER_REQUIRED',
        message: 'Refunds require the donation ledger and provider reconciliation workflow; this endpoint cannot safely record a refund yet',
      });
    }
    if (dto.status === 'COMPLETED' && !dto.providerRef?.trim()) {
      throw new UnprocessableEntityException({
        code: 'DONATION_PROVIDER_PROOF_REQUIRED',
        message: 'A verified external provider or reconciliation reference is required before completion',
      });
    }

    const donation = await this.prisma.donation.findUniqueOrThrow({ where: { id: donationId } });

    if (donation.status !== DonationStatus.PENDING) {
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Donation is not in PENDING status' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await tx.donation.update({
        where: { id: donationId },
        data: { status: dto.status, providerRef: dto.providerRef ?? null },
      });

      // Increment campaign raisedAmount when completed
      if (dto.status === 'COMPLETED') {
        await tx.campaign.update({
          where: { id: donation.campaignId },
          data:  { raisedAmount: { increment: parseFloat(donation.amount.toString()) } },
        });
        this.logger.log(`Donation ${donationId} completed — campaign ${donation.campaignId} raised amount updated`);
      }

      return d;
    });

    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'donations', targetId: donationId,
      oldValues: { status: donation.status }, newValues: { status: dto.status },
    }, actorId);

    return updated;
  }

  async getDonationReport(campaignId?: string) {
    const where = campaignId ? { campaignId, status: DonationStatus.COMPLETED } : { status: DonationStatus.COMPLETED };

    const [donations, aggregate] = await this.prisma.$transaction([
      this.prisma.donation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, campaignId: true, amount: true, currency: true,
          isAnonymous: true, donorName: true, message: true, createdAt: true,
          campaign: { select: { title: true } },
        },
      }),
      this.prisma.donation.aggregate({
        where,
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    // Mask anonymous donor names in report output
    const maskedDonations = donations.map((d) => ({
      ...d,
      donorName: d.isAnonymous ? 'Anonymous' : d.donorName,
    }));

    return {
      donations: maskedDonations,
      summary: {
        totalDonations: aggregate._count.id,
        totalAmount:    aggregate._sum.amount ?? 0,
      },
    };
  }
}
