import {
  IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional,
  IsString, IsUUID, Length, Max, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum DegreeTypeEnum {
  BSC = 'BSC', BA = 'BA', BENG = 'BENG', BTECH = 'BTECH',
  HND = 'HND', ND = 'ND', MASTERS = 'MASTERS', PHD = 'PHD',
  DIPLOMA = 'DIPLOMA', PGDIP = 'PGDIP', OTHER = 'OTHER',
}

enum CcmasCategoryEnum {
  CORE = 'CORE', ELECTIVE = 'ELECTIVE', GENERAL_STUDIES = 'GENERAL_STUDIES',
}

enum SemesterEnum { FIRST = 'FIRST', SECOND = 'SECOND', SUMMER = 'SUMMER' }

export enum CourseOfferingLifecycleEnum {
  PLANNED = 'PLANNED', PUBLISHED = 'PUBLISHED', REGISTRATION_OPEN = 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED = 'REGISTRATION_CLOSED', TEACHING = 'TEACHING', ASSESSMENT = 'ASSESSMENT',
  EXAMINATION = 'EXAMINATION', GRADING = 'GRADING', RESULTS_PENDING = 'RESULTS_PENDING',
  RESULTS_PUBLISHED = 'RESULTS_PUBLISHED', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED',
}

// ─── Faculty ──────────────────────────────────────────────────────────────────
export class CreateFacultyDto {
  @ApiProperty({ example: 'Faculty of Science' })
  @IsString() @Length(2, 200)
  name: string;

  @ApiProperty({ example: 'FSC' })
  @IsString() @Length(2, 10)
  code: string;
}

export class UpdateFacultyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

// ─── Department ───────────────────────────────────────────────────────────────
export class CreateDepartmentDto {
  @ApiProperty({ example: 'Computer Science' })
  @IsString() @Length(2, 200)
  name: string;

  @ApiProperty({ example: 'CSC' })
  @IsString() @Length(2, 10)
  code: string;

  @ApiProperty()
  @IsUUID('4')
  facultyId: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

// ─── Programme ────────────────────────────────────────────────────────────────
export class CreateProgrammeDto {
  @ApiProperty({ example: 'Bachelor of Science in Computer Science' })
  @IsString() @Length(2, 255)
  name: string;

  @ApiProperty({ example: 'CSC-BSC' })
  @IsString() @Length(2, 20)
  code: string;

  @ApiProperty()
  @IsUUID('4')
  departmentId: string;

  @ApiProperty({ enum: DegreeTypeEnum })
  @IsEnum(DegreeTypeEnum)
  degreeType: DegreeTypeEnum;

  @ApiProperty({ example: 4, minimum: 1, maximum: 7 })
  @IsInt() @Min(1) @Max(7)
  durationYears: number;

  @ApiPropertyOptional({ default: 120 })
  @IsOptional() @IsInt() @Min(60) @Max(300)
  minCreditUnits?: number;

  @ApiPropertyOptional({ default: 180 })
  @IsOptional() @IsInt() @Min(90) @Max(400)
  maxCreditUnits?: number;
}

export class UpdateProgrammeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 255) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(60) minCreditUnits?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(90) maxCreditUnits?: number;
}

// ─── Course ───────────────────────────────────────────────────────────────────
export class CreateCourseDto {
  @ApiProperty({ example: 'CSC301' })
  @IsString() @Length(2, 20)
  code: string;

  @ApiProperty({ example: 'Data Structures and Algorithms' })
  @IsString() @Length(2, 255)
  title: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 12 })
  @IsInt() @Min(1) @Max(12)
  creditUnits: number;

  @ApiProperty()
  @IsUUID('4')
  departmentId: string;

  @ApiProperty({ enum: CcmasCategoryEnum })
  @IsEnum(CcmasCategoryEnum)
  ccmasCategory: CcmasCategoryEnum;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @Length(0, 2000)
  description?: string;
}

export class UpdateCourseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 255) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(CcmasCategoryEnum) ccmasCategory?: CcmasCategoryEnum;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AddPrerequisiteDto {
  @ApiProperty({ description: 'ID of the course that must be passed first' })
  @IsUUID('4')
  prerequisiteId: string;

  @ApiPropertyOptional({ default: 'E', description: 'Minimum passing grade required' })
  @IsOptional() @IsString() @Length(1, 2)
  minGrade?: string;
}

// ─── Programme Course (curriculum mapping) ────────────────────────────────────
export class AddProgrammeCourseDto {
  @ApiProperty()
  @IsUUID('4')
  courseId: string;

  @ApiPropertyOptional({ description: 'Existing curriculum version; active version is used when omitted.' })
  @IsOptional() @IsUUID('4')
  curriculumVersionId?: string;

  @ApiProperty({ example: 300, minimum: 100, maximum: 800 })
  @IsInt() @Min(100) @Max(800)
  level: number;

  @ApiProperty({ enum: SemesterEnum })
  @IsEnum(SemesterEnum)
  semester: SemesterEnum;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isCompulsory?: boolean;

  @ApiPropertyOptional({ enum: CcmasCategoryEnum })
  @IsOptional() @IsEnum(CcmasCategoryEnum)
  ccmasCategory?: CcmasCategoryEnum;
}

// ─── Course Offering ──────────────────────────────────────────────────────────
export class TransitionCourseOfferingDto {
  @ApiProperty({ enum: CourseOfferingLifecycleEnum })
  @IsEnum(CourseOfferingLifecycleEnum)
  status: CourseOfferingLifecycleEnum;

  @ApiPropertyOptional({ description: 'Reason or operational note for the lifecycle transition.' })
  @IsOptional() @IsString() @Length(0, 500)
  reason?: string;
}

export class CreateCourseOfferingDto {
  @ApiProperty()
  @IsUUID('4')
  courseId: string;

  @ApiProperty()
  @IsUUID('4')
  academicCalendarId: string;

  @ApiProperty({ enum: SemesterEnum })
  @IsEnum(SemesterEnum)
  semester: SemesterEnum;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID('4')
  lecturerId?: string;

  @ApiPropertyOptional({ description: 'Optional curriculum version audience; omit for shared/institution-wide offerings.' })
  @IsOptional() @IsUUID('4')
  curriculumVersionId?: string;

  @ApiPropertyOptional({ example: 'A', description: 'Section identifier; allows multiple sections in one semester.' })
  @IsOptional() @IsString() @Length(1, 10)
  sectionCode?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1)
  maxStudents?: number;
}
