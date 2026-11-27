import test from 'node:test';
import assert from 'node:assert/strict';
import {readListing,sellerItems} from '../js/listings.mjs';
import {approvalLabel} from '../js/approval.mjs';
import {itemCard} from '../js/components.mjs';

const photo='https://github.com/user-attachments/assets/11111111-2222-4333-8444-555555555555';
const categories=[{id:'grunge',name:'Гранж'}];
const listing=(fields={})=>({number:1,state:'open',title:'Продам: Куртка',body:Object.entries({'Цена':'1000','Фото':`![Вещь](${photo})`,'Объявление или контакт':'https://www.avito.ru/moskva/odezhda/kurtka_123','Размер':'M','Вайб':'grunge','Состояние':'Хорошее','Описание':'Моя вещь',...fields}).map(([k,v])=>`### ${k}\n\n${v}`).join('\n\n')});
const listingWith=fields=>({...listing(),...fields});
const approved=async issue=>({...issue,labels:[{name:'approved'},{name:await approvalLabel(issue)}]});

test('valid approved Avito/Telegram listings retain their original content and category',async()=>{
  const item=await readListing(await approved(listing()),categories);
  assert.equal(item.image,photo);assert.equal(item.price,1000);assert.deepEqual(item.categoryIds,['grunge']);
  assert.equal((await readListing(await approved(listing({'Объявление или контакт':'https://t.me/my_shop'})),categories)).externalUrl,'https://t.me/my_shop');
});

test('an approved label alone cannot publish an unreviewed or edited issue',async()=>{
  const issue=listing(),reviewed=await approved(issue);
  for(const candidate of [issue,{...issue,labels:['approved']},{...issue,labels:[await approvalLabel(issue)]},{...reviewed,title:'Продам: Другая вещь'},{...reviewed,body:issue.body+'\nПодмена после проверки'},{...reviewed,number:2}])assert.equal(await readListing(candidate,categories),null);
  assert.ok(await readListing(reviewed,categories));
});

test('the original URL is checked before URL normalization even for a reviewed issue',async()=>{
  for(const url of ['https://%61vito.ru/moskva/kurtka_123','https://www.avito.ru:443/moskva/kurtka_123','https://www.avi\tto.ru/moskva/kurtka_123','https://www.avito.ru/redirect/../kurtka_123','https://www.avito.ru/moskva/kurtka_123?next=https://evil.test','https://www.avito.ru/moskva/kurtka_123#fragment','https://www.avito.ru.evil.test/kurtka_123','https://www.avito.ru@evil.test/kurtka_123','https://t.me/share?url=https://evil.test','javascript:alert(1)','https://etsy.com/listing/123'])assert.equal(await readListing(await approved(listing({'Объявление или контакт':url})),categories),null,url);
});

test('photo URLs cannot use a permitted prefix to hide another destination',async()=>{
  for(const image of [photo+'.evil.test',photo+'?next=https://evil.test',photo+'/redirect',photo+'@evil.test','https://evil.test/'+photo,'data:image/svg+xml,<svg onload=alert(1)>','javascript:alert(1)'])assert.equal(await readListing(await approved(listing({'Фото':image})),categories),null,image);
});

test('malformed issue values and ambiguous duplicate fields are rejected without throwing',async()=>{
  for(const issue of [null,[],{},listingWith({title:3}),listingWith({body:{}}),listingWith({number:0}),listingWith({number:'1'}),listingWith({pull_request:{}})])assert.equal(await readListing(issue,categories),null);
  assert.equal(await readListing(await approved(listingWith({body:listing().body+'\n\n### Цена\n\n2000'})),categories),null);
  assert.equal((await readListing(await approved(listing()),[null,{name:'grunge'}])).categoryIds.length,0);
});

test('user text remains text and is escaped by the actual product card renderer',async()=>{
  const issue=listing({'Описание':'<script>alert(1)</script>','Размер':'"><img src=x onerror=alert(1)>','Состояние':'<svg onload=alert(1)>'});issue.title='Продам: <img src=x onerror=alert(1)>';
  const item=await readListing(await approved(issue),categories);assert.equal(item.description,'<script>alert(1)</script>');
  const html=itemCard({catalog:{categories},favorites:[]},item);
  assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<svg onload='));assert.ok(html.includes('&lt;img'));
});

test('one malformed or unapproved issue does not discard approved sellers; query is not trusted',async()=>{
  const original=globalThis.fetch,valid=await approved(listing());
  try{
    globalThis.fetch=async(url,options)=>{
      assert.equal(new URL(url).searchParams.get('labels'),'approved');assert.equal(options.cache,'no-store');
      assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
      return {ok:true,json:async()=>[null,{body:null},listingWith({number:99}),{...valid,number:100},valid,valid]};
    };
    const result=await sellerItems(categories);assert.equal(result.length,1);assert.equal(result[0].id,'seller-1');
  }finally{globalThis.fetch=original;}
});

test('invalid API payload fails safely and later page failures preserve prior sellers',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>({message:'wrong type'})});await assert.rejects(sellerItems(categories),/временно недоступны/);
    const page=await Promise.all(Array.from({length:100},(_,i)=>approved(listingWith({number:i+1}))));
    let calls=0;globalThis.fetch=async()=>++calls===1?{ok:true,json:async()=>page}:{ok:false};
    const result=await sellerItems(categories);assert.equal(result.length,100);assert.match(result.warning,/Часть/);
  }finally{globalThis.fetch=original;}
});

test('pagination is bounded and duplicate listing IDs do not grow the catalogue',async()=>{
  const original=globalThis.fetch,valid=await approved(listing());
  try{
    let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>Array.from({length:100},()=>valid)};};
    const result=await sellerItems(categories);assert.equal(calls,10);assert.equal(result.length,1);assert.match(result.warning,/1000/);
  }finally{globalThis.fetch=original;}
});
