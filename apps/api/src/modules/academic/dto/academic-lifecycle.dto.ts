import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";

export class SubmitAcademicAppealDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  appealType!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  reason!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  evidenceRef?: string;
}

export class DecideAcademicAppealDto {
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  rationale!: string;
}

export class RequestProgrammeTransferDto {
  @IsUUID()
  toProgrammeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reason?: string;
}

export class DecideProgrammeTransferDto {
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @IsInt()
  @Min(0)
  mappedCredits!: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  decisionNote?: string;
}

export class RequestAcademicInterruptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  type!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reason?: string;
}

export class DecideAcademicInterruptionDto {
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";
}

export class IssueAcademicCredentialDto {
  @IsUUID()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  credentialType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  credentialNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  documentHash?: string;

  @IsObject()
  snapshot!: Record<string, unknown>;
}

export class CreateGraduationPolicyDto {
  @IsIn(["INSTITUTION", "FACULTY", "DEPARTMENT", "PROGRAMME"])
  scope!: "INSTITUTION" | "FACULTY" | "DEPARTMENT" | "PROGRAMME";

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsObject()
  ruleDefinition!: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class RevokeAcademicCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  reason!: string;
}
