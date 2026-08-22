# Configurable identifiers and identity cards

## Matriculation-number policy

UniPortal does not treat the student matriculation number as a hard-coded application constant. Super Admin configuration controls the format used for **future matriculations** through the existing institution-settings governance path.

Supported tokens are `{INSTITUTION}`, `{FACULTY}`, `{DEPT}`, `{PROGRAMME}`, `{YEAR}`, `{ENTRY_YEAR}`, and exactly one final sequence token, either `{SEQ}` or a padded form such as `{SEQ:05}`. Example: `{INSTITUTION}/{YEAR}/{DEPT}/{SEQ:05}` produces values such as `UNI/2026/CSC/00012`.

The sequence can be institution-wide, admission-year-wide, or scoped to department plus admission year. PostgreSQL advisory locking remains in place so concurrent matriculation requests cannot issue the same sequence. Existing student numbers are never silently renumbered when policy changes; the selected format applies to new records only.

## Identity-card templates

The built-in template uses the institution’s configured primary and accent colours and supports the holder’s name, matriculation or employee identifier, programme or designation, card number, serial number, expiry date, photo, and opaque QR verification link. The QR link does not expose private contact, date-of-birth, or address information.

An institution may create artwork in a third-party design tool and configure approved front and back artwork references. Relative private-object-storage keys are accepted directly. HTTPS artwork is accepted only when its host is explicitly allow-listed by the deployment environment through `IDENTITY_CARD_MEDIA_HOSTS`; arbitrary media URLs are not fetched. If artwork is unavailable, the renderer falls back to the built-in layout rather than producing a broken card.

## Bulk PDF print specification

Authorized Registrar, Super Admin, and HR Manager users can select active cards in the card register and download a controlled PDF. The PDF uses ISO/IEC 7810 ID-1 dimensions (85.60 mm by 53.98 mm). It creates a front page and a corresponding back page for each **five-card batch**: five centered card positions are printed on the front, and the same five positions are repeated on the back for short-edge duplex printing. Each front/back page pair therefore produces five physical cards.

For reliable physical output, print at 100% scale with no “fit to page” adjustment, use A4 paper, select short-edge duplex, and test alignment with plain paper before using card stock. The API limits one request to 500 active cards and records the export in the audit trail. Revoked, replaced, expired, and suspended cards are not accepted for bulk printing.

## Active-student directory

Staff with an effective `records` scope can use the dedicated active-student directory. The server enforces the active status, applies department and faculty scope constraints from the effective authorization context, and supports search by matriculation number, name, or email, level filtering, and pagination. The interface presents only operational student fields and links to the separately authorized profile view; sensitive identifiers such as NIN are not included in the directory response.

Registrar, Super Admin, HOD, Dean, and Bursar workflows continue to use the existing student list permissions. Student self-service does not issue an all-students query.

## References

[1]: https://github.com/Hopding/pdf-lib "pdf-lib — PDF document creation and modification for JavaScript"

[2]: https://github.com/soldair/node-qrcode "node-qrcode — QR code generation for Node.js and browsers"

[3]: https://www.iso.org/standard/70486.html "ISO/IEC 7810:2019 — Identification cards: Physical characteristics"

The renderer uses the document-composition and image-embedding capabilities described in [1], QR generation from [2], and the ID-1 physical dimensions specified by [3].
