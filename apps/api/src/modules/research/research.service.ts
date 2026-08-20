import {
  ConflictException, ForbiddenException, Injectable, Logger,
  NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, EmploymentStatus, GrantStatus, Prisma, ResearchStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  AddResearchMemberDto, CreateGrantDto, CreateResearchOutputDto,
  CreateResearchProjectDto, GetProjectsQueryDto, RecordExpenditureDto,
  UpdateProjectStatusDto, UpdateResearchProjectDto,
} from './dto/research.dto';

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createProject(dto: CreateResearchProjectDto, leadResearcherId: string) {
    const project = await this.prisma.researchProject.create({
      data: {
        title: dto.title, abstract: dto.abstract, leadResearcherId,
        department: dto.department, budget: dto.budget, budgetSpent: '0',
        status: ResearchStatus.PENDING,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate:   dto.endDate   ? new Date(dto.endDate)   : null,
        keywords:  dto.keywords ?? [],
      },
    });
    await this.prisma.researchMember.create({
      data: { projectId: project.id, userId: leadResearcherId, role: 'LEAD' },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'research_projects', targetId: project.id, newValues: { title: dto.title, budget: dto.budget } }, leadResearcherId);
    return project;
  }

  async updateProject(projectId: string, dto: UpdateResearchProjectDto, actorId: string) {
    const project = await this.prisma.researchProject.findUniqueOrThrow({ where: { id: projectId } });
    if (project.leadResearcherId !== actorId) throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only the lead researcher may update project details' });
    if (([ResearchStatus.COMPLETED, ResearchStatus.CANCELLED] as ResearchStatus[]).includes(project.status)) throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Cannot update a completed or cancelled project' });
    const updated = await this.prisma.researchProject.update({
      where: { id: projectId },
      data: { title: dto.title ?? project.title, abstract: dto.abstract ?? project.abstract, budget: dto.budget ?? project.budget, startDate: dto.startDate ? new Date(dto.startDate) : project.startDate, endDate: dto.endDate ? new Date(dto.endDate) : project.endDate, keywords: dto.keywords ?? project.keywords },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'research_projects', targetId: projectId, newValues: { ...dto } }, actorId);
    return updated;
  }

  async updateProjectStatus(projectId: string, dto: UpdateProjectStatusDto, actorId: string) {
    const project = await this.prisma.researchProject.findUniqueOrThrow({ where: { id: projectId } });
    if (dto.status === ResearchStatus.ACTIVE) {
      const ref = dto.ethicsApprovalRef ?? project.ethicsApprovalRef;
      if (!ref) throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Ethics approval reference required before activating a research project' });
    }
    const updated = await this.prisma.researchProject.update({
      where: { id: projectId },
      data: { status: dto.status, ethicsApprovalRef: dto.ethicsApprovalRef ?? project.ethicsApprovalRef, ethicsApprovedAt: dto.ethicsApprovedAt ? new Date(dto.ethicsApprovedAt) : project.ethicsApprovedAt },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'research_projects', targetId: projectId, oldValues: { status: project.status }, newValues: { status: dto.status } }, actorId);
    this.logger.log(`Project ${projectId}: ${project.status} → ${dto.status}`);
    return updated;
  }

  async getResearchPeople() {
    return this.prisma.staff.findMany({
      where: { employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] } },
      select: { userId: true, employeeNo: true, firstName: true, lastName: true, designation: true, departmentId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 500,
    });
  }

  async getProjects(query: GetProjectsQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.status)           where['status'] = query.status;
    if (query.department)       where['department'] = { contains: query.department, mode: 'insensitive' };
    if (query.leadResearcherId) where['leadResearcherId'] = query.leadResearcherId;
    return this.prisma.researchProject.findMany({
      where: where as Prisma.ResearchProjectWhereInput,
      orderBy: { createdAt: 'desc' },
      include: { members: { select: { userId: true, role: true } }, _count: { select: { grants: true, outputs: true } } },
    });
  }

  async getProjectById(projectId: string) {
    return this.prisma.researchProject.findUniqueOrThrow({
      where: { id: projectId },
      include: { members: true, grants: { include: { expenditures: true } }, outputs: true },
    });
  }

  async addMember(projectId: string, dto: AddResearchMemberDto, actorId: string) {
    const project = await this.prisma.researchProject.findUniqueOrThrow({ where: { id: projectId } });
    if (project.leadResearcherId !== actorId) throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only the lead researcher can add members' });
    const existing = await this.prisma.researchMember.findUnique({ where: { uq_project_member: { projectId, userId: dto.userId } } });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'User is already a member' });
    const member = await this.prisma.researchMember.create({ data: { projectId, userId: dto.userId, role: dto.role } });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'research_members', targetId: member.id, newValues: { userId: dto.userId, role: dto.role } }, actorId);
    return member;
  }

  async removeMember(projectId: string, userId: string, actorId: string) {
    const project = await this.prisma.researchProject.findUniqueOrThrow({ where: { id: projectId } });
    if (project.leadResearcherId !== actorId) throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only the lead researcher can remove members' });
    if (userId === project.leadResearcherId) throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Cannot remove the lead researcher' });
    await this.prisma.researchMember.delete({ where: { uq_project_member: { projectId, userId } } });
    return { message: 'Member removed' };
  }

  async addGrant(projectId: string, dto: CreateGrantDto, actorId: string) {
    await this.prisma.researchProject.findUniqueOrThrow({ where: { id: projectId } });
    const grant = await this.prisma.grant.create({
      data: { projectId, funder: dto.funder, grantRef: dto.grantRef ?? null, amount: dto.amount, currency: dto.currency ?? 'NGN', startDate: new Date(dto.startDate), endDate: new Date(dto.endDate), status: GrantStatus.ACTIVE },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'grants', targetId: grant.id, newValues: { projectId, funder: dto.funder, amount: dto.amount } }, actorId);
    return grant;
  }

  /**
   * Deep-audit fix (Aug 2026): previously read grant.expenditures, summed
   * them in application code, compared against the budget, then performed
   * three SEPARATE, unwrapped writes (create expenditure, increment
   * ResearchProject.budgetSpent, maybe mark the Grant EXHAUSTED) — neither
   * transactionally atomic with each other NOR protected against two
   * concurrent expenditure submissions both reading the same totalSpent
   * before either commits, which could jointly exceed the grant budget.
   * Fixed with `SELECT ... FOR UPDATE` on the Grant row itself: this locks
   * that row for the rest of the transaction, so a second concurrent call
   * against the SAME grant blocks until the first one commits or rolls
   * back — then the sum-and-compare it reads is guaranteed current. This
   * doesn't need the advisory-lock/DirectPrismaService machinery used for
   * admissions/matric numbers elsewhere in this codebase: a row lock held
   * for the duration of a single $transaction works correctly regardless
   * of PgBouncer pooling mode (unlike a session-scoped advisory lock,
   * which needs a stable connection across multiple separate statements —
   * not the case here, since everything happens inside one transaction
   * callback, which Prisma guarantees a consistent connection for).
   */
  async recordExpenditure(grantId: string, dto: RecordExpenditureDto, actorId: string) {
    const newAmount = parseFloat(dto.amount);

    const expenditure = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; status: GrantStatus; amount: string; projectId: string }>>`
        SELECT id, status, amount, "projectId" FROM grants WHERE id = ${grantId}::uuid FOR UPDATE
      `;
      const grant = locked[0];
      if (!grant) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Grant not found' });
      if (grant.status !== GrantStatus.ACTIVE) {
        throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: 'Cannot record expenditure against a non-active grant' });
      }

      const existingExpenditures = await tx.grantExpenditure.findMany({ where: { grantId }, select: { amount: true } });
      const totalSpent = existingExpenditures.reduce((s, e) => s + parseFloat(e.amount.toString()), 0);
      const grantAmount = parseFloat(grant.amount);
      if (totalSpent + newAmount > grantAmount) {
        throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: `Expenditure exceeds grant budget (₦${grantAmount.toLocaleString()} total, ₦${totalSpent.toLocaleString()} spent)` });
      }

      const created = await tx.grantExpenditure.create({
        data: { grantId, description: dto.description, amount: dto.amount, receiptRef: dto.receiptRef ?? null, expendedAt: new Date(dto.expendedAt), recordedById: actorId },
      });
      await tx.researchProject.update({ where: { id: grant.projectId }, data: { budgetSpent: { increment: newAmount } } });
      if (totalSpent + newAmount >= grantAmount) {
        await tx.grant.update({ where: { id: grantId }, data: { status: GrantStatus.EXHAUSTED } });
        this.logger.log(`Grant ${grantId} EXHAUSTED`);
      }
      return created;
    });

    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'grant_expenditures', targetId: expenditure.id, newValues: { grantId, amount: dto.amount } }, actorId);
    return expenditure;
  }

  async addOutput(projectId: string, dto: CreateResearchOutputDto, actorId: string) {
    const project = await this.prisma.researchProject.findUniqueOrThrow({ where: { id: projectId } });
    const isMember = await this.prisma.researchMember.findUnique({ where: { uq_project_member: { projectId, userId: actorId } } });
    if (!isMember && project.leadResearcherId !== actorId) throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only project members can add outputs' });
    const output = await this.prisma.researchOutput.create({
      data: { projectId, outputType: dto.outputType, title: dto.title, authors: dto.authors, publishedIn: dto.publishedIn ?? null, publishDate: dto.publishDate ? new Date(dto.publishDate) : null, doi: dto.doi ?? null, url: dto.url ?? null, abstract: dto.abstract ?? null, createdById: actorId },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'research_outputs', targetId: output.id, newValues: { projectId, outputType: dto.outputType, title: dto.title } }, actorId);
    return output;
  }

  async getSummaryReport() {
    const [totalProjects, byStatus, totalGrants, totalOutputs] = await this.prisma.$transaction([
      this.prisma.researchProject.count(),
      this.prisma.researchProject.groupBy({ by: ['status'], _count: { status: true } }),
      this.prisma.grant.aggregate({ _sum: { amount: true }, _count: { id: true } }),
      this.prisma.researchOutput.count(),
    ]);
    return { totalProjects, byStatus: byStatus.map((b) => ({ status: b.status, count: b._count.status })), totalGrants: totalGrants._count.id, totalGrantAmount: totalGrants._sum.amount ?? 0, totalOutputs };
  }
}
