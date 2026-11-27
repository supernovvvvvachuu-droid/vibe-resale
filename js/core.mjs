import { cottonPercent, materialPercent, MATERIALS } from './materials.mjs?v=20261127-3';
export const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => Number.isFinite(value)&&value>0?new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value):'Цена уточняется';
// Only reviewed, bundled raster photographs can become content image URLs.
// Keep this list in sync with assets/credits.json when adding an illustration.
const contentImages=new Set(['hero','goth','jacket','y2k','coquette','lace','plaid','grunge','boots','academia','bag','necklace','vintage'].map(name=>`./assets/${name}.jpg`));
export function safeImagePath(value){
  if(typeof value!=='string')return './assets/goth.jpg';
  if(/^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)||/^\.\/images\/products\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:0[1-9]|1[0-2])\.webp$/.test(value))return value;
  const local=value.replace(/^\/assets\//,'./assets/');
  return contentImages.has(local)?local:'./assets/goth.jpg';
}
export const safeInternalHref=value=>typeof value==='string'&&value.startsWith('#/')&&!/[\p{Cc}\p{Cf}\\]/u.test(value)?value:'#/';
export function scoreQuiz(quiz, answers) {
  if (!quiz?.results?.length || answers.length !== quiz.questions.length) throw new Error('Ответьте на все вопросы.');
  const scores = new Map(quiz.results.map(r => [r.id, 0]));
  quiz.questions.forEach((q, i) => {
    if (!Number.isInteger(answers[i]) || !q.answers[answers[i]]) throw new Error('Выберите вариант ответа.');
    const resultId = q.answers[answers[i]].resultId;
    if (!scores.has(resultId)) throw new Error('В тесте указан неизвестный результат.');
    scores.set(resultId, scores.get(resultId) + 1);
  });
  // При равенстве баллов результат выбирается по порядку автора. Случайности нет.
  return quiz.results.reduce((best, r) => scores.get(r.id) > scores.get(best.id) ? r : best, quiz.results[0]);
}
export function filterItems(items, { search = '', category = '', size = '', condition = '', maxPrice = '', sort = 'new', material = '' } = {}) {
  const text = search.trim().toLocaleLowerCase('ru');
  const filtered = items.filter(item => (!text || `${item.title} ${item.description} ${(item.categoryIds || []).join(' ')}`.toLocaleLowerCase('ru').includes(text)) && (!category || item.categoryIds?.includes(category)) && (!size || item.size === size) && (!condition || item.condition === condition) && (maxPrice === '' || (Number.isFinite(item.price)&&item.price>0&&item.price <= Number(maxPrice))) && (material==='cotton'?cottonPercent(item.composition)>0:material==='cotton-main'?cottonPercent(item.composition)>=50:material==='cotton-only'?cottonPercent(item.composition)===100:MATERIALS.some(m=>m.id===material)?materialPercent(item.composition,material)>0:true));
  if (sort === 'price-up') filtered.sort((a,b) => (a.price??Infinity) - (b.price??Infinity));
  if (sort === 'price-down') filtered.sort((a,b) => (b.price??-Infinity) - (a.price??-Infinity));
  return filtered;
}
export function resultItems(catalog, quizId, resultId) {
  const ids = new Set(catalog.links.filter(l => l.quizId === quizId && l.resultId === resultId).map(l => l.itemId));
  return catalog.items.filter(item => ids.has(item.id));
}
export const slug = str => String(str).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0,48);
export function readGuestFavorites(storage) {
  try {
    const value = JSON.parse(storage.getItem('vibe-favorites') || '[]');
    return Array.isArray(value) ? value.filter(x => x && ['quiz','item'].includes(x.kind) && typeof x.id === 'string' && x.id.length <= 100).slice(0,500) : [];
  } catch { return []; }
}

export function quizTopic(quiz){return ['style','music','kpop'].includes(quiz.topic)?quiz.topic:quiz.id==='soundtrack'?'music':'style';}
