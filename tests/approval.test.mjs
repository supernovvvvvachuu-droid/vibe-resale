import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {APPROVED_LABEL,REVIEW_LABEL_PREFIX,approvalPayload,approvalLabel,hasCurrentApproval} from '../js/approval.mjs';

const repository='supernovvvvvachuu-droid/vibe-resale';
const issue={number:27,title:'Продам: Юбка 🖤',body:'### Описание\n\nХлопок, размер M.\r\nНе определяй состав по фото.'};
const approved=async value=>({...value,labels:['approved',{name:await approvalLabel(value)}]});

test('browser and workflow fingerprints have one fixed canonical representation',async()=>{
  const canonical=JSON.stringify({v:1,repository,number:27,title:issue.title,body:issue.body});
  assert.equal(approvalPayload(issue,repository.toUpperCase()),canonical);
  const expected=createHash('sha256').update(canonical,'utf8').digest('base64url');
  assert.equal(await approvalLabel(issue),REVIEW_LABEL_PREFIX+expected);
  assert.equal((await approvalLabel(issue)).length,50);
  assert.equal(APPROVED_LABEL,'approved');
});

test('approval is bound to exact text, issue number and repository',async()=>{
  const original=await approvalLabel(issue);
  for(const changed of [{...issue,title:issue.title+' '},{...issue,body:issue.body+'\n'},{...issue,body:issue.body.replaceAll('\r','')},{...issue,number:28}])assert.notEqual(await approvalLabel(changed),original);
  assert.notEqual(await approvalLabel(issue,'another-owner/vibe-resale'),original);
  assert.equal(approvalPayload({...issue,body:null}),JSON.stringify({v:1,repository,number:27,title:issue.title,body:''}));
});

test('manual label and one matching machine receipt are both mandatory',async()=>{
  const label=await approvalLabel(issue);
  for(const labels of [undefined,[],['approved'],[label],['Approved',label],['approved','review:fake'],['approved',label,label],['approved',label,'review:'+'x'.repeat(43)],['approved',{name:label},...Array(100).fill('other')]])assert.equal(await hasCurrentApproval({...issue,labels}),false);
  assert.equal(await hasCurrentApproval(await approved(issue)),true);
  assert.equal(await hasCurrentApproval({...issue,labels:[{name:'approved'},{name:label},'unrelated']}),true);
});

test('edits and removal of approved hide a previously reviewed issue immediately',async()=>{
  const reviewed=await approved(issue);
  assert.equal(await hasCurrentApproval({...reviewed,body:issue.body+'\nhttps://evil.test'}),false);
  assert.equal(await hasCurrentApproval({...reviewed,title:'Продам: Подменённая вещь'}),false);
  assert.equal(await hasCurrentApproval({...reviewed,labels:reviewed.labels.slice(1)}),false);
  assert.equal(await hasCurrentApproval(reviewed,'another-owner/vibe-resale'),false);
});

test('malformed metadata cannot produce an approval payload or bypass the gate',async()=>{
  for(const value of [null,[],{}, {...issue,number:0},{...issue,number:'27'},{...issue,title:{}},{...issue,body:7},{...issue,title:'x'.repeat(301)},{...issue,body:'x'.repeat(65537)}]){
    assert.throws(()=>approvalPayload(value));
    assert.equal(await hasCurrentApproval(value),false);
  }
  for(const repo of [null,'https://github.com/owner/repo','owner/repo/other','owner\\repo','../repo'])assert.throws(()=>approvalPayload(issue,repo));
});
