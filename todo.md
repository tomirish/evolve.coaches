# Todo

- [ ] **`r2-upload-url` signs any filename** (found 2026-11-25): it checks the caller is signed in but not the key it signs, so a coach could get an upload URL for another movement's object and overwrite it. Validate the filename (the UUID.ext pattern `r2-signed-url` and `r2-delete` use) and add a negative test to `tests/security.spec.js`.
