import test from 'node:test';
import assert from 'node:assert/strict';
import { itemCard } from '../js/components.mjs';
import { item as itemView } from '../js/views.mjs';
import { safeImagePath, scoreQuiz } from '../js/core.mjs';

const attachment='https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc';
const listing={id:'seller-123',kind:'item',title:'Тестовая вещь',description:'Описание для локального теста',price:750,image:attachment,externalUrl:'https://www.avito.ru/moskva/test_item_123',marketplace:'www.avito.ru',size:'M',condition:'Хорошее',categoryIds:['goth']};
const state=entry=>({favorites:[],catalog:{items:[entry],categories:[{id:'goth',name:'Goth'}],quizzes:[],collections:[],links:[]}});

test('listing text remains text in both card and detail HTML',()=>{
  const attack='<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const entry={...listing,title:attack,description:attack,size:attack,condition:attack,marketplace:attack};
  for(const html of [itemCard(state(entry),entry),itemView(state(entry),entry.id)]){
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
    assert.doesNotMatch(html,/<script\b/i);
    const unquoted=html.replace(/"[^"]*"|'[^']*'/g,'""');
    assert.doesNotMatch(unquoted,/<img\b[^>]*\bonerror\s*=/i);
  }
});

test('unsafe photo and purchase addresses cannot become active attributes',()=>{
  for(const unsafe of ['javascript:alert(1)','data:image/svg+xml,<svg onload=alert(1)>','https://github.com.evil.example/user-attachments/assets/12345678-1234-1234-1234-123456789abc','https://evil.example/tracker.jpg']){
    const entry={...listing,image:unsafe,externalUrl:unsafe};
    assert.equal(safeImagePath(unsafe),'./assets/goth.jpg');
    const html=itemView(state(entry),entry.id);
    assert.doesNotMatch(html,/(?:src|href)="(?:javascript:|data:|https:\/\/evil\.example|https:\/\/github\.com\.evil)/i);
    assert.match(html,/Ссылка заблокирована/);
  }
});

test('valid seller photos and purchase links keep working without opener access',()=>{
  for(const externalUrl of ['https://www.avito.ru/moskva/test_item_123','https://t.me/vibe_seller']){
    const entry={...listing,externalUrl};
    const html=itemView(state(entry),entry.id);
    assert.ok(html.includes(`src="${attachment}"`));
    assert.ok(html.includes(`href="${externalUrl}" target="_blank" rel="noopener noreferrer nofollow"`));
  }
});

test('style quiz scoring remains deterministic and rejects invalid choices',()=>{
  const quiz={results:[{id:'goth'},{id:'grunge'}],questions:[{answers:[{resultId:'goth'},{resultId:'grunge'}]},{answers:[{resultId:'goth'},{resultId:'grunge'}]}]};
  assert.equal(scoreQuiz(quiz,[0,0]).id,'goth');
  assert.equal(scoreQuiz(quiz,[1,1]).id,'grunge');
  assert.equal(scoreQuiz(quiz,[0,1]).id,'goth');
  assert.throws(()=>scoreQuiz(quiz,[0,9]));
});
