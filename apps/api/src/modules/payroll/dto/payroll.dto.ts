import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePayrollRunDto {
  @ApiProperty({ minimum: 1, maximum: 12 }) @IsInt() @Min(1) @Max(12) periodMonth: number;
  @ApiProperty({ example: 2025 }) @IsInt() @Min(2020) @Max(2099) periodYear: number;
  @ApiProperty({ example: 'October 2025' }) @IsString() @Length(3,50) label: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,500) notes?: string;
}

export class PayrollActionDto {
  @ApiProperty({ enum: ['COMPUTE','APPROVE','DISBURSE'] }) action: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0,500) notes?: string;
}
