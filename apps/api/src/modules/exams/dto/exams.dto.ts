import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsInt, IsOptional,
  IsString, IsUUID, Length, Max, Min, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSemesterDto {
  @ApiProperty({ example: '2025/2026' }) @IsString() @Length(9,9) academicYear: string;
  @ApiProperty({ minimum: 1, maximum: 2 }) @IsInt() @Min(1) @Max(2) semesterNumber: number;
  @ApiProperty({ example: 'First Semester 2025/2026' }) @IsString() @Length(3,100) name: string;
  @ApiProperty() @IsDateString() enrollmentStartDate: string;
  @ApiProperty() @IsDateString() enrollmentEndDate: string;
  @ApiProperty() @IsDateString() classStartDate: string;
  @ApiProperty() @IsDateString() classEndDate: string;
  @ApiProperty() @IsDateString() examStartDate: string;
  @ApiProperty() @IsDateString() examEndDate: string;
  @ApiProperty({ description: 'Lecturers must submit results by this date' }) @IsDateString() resultDeadline: string;
}

export class CreateExamTimetableDto {
  @ApiProperty() @IsUUID('4') courseOfferingId: string;
  @ApiProperty() @IsUUID('4') semesterId: string;
  @ApiPropertyOptional({ description: 'Legacy venue text; new timetables use venueId.' }) @IsOptional() @IsString() @Length(2,200) venue?: string;
  @ApiProperty() @IsUUID('4') venueId: string;
  @ApiProperty({ example: '2025-11-20' }) @IsDateString() examDate: string;
  @ApiProperty({ example: '09:00', description: 'HH:MM' }) @IsString() @Length(5,5) startTime: string;
  @ApiProperty({ example: 120, description: 'Duration in minutes' }) @IsInt() @Min(30) @Max(360) durationMinutes: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,500) invigilatorNotes?: string;
}

export class UpdateExamTimetableDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') venueId?: string;
  @ApiPropertyOptional({ example: '2025-11-20' }) @IsOptional() @IsDateString() examDate?: string;
  @ApiPropertyOptional({ example: '09:00' }) @IsOptional() @IsString() @Length(5, 5) startTime?: string;
  @ApiPropertyOptional({ minimum: 30, maximum: 360 }) @IsOptional() @IsInt() @Min(30) @Max(360) durationMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) invigilatorNotes?: string;
}

export class RecordAttendanceDto {
  @ApiProperty() @IsUUID('4') studentId: string;
  @ApiProperty() @IsUUID('4') courseOfferingId: string;
  @ApiProperty() @IsUUID('4') semesterId: string;
  @ApiProperty({ example: '2025-10-15' }) @IsString() date: string;
  @ApiProperty() @IsBoolean() present: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,200) remark?: string;
}

export class BulkAttendanceDto {
  @ApiProperty({ type: () => [RecordAttendanceDto] })
  records: RecordAttendanceDto[];
}

export class ExamAttendanceInputDto {
  @ApiProperty() @IsUUID('4') studentId: string;
  @ApiProperty({ example: 'PRESENT' }) @IsString() @Length(2, 30) status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) incidentNote?: string;
}

export class BulkExamAttendanceDto {
  @ApiProperty({ type: () => [ExamAttendanceInputDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExamAttendanceInputDto)
  records: ExamAttendanceInputDto[];
}


export class RecordExamMarkDto {
  @ApiProperty() @IsUUID('4') studentId: string;
  @ApiProperty() @IsUUID('4') componentId: string;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) score: number;
}
