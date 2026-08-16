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

async function main(): Promise<void> {
  console.log('🌱 Seeding UniPortal ERP database...');

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
  const subjects = [
    ['ENG','English Language'],['MAT','Mathematics'],['BIO','Biology'],['CHE','Chemistry'],['PHY','Physics'],
    ['ECO','Economics'],['GEO','Geography'],['GOV','Government'],['LIT','Literature in English'],['CRS','Christian Religious Studies'],
    ['IRS','Islamic Religious Studies'],['AGRIC','Agricultural Science'],['COMMERCE','Commerce'],['ACCOUNT','Financial Accounting'],
    ['CIVIC','Civic Education'],['DATA_PROC','Data Processing'],['ICT','Computer Studies'],['FURTHER_MATH','Further Mathematics'],
    ['TECH_DRAW','Technical Drawing'],['BASIC_SCI','Basic Science'],['BASIC_TECH','Basic Technology'],['HAUSA','Hausa'],['YORUBA','Yoruba'],['IGBO','Igbo'],
  ];
  for (const [code,name] of subjects) await prisma.academicSubject.upsert({ where:{code}, update:{name,isActive:true}, create:{code,name} });
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
