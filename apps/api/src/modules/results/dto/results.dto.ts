import {
  IsArray, IsBoolean, IsEnum, IsNumber,
  IsOptional, IsString, IsUUID, Length, Max, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum ResultActionEnum {
  HOD_APPROVE='HOD_APPROVE', DEAN_APPROVE='DEAN_APPROVE',
  SUBMIT_SENATE='SUBMIT_SENATE', SENATE_PUBLISH='SENATE_PUBLISH', REJECT='REJECT',
}

export class SubmitResultDto {
  @ApiProperty() @IsUUID('4') studentId: string;
  @ApiProperty() @IsUUID('4') courseOfferingId: string;
  @ApiProperty() @IsUUID('4') semesterId: string;
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsNumber() @Min(0) @Max(100) score: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() absentFromExam?: boolean;
}

export enum BulkResultMode { BEST_EFFORT = 'BEST_EFFORT' }

export class BulkSubmitResultsDto {
  @ApiProperty({ type: () => [SubmitResultDto] }) results: SubmitResultDto[];
  @ApiPropertyOptional({ enum: BulkResultMode, default: BulkResultMode.BEST_EFFORT })
  @IsOptional() @IsEnum(BulkResultMode) mode?: BulkResultMode;
}

export class ResultActionDto {
  @ApiProperty({ enum: ResultActionEnum }) @IsEnum(ResultActionEnum) action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10, 1000) rejectionReason?: string;
}

export class BulkResultActionDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsUUID('4', { each: true }) resultIds: string[];
  @ApiProperty({ enum: ResultActionEnum }) @IsEnum(ResultActionEnum) action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10, 1000) rejectionReason?: string;
}

// AUDIT-C2: result amendment — previously did not exist at all.
export class AmendResultDto {
  @ApiProperty({ minimum: 0, maximum: 100 }) @IsNumber() @Min(0) @Max(100) newScore: number;
  @ApiProperty() @IsString() @Length(10, 1000) amendmentReason: string;
}

export class WithholdResultDto {
  @ApiProperty() @IsString() @Length(10, 1000) withheldReason: string;
}
