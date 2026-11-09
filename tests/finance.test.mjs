import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import model from '../operations/model.cjs';
import finance from '../operations/finance.cjs';
import {OperationsStore} from '../operations/store.mjs';

const contribution=(overrides={})=>({id:'example',name:'Example Donor',kind:'donation',date:'2026-11-10',amount:'10.00',status:'accepted',eligibility:'checked',eligibilityEvidence:'Checked privately',publicationAgreement:'agreed',publicApproved:'yes',...overrides});
test('cash, non-cash, pledges, pending receipts and paid costs remain separate with exact cents',()=>{
 const state={contributions:[contribution({amount:'0.10'}),contribution({amount:'0.20'}),contribution({kind:'gift-in-kind',amount:'25.00'}),contribution({status:'pledged',amount:'100.00'}),contribution({status:'received-pending-review',amount:'5.00'})],expenses:[{status:'paid',amount:'12.34'},{status:'planned',amount:'90.00'},{status:'incurred',amount:'20.00'}],budgets:[{status:'approved',amount:'40.00'},{status:'option',amount:'100.00'}]};
 assert.deepEqual(finance.summary(state),{acceptedCash:'0.30',acceptedInKind:'25.00',pendingReview:'5.00',pledged:'100.00',paidExpenses:'12.34',incurredExpenses:'20.00',approvedBudget:'40.00'});
});
test('an acceptance requires recorded eligibility and agreement to named publication',()=>{
 const {id,...record}=contribution();
 assert.doesNotThrow(()=>model.validate('contributions',record));
 for(const change of [{eligibility:'unchecked'},{eligibilityEvidence:''},{publicationAgreement:'not-recorded'},{amount:'0.00'}])assert.throws(()=>model.validate('contributions',{...record,...change}),/Accepted contributions/);
 assert.doesNotThrow(()=>model.validate('contributions',{...record,status:'received-pending-review',eligibility:'unchecked',publicationAgreement:'not-recorded'}));
});
test('public reporting exports only reviewed fields and no pledges, addresses or private references',()=>{
 const state={contributions:[contribution({address:'PRIVATE ADDRESS',paymentReference:'PRIVATE PAYMENT',receiptReference:'PRIVATE RECEIPT',notes:'PRIVATE NOTES',eligibilityEvidence:'PRIVATE EVIDENCE'}),contribution({id:'pledge',status:'pledged'})],expenses:[{id:'expense',description:'Private working description',publicDescription:'Website hosting',publicPayee:'Public supplier',date:'2026-11-10',amount:'5.00',category:'hosting',status:'paid',publicApproved:'yes',receiptReference:'PRIVATE RECEIPT'}],budgets:[{id:'plan',description:'An option',amount:'20.00',category:'advertising',status:'option',publicApproved:'no'}]};
 const report=finance.publicReport(state,'2026-11-10T01:00:00Z');
 assert.equal(report.contributions.length,1);assert.equal(report.budget.length,0);
 assert.deepEqual(Object.keys(report.contributions[0]).sort(),['amount','date','id','kind','name','note','status']);
 assert.equal(report.expenses[0].description,'Website hosting');
 assert.doesNotMatch(JSON.stringify(report),/PRIVATE|Private working|pledge|eligibilityEvidence|paymentReference|receiptReference/);
});
test('a public draft cannot silently omit an accepted donation awaiting publication review',()=>{
 assert.throws(()=>finance.publicReport({contributions:[contribution({publicApproved:'no'})]}),/Review every/);
 assert.equal(finance.publicReport({contributions:[contribution({status:'received-pending-review',publicationAgreement:'not-recorded',publicApproved:'no'})]}).contributions.length,0);
});
test('opening a legacy store adds empty finance views without changing the saved file or prior records',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'redlands-finance-'));
 try{
  const original=model.fresh();delete original.contributions;delete original.budgets;
  original.expenses=[{id:'existing',description:'Existing expense',amount:'5.00',status:'planned'}];
  const bytes=JSON.stringify(original);await writeFile(path.join(directory,'operations.json'),bytes);
  const store=new OperationsStore(directory),state=await store.read();
  assert.deepEqual(state.contributions,[]);assert.deepEqual(state.budgets,[]);assert.deepEqual(state.expenses,original.expenses);
  assert.equal(await readFile(path.join(directory,'operations.json'),'utf8'),bytes);
  await store.save('budgets',{description:'Future option',amount:'0.00',category:'advertising'});
  assert.deepEqual((await store.read()).expenses,original.expenses);
 }finally{await rm(directory,{recursive:true,force:true});}
});
