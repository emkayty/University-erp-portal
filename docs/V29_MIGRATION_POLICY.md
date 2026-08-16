# V29 Full UI Migration Policy

1. New ERP UI uses V28 `--u-*` tokens and V29 unified primitives.
2. Do not add new glassmorphism, duplicate ERP tokens, bespoke button/status systems, or unstructured primary navigation.
3. Migrate the real route/component, not only a wrapper.
4. Preserve domain/API/business logic unless a separate domain fix is explicitly required.
5. Every workflow must handle loading, empty, error, unauthorized and success states where applicable.
6. Consequential actions require explicit permission and confirmation.
7. Mobile users must be able to complete the primary task without a desktop-only dependency.
8. Sensitive data is minimized and never exposed merely for visual convenience.
9. Tables/forms must remain usable with long Nigerian names, programmes, course titles and financial amounts.
10. Visual QA must be performed at 320, 360, 390, 430, 768 and desktop widths.
