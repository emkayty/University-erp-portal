import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LmsService } from './lms.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AcademicOfferingAuthorizationService } from '../../common/authorization/academic-offering-authorization.service';

describe('LmsService enrolment boundaries', () => {
  let service: LmsService;
  const prisma: any = {
    courseRegistration: { findFirst: jest.fn(), findMany: jest.fn() },
    courseOffering: { findUnique: jest.fn().mockResolvedValue({ id: 'offering-1', lecturer: { userId: 'staff-1' }, course: { department: { hod: null, faculty: { dean: null } } } }) },
    courseContent: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    student: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    lmsSubmission: { upsert: jest.fn(), create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    lmsProgress: { upsert: jest.fn(), findMany: jest.fn() },
    lmsDiscussionPost: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    quizQuestion: { create: jest.fn(), findMany: jest.fn() },
    quizAttempt: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    assessmentMark: { findUnique: jest.fn(), upsert: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
  };
    const audit = { log: jest.fn() };
  const storage = { presignPut: jest.fn(), presignPost: jest.fn(), presignGet: jest.fn(), verifyObject: jest.fn(), validateObjectKey: jest.fn() };
  const offeringAuthorization = {
    assertOfferingAccess: jest.fn(async (_offeringId: string, actorId: string, role: string) => {
      const offering = await prisma.courseOffering.findUnique({ where: { id: _offeringId } });
      if (role === 'REGISTRAR' || role === 'SUPER_ADMIN') return;
      const allowed = role === 'STAFF'
        ? offering?.lecturer?.userId === actorId
        : role === 'HOD'
          ? offering?.course?.department?.hod?.userId === actorId
          : role === 'DEAN'
            ? offering?.course?.department?.faculty?.dean?.userId === actorId
            : false;
      if (!allowed) throw new ForbiddenException('You are not assigned or authorized for this academic offering.');
    }),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    service = new LmsService(prisma as PrismaService, audit as unknown as AuditService, storage as any, offeringAuthorization as unknown as AcademicOfferingAuthorizationService);
  });

  it('rejects a student who is not registered for the offering', async () => {
    prisma.courseRegistration.findFirst.mockResolvedValue(null);
    await expect(service.getCourseContent('offering-1', true, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.courseContent.findMany).not.toHaveBeenCalled();
  });

  it('returns published content for an enrolled student', async () => {
    prisma.courseRegistration.findFirst.mockResolvedValue({ id: 'registration-1' });
    prisma.courseContent.findMany.mockResolvedValue([{ id: 'content-1', isPublished: true }]);
    await expect(service.getCourseContent('offering-1', true, 'user-1')).resolves.toEqual([{ id: 'content-1', isPublished: true }]);
    expect(prisma.courseContent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { courseOfferingId: 'offering-1', isPublished: true } }));
  });

  it('discovers only active registrations for a student', async () => {
    prisma.courseRegistration.findMany.mockResolvedValue([{ courseOffering: { id: 'offering-1', course: { code: 'CSC101', title: 'Computing' } } }]);
    await expect(service.getStudentCourseOfferings('user-1')).resolves.toEqual([{ id: 'offering-1', course: { code: 'CSC101', title: 'Computing' } }]);
    expect(prisma.courseRegistration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { student: { userId: 'user-1' }, status: { in: ['REGISTERED', 'COMPLETED'] } } }));
  });

  it('creates a new immutable submission attempt for the enrolled student', async () => {
    prisma.courseContent.findUnique.mockResolvedValue({ id: 'content-1', courseOfferingId: 'offering-1', contentType: 'ASSIGNMENT' });
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1' });
    prisma.lmsSubmission.findFirst.mockResolvedValue(null);
    prisma.lmsSubmission.create.mockResolvedValue({ id: 'submission-1', status: 'SUBMITTED', attemptNumber: 1 });
    await expect(service.submitAssignment({ contentId: 'content-1', responseText: 'answer' }, 'user-1')).resolves.toEqual({ id: 'submission-1', status: 'SUBMITTED', attemptNumber: 1 });
    expect(prisma.lmsSubmission.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contentId: 'content-1', studentId: 'student-1', attemptNumber: 1 }) }));
  });

  it('records progress and completion atomically through an upsert', async () => {
    prisma.courseContent.findUnique.mockResolvedValue({ id: 'content-1', courseOfferingId: 'offering-1' });
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1' });
    prisma.lmsProgress.upsert.mockResolvedValue({ id: 'progress-1', progressPct: 100 });
    await expect(service.updateProgress('content-1', { progressPct: 100 }, 'user-1')).resolves.toEqual({ id: 'progress-1', progressPct: 100 });
    expect(prisma.lmsProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { contentId_studentId: { contentId: 'content-1', studentId: 'student-1' } } }));
  });

  it('grades an existing submission and records audit evidence', async () => {
    prisma.lmsSubmission.findUnique.mockResolvedValue({ id: 'submission-1', studentId: 'student-1', content: { courseOfferingId: 'offering-1', assessmentComponent: null } });
    prisma.lmsSubmission.update.mockResolvedValue({ id: 'submission-1', status: 'GRADED', score: 85 });
    await expect(service.gradeSubmission('submission-1', { score: 85, feedback: 'Good Work' }, 'staff-1')).resolves.toEqual({ id: 'submission-1', status: 'GRADED', score: 85 });
    expect(audit.log).toHaveBeenCalled();
  });

  it('rejects grading when the linked assessment mark is finalized', async () => {
    prisma.lmsSubmission.findUnique.mockResolvedValue({
      id: 'submission-finalized',
      studentId: 'student-1',
      content: {
        courseOfferingId: 'offering-1',
        assessmentComponent: { id: 'component-1', maxScore: 100, scheme: { courseOfferingId: 'offering-1', status: 'ACTIVE' } },
      },
    });
    prisma.assessmentMark.findUnique.mockResolvedValue({ status: 'FINALIZED' });

    await expect(service.gradeSubmission('submission-finalized', { score: 85 }, 'staff-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.lmsSubmission.update).not.toHaveBeenCalled();
    expect(prisma.assessmentMark.upsert).not.toHaveBeenCalled();
  });

  it('rejects cross-offering discussion parents', async () => {
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1' });
    prisma.lmsDiscussionPost.findFirst.mockResolvedValue(null);
    await expect(service.createDiscussion({ courseOfferingId: 'offering-1', parentId: 'parent-2', body: 'Reply' }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('presigns an attachment only for enrolled assignment content', async () => {
    prisma.courseContent.findUnique.mockResolvedValue({ id: 'content-1', courseOfferingId: 'offering-1', contentType: 'ASSIGNMENT' });
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1' });
    storage.presignPost.mockResolvedValue({ key: 'lms/submissions/student-1/content-1/file.pdf', url: 'https://s3.test/upload', expiresAt: new Date(), method: 'POST', fields: {}, maxSizeBytes: 1000 });
    await expect(service.presignSubmissionAttachment({ contentId: 'content-1', attachmentName: 'file.pdf', attachmentMime: 'application/pdf', attachmentSize: 1000 }, 'user-1')).resolves.toEqual(expect.objectContaining({ key: 'lms/submissions/student-1/content-1/file.pdf', contentId: 'content-1' }));
    expect(storage.presignPost).toHaveBeenCalledWith(expect.stringMatching(/^lms\/submissions\/student-1\/content-1\//), 'application/pdf', 1000);
  });

  it('allows only the owner or authorized staff to obtain an attachment URL', async () => {
    prisma.lmsSubmission.findUnique.mockResolvedValue({ id: 'submission-1', studentId: 'student-1', attachmentKey: 'lms/submissions/student-1/content-1/file.pdf', attachmentName: 'file.pdf', attachmentMime: 'application/pdf', attachmentSize: 1000, content: { courseOfferingId: 'offering-1' }, student: { userId: 'user-1' } });
    storage.presignGet.mockResolvedValue({ key: 'lms/submissions/student-1/content-1/file.pdf', url: 'https://s3.test/download', expiresAt: new Date() });
    await expect(service.getSubmissionAttachment('submission-1', 'user-1', 'STUDENT')).resolves.toEqual(expect.objectContaining({ submissionId: 'submission-1', url: 'https://s3.test/download' }));
    await expect(service.getSubmissionAttachment('submission-1', 'other-user', 'STUDENT')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getSubmissionAttachment('submission-1', 'staff-1', 'STAFF')).resolves.toEqual(expect.objectContaining({ submissionId: 'submission-1' }));
  });

  it('rejects public or traversal-style attachment keys before persistence', async () => {
    prisma.courseContent.findUnique.mockResolvedValue({ id: 'content-1', courseOfferingId: 'offering-1', contentType: 'ASSIGNMENT' });
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1' });
    await expect(service.submitAssignment({ contentId: 'content-1', responseText: 'answer', attachmentKey: '../private/file.pdf' }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.submitAssignment({ contentId: 'content-1', responseText: 'answer', attachmentKey: 'https://example.test/file.pdf' }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lmsSubmission.upsert).not.toHaveBeenCalled();
  });

  it('verifies the uploaded object and requires complete attachment metadata before persistence', async () => {
    prisma.courseContent.findUnique.mockResolvedValue({ id: 'content-1', courseOfferingId: 'offering-1', contentType: 'ASSIGNMENT' });
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1' });
    prisma.lmsSubmission.findFirst.mockResolvedValue(null);
    prisma.lmsSubmission.create.mockResolvedValue({ id: 'submission-2', status: 'SUBMITTED' });
    storage.verifyObject.mockResolvedValue({ key: 'lms/submissions/student-1/content-1/file.pdf', sizeBytes: 1000, contentType: 'application/pdf' });
    await expect(service.submitAssignment({ contentId: 'content-1', responseText: 'answer', attachmentKey: 'lms/submissions/student-1/content-1/file.pdf', attachmentName: 'file.pdf', attachmentMime: 'application/pdf', attachmentSize: 1000 }, 'user-1')).resolves.toEqual({ id: 'submission-2', status: 'SUBMITTED' });
    expect(storage.verifyObject).toHaveBeenCalledWith('lms/submissions/student-1/content-1/file.pdf', 1000, 'application/pdf');
    await expect(service.submitAssignment({ contentId: 'content-1', responseText: 'answer', attachmentKey: 'lms/submissions/student-1/content-1/file.pdf' }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lmsSubmission.create).toHaveBeenCalledTimes(1);
  });

  it('requires quiz content and choice options when authoring a question', async () => {
    prisma.courseContent.findUnique.mockResolvedValue({ id: 'content-1', courseOfferingId: 'offering-1', contentType: 'ASSIGNMENT' });
    await expect(service.createQuizQuestion({ contentId: 'content-1', prompt: 'Q', questionType: 'SINGLE_CHOICE', points: 1 }, 'staff-1')).rejects.toBeInstanceOf(BadRequestException);
    prisma.courseContent.findUnique.mockResolvedValue({ id: 'quiz-1', courseOfferingId: 'offering-1', contentType: 'QUIZ' });
    await expect(service.createQuizQuestion({ contentId: 'quiz-1', prompt: 'Q', questionType: 'SINGLE_CHOICE', points: 1 }, 'staff-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('auto-grades objective quiz attempts and limits attempts to three', async () => {
    prisma.courseContent.findUnique.mockResolvedValue({ id: 'quiz-1', courseOfferingId: 'offering-1', contentType: 'QUIZ', availabilityStart: null, availabilityEnd: null, dueDate: null, allowLateSubmissions: false, maxAttempts: 3 });
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1' });
    prisma.quizQuestion.findMany.mockResolvedValue([{ id: 'question-1', points: 2, questionType: 'SINGLE_CHOICE', correctAnswer: 'A' }]);
    prisma.quizAttempt.count.mockResolvedValue(0);
    prisma.quizAttempt.create.mockResolvedValue({ id: 'attempt-1', attemptNumber: 1, maxScore: 2 });
    await expect(service.startQuizAttempt('quiz-1', 'user-1')).resolves.toEqual({ id: 'attempt-1', attemptNumber: 1, maxScore: 2 });
    prisma.quizAttempt.findUnique.mockResolvedValue({ id: 'attempt-1', contentId: 'quiz-1', studentId: 'student-1', status: 'IN_PROGRESS', maxScore: 2, submittedLate: false, content: { availabilityEnd: null, dueDate: null, allowLateSubmissions: false } });
    prisma.quizAttempt.update.mockResolvedValue({ id: 'attempt-1', status: 'GRADED', score: 2 });
    await expect(service.submitQuizAttempt('attempt-1', { answers: { 'question-1': 'A' } }, 'user-1')).resolves.toEqual({ id: 'attempt-1', status: 'GRADED', score: 2 });
    prisma.quizAttempt.count.mockResolvedValue(3);
    await expect(service.startQuizAttempt('quiz-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('leaves short-answer attempts for manual grading and records instructor feedback', async () => {
    prisma.quizAttempt.findUnique
      .mockResolvedValueOnce({ id: 'attempt-2', contentId: 'quiz-1', studentId: 'student-1', status: 'IN_PROGRESS', maxScore: 5, submittedLate: false, content: { courseOfferingId: 'offering-1', availabilityEnd: null, dueDate: null, allowLateSubmissions: false } })
      .mockResolvedValueOnce({ id: 'attempt-2', maxScore: 5, status: 'SUBMITTED', content: { courseOfferingId: 'offering-1' } });
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1' });
    prisma.quizQuestion.findMany.mockResolvedValue([{ id: 'question-2', points: 5, questionType: 'SHORT_ANSWER', correctAnswer: null }]);
    prisma.quizAttempt.update
      .mockResolvedValueOnce({ id: 'attempt-2', status: 'SUBMITTED' })
      .mockResolvedValueOnce({ id: 'attempt-2', status: 'GRADED', score: 4, feedback: 'Good' });
    await expect(service.submitQuizAttempt('attempt-2', { answers: { 'question-2': 'response' } }, 'user-1')).resolves.toEqual({ id: 'attempt-2', status: 'SUBMITTED' });
    await expect(service.gradeQuizAttempt('attempt-2', { score: 4, feedback: 'Good' }, 'staff-1')).resolves.toEqual({ id: 'attempt-2', status: 'GRADED', score: 4, feedback: 'Good' });
  });

  it('enforces lecturer, department, faculty, and institution LMS authority through public staff operations', async () => {
    prisma.courseContent.findMany.mockResolvedValue([]);
    const offering = {
      id: 'offering-1',
      lecturer: { userId: 'lecturer-a' },
      course: { department: { hod: { userId: 'hod-a' }, faculty: { dean: { userId: 'dean-a' } } } },
    };
    prisma.courseOffering.findUnique.mockResolvedValue(offering);

    await expect(service.getCourseContent('offering-1', true, undefined, 'lecturer-a', 'STAFF')).resolves.toEqual([]);
    await expect(service.getCourseContent('offering-1', true, undefined, 'lecturer-b', 'STAFF')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getCourseContent('offering-1', true, undefined, 'hod-a', 'HOD')).resolves.toEqual([]);
    await expect(service.getCourseContent('offering-1', true, undefined, 'hod-b', 'HOD')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getCourseContent('offering-1', true, undefined, 'dean-a', 'DEAN')).resolves.toEqual([]);
    await expect(service.getCourseContent('offering-1', true, undefined, 'dean-b', 'DEAN')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getCourseContent('offering-1', true, undefined, 'registrar-a', 'REGISTRAR')).resolves.toEqual([]);
    await expect(service.getCourseContent('offering-1', true, undefined, 'admin-a', 'SUPER_ADMIN')).resolves.toEqual([]);
    expect(prisma.courseContent.findMany).toHaveBeenCalledTimes(5);
  });

  it('makes completed registrations read-only while retaining LMS content visibility', async () => {
    prisma.courseRegistration.findFirst.mockResolvedValue({ studentId: 'student-1', status: 'COMPLETED' });
    prisma.courseContent.findMany.mockResolvedValue([{ id: 'content-1', isPublished: true }]);
    await expect(service.getCourseContent('offering-1', true, 'user-1')).resolves.toEqual([{ id: 'content-1', isPublished: true }]);

    prisma.courseContent.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'quiz-1') return { id: 'quiz-1', courseOfferingId: 'offering-1', contentType: 'QUIZ', availabilityStart: null, availabilityEnd: null, dueDate: null, allowLateSubmissions: false, maxAttempts: 1 };
      return { id: 'content-1', courseOfferingId: 'offering-1', contentType: 'ASSIGNMENT', availabilityStart: null, availabilityEnd: null, dueDate: null, allowLateSubmissions: false, maxAttempts: 1 };
    });
    await expect(service.submitAssignment({ contentId: 'content-1', responseText: 'late work' }, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.startQuizAttempt('quiz-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateProgress('content-1', { progressPct: 50 }, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createDiscussion({ courseOfferingId: 'offering-1', body: 'post' }, 'user-1', 'STUDENT')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
