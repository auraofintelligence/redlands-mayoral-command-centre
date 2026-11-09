#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import model from './model.cjs';
import { OperationsStore } from './store.mjs';
import { initialiseOperations } from './bootstrap.mjs';

const root = fileURLToPath(new URL('../private/', import.meta.url));
const store = new OperationsStore(root);
const [command = 'help', collection, argument, extra] = process.argv.slice(2);
const help = `Private campaign operations\n\nnode operations/cli.mjs init\nnode operations/cli.mjs status\nnode operations/cli.mjs template contacts\nnode operations/cli.mjs add contacts private/contact.json\nnode operations/cli.mjs update contacts RECORD_ID private/contact.json\nnode operations/cli.mjs list contacts\nnode operations/cli.mjs suppress EMAIL \"Unsubscribe received by email\"\nnode operations/cli.mjs export contacts\nnode operations/cli.mjs backup\n\nCollections: contacts, enquiries, publications, tasks, expenses, contributions, budgets.\nAll records and exports stay under private/. This tool sends no messages.\nInit creates an empty private workspace and preserves existing records.\nTemplate and add/update files contain one full record.\n`;

try {
  if (command === 'help' || command === '--help') process.stdout.write(help);
  else if (command === 'init') console.log(JSON.stringify(await initialiseOperations(store),null,2));
  else if (command === 'status') {
    const state = await store.read();
    console.log(JSON.stringify({ storage: root, revision: state.revision, counts: Object.fromEntries(Object.keys(model.fields).map(key => [key, state[key].length])), suppressed: state.suppression.length }, null, 2));
  } else if (command === 'template') {
    const schema = model.collection(collection);
    const record = Object.fromEntries(Object.entries(schema).map(([key, type]) => [key, model.defaults[collection][key] || (type === 'money' ? '0.00' : '')]));
    console.log(JSON.stringify(record, null, 2));
  } else if (command === 'add' || command === 'update') {
    const inputFile = command === 'add' ? argument : extra;
    if (!inputFile) throw new Error('Supply a JSON input file. See help.');
    const input = JSON.parse((await readFile(resolve(inputFile), 'utf8')).replace(/^\uFEFF/, ''));
    const record = await store.save(collection, input, command === 'update' ? argument : undefined);
    console.log(`Saved ${collection} record ${record.id}.`);
  } else if (command === 'list') {
    model.collection(collection);
    console.log(JSON.stringify((await store.read())[collection], null, 2));
  } else if (command === 'suppress') {
    await store.suppress(collection, argument);
    console.log('Suppression saved. Matching contact consent is withdrawn.');
  } else if (command === 'export') {
    model.collection(collection);
    const directory = join(root, 'exports'); await mkdir(directory, { recursive: true });
    const path = join(directory, `${collection}.csv`);
    await writeFile(path, model.exportCsv(await store.read(), collection), { mode: 0o600 });
    console.log(`Private export: ${path}`);
  } else if (command === 'backup') console.log(`Private backup: ${await store.backup()}`);
  else throw new Error('Unknown command. Run node operations/cli.mjs help.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
