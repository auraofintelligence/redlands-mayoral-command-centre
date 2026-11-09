/* Public contact-to-mail endpoint. Deploy separately from every private app. */
var MAIL_TOPICS = {
  general: 'General enquiry', media: 'Media or interview request', project: 'Project conversation',
  correction: 'Correction or source question', accessibility: 'Accessibility', privacy: 'Privacy'
};
var MAIL_FIELDS = ['name', 'email', 'topic', 'message', 'website'];
var MAIL_MAX_BODY = 32768;
var MAIL_ADDRESS_HOURLY_LIMIT = 3;
var MAIL_TOTAL_HOURLY_LIMIT = 30;
var MAIL_TOTAL_DAILY_LIMIT = 90;

function mailProperties_() { return PropertiesService.getScriptProperties(); }
function mailOwner_() {
  var owner = String(mailProperties_().getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  if (!mailAddressValid_(owner) || String(Session.getEffectiveUser().getEmail()).toLowerCase() !== owner) throw new Error('configuration');
  return owner;
}
function mailAddressValid_(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@<>,;:"\\\u0000-\u001F\u007F]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value);
}
function setupContactMail() {
  var owner = mailOwner_();
  if (String(Session.getActiveUser().getEmail()).toLowerCase() !== owner) throw new Error('Owner sign-in required.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!mailProperties_().getProperty('RATE_LIMIT_SECRET')) mailProperties_().setProperty('RATE_LIMIT_SECRET', Utilities.getUuid() + Utilities.getUuid());
    return {ready: true, remainingDailyMailQuota: MailApp.getRemainingDailyQuota()};
  } finally { lock.releaseLock(); }
}
function validateMailContact_(event) {
  if (!event || !event.postData || !/^application\/x-www-form-urlencoded(?:;|$)/i.test(String(event.postData.type || ''))) throw new Error('invalid');
  var length = Number(event.contentLength), contents = String(event.postData.contents || '');
  if (!Number.isFinite(length) || length < 1 || length > MAIL_MAX_BODY || contents.length > MAIL_MAX_BODY) throw new Error('invalid');
  var parameters = event.parameter || {}, multiple = event.parameters || {};
  Object.keys(parameters).concat(Object.keys(multiple)).forEach(function (key) {
    if (MAIL_FIELDS.indexOf(key) < 0 || typeof parameters[key] !== 'string' || (multiple[key] && multiple[key].length !== 1)) throw new Error('invalid');
  });
  if (String(parameters.website || '').trim()) throw new Error('invalid');
  var name = String(parameters.name || '').trim(), email = String(parameters.email || '').trim().toLowerCase();
  var topic = String(parameters.topic || ''), message = String(parameters.message || '').trim();
  if (!name || name.length > 120 || /[\u0000-\u001F\u007F]/.test(name)) throw new Error('invalid');
  if (!mailAddressValid_(email) || !Object.prototype.hasOwnProperty.call(MAIL_TOPICS, topic)) throw new Error('invalid');
  if (!message || message.length > 5000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) throw new Error('invalid');
  return {name: name, email: email, topic: topic, message: message};
}
function reserveMailContactRate_(email) {
  var properties = mailProperties_(), secret = properties.getProperty('RATE_LIMIT_SECRET');
  if (!secret) throw new Error('configuration');
  var now = Date.now(), hour = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
  var digest = Utilities.computeHmacSha256Signature(email, secret).map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  var state = JSON.parse(properties.getProperty('MAIL_RATE_STATE') || '{}');
  if (state.hour !== hour) { state.hour = hour; state.hourTotal = 0; state.addresses = {}; }
  if (state.day !== day) { state.day = day; state.dayTotal = 0; }
  if (state.hourTotal >= MAIL_TOTAL_HOURLY_LIMIT || state.dayTotal >= MAIL_TOTAL_DAILY_LIMIT || (state.addresses[digest] || 0) >= MAIL_ADDRESS_HOURLY_LIMIT) throw new Error('rate');
  state.hourTotal++; state.dayTotal++; state.addresses[digest] = (state.addresses[digest] || 0) + 1;
  properties.setProperty('MAIL_RATE_STATE', JSON.stringify(state));
}
function mailReceipt_(title, detail, reference) {
  function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  var ref = reference ? '<p><strong>Reference:</strong> ' + escape(reference) + '</p>' : '';
  return HtmlService.createHtmlOutput('<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' + escape(title) + '</title><style>body{margin:0;padding:3rem 1.25rem;background:#160823;color:#fff7ff;font:17px/1.6 system-ui,sans-serif}main{max-width:38rem;margin:auto;padding:2rem;background:#27103b;border:1px solid #76528f;border-radius:1rem}h1{line-height:1.15}a{color:#f3d276}p{overflow-wrap:anywhere}</style></head><body><main><h1>' + escape(title) + '</h1><p>' + escape(detail) + '</p>' + ref + '<p>You can return to the contact page using your browser.</p></main></body></html>').setTitle(title);
}
function doGet() {
  return mailReceipt_('Contact Luke', 'Use the contact form on the website to send a message. This page does not display messages or an inbox address.');
}
function doPost(event) {
  var record;
  try { record = validateMailContact_(event); }
  catch (error) { return mailReceipt_('Message not submitted', 'The form could not be accepted. Return to the form, check the fields and try again.'); }
  var lock = LockService.getScriptLock(), acquired = false;
  try {
    if (!lock.tryLock(5000)) return mailReceipt_('Please try again', 'The form is busy. Your message has not been submitted.');
    acquired = true;
    var owner = mailOwner_();
    reserveMailContactRate_(record.email);
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('quota');
    var reference = Utilities.getUuid(), received = new Date().toISOString();
    var body = [
      'Website contact enquiry', 'Reference: ' + reference, 'Received: ' + received,
      'Name: ' + record.name, 'Reply address: ' + record.email, 'Topic: ' + MAIL_TOPICS[record.topic],
      '', record.message, '', 'This message was submitted through the website contact form.',
      'The visitor has not been subscribed to updates.'
    ].join('\n');
    MailApp.sendEmail({
      to: owner, replyTo: record.email, name: 'Redlands project contact form',
      subject: '[Website enquiry] ' + MAIL_TOPICS[record.topic] + ' [' + reference + ']', body: body
    });
    return mailReceipt_('Message submitted', 'Your message was accepted for sending. Keep the reference below. This does not subscribe you to updates.', reference);
  } catch (error) {
    if (error.message === 'rate') return mailReceipt_('Please try again later', 'The form has received too many submissions. Your message has not been submitted.');
    if (error.message === 'quota') return mailReceipt_('Contact form temporarily unavailable', 'The message could not be submitted. Please return to the form and try again later.');
    return mailReceipt_('Sending could not be confirmed', 'Sending could not be confirmed. A service error can occur before or after acceptance, so a later retry may create a duplicate.');
  } finally { if (acquired) lock.releaseLock(); }
}
