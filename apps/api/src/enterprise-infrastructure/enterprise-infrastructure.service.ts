import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class EnterpriseInfrastructureService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkflowInstance(workflowCode: string, entityType: string, entityId: string, startedById?: string) {
    if (!workflowCode || !entityType || !entityId) {
      throw new BadRequestException('Workflow code, entity type and entity ID are required.');
    }
    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { code: workflowCode, active: true },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });
    if (!workflow) throw new BadRequestException('Active workflow definition not found.');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workflowInstance.findFirst({
        where: { workflowId: workflow.id, entityType, entityId, status: 'RUNNING' },
      });
      if (existing) return existing;

      const instance = await tx.workflowInstance.create({
        data: { workflowId: workflow.id, entityType, entityId, startedById },
      });

      if (workflow.steps.length) {
        await tx.workflowTask.createMany({
          data: workflow.steps.map((step) => ({
            instanceId: instance.id,
            stepId: step.id,
          })),
        });
      }
      return instance;
    });
  }

  async setNotificationPreference(userId: string, channel: any, enabled: boolean) {
    if (!userId) throw new BadRequestException('User ID is required.');
    return this.prisma.notificationPreference.upsert({
      where: { userId_channel: { userId, channel } },
      create: { userId, channel, enabled },
      update: { enabled },
    });
  }

  async queueNotification(input: {
    userId: string;
    channel: any;
    subject?: string;
    body: string;
    entityType?: string;
    entityId?: string;
  }) {
    if (!input.userId || !input.body) throw new BadRequestException('Recipient and body are required.');
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_channel: { userId: input.userId, channel: input.channel } },
    });
    if (pref?.enabled === false) return null;

    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        channel: input.channel,
        subject: input.subject,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  }

  async listNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        subject: true,
        body: true,
        status: true,
        createdAt: true,
        readAt: true,
      },
    });
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { status: 'READ', readAt: new Date() },
    });
    if (!result.count) throw new ForbiddenException('Notification not found or not accessible.');
    return { success: true };
  }
}
