import {validatedExternalUrl} from './link-policy.mjs';

// Match the whole attachment address, never a safe-looking prefix of another URL.
export const photoPattern=/^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SELLER_HOSTS=new Set(['avito.ru','www.avito.ru','t.me']);
const FAILURE='Объявления продавцов временно недоступны. Обнови страницу позже.';
const MAX_PAGES=10, PAGE_SIZE=100, PAGE_TIMEOUT=8000, TOTAL_TIMEOUT=20000;
function photoAddress(value) {
  for(const match of value.matchAll(/https:\/\/[^\s<>"')\]]+/ig))if(photoPattern.test(match[0]))return match[0];
  return null;
}
export function readListing(issue,categories=[]) {
  if(!issue||typeof issue!=='object'||Array.isArray(issue)||issue.pull_request||issue.state!=='open'||typeof issue.title!=='string'||!issue.title.startsWith('Продам: ')||typeof issue.body!=='string'||!Number.isSafeInteger(issue.number)||issue.number<1)return null;
  if(issue.title.length>300||issue.body.length>65536)return null;
  const body=issue.body.replaceAll('\r',''),fields=Object.create(null);
  for(const match of body.matchAll(/^### (.+)\n+([\s\S]*?)(?=^### |(?![\s\S]))/gm)) {
    const name=match[1].trim();
    if(Object.hasOwn(fields,name))return null;
    fields[name]=match[2].trim();
  }
  const image=photoAddress(fields['Фото']||'');
  // Validate the original text before URL() can normalize encoded hosts, dot
  // segments, control characters or explicit ports. Do not remove queries.
  const externalUrl=validatedExternalUrl(fields['Объявление или контакт']);
  const url=externalUrl?new URL(externalUrl):null;
  const price=/^[1-9][0-9]{0,7}$/.test(fields['Цена']||'')?Number(fields['Цена']):null;
  const title=issue.title.slice(8).trim();
  if(!title||!image||!url||!SELLER_HOSTS.has(url.hostname)||price===null||price>10000000)return null;
  if((fields['Описание']||'').length>5000||(fields['Размер']||'').length>100||(fields['Состояние']||'').length>300)return null;
  const categoryIds=(Array.isArray(categories)?categories:[]).filter(c=>c&&typeof c.id==='string'&&(c.id===fields['Вайб']||c.name===fields['Вайб'])).map(c=>c.id);
  return {id:'seller-'+issue.number,kind:'item',title,price,image,externalUrl,categoryIds,marketplace:url.hostname,size:fields['Размер']||'Не указан',condition:fields['Состояние']||'Не указано',description:fields['Описание']||''};
}
export function repoPath() {
  const owner=globalThis.location?.hostname.match(/^([\w-]+)\.github\.io$/i)?.[1];
  const repo=globalThis.location?.pathname.split('/').filter(Boolean)[0];
  return owner&&repo&&/^[\w.-]+$/.test(repo)?owner+'/'+repo:'supernovvvvvachuu-droid/vibe-resale';
}
export function saleLink(){
  const params=new URLSearchParams({title:'Продам: название вещи',body:'### Цена\n\n1000\n\n### Фото\n\nПрикрепи сюда фото с устройства.\n\n### Объявление или контакт\n\nВставь прямую HTTPS-ссылку на вещь на Авито без параметров отслеживания или свой профиль https://t.me/…\n\n### Размер\n\nM\n\n### Вайб\n\ngrunge\n\n### Состояние\n\nХорошее\n\n### Описание\n\nОпиши вещь.'});
  return 'https://github.com/'+repoPath()+'/issues/new?'+params;
}
export async function sellerItems(categories){
  const items=[],seen=new Set(),deadline=Date.now()+TOTAL_TIMEOUT;
  const partial=message=>{items.warning=message;return items;};
  for(let page=1;page<=MAX_PAGES;page++) {
    const remaining=deadline-Date.now();
    if(remaining<=0)return partial('Не все объявления успели загрузиться. Обнови страницу позже.');
    const controller=new AbortController();
    let timer;
    try {
      const issues=await Promise.race([
        (async()=>{
          const response=await fetch('https://api.github.com/repos/'+repoPath()+'/issues?state=open&per_page='+PAGE_SIZE+'&page='+page,{signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/vnd.github+json'}});
          if(!response.ok)throw Error(FAILURE);
          const data=await response.json();
          if(!Array.isArray(data)||data.length>PAGE_SIZE)throw Error(FAILURE);
          return data;
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error(FAILURE));},Math.min(PAGE_TIMEOUT,remaining));})
      ]);
      for(const issue of issues) {
        // A malformed listing cannot discard otherwise valid listings.
        let item;try{item=readListing(issue,categories);}catch{continue;}
        if(item&&!seen.has(item.id)){seen.add(item.id);items.push(item);}
      }
      if(issues.length<PAGE_SIZE)return items;
    }catch {
      if(items.length)return partial('Часть объявлений не загрузилась. Обнови страницу позже.');
      throw Error(FAILURE);
    }finally{clearTimeout(timer);}
  }
  return partial('Показаны первые 1000 заявок. Остальные можно посмотреть в GitHub Issues.');
}
