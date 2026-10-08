# IT Transfer landing page

## Scope
Thai responsive landing page in plain HTML, CSS and JavaScript. Explain student and admin workflows, OCR fields, exact course-code and curriculum-year matching, minimum grade C, all three result states, and the IT-only/non-REGIS/non-official boundary.

## Design
White and pale mint surfaces, navy text, emerald actions, generous spacing. Header, split hero with HTML transcript illustration, benefit strip, three-step workflow, criteria/results section, admin band, FAQ and footer. All text and controls remain HTML, not a flattened image.

## Implementation
1. Create `index.html` and `styles.css` with accessible navigation, responsive sections and native FAQ disclosures.
2. Test then implement `matching.js`: exact normalized course code + selected curriculum year, known letter grades, no inferred mappings, three outcomes.
3. Create `app.js`: mobile navigation and an explicitly labeled interactive sample dialog. Users can edit sample course code/name/credits/grade, select a curriculum year, review and calculate results. A selected PDF/JPG stays local; no fake OCR results from the file.
4. Admin button opens a clearly labeled feature overview. Real authentication, Excel ingestion, OCR, storage and administrative CRUD are outside this landing-page delivery.
5. Verify syntax, matching boundary tests, desktop/mobile browser layout, navigation, FAQ, dialog and all sample outcomes. Document run commands and limitations in README.

## Constraints
No runtime dependencies, framework, database, credentials, external deployment or package installation. Do not imply sample data are official equivalencies. Use only PDF/JPG for the advertised upload formats.
