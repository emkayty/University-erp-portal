import {
  IsDateString, IsEnum, IsNotEmpty, IsOptional,
  IsBoolean, IsString, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CalendarEventTypeEnum {
  REGISTRATION_OPEN  = 'REGISTRATION_OPEN',
  REGISTRATION_CLOSE = 'REGISTRATION_CLOSE',
  EXAM_START         = 'EXAM_START',
  EXAM_END           = 'EXAM_END',
  RESULT_RELEASE     = 'RESULT_RELEASE',
  GRADUATION         = 'GRADUATION',
  ORIENTATION        = 'ORIENTATION',
  HOLIDAY            = 'HOLIDAY',
  ADMINISTRATIVE     = 'ADMINISTRATIVE',
  OTHER              = 'OTHER',
}

export class CreateCalendarDto {
  @ApiProperty({ example: '2025/2026' })
  @IsString()
  @Length(9, 9, { message: 'Academic year must be in "YYYY/YYYY" format' })
  academicYear: string;

  @ApiProperty({ example: '2025-09-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-07-31' })
  @IsDateString()
  endDate: string;
}

export class SuspendCalendarDto {
  @ApiProperty({ description: 'Reason for suspension (ASUU strike, emergency, etc.)', minLength: 10 })
  @IsString()
  @Length(10, 500, { message: 'Suspension reason must be between 10 and 500 characters' })
  reason: string;
}

export class CreateCalendarEventDto {
  @ApiProperty({ example: 'First Semester Registration' })
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: CalendarEventTypeEnum })
  @IsEnum(CalendarEventTypeEnum)
  eventType: CalendarEventTypeEnum;

  @ApiProperty({ example: '2025-09-08' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2025-09-22' })
  @IsOptional() @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @Length(0, 1000)
  description?: string;
}
