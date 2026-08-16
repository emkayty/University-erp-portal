import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * SearchModule — pg_trgm powered global search across:
 *   students (name/matricNo/email), staff (name/staffId/email),
 *   courses (code/title), library_items (title/author/ISBN)
 *
 * Migration P9-001 adds the following indexes for performance at scale:
 *   CREATE EXTENSION IF NOT EXISTS pg_trgm;
 *   CREATE INDEX idx_students_search_trgm
 *     ON students USING GIN ((first_name || ' ' || last_name) gin_trgm_ops)
 *     WHERE deleted_at IS NULL;
 *   CREATE INDEX idx_staff_search_trgm
 *     ON staff USING GIN ((first_name || ' ' || last_name) gin_trgm_ops)
 *     WHERE deleted_at IS NULL;
 *   CREATE INDEX idx_courses_search_trgm
 *     ON courses USING GIN ((code || ' ' || title) gin_trgm_ops)
 *     WHERE is_active = TRUE;
 */
@Module({
  controllers: [SearchController],
  providers:   [SearchService],
  exports:     [SearchService],
})
export class SearchModule {}
