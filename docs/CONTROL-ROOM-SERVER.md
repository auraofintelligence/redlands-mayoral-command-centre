# Local control room server

The operator mode runs at `http://127.0.0.1:4183` and uses the existing private operations store. It listens only on this computer's IPv4 loopback address. It does not send messages, publish campaign material, expose a public API or synchronise with Drive.

Start it with `npm run control` once the repository's control room build is ready. Startup creates no tasks, schedules, contacts or approvals. Existing records stay unchanged, and a new store begins empty. Stop the process with Ctrl+C.

All live records remain in `private/operations.json`. CSV exports and backups contain private information. The public campaign website does not host the command centre or read this store. Any records previously saved in a browser stay in that browser and origin. Moving those records into this local store requires an explicit export and import; it is not automatic synchronisation.

## Frontend contract

1. Request `GET /api/session` with same-origin credentials. It sets an HTTP-only `SameSite=Strict` cookie and returns `{ "csrfToken": "..." }`.
2. Keep that token in the page's memory. All other API requests require the session cookie.
3. POST requests must use `Content-Type: application/json`, the `X-CSRF-Token` header and the exact local origin. Browser same-origin requests supply the Origin header. Do not send API requests from the public website.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/state` | Session cookie | Private state, including tasks, contacts, enquiries, publications, expenses, contributions, budgets, broadcasts, suppression and audit |
| `GET /api/projects` | Session cookie | Public project registry |
| `GET /api/campaign` | Session cookie | Campaign configuration |
| `POST /api/records/:collection` | `{ "record": {...}, "id": "optional-existing-id" }` | `{ "record": {...}, "state": {...} }` |
| `POST /api/suppress` | `{ "email": "...", "reason": "..." }` | `{ "result": {...}, "state": {...} }` |
| `POST /api/backup` | `{}` | `{ "path": "private backup directory" }` |
| `GET /api/export/:collection` | Session cookie | CSV attachment |

Collections are `contacts`, `enquiries`, `publications`, `tasks`, `expenses`, `contributions`, `budgets` and `broadcasts`. Record validation and suppression use the same model as the CLI. Updates replace a full record, keeping its ID and creation timestamp. A stale browser can still replace a record changed through the CLI, so reload state before editing across multiple tools. A concurrent store writer returns a conflict rather than ignoring the file lock.

Sessions expire after eight hours or when the process stops. Reload to establish a new session. The server rejects unexpected Host headers, cross-origin requests, cross-site fetches, missing CSRF tokens, oversized JSON bodies and unsupported request methods. It is a local application boundary, not a replacement for Windows account security. Other software already running as the same local user may have access to the same files.

Only the `control-room/public` directory is served as static content. HTML, CSS and JavaScript are allowed, with known image, font and JSON assets under `assets/`. Path traversal, dotfiles, arbitrary filesystem reads and symlinks escaping that directory are rejected. Private files, integration code and repository configuration are never served as static routes.

Use separate script and style files. The content security policy allows local scripts, styles, images, fonts and API calls only. There is no cross-origin API access or automatic outbound outreach.
