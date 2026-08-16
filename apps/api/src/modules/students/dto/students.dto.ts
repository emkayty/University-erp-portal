import {
  IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional,
  IsString, IsUUID, Length, Max, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum StudentStatusEnum {
  ACTIVE='ACTIVE', SUSPENDED='SUSPENDED', WITHDRAWN='WITHDRAWN',
  GRADUATED='GRADUATED', DEFERRED='DEFERRED', REPEATING='REPEATING',
}
enum ModeOfStudyEnum { FULL_TIME='FULL_TIME', PART_TIME='PART_TIME', DISTANCE='DISTANCE', SANDWICH='SANDWICH' }

export class MatriculateDto {
  @ApiProperty({ description: 'Applicant ID to matriculate into a student record' })
  @IsUUID('4') applicantId: string;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @IsInt() @Min(100) @Max(800) entryLevel?: number;
  @ApiPropertyOptional({ description: 'Temporary password — secure random generated if omitted' })
  @IsOptional() @IsString() @Length(12, 128) temporaryPassword?: string;
}

export class RegisterCoursesDto {
  @ApiProperty({ type: [String], description: 'Array of CourseOffering UUIDs to register' })
  @IsArray() @IsUUID('4', { each: true }) courseOfferingIds: string[];
  @ApiProperty() @IsUUID('4') semesterId: string;
}

export class DropCourseDto {
  @ApiProperty() @IsUUID('4') courseOfferingId: string;
}

export class UpdateStudentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 15) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() permanentAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(ModeOfStudyEnum) modeOfStudy?: ModeOfStudyEnum;
}

export class UpdateStudentStatusDto {
  @ApiProperty({ enum: ['SUSPENDED','WITHDRAWN','DEFERRED','REINSTATED'] })
  @IsEnum(['SUSPENDED','WITHDRAWN','DEFERRED','REINSTATED']) action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10, 500) reason?: string;
}
