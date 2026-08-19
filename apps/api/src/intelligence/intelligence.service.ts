import { ConflictException, Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AlertStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { TaskStatus } from './intelligence.dto';

type AuthorizationRoles = string | readonly string[];

type RuleDefinition = {
  code: string;
  name: string;
  domain: string;
  condition: Record<string, unknown>;
  actions: Array<{ type: string; payload?: Record<string, unknown> }>;
};

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async createRule(input: RuleDefinition, createdById?: string) {
    if (!input.code || !input.name || !input.domain) {
      throw new BadRequestException('Rule code, name and domain are required.');
    }
    if (!Array.isArray(input.actions) || input.actions.length === 0) {
      throw new BadRequestException('At least one rule action is required.');
    }

    return this.prisma.businessRule.create({
      data: {
        code: input.code,
        name: input.name,
        domain: input.domain,
        condition: (input.condition ?? {}) as Prisma.InputJsonValue,
        actions: input.actions as unknown as Prisma.InputJsonValue,
        createdById,
      },
    });
  }

  async evaluateActiveRules(
    domain: string,
    entityType: string,
    entityId: string,
    facts: Record<string, unknown>,
  ) {
    const rules = await this.prisma.businessRule.findMany({
      where: { domain, status: 'ACTIVE' },
      orderBy: { code: 'asc' },
    });

    const results = [];
    for (const rule of rules) {
      const matched = this.matches(rule.condition as Record<string, unknown>, facts);
      const actionResult = matched
        ? await this.prepareActions(rule.actions, entityType, entityId)
        : [];

      const execution = await this.prisma.ruleExecution.create({
        data: {
          ruleId: rule.id,
          entityType,
          entityId,
          result: matched ? 'MATCHED' : 'NOT_MATCHED',
          actionResult,
        },
      });

      results.push({ ruleCode: rule.code, matched, executionId: execution.id, actions: actionResult });
    }
    return results;
  }

  private matches(condition: Record<string, unknown>, facts: Record<string, unknown>): boolean {
    // Intentionally conservative: equality and simple numeric comparisons only.
    // Complex expressions should be implemented as reviewed rule operators, not runtime code evaluation.
    for (const [key, expected] of Object.entries(condition ?? {})) {
      const actual = facts[key];
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        const op = (expected as any).operator;
        const value = (expected as any).value;
        if (op === 'eq' && actual !== value) return false;
        if (op === 'neq' && actual === value) return false;
        if (op === 'gt' && !(Number(actual) > Number(value))) return false;
        if (op === 'gte' && !(Number(actual) >= Number(value))) return false;
        if (op === 'lt' && !(Number(actual) < Number(value))) return false;
        if (op === 'lte' && !(Number(actual) <= Number(value))) return false;
        if (!['eq','neq','gt','gte','lt','lte'].includes(op)) return false;
      } else if (actual !== expected) {
        return false;
      }
    }
    return true;
  }

  private async prepareActions(actions: unknown, entityType: string, entityId: string) {
    if (!Array.isArray(actions)) return [];
    return actions.map((action: any) => ({
      type: action.type,
      entityType,
      entityId,
      payload: action.payload ?? {},
      requiresHumanReview: ['REQUEST_REVIEW', 'ESCALATE', 'FLAG'].includes(action.type),
    }));
  }
  async listAlerts(filters: { status?: string; domain?: string; actorId?: string; roles?: AuthorizationRoles; role?: string } = {}) {
    return this.prisma.enterpriseAlert.findMany({
      where: {
        ...(filters.status ? { status: filters.status as any } : {}),
        ...(filters.domain ? { domain: filters.domain } : {}),
        ...(filters.actorId && !this.hasPrivilegedRole(filters.roles ?? filters.role)
          ? { OR: [{ assignedToId: null }, { assignedToId: filters.actorId }] }
          : {}),
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async getAlert(id: string, actorId?: string, roles?: AuthorizationRoles) {
    const alert = await this.prisma.enterpriseAlert.findUniqueOrThrow({ where: { id } });
    if (alert.assignedToId && actorId && !this.hasPrivilegedRole(roles) && alert.assignedToId !== actorId) {
      throw new ForbiddenException('This alert is not assigned to the current user.');
    }
    return alert;
  }

  async listTasks(filters: { status?: string; domain?: string; actorId?: string; roles?: AuthorizationRoles; role?: string } = {}) {
    return this.prisma.automationTask.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.domain ? { domain: filters.domain } : {}),
        ...(filters.actorId && !this.hasPrivilegedRole(filters.roles ?? filters.role)
          ? { OR: [{ assignedToId: null }, { assignedToId: filters.actorId }] }
          : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async acknowledgeAlert(alertId: string, actorId: string) {
    const alert = await this.prisma.enterpriseAlert.findUniqueOrThrow({ where: { id: alertId } });
    if (alert.status === AlertStatus.RESOLVED || alert.status === AlertStatus.DISMISSED) {
      throw new ConflictException({ code: 'INVALID_ALERT_TRANSITION', message: `Alert is already ${alert.status.toLowerCase()}.` });
    }
    if (alert.status === AlertStatus.ACKNOWLEDGED) return alert;
    const updated = await this.prisma.enterpriseAlert.update({
      where: { id: alertId }, data: { status: AlertStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'UPDATE', targetTable: 'enterprise_alerts', targetId: alertId, oldValues: { status: alert.status }, newValues: { status: updated.status } },
    });
    return updated;
  }

  async resolveAlert(alertId: string, actorId: string, roles: AuthorizationRoles) {
    const alert = await this.prisma.enterpriseAlert.findUniqueOrThrow({ where: { id: alertId } });
    this.assertAlertActorCanAct(alert.assignedToId, actorId, roles);
    if (alert.status === AlertStatus.RESOLVED) return alert;
    if (alert.status === AlertStatus.DISMISSED) throw new ConflictException({ code: 'INVALID_ALERT_TRANSITION', message: 'Dismissed alerts cannot be resolved.' });
    const updated = await this.prisma.enterpriseAlert.update({ where: { id: alertId }, data: { status: AlertStatus.RESOLVED, resolvedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'UPDATE', targetTable: 'enterprise_alerts', targetId: alertId, oldValues: { status: alert.status }, newValues: { status: updated.status } },
    });
    return updated;
  }

  async dismissAlert(alertId: string, actorId: string, roles: AuthorizationRoles) {
    const alert = await this.prisma.enterpriseAlert.findUniqueOrThrow({ where: { id: alertId } });
    this.assertAlertActorCanAct(alert.assignedToId, actorId, roles);
    if (alert.status === AlertStatus.DISMISSED) return alert;
    if (alert.status === AlertStatus.RESOLVED) throw new ConflictException({ code: 'INVALID_ALERT_TRANSITION', message: 'Resolved alerts cannot be dismissed.' });
    const updated = await this.prisma.enterpriseAlert.update({ where: { id: alertId }, data: { status: AlertStatus.DISMISSED, resolvedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'UPDATE', targetTable: 'enterprise_alerts', targetId: alertId, oldValues: { status: alert.status }, newValues: { status: updated.status } },
    });
    return updated;
  }

  async claimTask(taskId: string, actorId: string) {
    const task = await this.prisma.automationTask.findUniqueOrThrow({ where: { id: taskId } });
    if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new ConflictException({ code: 'INVALID_TASK_TRANSITION', message: `Task is already ${task.status.toLowerCase()}.` });
    if (task.assignedToId && task.assignedToId !== actorId) throw new ForbiddenException('This task is assigned to another staff member.');
    if (task.assignedToId === actorId && task.status === 'IN_PROGRESS') return task;

    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.automationTask.updateMany({
        where: { id: taskId, assignedToId: null, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        data: { assignedToId: actorId, status: 'IN_PROGRESS' },
      });
      if (result.count !== 1) throw new ConflictException({ code: 'TASK_ALREADY_CLAIMED', message: 'The task was claimed by another staff member.' });
      return tx.automationTask.findUniqueOrThrow({ where: { id: taskId } });
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'UPDATE', targetTable: 'automation_tasks', targetId: taskId, oldValues: { assignedToId: null, status: task.status }, newValues: { assignedToId: actorId, status: claimed.status } },
    });
    return claimed;
  }

  async assignTask(taskId: string, assigneeId: string, actorId: string, roles: AuthorizationRoles) {
    this.assertPrivilegedOperator(roles);
    const [task, assignee] = await Promise.all([
      this.prisma.automationTask.findUniqueOrThrow({ where: { id: taskId } }),
      this.prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true, isActive: true } }),
    ]);
    if (!assignee?.isActive) throw new BadRequestException('Assignee must be an active user.');
    if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new ConflictException('Completed or cancelled tasks cannot be reassigned.');
    const updated = await this.prisma.automationTask.update({ where: { id: taskId }, data: { assignedToId: assigneeId, status: 'IN_PROGRESS' } });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'UPDATE', targetTable: 'automation_tasks', targetId: taskId, oldValues: { assignedToId: task.assignedToId, status: task.status }, newValues: { assignedToId: assigneeId, status: updated.status } },
    });
    return updated;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, actorId: string, roles: AuthorizationRoles, note?: string) {
    const task = await this.prisma.automationTask.findUniqueOrThrow({ where: { id: taskId } });
    if (task.status === status) return task;
    const privileged = this.hasPrivilegedRole(roles);
    if (!privileged && task.assignedToId !== actorId) throw new ForbiddenException('Only the assigned operator can update this task.');
    const transitions: Record<string, string[]> = {
      OPEN: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['OPEN', 'COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [],
    };
    if (!transitions[task.status]?.includes(status)) throw new ConflictException({ code: 'INVALID_TASK_TRANSITION', message: `Cannot transition task from ${task.status} to ${status}.` });
    const updated = await this.prisma.automationTask.update({ where: { id: taskId }, data: { status, completedAt: status === 'COMPLETED' ? new Date() : null } });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'UPDATE', targetTable: 'automation_tasks', targetId: taskId, oldValues: { status: task.status }, newValues: { status: updated.status, note: note ?? null } },
    });
    return updated;
  }

  private assertPrivilegedOperator(roles: AuthorizationRoles) {
    if (!this.hasPrivilegedRole(roles)) throw new ForbiddenException('Only privileged operators may assign tasks.');
  }

  private assertAlertActorCanAct(assignedToId: string | null, actorId: string, roles: AuthorizationRoles) {
    if (assignedToId && assignedToId !== actorId && !this.hasPrivilegedRole(roles)) throw new ForbiddenException('This alert is assigned to another staff member.');
  }

  private hasPrivilegedRole(roles?: AuthorizationRoles): boolean {
    const normalized = Array.isArray(roles) ? roles : roles ? [roles] : [];
    return normalized.some((role) => ['SUPER_ADMIN', 'VC', 'REGISTRAR'].includes(role));
  }

}
