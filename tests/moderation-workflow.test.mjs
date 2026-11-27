import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { approvalLabel, hasCurrentApproval } from '../js/approval.mjs';
import { moderateIssue, reviewLabel, createGitHubAPI, GitHubRequestError } from '../scripts/moderation-core.mjs';

const repository='supernovvvvvachuu-droid/vibe-resale';
const copy=value=>JSON.parse(JSON.stringify(value));
const issue=()=>({number:17,title:'Продам: Чёрная хлопковая рубашка',body:'### Цена\n\n900\n\n### Описание\n\nНастоящее описание с бирки.',state:'open',labels:[{name:'approved'}]});
function eventFor(action,snapshot=issue(),extra={}){return {action,repository:{full_name:repository},issue:copy(snapshot),sender:{login:'trusted-owner',type:'User'},label:{name:'approved'},...extra};}
function fakeAPI(initial=issue(),{permission='admin',onGet,onEnsure,permissionError}={}){
  const state={issue:copy(initial),calls:[],gets:0};
  const api={
    async getIssue(number){state.calls.push(['getIssue',number]);state.gets++;if(onGet)onGet(state);return copy(state.issue);},
    async getPermission(login){state.calls.push(['permission',login]);if(permissionError)throw permissionError;return permission;},
    async removeLabel(number,name){state.calls.push(['remove',number,name]);state.issue.labels=state.issue.labels.filter(label=>(typeof label==='string'?label:label.name)!==name);},
    async ensureApprovedLabel(){state.calls.push(['ensureApproved']);},
    async ensureReviewLabel(name){state.calls.push(['ensureReview',name]);if(onEnsure)onEnsure(state);},
    async addLabel(number,name){state.calls.push(['add',number,name]);state.issue.labels.push({name});},
  };
  return {api,state};
}

test('workflow and browser use the same exact snapshot fingerprint',async()=>{
  const original=issue();original.body+='\r\nХлопок 100% ♡';
  const proof=reviewLabel(original,repository);
  assert.equal(proof.length,50);assert.equal(proof,await approvalLabel(original,repository));
  for(const changed of [{...original,number:18},{...original,title:original.title+'!'}, {...original,body:original.body+' '}])assert.notEqual(reviewLabel(changed,repository),proof);
});

test('manual approved from a writer confirms only the event snapshot',async()=>{
  for(const permission of ['admin','maintain','write']){
    const original=issue(),{api,state}=fakeAPI(original,{permission});
    assert.deepEqual(await moderateIssue({event:eventFor('labeled',original),repository,api}),{action:'approved'});
    assert.equal(await hasCurrentApproval(state.issue,repository),true);
    assert.equal(state.calls.filter(call=>call[0]==='add').length,1);
    assert.equal(state.calls.find(call=>call[0]==='add')[2],reviewLabel(original,repository));
  }
});

test('an edit immediately makes the old proof invalid and the worker clears approval first',async()=>{
  const original=issue();original.labels.push({name:reviewLabel(original,repository)});
  const changed={...copy(original),body:original.body+'\nАвтор поменял адрес.'};
  assert.equal(await hasCurrentApproval(changed,repository),false);
  const {api,state}=fakeAPI(changed);
  assert.deepEqual(await moderateIssue({event:eventFor('edited',changed),repository,api}),{action:'invalidated'});
  assert.deepEqual(state.calls.filter(call=>call[0]==='remove').map(call=>call[2]),['approved',reviewLabel(original,repository)]);
  assert.equal(state.issue.labels.length,0);assert.equal(state.calls.some(call=>call[0]==='add'),false);
});

test('opened, reopened and closed issues never inherit an approval',async()=>{
  for(const action of ['opened','reopened','closed']){
    const original=issue();original.labels.push({name:reviewLabel(original,repository)});
    const {api,state}=fakeAPI(original);
    await moderateIssue({event:eventFor(action,original),repository,api});
    assert.equal(state.issue.labels.length,0);assert.equal(state.calls.some(call=>call[0]==='add'),false);
    if(action==='opened'){
      assert.equal(state.calls.some(call=>call[0]==='ensureApproved'),true);
      assert.ok(state.calls.findIndex(call=>call[0]==='remove')<state.calls.findIndex(call=>call[0]==='ensureApproved'));
    }
  }
});

test('author association cannot substitute for a verified collaborator permission',async()=>{
  for(const permission of ['none','read','triage']){
    const original=issue();original.author_association='OWNER';original.labels.push({name:reviewLabel(original,repository)});
    const {api,state}=fakeAPI(original,{permission});
    const result=await moderateIssue({event:eventFor('labeled',original),repository,api});
    assert.equal(result.action,'unauthorized');assert.equal(state.issue.labels.length,0);
  }
  const {api,state}=fakeAPI(issue());
  assert.equal((await moderateIssue({event:eventFor('labeled',issue(),{sender:{login:'github-actions',type:'Bot'}}),repository,api})).action,'unauthorized');
  assert.equal(state.calls.some(call=>call[0]==='add'),false);
});

