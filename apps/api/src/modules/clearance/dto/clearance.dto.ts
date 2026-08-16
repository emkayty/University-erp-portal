import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateClearanceItemDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() responsibleRole!: string; // validated against RoleName enum at the service layer
  @IsOptional() @IsBoolean() isRequiredForGraduation?: boolean;
  @IsOptional() @IsBoolean() isAutoCleared?: boolean;
}

export class BlockClearanceItemDto {
  @IsString() @MinLength(5) blockReason!: string;
}

export class WaiveClearanceItemDto {
  @IsString() @MinLength(5) waiverReason!: string;
}
