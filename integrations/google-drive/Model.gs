// Generated from operations/model.cjs. Run node operations/build-apps-script.mjs after changes.
/* Canonical shared validation for local operations and the private Drive portal. */
var CampaignModel = (function () {
  'use strict';
  var fields = {
    contacts: {name: 'required', email: 'email', organisation: 'text', channel: ['resident', 'business', 'government', 'traditional-media', 'new-media', 'other'], consent: ['unknown', 'requested', 'granted', 'withdrawn'], consentScope: 'text', consentEvidence: 'text', consentDate: 'date', reviewDate: 'date', notes: 'text', sourceId: 'text', sourceUrl: 'url', contactUrl: 'url', stage: ['exploring', 'drafting', 'contacted', 'replied', 'parked'], subject: 'text', message: 'text', lastContactDate: 'date'},
    enquiries: {title: 'required', contactId: 'text', receivedDate: 'date-required', deadline: 'date', status: ['new', 'acknowledged', 'researching', 'responded', 'closed'], sourceUrl: 'url', notes: 'text'},
    publications: {title: 'required', format: ['web', 'email', 'print', 'audio', 'video', 'social'], status: ['draft', 'review', 'approved', 'published', 'withdrawn'], sourceUrl: 'url', assetPath: 'text', reviewer: 'text', reviewedDate: 'date', authorisation: 'text', publishedUrl: 'url', notes: 'text'},
    tasks: {title: 'required', owner: 'text', dueDate: 'date', status: ['planned', 'active', 'blocked', 'done'], evidenceUrl: 'url', notes: 'text'},
    expenses: {description: 'required', date: 'date-required', amount: 'money', currency: ['AUD'], category: 'required', payee: 'text', receiptReference: 'text', paymentReference: 'text', status: ['planned', 'incurred', 'paid', 'cancelled'], notes: 'text'}
  };
  var defaults = {contacts: {channel: 'other', consent: 'unknown', stage: 'exploring'}, enquiries: {status: 'new'}, publications: {format: 'web', status: 'draft'}, tasks: {status: 'planned'}, expenses: {currency: 'AUD', status: 'planned'}};
  function fail(message) { throw new Error(message); }
  function fresh() { return {version: 1, revision: 0, contacts: [], enquiries: [], publications: [], tasks: [], expenses: [], suppression: [], audit: []}; }
  function collection(name) { if (!Object.prototype.hasOwnProperty.call(fields, name)) fail('Unknown collection.'); return fields[name]; }
  function email(value) { var result = String(value || '').trim().toLowerCase(); if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail('Use a valid email address.'); return result; }
  function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; var date = new Date(value + 'T00:00:00Z'); return !isNaN(date.getTime()) && date.toISOString().slice(0,10) === value; }
  function validate(name, input) {
    var schema = collection(name);
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('A record object is required.');
    Object.keys(input).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(schema, key)) fail('Unknown field: ' + key); });
    var out = Object.assign({}, defaults[name]);
    Object.keys(schema).forEach(function (key) {
      var type = schema[key], value = input[key] === undefined ? (out[key] || '') : input[key];
      if (typeof value !== 'string' && typeof value !== 'number') fail('Invalid value for ' + key);
      value = String(value).trim();
      if (value.length > 5000) fail(key + ' is too long.');
      if (/\u2014/.test(value)) fail('Use commas, full stops or a hyphen instead of an em dash.');
      if (Array.isArray(type)) { if (type.indexOf(value) < 0) fail('Choose a valid ' + key); }
      else if ((type === 'required' || type === 'date-required') && !value) fail(key + ' is required.');
      if ((type === 'date' || type === 'date-required') && value && !validDate(value)) fail(key + ' must be YYYY-MM-DD.');
      if (type === 'email') value = email(value);
      if (type === 'url' && value && !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value)) fail(key + ' must be an HTTPS URL.');
      if (type === 'money') { if (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) > 100000000) fail('Amount must be a non-negative amount with at most two decimal places.'); value = Number(value).toFixed(2); }
      out[key] = value;
    });
    if (name === 'contacts' && out.consent === 'granted' && (!out.email || !out.consentScope || !out.consentEvidence || !out.consentDate)) fail('Granted consent requires email, scope, evidence and date.');
    if (name === 'publications' && ['approved', 'published'].indexOf(out.status) >= 0 && (!out.reviewer || !out.reviewedDate || !out.sourceUrl || !out.authorisation)) fail('Approval requires reviewer, review date, source URL and authorisation.');
    if (name === 'publications' && ['approved', 'published'].indexOf(out.status) >= 0 && out.reviewer !== 'Luke Nathan Hayes') fail('Only Luke Nathan Hayes can approve a publication.');
    if (name === 'publications' && out.status === 'published' && !out.publishedUrl) fail('Published records require a published URL.');
    return out;
  }
  function audit(state, action, name, id, context) { state.audit.push({id: context.id(), at: context.now(), action: action, collection: name, recordId: id}); state.revision += 1; }
  function save(state, name, input, id, context) {
    collection(name);
    var index = id ? state[name].findIndex(function (item) { return item.id === id; }) : -1;
    if (id && index < 0) fail('Record not found.');
    var clean = validate(name, input);
    if (name === 'contacts') {
      if (clean.sourceId && state.contacts.some(function (item) { return item.sourceId === clean.sourceId && item.id !== id; })) fail('Source already has a contact record.');
      if (clean.email && state.contacts.some(function (item) { return item.email === clean.email && item.id !== id; })) fail('Email already has a contact record.');
      if (clean.email && state.suppression.some(function (item) { return item.email === clean.email; }) && clean.consent !== 'withdrawn') fail('This email is suppressed. Keep its consent withdrawn.');
      if (clean.consent === 'withdrawn' && clean.email && !state.suppression.some(function (item) { return item.email === clean.email; })) state.suppression.push({email: clean.email, at: context.now(), reason: 'Consent withdrawn'});
    }
    if (name === 'enquiries' && clean.contactId && !state.contacts.some(function (item) { return item.id === clean.contactId; })) fail('Contact ID does not exist.');
    var item = Object.assign({}, clean, {id: id || context.id(), createdAt: index >= 0 ? state[name][index].createdAt : context.now(), updatedAt: context.now()});
    if (index >= 0) state[name][index] = item; else state[name].push(item);
    audit(state, index >= 0 ? 'update' : 'create', name, item.id, context);
    return item;
  }
  function suppress(state, address, reason, context) {
    var normal = email(address); if (!normal) fail('An email address is required.');
    if (!reason || String(reason).length > 1000) fail('A reason of 1 to 1000 characters is required.');
    if (!state.suppression.some(function (item) { return item.email === normal; })) state.suppression.push({email: normal, at: context.now(), reason: String(reason)});
    state.contacts.forEach(function (item) { if (item.email === normal) { item.consent = 'withdrawn'; item.updatedAt = context.now(); } });
    audit(state, 'suppress', 'contacts', 'redacted', context);
    return {suppressed: true};
  }
  function csvCell(value) { var cell = String(value === undefined ? '' : value); if (/^[\s]*[=+@\-]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell; return '"' + cell.replace(/"/g, '""') + '"'; }
  function exportCsv(state, name) {
    var columns = ['id'].concat(Object.keys(collection(name)), ['createdAt', 'updatedAt']);
    return [columns.map(csvCell).join(',')].concat(state[name].map(function (item) { return columns.map(function (column) { return csvCell(item[column]); }).join(','); })).join('\r\n') + '\r\n';
  }
  return {fields: fields, defaults: defaults, fresh: fresh, validate: validate, save: save, suppress: suppress, exportCsv: exportCsv, csvCell: csvCell, collection: collection};
}());

