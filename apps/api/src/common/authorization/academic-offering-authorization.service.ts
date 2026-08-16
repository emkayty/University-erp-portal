import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export type AcademicActorRole = 'STAFF' | 'HOD' | 'DEAN' | 'REGISTRAR' | 'SUPER_ADMIN' | string;

/**
 * Shared authorization policy for high-integrity academic operations.
 *
 * A generic staff role is not sufficient to write marks or exam attendance:
 * STAFF must be the offering lecturer or an assigned invigilator for an exam;
 * HOD and DEAN must own the offering's department/faculty; Registrar and
 * SUPER_ADMIN are explicit institutional overrides.
 */
@Injectable()
export class AcademicOfferingAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOfferingAccess(
    courseOfferingId: string,
    actorId: string,
    role: AcademicActorRole,
    examTimetableId?: string,
  ): Promise<void> {
    if (role === 'REGISTRAR' || role === 'SUPER_ADMIN') return;

    const offering = await this.prisma.courseOffering.findUnique({
      where: { id: courseOfferingId },
      select: {
        id: true,
        lecturer: { select: { userId: true } },
        course: {
          select: {
            department: {
              select: {
                hod: { select: { userId: true } },
                faculty: { select: { dean: { select: { userId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!offering) throw new NotFoundException('Course offering was not found.');

    const assignments = examTimetableId
      ? await this.prisma.examInvigilator.findMany({ where: { examTimetableId }, select: { staff: { select: { userId: true } } } })
      : [];
    const examInvigilatorUserIds = assignments.map((assignment) => assignment.staff.userId);
    const allowed = role === 'STAFF'
      ? offering.lecturer?.userId === actorId || examInvigilatorUserIds.includes(actorId)
      : role === 'HOD'
        ? offering.course.department.hod?.userId === actorId
        : role === 'DEAN'
          ? offering.course.department.faculty.dean?.userId === actorId
          : false;

    if (!allowed) {
      throw new ForbiddenException('You are not assigned or authorized for this academic offering.');
    }
  }
}
