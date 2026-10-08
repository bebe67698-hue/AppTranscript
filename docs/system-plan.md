# Admin and student implementation

## Goal and scope
Continue the user's approved IT-only requirements in the existing vanilla HTML/CSS/JS design. Build working accounts, role enforcement, curriculum/course/mapping add/edit, XLSX preview/import, PDF/JPG reading, mandatory review, exact code + curriculum-year matching, minimum C, three result states, and student history. No REGIS, official approval, or inferred course mappings.

## Architecture
- Node 24 built-in HTTP, crypto and SQLite. New database `data/transfer.sqlite` initialized on first run; no existing database migration. Loopback server on port 4174.
- Session cookies HttpOnly/SameSite=Strict, password scrypt, server-side roles, same-origin mutation checks and session CSRF token. First admin setup only while database has no admin and on loopback. Student signup cannot grant admin privileges.
- Browser PDF.js and Tesseract.js read local documents using locally served English/Thai model files. File bytes are not sent to third-party APIs. Extracted/reviewed course rows are posted to our backend. Limit file size, pages and OCR canvas dimensions, show raw text and review uncertainty, permit manual correction and row addition.
- ExcelJS reads `.xlsx` in a browser worker with timeout, previews three template sheets, then sends validated normalized rows. Server revalidates and imports all data in one transaction. Existing records are updated only after preview confirmation.
- Public landing page leads to `/student.html` and `/admin.html`. Shared shell/auth module with separate role modules. No sample records inserted into the actual database.

## Tasks and verification
1. Tests for role isolation, ownership, invalid payloads, code/year matching and persistence; implement storage + API.
2. Tests for OCR text parsing and workbook normalization; implement local OCR and Excel modules. Unrecognized grades remain for review rather than assumed passing.
3. Create role-based application pages using existing palette/fonts. Build functional blank/error/loading/success states, forms, edit dialogs, import preview, OCR correction and result/history views.
4. Wire landing links, document setup and dependencies, run syntax and tests. Browser-test admin → curriculum/course/mapping → Excel preview/import; student → actual document reading → correction → results → history. Check mobile and console. Use only temporary test accounts/databases for QA; leave the real app unconfigured for the user.

## Boundaries
No deployment, external messaging, hard-coded passwords, existing database migrations or deletion. Raw Transcript files remain local. This is a local runnable system; internet deployment requires HTTPS, hosting and account recovery decisions separately.

## Verification completed
- `npm run check`: 18 JavaScript files passed syntax checks.
- `npm test`: 12 tests passed, including an on-disk SQLite close/reopen test.
- Isolated in-memory browser QA: first-admin setup, student registration, curriculum/course/mapping add and edit, XLSX preview and confirmed import, text PDF, scanned PDF and Thai JPG reading, manual OCR corrections, review confirmation, three matching outcomes, result invalidation, history and OCR cancellation.
- Thai image OCR produced uncertain codes and digit grades. Parser regression now preserves these rows for explicit human correction; no automatic passing grade is inferred.
- Responsive QA at 390 and 320 pixels: Admin navigation and curriculum dialog, Student upload/editor/history and setup forms. Document width did not exceed viewport; no console warnings/errors in final mobile session.
- Real server started on port 4174 with an empty persistent database, ready for user-owned first-admin setup. Test accounts were confined to the in-memory QA server.
- Dependency audit reports two moderate findings through ExcelJS/uuid; see README. This verification is not a production security audit.

## Admin deletion and study-plan import update
- Added per-row delete confirmation for curricula, courses and mappings. Server enforces Admin and CSRF, rejects deletion with live dependents (409), and keeps historical check snapshots. No schema migration.
- Extended the existing Excel worker/parser to accept Thai study plans while retaining the three-sheet template. Admin supplies the destination curriculum year explicitly because the sample names an admission year. Merged anchors, repeated headers, continued course names and non-course total/formula rows are handled; no mappings are inferred.
- Read the user-specified workbook in Downloads without changing it: 45 courses, 131 credits, one curriculum, zero mappings. Preview rolls back all writes.
- Verification: `npm run check` passed 18 files; `npm test` passed 15 tests. New tests first failed for absent deletion and study-plan support, then passed.
- In-app browser at 1440×1000 and mobile 390×844: actual workbook preview/import into an isolated in-memory database, required confirmation, year-edit invalidation, cancellation, dependent-delete refusal and successful deletion of all three record types. No console warnings/errors. User database contents were not imported or deleted during QA.
