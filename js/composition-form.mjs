import { escapeHTML as e } from './core.mjs?v=20261127-2';
import { MATERIALS, normalizeComposition } from './materials.mjs?v=20261127-2';

export function compositionRow(index,part={}) {
  const other=part.material==='other';
  return `<div class="composition-row" data-composition-row><label class="field"><span>Материал ${index+1}</span><select class="material-select" name="material-${index}" required><option value="">Выбери материал</option>${MATERIALS.map(material=>`<option value="${e(material.id)}"${part.material===material.id?' selected':''}>${e(material.label)}</option>`).join('')}</select></label><label class="field"><span>Доля, %</span><input class="material-percent" type="number" name="material-percent-${index}" min="0.01" max="100" step="0.01" inputmode="decimal" value="${e(part.percent??'')}" placeholder="100" required></label><label class="field composition-other${other?'':' hidden'}"><span>Название другого материала</span><input class="material-details" name="material-details-${index}" maxlength="80" minlength="2" value="${e(part.details||'')}" placeholder="Название с бирки"${other?' required':' disabled'}></label></div>`;
}
export function compositionFields() {
  return `<fieldset class="composition-fieldset"><legend>Состав вещи — обязательно</legend><p class="help">Перепиши материалы и проценты с бирки. Например: 95% хлопок и 5% эластан. Сумма должна быть 100%. Не определяй состав по фотографии.</p><div id="composition-rows">${compositionRow(0)}</div><output id="composition-total" class="help composition-total" aria-live="polite">Всего: 0% из 100%</output><div class="inline-actions"><button class="button secondary small" type="button" data-action="add-material">+ Материал</button><button class="button quiet small" type="button" data-action="remove-material">Убрать последний</button></div><p class="help">Хлопок, лён, шерсть, кашемир, шёлк, лиоцелл и вискоза приветствуются. Красивые вещи из других материалов тоже подходят. Состав всегда указывай по бирке.</p></fieldset>`;
}
export function updateCompositionForm(form) {
  let total=0;
  for(const row of form.querySelectorAll('[data-composition-row]')) {
    const other=row.querySelector('.material-select').value==='other';
    const label=row.querySelector('.composition-other'),input=row.querySelector('.material-details');
    label.classList.toggle('hidden',!other);input.disabled=!other;input.required=other;
    const percent=Number(row.querySelector('.material-percent').value);
    if(Number.isFinite(percent))total+=Math.round(percent*100);
  }
  const output=form.querySelector('#composition-total');
  if(output){output.textContent=`Всего: ${(total/100).toLocaleString('ru-RU',{maximumFractionDigits:2})}% из 100%`;output.classList.toggle('valid',total===10000);}
}
export function handleCompositionBuilder(action,button) {
  const form=button.closest('form'),rows=form.querySelector('#composition-rows');
  if(!rows)return;
  if(action==='add-material') {
    if(rows.children.length>=8)throw new Error('Можно указать до 8 материалов.');
    rows.insertAdjacentHTML('beforeend',compositionRow(rows.children.length));
  } else {
    if(rows.children.length<=1)throw new Error('Укажи хотя бы один материал.');
    rows.lastElementChild.remove();
  }
  updateCompositionForm(form);
}
export function compositionFromForm(form) {
  const parts=[...form.querySelectorAll('[data-composition-row]')].map(row=>{
    const material=row.querySelector('.material-select').value;
    return {material,percent:Number(row.querySelector('.material-percent').value),...(material==='other'?{details:row.querySelector('.material-details').value.trim()}:{})};
  });
  return normalizeComposition(parts);
}
