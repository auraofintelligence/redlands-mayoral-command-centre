import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import model from '../operations/model.cjs';

const source=await readFile(new URL('../control-room/public/app.js',import.meta.url),'utf8');
const storageKey='redlands-explorer-v1';
const directorySource={
  id:'example-local-podcast',name:'Example Local Podcast',kind:'podcast',area:'Brisbane',region:'Brisbane',
  description:'Public conversations about local work.',website:'https://example.test/podcast',
  contactUrl:'https://example.test/contact?topic=community&route=public',
  tags:['local'],sourceUrls:['https://example.test/about'],checkedOn:'2026-11-08',
  verification:'outlet-verified',notes:'A public route, with no contact permission recorded.',
  discoveryGroup:'new-media',formats:['podcast']
};
const context={id:randomUUID,now:()=> '2026-11-08T02:00:00.000Z'};

// Read the controls actually rendered by app.js so the tests exercise prefills
// and submitted values, including hidden fields and escaped source URLs.
const decode=value=>value.replace(/&(amp|lt|gt|quot|#39);/g,(_match,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[entity]));
const attribute=(html,name)=>decode(html.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '');
function formFields(html){
  const fields={};
  for(const match of html.matchAll(/<input\b([^>]*)>/g)){
    const name=attribute(match[1],'name');
    if(name)fields[name]=attribute(match[1],'value');
  }
  for(const match of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)){
    const name=attribute(match[1],'name');
    if(name)fields[name]=decode(match[2]);
  }
  for(const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)){
    const name=attribute(match[1],'name'),options=[...match[2].matchAll(/<option\b([^>]*)>/g)];
    const selected=options.find(option=>/\bselected\b/.test(option[1])) || options[0];
    if(name)fields[name]=selected ? attribute(selected[1],'value') : '';
  }
  return fields;
}

async function openWorkspace(initialState=model.fresh(),view='media'){
  const nodes=new Map(),documentListeners=new Map(),windowListeners=new Map();
  const values=new Map([[storageKey,JSON.stringify(initialState)]]),writes=[],clipboard=[],requests=[];
  let activeForm;
  function node(selector){
    if(selector==='#record-form')return activeForm;
    if(nodes.has(selector))return nodes.get(selector);
    const listeners=new Map(),classes=new Set();let html='';
    const element={id:selector.slice(1),textContent:'',className:'',disabled:false,open:false,value:'',dataset:{},
      classList:{add:(...items)=>items.forEach(item=>classes.add(item)),remove:(...items)=>items.forEach(item=>classes.delete(item)),contains:item=>classes.has(item),toggle:(item,on)=>{const next=on??!classes.has(item);if(next)classes.add(item);else classes.delete(item);return next;}},
      setAttribute(){},removeAttribute(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},
      addEventListener(type,handler){listeners.set(type,handler);},
      async emit(type,event){return listeners.get(type)?.(event);},
      querySelector(selector){return selector==='[type="submit"]'?node('#submit-button'):null;}
    };
    Object.defineProperty(element,'innerHTML',{get:()=>html,set:value=>{
      html=value;
      if(selector==='#editor'&&value.includes('id="record-form"')){
        nodes.delete('#active-form');activeForm=node('#active-form');activeForm.fields=formFields(value);
        for(const [name,fieldValue] of Object.entries(activeForm.fields))node(`#field-${name}`).value=fieldValue;
        node('#editor-error').textContent='';node('#editor-feedback').textContent='';
      }
    }});
    nodes.set(selector,element);return element;
  }
  const document={querySelector:node,querySelectorAll:()=>[],addEventListener:(type,handler)=>documentListeners.set(type,handler),title:''};
  const location={hostname:'example.test',port:'',hash:`#${view}`};
  const sandbox={window:{CampaignModel:model},document,location,
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push({key,value});values.set(key,value);}},
    navigator:{locks:{request:async(_name,callback)=>callback()},clipboard:{writeText:async text=>{clipboard.push(text);}}},
    crypto:{randomUUID},structuredClone,URL,
    FormData:class extends Map{constructor(form){super(Object.entries(form.fields));}},
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.endsWith('media.json')?[directorySource]:url.endsWith('campaign.json')?{repository:'https://example.test/repository'}:[]};},
    addEventListener:(type,handler)=>windowListeners.set(type,handler),setTimeout:()=>1,clearTimeout:()=>{}
  };
  vm.createContext(sandbox);vm.runInContext(source,sandbox,{timeout:1000});
  for(let i=0;i<20&&node('#storage-status').textContent!=='Saved in this browser';i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(node('#storage-status').textContent,'Saved in this browser',node('#view').innerHTML);
  return {
    writes,clipboard,requests,node,location,
    read:()=>JSON.parse(values.get(storageKey)),
    fields:()=>({...activeForm.fields}),
    setFields(fields){Object.assign(activeForm.fields,fields);for(const [name,value] of Object.entries(fields))node(`#field-${name}`).value=value;},
    async action(action,id,extra={}){
      const element={dataset:{action,id,...extra}};
      await documentListeners.get('click')({target:{closest:selector=>selector==='[data-action]'?element:null}});
    },
    async filter(selector,value,type){const target=node(selector);target.value=value;await documentListeners.get(type)({target});},
    async otherTabSaved(state){values.set(storageKey,JSON.stringify(state));await windowListeners.get('storage')({key:storageKey});},
    async submit(){return activeForm.emit('submit',{target:activeForm,preventDefault(){}});}
  };
}

