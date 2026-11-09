# Workspace and optional private records

The election explorer is the primary interface. Luke can browse media, follow public commentary, save possibilities and choose whether to develop them. It imposes no daily routine, due dates or campaign plan. Luke is the sole human operator, supported by AI companions.

## Open the interface

```sh
npm run control
```

Open [the control room](http://127.0.0.1:4183/). This private local app uses the local operations store. The public campaign website does not host it. Any earlier browser-local records remain separate; importing them is an explicit choice, not automatic synchronisation.

The media directory contains public sources. A bookmark records interest, not endorsement, consent, contact or an instruction to send a message. Personal possibilities begin empty. Dates are optional and belong to Luke's choices. Source dates and official election dates describe evidence outside that personal calendar.

## Storage choices

| Mode | What it means |
| --- | --- |
| Browser-local workspace | Personal selections remain in the current browser and origin. Export work you want to retain. This is not an authenticated private account. |
| Local operations CLI | Structured records live in ignored `private/` files on the computer. They are separate from browser storage. |
| Google Drive integration | Separate source and setup are provided. Deployment, authorisation and successful readback are required before treating it as live. |

Keep sensitive correspondence, private contacts, receipts, identity documents and financial details out of the public browser workspace and public source repository. Use the appropriately restricted private storage option for that material. No automatic two-way synchronisation is provided.

## Optional local CLI

```sh
npm run ops -- init
npm run ops -- status
npm run ops -- template tasks
npm run ops -- help
```

`init` creates an empty private store when needed. It adds no tasks, contacts, approvals or dates and preserves existing records. Optional undated examples are exported as `optionalTaskTemplates` from `operations/bootstrap.mjs`; they are not automatically saved.

A chosen record can be prepared as a UTF-8 JSON file under `private/`, then added through the CLI:

```sh
npm run ops -- add tasks private/possibility.json
npm run ops -- list tasks
npm run ops -- update tasks RECORD_ID private/possibility.json
npm run ops -- export tasks
npm run ops -- backup
```

The legacy collection name `tasks` stores a title and optional owner, due date, evidence and notes. A blank due date is valid. A record's presence does not authorise sending, publication or spending. `update` replaces one complete record while preserving its creation time and recording the change.

## Other available records

Contacts can record a real interaction and any explicit consent. Enquiries can preserve an incoming question and a sender's requested date. Publications can hold factual drafts and actual decisions. Expenses can record amounts and supporting references. These collections are available if Luke chooses to use them; they are not a prescribed workflow.

A person's enquiry does not subscribe them to updates. Public media routes are not a consented mailing list. This toolkit has no messaging command, automatic sender, voter score or political profiling system. Consent and suppression records must be retained faithfully where used.

## Export and recovery

CSV exports neutralise common spreadsheet formula prefixes. They can still contain private data. The JSON backup retains the complete local state, including audit and suppression records. Store it privately.

The local store uses a write lock and temporary-file replacement. If a crashed process leaves `private/.write-lock`, verify that the writer has stopped before removing that specific lock. Do not overwrite a live store. Before any chosen restore, retain a backup and verify the replacement in isolation.

New empty defaults do not justify deleting records from an earlier session. Existing private records are not inspected, reset or removed by this documentation change. Luke decides any later reconciliation.

## Checks

```sh
node --test tests/operations.test.mjs
```

Technical checks verify software behaviour, not election compliance or approval to act. The repository does not file ECQ returns, process donations or certify a nomination. Official requirements should be read from current ECQ sources when relevant to an action Luke chooses.

## Campaign finance

The Budget and reporting view supports `contributions`, `budgets` and the existing `expenses` collection. See [finance guidance](FINANCE.md) for private records and preparation of a reviewed public snapshot. Existing records are preserved; no budget or donation amounts are seeded.
