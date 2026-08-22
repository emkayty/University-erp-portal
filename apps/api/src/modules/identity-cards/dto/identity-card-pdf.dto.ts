import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkIdentityCardPdfDto {
  @ApiProperty({ type: [String], description: 'Active identity-card IDs to impose five front/back pairs on one A4 page. Each row contains one card front and its matching back side-by-side.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  cardIds: string[];
}
