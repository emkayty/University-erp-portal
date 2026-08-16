# V18 — Canonical O'Level Examination Authority Model

The ERP now treats examination authority and examination type as separate reference data.

## Nigerian authorities currently configured

- WAEC
- NECO
- NABTEB
- NBAIS

NBAIS is the canonical name: **National Board for Arabic and Islamic Studies**. Its official site describes it as an accredited examination body offering national examinations in SAISSCE, Tahfeez and Science. citeturn0search0

## Type handling

WAEC:
- Internal / school candidate
- External / private candidate

NECO:
- Internal / school candidate
- External / private candidate

NABTEB:
- Certificate examination (institution policy can later split the applicable NABTEB pathways)

NBAIS:
- SAISSCE Internal / June-July
- SAISSCE External / November-December
- Science
- Tahfeez (inactive by default for ordinary O'Level admission until the institution's admission policy explicitly recognizes it)

The ERP must not assume that every examination/certificate from an authority automatically satisfies every programme's admission requirement. Recognition is a policy decision.

## Data model rule

Applicant result records should reference:
1. examination authority;
2. examination type;
3. examination year/sitting;
4. candidate/examination number;
5. centre/school information where applicable;
6. subject results;
7. uploaded evidence;
8. verification status.

The old enum remains available for historical compatibility. New admissions should use the normalized reference-data model.

## Why this is safer

This prevents the application from requiring a code change every time the institution adds a recognized examination authority or modifies a sitting/type. It also prevents WAEC/NECO/NBAIS-specific concepts from being incorrectly treated as interchangeable.

The Nigerian education mapping published by NEMIS identifies senior-secondary qualifications including SSCE and SAISSCE, supporting the separation of SAISSCE from generic SSCE terminology. citeturn0search13
