import {
  IsArray, IsDateString, IsEmail, IsEnum, IsInt, IsOptional,
  IsString, IsUUID, Length, Matches, Max, Min, ValidateNested, IsBoolean, ArrayMaxSize, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum AdmissionTypeEnum { UTME='UTME', DE='DE', TRANSFER='TRANSFER', POSTGRADUATE='POSTGRADUATE', SANDWICH='SANDWICH', INTERNATIONAL='INTERNATIONAL', REMEDIAL='REMEDIAL' }
enum ApplicantStatusEnum { DRAFT='DRAFT', SUBMITTED='SUBMITTED', PENDING='PENDING', SCREENED='SCREENED', DOCUMENT_REVIEW='DOCUMENT_REVIEW', REVIEW_REQUIRED='REVIEW_REQUIRED', ELIGIBLE='ELIGIBLE', INELIGIBLE='INELIGIBLE', OFFERED='OFFERED', WAITLISTED='WAITLISTED', ACCEPTED='ACCEPTED', DECLINED='DECLINED', REJECTED='REJECTED', WITHDRAWN='WITHDRAWN', DEFERRED='DEFERRED', CLEARANCE='CLEARANCE', MATRICULATED='MATRICULATED' }

/**
 * Deep-audit fix (Aug 2026). The Applicant.oLevelResults JSON field and
 * its oLevelVerified/oLevelVerifyJobId siblings existed in the schema
 * from the start but were referenced nowhere in the service layer — the
 * whole admissions eligibility model was JAMB-score-only, despite real
 * Nigerian university admission being legally a two-part test (UTME score
 * AND a minimum of 5 O'Level credits including English and Mathematics,
 * from not more than two sittings — the "two sittings" rule specifically
 * is one of the most commonly disputed admission requirements in
 * Nigeria). This DTO gives that existing JSON field real structure and
 * validation. oLevelVerified/oLevelVerifyJobId are intentionally left
 * alone — those track independent confirmation against WAEC/NECO's own
 * results-checker systems (anti-fraud), a separate, larger external-
 * integration scope from the eligibility check this DTO enables. See
 * docs/CHANGELOG.md finding 7 (admissions).
 */
export enum OLevelExamTypeEnum { WAEC='WAEC', NECO='NECO', NABTEB='NABTEB', NBAIS='NBAIS', GCE='GCE' }
export enum OLevelGradeEnum {
  A1='A1', B2='B2', B3='B3', C4='C4', C5='C5', C6='C6', D7='D7', E8='E8', F9='F9',
}

export class OLevelSubjectResultDto {
  @ApiPropertyOptional({ description: 'Controlled AcademicSubject ID; preferred over free-text subject.' }) @IsOptional() @IsUUID('4') subjectId?: string;
  @ApiPropertyOptional({ example: 'English Language', description: 'Legacy compatibility field. Prefer subjectId.' }) @IsOptional() @IsString() @Length(2, 100) subject?: string;
  @ApiProperty({ enum: OLevelGradeEnum }) @IsEnum(OLevelGradeEnum) grade: OLevelGradeEnum;
  /** Derived from examinationAuthorityId/examinationTypeId when controlled references are supplied. */
  @ApiPropertyOptional({ enum: OLevelExamTypeEnum }) @IsOptional() @IsEnum(OLevelExamTypeEnum) examType?: OLevelExamTypeEnum;
  @ApiPropertyOptional({ description: 'Controlled ExaminationAuthority ID.' }) @IsOptional() @IsUUID('4') examinationAuthorityId?: string;
  @ApiPropertyOptional({ description: 'Controlled ExaminationType ID. Must belong to examinationAuthorityId.' }) @IsOptional() @IsUUID('4') examinationTypeId?: string;
  @ApiPropertyOptional({ enum: ['SCHOOL_CANDIDATE','PRIVATE_CANDIDATE','INTERNAL','EXTERNAL','OTHER'] }) @IsOptional() @IsString() candidateCategory?: string;
  @ApiProperty({ example: 2023 }) @IsInt() @Min(1990) @Max(2100) examYear: number;
  @ApiProperty({ description: '1 or 2 — which of the applicant\'s (max 2 permitted) sittings this subject was taken in', example: 1 })
  @IsInt() @Min(1) @Max(2) sittingNumber: number;
}

export class RecordOLevelResultsDto {
  @ApiProperty({ type: [OLevelSubjectResultDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OLevelSubjectResultDto)
  results: OLevelSubjectResultDto[];
}

export class VerifyOLevelResultsDto {
  @ApiProperty({ enum: ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'] })
  @IsEnum({ PENDING: 'PENDING', UNDER_REVIEW: 'UNDER_REVIEW', VERIFIED: 'VERIFIED', REJECTED: 'REJECTED' })
  status: string;

  @ApiPropertyOptional({ description: 'Verification reference, reviewer note, or rejection reason.' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  remarks?: string;
}

export class VerifyJambDto {
  @ApiProperty()
  @IsBoolean()
  verified: boolean;

  @ApiProperty({ minimum: 0, maximum: 400 })
  @IsInt()
  @Min(0)
  @Max(400)
  score: number;

  @ApiPropertyOptional({ description: 'Reviewer note or external verification reference.' })
  @IsOptional()
  @IsString()
  @Length(3, 500)
  remarks?: string;
}

export class CreateAdmissionCycleDto {
  @ApiProperty({ example: '2025/2026' }) @IsString() @Length(9,9) academicYear: string;
  @ApiProperty() @IsString() @Length(2,100) cycleName: string;
  @ApiProperty({ enum: AdmissionTypeEnum }) @IsEnum(AdmissionTypeEnum) admissionType: AdmissionTypeEnum;
  @ApiProperty() @IsDateString() openDate: string;
  @ApiProperty() @IsDateString() closeDate: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 400 }) @IsOptional() @IsInt() @Min(0) @Max(400) utmeMinScore?: number;
  @ApiPropertyOptional({ description: 'Whether an application fee is required; payment remains separate from academic eligibility.' }) @IsOptional() @IsBoolean() applicationFeeRequired?: boolean;
  @ApiPropertyOptional({ description: 'Application fee amount in the configured currency, with up to two decimal places.' }) @IsOptional() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) applicationFeeAmount?: string;
  @ApiPropertyOptional({ default: 'NGN' }) @IsOptional() @Matches(/^[A-Z]{3}$/) applicationFeeCurrency?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) maxApplicants?: number;
}

export class AddressDto {
  @ApiProperty() @IsString() @Length(3,255) line1: string;
  @ApiPropertyOptional({ description: 'Controlled country reference ID.' }) @IsOptional() @IsUUID('4') countryId?: string;
  @ApiPropertyOptional({ description: 'Controlled region/state/province reference ID.' }) @IsOptional() @IsUUID('4') regionId?: string;
  @ApiPropertyOptional({ description: 'Controlled LGA/local administrative area reference ID.' }) @IsOptional() @IsUUID('4') localAreaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,255) line2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional({ deprecated: true }) @IsOptional() @IsString() lga?: string;
  @ApiPropertyOptional({ deprecated: true }) @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional({ default: 'Nigeria', deprecated: true }) @IsOptional() @IsString() country?: string;
}

export class GuardianDto {
  @ApiProperty() @IsString() @Length(2,200) fullName: string;
  @ApiProperty() @IsString() @Length(2,80) relationship: string;
  @ApiProperty() @IsString() @Matches(/^(?:0\d{10}|\+\d{8,15})$/, { message: 'Use an 11-digit Nigerian number or an international number in +countrycode format.' }) phone: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() occupation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
}

export class PreviousEducationDto {
  @ApiProperty() @IsString() @Length(2,255) institution: string;
  @ApiProperty() @IsString() @Length(2,150) qualification: string;
  @ApiPropertyOptional() @IsOptional() @IsString() programme?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1950) @Max(2100) startYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1950) @Max(2100) endYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() gradeOrCgpa?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() certificateNo?: string;
}

