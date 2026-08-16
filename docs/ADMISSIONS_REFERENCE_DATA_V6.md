# Admissions Reference Data V6

## Purpose

Admissions now uses controlled reference data wherever the value has a finite, standardized vocabulary. Applicants should select standardized values rather than type them.

## Locations

- ISO-style country reference data is bundled in `apps/api/prisma/reference-data/countries.json`.
- ISO 3166-style principal administrative subdivisions are bundled in `subdivisions.json`.
- Nigeria is modeled as **36 states + FCT** with **774 LGAs**.
- Nigerian hierarchy: Country → State/FCT → LGA.
- Foreign hierarchy: Country → Region/Province/State/etc. The UI uses the neutral label `State / Province / Region`.
- The API validates that a selected region belongs to the selected country and that a Nigerian LGA belongs to the selected Nigerian state.

The NBS describes Nigeria as 36 states + FCT and 774 LGAs. The Nigerian LGA seed is integrity-checked for 37 top-level Nigerian administrative areas and 774 LGAs before it is accepted.

## Examination references

Seeded Nigerian authorities:

- WAEC — West African Examinations Council
- NECO — National Examinations Council
- NABTEB — National Business and Technical Examinations Board
- NBAIS — National Board for Arabic and Islamic Studies

WAEC types are represented as School Candidates and Private Candidates rather than forcing an inaccurate universal `Internal/External` label. NECO exposes Internal and External in its configured reference types.

## Applicant UX

The public application now uses dependent searchable-style native selectors for:

- Country/nationality
- State / Province / Region
- Nigerian LGA
- Examination authority
- Examination type
- O'Level subject
- O'Level grade

Free text remains only for information that is inherently variable, such as street address and document numbers.

## Backward compatibility

Existing string fields (`stateOfOrigin`, `lga`, address `state/lga/country`, and the legacy O'Level `examType`) remain available for historical records and compatibility. New applications should populate the normalized reference IDs.
