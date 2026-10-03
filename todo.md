# evolve.coaches — todo

- [ ] `tests/helpers/global-setup.js:18` deletes `.like('name', '__%__%')`, but `_` is a single-character wildcard in SQL LIKE, so it deletes **every** movement owned by the test coach, whatever its name. Harmless today (the test coach only owns test rows), but it silently wiped manual test rows on 2026-10-02. Escape the underscores (`'\\_\\_%\\_\\_%'`) or match fixture names exactly.
- [ ] Video links — Instagram parts: the embed shows the whole post until the NAS copy lands (Instagram's embed has no start/end). Expected, per spec; revisit only if coaches find it confusing.
- [ ] Video links — if Instagram starts refusing anonymous downloads ("Copy failed" alerts on Instagram rows), add a throwaway account's cookies to 1Password item `Instagram Archiver`, field `cookies` (see dev.tools `automation/archive_evolve_links/README.md`).
