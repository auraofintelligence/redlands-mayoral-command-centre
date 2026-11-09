/* Private owner portal. Never deploy this as an anonymous web app. */
function ownerEmail_() {
  var owner = String(PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) throw new Error('Owner configuration required.');
  return owner;
}
function assertOwner_() {
  var owner = ownerEmail_();
  var active = Session.getActiveUser().getEmail().toLowerCase();
  var effective = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!active || active !== owner || effective !== owner) throw new Error('Owner sign-in required.');
}
function rootFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID');
  if (!id) throw new Error('Set ROOT_FOLDER_ID in Script Properties, then run setupCampaignStorage.');
  var folder = DriveApp.getFolderById(id);
  if (!folder.getOwner() || folder.getOwner().getEmail().toLowerCase() !== ownerEmail_()) throw new Error('The storage folder must belong to the campaign owner.');
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE || folder.getEditors().length || folder.getViewers().length) throw new Error('Use an owner-only private folder for campaign records.');
  return folder;
}
function stateFile_() {
  var root = rootFolder_();
  var id = PropertiesService.getScriptProperties().getProperty('STATE_FILE_ID');
  if (!id) throw new Error('Run setupCampaignStorage first.');
  var file = DriveApp.getFileById(id);
  var parents = file.getParents(), inRoot = false;
  while (parents.hasNext()) if (parents.next().getId() === root.getId()) inRoot = true;
  if (!inRoot || !file.getOwner() || file.getOwner().getEmail().toLowerCase() !== ownerEmail_()) throw new Error('The records file must belong to the owner and remain inside the configured folder.');
  if (file.getSharingAccess() !== DriveApp.Access.PRIVATE || file.getEditors().length || file.getViewers().length) throw new Error('The records file must remain private to the owner.');
  return file;
}
function readState_() {
  var state = JSON.parse(stateFile_().getBlob().getDataAsString('UTF-8').replace(/^\uFEFF/, ''));
  if (state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.audit) || !Array.isArray(state.suppression) || !Object.keys(CampaignModel.fields).every(function (key) { return Array.isArray(state[key]); })) throw new Error('Unsupported or damaged records. Restore a verified backup.');
  return state;
}
function context_() { return {id: function () { return Utilities.getUuid(); }, now: function () { return new Date().toISOString(); }}; }
function mutate_(revision, action) {
  assertOwner_();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var state = readState_();
    if (state.revision !== revision) throw new Error('Records changed in another window. Reload before saving.');
    var result = action(state, context_());
    stateFile_().setContent(JSON.stringify(state, null, 2));
    return {result: result, state: state};
  } finally { lock.releaseLock(); }
}
function setupCampaignStorage() {
  assertOwner_();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var folder = rootFolder_();
    var properties = PropertiesService.getScriptProperties();
    if (!properties.getProperty('STATE_FILE_ID')) {
      var file = folder.createFile('campaign-operations.json', JSON.stringify(CampaignModel.fresh(), null, 2), MimeType.PLAIN_TEXT);
      properties.setProperty('STATE_FILE_ID', file.getId());
    }
    return {owner: ownerEmail_(), storageUrl: folder.getUrl(), revision: readState_().revision};
  } finally { lock.releaseLock(); }
}
function doGet() {
  assertOwner_();
  return HtmlService.createHtmlOutputFromFile('Admin').setTitle('Campaign administration | Luke Nathan Hayes');
}
function getDashboard() {
  assertOwner_();
  return {owner: ownerEmail_(), fields: CampaignModel.fields, defaults: CampaignModel.defaults, state: readState_(), storageUrl: rootFolder_().getUrl()};
}
function saveRecord(collection, record, id, revision) {
  return mutate_(revision, function (state, context) { return CampaignModel.save(state, collection, record, id || null, context); });
}
function suppressContact(email, reason, revision) {
  return mutate_(revision, function (state, context) { return CampaignModel.suppress(state, email, reason, context); });
}
function exportRecords(collection) {
  assertOwner_();
  return {name: collection + '.csv', content: CampaignModel.exportCsv(readState_(), collection)};
}
function createPrivateBackup() {
  assertOwner_();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var state = readState_();
    var name = 'campaign-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    var file = rootFolder_().createFile(name, JSON.stringify(state, null, 2), MimeType.PLAIN_TEXT);
    return {url: file.getUrl(), revision: state.revision};
  } finally { lock.releaseLock(); }
}
