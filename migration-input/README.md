# Legacy migration input

`football.db` is the immutable source for the Yahoo-era (2013–2020) migration.

- Captured: 2026-07-21
- Size: 3,190,784 bytes
- SHA-256: `6c44d98b65be5a5e22505132b22727abbfe46a45516518b7486ae9941e70ffce`
- Original location during capture: `../football.db`
- SQLite integrity check at audit time: `ok`

Rules:

- Open this file read-only.
- Never run the legacy Yahoo importer against it.
- Import and integration tests must create a disposable working copy.
- Do not add Yahoo credentials or OAuth tokens to this project.

