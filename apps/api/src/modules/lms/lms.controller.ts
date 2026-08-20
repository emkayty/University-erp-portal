import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '@uniportal/types';
import { CurrentUser, FeatureFlag, Roles, SkipRequestRlsTransaction } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateAnnouncementDto, CreateAttachmentPresignDto, CreateContentDto, CreateDiscussionPostDto, CreateLtiConfigDto, CreateQuizQuestionDto, CreateSubmissionDto, GradeQuizAttemptDto, GradeSubmissionDto, SubmitQuizAttemptDto, UpdateProgressDto } from './dto/lms.dto';
import { LmsService } from './lms.service';

// AUDIT-H1 fix: every other optional module (research/alumni/clinic/
// transport) is gated by @FeatureFlag; this one wasn't, despite spec §14.4
// defaulting module_lms to false. Endpoints were fully live regardless.
@ApiTags('LMS')
@FeatureFlag('module_lms')
@Controller({ path: 'lms', version: '1' })
@UseGuards(RolesGuard)
@ApiBearerAuth('access-token')
export class LmsController {
  constructor(private readonly svc: LmsService) {}

  @Post('content') @Roles('STAFF','HOD','DEAN','SUPER_ADMIN') async addContent(@Body() dto: CreateContentDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.addContent(dto, u.sub, u.role) }; }
  @Patch('content/:id/publish') @Roles('STAFF','HOD','SUPER_ADMIN') async publishContent(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.publishContent(id, u.sub, u.role) }; }
  @Get('my-courses') @Roles('STUDENT') async myCourses(@CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.getStudentCourseOfferings(u.sub) }; }
  @Get('content/:courseOfferingId') @Roles('STUDENT','STAFF','HOD','DEAN','SUPER_ADMIN') async getContent(@Param('courseOfferingId', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) { const student = u.role === 'STUDENT'; return { success: true, data: await this.svc.getCourseContent(id, student, student ? u.sub : undefined, student ? undefined : u.sub, u.role) }; }
  @Post('announcements') @Roles('STAFF','HOD','DEAN','SUPER_ADMIN') async postAnnouncement(@Body() dto: CreateAnnouncementDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.postAnnouncement(dto, u.sub, u.role) }; }
  @Get('announcements/:courseOfferingId') @Roles('STUDENT','STAFF','HOD','DEAN','SUPER_ADMIN') async getAnnouncements(@Param('courseOfferingId', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.getAnnouncements(id, u.role === 'STUDENT' ? u.sub : undefined, u.role === 'STUDENT' ? undefined : u.sub, u.role) }; }
  @Post('quizzes/questions') @Roles('STAFF','HOD','DEAN','SUPER_ADMIN') async createQuizQuestion(@Body() dto: CreateQuizQuestionDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.createQuizQuestion(dto, u.sub, u.role) }; }
  @Get('quizzes/:contentId/questions') @Roles('STUDENT','STAFF','HOD','DEAN','SUPER_ADMIN') async getQuizQuestions(@Param('contentId', ParseUUIDPipe) contentId: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.getQuizQuestions(contentId, u.role === 'STUDENT' ? u.sub : undefined, u.role === 'STUDENT' ? undefined : u.sub, u.role) }; }
  @Post('quizzes/:contentId/attempts') @Roles('STUDENT') async startQuizAttempt(@Param('contentId', ParseUUIDPipe) contentId: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.startQuizAttempt(contentId, u.sub) }; }
  @Post('quizzes/attempts/:id/submit') @Roles('STUDENT') async submitQuizAttempt(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitQuizAttemptDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.submitQuizAttempt(id, dto, u.sub) }; }
  @Get('quizzes/attempts/my') @Roles('STUDENT') async myQuizAttempts(@CurrentUser() u: JwtPayload, @Query('courseOfferingId') courseOfferingId?: string) { return { success: true, data: await this.svc.getMyQuizAttempts(u.sub, courseOfferingId) }; }
  @Get('quizzes/attempts/content/:contentId') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') async quizAttemptsForMarking(@Param('contentId', ParseUUIDPipe) contentId: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.getQuizAttemptsForMarking(contentId, u.sub, u.role) }; }
  @Patch('quizzes/attempts/:id/grade') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') async gradeQuizAttempt(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GradeQuizAttemptDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.gradeQuizAttempt(id, dto, u.sub, u.role) }; }
  @Post('submissions/attachments/presign') @SkipRequestRlsTransaction() @Roles('STUDENT') async presignAttachment(@Body() dto: CreateAttachmentPresignDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.presignSubmissionAttachment(dto, u.sub) }; }
  @Get('submissions/:id/attachment') @SkipRequestRlsTransaction() @Roles('STUDENT','STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') async getAttachment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.getSubmissionAttachment(id, u.sub, u.role) }; }
  @Post('submissions') @SkipRequestRlsTransaction() @Roles('STUDENT') async submit(@Body() dto: CreateSubmissionDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.submitAssignment(dto, u.sub) }; }
  @Get('submissions/my') @Roles('STUDENT') async mySubmissions(@CurrentUser() u: JwtPayload, @Query('courseOfferingId') courseOfferingId?: string) { return { success: true, data: await this.svc.getMySubmissions(u.sub, courseOfferingId) }; }
  @Get('submissions/content/:contentId') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') async submissionsForMarking(@Param('contentId', ParseUUIDPipe) contentId: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.getSubmissionsForMarking(contentId, u.sub, u.role) }; }
  @Patch('submissions/:id/grade') @Roles('STAFF','HOD','DEAN','REGISTRAR','SUPER_ADMIN') async grade(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GradeSubmissionDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.gradeSubmission(id, dto, u.sub, u.role) }; }
  @Patch('progress/:contentId') @Roles('STUDENT') async updateProgress(@Param('contentId', ParseUUIDPipe) contentId: string, @Body() dto: UpdateProgressDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.updateProgress(contentId, dto, u.sub) }; }
  @Get('progress/:courseOfferingId') @Roles('STUDENT') async myProgress(@Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.getMyProgress(courseOfferingId, u.sub) }; }
  @Post('discussions') @Roles('STUDENT','STAFF','HOD','DEAN','SUPER_ADMIN') async createDiscussion(@Body() dto: CreateDiscussionPostDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.createDiscussion(dto, u.sub, u.role) }; }
  @Get('discussions/:courseOfferingId') @Roles('STUDENT','STAFF','HOD','DEAN','SUPER_ADMIN') async listDiscussion(@Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.listDiscussion(courseOfferingId, u.role === 'STUDENT' ? u.sub : undefined, u.role === 'STUDENT' ? undefined : u.sub, u.role) }; }
  @Delete('discussions/:id') @Roles('STUDENT','STAFF','HOD','DEAN','SUPER_ADMIN') async deleteDiscussion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.deleteDiscussion(id, u.sub, u.role) }; }
  @Post('lti/config') @Roles('SUPER_ADMIN') @ApiOperation({ summary: '[SUPER_ADMIN] Configure LTI 1.3 platform integration (S6)' }) async saveLtiConfig(@Body() dto: CreateLtiConfigDto, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.saveLtiConfig(dto, u.sub) }; }
  @Get('lti/config') @Roles('SUPER_ADMIN','REGISTRAR') async getLtiConfig() { return { success: true, data: await this.svc.getActiveLtiConfig() }; }
  @Patch('lti/config/:id/activate') @Roles('SUPER_ADMIN') async activateLtiConfig(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: JwtPayload) { return { success: true, data: await this.svc.activateLtiConfig(id, u.sub) }; }
}