test('a stale label event cannot approve a newer body returned by the API',async()=>{
  const snapshot=issue(),changed={...copy(snapshot),body:snapshot.body+'\nНовое содержимое'};
  const {api,state}=fakeAPI(changed);
  assert.equal((await moderateIssue({event:eventFor('labeled',snapshot),repository,api})).action,'stale');
  assert.equal(state.calls.some(call=>call[0]==='add'),false);assert.equal(await hasCurrentApproval(state.issue,repository),false);
});

test('an edit racing label creation is detected before the final write',async()=>{
  const snapshot=issue(),{api,state}=fakeAPI(snapshot,{onEnsure:state=>{state.issue.title+=' (изменено)';}});
  assert.equal((await moderateIssue({event:eventFor('labeled',snapshot),repository,api})).action,'stale');
  assert.equal(state.calls.some(call=>call[0]==='add'),false);assert.equal(await hasCurrentApproval(state.issue,repository),false);
});

test('an edit after the final API read cannot make the old receipt authorize new text',async()=>{
  const snapshot=issue(),{api,state}=fakeAPI(snapshot);
  const add=api.addLabel;api.addLabel=async(number,name)=>{state.issue.body+='\nИзменено перед записью метки.';await add(number,name);};
  assert.equal((await moderateIssue({event:eventFor('labeled',snapshot),repository,api})).action,'approved');
  assert.equal(await hasCurrentApproval(state.issue,repository),false);
});

test('unlabeling revokes the proof and a new manual re-approval can replace it',async()=>{
  const original=issue();original.labels=[{name:reviewLabel(original,repository)}];
  const {api,state}=fakeAPI(original);
  assert.equal((await moderateIssue({event:eventFor('unlabeled',original),repository,api})).action,'proof-removed');
  assert.deepEqual(state.issue.labels,[]);
  state.issue.labels=[{name:'approved'}];
  assert.equal((await moderateIssue({event:eventFor('labeled',state.issue),repository,api})).action,'approved');
  assert.equal(await hasCurrentApproval(state.issue,repository),true);
});

test('permission failure leaves no inherited receipt and unrelated events do nothing',async()=>{
  const original=issue();original.labels.push({name:reviewLabel(original,repository)});
  const {api,state}=fakeAPI(original,{permissionError:new Error('temporary unavailable')});
  await assert.rejects(moderateIssue({event:eventFor('labeled',original),repository,api}));
  assert.equal(await hasCurrentApproval(state.issue,repository),false);
  const unrelated=fakeAPI(issue());
  assert.equal((await moderateIssue({event:eventFor('labeled',issue(),{label:{name:'unrelated'}}),repository,api:unrelated.api})).action,'ignored');
  assert.deepEqual(unrelated.state.calls,[]);
  await assert.rejects(moderateIssue({event:eventFor('labeled',issue(),{repository:{full_name:'attacker/other'}}),repository,api:unrelated.api}));
  assert.deepEqual(unrelated.state.calls,[]);
});

test('API credentials are confined to the fixed GitHub API and response details never become errors',async()=>{
  const token='local-only-test-secret',calls=[];
  const api=createGitHubAPI(repository,token,{fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({message:token+' internal details'}),{status:403});}});
  await assert.rejects(api.getIssue(17),error=>error instanceof GitHubRequestError&&error.status===403&&!error.message.includes(token));
  assert.equal(calls.length,1);assert.equal(calls[0].url,`https://api.github.com/repos/${repository}/issues/17`);
  assert.equal(calls[0].options.headers.Authorization,'Bearer '+token);
  assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');assert.ok(calls[0].options.signal);
  assert.throws(()=>api.getIssue('../escape'));assert.equal(calls.length,1);
});

test('label creation races and already absent labels are handled idempotently',async()=>{
  const name=reviewLabel(issue(),repository);let count=0;
  const api=createGitHubAPI(repository,'local-token',{fetchImpl:async(url,options)=>{
    count++;
    if(options.method==='DELETE')return new Response('{}',{status:404});
    if(options.method==='POST')return new Response('{}',{status:422});
    return count===1?new Response('{}',{status:404}):new Response(JSON.stringify({name}),{status:200});
  }});
  await api.ensureReviewLabel(name);assert.equal(count,3);
  await api.removeLabel(17,name);assert.equal(count,4);
});

test('workflow has only required permissions and executes pinned trusted code',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/moderate-listings.yml',import.meta.url),'utf8');
  assert.match(workflow,/issues:\s*\n\s+types: \[opened, edited, reopened, closed, labeled, unlabeled\]/);
  assert.match(workflow,/contents: read/);assert.match(workflow,/issues: write/);assert.doesNotMatch(workflow,/contents: write|write-all|pull_request_target|workflow_run/);
  assert.match(workflow,/actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/run: node scripts\/moderate-issues\.mjs/);
  assert.doesNotMatch(workflow,/\$\{\{[^\n]*(?:issue\.(?:body|title)|head\.ref|head_ref)/);
  assert.doesNotMatch(workflow,/npm install|npx |curl |wget /);
});
