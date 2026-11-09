// Examples are available for Luke to choose. They are never inserted by init.
export const optionalTaskTemplates = [
  {key:'explore-media',title:'Explore an election media source',dueDate:'',notes:'Follow a public source that interests you. Record whether it contains actual election coverage or is a general discovery route.'},
  {key:'save-possibility',title:'Capture a possibility',dueDate:'',notes:'Write the idea in your own terms. A date and next action are optional.'},
  {key:'compare-sources',title:'Compare sources on a question',dueDate:'',notes:'Choose a question and keep source links, checked dates and unresolved points together.'},
  {key:'prepare-draft',title:'Explore a factual public draft',dueDate:'',notes:'Choose the source material and format. Keep the result as a draft unless Luke decides otherwise.'},
  {key:'inspect-storage',title:'Explore a storage option',dueDate:'',notes:'Compare browser-local, private local and private Drive storage. Do not claim a connection without a successful write and readback.'},
  {key:'official-reference',title:'Read an official election reference',dueDate:'',evidenceUrl:'https://www.ecq.qld.gov.au/election-participants/local-election-participants/candidates',notes:'Read the current source if relevant to a direction Luke chooses. An official date is separate from a personal commitment.'}
];

// Retained export for callers of earlier versions. There is no default launch plan.
export const launchTasks = [];

export function initialiseOperations(store) {
  return store.transact(state => ({
    added:0,
    total:state.tasks.length,
    contacts:state.contacts.length,
    revision:state.revision
  }));
}
