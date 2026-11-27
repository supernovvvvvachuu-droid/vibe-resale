import { createHash } from 'node:crypto';
import { APPROVED_LABEL, REVIEW_LABEL_PREFIX, approvalPayload } from '../js/approval.mjs';

const WRITE_PERMISSIONS=new Set(['admin','maintain','write']);
const REPOSITORY=/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?\/[a-z0-9_.-]{1,100}$/i;
const LOGIN=/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
const MAX_RESPONSE_BYTES=524288;

export class GitHubRequestError extends Error {
  constructor(status){super(`GitHub API request failed (${status}).`);this.name='GitHubRequestError';this.status=status;}
}

function names(issue){
  if(!Array.isArray(issue?.labels)||issue.labels.length>100)throw new Error('Invalid issue labels.');
  const result=issue.labels.map(label=>typeof label==='string'?label:label?.name);
  if(result.some(name=>typeof name!=='string'||name.length>50))throw new Error('Invalid issue labels.');
  return result;
}
function reviewNames(issue){return names(issue).filter(name=>name.startsWith(REVIEW_LABEL_PREFIX));}
function isIssueNumber(number){return Number.isSafeInteger(number)&&number>0;}
function numberPath(number){if(!isIssueNumber(number))throw new Error('Invalid issue number.');return String(number);}
export function reviewLabel(issue,repository){return REVIEW_LABEL_PREFIX+createHash('sha256').update(approvalPayload(issue,repository),'utf8').digest('base64url');}

async function readJSON(response){
  if(!response.body)return null;
  const reader=response.body.getReader(),parts=[];let bytes=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_RESPONSE_BYTES){await reader.cancel();throw new Error('GitHub response is too large.');}parts.push(chunk.value);}
  if(!bytes)return null;
  const all=new Uint8Array(bytes);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{throw new Error('Invalid GitHub response.');}
}

// The token is confined to api.github.com and never included in returned errors.
// Issue text is data passed to JSON.stringify; it never becomes shell code.
export function createGitHubAPI(repository,token,{fetchImpl=globalThis.fetch}={}){
  if(!REPOSITORY.test(repository)||repository.split('/')[1]==='.'||repository.split('/')[1]==='..')throw new Error('Invalid repository.');
  if(typeof token!=='string'||!token.length||/[\r\n]/.test(token))throw new Error('Missing workflow token.');
  const base='https://api.github.com/repos/'+repository;
  async function request(method,path,body){
    if(!path.startsWith('/')||path.includes('\\')||/[\r\n]/.test(path))throw new Error('Invalid API path.');
    const response=await fetchImpl(base+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok){await response.body?.cancel();throw new GitHubRequestError(response.status);}
    return readJSON(response);
  }
  async function ensureLabel(name,color,description){
    let label;
    try{label=await request('GET','/labels/'+encodeURIComponent(name));}
    catch(error){
      if(!(error instanceof GitHubRequestError)||error.status!==404)throw error;
      try{label=await request('POST','/labels',{name,color,description});}
      catch(createError){
        if(!(createError instanceof GitHubRequestError)||![409,422].includes(createError.status))throw createError;
        // Another run can have created the same fixed label in the meantime.
        label=await request('GET','/labels/'+encodeURIComponent(name));
      }
    }
    if(label?.name!==name)throw new Error('The existing label has a different name.');
  }
  return {
    getIssue:number=>request('GET','/issues/'+numberPath(number)),
    async getPermission(login){if(!LOGIN.test(login))return 'none';return (await request('GET','/collaborators/'+encodeURIComponent(login)+'/permission'))?.permission??'none';},
    async removeLabel(number,name){try{await request('DELETE','/issues/'+numberPath(number)+'/labels/'+encodeURIComponent(name));}catch(error){if(!(error instanceof GitHubRequestError)||error.status!==404)throw error;}},
    addLabel:(number,name)=>request('POST','/issues/'+numberPath(number)+'/labels',{labels:[name]}),
    ensureApprovedLabel:()=>ensureLabel(APPROVED_LABEL,'b9cbb5','Проверено владельцем или доверенным модератором.'),
    ensureReviewLabel:name=>ensureLabel(name,'d4c1d5','Служебное подтверждение версии объявления. Не назначайте вручную.'),
  };
}

async function removeProof(api,issue){for(const name of reviewNames(issue))await api.removeLabel(issue.number,name);}
async function invalidate(api,issue){
  // Remove the public authorization first. An interrupted cleanup stays closed.
  if(names(issue).includes(APPROVED_LABEL))await api.removeLabel(issue.number,APPROVED_LABEL);
  await removeProof(api,issue);
}
function assertCurrentIssue(issue,number,repository){
  if(issue?.number!==number||issue.pull_request)throw new Error('Invalid issue response.');
  approvalPayload(issue,repository);names(issue);
}
function matchesSnapshot(current,snapshot,repository){return current.state==='open'&&names(current).includes(APPROVED_LABEL)&&approvalPayload(current,repository)===approvalPayload(snapshot,repository);}

export async function moderateIssue({event,repository,api}){
  if(!event||!REPOSITORY.test(repository)||event.repository?.full_name?.toLowerCase()!==repository.toLowerCase())throw new Error('Invalid moderation event.');
  const snapshot=event.issue;
  if(!snapshot||snapshot.pull_request||!isIssueNumber(snapshot.number))return {action:'ignored'};
  const action=event.action;
  if(!['opened','edited','reopened','closed','labeled','unlabeled'].includes(action))return {action:'ignored'};
  if(['labeled','unlabeled'].includes(action)&&event.label?.name!==APPROVED_LABEL)return {action:'ignored'};
  approvalPayload(snapshot,repository);
  const current=await api.getIssue(snapshot.number);assertCurrentIssue(current,snapshot.number,repository);
  if(['opened','edited','reopened','closed'].includes(action)){
    await invalidate(api,current);
    if(action==='opened'&&snapshot.title.startsWith('Продам: '))await api.ensureApprovedLabel();
    return {action:'invalidated'};
  }
  if(action==='unlabeled'){
    // If a moderator has already re-added approved, leave that new decision in
    // place. Its matching labeled run will replace the version proof.
    if(names(current).includes(APPROVED_LABEL)&&reviewNames(current).length===1&&reviewNames(current)[0]===reviewLabel(current,repository))return {action:'already-current'};
    await removeProof(api,current);
    return {action:'proof-removed'};
  }
  // A re-approval never inherits a previous receipt while authorization checks
  // are pending or unavailable.
  await removeProof(api,current);
  const login=event.sender?.login;
  if(event.sender?.type!=='User'||typeof login!=='string'||!LOGIN.test(login)||!WRITE_PERMISSIONS.has(await api.getPermission(login))){
    await invalidate(api,current);
    return {action:'unauthorized'};
  }
  // Proof must refer to the exact text the moderator saw in the label event,
  // never to a newer body fetched after the author made another edit.
  if(!snapshot.title.startsWith('Продам: ')||!matchesSnapshot(current,snapshot,repository)){
    await invalidate(api,current);return {action:'stale'};
  }
  const proof=reviewLabel(snapshot,repository);
  await api.ensureReviewLabel(proof);
  const beforeWrite=await api.getIssue(snapshot.number);assertCurrentIssue(beforeWrite,snapshot.number,repository);
  if(!matchesSnapshot(beforeWrite,snapshot,repository)){
    await invalidate(api,beforeWrite);return {action:'stale'};
  }
  await api.addLabel(snapshot.number,proof);
  // Even if an edit races this final write, the browser compares the new body
  // with the old proof and hides it immediately. Its edited run clears labels.
  return {action:'approved'};
}
