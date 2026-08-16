import { DsrRequestType } from '@prisma/client';
import { IsOptional, IsString, IsUUID, Length, MinLength, IsEnum } from 'class-validator';

export class RectifyUserDto {
  @IsOptional() @IsString()
  email?: string;

  @IsOptional() @IsString() @Length(11, 15)
  phone?: string;

  @IsOptional() @IsString()
  reason?: string;
}

export class ErasureRequestDto {
  // Attestation reference for the VC sign-off spec §16.1 requires for
  // erasure. This is NOT a full multi-party approval workflow (out of
  // scope for P10) — it records WHO the requester claims authorised this
  // and is captured on the audit trail; pair with an out-of-band approval
  // process (email/ticket) until a formal approvals module exists.
  @IsUUID()
  vcApprovalReference!: string;

  @IsOptional() @IsString()
  reason?: string;
}

export class RestrictProcessingDto {
  @IsString() @MinLength(3)
  reason!: string;
}

/**
 * DPO/SUPER_ADMIN intake for a canonical Person who may not yet have a User
 * account. Intake deliberately stops at identity verification: it never
 * claims that erasure, export, or rectification has been completed.
 */
export class PersonDsrIntakeDto {
  @IsEnum(DsrRequestType)
  type!: DsrRequestType;

  @IsOptional() @IsString()
  reason?: string;
}
