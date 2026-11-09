import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlRoomServer } from '../control-room/server.mjs';
import { OperationsStore } from '../operations/store.mjs';
import model from '../operations/model.cjs';

const scratch=fileURLToPath(new URL('../private/',import.meta.url));
async function fixture(){
  await mkdir(scratch,{recursive:true});
  const root=await mkdtemp(path.join(scratch,'control-room-test-'));
  await mkdir(path.join(root,'control-room','public','assets'),{recursive:true});
  for(const directory of ['assets/data','campaign','downloads','data'])await mkdir(path.join(root,'control-room','public',directory),{recursive:true});
  await mkdir(path.join(root,'data'),{recursive:true});
  await mkdir(path.join(root,'private'),{recursive:true});
  await writeFile(path.join(root,'control-room','public','index.html'),'<!doctype html><title>Local control room</title>');
  await writeFile(path.join(root,'control-room','public','app.js'),'document.title = "Local control room";');
  await writeFile(path.join(root,'control-room','public','model.js'),'var CampaignModel = {};');
  await writeFile(path.join(root,'control-room','public','assets','example.json'),'{"public":true}');
  for(const name of ['media','projects','campaign'])await writeFile(path.join(root,'control-room','public','assets','data',`${name}.json`),'[]');
  for(const extension of ['png','jpg','webp','ico','woff2'])await writeFile(path.join(root,'control-room','public','assets',`fixture.${extension}`),Buffer.from([1,2,3]));
  await writeFile(path.join(root,'control-room','public','campaign','about.html'),'<!doctype html><title>Campaign background</title>');
  for(const name of ['LICENCE.md','robots.txt','llms.txt','sitemap.xml','downloads/media-brief.txt','data/projects.json'])await writeFile(path.join(root,'control-room','public',name),name.endsWith('.json')?'[]':'Public generated document');
  for(const name of ['private-notes.md','private-notes.txt','assets/private-notes.md','assets/private-notes.txt','data/private.json'])await writeFile(path.join(root,'control-room','public',name),'Not an allowed document');
  await writeFile(path.join(root,'data','campaign.json'),JSON.stringify({name:'Luke Nathan Hayes'}));
  await writeFile(path.join(root,'data','projects.json'),'[]');
  await writeFile(path.join(root,'private','secret.txt'),'PRIVATE TEST DATA');
  const store=new OperationsStore(path.join(root,'private'));
  const server=createControlRoomServer({root,store});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,origin=`http://127.0.0.1:${port}`;
  async function request(route,{method='GET',headers={},body}={}){
    const raw=body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body);
    const outgoing={host:`127.0.0.1:${port}`,connection:'close',...headers};
    if(raw!==undefined&&outgoing['content-length']===undefined)outgoing['content-length']=Buffer.byteLength(raw);
    return new Promise((resolve,reject)=>{const request=http.request({host:'127.0.0.1',port,path:route,method,headers:outgoing},response=>{const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let data;try{data=JSON.parse(text);}catch{}resolve({status:response.statusCode,headers:response.headers,text,data});});});request.on('error',reject);request.end(raw);});
  }
  async function session(){const response=await request('/api/session');assert.equal(response.status,200);return {cookie:response.headers['set-cookie'][0].split(';')[0],origin,'content-type':'application/json','x-csrf-token':response.data.csrfToken};}
  async function close(){await new Promise(resolve=>server.close(resolve));assert.ok(path.resolve(root).startsWith(path.resolve(scratch)+path.sep));await rm(root,{recursive:true,force:true});}
  return {root,store,request,session,origin,close};
}

