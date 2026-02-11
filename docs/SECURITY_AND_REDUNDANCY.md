
### Optional hardening

- **Admin secret:** Use a long random value and rotate if leaked; avoid reusing the same secret elsewhere.
---

## Redundant or removable files/code

### Removed

- **`app/api/admin/match-odds`** and **`app/api/admin/fetch-odds-daily`** have been deleted (redundant with map-odds and cron).

### Safe to delete (other)

### Keep (not redundant)

- **`/api/admin/update-fixture-result`** – Used by admin UI; only updates fixture score (no status/settle). Distinct from sync-results and settle-fixtures.
- **`/api/admin/sync-results`** vs **`/api/cron/sync-results`** – Same logic (sync lib), different trigger (admin vs cron). Both needed.
- **`/api/standings`** – Used by `app/table/page.tsx`.

---

## Summary

- **Security:** Submit now requires JWT and uses the authenticated user; fetch-current requires `CRON_SECRET` when set. Other routes were already appropriately protected.
- **Redundant:** Test API folder, match-odds, fetch-odds-daily (removed), empty `docs/api.md` and `src/types/db.ts`, and the unused components listed above can be removed or guarded.
