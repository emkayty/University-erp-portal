# V21 Frontend Migration

V21 adds the shared data-surface and confirmation interaction layer and inventories all detected frontend routes.

The goal is to prevent mixed UX patterns as individual modules are migrated:
- consistent page shells
- consistent tables/data surfaces
- consistent status semantics
- consistent loading/empty/error handling
- consistent confirmation for consequential actions
- responsive behavior
- accessible keyboard focus

The route inventory is the source for the next page-by-page visual QA pass.
