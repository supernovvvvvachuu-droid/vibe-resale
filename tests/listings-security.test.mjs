import test from 'node:test';
import assert from 'node:assert/strict';
import {readListing,sellerItems} from '../js/listings.mjs';
import {itemCard} from '../js/components.mjs';

const photo='https://github.com/user-attachments/assets/11111111-2222-4333-8444-555555555555';
const categories=[{id:'grunge',name:'Гранж'}];
const listing=(fields={})=>({number:1,state:'open',title:'Продам: Куртка',body:Object.entries({'Цена':'1000','Фото':`![Вещь](${photo})`,'Объявление или контакт':'https://www.avito.ru/moskva/odezhda/kurtka_123','Размер':'M','Вайб':'grunge','Состояние':'Хорошее','Описание':'Моя вещь',...fields}).map(([k,v])=>`### ${k}\n\n${v}`).join('\n\n')});

test('valid Avito/Telegram listings retain their original content and category',()=>{
  const item=readListing(listing(),categories);assert.equal(item.image,photo);assert.equal(item.price,1000);assert.deepEqual(item.categoryIds,['grunge']);
  assert.equal(readListing(listing({'Объявление или контакт':'https://t.me/my_shop'}),categories).externalUrl,'https://t.me/my_shop');
});

test('the original URL is checked before URL normalization',()=>{
  for(const url of ['https://%61vito.ru/moskva/kurtka_123','https://www.avito.ru:443/moskva/kurtka_123','https://www.avi\tto.ru/moskva/kurtka_123','https://www.avito.ru/redirect/../kurtka_123','https://www.avito.ru/moskva/kurtka_123?next=https://evil.test','https://www.avito.ru/moskva/kurtka_123#fragment','https://www.avito.ru.evil.test/kurtka_123','https://www.avito.ru@evil.test/kurtka_123','https://t.me/share?url=https://evil.test','javascript:alert(1)','https://etsy.com/listing/123'])assert.equal(readListing(listing({'Объявление или контакт':url}),categories),null,url);
});

test('photo URLs cannot use a permitted prefix to hide another destination',()=>{
  for(const image of [photo+'.evil.test',photo+'?next=https://evil.test',photo+'/redirect',photo+'@evil.test','https://evil.test/'+photo,'data:image/svg+xml,<svg onload=alert(1)>','javascript:alert(1)'])assert.equal(readListing(listing({'Фото':image}),categories),null,image);
});

test('malformed issue values and ambiguous duplicate fields are rejected without throwing',()=>{
  for(const issue of [null,[],{},listingWith({title:3}),listingWith({body:{}}),listingWith({number:0}),listingWith({number:'1'}),listingWith({pull_request:{}})])assert.equal(readListing(issue,categories),null);
  assert.equal(readListing({...listing(),body:listing().body+'\n\n### Цена\n\n2000'},categories),null);
  assert.equal(readListing(listing(),[null,{name:'grunge'}]).categoryIds.length,0);
});
function listingWith(fields){return {...listing(),...fields};}

test('user text remains text and is escaped by the actual product card renderer',()=>{
  const issue=listing({'Описание':'<script>alert(1)</script>','Размер':'"><img src=x onerror=alert(1)>','Состояние':'<svg onload=alert(1)>'});issue.title='Продам: <img src=x onerror=alert(1)>';
  const item=readListing(issue,categories);assert.equal(item.description,'<script>alert(1)</script>');
  const html=itemCard({catalog:{categories},favorites:[]},item);assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<svg onload='));assert.ok(html.includes('&lt;img'));
});

test('one malformed issue does not discard valid sellers and requests omit credentials',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');return {ok:true,json:async()=>[null,{body:null},listing(),listing()]};};
    const result=await sellerItems(categories);assert.equal(result.length,1);assert.equal(result[0].id,'seller-1');
  }finally{globalThis.fetch=original;}
});

test('invalid API payload fails safely and later page failures preserve prior sellers',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>({message:'wrong type'})});await assert.rejects(sellerItems(categories),/временно недоступны/);
    let calls=0;globalThis.fetch=async()=>++calls===1?{ok:true,json:async()=>Array.from({length:100},(_,i)=>listingWith({number:i+1}))}:{ok:false};
    const result=await sellerItems(categories);assert.equal(result.length,100);assert.match(result.warning,/Часть/);
  }finally{globalThis.fetch=original;}
});

test('pagination is bounded and duplicate listing IDs do not grow the catalogue',async()=>{
  const original=globalThis.fetch;
  try{
    let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>Array.from({length:100},()=>listing())};};
    const result=await sellerItems(categories);assert.equal(calls,10);assert.equal(result.length,1);assert.match(result.warning,/1000/);
  }finally{globalThis.fetch=original;}
});