export class AdmissionSpecificDetailsDto {
  @ApiPropertyOptional({ description: 'Direct Entry or postgraduate qualification.' }) @IsOptional() @IsString() @Length(2,200) highestQualification?: string;
  @ApiPropertyOptional({ description: 'Institution awarding the entry qualification.' }) @IsOptional() @IsString() @Length(2,255) awardingInstitution?: string;
  @ApiPropertyOptional({ minimum: 1950, maximum: 2100 }) @IsOptional() @IsInt() @Min(1950) @Max(2100) graduationYear?: number;
  @ApiPropertyOptional({ description: 'Previous institution for a transfer application.' }) @IsOptional() @IsString() @Length(2,255) previousInstitution?: string;
  @ApiPropertyOptional({ description: 'Previous programme for a transfer application.' }) @IsOptional() @IsString() @Length(2,200) previousProgramme?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10,1000) transferReason?: string;
  @ApiPropertyOptional({ description: 'International applicant passport/nationality document status; do not enter passport numbers here.' }) @IsOptional() @IsString() @Length(2,100) travelDocumentStatus?: string;
  @ApiPropertyOptional({ description: 'International English-language proficiency evidence status.' }) @IsOptional() @IsString() @Length(2,100) englishProficiencyStatus?: string;
  @ApiPropertyOptional({ description: 'Postgraduate research interest or proposed area, not a full research proposal.' }) @IsOptional() @IsString() @Length(2,500) researchInterest?: string;
  @ApiPropertyOptional({ description: 'Remedial or sandwich study preference.' }) @IsOptional() @IsString() @Length(2,100) studyPreference?: string;
}

