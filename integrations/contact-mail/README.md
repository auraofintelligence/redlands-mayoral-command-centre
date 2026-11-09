# Contact form to the owner's inbox

This is a separate, mail-only Apps Script project. It submits a validated contact message to the account configured in its private Script Properties. It does not read Gmail, access Drive, subscribe visitors, send visitor replies or expose the destination address on the website or receipt.

The earlier `contact-form` Drive-intake integration remains unchanged. Choose and verify the intended endpoint before setting the site's `contactFormUrl`.

## Deployment

1. Sign in to the Google account Luke selected for contact delivery. Create a standalone Apps Script project named `Redlands contact mail`.
2. Add `Code.gs` and the supplied `appsscript.json`.
3. In Script Properties, set `OWNER_EMAIL` to the intended receiving account address. Keep that value in Script Properties. Do not put it in the website, tracked JSON, source code or this README.
4. Run `setupContactMail` as that owner. Review Google's permission request. This checks the active and effective owner, creates a private rate-limit secret and reports the remaining sending quota. It does not send a message or create a deployment.
5. Deploy a web app with **Execute as: Me** and **Who has access: Anyone**. The manifest declares `USER_DEPLOYING` and `ANYONE_ANONYMOUS`.
6. Record the actual deployed `/exec` URL as the site's `contactFormUrl`. Keep the field empty until the endpoint exists. Never use a private administration URL.
7. Submit an identified test message through the normal public form as a signed-out visitor. Confirm the receipt and the matching reference in the owner's inbox. Check the reply address, message and topic, then remove the test message if it is no longer needed.
8. Verify required-field errors, a filled honeypot, duplicate fields, rate limits, missing configuration and quota failure. Do not claim the contact form is connected before the inbox check succeeds.

Deployment and the first Google authorisation happen in the owner's account. Source files and local tests do not establish a live endpoint or inbox delivery.

The release checker verifies that required configuration fields are present. It does not send a message or verify an inbox receipt. Complete the inbox delivery check above before treating the form as connected.

## Verified delivery, 9 November 2026

The deployed mail-only endpoint was tested through the normal website contact form. The service accepted the message and the matching receipt reference was confirmed in the intended receiving inbox. A separate cookie-free GET reached the public form; a honeypot-filled invalid POST returned “Message not submitted”. The destination account, deployment administration details and test receipt reference are recorded privately, rather than in this README or the public page.

## Form contract

Use a normal HTML form with `method="post"` and `enctype="application/x-www-form-urlencoded"`, with the deployed `/exec` URL as its action. The browser navigates to a receipt page. Do not replace it with an opaque cross-origin request or an optimistic success message.

| Field | Rule |
| --- | --- |
| `name` | Required; 1 to 120 characters; no control characters |
| `email` | Required; one reply address, at most 254 characters; no header delimiters |
| `topic` | `general`, `media`, `project`, `correction`, `accessibility` or `privacy` |
| `message` | Required; 1 to 5000 characters |
| `website` | Honeypot; leave empty, hidden from normal interaction and keyboard focus |

The server rejects other fields, duplicates, an unsupported content type and bodies larger than 32 KiB. The message is plain text. The subject and sender name come from fixed server text; the validated visitor address is used only as `replyTo`. Every recipient is resolved from `OWNER_EMAIL` after checking it against the effective executing owner. No visitor can choose a recipient.

## Receipt, privacy and limits

The receipt appears only after `MailApp.sendEmail` returns without an exception. It records acceptance for sending, not proof of arrival or reading. It contains a random reference but does not repeat the visitor's message, reply address or destination address. A service failure can leave delivery uncertain, so the error page does not claim that nothing was sent.

The contact message is delivered to the configured inbox. The service stores no message body. Its rate-limit state contains only counters and an HMAC of each reply address, with a private secret held in Script Properties. It keeps no raw reply address in that state and writes no message data to logs. A script lock serialises quota and rate decisions.

Limits are three submissions per reply address per fixed UTC hour, thirty total submissions per UTC hour and ninety total per UTC day. Google account sending quota is checked separately. These limits apply to accepted attempts, including attempts whose delivery later fails. They reduce routine abuse; the form does not establish a visitor's identity.

## References

Checked 9 November 2026:

- [Google MailApp: sendEmail, replyTo, quota and send-mail scope](https://developers.google.com/apps-script/reference/mail/mail-app)
- [Apps Script web apps and event parameters](https://developers.google.com/apps-script/guides/web)
- [Apps Script locks](https://developers.google.com/apps-script/reference/lock/lock)
- [Web-app manifest settings](https://developers.google.com/apps-script/manifest/web-app-api-executable)
