export const MATERIALS = Object.freeze([
  {id:'cotton',label:'Хлопок'}, {id:'linen',label:'Лён'}, {id:'wool',label:'Шерсть'},
  {id:'cashmere',label:'Кашемир'}, {id:'silk',label:'Шёлк'}, {id:'viscose',label:'Вискоза'},
  {id:'lyocell',label:'Лиоцелл'}, {id:'polyester',label:'Полиэстер'}, {id:'polyamide',label:'Полиамид'},
  {id:'elastane',label:'Эластан'}, {id:'acrylic',label:'Акрил'}, {id:'leather',label:'Натуральная кожа'},
  {id:'faux-leather',label:'Искусственная кожа'}, {id:'suede',label:'Замша'}, {id:'hemp',label:'Конопля'},
  {id:'ramie',label:'Рами'}, {id:'acetate',label:'Ацетат'}, {id:'polyurethane',label:'Полиуретан'},
  {id:'metal',label:'Металл'}, {id:'glass',label:'Стекло'}, {id:'plastic',label:'Пластик'},
  {id:'other',label:'Другой материал'}
].map(material=>Object.freeze(material)));

const materialNames=new Map(MATERIALS.map(material=>[material.id,material.label]));
const invalid=message=>{throw new Error(message);};

export function normalizeComposition(value) {
  if(!Array.isArray(value)||value.length<1||value.length>8) invalid('Состав обязателен: укажите от 1 до 8 материалов и их доли.');
  let total=0;
  const seen=new Set();
  const composition=Array.from(value,part=>{
    if(!part||typeof part!=='object'||Array.isArray(part)||typeof part.material!=='string'||!materialNames.has(part.material)) invalid('Состав: выберите материал из списка.');
    const percent=part.percent;
    if(typeof percent!=='number'||!Number.isFinite(percent)||percent<=0||percent>100) invalid('Доля материала должна быть числом больше 0 и не больше 100%.');
    const units=Math.round(percent*100);
    if(units<1||units>10000||percent!==units/100) invalid('Доля материала: от 0,01 до 100%, не более двух знаков после запятой.');
    let details;
    if(part.material==='other') {
      if(typeof part.details!=='string') invalid('Укажите название другого материала.');
      if(/\p{Cc}/u.test(part.details)) invalid('Название другого материала не должно содержать управляющие символы.');
      details=part.details.trim();
      if(details.length<2||details.length>80||/[<>\p{Cc}]/u.test(details)) invalid('Название другого материала: от 2 до 80 символов, без HTML и управляющих символов.');
    }
    const key=part.material==='other'?`other:${details.toLocaleLowerCase('ru')}`:part.material;
    if(seen.has(key)) invalid('Материал в составе не должен повторяться. Объедините его доли.');
    seen.add(key);total+=units;
    return {material:part.material,percent:units/100,...(details?{details}:{})};
  });
  if(total!==10000) invalid('Сумма долей материалов должна составлять 100%.');
  return composition;
}

export function hasValidComposition(value) {
  try {normalizeComposition(value);return true;} catch {return false;}
}

export function compositionText(value) {
  try {return normalizeComposition(value).map(part=>`${String(part.percent).replace('.',',')}% ${part.material==='other'?part.details:materialNames.get(part.material).toLocaleLowerCase('ru')}`).join(', ');} catch {return 'Состав не указан';}
}

export function materialPercent(value,materialId) {
  if(!materialNames.has(materialId))return 0;
  try {return normalizeComposition(value).filter(part=>part.material===materialId).reduce((total,part)=>total+part.percent,0);} catch {return 0;}
}

export function cottonPercent(value) { return materialPercent(value,'cotton'); }
