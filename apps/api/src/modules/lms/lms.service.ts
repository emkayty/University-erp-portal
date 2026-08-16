import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditAction, Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type { CreateAnnouncementDto, CreateAttachmentPresignDto, CreateContentDto, CreateDiscussionPostDto, CreateLtiConfigDto, CreateQuizQuestionDto, CreateSubmissionDto, GradeQuizAttemptDto, GradeSubmissionDto, SubmitQuizAttemptDto, UpdateProgressDto } from './dto/lms.dto';
import { PrivateObjectStorageService } from '../../common/storage/private-object-storage.service';
import { AcademicOfferingAuthorizationService } from '../../common/authorization/academic-offering-authorization.service';

@Injectable()
export class LmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: PrivateObjectStorageService,
    private readonly offeringAuthorization: AcademicOfferingAuthorizationService,
  ) {}

  // Course Content
  async addContent(dto: CreateContentDto, actorId: string, actorRole = 'STAFF') {
    await this.offeringAuthorization.assertOfferingAccess(dto.courseOfferingId, actorId, actorRole);
    const availabilityStart = dto.availabilityStart ? new Date(dto.availabilityStart) : null;
    const availabilityEnd = dto.availabilityEnd ? new Date(dto.availabilityEnd) : null;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if ([availabilityStart, availabilityEnd, dueDate].some((value) => value && Number.isNaN(value.getTime()))) {
      throw new BadRequestException('LMS availability and due dates must be valid timestamps');
    }
    if (availabilityStart && availabilityEnd && availabilityStart > availabilityEnd) {
      throw new BadRequestException('LMS availabilityStart must be before availabilityEnd');
    }
    if (dueDate && availabilityStart && dueDate < availabilityStart) {
      throw new BadRequestException('LMS dueDate cannot precede availabilityStart');
    }
    if (dueDate && availabilityEnd && dueDate > availabilityEnd) {
      throw new BadRequestException('LMS dueDate cannot exceed availabilityEnd; availabilityEnd is the absolute hard cutoff');
    }
    const content = await this.prisma.courseContent.create({
      data: {
        courseOfferingId: dto.courseOfferingId,
        title: dto.title, contentType: dto.contentType,
        url: dto.url ?? null, body: dto.body ?? null,
        orderIndex: dto.orderIndex ?? 0,
        availabilityStart,
        availabilityEnd,
        dueDate,
        allowLateSubmissions: dto.allowLateSubmissions ?? false,
        latePenaltyPct: dto.latePenaltyPct ?? null,
        maxAttempts: dto.maxAttempts ?? null,
        assessmentComponentId: dto.assessmentComponentId ?? null,
        isPublished: false, uploadedById: actorId,
      },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'course_contents', targetId: content.id, newValues: { title: dto.title, contentType: dto.contentType } }, actorId);
    return content;
  }

  async publishContent(id: string, actorId: string, actorRole = 'STAFF') {
    const contentScope = await this.prisma.courseContent.findUnique({ where: { id }, select: { courseOfferingId: true } });
    if (!contentScope) throw new NotFoundException('Learning content was not found.');
    await this.offeringAuthorization.assertOfferingAccess(contentScope.courseOfferingId, actorId, actorRole);
    const content = await this.prisma.courseContent.update({
      where: { id }, data: { isPublished: true, publishedAt: new Date() },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'course_contents', targetId: id, newValues: { isPublished: true } }, actorId);
    return content;
  }

  async getCourseContent(courseOfferingId: string, onlyPublished = true, requesterUserId?: string, actorId?: string, actorRole?: string) {
    if (requesterUserId) await this.assertStudentEnrolled(courseOfferingId, requesterUserId);
    else await this.offeringAuthorization.assertOfferingAccess(courseOfferingId, actorId ?? '', actorRole ?? 'STAFF');
    return this.prisma.courseContent.findMany({
      where: { courseOfferingId, ...(onlyPublished ? { isPublished: true } : {}) },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async getStudentCourseOfferings(userId: string) {
    const registrations = await this.prisma.courseRegistration.findMany({
      where: { student: { userId }, status: { in: ['REGISTERED', 'COMPLETED'] } },
      select: { courseOffering: { select: { id: true, course: { select: { code: true, title: true } }, semesterModel: { select: { id: true, name: true, academicYear: true } } } } },
      orderBy: { courseOffering: { course: { code: 'asc' } } },
    });
    return registrations.map((registration) => registration.courseOffering);
  }

  // Announcements
  async postAnnouncement(dto: CreateAnnouncementDto, actorId: string, actorRole = 'STAFF') {
    await this.offeringAuthorization.assertOfferingAccess(dto.courseOfferingId, actorId, actorRole);
    return this.prisma.courseAnnouncement.create({
      data: {
        courseOfferingId: dto.courseOfferingId,
        title: dto.title, body: dto.body,
        isPublished: dto.publish ?? false, postedById: actorId,
      },
    });
  }

  async getAnnouncements(courseOfferingId: string, requesterUserId?: string, actorId?: string, actorRole?: string) {
    if (requesterUserId) await this.assertStudentEnrolled(courseOfferingId, requesterUserId);
    else await this.offeringAuthorization.assertOfferingAccess(courseOfferingId, actorId ?? '', actorRole ?? 'STAFF');
    return this.prisma.courseAnnouncement.findMany({
      where: { courseOfferingId, isPublished: true },
      orderBy: { createdAt: 'desc' },
    });
  }


  private async assertStudentEnrolled(
    courseOfferingId: string,
    userId: string,
    action: 'VIEW' | 'SUBMIT' | 'QUIZ_ATTEMPT' | 'PROGRESS' | 'DISCUSS' = 'VIEW',
  ): Promise<string> {
    const registration = await this.prisma.courseRegistration.findFirst({
      where: { courseOfferingId, student: { userId }, status: { in: ['REGISTERED', 'COMPLETED'] } },
      select: { studentId: true, status: true },
    });
    if (!registration) throw new ForbiddenException('Students may only access learning content for registered course offerings.');
    if (registration.status === 'COMPLETED' && action !== 'VIEW') {
      throw new ForbiddenException('Completed registrations are read-only in the LMS.');
    }
    return registration.studentId;
  }

  async presignSubmissionAttachment(dto: CreateAttachmentPresignDto, userId: string) {
    const content = await this.prisma.courseContent.findUnique({ where: { id: dto.contentId }, select: { id: true, courseOfferingId: true, contentType: true } });
    if (!content) throw new NotFoundException('Learning content was not found.');
    if (!['ASSIGNMENT', 'QUIZ'].includes(content.contentType)) throw new BadRequestException('Attachments can only be uploaded for assignment and quiz content.');
    const studentId = await this.assertStudentEnrolled(content.courseOfferingId, userId, 'SUBMIT');
    const safeName = dto.attachmentName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
    const key = `lms/submissions/${studentId}/${content.id}/${randomUUID()}-${safeName}`;
    const signed = await this.storage.presignPost(key, dto.attachmentMime, dto.attachmentSize);
    return { ...signed, contentId: content.id, attachmentName: dto.attachmentName, attachmentMime: dto.attachmentMime, attachmentSize: dto.attachmentSize };
  }

  async getSubmissionAttachment(id: string, userId: string, role: string) {
    const submission = await this.prisma.lmsSubmission.findUnique({ where: { id }, select: { id: true, studentId: true, attachmentKey: true, attachmentName: true, attachmentMime: true, attachmentSize: true, content: { select: { courseOfferingId: true } }, student: { select: { userId: true } } } });
    if (!submission) throw new NotFoundException('Submission was not found.');
    const staff = ['STAFF', 'HOD', 'DEAN', 'REGISTRAR', 'SUPER_ADMIN'].includes(role);
    if (staff) await this.offeringAuthorization.assertOfferingAccess(submission.content.courseOfferingId, userId, role);
    if (!staff && submission.student.userId !== userId) throw new ForbiddenException('You may only access your own submission attachment.');
    if (!submission.attachmentKey) throw new NotFoundException('This submission has no attachment.');
    const signed = await this.storage.presignGet(submission.attachmentKey);
    return { ...signed, submissionId: submission.id, attachmentName: submission.attachmentName, attachmentMime: submission.attachmentMime, attachmentSize: submission.attachmentSize };
  }

  async submitAssignment(dto: CreateSubmissionDto, userId: string) {
    const content = await this.prisma.courseContent.findUnique({ where: { id: dto.contentId }, select: { id: true, courseOfferingId: true, contentType: true, availabilityStart: true, availabilityEnd: true, dueDate: true, allowLateSubmissions: true, maxAttempts: true } });
    if (!content) throw new NotFoundException('Learning content was not found.');
    if (!['ASSIGNMENT', 'QUIZ'].includes(content.contentType)) throw new BadRequestException('Only assignment and quiz content accepts submissions.');
    const studentId = await this.assertStudentEnrolled(content.courseOfferingId, userId, 'SUBMIT');
    const now = new Date();
    if (content.availabilityStart && now < content.availabilityStart) throw new BadRequestException('This learning activity is not yet available.');
    if (content.availabilityEnd && now > content.availabilityEnd) throw new BadRequestException('This learning activity is no longer available.');
    const submittedLate = Boolean(content.dueDate && now > content.dueDate);
    if (submittedLate && !content.allowLateSubmissions) throw new BadRequestException('The submission deadline has passed and late submissions are not allowed.');
    const expectedAttachmentPrefix = `lms/submissions/${studentId}/${content.id}/`;
    if (dto.attachmentKey && (!/^(?!\/)(?!.*\.\.)(?!.*:\/\/)[A-Za-z0-9_./-]+$/.test(dto.attachmentKey) || !dto.attachmentKey.startsWith(expectedAttachmentPrefix))) throw new BadRequestException('Attachment key must be a presigned key issued for this student and content.');
    const hasAttachmentMetadata = Boolean(dto.attachmentName || dto.attachmentMime || dto.attachmentSize);
    if (dto.attachmentKey && (!dto.attachmentName || !dto.attachmentMime || !dto.attachmentSize)) throw new BadRequestException('Attachment name, MIME type, and size are required with an attachment key.');
    if (!dto.attachmentKey && hasAttachmentMetadata) throw new BadRequestException('Attachment metadata cannot be submitted without an attachment key.');
    if (dto.attachmentKey) await this.storage.verifyObject(dto.attachmentKey, dto.attachmentSize!, dto.attachmentMime!);
    const submission = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId} || ':' || ${content.id}))`;
      const previous = await tx.lmsSubmission.findFirst({ where: { contentId: dto.contentId, studentId }, orderBy: { attemptNumber: 'desc' }, select: { attemptNumber: true } });
      const attemptNumber = (previous?.attemptNumber ?? 0) + 1;
      if (content.maxAttempts != null && attemptNumber > content.maxAttempts) throw new BadRequestException(`Maximum submission attempts (${content.maxAttempts}) exceeded.`);
      return tx.lmsSubmission.create({ data: { contentId: dto.contentId, studentId, attemptNumber, responseText: dto.responseText ?? null, fileUrl: null, attachmentKey: dto.attachmentKey ?? null, attachmentName: dto.attachmentName ?? null, attachmentMime: dto.attachmentMime ?? null, attachmentSize: dto.attachmentSize ?? null, submittedLate, status: 'SUBMITTED' } });
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'lms_submissions', targetId: submission.id, newValues: { contentId: dto.contentId, status: submission.status } }, userId);
    return submission;
  }

  async getMySubmissions(userId: string, courseOfferingId?: string) {
    const student = await this.prisma.student.findUnique({ where: { userId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student profile was not found.');
    return this.prisma.lmsSubmission.findMany({
      where: { studentId: student.id, ...(courseOfferingId ? { content: { courseOfferingId } } : {}) },
      include: { content: { select: { id: true, title: true, contentType: true, courseOfferingId: true } } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async getSubmissionsForMarking(contentId: string, actorId: string, actorRole = 'STAFF') {
    const content = await this.prisma.courseContent.findUnique({ where: { id: contentId }, select: { courseOfferingId: true } });
    if (!content) throw new NotFoundException('Learning content was not found.');
    await this.offeringAuthorization.assertOfferingAccess(content.courseOfferingId, actorId, actorRole);
    return this.prisma.lmsSubmission.findMany({
      where: { contentId },
      include: { student: { select: { id: true, matricNo: true, firstName: true, lastName: true } } },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async createQuizQuestion(dto: CreateQuizQuestionDto, actorId: string, actorRole = 'STAFF') {
    const content = await this.prisma.courseContent.findUnique({ where: { id: dto.contentId }, select: { id: true, courseOfferingId: true, contentType: true } });
    if (!content) throw new NotFoundException('Quiz content was not found.');
    await this.offeringAuthorization.assertOfferingAccess(content.courseOfferingId, actorId, actorRole);
    if (content.contentType !== 'QUIZ') throw new BadRequestException('Questions can only be created for QUIZ content.');
    if (dto.questionType !== 'SHORT_ANSWER' && !dto.correctAnswer) throw new BadRequestException('Objective questions require a correct answer.');
    if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(dto.questionType) && (!dto.options || dto.options.length < 2)) throw new BadRequestException('Choice questions require at least two options.');
    const question = await this.prisma.quizQuestion.create({ data: { contentId: dto.contentId, prompt: dto.prompt, questionType: dto.questionType, options: dto.options ?? Prisma.JsonNull, correctAnswer: dto.correctAnswer ?? null, points: dto.points, orderIndex: dto.orderIndex ?? 0 } });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'quiz_questions', targetId: question.id, newValues: { contentId: dto.contentId, questionType: dto.questionType, points: dto.points } }, actorId);
    return question;
  }

  async getQuizQuestions(contentId: string, requesterUserId?: string, actorId?: string, actorRole?: string) {
    const content = await this.prisma.courseContent.findUnique({ where: { id: contentId }, select: { id: true, courseOfferingId: true, contentType: true } });
    if (!content) throw new NotFoundException('Quiz content was not found.');
    if (content.contentType !== 'QUIZ') throw new BadRequestException('Questions can only be read for QUIZ content.');
    if (requesterUserId) await this.assertStudentEnrolled(content.courseOfferingId, requesterUserId);
    else await this.offeringAuthorization.assertOfferingAccess(content.courseOfferingId, actorId ?? '', actorRole ?? 'STAFF');
    const questions = await this.prisma.quizQuestion.findMany({ where: { contentId }, orderBy: { orderIndex: 'asc' } });
    if (!requesterUserId) return questions;
    return questions.map(({ correctAnswer: _correctAnswer, ...question }) => question);
  }

  async startQuizAttempt(contentId: string, userId: string) {
    const content = await this.prisma.courseContent.findUnique({ where: { id: contentId }, select: { id: true, courseOfferingId: true, contentType: true, availabilityStart: true, availabilityEnd: true, dueDate: true, allowLateSubmissions: true, maxAttempts: true } });
    if (!content) throw new NotFoundException('Quiz content was not found.');
    if (content.contentType !== 'QUIZ') throw new BadRequestException('Attempts can only be started for QUIZ content.');
    const studentId = await this.assertStudentEnrolled(content.courseOfferingId, userId, 'QUIZ_ATTEMPT');
    const now = new Date();
    if (content.availabilityStart && now < content.availabilityStart) throw new BadRequestException('This quiz is not yet available.');
    if (content.availabilityEnd && now > content.availabilityEnd) throw new BadRequestException('This quiz is no longer available.');
    const submittedLate = Boolean(content.dueDate && now > content.dueDate);
    if (submittedLate && !content.allowLateSubmissions) throw new BadRequestException('The quiz deadline has passed and late attempts are not allowed.');
    const questions = await this.prisma.quizQuestion.findMany({ where: { contentId }, select: { id: true, points: true } });
    if (!questions.length) throw new BadRequestException('This quiz has no questions yet.');
    const maxScore = questions.reduce((sum, question) => sum + question.points, 0);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId} || ':' || ${contentId}))`;
      const previousAttempts = await tx.quizAttempt.count({ where: { contentId, studentId } });
      const attemptNumber = previousAttempts + 1;
      if (content.maxAttempts != null && attemptNumber > content.maxAttempts) throw new BadRequestException(`Maximum quiz attempts (${content.maxAttempts}) exceeded.`);
      return tx.quizAttempt.create({ data: { contentId, studentId, attemptNumber, answers: {}, maxScore, submittedLate } });
    });
  }

  async submitQuizAttempt(id: string, dto: SubmitQuizAttemptDto, userId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id }, select: { id: true, contentId: true, studentId: true, status: true, maxScore: true, submittedLate: true, content: { select: { courseOfferingId: true, availabilityEnd: true, dueDate: true, allowLateSubmissions: true } } } });
    if (!attempt) throw new NotFoundException('Quiz attempt was not found.');
    if (attempt.status !== 'IN_PROGRESS') throw new BadRequestException('This quiz attempt has already been submitted.');
    const studentId = await this.assertStudentEnrolled(attempt.content.courseOfferingId, userId, 'SUBMIT');
    if (studentId !== attempt.studentId) throw new ForbiddenException('You may only submit your own quiz attempt.');
    const now = new Date();
    if (attempt.content.availabilityEnd && now > attempt.content.availabilityEnd) throw new BadRequestException('This quiz is no longer available.');
    const submittedLate = attempt.submittedLate || Boolean(attempt.content.dueDate && now > attempt.content.dueDate);
    if (submittedLate && !attempt.content.allowLateSubmissions) throw new BadRequestException('The quiz deadline has passed and late submissions are not allowed.');
    const questions = await this.prisma.quizQuestion.findMany({ where: { contentId: attempt.contentId }, select: { id: true, points: true, questionType: true, correctAnswer: true } });
    const questionIds = new Set(questions.map((question) => question.id));
    for (const questionId of Object.keys(dto.answers)) if (!questionIds.has(questionId)) throw new BadRequestException('The submission contains an unknown question.');
    let earned = 0;
    let requiresManualGrading = false;
    for (const question of questions) {
      if (question.questionType === 'SHORT_ANSWER') { requiresManualGrading = true; continue; }
      if (this.answersMatch(dto.answers[question.id], this.parseCorrectAnswer(question.correctAnswer))) earned += question.points;
    }
    return this.prisma.quizAttempt.update({ where: { id }, data: { answers: dto.answers as Prisma.InputJsonValue, status: requiresManualGrading ? 'SUBMITTED' : 'GRADED', score: requiresManualGrading ? null : earned, maxScore: attempt.maxScore, submittedLate, submittedAt: now, gradedAt: requiresManualGrading ? null : now } });
  }

  async getMyQuizAttempts(userId: string, courseOfferingId?: string) {
    const student = await this.prisma.student.findUnique({ where: { userId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student profile was not found.');
    return this.prisma.quizAttempt.findMany({ where: { studentId: student.id, ...(courseOfferingId ? { content: { courseOfferingId } } : {}) }, include: { content: { select: { id: true, title: true, courseOfferingId: true } } }, orderBy: { startedAt: 'desc' } });
  }

  async getQuizAttemptsForMarking(contentId: string, actorId: string, actorRole = 'STAFF') {
    const content = await this.prisma.courseContent.findUnique({ where: { id: contentId }, select: { courseOfferingId: true } });
    if (!content) throw new NotFoundException('Quiz content was not found.');
    await this.offeringAuthorization.assertOfferingAccess(content.courseOfferingId, actorId, actorRole);
    return this.prisma.quizAttempt.findMany({ where: { contentId }, include: { student: { select: { id: true, matricNo: true, firstName: true, lastName: true } } }, orderBy: { startedAt: 'asc' } });
  }

  async gradeQuizAttempt(id: string, dto: GradeQuizAttemptDto, actorId: string, actorRole = 'STAFF') {
    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id }, select: { id: true, maxScore: true, status: true, content: { select: { courseOfferingId: true } } } });
    if (!attempt) throw new NotFoundException('Quiz attempt was not found.');
    await this.offeringAuthorization.assertOfferingAccess(attempt.content.courseOfferingId, actorId, actorRole);
    if (attempt.status === 'GRADED') throw new BadRequestException('This quiz attempt has already been graded.');
    const maxScore = Number(attempt.maxScore ?? 0);
    if (dto.score > maxScore) throw new BadRequestException('Score cannot exceed the quiz maximum.');
    const updated = await this.prisma.quizAttempt.update({ where: { id }, data: { score: dto.score, maxScore, feedback: dto.feedback ?? null, status: 'GRADED', gradedAt: new Date() } });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'quiz_attempts', targetId: id, newValues: { score: dto.score, status: 'GRADED' } }, actorId);
    return updated;
  }

  private parseCorrectAnswer(value: string | null): unknown {
    if (!value) return '';
    try { return JSON.parse(value); } catch { return value; }
  }

  private answersMatch(actual: unknown, expected: unknown): boolean {
    const normalize = (value: unknown) => (Array.isArray(value) ? value : [value]).map((item) => String(item ?? '').trim().toLowerCase()).sort();
    return JSON.stringify(normalize(actual)) === JSON.stringify(normalize(expected));
  }

  async gradeSubmission(id: string, dto: GradeSubmissionDto, actorId: string, actorRole = 'STAFF') {
    const existing = await this.prisma.lmsSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        content: {
          select: {
            courseOfferingId: true,
            assessmentComponent: { select: { id: true, maxScore: true, scheme: { select: { courseOfferingId: true, status: true } } } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Submission was not found.');
    await this.offeringAuthorization.assertOfferingAccess(existing.content.courseOfferingId, actorId, actorRole);
    const component = existing.content.assessmentComponent;
    if (component) {
      if (component.scheme.courseOfferingId !== existing.content.courseOfferingId || component.scheme.status !== 'ACTIVE') throw new BadRequestException('The linked assessment component is not active for this course offering.');
      if (dto.score > Number(component.maxScore)) throw new BadRequestException(`Score cannot exceed ${component.maxScore}.`);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lmsSubmission.update({ where: { id }, data: { score: dto.score, feedback: dto.feedback ?? null, status: 'GRADED', gradedAt: new Date(), gradedById: actorId } });
      const assessmentMark = component ? await tx.assessmentMark.upsert({
        where: { uq_assessment_mark_student_component: { studentId: existing.studentId, componentId: component.id } },
        create: { studentId: existing.studentId, courseOfferingId: existing.content.courseOfferingId, componentId: component.id, score: dto.score, enteredById: actorId },
        update: { score: dto.score, enteredById: actorId, version: { increment: 1 } },
      }) : null;
      return { updated, assessmentMark };
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'lms_submissions', targetId: id, newValues: { status: result.updated.status, score: dto.score, assessmentMarkId: result.assessmentMark?.id ?? null } }, actorId);
    return result.updated;
  }

  async updateProgress(contentId: string, dto: UpdateProgressDto, userId: string) {
    const content = await this.prisma.courseContent.findUnique({ where: { id: contentId }, select: { id: true, courseOfferingId: true } });
    if (!content) throw new NotFoundException('Learning content was not found.');
    const studentId = await this.assertStudentEnrolled(content.courseOfferingId, userId, 'PROGRESS');
    const now = new Date();
    const progress = await this.prisma.lmsProgress.upsert({
      where: { contentId_studentId: { contentId, studentId } },
      create: { contentId, studentId, progressPct: dto.progressPct, firstViewedAt: now, lastViewedAt: now, completedAt: dto.progressPct === 100 ? now : null },
      update: { progressPct: dto.progressPct, lastViewedAt: now, completedAt: dto.progressPct === 100 ? now : null },
    });
    return progress;
  }

  async getMyProgress(courseOfferingId: string, userId: string) {
    await this.assertStudentEnrolled(courseOfferingId, userId);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { userId }, select: { id: true } });
    return this.prisma.lmsProgress.findMany({ where: { studentId: student.id, content: { courseOfferingId } }, include: { content: { select: { id: true, title: true, contentType: true } } }, orderBy: { content: { orderIndex: 'asc' } } });
  }

  async createDiscussion(dto: CreateDiscussionPostDto, userId: string, role = 'STUDENT') {
    if (role === 'STUDENT') await this.assertStudentEnrolled(dto.courseOfferingId, userId, 'DISCUSS');
    else await this.offeringAuthorization.assertOfferingAccess(dto.courseOfferingId, userId, role);
    if (dto.contentId) {
      const content = await this.prisma.courseContent.findFirst({ where: { id: dto.contentId, courseOfferingId: dto.courseOfferingId }, select: { id: true } });
      if (!content) throw new BadRequestException('Discussion content does not belong to the selected course offering.');
    }
    if (dto.parentId) {
      const parent = await this.prisma.lmsDiscussionPost.findFirst({ where: { id: dto.parentId, courseOfferingId: dto.courseOfferingId, isDeleted: false }, select: { id: true } });
      if (!parent) throw new BadRequestException('Discussion parent does not belong to the selected course offering.');
    }
    return this.prisma.lmsDiscussionPost.create({ data: { courseOfferingId: dto.courseOfferingId, contentId: dto.contentId ?? null, parentId: dto.parentId ?? null, authorId: userId, body: dto.body } });
  }

  async listDiscussion(courseOfferingId: string, userId?: string, actorId?: string, actorRole?: string) {
    if (userId) await this.assertStudentEnrolled(courseOfferingId, userId);
    else await this.offeringAuthorization.assertOfferingAccess(courseOfferingId, actorId ?? '', actorRole ?? 'STAFF');
    return this.prisma.lmsDiscussionPost.findMany({
      where: { courseOfferingId, parentId: null, isDeleted: false },
      include: { author: { select: { id: true, email: true } }, replies: { where: { isDeleted: false }, include: { author: { select: { id: true, email: true } } }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteDiscussion(id: string, userId: string, role: string) {
    const post = await this.prisma.lmsDiscussionPost.findUnique({ where: { id }, select: { id: true, authorId: true, courseOfferingId: true } });
    if (!post) throw new NotFoundException('Discussion post was not found.');
    if (role === 'STUDENT') {
      if (post.authorId !== userId) throw new ForbiddenException('You may only delete your own discussion posts.');
    } else {
      await this.offeringAuthorization.assertOfferingAccess(post.courseOfferingId, userId, role);
    }
    return this.prisma.lmsDiscussionPost.update({ where: { id }, data: { isDeleted: true, body: '[deleted]' } });
  }

  // LTI 1.3 Configuration
  async saveLtiConfig(dto: CreateLtiConfigDto, actorId: string) {
    const config = await this.prisma.ltiConfig.create({ data: { ...dto, isActive: false } });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'lti_configs', targetId: config.id, newValues: { platformName: dto.platformName } }, actorId);
    return config;
  }

  async getActiveLtiConfig() {
    return this.prisma.ltiConfig.findFirst({ where: { isActive: true } });
  }

  async activateLtiConfig(id: string, actorId: string) {
    await this.prisma.ltiConfig.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const config = await this.prisma.ltiConfig.update({ where: { id }, data: { isActive: true } });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'lti_configs', targetId: id, newValues: { isActive: true } }, actorId);
    return config;
  }
}
