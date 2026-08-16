import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
enum ContentTypeEnum { SLIDE='SLIDE', VIDEO='VIDEO', DOCUMENT='DOCUMENT', LINK='LINK', ASSIGNMENT='ASSIGNMENT', QUIZ='QUIZ', RECORDING='RECORDING' }
enum QuizQuestionTypeEnum { SINGLE_CHOICE='SINGLE_CHOICE', MULTIPLE_CHOICE='MULTIPLE_CHOICE', TRUE_FALSE='TRUE_FALSE', SHORT_ANSWER='SHORT_ANSWER' }

export class CreateContentDto {
  @ApiProperty() @IsUUID('4') courseOfferingId: string;
  @ApiProperty() @IsString() @Length(1,200) title: string;
  @ApiProperty({ enum: ContentTypeEnum }) @IsEnum(ContentTypeEnum) contentType: ContentTypeEnum;
  @ApiPropertyOptional() @IsOptional() @IsString() url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) orderIndex?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() availabilityStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() availabilityEnd?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() allowLateSubmissions?: boolean;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100) latePenaltyPct?: number;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) maxAttempts?: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') assessmentComponentId?: string;
}

export class CreateAnnouncementDto {
  @ApiProperty() @IsUUID('4') courseOfferingId: string;
  @ApiProperty() @IsString() @Length(1,200) title: string;
  @ApiProperty() @IsString() @Length(1,10000) body: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() publish?: boolean;
}

export class CreateAttachmentPresignDto {
  @ApiProperty() @IsUUID('4') contentId: string;
  @ApiProperty() @IsString() @Length(1, 255) attachmentName: string;
  @ApiProperty() @IsString() @Matches(/^(application\/pdf|text\/plain|image\/(jpeg|png)|application\/zip)$/) attachmentMime: string;
  @ApiProperty({ maximum: 10485760 }) @IsInt() @Min(1) @Max(10485760) attachmentSize: number;
}

export class CreateSubmissionDto {
  @ApiProperty() @IsUUID('4') contentId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 20000) responseText?: string;
  @ApiPropertyOptional({ description: 'Opaque object-storage key; public URLs and path traversal are rejected.' }) @IsOptional() @IsString() @Length(1, 1000) @Matches(/^(?!\/)(?!.*\.\.)(?!.*:\/\/)[A-Za-z0-9_./-]+$/) attachmentKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 255) attachmentName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^(application\/pdf|text\/plain|image\/(jpeg|png)|application\/zip)$/) attachmentMime?: string;
  @ApiPropertyOptional({ maximum: 10485760 }) @IsOptional() @IsInt() @Min(1) @Max(10485760) attachmentSize?: number;
}

export class CreateQuizQuestionDto {
  @ApiProperty() @IsUUID('4') contentId: string;
  @ApiProperty() @IsString() @Length(1, 10000) prompt: string;
  @ApiProperty({ enum: QuizQuestionTypeEnum }) @IsEnum(QuizQuestionTypeEnum) questionType: QuizQuestionTypeEnum;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 500) correctAnswer?: string;
  @ApiProperty({ minimum: 1, maximum: 100 }) @IsInt() @Min(1) @Max(100) points: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) orderIndex?: number;
}

export class SubmitQuizAttemptDto {
  @ApiProperty({ description: 'Map of question UUID to answer string or string array.' }) @IsObject() answers: Record<string, string | string[]>;
}

export class GradeQuizAttemptDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) score: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 5000) feedback?: string;
}

export class GradeSubmissionDto {
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) score: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 5000) feedback?: string;
}

export class UpdateProgressDto {
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsInt() @Min(0) @Max(100) progressPct: number;
}

export class CreateDiscussionPostDto {
  @ApiProperty() @IsUUID('4') courseOfferingId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') contentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') parentId?: string;
  @ApiProperty() @IsString() @Length(1, 10000) body: string;
}

export class CreateLtiConfigDto {
  @ApiProperty({ example: 'Moodle' }) @IsString() @Length(2,100) platformName: string;
  @ApiProperty() @IsString() issuer: string;
  @ApiProperty() @IsString() authLoginUrl: string;
  @ApiProperty() @IsString() authTokenUrl: string;
  @ApiProperty() @IsString() jwksUrl: string;
  @ApiProperty() @IsString() clientId: string;
  @ApiProperty() @IsString() deploymentId: string;
}
