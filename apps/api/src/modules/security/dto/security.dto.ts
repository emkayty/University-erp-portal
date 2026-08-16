import { ArrayMinSize, IsArray, IsEnum, IsString, MinLength } from 'class-validator';

export enum SecurityIncidentTypeDto {
  CREDENTIAL_BREACH = 'CREDENTIAL_BREACH',
  DATA_LEAK = 'DATA_LEAK',
  UNAUTHORISED_ACCESS = 'UNAUTHORISED_ACCESS',
  MALWARE = 'MALWARE',
  PHYSICAL_BREACH = 'PHYSICAL_BREACH',
  THIRD_PARTY_BREACH = 'THIRD_PARTY_BREACH',
  OTHER = 'OTHER',
}

export class CreateSecurityIncidentDto {
  @IsEnum(SecurityIncidentTypeDto)
  type!: SecurityIncidentTypeDto;

  @IsString() @MinLength(10)
  description!: string;

  // May be empty at first report (scope still being assessed) — contained-
  // session revocation simply becomes a no-op until this is updated.
  @IsArray() @ArrayMinSize(0)
  affectedUserIds!: string[];
}

export class ResolveIncidentDto {
  @IsString() @MinLength(3)
  dpoNotes!: string;
}
