import {
  IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator';
import { ReportFormat, ReportType } from '@prisma/client';

// ── Async report generation ───────────────────────────────────────────────────
export class GenerateReportDto {
  @IsEnum(ReportType)                 reportType: ReportType;
  @IsEnum(ReportFormat)               reportFormat: ReportFormat;
  @IsOptional() @IsDateString()       dateFrom?: string;
  @IsOptional() @IsDateString()       dateTo?: string;
  @IsOptional() @IsUUID('4')          departmentId?: string;
  @IsOptional() @IsUUID('4')          facultyId?: string;
  @IsOptional() @IsUUID('4')          programmeId?: string;
  @IsOptional() @IsString()           academicYear?: string;
  @IsOptional() @IsString()           semester?: string;
}

// ── Live KPI dashboard query ──────────────────────────────────────────────────
export class AnalyticsQueryDto {
  @IsOptional() @IsString()     academicYear?: string;
  @IsOptional() @IsUUID('4')    departmentId?: string;
}

// ── Audit log query ───────────────────────────────────────────────────────────
export class AuditLogQueryDto {
  @IsOptional() @IsUUID('4')    actorId?: string;
  @IsOptional() @IsString()     action?: string;
  @IsOptional() @IsString()     targetTable?: string;
  @IsOptional() @IsUUID('4')    targetId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) pageSize?: number;
}

// ── Enrolment report query ────────────────────────────────────────────────────
export class EnrolmentQueryDto {
  @IsOptional() @IsString()   academicYear?: string;
  @IsOptional() @IsUUID('4')  programmeId?: string;
  @IsOptional() @IsUUID('4')  departmentId?: string;
  @IsOptional() @IsUUID('4')  facultyId?: string;
  @IsOptional() @IsInt() @Min(100) @Max(800) level?: number;
}

// ── Revenue report query ──────────────────────────────────────────────────────
export class RevenueQueryDto {
  @IsOptional() @IsString()   academicYear?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString()   gateway?: string;
  @IsOptional() @IsUUID('4')  programmeId?: string;
}

// ── CGPA distribution query ───────────────────────────────────────────────────
export class CgpaDistributionQueryDto {
  @IsOptional() @IsUUID('4')  departmentId?: string;
  @IsOptional() @IsUUID('4')  facultyId?: string;
  @IsOptional() @IsString()   academicYear?: string;
}

// ── Results statistics query ──────────────────────────────────────────────────
export class ResultsStatsQueryDto {
  @IsOptional() @IsUUID('4')  departmentId?: string;
  @IsOptional() @IsString()   academicYear?: string;
  @IsOptional() @IsString()   semester?: string;
  @IsOptional() @IsUUID('4')  courseOfferingId?: string;
}