function savedOutreach(state,overrides={}){
  return model.save(state,'contacts',{
    name:directorySource.name,organisation:directorySource.name,sourceId:directorySource.id,
    sourceUrl:directorySource.website,contactUrl:directorySource.contactUrl,
    channel:'new-media',consent:'unknown',stage:'drafting',subject:'A public conversation',
    message:'A saved draft for review.',...overrides
  },null,context);
}

test('preparing a directory source prefills a draft without saving or granting permission',async()=>{
  const initial=model.fresh(),app=await openWorkspace(initial);
  await app.action('prepare-outreach',directorySource.id);
  assert.equal(app.node('#editor').open,true);
  const fields=app.fields();
  assert.equal(fields.name,directorySource.name);
  assert.equal(fields.sourceId,directorySource.id);
  assert.equal(fields.sourceUrl,directorySource.website);
  assert.equal(fields.contactUrl,directorySource.contactUrl);
  assert.equal(fields.channel,'new-media');
  assert.equal(fields.consent,'unknown');
  for(const field of ['email','consentScope','consentEvidence','consentDate','lastContactDate','subject','message'])assert.equal(fields[field],'',field);
  assert.equal(fields.stage,'exploring');
  assert.equal(app.writes.length,0);
  assert.deepEqual(app.read(),initial);
  assert.ok(app.requests.every(request=>!request.options?.method || request.options.method==='GET'));
});

test('saving outreach preserves its public route and draft, and reopening a source edits the same record',async()=>{
  const app=await openWorkspace();
  await app.action('prepare-outreach',directorySource.id);
  const draft={subject:'Community work & questions',message:'A draft to review.\nInclude <source notes> before any contact.',stage:'drafting'};
  app.setFields(draft);
  await app.submit();
  assert.equal(app.node('#editor-error').textContent,'');
  assert.equal(app.node('#editor').open,false);
  assert.equal(app.node('#screen-title').textContent,'Outreach desk');
  const first=app.read();
  assert.equal(first.contacts.length,1);
  const record=first.contacts[0];
  for(const [key,value] of Object.entries(draft))assert.equal(record[key],value,key);
  assert.equal(record.sourceId,directorySource.id);
  assert.equal(record.sourceUrl,directorySource.website);
  assert.equal(record.contactUrl,directorySource.contactUrl);
  assert.equal(record.consent,'unknown');
  assert.equal(record.lastContactDate,'');
  await app.action('prepare-outreach',directorySource.id);
  assert.equal(app.writes.length,1,'Reopening a saved source must not save anything.');
  for(const [key,value] of Object.entries(draft))assert.equal(app.fields()[key],value,key);
  app.setFields({message:'My revised draft'});
  await app.submit();
  const revised=app.read();
  assert.equal(revised.contacts.length,1);
  assert.equal(revised.contacts[0].id,record.id);
  assert.equal(revised.contacts[0].createdAt,record.createdAt);
  assert.equal(revised.contacts[0].message,'My revised draft');
  assert.equal(revised.revision,first.revision+1);
});

