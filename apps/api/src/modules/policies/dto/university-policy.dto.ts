import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

enum UniversityPolicyCategoryDto {
  ACADEMIC = "ACADEMIC",
  ADMISSIONS = "ADMISSIONS",
  ASSESSMENT_AND_EXAMINATIONS = "ASSESSMENT_AND_EXAMINATIONS",
  FINANCE_AND_FEES = "FINANCE_AND_FEES",
  STUDENT_AFFAIRS = "STUDENT_AFFAIRS",
  STAFF_AND_HR = "STAFF_AND_HR",
  RESEARCH_AND_ETHICS = "RESEARCH_AND_ETHICS",
  ICT_AND_DATA_PROTECTION = "ICT_AND_DATA_PROTECTION",
  HEALTH_SAFETY_AND_SECURITY = "HEALTH_SAFETY_AND_SECURITY",
  GOVERNANCE_AND_COMPLIANCE = "GOVERNANCE_AND_COMPLIANCE",
  OTHER = "OTHER",
}

enum UniversityPolicyStatusDto {
  DRAFT = "DRAFT",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

export class CreateUniversityPolicyDto {
  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/, {
    message:
      "policyCode must use uppercase letters, numbers, hyphens, or underscores",
  })
  policyCode!: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  version?: string;

  @IsString()
  @Length(5, 250)
  title!: string;

  @IsEnum(UniversityPolicyCategoryDto)
  category!: UniversityPolicyCategoryDto;

  @IsOptional()
  @IsString()
  @Length(10, 5000)
  summary?: string;

  @IsString()
  @Length(50, 100_000)
  content!: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  reviewDueAt?: string;

  @IsOptional()
  @IsBoolean()
  requiresAcknowledgement?: boolean;

  @IsOptional()
  @IsDateString()
  acknowledgementDueAt?: string;
}

export class UpdateUniversityPolicyDto {
  @IsOptional()
  @IsString()
  @Length(5, 250)
  title?: string;

  @IsOptional()
  @IsEnum(UniversityPolicyCategoryDto)
  category?: UniversityPolicyCategoryDto;

  @IsOptional()
  @IsString()
  @Length(10, 5000)
  summary?: string;

  @IsOptional()
  @IsString()
  @Length(50, 100_000)
  content?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  reviewDueAt?: string;

  @IsOptional()
  @IsBoolean()
  requiresAcknowledgement?: boolean;

  @IsOptional()
  @IsDateString()
  acknowledgementDueAt?: string;
}

export class ReviewUniversityPolicyDto {
  @IsIn(["APPROVE", "REJECT"])
  action!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsString()
  @Length(3, 5000)
  comment?: string;
}

export class PublishUniversityPolicyDto {
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class ListUniversityPoliciesDto {
  @ApiPropertyOptional({ enum: UniversityPolicyStatusDto })
  @IsOptional()
  @IsEnum(UniversityPolicyStatusDto)
  status?: UniversityPolicyStatusDto;

  @ApiPropertyOptional({ enum: UniversityPolicyCategoryDto })
  @IsOptional()
  @IsEnum(UniversityPolicyCategoryDto)
  category?: UniversityPolicyCategoryDto;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class ListPolicyAcknowledgementsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