export class CreateApplicantDto {
  @ApiProperty() @IsString() @Length(1,100) firstName: string;
  @ApiProperty() @IsString() @Length(1,100) lastName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,100) middleName?: string;
  @ApiProperty() @IsDateString() dateOfBirth: string;
  @ApiProperty() @IsString() @Length(1,30) gender: string;
  @ApiProperty() @IsString() @Length(2,100) nationality: string;
  @ApiPropertyOptional({ description: 'Controlled country reference ID.' }) @IsOptional() @IsUUID('4') countryOfOriginId?: string;
  @ApiPropertyOptional({ description: 'Controlled state/region reference ID.' }) @IsOptional() @IsUUID('4') stateOfOriginId?: string;
  @ApiPropertyOptional({ description: 'Controlled LGA/local area reference ID for Nigeria.' }) @IsOptional() @IsUUID('4') lgaOfOriginId?: string;
  @ApiPropertyOptional({ deprecated: true }) @IsOptional() @IsString() stateOfOrigin?: string;
  @ApiPropertyOptional({ deprecated: true }) @IsOptional() @IsString() lga?: string;
  @ApiProperty() @IsString() @Matches(/^(?:0\d{10}|\+\d{8,15})$/, { message: 'Use an 11-digit Nigerian number or an international number in +countrycode format.' }) phone: string;
  @ApiProperty() @IsEmail() email: string;
  /** Derived from the selected admission cycle. Optional only for backwards-compatible clients; conflicts are rejected server-side. */
  @ApiPropertyOptional({ enum: AdmissionTypeEnum, description: 'Derived from admissionCycleId; do not override the cycle value.' }) @IsOptional() @IsEnum(AdmissionTypeEnum) admissionType?: AdmissionTypeEnum;
  @ApiPropertyOptional({ type: AdmissionSpecificDetailsDto }) @IsOptional() @ValidateNested() @Type(() => AdmissionSpecificDetailsDto) admissionDetails?: AdmissionSpecificDetailsDto;
  @ApiProperty() @IsUUID('4') admissionCycleId: string;
  @ApiProperty() @IsUUID('4') programmeChoice1Id: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') programmeChoice2Id?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') programmeChoice3Id?: string;
  @ApiPropertyOptional({ type: AddressDto }) @IsOptional() @ValidateNested() @Type(() => AddressDto) residentialAddress?: AddressDto;
  @ApiPropertyOptional({ type: AddressDto }) @IsOptional() @ValidateNested() @Type(() => AddressDto) permanentAddress?: AddressDto;
  @ApiPropertyOptional({ type: GuardianDto }) @IsOptional() @ValidateNested() @Type(() => GuardianDto) guardian?: GuardianDto;
  @ApiPropertyOptional({ type: GuardianDto }) @IsOptional() @ValidateNested() @Type(() => GuardianDto) emergencyContact?: GuardianDto;
  @ApiPropertyOptional({ type: [PreviousEducationDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PreviousEducationDto) previousEducation?: PreviousEducationDto[];
  @ApiPropertyOptional({ description: 'Candidate accepted the current application declaration and terms.' }) @IsOptional() @IsBoolean() declarationAccepted?: boolean;
  @ApiPropertyOptional({ description: 'Candidate acknowledged the current institutional privacy notice.' }) @IsOptional() @IsBoolean() privacyNoticeAccepted?: boolean;
  @ApiPropertyOptional({ description: 'Opaque pre-submission passport-photo proof issued by the API after upload verification.' }) @IsOptional() @IsString() @Length(32,512) passportPhotoProof?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10,11) jambRegNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(400) jambScore?: number;
  @ApiPropertyOptional({ description: 'Applicant NIN; stored encrypted and never returned in public responses.' }) @IsOptional() @Matches(/^\d{11}$/, { message: 'NIN must contain exactly 11 digits.' }) nin?: string;
  @ApiPropertyOptional({ description: 'Explicit acknowledgment for processing NIN for admission identity verification.' }) @IsOptional() @IsBoolean() ninConsentAccepted?: boolean;
  @ApiPropertyOptional({ type: [OLevelSubjectResultDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OLevelSubjectResultDto) oLevelResults?: OLevelSubjectResultDto[];
  @ApiPropertyOptional({ description: 'Whether the applicant wants the University to contact them about accessibility or reasonable accommodation.' }) @IsOptional() @IsBoolean() supportRequested?: boolean;
  @ApiPropertyOptional({ type: [String], description: 'Non-diagnostic support areas such as entrance examination, interview, communication, or campus visit.' }) @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) supportAreas?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Requested operational accommodations such as step-free access, extra time, reader/scribe, captions, large print, or assistive technology.' }) @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) requestedAdjustments?: string[];
  @ApiPropertyOptional({ description: 'Optional short description of the support needed; do not provide a diagnosis.' }) @IsOptional() @IsString() @Length(1,500) supportDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2,30) preferredContactMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2,40) preferredFormat?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() supportConsentAccepted?: boolean;
}

