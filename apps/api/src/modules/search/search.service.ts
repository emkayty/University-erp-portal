import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface SearchResult {
  type: 'student' | 'staff' | 'course' | 'library_item';
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  url: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly MAX_RESULTS = 20;

  constructor(private readonly prisma: PrismaService) {}

  // ── Student Search (staff / hod / registrar only) ─────────────────────────

  /**
   * Searches students by first+last name, matricNo, or email.
   * Uses ILIKE for case-insensitive substring match.
   * In production a GIN pg_trgm index on (first_name || ' ' || last_name)
   * is created in migration P9-001 to make this efficient at scale.
   */
  async searchStudents(query: string, opts: { limit?: number; status?: string; departmentId?: string } = {}) {
    if (!query || query.trim().length < 2) return [];

    const term        = `%${query.trim()}%`;
    const limit       = Math.min(opts.limit ?? this.MAX_RESULTS, 50);

    // Prisma raw for ILIKE on concatenated name (Prisma doesn't support native trgm yet)
    const rows = await this.prisma.$queryRaw<{
      id: string; matric_no: string; first_name: string; last_name: string;
      email: string; level: number; status: string; cgpa: string;
      programme_name: string; department_name: string;
    }[]>`
      SELECT
        s.id,
        s."matricNo",
        s."firstName",
        s."lastName",
        s.email,
        s.level,
        s.status,
        s.cgpa::TEXT,
        p.name AS programme_name,
        d.name AS department_name
      FROM students s
      JOIN programmes  p ON p.id = s."programmeId"
      JOIN departments d ON d.id = s."departmentId"
      WHERE s."deletedAt" IS NULL
        AND (
          (s."firstName" || ' ' || s."lastName") ILIKE ${term}
          OR s."matricNo" ILIKE ${term}
          OR s.email     ILIKE ${term}
        )
        ${opts.status        ? this.prisma.$queryRaw`AND s.status = ${opts.status}` : this.prisma.$queryRaw``}
        ${opts.departmentId  ? this.prisma.$queryRaw`AND s."departmentId" = ${opts.departmentId}::UUID` : this.prisma.$queryRaw``}
      ORDER BY s."lastName" ASC, s."firstName" ASC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id:         r.id,
      matricNo:   r.matric_no,
      firstName:  r.first_name,
      lastName:   r.last_name,
      email:      r.email,
      level:      r.level,
      status:     r.status,
      cgpa:       r.cgpa,
      programme:  r.programme_name,
      department: r.department_name,
    }));
  }

  // ── Staff Search (hr_manager / registrar / super_admin) ──────────────────

  async searchStaff(query: string, opts: { limit?: number; departmentId?: string } = {}) {
    if (!query || query.trim().length < 2) return [];

    const term  = `%${query.trim()}%`;
    const limit = Math.min(opts.limit ?? this.MAX_RESULTS, 50);

    const rows = await this.prisma.$queryRaw<{
      id: string; staff_id: string; first_name: string; last_name: string;
      email: string; job_title: string; employment_status: string;
      department_name: string;
    }[]>`
      SELECT
        s.id,
        s.staff_id,
        s."firstName",
        s."lastName",
        s.email,
        s.job_title,
        s.employment_status,
        d.name AS department_name
      FROM staff s
      JOIN departments d ON d.id = s."departmentId"
      WHERE s."deletedAt" IS NULL
        AND (
          (s."firstName" || ' ' || s."lastName") ILIKE ${term}
          OR s.staff_id ILIKE ${term}
          OR s.email    ILIKE ${term}
          OR s.job_title ILIKE ${term}
        )
        ${opts.departmentId ? this.prisma.$queryRaw`AND s."departmentId" = ${opts.departmentId}::UUID` : this.prisma.$queryRaw``}
      ORDER BY s."lastName" ASC, s."firstName" ASC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id:               r.id,
      staffId:          r.staff_id,
      firstName:        r.first_name,
      lastName:         r.last_name,
      email:            r.email,
      jobTitle:         r.job_title,
      employmentStatus: r.employment_status,
      department:       r.department_name,
    }));
  }

  // ── Course Search (all authenticated) ────────────────────────────────────

  /**
   * Searches courses by code or title.
   * In production: GIN tsvector index on (code || ' ' || title) in migration P9-001.
   */
  async searchCourses(query: string, opts: { limit?: number; departmentId?: string } = {}) {
    if (!query || query.trim().length < 2) return [];

    const term  = `%${query.trim()}%`;
    const limit = Math.min(opts.limit ?? this.MAX_RESULTS, 50);

    const rows = await this.prisma.$queryRaw<{
      id: string; code: string; title: string; credit_units: number;
      ccmas_category: string; department_name: string;
    }[]>`
      SELECT
        c.id,
        c.code,
        c.title,
        c.credit_units,
        c.ccmas_category,
        d.name AS department_name
      FROM courses c
      JOIN departments d ON d.id = c.department_id
      WHERE c.is_active = TRUE
        AND (
          c.code  ILIKE ${term}
          OR c.title ILIKE ${term}
        )
        ${opts.departmentId ? this.prisma.$queryRaw`AND c.department_id = ${opts.departmentId}::UUID` : this.prisma.$queryRaw``}
      ORDER BY c.code ASC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id:           r.id,
      code:         r.code,
      title:        r.title,
      creditUnits:  r.credit_units,
      ccmasCategory: r.ccmas_category,
      department:   r.department_name,
    }));
  }

  // ── Library Search (all authenticated) ───────────────────────────────────

  /**
   * Searches library items by title, author, or ISBN.
   * Uses pg_tsvector GIN index (idx_library_items_search) created in P7 migrations.
   */
  async searchLibraryItems(query: string, opts: { limit?: number } = {}) {
    if (!query || query.trim().length < 2) return [];

    const term  = `%${query.trim()}%`;
    const limit = Math.min(opts.limit ?? this.MAX_RESULTS, 50);

    const rows = await this.prisma.$queryRaw<{
      id: string; isbn: string | null; title: string; author: string | null;
      category: string; available_copies: number; total_copies: number;
    }[]>`
      SELECT
        id,
        isbn,
        title,
        author,
        category,
        available_copies,
        total_copies
      FROM library_items
      WHERE deleted_at IS NULL
        AND (
          title  ILIKE ${term}
          OR author ILIKE ${term}
          OR isbn   ILIKE ${term}
        )
      ORDER BY title ASC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      id:              r.id,
      isbn:            r.isbn,
      title:           r.title,
      author:          r.author,
      category:        r.category,
      availableCopies: r.available_copies,
      totalCopies:     r.total_copies,
      available:       r.available_copies > 0,
    }));
  }

  // ── Global Search ─────────────────────────────────────────────────────────

  /**
   * Aggregates results from all search domains into a unified response.
   * Which domains are included depends on the caller's role (passed in opts).
   * Per-domain results are capped at 5 each for the global view.
   */
  async globalSearch(
    query: string,
    opts: {
      includeStudents?: boolean;
      includeStaff?: boolean;
      departmentId?: string;
    },
  ): Promise<{ students: unknown[]; courses: unknown[]; staff: unknown[]; library: unknown[] }> {
    if (!query || query.trim().length < 2) {
      return { students: [], courses: [], staff: [], library: [] };
    }

    const GLOBAL_LIMIT = 5;

    const [students, courses, staff, library] = await Promise.all([
      opts.includeStudents
        ? this.searchStudents(query, { limit: GLOBAL_LIMIT, departmentId: opts.departmentId })
        : Promise.resolve([]),
      this.searchCourses(query,       { limit: GLOBAL_LIMIT }),
      opts.includeStaff
        ? this.searchStaff(query, { limit: GLOBAL_LIMIT, departmentId: opts.departmentId })
        : Promise.resolve([]),
      this.searchLibraryItems(query, { limit: GLOBAL_LIMIT }),
    ]);

    this.logger.debug(`Global search "${query}": ${students.length}s ${courses.length}c ${staff.length}st ${library.length}l`);

    return { students, courses, staff, library };
  }
}
