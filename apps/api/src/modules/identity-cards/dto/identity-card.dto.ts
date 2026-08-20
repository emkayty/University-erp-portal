import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';

enum IdentityCardHolderTypeDto {
  STUDENT = 'STUDENT',
  STAFF = 'STAFF',
}

export class IssueIdentityCardDto {
  @ApiProperty({ enum: IdentityCardHolderTypeDto })
  @IsEnum(IdentityCardHolderTypeDto)
  holderType: IdentityCardHolderTypeDto;

  @ApiPropertyOptional({ description: 'Required when holderType is STUDENT.' })
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @ApiPropertyOptional({ description: 'Required when holderType is STAFF.' })
  @IsOptional()
  @IsUUID('4')
  staffId?: string;

  @ApiProperty({ description: 'ISO date when the card expires.' })
  @IsDateString()
  expiryDate: string;

  @ApiPropertyOptional({ description: 'Optional approved photo reference; otherwise the person profile photo is used.' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  photoUrl?: string;
}

export class IdentityCardLifecycleDto {
  @ApiProperty({ description: 'Reason is required for card suspension, revocation, or replacement.' })
  @IsString()
  @Length(8, 500)
  reason: string;
}
