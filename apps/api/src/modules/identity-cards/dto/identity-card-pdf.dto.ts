import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkIdentityCardPdfDto {
  @ApiProperty({ type: [String], description: 'Active identity-card IDs to impose five-up on A4. Each five-card front page is followed by its matching five-card back page for short-edge duplex printing.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  cardIds: string[];
}
