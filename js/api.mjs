import {sellerItems} from './listings.mjs?v=20261127-4';
export function setCSRF(){}
export async function api(path){
  if(path==='/session')return {accessMode:'browse-only'};
  if(path==='/catalog'){
    const res=await fetch('./catalog.json',{cache:'no-store'});
    if(!res.ok)throw Error('Не удалось загрузить каталог.');
    const catalog=await res.json();
    try{const items=await sellerItems(catalog.categories);catalog.items.unshift(...items);if(items.warning)catalog.sellerError=items.warning;}
    catch(error){catalog.sellerError=error.message;}
    return catalog;
  }
  throw Error('Эта функция недоступна.');
}
