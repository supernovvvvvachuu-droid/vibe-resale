import {sellerItems} from './listings.mjs';
export function setCSRF(){}
export async function api(path){
  if(path==='/session')return {accessMode:'browse-only'};
  if(path==='/catalog'){
    const res=await fetch('./catalog.json');
    if(!res.ok)throw Error('Не удалось загрузить каталог.');
    const catalog=await res.json();
    try{catalog.items.unshift(...await sellerItems(catalog.categories));}
    catch(error){catalog.sellerError=error.message;}
    return catalog;
  }
  throw Error('Эта функция недоступна.');
}
