import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OperationsStore } from '../operations/store.mjs';
import model from '../operations/model.cjs';

export const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SESSION_LIFETIME=8*60*60*1000;
const MAX_BODY=65536;
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json; charset=utf-8','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const BASE_EXTENSIONS=new Set(['.html','.css','.js']);
const ASSET_EXTENSIONS=new Set(['.html','.css','.js','.png','.jpg','.jpeg','.webp','.ico','.woff2','.json','.svg']);
const PUBLIC_DOCUMENTS=new Set(['favicon.ico','LICENCE.md','robots.txt','llms.txt','sitemap.xml','downloads/media-brief.txt','data/projects.json']);

class RequestError extends Error {constructor(status,message){super(message);this.status=status;}}
function constantEqual(left,right){if(typeof left!=='string'||typeof right!=='string')return false;const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}
function objectBody(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new RequestError(400,'Unexpected request fields.');return value;}
async function jsonBody(request){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type']||''))throw new RequestError(415,'Use application/json.');
  if(request.headers['content-encoding']&&request.headers['content-encoding']!=='identity')throw new RequestError(415,'Encoded request bodies are not supported.');
  if(Number(request.headers['content-length']||0)>MAX_BODY)throw new RequestError(413,'Request body is too large.');
  const chunks=[];let length=0;
  for await(const chunk of request){length+=chunk.length;if(length>MAX_BODY)throw new RequestError(413,'Request body is too large.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RequestError(400,'Use a valid JSON body.');}
}
function json(response,status,value){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(value));}
function safePath(raw){
  if(!raw||!raw.startsWith('/')||raw.startsWith('//'))throw new RequestError(400,'Invalid request path.');
  let decoded;try{decoded=decodeURIComponent(raw.split('?')[0]);}catch{throw new RequestError(400,'Invalid request path.');}
  if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(part=>part==='..'||part.startsWith('.')))throw new RequestError(400,'Invalid request path.');
  return decoded;
}

