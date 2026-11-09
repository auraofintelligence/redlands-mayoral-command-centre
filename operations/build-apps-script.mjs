import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('./model.cjs', import.meta.url), 'utf8');
await writeFile(new URL('../integrations/google-drive/Model.gs', import.meta.url), '// Generated from operations/model.cjs. Run node operations/build-apps-script.mjs after changes.\n' + source.replace("if (typeof module !== 'undefined') module.exports = CampaignModel;", ''));
console.log('Generated Apps Script validation model.');
