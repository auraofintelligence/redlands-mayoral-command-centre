import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import model from '../operations/model.cjs';
import finance from '../operations/finance.cjs';
import {OperationsStore} from '../operations/store.mjs';

const item={title:'Example song',station:'Example station'};
const confirmed={...item,broadcastDate:'2026-11-10',localTime:'18:42:03',timeAccuracy:'exact',status:'confirmed',evidenceType:'station-log',evidenceReference:'Log held privately'};

test('reported and scheduled airplay cannot silently become confirmed broadcasts',()=>{
  const reported=model.validate('broadcasts',item);
  assert.equal(reported.status,'reported');assert.equal(reported.broadcastDate,'');
  assert.equal(reported.localTime,'');assert.equal(reported.timeAccuracy,'unknown');
  assert.equal(reported.timeZone,'Australia/Brisbane');assert.equal(reported.arrangement,'unknown');
  assert.doesNotThrow(()=>model.validate('broadcasts',{...item,status:'scheduled'}));
  for(const change of [{broadcastDate:''},{evidenceType:'listener-report'},{evidenceReference:''}])assert.throws(()=>model.validate('broadcasts',{...confirmed,...change}),/Confirmed broadcasts/);
  assert.doesNotThrow(()=>model.validate('broadcasts',confirmed));
  assert.doesNotThrow(()=>model.validate('broadcasts',{...confirmed,localTime:'',timeAccuracy:'unknown'}));
});

test('time accuracy, daylight-saving zones and optional duration preserve known information',()=>{
  assert.doesNotThrow(()=>model.validate('broadcasts',{...confirmed,timeZone:'Australia/Sydney',localTime:'18:42',timeAccuracy:'approximate',durationSeconds:'245'}));
  for(const change of [{localTime:'25:01'},{localTime:'12:99'},{timeAccuracy:'unknown'},{localTime:''},{timeZone:'Not/AZone'},{durationSeconds:'2.5'},{durationSeconds:'-1'}])assert.throws(()=>model.validate('broadcasts',{...confirmed,...change}));
});

test('repeat plays remain separate audited occurrences and are not counted as financial gifts',()=>{
  const state=model.fresh(),ctx={id:randomUUID,now:()=> '2026-11-10T09:00:00Z'};
  const first=model.save(state,'broadcasts',confirmed,null,ctx);
  const second=model.save(state,'broadcasts',{...confirmed,localTime:'19:42:03'},null,ctx);
  model.save(state,'broadcasts',{...confirmed,title:'Interview',itemType:'interview'},null,ctx);
  assert.notEqual(first.id,second.id);assert.equal(state.broadcasts.length,3);assert.equal(state.audit.length,3);
  assert.deepEqual(state.contributions,[]);assert.deepEqual(state.expenses,[]);
  assert.doesNotMatch(JSON.stringify(finance.publicReport(state)),/Example song|Example station|Log held privately/);
  const csv=model.exportCsv(state,'broadcasts');assert.match(csv,/broadcastDate/);assert.match(csv,/timeZone/);assert.match(csv,/18:42:03/);assert.match(csv,/19:42:03/);
});

test('the broadcast ledger upgrades an existing store without changing it until a record is saved',async()=>{
  const scratch=fileURLToPath(new URL('../private/',import.meta.url));
  await mkdir(scratch,{recursive:true});
  const directory=await mkdtemp(join(scratch,'broadcast-test-'));
  try {
    const old=model.fresh();delete old.broadcasts;
    const bytes=JSON.stringify(old);await writeFile(join(directory,'operations.json'),bytes);
    const store=new OperationsStore(directory),loaded=await store.read();
    assert.deepEqual(loaded.broadcasts,[]);assert.equal(await readFile(store.file,'utf8'),bytes);
    await store.save('broadcasts',confirmed);
    const reloaded=await store.read();assert.equal(reloaded.broadcasts.length,1);assert.equal(reloaded.broadcasts[0].localTime,'18:42:03');assert.deepEqual(reloaded.contacts,old.contacts);
  } finally {assert.ok(resolve(directory).startsWith(resolve(scratch)+sep));await rm(directory,{recursive:true,force:true});}
});
