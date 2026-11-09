# Redlands Mayoral Command Centre (private)

Private local-only operations workspace for the Redlands mayoral campaign research and optional outreach. This repository is **not** a GitHub Pages website and must remain private.

## Getting started

Requires Node.js 20 or later. No npm dependencies are required.

```sh
npm run build
npm test
npm run control
```

Visit **http://127.0.0.1:4183/** on the computer running the server.

- Contacts, correspondence, expenses, drafts and work records are kept in `private/` and are excluded from version control.
- The local server listens only on `127.0.0.1`; it does not publish a public website or automatically send messages.
- Media discovery datasets are research references, not evidence of contact, endorsement or consent.
- Do not publish this repo, deploy it to GitHub Pages, commit `private/`, or put credentials into source code.
- The public campaign site lives separately at https://auraofintelligence.github.io/redlands-mayoral-campaign/.

Run `npm run ops -- status` to inspect the local private store. See `docs/CONTROL-ROOM-SERVER.md` and `docs/OPERATIONS.md` for details.

## Migration note

Initial sources were separated from the public `redlands-mayoral-campaign` repository on 9 November 2026. No private local records were exported or imported in this GitHub migration. Older public Git commits may retain previously published source files.
