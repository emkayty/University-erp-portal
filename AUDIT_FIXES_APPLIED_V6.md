# Admissions Reference Data V6 — Applied Fixes

## Applied

- Added normalized `Country` reference data.
- Added hierarchical `AdministrativeDivision` reference data.
- Added ISO-style country/subdivision snapshots.
- Added Nigerian State/FCT → LGA hierarchy.
- Added seed-time integrity gate requiring 37 Nigerian top-level areas and 774 LGAs.
- Added normalization for common spelling/format inconsistencies in the LGA source.
- Added controlled Examination Authority catalogue: WAEC, NECO, NABTEB, NBAIS, plus Other/International Manual Review.
- Added authority-specific examination types.
- Added controlled academic subject catalogue.
- Added normalized applicant origin IDs.
- Added normalized address location IDs.
- Added examination authority/type references to O'Level sittings.
- Added public reference-data APIs.
- Added server-side validation for country → region and Nigeria region → LGA relationships.
- Added server-side validation for examination authority → examination type relationships.
- Converted applicant location and O'Level standardized values to controlled selectors.
- Added foreign-country region/province support with a neutral administrative-division model.
- Preserved legacy string fields for historical data and compatibility.
- Added fallback free-text only where no standardized administrative division exists.
- Preserved the previous Admissions V5 and Exams/Grading V4 work.

## Validation performed

- `countries.json`: valid JSON, 249 ISO-style country/territory records.
- `subdivisions.json`: valid JSON, 5,046 ISO-style principal subdivision records.
- Edited TypeScript/TSX files have balanced delimiters.
- A TypeScript syntax-oriented check was run; full project type-check could not complete because project dependencies/generated Prisma client are not installed in this environment.
- Prisma migration deployment was not executed because no project database/dependency installation is available in this environment.

## Important operational note

The Nigerian LGA source is fetched once during database seeding if `prisma/reference-data/nigeria-lgas.json` is not already present. The seed refuses to accept an incomplete list. After the first successful seed, the downloaded file is retained locally for repeatable subsequent seeds.
