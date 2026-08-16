import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum LibraryCategoryEnum { TEXTBOOK='TEXTBOOK', REFERENCE='REFERENCE', JOURNAL='JOURNAL', THESIS='THESIS', NOVEL='NOVEL', PERIODICAL='PERIODICAL', MULTIMEDIA='MULTIMEDIA', OTHER='OTHER' }

export class CreateLibraryItemDto {
  @ApiProperty() @IsString() @Length(3,20) accessionNo: string;
  @ApiProperty() @IsString() @Length(1,300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() author?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(10,13) isbn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() publisher?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1800) @Max(2100) publishYear?: number;
  @ApiProperty({ enum: LibraryCategoryEnum }) @IsEnum(LibraryCategoryEnum) category: LibraryCategoryEnum;
  @ApiProperty({ default: 1 }) @IsInt() @Min(1) totalCopies: number;
  @ApiPropertyOptional() @IsOptional() @IsString() shelfLocation?: string;
}

export class BorrowItemDto {
  @ApiProperty() @IsUUID('4') libraryItemId: string;
  @ApiProperty({ description: 'ISO date string — due date for this loan' }) @IsString() dueDate: string;
}

export class SearchLibraryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,200) q?: string;
  @ApiPropertyOptional({ enum: LibraryCategoryEnum }) @IsOptional() @IsEnum(LibraryCategoryEnum) category?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number;
}
