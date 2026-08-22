import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkIdentityCardPdfDto {
  @ApiProperty({ type: [String], description: 'Active identity-card IDs to impose ten-up on A4. Back pages are mirrored for short-edge duplex printing.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  cardIds: string[];
}
