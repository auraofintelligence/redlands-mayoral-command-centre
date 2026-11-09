import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import model from './model.cjs';

export class OperationsStore {
  constructor(directory) { this.directory = resolve(directory); this.file = join(this.directory, 'operations.json'); }
  async read() {
    try {
      const state = JSON.parse((await readFile(this.file, 'utf8')).replace(/^\uFEFF/, ''));
      if (state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.audit) || !Array.isArray(state.suppression) || !Object.keys(model.fields).every(key => Array.isArray(state[key]))) throw new Error('Unsupported or damaged operations file. Restore a verified backup.');
      return state;
    } catch (error) { if (error.code === 'ENOENT') return model.fresh(); throw error; }
  }
  async transact(change) {
    await mkdir(this.directory, { recursive: true });
    const lockPath = join(this.directory, '.write-lock');
    let lock;
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Another writer is active. If a process crashed, verify it stopped before removing private/.write-lock.'); throw error; }
    const temporary = join(this.directory, `.operations-${randomUUID()}.tmp`);
    try {
      const state = await this.read();
      const result = change(state, { id: randomUUID, now: () => new Date().toISOString() });
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
      return result;
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await lock.close();
      await unlink(lockPath);
    }
  }
  save(name, input, id) { return this.transact((state, context) => model.save(state, name, input, id, context)); }
  suppress(email, reason) { return this.transact((state, context) => model.suppress(state, email, reason, context)); }
  async backup() {
    const state = await this.read();
    const directory = join(this.directory, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'operations.json'), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    for (const name of Object.keys(model.fields)) await writeFile(join(directory, `${name}.csv`), model.exportCsv(state, name), { mode: 0o600 });
    return directory;
  }
}