export class UpdateAccessibilitySupportDto {
  @ApiProperty({ enum: ['REQUESTED','CONTACTED','ARRANGED','DECLINED','CLOSED'] })
  @IsEnum({ REQUESTED: 'REQUESTED', CONTACTED: 'CONTACTED', ARRANGED: 'ARRANGED', DECLINED: 'DECLINED', CLOSED: 'CLOSED' })
  status: string;
  @ApiPropertyOptional({ description: 'Optional support officer user ID.' })
  @IsOptional() @IsUUID('4') assignedSupportOfficerId?: string;
}

export class UpdateApplicantStatusDto {
  @ApiProperty({ enum: Object.values(ApplicantStatusEnum) })
  @IsEnum(ApplicantStatusEnum)
  status: ApplicantStatusEnum;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(5, 500) rejectionReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() offerDeadline?: string;
  @ApiPropertyOptional({ description: 'Programme choice to which the decision/offer applies' })
  @IsOptional() @IsUUID('4') selectedProgrammeId?: string;
  @ApiPropertyOptional({ enum: ['ACADEMIC_REQUIREMENT_NOT_MET','DOCUMENT_NOT_VERIFIED','UTME_REQUIREMENT_NOT_MET','OLEVEL_REQUIREMENT_NOT_MET','PROGRAMME_CAPACITY','INCOMPLETE_APPLICATION','DUPLICATE_APPLICATION','INELIGIBLE_ADMISSION_TYPE','OTHER'] }) @IsOptional() @IsString() reasonCode?: string;
}

