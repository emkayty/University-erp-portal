/**
 * Prisma seed script — runs via `pnpm db:seed`
 *
 * Seeds:
 *  1. InstitutionSettings singleton (University of Lagos config as example)
 *  2. Super admin user (credentials from SEED_ADMIN_* env vars)
 *  3. Default notification templates
 *
 * IMPORTANT: This script is idempotent — safe to run multiple times.
 * All upserts use unique keys to prevent duplicates.
 */

import { Prisma, PrismaClient, RoleName } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as bcrypt from 'bcrypt';
import { DEFAULT_FEATURE_FLAGS } from '../../../packages/config/src/feature-flags';

const prisma = new PrismaClient();

/**
 * Render Free test helper: create or refresh only the synthetic administrator.
 * This is deliberately opt-in and never used by the normal full seed.
 */
async function seedAdminOnly(): Promise<void> {
  const adminEmailEnv = process.env['SEED_ADMIN_EMAIL'];
  const adminPasswordEnv = process.env['SEED_ADMIN_PASSWORD'];
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (isProduction && (!adminEmailEnv || !adminPasswordEnv || adminPasswordEnv === 'Admin@123456!')) {
    throw new Error('REFUSE_PRODUCTION_SEED_WITH_DEFAULT_ADMIN_CREDENTIALS: set non-default SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');
  }

  const adminEmail = adminEmailEnv ?? 'admin@uniportal.dev';
  const adminPassword = adminPasswordEnv ?? 'Admin@123456!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true },
  });

  const adminUser = existingUser
    ? await prisma.user.update({
        where: { email: adminEmail },
        data: { passwordHash, isActive: true },
      })
    : await prisma.user.create({
        data: {
          email: adminEmail,
          phone: null,
          passwordHash,
          isActive: true,
          mfaEnabled: false,
          roles: {
            create: {
              roleName: RoleName.SUPER_ADMIN,
              staffScope: Prisma.JsonNull,
              grantedBy: null,
            },
          },
        },
      });

  console.log(`  ✓ Super admin user: ${adminUser.email}`);
  console.log('  ✓ Test-only administrator password refreshed');
  console.log('\n✅ Test-only administrator seed complete!\n');
}

