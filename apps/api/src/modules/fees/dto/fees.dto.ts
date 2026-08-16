import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsNumber,
  IsOptional, IsString, IsUUID, Length, Max, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum FeeTypeEnum {
  TUITION='TUITION', ACCEPTANCE='ACCEPTANCE', ACCOMMODATION='ACCOMMODATION',
  LIBRARY='LIBRARY', MEDICAL='MEDICAL', SPORTS='SPORTS', ICT='ICT',
  EXAM_FEE='EXAM_FEE', LATE_REG='LATE_REG', OTHER='OTHER',
}
enum PaymentProviderEnum { REMITA='REMITA', PAYSTACK='PAYSTACK', TSA_MANUAL='TSA_MANUAL', BANK_TRANSFER='BANK_TRANSFER' }

export class CreateFeeScheduleDto {
  @ApiPropertyOptional({ description: 'null = applies to all programmes' })
  @IsOptional() @IsUUID('4') programmeId?: string;

  @ApiPropertyOptional({ description: 'null = applies to all levels', minimum: 100, maximum: 800 })
  @IsOptional() @IsInt() @Min(100) @Max(800) level?: number;

  @ApiProperty({ example: '2025/2026' }) @IsString() @Length(9,9) academicYear: string;
  @ApiProperty({ enum: FeeTypeEnum }) @IsEnum(FeeTypeEnum) feeType: FeeTypeEnum;
  @ApiProperty({ example: 75000.00, minimum: 0 }) @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
}

export class UpdateFeeScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) description?: string;
}

export class RequestWaiverDto {
  @ApiProperty() @IsUUID('4') studentFeeId: string;
  @ApiProperty({ minimum: 0.01, maximum: 100, example: 25 })
  @IsNumber() @Min(0.01) @Max(100) waiverPct: number;
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString() @Length(10, 1000) reason: string;
}

export class DecideWaiverDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) note?: string;
}

export class InitiatePaymentDto {
  @ApiProperty() @IsUUID('4') studentFeeId: string;
  @ApiProperty({ enum: PaymentProviderEnum }) @IsEnum(PaymentProviderEnum) provider: PaymentProviderEnum;
  @ApiPropertyOptional({ description: 'Amount to pay (defaults to full outstanding balance)' })
  @IsOptional() @IsNumber() @Min(1) amount?: number;
}

export class TsaManualPaymentDto {
  @ApiProperty() @IsUUID('4') studentFeeId: string;
  @ApiProperty({ minimum: 1 }) @IsNumber() @Min(1) amount: number;
  @ApiProperty({ description: 'TSA receipt/reference number from GIFMIS confirmation' })
  @IsString() @Length(3, 100) tsaReference: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paidAt?: string;
}

export class RemitaWebhookDto {
  @ApiProperty() @IsString() rrr: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() transactionId?: string;
}

export class PaystackWebhookDto {
  @ApiProperty() @IsString() event: string;
  @ApiProperty() data: {
    reference: string; amount: number; status: string;
    channel?: string; paid_at?: string;
    metadata?: Record<string, unknown>;
  };
}