test('copying a saved outreach draft does not change its stage, dates or storage',async()=>{
  const initial=model.fresh(),record=savedOutreach(initial,{stage:'exploring'}),app=await openWorkspace(initial,'outreach');
  await app.action('copy-outreach',record.id);
  assert.deepEqual(app.clipboard,[`Subject: ${record.subject}\n\n${record.message}`]);
  assert.equal(app.writes.length,0);
  assert.deepEqual(app.read(),initial);
  assert.equal(app.read().contacts[0].stage,'exploring');
  assert.equal(app.read().revision,initial.revision);
});

test('copying an unsaved editor draft leaves it open without creating a record',async()=>{
  const initial=model.fresh(),app=await openWorkspace(initial);
  await app.action('prepare-outreach',directorySource.id);
  app.setFields({subject:'Working subject',message:'Unfinished text\nFor review only.'});
  await app.action('copy-editor-draft');
  assert.deepEqual(app.clipboard,['Subject: Working subject\n\nUnfinished text\nFor review only.']);
  assert.equal(app.node('#editor').open,true);
  assert.equal(app.fields().stage,'exploring');
  assert.equal(app.writes.length,0);
  assert.deepEqual(app.read(),initial);
});

test('an outreach editor opened before another tab changes the record cannot overwrite that change',async()=>{
  const initial=model.fresh(),record=savedOutreach(initial),app=await openWorkspace(initial);
  await app.action('prepare-outreach',directorySource.id);
  app.setFields({message:'My unsaved older draft'});
  const newer=structuredClone(initial);
  const updated=Object.fromEntries(Object.keys(model.fields.contacts).filter(key=>key in record).map(key=>[key,record[key]]));
  model.save(newer,'contacts',{...updated,message:'Keep this newer draft',stage:'replied',lastContactDate:'2026-11-08'},record.id,context);
  await app.otherTabSaved(newer);
  await app.submit();
  assert.equal(app.writes.length,0);
  assert.deepEqual(app.read(),newer);
  assert.equal(app.node('#editor').open,true);
  assert.equal(app.fields().message,'My unsaved older draft');
  assert.match(app.node('#editor-error').textContent,/another tab|changed/i);
  assert.equal(app.node('#submit-button').disabled,false);
});

test('outreach search and stage filters combine and reset without changing saved records',async()=>{
  const initial=model.fresh();
  savedOutreach(initial,{name:'First source',subject:'Water planning',stage:'drafting'});
  savedOutreach(initial,{sourceId:'second-source',name:'Second source',subject:'Water interview',stage:'replied'});
  savedOutreach(initial,{sourceId:'third-source',name:'Third source',subject:'Arts conversation',stage:'drafting'});
  const app=await openWorkspace(initial,'outreach');
  await app.filter('#outreach-search','WATER','input');
  await app.filter('#outreach-stage','drafting','change');
  assert.equal(app.node('#outreach-count').textContent,'1 of 3 saved outreach records');
  assert.match(app.node('#outreach-results').innerHTML,/First source/);
  assert.doesNotMatch(app.node('#outreach-results').innerHTML,/Second source|Third source/);
  await app.filter('#outreach-stage','parked','change');
  assert.equal(app.node('#outreach-count').textContent,'0 of 3 saved outreach records');
  assert.match(app.node('#outreach-results').innerHTML,/No matching outreach/);
  await app.action('reset-outreach');
  assert.equal(app.node('#outreach-search').value,'');
  assert.equal(app.node('#outreach-stage').value,'');
  assert.equal(app.node('#outreach-count').textContent,'3 of 3 saved outreach records');
  assert.equal(app.writes.length,0);
  assert.deepEqual(app.read(),initial);
});
