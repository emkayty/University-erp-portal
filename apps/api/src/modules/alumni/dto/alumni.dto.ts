import {
  IsBoolean, IsDateString, IsDecimal, IsEnum, IsOptional,
  IsString, IsUUID, Length,
} from 'class-validator';
import { CampaignStatus } from '@prisma/client';

// ── Alumni Profile ────────────────────────────────────────────────────────────
export class UpdateAlumniProfileDto {
  @IsOptional() @IsString() @Length(1, 200) occupation?: string;
  @IsOptional() @IsString() @Length(1, 300) employer?: string;
  @IsOptional() @IsString() @Length(1, 100) industry?: string;
  @IsOptional() @IsString() @Length(1, 500) linkedinUrl?: string;
  @IsOptional() @IsString() @Length(1, 100) currentCountry?: string;
  @IsOptional() @IsString() @Length(1, 100) currentCity?: string;
  @IsOptional() @IsString()                 bio?: string;
  @IsOptional() @IsBoolean()                isProfilePublic?: boolean;
}

// ── Campaign ──────────────────────────────────────────────────────────────────
export class CreateCampaignDto {
  @IsString() @Length(3, 300)   title: string;
  @IsString() @Length(10, 5000) description: string;
  @IsDecimal()                  targetAmount: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsDateString()               startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() @Length(1, 500) imageUrl?: string;
}

export class UpdateCampaignStatusDto {
  @IsEnum(CampaignStatus) status: CampaignStatus;
}

// ── Donation ──────────────────────────────────────────────────────────────────
export class CreateDonationDto {
  @IsUUID('4')                  campaignId: string;
  @IsOptional() @IsUUID('4')    alumniId?: string;
  @IsDecimal()                  amount: string;
  @IsOptional() @IsBoolean()    isAnonymous?: boolean;
  @IsOptional() @IsString() @Length(1, 200) donorName?: string;
  @IsOptional() @IsString() @Length(1, 255) donorEmail?: string;
  @IsOptional() @IsString()                 message?: string;
}

export class UpdateDonationStatusDto {
  @IsEnum(['COMPLETED', 'FAILED', 'REFUNDED']) status: 'COMPLETED' | 'FAILED' | 'REFUNDED';
  @IsOptional() @IsString() providerRef?: string;
}

// ── Query ─────────────────────────────────────────────────────────────────────
export class GetAlumniQueryDto {
  @IsOptional() @IsString()                  q?: string;      // name search
  @IsOptional() @IsString()                  industry?: string;
  @IsOptional() @IsString()                  currentCountry?: string;
  @IsOptional()                              graduationYear?: number;
  @IsOptional()                              page?: number;
  @IsOptional()                              pageSize?: number;
}
