# Arcus Uploads — Phase 1: headless test plan

Source: *Arcus Uploads — Phase 1 PRD* (Draft v0.4, Oct 14 2026). Target: `https://arcus-edge.testsigma.com`.
Scope: the **upload functionality** — the Uploads library, versions, search, the file panel, download links, delete,
the Uploads API and role permissions. 95 tests in total: 52 positive (including boundaries) and 43 negative.

## Traceability

| PRD req | What is checked | Positive | Negative / boundary |
|---|---|---|---|
| FR1.1 Upload a file | Browse and drag-and-drop; row shows name, ID, version, size, uploader; Name pre-filled; custom Name; 11 file types and names; 4 label formats; progress; change the chosen file; Cancel | UP-01…UP-09, UP-11 | UN-01…UN-05 (no file, no or blank Name, no or blank Version) |
| FR1.2 Size limit (500 MB) | Limit + 1 byte rejected inline with the limit and the size; nothing stored; error clears on a valid file; exactly 500 MB accepted | UP-10 *(opt-in)*, UN-08 | UN-06, UN-07, API-15 *(opt-in)* |
| FR1.3 Name clash | Blocked; "Upload as new version" offered and works | UN-10 | UN-09, API-10 |
| FR1.4 Upload failure | Dropped connection offers Retry and stores nothing partial; Retry creates exactly one file; offline mid-upload | UN-12 | UN-11, UN-13 |
| FR1.5 Search | Full, partial and case-insensitive name across types; no-match empty state; clear; special characters and XSS/SQL strings; 200+ files | US-01, US-03, US-05 *(opt-in)* | US-02, US-04 ×6 |
| FR1.6 File panel | All four tabs; Used by is empty when unused; ID and copyable reference; ID in the UI matches the API | UF-01…UF-04 | — |
| FR1.7 Delete guard | Cancel keeps the file; unused file gets a short confirm and all versions go; the Name is reusable; a file in use lists test cases and step counts | UX-02, UX-03 | UX-01, UX-04 *(needs data)* |
| FR1.8 Delete a version | Non-Latest; deleting Latest makes the previous one Latest; only version blocked; Cancel | UV-07, UV-08 | UV-09, UV-10 |
| §4 Version rules | Duplicate label blocked; a deleted label is never reused; the same label is fine on another file | UV-04 | UV-03, UV-11, API-11 |
| FR1.9 Malware scan | EICAR rejected as a new file and as a new version; nothing stored; Latest unchanged | — | UN-14, UN-15, API-14 |
| FR2.3 New version | Name locked; becomes Latest; list updates; type may change; the download serves the Latest bytes | UV-01, UV-02, UV-06 | UV-05 |
| FR6.1 API operations | create, get (signed link + bytes), list, add version, list versions; API version shows in the UI | API-01…API-05 | API-06…API-09, API-12, API-13 |
| FR6.2 Permission parity | No token or invalid token gives 401; Read Only token can read but not write | API-18 *(read part)* | API-16, API-17, API-18 |
| FR6.3 Download link | Exact bytes; TTL ≈ 3 h (from the signed URL); a tampered or unsigned link is refused | UD-01, UD-02, API-02 | UD-03, UD-04 |
| FR7.3 Roles | Read Only: view, panel and download, no upload or delete. Tester: upload and version, no delete | UR-01, UR-03 | UR-02, UR-04 |
| FR7.4 Audit | Activity shows the upload, the new version and the download | UA-01 | — |

## Not automated here (and why)

| PRD req | Reason |
|---|---|
| FR1.10 Encryption at rest | Verified in security review, not observable from the UI or API |
| FR2.1/2.2/2.4, FR3.x | Need test cases, step editor, Agentic Learning/Copilot and real runs on Testsigma Lab / Arcus Terminal — a separate "Uploads in steps" suite |
| FR4 Image injection | Needs Android/iOS devices with camera injection |
| FR5 Write-back | Needs a run that produces a file |
| FR6.3 expiry by waiting 3 h | Replaced by reading the TTL from the signed URL (UD-02) |
| FR7.1 Clone, FR7.2 Project delete, FR7.5 Performance | Out of the upload UI's scope; need test cases, project deletion, or Lab timing |

## Gaps in the PRD found while writing tests (worth confirming with PM)

1. **MB definition** — is 500 MB = 524,288,000 bytes or 500,000,000 bytes? The suite assumes MiB (`ARCUS_SIZE_LIMIT_BYTES` to change).
2. **Zero-byte files** — accept or reject? Not asserted.
3. **Name clash case-sensitivity** — is `Invoice` a clash with `invoice`? Not asserted.
4. **Name / version label length and allowed characters** — no limits stated.
5. **Name clash vs. deleted file** — UX-03 assumes a deleted file's Name is free again.
6. **API contract** — paths, field names and status codes (409 vs 400 vs 422) are not in the PRD; the suite accepts the reasonable set and keeps paths in `support/env.js`.
7. **API delete** — FR6.1 has no delete operation, so API-created files can only be cleaned up through the UI.
