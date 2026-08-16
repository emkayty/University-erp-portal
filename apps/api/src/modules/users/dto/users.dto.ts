import { IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'ABAC scope for STAFF role' })
  @IsOptional()
  staffScope?: Record<string, unknown>;
}

export class GrantRoleDto {
  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName)
  roleName: RoleName;

  @ApiPropertyOptional()
  @IsOptional()
  staffScope?: Record<string, unknown>;
}

export class RevokeRoleDto {
  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName)
  roleName: RoleName;
}

export class SetActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}