test('local server requires a session and rejects unexpected hosts and origins',async()=>{
  const app=await fixture();
  try{
    assert.equal((await app.request('/api/state')).status,401);
    assert.equal((await app.request('/api/session',{headers:{host:'evil.example'}})).status,403);
    assert.equal((await app.request('/api/session',{headers:{origin:'https://evil.example'}})).status,403);
    assert.equal((await app.request('/api/session',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    const session=await app.request('/api/session');
    assert.match(session.headers['set-cookie'][0],/HttpOnly; SameSite=Strict/);
    assert.match(session.headers['content-security-policy'],/frame-ancestors 'none'/);
    assert.equal(session.headers['access-control-allow-origin'],undefined);
  }finally{await app.close();}
});

test('opening an empty local store creates no records or imposed task dates',async()=>{
  const app=await fixture();
  try{
    const headers=await app.session();
    const response=await app.request('/api/state',{headers:{cookie:headers.cookie}});
    assert.equal(response.status,200);
    for(const key of ['contacts','enquiries','publications','tasks','expenses','suppression','audit'])assert.deepEqual(response.data[key],[]);
    assert.equal(response.data.revision,0);
    await assert.rejects(readFile(app.store.file),{code:'ENOENT'});
    const optional=model.validate('tasks',{title:'A freely chosen option'});
    assert.equal(optional.dueDate,'');
    assert.equal(model.fresh().tasks.length,0);
  }finally{await app.close();}
});

test('CSRF failures and invalid records cannot write to the private store',async()=>{
  const app=await fixture();
  try{
    const headers=await app.session(),body={record:{title:'Administrative check'}};
    assert.equal((await app.request('/api/records/tasks',{method:'POST',headers:{...headers,'x-csrf-token':'invalid'},body})).status,403);
    const {origin,...withoutOrigin}=headers;
    assert.equal((await app.request('/api/records/tasks',{method:'POST',headers:withoutOrigin,body})).status,403);
    assert.equal((await app.request('/api/records/tasks',{method:'POST',headers,body:{record:{title:'Invalid',unrecognisedField:'No'}}})).status,400);
    assert.equal((await app.request('/api/records/tasks',{method:'POST',headers:{...headers,'content-type':'text/plain'},body})).status,415);
    assert.equal((await app.store.read()).tasks.length,0);
  }finally{await app.close();}
});

test('validated task create and update persist through the existing operations store',async()=>{
  const app=await fixture();
  try{
    const headers=await app.session();
    const created=await app.request('/api/records/tasks',{method:'POST',headers,body:{record:{title:'Verify a source',owner:'Luke Nathan Hayes',status:'planned'}}});
    assert.equal(created.status,200);
    const id=created.data.record.id;
    const updated=await app.request('/api/records/tasks',{method:'POST',headers,body:{id,record:{title:'Verify a source',owner:'Luke Nathan Hayes',status:'done'}}});
    assert.equal(updated.status,200);
    const persisted=JSON.parse(await readFile(app.store.file,'utf8'));
    assert.equal(persisted.tasks[0].status,'done');
    assert.equal(persisted.tasks[0].id,id);
    assert.equal(persisted.audit.length,2);
    const read=await app.request('/api/state',{headers:{cookie:headers.cookie}});
    assert.equal(read.data.tasks.length,1);
  }finally{await app.close();}
});

test('broadcast evidence validation returns actionable errors and saves separate repeat plays',async()=>{
  const app=await fixture();
  try {
    const headers=await app.session();
    const record={title:'Example song',station:'Example station',status:'confirmed',broadcastDate:'2026-11-10',localTime:'18:20:10',timeAccuracy:'exact',evidenceType:'station-log',evidenceReference:'Private log'};
    const invalid=await app.request('/api/records/broadcasts',{method:'POST',headers,body:{record:{...record,evidenceReference:''}}});
    assert.equal(invalid.status,400);assert.match(invalid.data.error,/Confirmed broadcasts/);
    const first=await app.request('/api/records/broadcasts',{method:'POST',headers,body:{record}});
    const repeat=await app.request('/api/records/broadcasts',{method:'POST',headers,body:{record:{...record,localTime:'19:20:10'}}});
    assert.equal(first.status,200);assert.equal(repeat.status,200);assert.notEqual(first.data.record.id,repeat.data.record.id);
    const state=await app.store.read();assert.equal(state.broadcasts.length,2);assert.equal(state.contributions.length,0);assert.equal(state.expenses.length,0);
    const exported=await app.request('/api/export/broadcasts',{headers:{cookie:headers.cookie}});
    assert.equal(exported.status,200);assert.match(exported.text,/18:20:10/);assert.match(exported.text,/19:20:10/);
  } finally {await app.close();}
});

test('static serving rejects traversal and never exposes private files or repository data',async()=>{
  const app=await fixture();
  try{
    assert.equal((await app.request('/')).status,200);
    assert.equal((await app.request('/assets/example.json')).status,200);
    for(const route of ['/../private/secret.txt','/%2e%2e/private/secret.txt','/assets/%2e%2e/%2e%2e/private/secret.txt','/assets%5c..%5cprivate%5csecret.txt'])assert.equal((await app.request(route)).status,400);
    for(const route of ['/private/secret.txt','/private/operations.json','/data/campaign.json','/integrations/google-drive/Code.gs']){const response=await app.request(route);assert.equal(response.status,404);assert.ok(!response.text.includes('PRIVATE TEST DATA'));}
  }finally{await app.close();}
});

test('generated directory assets and mirrored secondary pages are served with known content types',async()=>{
  const app=await fixture();
  try{
    for(const name of ['media','projects','campaign']){
      const result=await app.request(`/assets/data/${name}.json`);
      assert.equal(result.status,200);assert.match(result.headers['content-type'],/^application\/json/);assert.deepEqual(result.data,[]);
    }
    for(const route of ['/model.js','/app.js']){const result=await app.request(route);assert.equal(result.status,200);assert.match(result.headers['content-type'],/^text\/javascript/);}
    const expected={png:'image/png',jpg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',woff2:'font/woff2'};
    for(const [extension,mime] of Object.entries(expected)){const result=await app.request(`/assets/fixture.${extension}`);assert.equal(result.status,200);assert.equal(result.headers['content-type'],mime);}
    const page=await app.request('/campaign/about.html');assert.equal(page.status,200);assert.match(page.headers['content-type'],/^text\/html/);
  }finally{await app.close();}
});

test('only explicitly named generated public documents bypass the static extension allowlist',async()=>{
  const app=await fixture();
  try{
    const expected={'/LICENCE.md':'text/markdown','/robots.txt':'text/plain','/llms.txt':'text/plain','/sitemap.xml':'application/xml','/downloads/media-brief.txt':'text/plain','/data/projects.json':'application/json'};
    for(const [route,type] of Object.entries(expected)){const result=await app.request(route);assert.equal(result.status,200);assert.ok(result.headers['content-type'].startsWith(type));}
    for(const route of ['/private-notes.md','/private-notes.txt','/assets/private-notes.md','/assets/private-notes.txt','/data/private.json'])assert.equal((await app.request(route)).status,404);
  }finally{await app.close();}
});

test('backups and CSV exports require a session and retain valid private data',async()=>{
  const app=await fixture();
  try{
    assert.equal((await app.request('/api/export/tasks')).status,401);
    const headers=await app.session();
    await app.request('/api/records/tasks',{method:'POST',headers,body:{record:{title:'=SUM(1,2)'}}});
    const csv=await app.request('/api/export/tasks',{headers:{cookie:headers.cookie}});
    assert.equal(csv.status,200);assert.match(csv.headers['content-disposition'],/tasks\.csv/);assert.ok(csv.text.includes("'=SUM(1,2)"));
    const backup=await app.request('/api/backup',{method:'POST',headers,body:{}});
    assert.equal(backup.status,200);assert.ok(backup.data.path.startsWith(path.join(app.root,'private','backups')));
    assert.equal(JSON.parse(await readFile(path.join(backup.data.path,'operations.json'),'utf8')).tasks.length,1);
  }finally{await app.close();}
});

test('API rejects oversized bodies and unsupported methods',async()=>{
  const app=await fixture();
  try{
    const headers=await app.session();
    const response=await app.request('/api/records/tasks',{method:'POST',headers,body:{record:{title:'x'.repeat(66000)}}});
    assert.equal(response.status,413);
    assert.equal((await app.request('/api/state',{method:'DELETE',headers})).status,405);
    assert.equal((await app.store.read()).revision,0);
  }finally{await app.close();}
});
