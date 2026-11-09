import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory=fileURLToPath(new URL('../data/',import.meta.url));
const files=(await readdir(directory)).filter(file=>/^media-(?:radio|print-online|organisations|independent|digital-creators|national-podcasts|women|community|music|university|unions)\.json$/.test(file)).sort();
const datasets=await Promise.all(files.map(async file=>({file,rows:JSON.parse((await readFile(path.join(directory,file),'utf8')).replace(/^\uFEFF/,''))})));
const records=datasets.flatMap(({file,rows})=>Array.isArray(rows)?rows.map(row=>({file,row})):[]);
const fields=['id','name','kind','area','description','website','contactUrl','coverageUrl','coverageTitle','coverageDate','verification','sourceUrls','tags','checkedOn','notes'];
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function publicURL(value,label){assert.equal(typeof value,'string',label);const url=new URL(value);assert.equal(url.protocol,'https:',label);assert.equal(url.username,'',label);assert.equal(url.password,'',label);assert.ok(!['localhost','127.0.0.1'].includes(url.hostname),label);}

test('directory source files use the public options schema and unique identifiers',context=>{
  for(const required of ['media-radio.json','media-print-online.json','media-organisations.json','media-independent.json','media-digital-creators.json','media-national-podcasts.json','media-women.json','media-community.json','media-music.json','media-university.json','media-unions.json'])assert.ok(files.includes(required),`${required} must exist.`);
  context.diagnostic(`Validated source files: ${files.join(', ')}`);
  const ids=new Set();
  for(const {file,rows} of datasets){assert.ok(Array.isArray(rows),`${file} must contain an array.`);assert.ok(rows.length,`${file} must not be empty.`);}
  for(const {file,row} of records){
    for(const field of fields)assert.ok(Object.hasOwn(row,field),`${file}: missing ${field}`);
    assert.match(row.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.ok(!ids.has(row.id),`Duplicate identifier ${row.id}`);ids.add(row.id);
    for(const key of ['name','kind','area','description','notes'])assert.ok(typeof row[key]==='string'&&row[key].trim(),`${row.id}: ${key}`);
    assert.ok(Array.isArray(row.sourceUrls)&&row.sourceUrls.length>0,`${row.id}: sources`);
    assert.ok(Array.isArray(row.tags)&&row.tags.length>0&&row.tags.every(tag=>typeof tag==='string'&&tag.trim()),`${row.id}: tags`);
    assert.ok(Array.isArray(row.formats)&&row.formats.length>0,`${row.id}: format metadata prevents omission from filters`);
    assert.ok(row.formats.every(format=>['radio','podcast','video','social','newsletter','article'].includes(format)),`${row.id}: supported format`);
    assert.equal(new Set(row.tags).size,row.tags.length,`${row.id}: duplicate tag`);
    if(file==='media-radio.json')assert.equal(row.kind,'Radio');
    assert.ok(validDate(row.checkedOn),`${row.id}: checkedOn must be an actual calendar date.`);
    assert.ok(['outlet-verified','election-coverage-verified'].includes(row.verification),`${row.id}: verification state`);
  }
});

test('local discovery records have region and format evidence without treating example work as election coverage',()=>{
  const local=records.filter(({row})=>row.discoveryGroup==='new-media');
  assert.ok(local.length>0,'Local discovery must have sources.');
  for(const {row} of local){
    assert.ok(['Redlands','Brisbane','Logan','Ipswich','Moreton Bay','Gold Coast','Sunshine Coast'].includes(row.region),`${row.id}: a South East Queensland region is required`);
    assert.ok(Array.isArray(row.formats)&&row.formats.length>0,`${row.id}: formats required`);
    assert.ok(row.formats.every(format=>['radio','podcast','video','social','newsletter','article'].includes(format)),`${row.id}: format supported`);
    if(row.sampleUrl){
      publicURL(row.sampleUrl,`${row.id}: sample URL`);
      assert.ok(typeof row.sampleTitle==='string'&&row.sampleTitle.trim(),`${row.id}: sample title`);
      assert.ok(row.sourceUrls.includes(row.sampleUrl),`${row.id}: sample URL must be a source`);
      assert.ok(row.sampleDate===null||validDate(row.sampleDate),`${row.id}: sample date`);
      if(row.sampleDate)assert.ok(row.sampleDate<=row.checkedOn,`${row.id}: future sample date`);
    }
  }
});

test('directory links are public HTTPS sources without copied email addresses or em dashes',()=>{
  for(const {row} of records){
    publicURL(row.website,`${row.id}: website`);
    if(row.contactUrl!==null)publicURL(row.contactUrl,`${row.id}: contactUrl`);
    for(const url of row.sourceUrls)publicURL(url,`${row.id}: source`);
    const serialised=JSON.stringify(row);
    assert.ok(!/\u2014/.test(serialised),`${row.id}: em dash`);
    assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialised),`${row.id}: copied email address`);
  }
});

