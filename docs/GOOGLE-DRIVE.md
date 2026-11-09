# Owner-only Google Drive administration

Use the selected private owner account recorded in the local private connection settings. The account address belongs in Script Properties, not the public repository or website.

The Drive connector can create and verify campaign folders. The standalone Apps Script portal is a separate deployment that needs the owner's Google authorisation. A connector connection does not automatically deploy or authorise an Apps Script web app. Until that deployment is completed, use the local operations CLI and the private Drive folders directly.

The portal supports contact and consent records, unsubscribe suppression, inbound enquiries, publication review, tasks, expenses, private CSV downloads and JSON backups. It does not send email, scrape contact information, publish material, take donations or expose an intake API to the public site.

## Deploy

1. Sign in to [Google Apps Script](https://script.google.com/) with the selected private owner account and create a standalone project named `Redlands campaign administration`.
2. Add the repository's `integrations/google-drive/Code.gs`, `Model.gs` and `Admin.html`. In Project Settings, show the manifest and replace `appsscript.json` with the supplied file.
3. Add Script Property `OWNER_EMAIL` with the selected private owner account address. Add `ROOT_FOLDER_ID` containing the ID of the campaign's owner-only private Drive folder. Do not enter a URL. Keep these configuration values out of tracked files. Keep the folder restricted to the owner and do not publish it or grant editor/viewer access. The application refuses missing owner configuration or a shared storage folder.
4. Run `setupCampaignStorage` in the editor. Review and grant the requested Drive and email-identity permissions from the owner account. It creates `campaign-operations.json` once, retains its file ID as a Script Property, and returns the verified folder URL and record revision.
5. Choose **Deploy > New deployment > Web app**. Use **Execute as: User accessing the web app** and **Who has access: Only myself**. The supplied manifest declares `USER_ACCESSING` and `MYSELF`. Confirm the deployed settings match. Never select anonymous or public access.
6. Open the returned deployment URL as the owner. Create a test task, reload it, export its CSV, and create a Drive backup. Verify the file is in the intended private folder. Open the URL signed out and under another account to confirm access is denied.
7. Keep the administration URL in a private bookmark or the private campaign folder. Do not add it to the public site's navigation.

The `drive` OAuth scope is broad because Apps Script's Drive service manages the selected folder and its records. No OAuth tokens or secrets are included in the repository or returned to the browser. Every exposed server method checks both the active and effective account before reading or changing storage. Empty or different identities fail closed.

## Use and maintenance

The portal displays the signed-in owner and record revision. Saves use a script lock and compare the revision sent by the browser with the latest stored revision. If another window saved first, reload before changing a record. This avoids silently overwriting a newer version.

Back up from the portal before substantial edits and before changing the integration. JSON backups preserve suppression and administrative audit records. Drive storage is durable, but this is a single-owner application with no background sync, no custom encryption layer and no immutable audit store. Your Google account protection and folder sharing remain part of its security.

The local CLI and cloud portal do not automatically share live records. Choose the cloud portal or local CLI as the source of truth, and move verified backups deliberately. Do not treat two independently edited stores as synchronised.

After changing `operations/model.cjs`, run `node operations/build-apps-script.mjs`, run the operations tests and copy the regenerated `Model.gs` to Apps Script. Create a new deployment version after uploading code changes. Keep the deployment owner and access settings unchanged.

## Google references

- [Web app execution and deployment](https://developers.google.com/apps-script/guides/web)
- [Manifest access and execution settings](https://developers.google.com/apps-script/manifest/web-app-api-executable)
- [Session identity and availability](https://developers.google.com/apps-script/reference/base/session)
- [Drive service](https://developers.google.com/apps-script/reference/drive/)
- [Script locks](https://developers.google.com/apps-script/reference/lock/lock-service)
- [Script Properties](https://developers.google.com/apps-script/reference/properties/properties-service)

Documentation checked on 8 November 2026. Deployment and OAuth consent must be completed in the owner's Google session and verified before calling the portal connected.
