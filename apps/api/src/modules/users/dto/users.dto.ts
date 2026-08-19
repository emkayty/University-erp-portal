import { IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'bursar@unilag.edu.ng' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 12 })
  @IsString() @MinLength(12)
  password: string;

  @ApiPropertyOptional({ example: '08012345678' })
  @IsOptional() @IsString()
  phone?: string;

  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName)
  roleName: RoleName;

  @ApiPropertyOptional({ description: 'ABAC scope for STAFF or SUPPORT_STAFF role' })
  @IsOptional()
  staffScope?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'UTC effective start time; defaults to now', format: 'date-time' })
  @IsOptional() @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'UTC expiry time; required for temporary assignments', format: 'date-time' })
  @IsOptional() @IsDateString()
  effectiveUntil?: string;

  @ApiPropertyOptional({ description: 'Business reason or approved appointment reference' })
  @IsOptional() @IsString() @MinLength(8)
  grantReason?: string;
}

export class GrantRoleDto {
  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName)
  roleName: RoleName;

  @ApiPropertyOptional({ description: 'ABAC scope for STAFF or SUPPORT_STAFF role' })
  @IsOptional()
  staffScope?: Record<string, unknown>;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional() @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional() @IsDateString()
  effectiveUntil?: string;

  @ApiPropertyOptional({ description: 'Business reason or approved appointment reference' })
  @IsOptional() @IsString() @MinLength(8)
  grantReason?: string;
}

export class CreateDelegationDto {
  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName)
  roleName: RoleName;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  endsAt: string;

  @ApiProperty({ minLength: 8 })
  @IsString() @MinLength(8)
  reason: string;

  @ApiPropertyOptional({ description: 'ABAC scope for delegated STAFF or SUPPORT_STAFF authority' })
  @IsOptional()
  staffScope?: Record<string, unknown>;
}

export class SetActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}