test('national and women-focused sources retain dated samples and verifiable guest examples',()=>{
  for(const {row} of records.filter(({row})=>['national-podcasts','women-focused'].includes(row.discoveryGroup))){
    assert.ok(Array.isArray(row.formats)&&row.formats.length>0,`${row.id}: formats`);
    if(row.discoveryGroup==='national-podcasts')assert.ok(row.formats.includes('podcast'),`${row.id}: podcast format`);
    publicURL(row.sampleUrl,`${row.id}: example work`);
    assert.ok(row.sourceUrls.includes(row.sampleUrl),`${row.id}: sample must have provenance`);
    assert.ok(row.sampleTitle,`${row.id}: sample title`);
    assert.ok(row.sampleDate===null||validDate(row.sampleDate),`${row.id}: sample date`);
    if(row.sampleDate)assert.ok(row.sampleDate<=row.checkedOn,`${row.id}: future sample`);
    else assert.match(row.notes,/date|day|undated/i,`${row.id}: explain missing date`);
    for(const guest of row.guestExamples||[]){
      assert.ok(guest.name&&guest.role&&guest.place,`${row.id}: guest context`);
      publicURL(guest.url,`${row.id}: guest example`);
      assert.ok(row.sourceUrls.includes(guest.url),`${row.id}: guest source`);
      assert.ok(validDate(guest.date)&&guest.date<=row.checkedOn,`${row.id}: guest date`);
    }
  }
});

test('election coverage is separately evidenced and never inferred from outlet verification',()=>{
  for(const {row} of records){
    if(row.verification==='outlet-verified'){
      assert.equal(row.coverageUrl,null,`${row.id}: unverified coverage URL`);
      assert.equal(row.coverageTitle,null,`${row.id}: unverified coverage title`);
      assert.equal(row.coverageDate,null,`${row.id}: unverified coverage date`);
    }else{
      publicURL(row.coverageUrl,`${row.id}: coverage URL`);
      assert.ok(typeof row.coverageTitle==='string'&&row.coverageTitle.trim(),`${row.id}: coverage title`);
      assert.ok(row.sourceUrls.includes(row.coverageUrl),`${row.id}: exact coverage URL must be a source`);
      assert.ok(row.coverageDate===null||validDate(row.coverageDate),`${row.id}: coverage date`);
      if(row.coverageDate!==null)assert.ok(row.coverageDate<=row.checkedOn,`${row.id}: future coverage date`);
      else assert.match(row.notes,/date|undated/i,`${row.id}: explain an unknown publication date`);
    }
  }
});

test('community groups expose public channels with local category and source context',()=>{
  const groups=records.filter(({row})=>row.discoveryGroup==='community-networks');
  assert.ok(groups.length>0,'Community directory must have records.');
  for(const {row} of groups){
    assert.equal(row.region,'Redlands',`${row.id}: local region`);
    assert.ok(row.category&&row.kind===row.category,`${row.id}: browsable organisation category`);
    assert.ok(Array.isArray(row.publicChannels)&&row.publicChannels.length>0,`${row.id}: public channels`);
    for(const channel of row.publicChannels){assert.ok(channel.label,`${row.id}: channel label`);publicURL(channel.url,`${row.id}: public channel`);}
    if(row.sampleUrl){publicURL(row.sampleUrl,`${row.id}: sample`);assert.ok(row.sourceUrls.includes(row.sampleUrl),`${row.id}: sample source`);}
    assert.ok(row.sampleDate===null||validDate(row.sampleDate),`${row.id}: date`);
  }
});

test('music and university sources keep submission and participation context with traceable examples',()=>{
  for(const group of ['music','university']){
    const entries=records.filter(({row})=>row.discoveryGroup===group);
    assert.ok(entries.length>0,`${group}: records required`);
    for(const {row} of entries){
      assert.ok(row.region,`${row.id}: region required`);
      assert.ok(Array.isArray(row.formats)&&row.formats.length>0,`${row.id}: formats required`);
      assert.ok(row.formats.every(format=>['radio','podcast','video','social','newsletter','article'].includes(format)),`${row.id}: format supported`);
      publicURL(row.sampleUrl,`${row.id}: example work`);
      assert.ok(row.sampleTitle&&row.sourceUrls.includes(row.sampleUrl),`${row.id}: traceable sample`);
      assert.ok(row.sampleDate===null||validDate(row.sampleDate),`${row.id}: sample date`);
      if(row.sampleDate)assert.ok(row.sampleDate<=row.checkedOn,`${row.id}: future sample`);
      else assert.match(row.notes,/date|day|undated/i,`${row.id}: explain missing date`);
      if(group==='music'){
        assert.ok(row.submissionNotes&&row.aiPolicy,`${row.id}: submission route and AI policy context required`);
      }else{
        assert.ok(row.institution&&row.participationNotes,`${row.id}: institution and participation context required`);
      }
      for(const channel of row.publicChannels||[]){
        assert.ok(channel.label,`${row.id}: public channel label`);publicURL(channel.url,`${row.id}: channel`);
      }
    }
  }
});
