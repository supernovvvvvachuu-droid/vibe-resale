import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { money, safeImagePath, filterItems, scoreQuiz } from '../js/core.mjs';
import { itemCard, itemComposition } from '../js/components.mjs';
import { item } from '../js/views.mjs';
import { normalizeComposition } from '../js/materials.mjs';
const catalog=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url),'utf8'));
const products=catalog.items.filter(item=>item.ownerItem===true),state={catalog,favorites:[]};

test('all sixteen supplied things use their real local photos and unknown sale details',async()=>{
  assert.equal(products.length,16);
  let total=0;
  for(const product of products){
    assert.equal(product.price,null);assert.equal(product.externalUrl,null);
    assert.equal(product.image,product.images[0]);
    if(product.composition)normalizeComposition(product.composition);
    for(const path of product.images){
      assert.equal(safeImagePath(path),path);
      const bytes=await readFile(new URL('../'+path.slice(2),import.meta.url));
      assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
      assert.equal(bytes.readUInt32LE(4)+8,bytes.length);total++;
    }
  }
  assert.equal(total,86);
});
test('owner cards never present missing prices as free or real things as demo photos',()=>{
  for(const product of products){
    const html=itemCard(state,product);
    assert.match(html,/Цена уточняется/);assert.match(html,/Мой гардероб/);assert.doesNotMatch(html,/Демо-вещь/);
    assert.doesNotMatch(itemComposition(product),/демо/);
  }
  assert.equal(money(null),'Цена уточняется');assert.equal(money(undefined),'Цена уточняется');
});
test('the detail page retains the label text and full safe gallery without an invented purchase button',()=>{
  const product=products[0],html=item(state,product.id);
  assert.match(html,/Нажми на фото/);assert.ok(html.includes(product.compositionNote));
  for(const image of product.images)assert.ok(html.includes(`href="${image}"`));
  assert.doesNotMatch(html,/Демонстрационная вещь|Это демонстрационный пример|class="button primary" href="https:/);
});
test('unknown prices are excluded from a price limit and appear last in price sorting',()=>{
  const known={...products[0],id:'priced',price:500};
  assert.deepEqual(filterItems([products[0],known],{maxPrice:'1000'}).map(p=>p.id),['priced']);
  for(const sort of ['price-up','price-down'])assert.equal(filterItems([products[0],known],{sort})[0].id,'priced');
});
test('local photograph paths reject traversal, URL credentials, scripts and arbitrary files',()=>{
  for(const value of ['../images/products/brown-bomber/01.webp','./images/products/../01.webp','./images/products/brown-bomber/01.webp?x=1','./images/products/brown-bomber/01.svg','https://evil.test/photo.webp',{},12])assert.equal(safeImagePath(value),'./assets/goth.jpg');
});
test('every existing style quiz still calculates a valid result',()=>{
  assert.ok(catalog.quizzes.length>0);
  for(const quiz of catalog.quizzes){const result=scoreQuiz(quiz,quiz.questions.map(()=>0));assert.ok(quiz.results.some(r=>r.id===result.id));}
});