export class MatriculateApplicantDto {
  @ApiPropertyOptional({ description: 'Override entry level (default: 100 for UG, 1 for PG)' })
  @IsOptional() @IsInt() @Min(100) @Max(800) entryLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() temporaryPassword?: string;
}

export class ScreenApplicantsDto {
  @ApiProperty() @IsUUID('4') admissionCycleId: string;
  @ApiPropertyOptional({ default: false, description: 'Dry-run — report results without saving' })
  @IsOptional() dryRun?: boolean;
}

export class TrackApplicationDto {
  @ApiProperty({ example: '202620UT00001' }) @IsString() @Length(6,30) applicationNo: string;
  @ApiProperty({ description: '64-character tracking credential returned once after submission' }) @IsString() @Length(64,64) trackingToken: string;
}

export class ApplicationChangeRequestDto extends TrackApplicationDto {
  @ApiProperty({ enum: ['CORRECTION', 'WITHDRAWAL'] }) @IsEnum({ CORRECTION: 'CORRECTION', WITHDRAWAL: 'WITHDRAWAL' }) requestType: string;
  @ApiProperty({ description: 'Reason for the correction or withdrawal request.' }) @IsString() @Length(5,500) reason: string;
  @ApiPropertyOptional({ description: 'Fields the applicant wants corrected. Do not include NIN, passwords, or payment-card data.' }) @IsOptional() @IsObject() requestedChanges?: Record<string, unknown>;
}

export class UpdateApplicationChangeRequestDto {
  @ApiProperty({ enum: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'] }) @IsEnum({ UNDER_REVIEW: 'UNDER_REVIEW', APPROVED: 'APPROVED', REJECTED: 'REJECTED', COMPLETED: 'COMPLETED' }) status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3,500) note?: string;
}

export class SaveApplicationDraftDto {
  @ApiPropertyOptional({ description: 'Draft credential previously returned by the server. Omit to start a new draft.' }) @IsOptional() @IsString() @Length(40,80) draftToken?: string;
  @ApiProperty({ description: 'Form snapshot. Sensitive NIN, photograph proofs, diagnoses, and consent evidence are rejected/omitted by the service.' }) @IsObject() payload: Record<string, unknown>;
}

export class LoadApplicationDraftDto {
  @ApiProperty({ description: 'Draft credential returned by the server.' }) @IsString() @Length(40,80) draftToken: string;
}

export class ApplicantPhotoPresignDto extends TrackApplicationDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png'] }) @IsString() @IsEnum({ JPEG: 'image/jpeg', PNG: 'image/png' }) contentType: string;
  @ApiProperty({ minimum: 1, maximum: 2097152 }) @IsInt() @Min(1) @Max(2 * 1024 * 1024) sizeBytes: number;
}

export class ApplicantPhotoPreSubmitPresignDto {
  @ApiProperty({ description: 'Client-generated UUID used to make the pre-submit upload retry-safe.' }) @IsUUID('4') idempotencyKey: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png'] }) @IsString() @IsEnum({ JPEG: 'image/jpeg', PNG: 'image/png' }) contentType: string;
  @ApiProperty({ minimum: 1, maximum: 2097152 }) @IsInt() @Min(1) @Max(2 * 1024 * 1024) sizeBytes: number;
}

export class ApplicantPhotoPreSubmitCompleteDto {
  @ApiProperty({ description: 'Client-generated UUID used for the pre-submit upload.' }) @IsUUID('4') idempotencyKey: string;
  @ApiProperty() @IsString() @Length(1, 1000) key: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png'] }) @IsString() @IsEnum({ JPEG: 'image/jpeg', PNG: 'image/png' }) contentType: string;
  @ApiProperty({ minimum: 1, maximum: 2097152 }) @IsInt() @Min(1) @Max(2 * 1024 * 1024) sizeBytes: number;
}

export class ApplicantPhotoCompleteDto extends TrackApplicationDto {
  @ApiProperty() @IsString() @Length(1, 1000) key: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png'] }) @IsString() @IsEnum({ JPEG: 'image/jpeg', PNG: 'image/png' }) contentType: string;
  @ApiProperty({ minimum: 1, maximum: 2097152 }) @IsInt() @Min(1) @Max(2 * 1024 * 1024) sizeBytes: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 255) originalFileName?: string;
}

