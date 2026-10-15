# Notifications

Administrators can open **Communication → Notifications** to send a title and message to selected guardian accounts, the guardian accounts linked to selected students, or all active registered guardian accounts. Selecting overlapping students and guardians delivers one copy per account. Students without an active linked parent login cannot be selected.

Guardians open **Notifications** in their portal navigation to read academy messages and mark them as read. Inbox records are private to the recipient account. The inbox and sent history have a Refresh button. Broadcast recipients are fixed at send time; later registrations do not receive old announcements.

Every notification is saved to portal inboxes immediately. Email is queued for recipients with an email address on their login account. The queue uses the same email configuration as password resets: `RESEND_API_KEY` and `RESEND_FROM`, or `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and optionally `SMTP_FROM`. `CLIENT_URL` supplies the portal link in emails. Email bodies are plain text and recipients receive separate emails.

Run the API through `server/server.js` (`npm run dev` or `npm start`) to process saved email jobs. The worker checks every five seconds and resumes pending deliveries after a restart. Sent history reports email acceptance by the provider, pending emails, failures and accounts without an email address. Provider acceptance does not verify inbox arrival. Failed emails are not retried automatically; portal messages remain available. An interrupted email whose delivery is uncertain is marked failed after five minutes to avoid automatic duplicates.

If email is not configured when sending, portal delivery still succeeds and the send result and history show that email was unavailable. Configure the service before sending subsequent messages. No live email is sent by the automated tests.
