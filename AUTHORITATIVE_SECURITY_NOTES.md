# Authoritative security notes used during remediation

## OWASP Forgot Password Cheat Sheet
Source: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html

Relevant guidance: reset identifiers should be generated with a cryptographically safe algorithm, be sufficiently long, stored securely, single-use, and expire. Reset requests should have consistent responses and anti-automation controls. The project already uses rate limiting and hashed OTPs; the repair adds serialized single-use consumption around bcrypt verification so concurrent valid requests cannot both redeem the same OTP.

## OWASP Session Management Cheat Sheet
Source: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

Relevant guidance: session identifiers are equivalent to authentication credentials for their lifetime and must be protected, renewed appropriately, and invalidated on logout or risk events. The project keeps refresh tokens in httpOnly cookies and access tokens in memory; the repair preserves that design and ensures the frontend only marks the routing indicator after a real authenticated response.

## Redis Lua scripting documentation
Source: https://redis.io/docs/latest/develop/programmability/eval-intro/

Relevant guidance: Redis scripts execute atomically, and parameterized scripts should receive key names through KEYS and values through ARGV. The project already uses EVALSHA with NOSCRIPT fallback for refresh-token rotation; the repair follows the same pattern for ownership-safe lock release around password-reset OTP redemption.

## Nigeria Data Protection Commission
Sources: https://ndpc.gov.ng/download/nigeria-data-protection-act-2023 and https://ndpc.gov.ng/resources/

These primary sources are retained for the privacy/erasure and retention workstream. The repair will not claim regulatory compliance merely from code changes; live data-inventory, retention, legal-hold, processor, and erasure tests remain required.
