import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import model from '../operations/model.cjs';

const source=await readFile(new URL('../control-room/public/app.js',import.meta.url),'utf8');
const storageKey='redlands-explorer-v1';

// Exercise the actual app's event handlers. The DOM shim supplies only the shell,
// editor and browser services needed to open and submit a workspace record.
async function openWorkspace(initialState){
  const nodes=new Map(),documentListeners=new Map(),windowListeners=new Map();
  const values=new Map([[storageKey,JSON.stringify(initialState)]]),writes=[];
  let activeForm;
  function node(selector){
    if(selector==='#record-form')return activeForm;
    if(nodes.has(selector))return nodes.get(selector);
    const listeners=new Map(),classes=new Set();let html='';
    const element={textContent:'',className:'',disabled:false,open:false,value:'',dataset:{},
      classList:{add:(...items)=>items.forEach(item=>classes.add(item)),remove:(...items)=>items.forEach(item=>classes.delete(item)),toggle:(item,on)=>{const next=on??!classes.has(item);if(next)classes.add(item);else classes.delete(item);return next;}},
      setAttribute(){},removeAttribute(){},showModal(){this.open=true;},close(){this.open=false;},
      addEventListener(type,handler){listeners.set(type,handler);},
      async emit(type,event){return listeners.get(type)?.(event);},
      querySelector(selector){return selector==='[type="submit"]'?node('#submit-button'):null;}
    };
    Object.defineProperty(element,'innerHTML',{get:()=>html,set:value=>{
      html=value;
      if(selector==='#editor'&&value.includes('id="record-form"')){nodes.delete('#active-form');activeForm=node('#active-form');node('#editor-error').textContent='';}
    }});
    nodes.set(selector,element);return element;
  }
  const document={querySelector:node,querySelectorAll:()=>[],addEventListener:(type,handler)=>documentListeners.set(type,handler),title:''};
  const sandbox={window:{CampaignModel:model},document,location:{hostname:'example.test',port:'',hash:'#plan'},
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push({key,value});values.set(key,value);}},
    navigator:{locks:{request:async(_name,callback)=>callback()}},crypto:{randomUUID},structuredClone,URL,
    FormData:class extends Map{constructor(form){super(Object.entries(form.fields));}},
    fetch:async url=>({ok:true,json:async()=>url.endsWith('campaign.json')?{repository:'https://example.test/repository'}:[]}),
    addEventListener:(type,handler)=>windowListeners.set(type,handler),setTimeout:()=>1,clearTimeout:()=>{}
  };
  vm.createContext(sandbox);vm.runInContext(source,sandbox,{timeout:1000});
  for(let i=0;i<20&&node('#storage-status').textContent!=='Saved in this browser';i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(node('#storage-status').textContent,'Saved in this browser',node('#view').innerHTML);
  return {
    writes,node,
    read:()=>JSON.parse(values.get(storageKey)),
    async edit(id,fields){
      const action={dataset:{action:'edit',collection:'tasks',id}};
      await documentListeners.get('click')({target:{closest:selector=>selector==='[data-action]'?action:null}});
      assert.equal(node('#editor').open,true);
      activeForm.fields=fields;
    },
    async otherTabSaved(state){values.set(storageKey,JSON.stringify(state));await windowListeners.get('storage')({key:storageKey});},
    async submit(){return activeForm.emit('submit',{target:activeForm,preventDefault(){}});}
  };
}

function existingWorkspace(){
  const state=model.fresh();
  const record=model.save(state,'tasks',{title:'Original possibility',notes:'Original notes'},null,{id:randomUUID,now:()=> '2026-11-08T02:00:00.000Z'});
  return {state,record};
}

test('a storage event cannot make an open stale browser form overwrite another tab',async()=>{
  const {state,record}=existingWorkspace();
  const app=await openWorkspace(state);
  await app.edit(record.id,{title:'My stale edit',notes:'This form was opened first',status:'planned'});
  const newer=structuredClone(state);
  model.save(newer,'tasks',{title:'Other tab title',notes:'Keep the newer notes',status:'active'},record.id,{id:randomUUID,now:()=> '2026-11-08T02:01:00.000Z'});
  await app.otherTabSaved(newer);
  await app.submit();
  assert.equal(app.writes.length,0,'Stale submission must not write browser storage.');
  assert.deepEqual(app.read(),newer,'The other tab\'s complete state must remain unchanged.');
  assert.equal(app.node('#editor').open,true,'Keep the unsaved form available for reconciliation.');
  assert.match(app.node('#editor-error').textContent,/another tab|changed/i);
});

test('an unchanged browser revision still allows the user to save a record',async()=>{
  const {state,record}=existingWorkspace();
  const app=await openWorkspace(state);
  await app.edit(record.id,{title:'My chosen possibility',notes:'Saved normally',status:'active'});
  await app.submit();
  assert.equal(app.writes.length,1);
  const saved=app.read();
  assert.equal(saved.revision,state.revision+1);
  assert.equal(saved.tasks[0].id,record.id);
  assert.equal(saved.tasks[0].title,'My chosen possibility');
  assert.equal(saved.tasks[0].notes,'Saved normally');
  assert.equal(app.node('#editor').open,false);
});
