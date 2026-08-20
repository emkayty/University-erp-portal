import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSchemeDto {
  @IsUUID('4') courseOfferingId!: string;
  @IsString() name!: string;
  @IsOptional() @IsNumber() @Min(1) version?: number;
}

export class ComponentDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsString() category!: string;
  @IsNumber() @Min(0.01) maxScore!: number;
  @IsNumber() @Min(0) @Max(100) weight!: number;
  @IsOptional() @IsNumber() @Min(1) sequence?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
}

export class SaveComponentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ComponentDto)
  components!: ComponentDto[];
}

export class MarkDto {
  @IsUUID('4') studentId!: string;
  @IsUUID('4') componentId!: string;
  @IsUUID('4') courseOfferingId!: string;
  @IsNumber() @Min(0) score!: number;
}

export class FinalizeDto {
  @IsUUID('4') courseOfferingId!: string;
}

export enum GradeUploadMode {
  VALIDATE_ONLY = 'VALIDATE_ONLY',
  APPLY = 'APPLY',
}

export class CsvUploadDto {
  @IsUUID('4') courseOfferingId!: string;
  @IsUUID('4') semesterId!: string;
  @IsString() csv!: string;
  @IsOptional() @IsString() fileName?: string;
  @IsOptional() @IsEnum(GradeUploadMode) mode?: GradeUploadMode;
}
