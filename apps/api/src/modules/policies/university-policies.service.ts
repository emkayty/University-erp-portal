import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, Prisma, UniversityPolicyStatus } from "@prisma/client";

import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import type {
  CreateUniversityPolicyDto,
  ListPolicyAcknowledgementsDto,
  ListUniversityPoliciesDto,
  PublishUniversityPolicyDto,
  ReviewUniversityPolicyDto,
  UpdateUniversityPolicyDto,
} from "./dto/university-policy.dto";

const EDITABLE_STATUSES: UniversityPolicyStatus[] = [
  UniversityPolicyStatus.DRAFT,
  UniversityPolicyStatus.REJECTED,
];

@Injectable()
export class UniversityPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filters: ListUniversityPoliciesDto) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const where: Prisma.UniversityPolicyWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? {
            OR: [
              { policyCode: { contains: filters.search, mode: "insensitive" } },
              { title: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [policies, total] = await this.prisma.$transaction([
      this.prisma.universityPolicy.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.policySummarySelect(),
      }),
      this.prisma.universityPolicy.count({ where }),
    ]);

    return {
      policies,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getAdminPolicy(id: string) {
    const policy = await this.prisma.universityPolicy.findUnique({
      where: { id },
      include: { _count: { select: { acknowledgements: true } } },
    });
    if (!policy) throw new NotFoundException("University policy not found");
    return policy;
  }

  async listPublishedForUser(userId: string) {
    const now = new Date();
    return this.prisma.universityPolicy.findMany({
      where: {
        status: UniversityPolicyStatus.PUBLISHED,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
      },
      orderBy: [{ effectiveFrom: "desc" }, { title: "asc" }],
      select: {
        ...this.policySummarySelect(),
        acknowledgements: {
          where: { userId },
          select: { acknowledgedAt: true },
        },
      },
    });
  }

  async getPublishedForUser(id: string, userId: string) {
    const policy = await this.prisma.universityPolicy.findFirst({
      where: {
        id,
        status: UniversityPolicyStatus.PUBLISHED,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: new Date() } }],
      },
      include: {
        acknowledgements: {
          where: { userId },
          select: { acknowledgedAt: true },
        },
      },
    });
    if (!policy)
      throw new NotFoundException("Published university policy not found");
    return policy;
  }

  async create(dto: CreateUniversityPolicyDto, actorId: string) {
    const policy = await this.prisma.universityPolicy
      .create({
        data: {
          policyCode: dto.policyCode.trim().toUpperCase(),
          version: dto.version?.trim() || "1.0",
          title: dto.title.trim(),
          category: dto.category,
          summary: dto.summary?.trim() || null,
          content: dto.content.trim(),
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
          reviewDueAt: dto.reviewDueAt ? new Date(dto.reviewDueAt) : null,
          requiresAcknowledgement: dto.requiresAcknowledgement ?? false,
          acknowledgementDueAt: dto.acknowledgementDueAt
            ? new Date(dto.acknowledgementDueAt)
            : null,
          createdById: actorId,
        },
      })
      .catch((error: unknown) => {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException(
            "A policy with this code and version already exists",
          );
        }
        throw error;
      });

    await this.audit.log(
      {
        action: AuditAction.CREATE,
        targetTable: "university_policies",
        targetId: policy.id,
        newValues: {
          policyCode: policy.policyCode,
          version: policy.version,
          title: policy.title,
        },
      },
      actorId,
    );
    return policy;
  }

  async update(id: string, dto: UpdateUniversityPolicyDto, actorId: string) {
    const existing = await this.getAdminPolicy(id);
    this.assertEditable(existing.status);

    const policy = await this.prisma.universityPolicy.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.summary !== undefined
          ? { summary: dto.summary.trim() || null }
          : {}),
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.effectiveFrom !== undefined
          ? { effectiveFrom: new Date(dto.effectiveFrom) }
          : {}),
        ...(dto.reviewDueAt !== undefined
          ? { reviewDueAt: new Date(dto.reviewDueAt) }
          : {}),
        ...(dto.requiresAcknowledgement !== undefined
          ? { requiresAcknowledgement: dto.requiresAcknowledgement }
          : {}),
        ...(dto.acknowledgementDueAt !== undefined
          ? { acknowledgementDueAt: new Date(dto.acknowledgementDueAt) }
          : {}),
        updatedById: actorId,
        ...(existing.status === UniversityPolicyStatus.REJECTED
          ? { status: UniversityPolicyStatus.DRAFT, rejectionReason: null }
          : {}),
      },
    });

    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "university_policies",
        targetId: id,
        newValues: dto as Record<string, unknown>,
      },
      actorId,
    );
    return policy;
  }

  async createRevision(
    id: string,
    dto: UpdateUniversityPolicyDto,
    actorId: string,
  ) {
    const existing = await this.getAdminPolicy(id);
    if (
      existing.status !== UniversityPolicyStatus.PUBLISHED &&
      existing.status !== UniversityPolicyStatus.ARCHIVED
    ) {
      throw new BadRequestException(
        "Only a published or archived policy can be revised",
      );
    }

    const revision = await this.prisma.universityPolicy.create({
      data: {
        policyCode: existing.policyCode,
        version: this.nextVersion(existing.version),
        title: dto.title?.trim() ?? existing.title,
        category: dto.category ?? existing.category,
        summary: dto.summary?.trim() || existing.summary,
        content: dto.content?.trim() ?? existing.content,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        reviewDueAt: dto.reviewDueAt
          ? new Date(dto.reviewDueAt)
          : existing.reviewDueAt,
        requiresAcknowledgement:
          dto.requiresAcknowledgement ?? existing.requiresAcknowledgement,
        acknowledgementDueAt: dto.acknowledgementDueAt
          ? new Date(dto.acknowledgementDueAt)
          : null,
        createdById: actorId,
      },
    });

    await this.audit.log(
      {
        action: AuditAction.CREATE,
        targetTable: "university_policies",
        targetId: revision.id,
        newValues: {
          revisionOf: existing.id,
          policyCode: revision.policyCode,
          version: revision.version,
        },
        metadata: { type: "POLICY_REVISION" },
      },
      actorId,
    );
    return revision;
  }

  async submit(id: string, actorId: string) {
    const existing = await this.getAdminPolicy(id);
    this.assertEditable(existing.status);

    const policy = await this.prisma.universityPolicy.update({
      where: { id },
      data: {
        status: UniversityPolicyStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
        rejectionReason: null,
        updatedById: actorId,
      },
    });
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "university_policies",
        targetId: id,
        newValues: { status: UniversityPolicyStatus.PENDING_APPROVAL },
        metadata: { type: "POLICY_SUBMITTED" },
      },
      actorId,
    );
    return policy;
  }

  async review(id: string, dto: ReviewUniversityPolicyDto, actorId: string) {
    const existing = await this.getAdminPolicy(id);
    if (existing.status !== UniversityPolicyStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        "Only a policy pending approval can be reviewed",
      );
    }
    if (existing.createdById === actorId) {
      throw new BadRequestException(
        "The policy author cannot approve or reject their own policy",
      );
    }
    if (dto.action === "REJECT" && !dto.comment?.trim()) {
      throw new BadRequestException("A rejection reason is required");
    }

    const isApproved = dto.action === "APPROVE";
    const policy = await this.prisma.universityPolicy.update({
      where: { id },
      data: {
        status: isApproved
          ? UniversityPolicyStatus.APPROVED
          : UniversityPolicyStatus.REJECTED,
        approvedAt: isApproved ? new Date() : null,
        approvedById: actorId,
        rejectionReason: isApproved ? null : dto.comment!.trim(),
        updatedById: actorId,
      },
    });
    await this.audit.log(
      {
        action: isApproved ? AuditAction.APPROVE : AuditAction.REJECT,
        targetTable: "university_policies",
        targetId: id,
        newValues: { status: policy.status, comment: dto.comment ?? null },
        metadata: { type: "POLICY_REVIEW" },
      },
      actorId,
    );
    return policy;
  }

  async publish(id: string, dto: PublishUniversityPolicyDto, actorId: string) {
    const existing = await this.getAdminPolicy(id);
    if (existing.status !== UniversityPolicyStatus.APPROVED) {
      throw new BadRequestException("Only an approved policy can be published");
    }

    const now = new Date();
    const policy = await this.prisma.$transaction(async (tx) => {
      await tx.universityPolicy.updateMany({
        where: {
          policyCode: existing.policyCode,
          status: UniversityPolicyStatus.PUBLISHED,
          id: { not: existing.id },
        },
        data: {
          status: UniversityPolicyStatus.ARCHIVED,
          archivedAt: now,
          updatedById: actorId,
        },
      });
      return tx.universityPolicy.update({
        where: { id },
        data: {
          status: UniversityPolicyStatus.PUBLISHED,
          publishedAt: now,
          effectiveFrom: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : (existing.effectiveFrom ?? now),
          updatedById: actorId,
        },
      });
    });

    await this.audit.log(
      {
        action: AuditAction.PUBLISH,
        targetTable: "university_policies",
        targetId: id,
        newValues: {
          status: UniversityPolicyStatus.PUBLISHED,
          effectiveFrom: policy.effectiveFrom?.toISOString() ?? null,
        },
        metadata: { type: "POLICY_PUBLISHED" },
      },
      actorId,
    );
    return policy;
  }

  async archive(id: string, actorId: string) {
    const existing = await this.getAdminPolicy(id);
    const nonArchivable: UniversityPolicyStatus[] = [
      UniversityPolicyStatus.ARCHIVED,
      UniversityPolicyStatus.DRAFT,
      UniversityPolicyStatus.PENDING_APPROVAL,
    ];
    if (nonArchivable.includes(existing.status)) {
      throw new BadRequestException(
        "Only approved, rejected, or published policies can be archived",
      );
    }
    const policy = await this.prisma.universityPolicy.update({
      where: { id },
      data: {
        status: UniversityPolicyStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedById: actorId,
      },
    });
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "university_policies",
        targetId: id,
        newValues: { status: UniversityPolicyStatus.ARCHIVED },
        metadata: { type: "POLICY_ARCHIVED" },
      },
      actorId,
    );
    return policy;
  }

  async acknowledge(
    id: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const policy = await this.getPublishedForUser(id, userId);
    if (!policy.requiresAcknowledgement) {
      throw new BadRequestException(
        "This policy does not require acknowledgement",
      );
    }

    const acknowledgement =
      await this.prisma.universityPolicyAcknowledgement.upsert({
        where: {
          uq_university_policy_acknowledgement: { policyId: id, userId },
        },
        create: {
          policyId: id,
          userId,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
        update: {},
      });
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: "university_policy_acknowledgements",
        targetId: acknowledgement.id,
        newValues: { policyId: id, acknowledged: true },
        metadata: { type: "POLICY_ACKNOWLEDGEMENT" },
      },
      userId,
    );
    return acknowledgement;
  }

  async listAcknowledgements(
    id: string,
    filters: ListPolicyAcknowledgementsDto,
  ) {
    await this.getAdminPolicy(id);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const [acknowledgements, total] = await this.prisma.$transaction([
      this.prisma.universityPolicyAcknowledgement.findMany({
        where: { policyId: id },
        include: { user: { select: { id: true, email: true, phone: true } } },
        orderBy: { acknowledgedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.universityPolicyAcknowledgement.count({
        where: { policyId: id },
      }),
    ]);
    return {
      acknowledgements,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private policySummarySelect() {
    return {
      id: true,
      policyCode: true,
      version: true,
      title: true,
      category: true,
      summary: true,
      status: true,
      effectiveFrom: true,
      reviewDueAt: true,
      requiresAcknowledgement: true,
      acknowledgementDueAt: true,
      submittedAt: true,
      approvedAt: true,
      publishedAt: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { acknowledgements: true } },
    } as const;
  }

  private assertEditable(status: UniversityPolicyStatus) {
    if (!EDITABLE_STATUSES.includes(status)) {
      throw new BadRequestException(
        "Only a draft or rejected policy can be edited or submitted",
      );
    }
  }

  private nextVersion(version: string): string {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(version);
    if (!match) return `${version}-rev`;
    return `${match[1]}.${Number(match[2] ?? 0) + 1}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}
