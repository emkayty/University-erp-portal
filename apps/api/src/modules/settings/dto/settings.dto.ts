import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsInt,
  IsNumber,
  IsUUID,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

enum InstitutionType {
  UNIVERSITY = "UNIVERSITY",
  POLYTECHNIC = "POLYTECHNIC",
  COLLEGE_OF_EDUCATION = "COLLEGE_OF_EDUCATION",
  SPECIALIST_INSTITUTION = "SPECIALIST_INSTITUTION",
}
enum GradingSystem {
  NIGERIAN_5_POINT = "NIGERIAN_5_POINT",
  US_4_POINT = "US_4_POINT",
}
enum CourseRepeatPolicy {
  REPLACE = "REPLACE",
  INCLUDE = "INCLUDE",
  BEST = "BEST",
}
enum MatricNumberSequenceScope {
  GLOBAL = "GLOBAL",
  YEAR = "YEAR",
  DEPARTMENT_YEAR = "DEPARTMENT_YEAR",
}
enum IdentityCardTemplateMode {
  BUILT_IN = "BUILT_IN",
  EXTERNAL_ARTWORK = "EXTERNAL_ARTWORK",
}

export class UpdateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  institutionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 20)
  institutionCode?: string;

  @ApiPropertyOptional({ enum: InstitutionType })
  @IsOptional()
  @IsEnum(InstitutionType)
  institutionType?: InstitutionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  websiteUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, {
    message: "Currency must be a three-letter ISO code",
  })
  defaultCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  faviconUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^0\d{10}$/, {
    message: "Phone must be a valid 11-digit Nigerian number",
  })
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  tsaEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 80 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(80)
  feeWaiverCapHodPct?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  feeWaiverCapBursarPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deanApprovalRequired?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  assessmentFinalExamWeight?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  assessmentContinuousAssessmentWeight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enableLiveGradebook?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireResultValidation?: boolean;

  @ApiPropertyOptional({ description: 'Whether matriculation requires explicit admission clearance. Changes require independent institutional approval metadata.' })
  @IsOptional()
  @IsBoolean()
  requireAdmissionClearance?: boolean;

  @ApiPropertyOptional({ description: 'Distinct active VC or Registrar user approving an admission-clearance policy change.' })
  @IsOptional()
  @IsUUID('4')
  admissionClearanceApprovalReference?: string;

  @ApiPropertyOptional({ description: 'Approval document, directive, or policy reference number.' })
  @IsOptional()
  @IsString()
  @Length(3, 255)
  admissionClearanceApprovalDocumentReference?: string;

  @ApiPropertyOptional({ description: 'Reason for changing the admission-clearance policy.' })
  @IsOptional()
  @IsString()
  @Length(10, 1000)
  admissionClearanceChangeReason?: string;

  @ApiPropertyOptional({ description: 'UTC effective date/time for the approved policy change.' })
  @IsOptional()
  @IsDateString()
  admissionClearanceEffectiveAt?: string;

  @ApiPropertyOptional({ enum: GradingSystem })
  @IsOptional()
  @IsEnum(GradingSystem)
  gradingSystem?: GradingSystem;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(9)
  @Max(30)
  minCreditUnitsPerSem?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(40)
  maxCreditUnitsPerSem?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mfaMandatoryRoles?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @ApiPropertyOptional({ enum: CourseRepeatPolicy })
  @IsOptional()
  @IsEnum(CourseRepeatPolicy)
  courseRepeatPolicy?: CourseRepeatPolicy;

  @ApiPropertyOptional({ description: 'Institution-controlled matriculation format. Tokens: {INSTITUTION}, {FACULTY}, {DEPT}, {PROGRAMME}, {YEAR}, {ENTRY_YEAR}, and one trailing {SEQ} or {SEQ:05}.' })
  @IsOptional()
  @IsString()
  @Length(5, 120)
  @Matches(/^(?=.{5,120}$)(?:[A-Za-z0-9 ._\-/]|\{(?:INSTITUTION|FACULTY|DEPT|PROGRAMME|YEAR|ENTRY_YEAR|SEQ(?::\d{1,2})?)\})+$/)
  matricNumberFormat?: string;

  @ApiPropertyOptional({ enum: MatricNumberSequenceScope })
  @IsOptional()
  @IsEnum(MatricNumberSequenceScope)
  matricNumberSequenceScope?: MatricNumberSequenceScope;

  @ApiPropertyOptional({ enum: IdentityCardTemplateMode })
  @IsOptional()
  @IsEnum(IdentityCardTemplateMode)
  identityCardTemplateMode?: IdentityCardTemplateMode;

  @ApiPropertyOptional({ description: 'Approved private-storage key or explicitly allow-listed HTTPS artwork URL.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  identityCardFrontBackgroundUrl?: string;

  @ApiPropertyOptional({ description: 'Approved private-storage key or explicitly allow-listed HTTPS artwork URL.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  identityCardBackBackgroundUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  identityCardPrimaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  identityCardAccentColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 160)
  identityCardFooterText?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  sesRateLimitPerSecond?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  resultNotifConcurrency?: number;
}

export class UpdateFeatureFlagDto {
  @ApiPropertyOptional()
  @IsBoolean()
  enabled: boolean;
}
