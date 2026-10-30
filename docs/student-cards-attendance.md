# Student cards and daily attendance

## Using the feature

- Admins and sub-admins open **Student cards**, select a student, and view, edit, download or print their card. The card icon beside a student opens the same screen.
- New admissions automatically receive a card. Existing students can receive their first card using **Issue card**.
- Upload a JPG, PNG or WebP from the student form or **Edit card details**. Photos are resized before saving. Changes to the name, photo and guardian phone update the shared student profile.
- **Download card** saves a portrait PNG. **Print card / PDF** opens the browser print dialog; choose Save as PDF if needed. The printed portrait card is 54 × 85.6 mm.
- Student cards use the official Insights Academy logo, deep blue text and restrained orange accents on white. The same branding is rendered in downloads and prints using the original logo and live QR assets.
- Admins, sub-admins and assigned staff open **Attendance → Scan student card**. Use **Start camera**, or focus the USB scanner field and scan a QR reader configured to send Enter.
- Parents open their child's report and choose **Attendance**. They can only read attendance for linked children.
- Attendance views refresh every 30 seconds while visible, with a manual Refresh button. Check-in times and dates use Asia/Karachi.
- The Absent list includes each student's class, section and guardian primary phone for follow-up calls. Valid phone numbers are clickable call links; missing numbers show Not available. Staff can only see contact numbers for students in their attendance scope. Guardian contact lookup is not added to the parent attendance API.
- Admins and sub-admins can use **Attendance → Mark class attendance**, choose a class and optional section, select present students, and save today's attendance together. Select-all applies to unmarked students on the current page. A valid QR card is not needed for manual marking. Existing check-ins keep their original time and method. Other students remain in the computed Absent list. Staff and parents cannot manually mark attendance.

## Card and attendance rules

- The server generates a cryptographically random, 256-bit token for each card. The QR contains only an `AMS1_` token. Student information is looked up after authentication; the QR is not a login credential.
- Cards contain the student ID, name, photo, guardian phone, class, section, session and expiry. Missing photos show a placeholder until uploaded.
- The token stays static for the issued card, including ordinary edits and annual renewal. Renewing an active card extends its existing expiry by one calendar year; renewing an expired card starts from today.
- New cards expire at the start of their anniversary date in Pakistan time, so a card issued on 30 October is valid through 29 October the following year. Leap-day anniversaries clamp to 28 February.
- **Enroll / transfer** closes previous active placements and issues a new class-linked card with a new token, invalidating prior cards in the same transaction. Old placement and card records remain in history. This also applies to section or academic session changes.
- Revoked, replaced, expired, inactive-student and stale-placement cards cannot mark attendance. Archived or inactive academic setup also prevents scans.
- Attendance is unique on `(student, day)`, across every card, class and scanning account. Scans and card/transfer actions serialize per student in MongoDB transactions, preventing a transfer or replacement from racing a successful scan.
- Attendance preserves the class/section/session names at check-in. A later transfer does not rewrite history or allow a second check-in that day.
- Attendance records are confirmed Present check-ins. In **Attendance → Attendance status → Absent**, select one date to list active, enrolled students without a check-in that day. This computed list updates when attendance is scanned; it does not save permanent absence records. Class/student filters, pagination and staff permissions apply. Holidays and leave are not excluded automatically. Future dates are rejected. Historical results use the latest placement that existed on the selected date, with current student/academic activation and archive status; they are not frozen historical absence reports.
- Admin and sub-admin can view all records. Only admin and sub-admin can scan student cards. Staff can read records within their assigned class/section/session scope. Parents have read-only child-specific endpoints; they cannot scan or manage cards.

## Setup and deployment

The existing MongoDB replica set requirement still applies. Camera scanning needs HTTPS in deployment (localhost also works), camera permission and a supported camera/browser. USB QR input works without camera access. Network access to the academy server is required; failures never show an unconfirmed check-in as saved.

Install the updated client dependencies with `npm ci` in `client`, then build and restart the existing app normally. No external QR service or personal-data upload is used for generating QR images.

The server creates the new card and attendance indexes even when general auto-indexing is disabled. It also replaces the legacy `student_1_academicSession_1` unique placement index with `active_student_session_unique`: only active, unarchived placements are unique per student/session, allowing historical same-session transfers. The replacement is built before the legacy index is removed; no placement data is deleted. A conflicting active placement causes index preparation to fail rather than silently discard data.

For a controlled deployment, the existing `db:prepare -- --confirm-db EXACT_DATABASE` command previews this index preparation. Its existing `--apply` flag applies it. Existing students and attendance require no bulk data rewrite; cards for existing students are issued on demand. Database backups automatically include the new collections.

## Main API routes

- `GET /api/student-cards/:studentId`
- `POST /api/student-cards/:studentId/issue|renew|replace|revoke`
- `POST /api/students/:studentId/enroll` (transactional transfer and card replacement)
- `POST /api/attendance/scan` with `{ "token": "AMS1_..." }`
- `GET /api/attendance/roster?class=CLASS_ID&section=OPTIONAL_SECTION_ID&page=1&limit=25`
- `POST /api/attendance/manual` with `{ "class": "CLASS_ID", "section": "OPTIONAL_SECTION_ID", "students": ["STUDENT_ID"], "day": "TODAYS_PAKISTAN_DATE" }` (up to 100 students, atomic batch)
- `GET /api/attendance` with optional `student`, `class`, `section`, `academicSession`, `day`, `from`, `to`, `page`, `limit`
- `GET /api/guardian-portal/children/:studentId/attendance`

All mutations use the existing authenticated-session and CSRF protections. Card tokens are excluded from ordinary model queries, history and attendance responses. Scans derive their student, date, time, placement and recording user on the server.

Scanning has a separate limit of 120 requests per minute per signed-in account, plus 600 requests per minute per IP before authentication, so morning arrivals do not consume the ordinary portal request budget.

## Teacher attendance

Admin and sub-admin can use Teacher attendance to mark an active employee present today and view history. Teachers and guardians cannot access these records or the attendance employee picker. The picker exposes only name and designation, including profiles without login accounts. Records preserve name/designation at check-in, use Pakistan time, and are unique per employee/day. No absence is inferred. Employee cards use the approved navy-and-gold theme shared with student cards, including PNG download and print/PDF export. Admin and sub-admin can edit name, photo and the card designation label without changing employee ID or QR. Designation defaults to the staff designation title. Teacher attendance supports both manual selection and QR scanning; replacement and revocation invalidate the old QR.

- `GET /api/teacher-attendance/teachers` with optional `search`, `page`, `limit`
- `POST /api/teacher-attendance` with `{ "teacher": "staff-id" }`
- `GET /api/teacher-attendance` with optional `teacher`, `from`, `to`, `page`, `limit`

## Employee cards

- `GET /api/teacher-cards/:id` returns the current card and token-free history to admin/sub-admin.
- `PUT /api/teacher-cards/:id` accepts only `fullName`, `cardDesignation`, `photoUrl`. The designation is a card label; it does not change the staff designation catalog or permissions.
- `POST /api/teacher-cards/:id/issue|renew|replace|revoke` manages annual cards.
- `POST /api/teacher-attendance/scan` accepts an `AMT1_` token. Teachers and guardians cannot scan or view teacher records.

Employee IDs use the immutable staff ID prefixed with EMP. They remain stable across replacements and profile edits. Manual check-ins and QR scans serialize on the staff record and share the employee/day uniqueness constraint. Startup and db:prepare create the teacher-card indexes even with automatic indexing disabled.
