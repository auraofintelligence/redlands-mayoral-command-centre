import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'control-room','public');
const readJSON=async file=>JSON.parse((await readFile(path.join(root,file),'utf8')).replace(/^\uFEFF/,''));
const names=['radio','print-online','organisations','independent','digital-creators','national-podcasts','women','community','music','university','unions'];
const media=(await Promise.all(names.map(n=>readJSON('data/media-'+n+'.json')))).flat();
if(new Set(media.map(m=>m.id)).size!==media.length)throw Error('Duplicate media IDs');
await mkdir(path.join(out,'assets','data'),{recursive:true});
await writeFile(path.join(out,'assets','data','media.json'),JSON.stringify(media,null,2)+'\n');
for(const file of ['projects','campaign'])await cp(path.join(root,'data',file+'.json'),path.join(out,'assets','data',file+'.json'));
await cp(path.join(root,'operations','model.cjs'),path.join(out,'model.js'));
console.log('Built LOCAL-ONLY command centre: '+media.length+' researched directory entries; no personal records bundled.');

await cp(path.join(root,'operations','finance.cjs'),path.join(out,'finance.js'));
