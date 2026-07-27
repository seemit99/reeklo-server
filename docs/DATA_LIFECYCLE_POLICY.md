# Data lifecycle policy

## Current mandatory rule

- Persisted business data must expose a `use_yn` column.
- `use_yn = 'Y'` means the row is active and available to normal application queries.
- `use_yn = 'N'` means the row is logically deleted or disabled.
- Application code must not physically delete persisted business rows with Prisma `delete`, `deleteMany`, or SQL `DELETE`.
- Normal reads must explicitly filter active rows with `use_yn = 'Y'`.
- Deactivation must update `use_yn` to `N` and preserve the original row for audit and future policy handling.

Retention, restoration, anonymization, and final disposal rules will be defined separately.

## Existing-code exception inventory

The repository still contains legacy physical-delete paths for rooms, character parts,
guilds and memberships, friendships, blocks, and email verification codes. They are not
compliant with the new rule and must be migrated in a dedicated policy change before
those paths are treated as compliant.
