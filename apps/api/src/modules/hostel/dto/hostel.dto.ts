import { IsEnum, IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
enum RoomTypeEnum { STANDARD='STANDARD', ENSUITE='ENSUITE', STUDIO='STUDIO', ACCESSIBLE='ACCESSIBLE' }

export class CreateBlockDto {
  @ApiProperty() @IsString() @Length(2,100) name: string;
  @ApiProperty({ enum: ['MALE','FEMALE','MIXED'] }) @IsString() gender: string;
  @ApiProperty() @IsInt() @Min(1) totalRooms: number;
}

export class CreateRoomDto {
  @ApiProperty() @IsUUID('4') hostelBlockId: string;
  @ApiProperty() @IsString() @Length(1,10) roomNumber: string;
  @ApiProperty({ minimum: 1, maximum: 8 }) @IsInt() @Min(1) @Max(8) capacity: number;
  @ApiProperty({ enum: RoomTypeEnum }) @IsEnum(RoomTypeEnum) roomType: RoomTypeEnum;
}

export class AllocateRoomDto {
  @ApiProperty() @IsUUID('4') roomId: string;
  @ApiProperty() @IsUUID('4') studentId: string;
  @ApiProperty({ example: '2025/2026' }) @IsString() @Length(9,9) academicYear: string;
  @ApiProperty({ example: '2025-09-01' }) @IsString() startDate: string;
}
