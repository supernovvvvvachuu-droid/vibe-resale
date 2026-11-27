import {validatedExternalUrl} from './link-policy.mjs';
export const photoPattern = /https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/ig;
export function readListing(issue, categories) {
  if(issue.pull_request || issue.state !== 'open' || !issue.title.startsWith('Продам: ')) return null;
  const body=(issue.body || '').replaceAll('\r','');
  const fields=Object.fromEntries([...body.matchAll(/^### (.+)\n+([\s\S]*?)(?=^### |(?![\s\S]))/gm)].map(m=>[m[1].trim(),m[2].trim()]));
  const image=fields['Фото']?.match(photoPattern)?.[0];
  let url;
  try {url=new URL(fields['Объявление или контакт']);url.search='';url.hash='';}catch{return null;}
  const externalUrl=validatedExternalUrl(url.href);
  const price=Number(fields['Цена']);
  const title=issue.title.slice(8).trim();
  if(!title || !image || !externalUrl || !Number.isSafeInteger(price) || price<=0)return null;
  const categoryIds=categories.filter(c=>c.id===fields['Вайб'] || c.name===fields['Вайб']).map(c=>c.id);
  return {id:'seller-'+issue.number,kind:'item',title,price,image,externalUrl,categoryIds,marketplace:url.hostname,size:fields['Размер']||'Не указан',condition:fields['Состояние']||'Не указано',description:fields['Описание']||''};
}
export function repoPath() {
  const owner=location.hostname.match(/^([\w-]+)\.github\.io$/i)?.[1];
  const repo=location.pathname.split('/').filter(Boolean)[0];
  return owner && repo && /^[\w.-]+$/.test(repo)?owner+'/'+repo:'supernovvvvvachuu-droid/vibe-resale';
}
export function saleLink(){
  const params=new URLSearchParams({title:'Продам: название вещи',body:'### Цена\n\n1000\n\n### Фото\n\nПрикрепи сюда фото с устройства.\n\n### Объявление или контакт\n\nВставь ссылку на вещь на Авито или свой профиль https://t.me/…\n\n### Размер\n\nM\n\n### Вайб\n\ngrunge\n\n### Состояние\n\nХорошее\n\n### Описание\n\nОпиши вещь.'});
  return 'https://github.com/'+repoPath()+'/issues/new?'+params;
}
export async function sellerItems(categories){
  const items=[];
  for(let page=1;;page++){
    const response=await fetch('https://api.github.com/repos/'+repoPath()+'/issues?state=open&per_page=100&page='+page);
    if(!response.ok)throw Error('Объявления продавцов временно недоступны. Обнови страницу позже.');
    const issues=await response.json();
    items.push(...issues.map(i=>readListing(i,categories)).filter(Boolean));
    if(issues.length<100)return items;
  }
}