export function createControlRoomServer({root=repositoryRoot,store=new OperationsStore(path.join(root,'private'))}={}){
  const publicRoot=path.resolve(root,'control-room','public');
  const sessions=new Map();
  const readJSON=async filename=>JSON.parse((await readFile(path.join(root,'data',filename),'utf8')).replace(/^\uFEFF/,''));
  const server=http.createServer({maxHeaderSize:16384},async(request,response)=>{
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Cross-Origin-Resource-Policy','same-origin');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://auraofintelligence.github.io; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
    try{
      const address=server.address();
      if(!address||typeof address==='string')throw new RequestError(503,'Local server unavailable.');
      const host=`127.0.0.1:${address.port}`,origin=`http://${host}`;
      const hostCount=request.rawHeaders.filter((_,index)=>index%2===0&&request.rawHeaders[index].toLowerCase()==='host').length;
      if(request.headers.host!==host||hostCount!==1)throw new RequestError(403,'Use the local control room address.');
      if(request.headers.origin&&request.headers.origin!==origin)throw new RequestError(403,'Cross-origin access is not allowed.');
      if(request.headers['sec-fetch-site']==='cross-site')throw new RequestError(403,'Cross-site access is not allowed.');
      if(request.headers.origin===origin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Access-Control-Allow-Credentials','true');response.setHeader('Vary','Origin');}
      const pathname=safePath(request.url);
      const method=request.method||'GET';
      if(method!=='GET'&&method!=='POST'&&method!=='HEAD')throw new RequestError(405,'Method not allowed.');
      for(const [id,session] of sessions)if(session.expiresAt<=Date.now())sessions.delete(id);
      const cookies=String(request.headers.cookie||'').split(';').map(value=>value.trim()).filter(value=>value.startsWith('campaign_session='));
      const sessionId=cookies.length===1?cookies[0].slice('campaign_session='.length):'';
      let session=sessions.get(sessionId);
      if(pathname==='/api/session'&&method==='GET'){
        if(!session){
          if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
          const id=randomBytes(32).toString('base64url');
          session={csrfToken:randomBytes(32).toString('base64url'),expiresAt:Date.now()+SESSION_LIFETIME};sessions.set(id,session);
          response.setHeader('Set-Cookie',`campaign_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME/1000}`);
        }
        return json(response,200,{csrfToken:session.csrfToken});
      }
      if(pathname.startsWith('/api/')){
        if(!session)throw new RequestError(401,'Open the control room to start a local session.');
        if(method==='POST'){
          if(request.headers.origin!==origin||!constantEqual(request.headers['x-csrf-token'],session.csrfToken))throw new RequestError(403,'A valid local session and CSRF token are required.');
        }
        if(pathname==='/api/state'&&method==='GET')return json(response,200,await store.read());
        if(pathname==='/api/projects'&&method==='GET')return json(response,200,await readJSON('projects.json'));
        if(pathname==='/api/campaign'&&method==='GET')return json(response,200,await readJSON('campaign.json'));
        const records=pathname.match(/^\/api\/records\/([a-z]+)$/);
        if(records&&method==='POST'){
          const body=objectBody(await jsonBody(request),['id','record']);
          if(body.id!==undefined&&(typeof body.id!=='string'||!body.id||body.id.length>200||!/^[A-Za-z0-9_-]+$/.test(body.id)))throw new RequestError(400,'Use a valid record ID.');
          model.collection(records[1]);
          const record=await store.save(records[1],body.record,body.id);
          return json(response,200,{record,state:await store.read()});
        }
        if(pathname==='/api/suppress'&&method==='POST'){
          const body=objectBody(await jsonBody(request),['email','reason']);
          if(typeof body.email!=='string'||typeof body.reason!=='string')throw new RequestError(400,'Email and reason must be text.');
          const result=await store.suppress(body.email,body.reason);return json(response,200,{result,state:await store.read()});
        }
        if(pathname==='/api/backup'&&method==='POST'){
          objectBody(await jsonBody(request),[]);
          return json(response,200,{path:await store.backup()});
        }
        const exported=pathname.match(/^\/api\/export\/([a-z]+)$/);
        if(exported&&method==='GET'){
          model.collection(exported[1]);
          response.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${exported[1]}.csv"`});
          return response.end(model.exportCsv(await store.read(),exported[1]));
        }
        throw new RequestError(404,'API route not found.');
      }
      if(method!=='GET'&&method!=='HEAD')throw new RequestError(405,'Method not allowed.');
      const relative=pathname==='/'?'index.html':pathname.slice(1);
      const extension=path.extname(relative).toLowerCase();
      const allowed=relative.startsWith('assets/')?ASSET_EXTENSIONS:BASE_EXTENSIONS;
      if(!allowed.has(extension)&&!PUBLIC_DOCUMENTS.has(relative))throw new RequestError(404,'File not found.');
      const target=path.resolve(publicRoot,relative);
      if(!target.startsWith(publicRoot+path.sep))throw new RequestError(400,'Invalid request path.');
      let actual,actualRoot;
      try{[actual,actualRoot]=await Promise.all([realpath(target),realpath(publicRoot)]);}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')throw new RequestError(404,'File not found.');throw error;}
      if(!actual.startsWith(actualRoot+path.sep)||(await stat(actual)).isDirectory())throw new RequestError(404,'File not found.');
      const content=await readFile(actual);
      response.writeHead(200,{'Content-Type':MIME[extension],'Content-Length':content.length});
      return response.end(method==='HEAD'?undefined:content);
    }catch(error){
      if(response.headersSent){response.end();return;}
      const operational=/Unknown collection|Unknown field|is required|must be|Choose a valid|requires|suppressed|already has|not found|too long|Invalid value|Use a valid|Only Luke|Approval requires|Published records|em dash|Amount must|record object/.test(error.message||'');
      const status=error.status||(/Another writer/.test(error.message||'')?409:operational?400:500);
      json(response,status,{error:status>=500?'The operation could not be completed. Check local storage and try again.':error.message});
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;
  return server;
}

export async function startControlRoom(){
  const store=new OperationsStore(path.join(repositoryRoot,'private'));
  const server=createControlRoomServer({store});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4183,'127.0.0.1',resolve);});
  console.log('Campaign control room: http://127.0.0.1:4183');
  console.log('Private operations stay on this computer. No messages are sent.');
  return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startControlRoom().then(server=>{
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>{process.exitCode=0;});server.closeAllConnections();});
  }).catch(error=>{console.error(error.code==='EADDRINUSE'?'Port 4183 is already in use. Close the existing control room before starting another.':error.message);process.exitCode=1;});
}