async function main(): Promise<void> {
  console.log('🌱 Seeding UniPortal ERP database...');

  // Render Free cannot run the full reference-data seed within its memory
  // limit during API+worker deployment. The explicit test-only mode refreshes
  // only the synthetic administrator, leaving the normal full seed unchanged.
  if (process.env['SEED_ADMIN_ONLY'] === 'true') {
    await seedAdminOnly();
    return;
  }

  // ── 1. Institution Settings ─────────────────────────────────────────────────
  const settings = await prisma.institutionSettings.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id:                   '00000000-0000-0000-0000-000000000001',
      institutionName:      process.env['SEED_INSTITUTION_NAME'] ?? 'University of Lagos',
      institutionCode:      process.env['SEED_INSTITUTION_CODE'] ?? 'UNILAG',
      institutionType:      'UNIVERSITY',
      defaultCurrency:      'NGN',
      feeWaiverCapHodPct:   30.00,
      feeWaiverCapBursarPct: 80.00,
      deanApprovalRequired: false,
      gradingSystem:        'NIGERIAN_5_POINT',
      minCreditUnitsPerSem: 15,
      maxCreditUnitsPerSem: 24,
      mfaMandatoryRoles:    ['SUPER_ADMIN', 'BURSAR', 'VC'],
      featureFlags:         DEFAULT_FEATURE_FLAGS,
      corsAllowedOrigin:    process.env['FRONTEND_ORIGIN'] ?? 'http://localhost:3000',
    },
  });
  console.log(`  ✓ InstitutionSettings: ${settings.institutionName}`);

  // ── Reference data: countries + administrative divisions ───────────────────
  // All reference snapshots are bundled and versioned with the release. Seed
  // must be deterministic and offline; a missing artifact is a release error,
  // not a reason to download mutable data during production startup.
  const referenceDir = path.join(__dirname, 'reference-data');
  const countries = JSON.parse(fs.readFileSync(path.join(referenceDir, 'countries.json'), 'utf8')) as Array<{
    iso2: string; iso3?: string | null; numericCode?: string | null; name: string; officialName?: string | null;
  }>;
  const subdivisions = JSON.parse(fs.readFileSync(path.join(referenceDir, 'subdivisions.json'), 'utf8')) as Array<{
    countryIso2: string; code: string; name: string; type: string; level: number;
  }>;

  const nigeriaLgaFile = path.join(referenceDir, 'nigeria-lgas.json');
  if (!fs.existsSync(nigeriaLgaFile)) {
    throw new Error(`Required Nigerian LGA reference snapshot is missing: ${nigeriaLgaFile}. Restore the versioned artifact before running the seed.`);
  }
  const nigeriaLgas = JSON.parse(fs.readFileSync(nigeriaLgaFile, 'utf8')) as Record<string, string[]>;
  const lgaCount = Object.values(nigeriaLgas).reduce((n, values) => n + values.length, 0);
  if (Object.keys(nigeriaLgas).length !== 37 || lgaCount !== 774) {
    throw new Error(`Nigerian reference-data integrity check failed: expected 37 administrative areas and 774 LGAs, got ${Object.keys(nigeriaLgas).length} areas and ${lgaCount} LGAs.`);
  }

  const countryByIso = new Map<string, { id: string; name: string }>();
  for (const c of countries) {
    const row = await prisma.country.upsert({
      where: { iso2: c.iso2 },
      update: { iso3: c.iso3 ?? null, numericCode: c.numericCode ?? null, name: c.name, officialName: c.officialName ?? null, isActive: true },
      create: { iso2: c.iso2, iso3: c.iso3 ?? null, numericCode: c.numericCode ?? null, name: c.name, officialName: c.officialName ?? null },
      select: { id: true, name: true },
    });
    countryByIso.set(c.iso2, row);
  }
  const nigeria = countryByIso.get('NG');
  if (!nigeria) throw new Error('Nigeria is missing from country reference data.');

  for (const d of subdivisions) {
    const country = countryByIso.get(d.countryIso2);
    if (!country) continue;
    await prisma.administrativeDivision.upsert({
      where: { countryId_code: { countryId: country.id, code: d.code } },
      update: { name: d.name, type: d.type, level: d.level, isActive: true },
      create: { countryId: country.id, code: d.code, name: d.name, type: d.type, level: d.level },
    });
  }

  // Replace the Nigeria LGA subset with the explicit Nigerian hierarchy.
  // State rows use ISO 3166-2 codes; LGA rows are level 2 and are intentionally
  // not assigned ISO codes because Nigerian LGAs do not form an ISO 3166-2
  // subdivision level.
  const ngStates = await prisma.administrativeDivision.findMany({ where: { countryId: nigeria.id, level: 1 } });
  const stateMap = new Map(ngStates.map(s => [s.name.toLowerCase(), s]));
  const stateAliases: Record<string,string> = {
    'Nassarawa': 'Nasarawa',
    'Bornu': 'Borno',
    'Federal Capital Territory': 'Abuja Federal Capital Territory',
  };
  const normalizeState = (name: string) => (stateAliases[name] ?? name).toLowerCase();
  for (const [stateName, lgas] of Object.entries(nigeriaLgas)) {
    const state = stateMap.get(normalizeState(stateName));
    if (!state) throw new Error(`Nigeria state not found in ISO reference data: ${stateName}`);
    const lgaAliases: Record<string,string> = {
      'Municipal': 'Abuja Municipal Area Council', 'Girie': 'Girei', 'Teungo': 'Toungo',
      'Gamjuwa': 'Ganjuwa', 'Katsina- Ala': 'Katsina-Ala', 'Abakalik': 'Abakaliki',
      'Esan Centtral': 'Esan Central', 'Orhionmw': 'Orhionmwon', 'Gboyin': 'Gbonyin',
      'EnuguSou': 'Enugu South', 'Igbo-Eti': 'Igbo Etiti', 'Igbo-eze North': 'Igbo-Eze North',
      'Igbo-eze South': 'Igbo-Eze South', 'Shomgom': 'Shongom', 'Yalmatu / Deba': 'Yamaltu/Deba',
      'Ihitte-Uboma Isinweke': 'Ihitte/Uboma', 'Kirika Samma': 'Kiri Kasama', 'Malam Mado': 'Malam Madori',
      'Dutsin-M': 'Dutsin-Ma', 'Kankiya': 'Kankia', 'Katsina (K)': 'Katsina', 'Arewa': 'Arewa Dandi',
      'Koko/Bes': 'Koko/Besse', 'Koton-Karfe': 'Kogi', 'Nassarawa Egon': 'Nasarawa-Eggon',
      'Badagary': 'Badagry', 'IleOluji/Okeigbo': 'Ile-Oluji/Okeigbo', 'AkokoNorthWest': 'Akoko North-West',
      'IfeCentral': 'Ife Central', 'Odo Otin': 'Odo-Otin', 'Atisbo': 'Atisbo', 'Tundun Wada': 'Tudun Wada',
      'Gwadabaw': 'Gwadabawa', 'Tangazar': 'Tangaza', 'Tambawal': 'Tambuwal', 'Borsari': 'Bursari',
      'Urue Offong|Oruko': 'Urue-Offong/Oruko', 'AniochaN': 'Aniocha North', 'AniochaS': 'Aniocha South',
      'EthiopeE': 'Ethiope East', 'IkaNorth': 'Ika North East', 'IkaSouth': 'Ika South',
      'IsokoNor': 'Isoko North', 'IsokoSou': 'Isoko South',
      'Oboma Ngwa': 'Obi Ngwa',
    };
    for (const rawName of lgas) {
      const name = lgaAliases[rawName.trim()] ?? rawName.trim();
      await prisma.administrativeDivision.upsert({
        where: { countryId_parentId_name: { countryId: nigeria.id, parentId: state.id, name } },
        update: { type: 'LGA', level: 2, isActive: true },
        create: { countryId: nigeria.id, parentId: state.id, name, type: 'LGA', level: 2 },
      });
    }
  }
  console.log(`  ✓ Reference locations: ${countries.length} countries, ${subdivisions.length} ISO subdivisions, 774 Nigerian LGAs`);

  // ── Reference data: Nigerian examination authorities/types ────────────────
  const ngExam = await prisma.country.findUniqueOrThrow({ where: { iso2: 'NG' } });
  const examAuthorities = [
    { code: 'WAEC', name: 'West African Examinations Council (WAEC)' },
    { code: 'NECO', name: 'National Examinations Council (NECO)' },
    { code: 'NABTEB', name: 'National Business and Technical Examinations Board (NABTEB)' },
    { code: 'NBAIS', name: 'National Board for Arabic and Islamic Studies (NBAIS)' },
    { code: 'OTHER', name: 'Other / International Qualification (Manual Review)' },
  ];
  const authorityMap = new Map<string, { id: string }>();
  for (const a of examAuthorities) {
    const row = await prisma.examinationAuthority.upsert({
      where: { code: a.code }, update: { name: a.name, countryId: ngExam.id, isActive: true },
      create: { code: a.code, name: a.name, countryId: ngExam.id }, select: { id: true },
    });
    authorityMap.set(a.code, row);
  }
  const examTypes: Array<{ authority: string; code: string; name: string; candidateLabel: string }> = [
    { authority: 'WAEC', code: 'WASSCE_SCHOOL', name: 'WASSCE for School Candidates', candidateLabel: 'School Candidate' },
    { authority: 'WAEC', code: 'WASSCE_PRIVATE', name: 'WASSCE for Private Candidates', candidateLabel: 'Private Candidate' },
    { authority: 'NECO', code: 'SSCE_INTERNAL', name: 'SSCE Internal', candidateLabel: 'Internal / School Candidate' },
    { authority: 'NECO', code: 'SSCE_EXTERNAL', name: 'SSCE External', candidateLabel: 'External / Private Candidate' },
    { authority: 'NABTEB', code: 'NTC', name: 'National Technical Certificate (NTC)', candidateLabel: 'Candidate' },
    { authority: 'NABTEB', code: 'NBC', name: 'National Business Certificate (NBC)', candidateLabel: 'Candidate' },
    { authority: 'NABTEB', code: 'ANTC', name: 'Advanced National Technical Certificate (ANTC)', candidateLabel: 'Candidate' },
    { authority: 'NABTEB', code: 'ANBC', name: 'Advanced National Business Certificate (ANBC)', candidateLabel: 'Candidate' },
    { authority: 'NBAIS', code: 'SSCE', name: 'Senior Secondary Certificate Examination (legacy)', candidateLabel: 'Candidate' },
    { authority: 'NBAIS', code: 'SAISSCE', name: 'Senior Arabic and Islamic Secondary School Certificate Examination (SAISSCE)', candidateLabel: 'Candidate' },
    { authority: 'NBAIS', code: 'SCIENCE', name: 'NBAIS Science Examination', candidateLabel: 'Candidate' },
    { authority: 'NBAIS', code: 'TAHFEEZ', name: 'NBAIS Tahfeez Examination', candidateLabel: 'Candidate' },
    { authority: 'OTHER', code: 'OTHER', name: 'Other Recognized Qualification', candidateLabel: 'Manual Review' },
  ];
  for (const t of examTypes) {
    const authority = authorityMap.get(t.authority)!;
    await prisma.examinationType.upsert({
      where: { authorityId_code: { authorityId: authority.id, code: t.code } },
      update: { name: t.name, candidateLabel: t.candidateLabel, isActive: t.code !== 'SSCE' },
      create: { authorityId: authority.id, code: t.code, name: t.name, candidateLabel: t.candidateLabel },
    });
  }
  const subjects: Array<{ code: string; name: string; category: string; isActive?: boolean }> = [
    // Nigerian SSCE/JAMB core and general subjects.
    { code: 'ENG', name: 'English Language', category: 'Nigerian Core' },
    { code: 'MAT', name: 'Mathematics', category: 'Nigerian Core' },
    { code: 'BIO', name: 'Biology', category: 'Science' },
    { code: 'CHE', name: 'Chemistry', category: 'Science' },
    { code: 'PHY', name: 'Physics', category: 'Science' },
    { code: 'ECO', name: 'Economics', category: 'Business and Social Sciences' },
    { code: 'GEO', name: 'Geography', category: 'Humanities and Social Sciences' },
    { code: 'GOV', name: 'Government', category: 'Humanities and Social Sciences' },
    { code: 'LIT', name: 'Literature in English', category: 'Languages and Literature' },
    { code: 'CRS', name: 'Christian Religious Studies', category: 'Religious Studies' },
    { code: 'IRS', name: 'Islamic Religious Studies', category: 'Religious Studies' },
    { code: 'AGRIC', name: 'Agricultural Science', category: 'Agriculture' },
    { code: 'COMMERCE', name: 'Commerce', category: 'Business and Social Sciences' },
    { code: 'ACCOUNT', name: 'Financial Accounting', category: 'Business and Social Sciences' },
    { code: 'MARKETING', name: 'Marketing', category: 'Business and Social Sciences' },
    { code: 'CIVIC', name: 'Civic Education', category: 'Humanities and Social Sciences' },
    { code: 'HISTORY_NG', name: 'Nigerian History', category: 'Humanities and Social Sciences' },
    { code: 'DATA_PROC', name: 'Data Processing', category: 'Technology' },
    { code: 'ICT', name: 'Computer Studies', category: 'Technology' },
    { code: 'FURTHER_MATH', name: 'Further Mathematics', category: 'Mathematics' },
    { code: 'TECH_DRAW', name: 'Technical Drawing', category: 'Technology and Technical' },
    { code: 'BASIC_SCI', name: 'Basic Science', category: 'Science' },
    { code: 'BASIC_TECH', name: 'Basic Technology', category: 'Technology and Technical' },
    { code: 'HAUSA', name: 'Hausa', category: 'Nigerian Languages' },
    { code: 'YORUBA', name: 'Yoruba', category: 'Nigerian Languages' },
    { code: 'IGBO', name: 'Igbo', category: 'Nigerian Languages' },
    { code: 'ARABIC', name: 'Arabic', category: 'Languages' },
    { code: 'FRENCH', name: 'French', category: 'Languages' },
    { code: 'HEALTH_ED', name: 'Health Education', category: 'Health and Physical Education' },
    { code: 'PHYSICAL_ED', name: 'Physical Education', category: 'Health and Physical Education' },
    { code: 'FOODS_NUTRITION', name: 'Foods and Nutrition', category: 'Home Economics' },
    { code: 'HOME_MGMT', name: 'Home Management', category: 'Home Economics' },
    { code: 'MUSIC', name: 'Music', category: 'Creative Arts' },
    { code: 'VISUAL_ARTS', name: 'Visual Arts', category: 'Creative Arts' },
    // Nigerian vocational, trade, business and technical offerings.
    { code: 'ANIMAL_HUSB', name: 'Animal Husbandry', category: 'Agriculture and Vocational' },
    { code: 'FISHERIES', name: 'Fisheries', category: 'Agriculture and Vocational' },
    { code: 'CROP_HUSB', name: 'Crop Husbandry', category: 'Agriculture and Vocational' },
    { code: 'OFFICE_PRACTICE', name: 'Office Practice', category: 'Business and Vocational' },
    { code: 'BOOK_KEEPING', name: 'Book-keeping', category: 'Business and Vocational' },
    { code: 'INSURANCE', name: 'Insurance', category: 'Business and Vocational' },
    { code: 'CATERING_CRAFT', name: 'Catering Craft Practice', category: 'Trade and Technical' },
    { code: 'GARMENT_MAKING', name: 'Garment Making', category: 'Trade and Technical' },
    { code: 'COSMETOLOGY', name: 'Cosmetology', category: 'Trade and Technical' },
    { code: 'BUILDING_CONS', name: 'Building Construction', category: 'Trade and Technical' },
    { code: 'AUTO_MECHANICS', name: 'Auto Mechanics', category: 'Trade and Technical' },
    { code: 'ELECTRICAL_INST', name: 'Electrical Installation and Maintenance Work', category: 'Trade and Technical' },
    { code: 'ELECTRONICS', name: 'Electronics', category: 'Trade and Technical' },
    { code: 'WOODWORK', name: 'Woodwork', category: 'Trade and Technical' },
    { code: 'METALWORK', name: 'Metalwork', category: 'Trade and Technical' },
    { code: 'WELDING', name: 'Welding and Fabrication', category: 'Trade and Technical' },
    { code: 'PLUMBING', name: 'Plumbing and Pipefitting', category: 'Trade and Technical' },
    { code: 'GRAPHIC_DESIGN', name: 'Graphic Design', category: 'Creative and Technical' },
    { code: 'PRINTING_CRAFT', name: 'Printing Craft Practice', category: 'Trade and Technical' },
    { code: 'LEATHERWORK', name: 'Leather Goods Manufacturing', category: 'Trade and Technical' },
    { code: 'CERAMICS', name: 'Ceramics', category: 'Creative and Technical' },
    { code: 'TOURISM', name: 'Tourism', category: 'Business and Vocational' },
    { code: 'TRAVEL_TOURISM', name: 'Travel and Tourism', category: 'International and Vocational' },
    { code: 'SALES_MANSHIP', name: 'Salesmanship', category: 'Business and Vocational' },
    // International secondary and pre-university offerings.
    { code: 'COMPUTER_SCIENCE', name: 'Computer Science', category: 'International Sciences and Technology' },
    { code: 'BUSINESS', name: 'Business Studies', category: 'International Business and Social Sciences' },
    { code: 'BUSINESS_MGMT', name: 'Business Management', category: 'International Business and Social Sciences' },
    { code: 'PSYCHOLOGY', name: 'Psychology', category: 'International Social Sciences' },
    { code: 'SOCIOLOGY', name: 'Sociology', category: 'International Social Sciences' },
    { code: 'ANTHROPOLOGY', name: 'Social and Cultural Anthropology', category: 'International Social Sciences' },
    { code: 'PHILOSOPHY', name: 'Philosophy', category: 'International Humanities' },
    { code: 'GLOBAL_POLITICS', name: 'Global Politics', category: 'International Humanities' },
    { code: 'DIGITAL_SOCIETY', name: 'Digital Society', category: 'International Humanities and Technology' },
    { code: 'ENV_MANAGEMENT', name: 'Environmental Management', category: 'International Sciences' },
    { code: 'ENV_SYSTEMS', name: 'Environmental Systems and Societies', category: 'International Sciences' },
    { code: 'MARINE_SCIENCE', name: 'Marine Science', category: 'International Sciences' },
    { code: 'SPORTS_HEALTH', name: 'Sports, Exercise and Health Science', category: 'International Sciences and Health' },
    { code: 'DESIGN_TECH', name: 'Design and Technology', category: 'International Creative and Technical' },
    { code: 'FOOD_NUTRITION', name: 'Food and Nutrition', category: 'International Home Economics' },
    { code: 'STATISTICS', name: 'Statistics', category: 'Mathematics' },
    { code: 'ADDITIONAL_MATH', name: 'Additional Mathematics', category: 'Mathematics' },
    { code: 'GLOBAL_PERSPECTIVES', name: 'Global Perspectives', category: 'International Humanities' },
    { code: 'ART_DESIGN', name: 'Art and Design', category: 'International Creative Arts' },
    { code: 'DRAMA', name: 'Drama', category: 'International Creative Arts' },
    { code: 'THEATRE', name: 'Theatre', category: 'International Creative Arts' },
    { code: 'DANCE', name: 'Dance', category: 'International Creative Arts' },
    { code: 'FILM', name: 'Film', category: 'International Creative Arts' },
    { code: 'VISUAL_ART', name: 'Visual Art', category: 'International Creative Arts' },
    { code: 'SPANISH', name: 'Spanish', category: 'International Languages' },
    { code: 'GERMAN', name: 'German', category: 'International Languages' },
    { code: 'ITALIAN', name: 'Italian', category: 'International Languages' },
    { code: 'PORTUGUESE', name: 'Portuguese', category: 'International Languages' },
    { code: 'CHINESE', name: 'Chinese', category: 'International Languages' },
    { code: 'JAPANESE', name: 'Japanese', category: 'International Languages' },
    { code: 'RUSSIAN', name: 'Russian', category: 'International Languages' },
    { code: 'LATIN', name: 'Latin', category: 'International Classical Languages' },
    { code: 'CLASSICAL_GREEK', name: 'Classical Greek', category: 'International Classical Languages' },
    { code: 'KISWAHILI', name: 'Kiswahili', category: 'International Languages' },
    // Historical subjects remain available for legacy records but not new applications.
    { code: 'MATH_STUDIES_LEGACY', name: 'Mathematical Studies', category: 'Legacy International Mathematics', isActive: false },
    { code: 'ITGS_LEGACY', name: 'Information Technology in a Global Society', category: 'Legacy International Technology', isActive: false },
    { code: 'WORLD_POLITICS_LEGACY', name: 'World Politics', category: 'Legacy International Humanities', isActive: false },
    { code: 'PEACE_CONFLICT_LEGACY', name: 'Peace and Conflict Studies', category: 'Legacy International Humanities', isActive: false },
  ];
  for (const subject of subjects) await prisma.academicSubject.upsert({
    where: { code: subject.code },
    update: { name: subject.name, category: subject.category, isActive: subject.isActive ?? true },
    create: { code: subject.code, name: subject.name, category: subject.category, isActive: subject.isActive ?? true },
  });
  console.log(`  ✓ Examination reference data: ${examAuthorities.length} authorities, ${examTypes.length} examination types, ${subjects.length} subjects`);


  // ── 2. Super Admin User ─────────────────────────────────────────────────────
  const adminEmailEnv    = process.env['SEED_ADMIN_EMAIL'];
  const adminPasswordEnv = process.env['SEED_ADMIN_PASSWORD'];
  const isProduction     = process.env['NODE_ENV'] === 'production';

  if (isProduction && (!adminEmailEnv || !adminPasswordEnv || adminPasswordEnv === 'Admin@123456!')) {
    throw new Error('REFUSE_PRODUCTION_SEED_WITH_DEFAULT_ADMIN_CREDENTIALS: set non-default SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');
  }

  const adminEmail    = adminEmailEnv ?? 'admin@uniportal.dev';
  const adminPassword = adminPasswordEnv ?? 'Admin@123456!';
  const passwordHash  = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where:  { email: adminEmail },
    update: {},
    create: {
      email:        adminEmail,
      phone:        null,
      passwordHash,
      isActive:     true,
      mfaEnabled:   false,
      roles: {
        create: {
          roleName:   RoleName.SUPER_ADMIN,
          staffScope: Prisma.JsonNull,
          grantedBy:  null,
        },
      },
    },
  });
  console.log(`  ✓ Super admin user: ${adminUser.email}`);
  if (adminPassword === 'Admin@123456!') {
    console.log('  ⚠️  Default password used — change immediately after first login!');
  }

  // ── 3. Default Notification Templates ──────────────────────────────────────
  const templates = [
    {
      templateKey: 'password_reset_otp',
      channel:     'EMAIL' as const,
      subject:     'Password Reset — {{institutionName}}',
      body: `
Dear {{name}},

You requested a password reset for your UniPortal account.

Your One-Time Password (OTP) is: **{{otp}}**

This OTP expires in 10 minutes.

If you did not request this, please contact IT support immediately.

— {{institutionName}} IT Team
      `.trim(),
      variables: {
        variables: [
          { name: 'name',            description: 'User full name',            example: 'John Doe' },
          { name: 'otp',             description: '6-digit OTP code',          example: '482951' },
          { name: 'institutionName', description: 'Institution display name',  example: 'University of Lagos' },
        ],
      },
    },
    {
      templateKey: 'welcome_new_user',
      channel:     'EMAIL' as const,
      subject:     'Welcome to {{institutionName}} Portal',
      body: `
Dear {{name}},

Your UniPortal account has been created.

Email:    {{email}}
Password: {{temporaryPassword}}

Please log in and change your password immediately.

Portal URL: {{portalUrl}}

— {{institutionName}} IT Team
      `.trim(),
      variables: {
        variables: [
          { name: 'name',               description: 'User full name' },
          { name: 'email',              description: 'Login email' },
          { name: 'temporaryPassword',  description: 'Temporary password' },
          { name: 'portalUrl',          description: 'Portal login URL' },
          { name: 'institutionName',    description: 'Institution name' },
        ],
      },
    },
  ] as const;

  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        uq_notif_template_channel: { templateKey: template.templateKey, channel: template.channel as any },
      },
      update: {},
      create: {
        templateKey: template.templateKey,
        channel:     template.channel,
        subject:     template.subject,
        body:        template.body,
        variables:   template.variables,
        isActive:    true,
      },
    });
    console.log(`  ✓ Template: ${template.templateKey} (${template.channel})`);
  }

  // AUDIT-H3 follow-up: ClearanceService.getStudentClearance() computes
  // eligibleForGraduation as `requiredItems.every(...)` — on an EMPTY
  // ClearanceItem table that's vacuously true. Seed the standard items
  // (spec §13.5) so that doesn't silently happen in any freshly-seeded
  // environment.
  const clearanceItems = [
    { name: 'Fees Clearance',         responsibleRole: 'BURSAR' as const,    isAutoCleared: true,  sortOrder: 1 },
    { name: 'Library Clearance',      responsibleRole: 'SUPPORT_STAFF' as const, isAutoCleared: false, sortOrder: 2 },
    { name: 'Hostel Clearance',       responsibleRole: 'SUPPORT_STAFF' as const, isAutoCleared: false, sortOrder: 3 },
    { name: 'Clinic Clearance',       responsibleRole: 'SUPPORT_STAFF' as const, isAutoCleared: false, sortOrder: 4 },
    { name: 'Timetable/Exams Clearance', responsibleRole: 'STAFF' as const, isAutoCleared: false, sortOrder: 5 },
    { name: 'Departmental Clearance', responsibleRole: 'HOD' as const,       isAutoCleared: false, sortOrder: 6 },
    { name: 'Faculty Clearance',      responsibleRole: 'DEAN' as const,      isAutoCleared: false, sortOrder: 7 },
    { name: 'Registrar Clearance',    responsibleRole: 'REGISTRAR' as const, isAutoCleared: false, sortOrder: 8 },
  ];
  for (const item of clearanceItems) {
    const existing = await prisma.clearanceItem.findFirst({ where: { name: item.name } });
    if (!existing) {
      await prisma.clearanceItem.create({ data: { ...item, isRequiredForGraduation: true, isActive: true } });
    }
    console.log(`  ✓ Clearance item: ${item.name}`);
  }

  console.log('\n✅ Seeding complete!\n');
  console.log(`  Admin email:    ${adminEmail}`);
  console.log(`  Admin password: ${adminPassword === 'Admin@123456!' ? '[DEFAULT — CHANGE NOW]' : '[custom]'}`);
  console.log(`  Swagger UI:     http://localhost:3001/api/docs`);
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
