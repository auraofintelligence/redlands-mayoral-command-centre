var CampaignFinance = (function () {
  'use strict';
  function cents(value) {
    var text=String(value);
    if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Use a valid non-negative amount.');
    var parts=text.split('.');return Number(parts[0])*100+Number(((parts[1]||'')+'00').slice(0,2));
  }
  function amount(value){return (value/100).toFixed(2);}
  function total(records){return records.reduce(function(sum,record){return sum+cents(record.amount);},0);}
  function summary(state){
    var contributions=state.contributions||[],budgets=state.budgets||[],expenses=state.expenses||[];
    return {
      acceptedCash:amount(total(contributions.filter(function(r){return r.status==='accepted'&&r.kind!=='gift-in-kind';}))),
      acceptedInKind:amount(total(contributions.filter(function(r){return r.status==='accepted'&&r.kind==='gift-in-kind';}))),
      pendingReview:amount(total(contributions.filter(function(r){return r.status==='received-pending-review';}))),
      pledged:amount(total(contributions.filter(function(r){return r.status==='pledged';}))),
      paidExpenses:amount(total(expenses.filter(function(r){return r.status==='paid';}))),
      incurredExpenses:amount(total(expenses.filter(function(r){return r.status==='incurred';}))),
      approvedBudget:amount(total(budgets.filter(function(r){return r.status==='approved';})))
    };
  }
  function publicReport(state,now){
    var contributions=state.contributions||[],expenses=state.expenses||[],budgets=state.budgets||[];
    var accepted=contributions.filter(function(r){return r.status==='accepted'||(r.status==='returned'&&r.publicApproved==='yes'&&r.publicationAgreement==='agreed');});
    if(accepted.some(function(r){return r.publicApproved!=='yes'||r.publicationAgreement!=='agreed';}))throw new Error('Review every accepted or returned contribution for named publication before preparing a public report.');
    return {
      version:1,updated:now||new Date().toISOString(),coverage:'reviewed-records',
      contributions:accepted.map(function(r){return {id:r.id,name:r.name,kind:r.kind,date:r.date,amount:amount(cents(r.amount)),status:r.status,note:r.publicNote||''};}),
      expenses:expenses.filter(function(r){return r.publicApproved==='yes'&&r.status!=='cancelled';}).map(function(r){return {id:r.id,description:r.publicDescription||r.description,date:r.date,amount:amount(cents(r.amount)),category:r.category,payee:r.publicPayee||'',status:r.status};}),
      budget:budgets.filter(function(r){return r.publicApproved==='yes'&&r.status!=='cancelled';}).map(function(r){return {id:r.id,description:r.description,amount:amount(cents(r.amount)),category:r.category,status:r.status};})
    };
  }
  return {cents:cents,summary:summary,publicReport:publicReport};
}());
if(typeof module!=='undefined')module.exports=CampaignFinance;