export class AdmissionSubjectRequirementDto {
  @ApiProperty() @IsString() @Length(2,100) subject: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() required?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) alternatives?: string[];
}

export class CreateAdmissionRequirementDto {
  @ApiProperty() @IsUUID('4') programmeId: string;
  @ApiProperty({ enum: AdmissionTypeEnum }) @IsEnum(AdmissionTypeEnum) admissionType: AdmissionTypeEnum;
  @ApiProperty({ example: '2026/2027' }) @IsString() @Length(9,9) academicYear: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 400 }) @IsOptional() @IsInt() @Min(0) @Max(400) minUtmeScore?: number;
  @ApiPropertyOptional({ default: 5 }) @IsOptional() @IsInt() @Min(0) @Max(20) minOLevelCredits?: number;
  @ApiPropertyOptional({ default: 2 }) @IsOptional() @IsInt() @Min(1) @Max(5) maxOLevelSittings?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() requireEnglish?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() requireMathematics?: boolean;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100) minAge?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 120 }) @IsOptional() @IsInt() @Min(0) @Max(120) maxAge?: number;
  @ApiPropertyOptional({ type: [String], description: 'Document type codes required before eligibility/offer' }) @IsOptional() @IsArray() @IsString({ each: true }) requiredDocuments?: string[];
  @ApiPropertyOptional({ type: [AdmissionSubjectRequirementDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AdmissionSubjectRequirementDto) subjectRequirements?: AdmissionSubjectRequirementDto[];
}

export class VerifyApplicationDocumentDto {
  @ApiProperty({ enum: ['PENDING','UNDER_REVIEW','VERIFIED','REJECTED'] }) @IsEnum({ PENDING: 'PENDING', UNDER_REVIEW: 'UNDER_REVIEW', VERIFIED: 'VERIFIED', REJECTED: 'REJECTED' }) status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3,500) rejectionReason?: string;
}

export enum ApplicationDocumentTypeEnum { PASSPORT_PHOTO='PASSPORT_PHOTO', BIRTH_CERTIFICATE='BIRTH_CERTIFICATE', AGE_DECLARATION='AGE_DECLARATION', JAMB_RESULT='JAMB_RESULT', OLEVEL_RESULT='OLEVEL_RESULT', OLEVEL_CERTIFICATE='OLEVEL_CERTIFICATE', DE_CERTIFICATE='DE_CERTIFICATE', TRANSCRIPT='TRANSCRIPT', DEGREE_CERTIFICATE='DEGREE_CERTIFICATE', NYSC_CERTIFICATE='NYSC_CERTIFICATE', REFERENCE='REFERENCE', RESEARCH_PROPOSAL='RESEARCH_PROPOSAL', PASSPORT='PASSPORT', ID_CARD='ID_CARD', OTHER='OTHER' }

export class RegisterApplicationDocumentDto {
  @ApiProperty({ enum: ApplicationDocumentTypeEnum }) @IsEnum(ApplicationDocumentTypeEnum) documentType: ApplicationDocumentTypeEnum;
  @ApiPropertyOptional({ description: 'Opaque object-storage key or internal file reference; do not expose public bucket URLs.' }) @IsOptional() @IsString() @Length(1,1000) fileUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,255) originalFileName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,100) mimeType?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) sizeBytes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,100) documentNumber?: string;
}
