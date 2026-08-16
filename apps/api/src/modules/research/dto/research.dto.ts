import {
  IsArray, IsDateString, IsDecimal, IsEnum, IsOptional,
  IsString, IsUUID, Length,
} from 'class-validator';
import { MemberRole, OutputType, ResearchStatus } from '@prisma/client';

export class CreateResearchProjectDto {
  @IsString() @Length(3, 500)   title: string;
  @IsString() @Length(10, 5000) abstract: string;
  @IsString() @Length(1, 200)   department: string;
  @IsDecimal()                  budget: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
}

export class UpdateResearchProjectDto {
  @IsOptional() @IsString() @Length(3, 500)   title?: string;
  @IsOptional() @IsString() @Length(10, 5000) abstract?: string;
  @IsOptional() @IsDecimal()                  budget?: string;
  @IsOptional() @IsDateString()               startDate?: string;
  @IsOptional() @IsDateString()               endDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
}

export class UpdateProjectStatusDto {
  @IsEnum(ResearchStatus) status: ResearchStatus;
  @IsOptional() @IsString() @Length(1, 100) ethicsApprovalRef?: string;
  @IsOptional() @IsDateString()             ethicsApprovedAt?: string;
}

export class AddResearchMemberDto {
  @IsUUID('4')         userId: string;
  @IsEnum(MemberRole)  role: MemberRole;
}

export class CreateGrantDto {
  @IsString() @Length(1, 300) funder: string;
  @IsOptional() @IsString() @Length(1, 100) grantRef?: string;
  @IsDecimal()  amount: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}

export class RecordExpenditureDto {
  @IsString() @Length(3, 500) description: string;
  @IsDecimal()  amount: string;
  @IsOptional() @IsString() @Length(1, 100) receiptRef?: string;
  @IsDateString() expendedAt: string;
}

export class CreateResearchOutputDto {
  @IsEnum(OutputType)          outputType: OutputType;
  @IsString() @Length(3, 500)  title: string;
  @IsArray() @IsString({ each: true }) authors: string[];
  @IsOptional() @IsString() @Length(1, 300) publishedIn?: string;
  @IsOptional() @IsDateString()             publishDate?: string;
  @IsOptional() @IsString() @Length(1, 200) doi?: string;
  @IsOptional() @IsString() @Length(1, 500) url?: string;
  @IsOptional() @IsString()                 abstract?: string;
}

export class GetProjectsQueryDto {
  @IsOptional() @IsEnum(ResearchStatus) status?: ResearchStatus;
  @IsOptional() @IsString()             department?: string;
  @IsOptional() @IsString()             leadResearcherId?: string;
}
