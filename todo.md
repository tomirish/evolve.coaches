# Todo

- [ ] **Switch off Supabase's legacy API keys** (Settings → API Keys, or the Management API; reversible). The Edge Functions moved to the new keys on 2026-11-25 (all seven, 196/196 live tests) and nothing else uses the legacy ones (checked: site, tests, NAS probe, database webhooks/`pg_net`, NAS copier/listener/backups). Needs a Supabase personal access token; legacy keys stop working at the end of 2026 anyway.
- [ ] **`r2-upload-url` signs any filename** (found 2026-11-25): it checks the caller is signed in but not the key it signs, so a coach could get an upload URL for another movement's object and overwrite it. Validate the filename (the UUID.ext pattern `r2-signed-url` and `r2-delete` use) and add a negative test to `tests/security.spec.js`.
