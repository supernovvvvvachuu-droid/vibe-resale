import {saleLink} from './listings.mjs?v=20261127-3';
import { api, setCSRF } from './api.mjs?v=20261127-3';
import { scoreQuiz, readGuestFavorites, safeImagePath } from './core.mjs?v=20261127-3';
import { e, icon, header, footer, empty, intro } from './components.mjs?v=20261127-3';
import * as views from './views.mjs?v=20261127-3';
import * as owner from './owner-sections.mjs?v=20261127-3';
import { uploadOwnerImages } from './owner-upload.mjs?v=20261127-3';
import { creator, handleBuilder, readSubmission } from './creator.mjs?v=20261127-3';
import { handleCompositionBuilder, updateCompositionForm } from './composition-form.mjs?v=20261127-3';
import { initTurnstile, mountTurnstile, turnstileToken, resetTurnstile, clearTurnstile, clearAllTurnstile } from './turnstile.mjs?v=20261127-3';

const emptyCatalog=()=>({categories:[],quizzes:[],items:[],links:[],collections:[]});
const state={catalog:emptyCatalog(),user:null,authProvider:null,accessMode:null,cmsAvailable:false,ownerSignIn:false,favorites:[],mine:[],queue:[],users:[],adminContent:[],attempt:null};
const main=document.querySelector('#main'),dialog=document.querySelector('#auth-dialog');
const guestFavorites=()=>readGuestFavorites({getItem:key=>localStorage.getItem(key)});
let renderVersion=0,toastTimer,authMode='login',authVersion=0,initialized=false,sessionCheck;
function toast(message,error=false){const el=document.querySelector('#toast');el.textContent=message;el.className=`toast visible${error?' error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.className='toast';},5000);}
function currentRoute(){return new URL(location.hash.slice(1)||'/',location.origin);}
const inviteOnly=()=>state.accessMode==='invite-only';
const browseOnly=()=>state.accessMode==='browse-only';
const browseNotice=()=>empty('Без регистрации и личных кабинетов','В этой версии можно проходить тесты, смотреть каталог и сохранять избранное в своём браузере. Публикации посетителей отключены.','#/catalog','Открыть каталог');
function forgetSession(){
  authVersion++;
  clearAllTurnstile();
  state.user=null;state.authProvider=null;setCSRF(null);
  state.mine=[];state.queue=[];state.users=[];state.adminContent=[];state.attempt=null;
  state.favorites=inviteOnly()?[]:guestFavorites();
  if(inviteOnly())state.catalog=emptyCatalog();
}
function authGate(){if(browseOnly())return browseNotice();return `${intro('Маленькое сообщество, общий вайб',inviteOnly()?'Только для приглашённых':'Создавай вместе с нами',inviteOnly()?'Каталог, тесты и публикации доступны после входа. Создать аккаунт можно только по одноразовому приглашению администратора.':'Чтобы публиковать тесты и вещи, нужно приглашение администратора. Смотреть каталог и проходить тесты можно свободно.')}<div class="form-card"><h2>Уже есть приглашение?</h2><p class="help">Войди или создай аккаунт по коду. Пароль — минимум 12 символов.${inviteOnly()?' Это отдельный аккаунт Вайб Ресейл: используй новый пароль, не пароль от ChatGPT или почты.':''}</p><div class="inline-actions"><button class="button primary" data-action="auth">Войти</button><button class="button secondary" data-action="register">У меня есть приглашение</button></div></div>`;}
async function refreshSession(){
  const version=authVersion,data=await api('/session');if(version!==authVersion)return false;
  const accessMode=data.accessMode||null,user=accessMode==='browse-only'?null:data.user,changed=state.user?.id!==user?.id||state.user?.role!==user?.role||state.accessMode!==accessMode;
  state.accessMode=accessMode;state.cmsAvailable=data.cmsAvailable===true;state.ownerSignIn=data.ownerSignIn===true;if(changed)forgetSession();
  if(changed)state.user=user;else if(state.user&&user)Object.assign(state.user,user);
  state.authProvider=browseOnly()?null:data.authProvider||null;setCSRF(browseOnly()?null:data.csrfToken);return changed;
}
function notifySessionChange(){try{localStorage.setItem('vibe-session-change',String(Date.now()));}catch{}}
function revalidateSession(){
  if(!initialized||browseOnly())return Promise.resolve();
  if(!sessionCheck)sessionCheck=(async()=>{try{if(await refreshSession()){await loadContent();await render({scroll:false});}}catch(error){await handleAuthFailure(error);}finally{sessionCheck=null;}})();
  return sessionCheck;
}
async function loadFavorites(){const user=state.user,favorites=user&&!browseOnly()?(await api('/favorites')).favorites:inviteOnly()?[]:guestFavorites();if(user===state.user)state.favorites=favorites;}
async function loadContent(){if(inviteOnly()&&!state.user){state.catalog=emptyCatalog();return;}const user=state.user,catalog=await api('/catalog');if(user!==state.user)return;state.catalog=catalog;await loadFavorites();}
async function handleAuthFailure(error){if(error.status!==401)return false;forgetSession();await render({scroll:false});return true;}
async function render({scroll=true}={}){
  const version=++renderVersion,url=currentRoute(),path=url.pathname,parts=path.split('/').filter(Boolean);let html='';
  document.querySelector('#header').innerHTML=header(state,path);
  document.querySelector('#footer').innerHTML=footer(state);
  try{
    if(path==='/sell')html=intro('Для продавцов','Выставить вещь','Укажи цену, добавь фото и оставь ссылку на Авито или Telegram. Покупатель увидит вещь в каталоге и свяжется с тобой напрямую.')+`<div class="form-card"><h2>Публикация через GitHub</h2><p>Войди в GitHub, замени название после «Продам: », заполни поля и перетащи фото под заголовок «Фото». Сохрани заголовки полей. Нажми Create, затем обнови каталог. Первое фото станет обложкой.</p><p>Чтобы снять вещь с продажи, закрой своё объявление кнопкой Close issue.</p><a class="button primary" href="${e(saleLink())}">Добавить объявление на GitHub ↗</a></div>`;
    else if(browseOnly()&&['/create','/account','/admin'].includes(path))html=browseNotice();
    else if(inviteOnly()&&!state.user)html=authGate();
    else if(path==='/')html=views.home(state);
    else if(path==='/shop'&&state.cmsAvailable){const data=await api('/shop');if(version!==renderVersion)return;html=owner.publicShop(state,data.products,url.searchParams);}
    else if(parts[0]==='shop'&&parts.length===2&&state.cmsAvailable){const data=await api('/shop/'+encodeURIComponent(parts[1]));if(version!==renderVersion)return;html=owner.publicProduct(state,data.entry);}
    else if(path==='/blog'&&state.cmsAvailable){const data=await api('/blog');if(version!==renderVersion)return;html=owner.publicBlog(state,data.posts,url.searchParams);}
    else if(parts[0]==='blog'&&parts.length===2&&state.cmsAvailable){const data=await api('/blog/'+encodeURIComponent(parts[1]));if(version!==renderVersion)return;html=owner.publicPost(state,data.entry);}
    else if(parts[0]==='manage'&&state.cmsAvailable){
      if(!state.user||state.user.role!=='admin')html=owner.ownerLogin(state);
      else{const data=await api('/owner/entries');if(version!==renderVersion)return;
        if(parts.length===1)html=owner.ownerDashboard(state,data.entries,url.searchParams.get('tab'));
        else if(parts.length===3&&['product','post'].includes(parts[1])){const entry=parts[2]==='new'?null:data.entries.find(v=>v.id===parts[2]&&v.kind===parts[1]);html=parts[2]!=='new'&&!entry?empty('Публикация не найдена','Возможно, она уже удалена.','#/manage','Мой контент'):owner.ownerEditor(state,entry,parts[1]);}
        else html=empty('Страница не найдена','Открой список своих публикаций.','#/manage','Мой контент');
      }
    }
    else if(path==='/quizzes')html=views.quizzes(state,url.searchParams);
    else if(path==='/catalog')html=views.catalog(state,url.searchParams);
    else if(parts[0]==='item'&&parts.length===2)html=views.item(state,decodeURIComponent(parts[1]));
    else if(parts[0]==='quiz'&&parts.length>=2){
      const q=state.catalog.quizzes.find(q=>q.id===decodeURIComponent(parts[1]));
      if(!q)html=empty('Тест не найден','Возможно, он снят с публикации.','#/quizzes','Другие тесты');
      else if(parts[2]==='result'&&parts[3]){const r=q.results.find(r=>r.id===decodeURIComponent(parts[3]));html=r?views.result(state,q,r,state.attempt?.quizId===q.id&&state.attempt?.resultId===r.id):empty('Результат не найден','Открой тест и пройди его заново.','#/quiz/'+encodeURIComponent(q.id),'К тесту');}
      else html=state.attempt?.quizId===q.id&&!state.attempt.resultId?views.quizQuestion(q,state.attempt):views.quizIntro(state,q);
    }
    else if(path==='/vibes')html=views.vibes(state);
    else if(path==='/collections')html=`${intro('Собрано по настроению','Целое настроение','Тематические коллекции вещей, которым хорошо вместе.')}<div class="collection-grid">${state.catalog.collections.map(c=>`<a class="collection-card" href="#/collection/${encodeURIComponent(c.id)}"><img src="${e(safeImagePath(c.image))}" alt="" loading="lazy" width="500" height="300"><div><small>Вещи с одной историей</small><h3>${e(c.title)}</h3></div><span class="card-arrow">${icon('diagonal')}</span></a>`).join('')}</div>`;
    else if(parts[0]==='collection'&&parts.length===2){const c=state.catalog.collections.find(c=>c.id===decodeURIComponent(parts[1]));html=c?views.catalog(state,url.searchParams,c):empty('Коллекция не найдена','Выбери другую подборку.','#/collections','Все коллекции');}
    else if(path==='/favorites')html=views.favorites(state);
    else if(path==='/create'||path==='/account'){
      if(!state.user)html=authGate();
      else{const mine=await api('/mine');if(version!==renderVersion)return;state.mine=mine.submissions;html=path==='/create'?creator(state,url.searchParams):views.account(state);}
    }
    else if(path==='/admin'){
      if(!state.user)html=authGate();
      else if(state.user.role!=='admin')html=empty('Это место администратора','Проверка публикаций доступна только администратору.','#/account','В кабинет');
      else{const [queue,users,content]=await Promise.all([api('/admin/queue'),api('/admin/users'),api('/admin/content')]);if(version!==renderVersion)return;state.queue=queue.submissions;state.users=users.users;state.adminContent=content.submissions;html=views.admin(state,url.searchParams.get('mode'));}
    }
    else if(['about','rules','privacy'].includes(parts[0])&&parts.length===1)html=views.info(parts[0],state);
    else html=empty('Здесь пока тихо','Такой страницы нет. Начнём с главной?','#/','На главную');
  }catch(error){if(version!==renderVersion)return;if(error.status===401){forgetSession();document.querySelector('#header').innerHTML=header(state,path);html=path.startsWith('/manage')?owner.ownerLogin(state):authGate();}else if(error.status===404&&['shop','blog'].includes(parts[0]))html=empty('Публикация не найдена','Она пока не опубликована или уже снята с сайта.','#/'+parts[0],'Все публикации');else html=`${empty('Не получилось загрузить страницу',error.message)}<button class="button secondary" data-action="reload">Попробовать снова</button>`;}
  if(version!==renderVersion)return;
  clearTurnstile(main.querySelector('#submission-form'));
  main.innerHTML=`<div class="page">${state.catalog.sellerError && path==="/catalog" ? `<p class="notice">${e(state.catalog.sellerError)}</p>` : ""}${html}</div>`;
  const submissionForm=main.querySelector('#submission-form');
  if(submissionForm&&!browseOnly())mountTurnstile(submissionForm,'submit').catch(error=>{const el=submissionForm.querySelector('.form-error');if(el)el.textContent=error.message;});
  document.title=`${main.querySelector('h1')?.textContent||'Найди своё'} — Вайб Ресейл`;
  if(scroll){window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});}
  if(url.searchParams.get('focus')==='search')main.querySelector('#catalog-search')?.focus();
}

function showAuth(mode='login'){
  if(browseOnly()){toast('В этой версии регистрация и вход не нужны.');return;}
  clearTurnstile(document.querySelector('#auth-form'));
  authMode=mode;
  const register=mode==='register';
  document.querySelector('#auth-content').innerHTML=`<div class="dialog-head"><div><div class="eyebrow"><span>✦</span> VIBE RESALE</div><h2 id="auth-title">${register?'Рады знакомству':'С возвращением'}</h2></div><button class="icon-button" data-action="close-auth" aria-label="Закрыть">${icon('close')}</button></div><p class="help">${register?'Регистрация по приглашению — для первых 15 участников.':inviteOnly()?'Войди, чтобы открыть закрытый каталог и тесты. Используй отдельный пароль Вайб Ресейл.':'Войди, чтобы создавать публикации и сохранять избранное в аккаунте.'}</p><form id="auth-form"><label class="field"><span>Имя пользователя</span><input name="username" autocomplete="username" minlength="3" maxlength="32" required placeholder="Твоё имя или псевдоним"><small>3–32 символа: буквы, цифры, дефис и подчёркивание.</small></label><label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" ${register?'minlength="12"':''} maxlength="128" required><small>${register?'Не менее 12 символов. Лучше использовать длинную фразу.':''}</small></label>${register?'<label class="field"><span>Повтори пароль</span><input name="passwordConfirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label class="field"><span>Код приглашения</span><input name="inviteCode" autocomplete="off" required maxlength="100" placeholder="VIBE-…"></label>':''}<div class="form-error" role="alert"></div><button class="button primary" type="submit">${register?'Создать аккаунт':'Войти'} ${icon('arrow')}</button></form><button class="auth-switch" data-action="${register?'auth':'register'}">${register?'Уже есть аккаунт? Войти':'Есть приглашение? Зарегистрироваться'}</button><p class="help">${inviteOnly()?'Код приглашения выдаёт администратор. Пароль от почты или ChatGPT здесь не нужен.':'Избранное гостя хранится отдельно в этом браузере. После входа откроется избранное аккаунта.'}</p>`;
  if(!dialog.open)dialog.showModal();
  else dialog.querySelector('input')?.focus();
  const authForm=document.querySelector('#auth-form');
  mountTurnstile(authForm,register?'register':'login').catch(error=>{const el=authForm?.querySelector('.form-error');if(el)el.textContent=error.message;});
}
async function favorite(button){
  const {kind,id}=button.dataset,user=browseOnly()?null:state.user,was=state.favorites.some(f=>f.kind===kind&&f.id===id);
  button.disabled=true;
  try{if(user)await api('/favorites',{method:'PUT',body:{kind,id,saved:!was}});
    if(!browseOnly()&&user!==state.user)return;
    const next=state.favorites.filter(f=>f.kind!==kind||f.id!==id);if(!was)next.push({kind,id});
    if(browseOnly()||!state.user){try{localStorage.setItem('vibe-favorites',JSON.stringify(next));}catch{throw new Error('Браузер не разрешает сохранение. Проверь его настройки.');}}
    state.favorites=next;
    document.querySelectorAll('[data-action="favorite"]').forEach(el=>{if(el.dataset.id!==id||el.dataset.kind!==kind)return;const saved=!was;if(el.classList.contains('icon-button')){el.classList.toggle('selected',saved);el.setAttribute('aria-pressed',String(saved));el.setAttribute('aria-label',saved?'Удалить из избранного':'Сохранить в избранное');}else el.innerHTML=`${icon('heart')} ${saved?'Убрать из избранного':'Сохранить вещь'}`;});
    if(currentRoute().pathname==='/favorites')await render({scroll:false});
    toast(was?'Убрано из избранного':'Сохранено в избранное');
  }finally{button.disabled=false;}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
  try{
    if(browseOnly()&&!['favorite','reload','start-quiz','previous-question','exit-quiz','share-result','close-auth'].includes(action)){toast('Регистрация и публикации посетителей отключены.');return;}
    if(action==='auth')showAuth();
    else if(action==='register')showAuth('register');
    else if(action==='close-auth'){clearTurnstile(document.querySelector('#auth-form'));dialog.close();}
    else if(action==='favorite')await favorite(button);
    else if(action==='logout'){button.disabled=true;await api('/auth/logout',{method:'POST',body:{}});forgetSession();notifySessionChange();toast('Ты вышел из аккаунта');await render();}
    else if(action==='reload')await initialize();
    else if(action==='start-quiz'){state.attempt={quizId:button.dataset.id,index:0,answers:[]};const hash=`#/quiz/${encodeURIComponent(button.dataset.id)}`;if(location.hash===hash)await render();else location.hash=hash;}
    else if(action==='previous-question'){if(state.attempt&&state.attempt.index>0){state.attempt.index--;await render();}}
    else if(action==='exit-quiz'){state.attempt=null;await render();}
    else if(action==='share-result'){try{await navigator.clipboard.writeText(location.href);toast('Ссылка на результат скопирована');}catch{toast('Скопируй адрес страницы из строки браузера.');}}
    else if(action==='owner-photo-remove'){
      const form=button.closest('#owner-entry-form');if(!form||form.dataset.uploading==='true')return;
      button.closest('[data-owner-photo]')?.remove();const photos=[...form.querySelectorAll('[name=imageIds]')].map(el=>el.value);form.querySelector('[data-owner-photos]').innerHTML=owner.renderOwnerPhotos(photos);
    }
    else if(action==='owner-delete'){
      if(!window.confirm(`Удалить «${button.dataset.title}»? Публикация и её карточка исчезнут с сайта.`))return;
      button.disabled=true;await api('/owner/'+(button.dataset.kind==='post'?'posts':'products')+'/'+encodeURIComponent(button.dataset.id),{method:'DELETE',body:{version:Number(button.dataset.version)}});toast('Публикация удалена');await render({scroll:false});
    }
    else if(action==='add-material'||action==='remove-material')handleCompositionBuilder(action,button);
    else if(['add-result','remove-result','add-question','remove-question','add-answer','remove-answer'].includes(action))handleBuilder(action,button,state);
    else if(action==='invite'){button.disabled=true;try{const data=await api('/admin/invites',{method:'POST',body:{}});document.querySelector('#invite-result').innerHTML=`<div class="notice good"><p>Передай код одному участнику через свой обычный канал связи. Он показан только сейчас.</p><div class="invite-code">${e(data.code)}</div><p>Действует до ${new Date(data.expiresAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} МСК</p><button class="button secondary small" data-action="copy-invite" data-code="${e(data.code)}">Скопировать код</button></div>`;}finally{button.disabled=false;}}
    else if(action==='copy-invite'){try{await navigator.clipboard.writeText(button.dataset.code);toast('Код скопирован');}catch{toast('Выдели и скопируй код вручную.');}}
  }catch(error){await handleAuthFailure(error);toast(error.message,true);button.disabled=false;}
});
document.addEventListener('change',async event=>{
  const target=event.target;
  if(target.name==='photos'&&target.closest('#owner-entry-form')){
    const form=target.closest('form'),status=form.querySelector('[data-owner-upload-status]'),errorEl=form.querySelector('.form-error');
    if(form.dataset.uploading==='true')return;
    const existing=[...form.querySelectorAll('[name=imageIds]')].map(el=>el.value),files=[...target.files];
    if(!files.length)return;
    if(existing.length+files.length>12){errorEl.textContent='Можно добавить не больше 12 фотографий.';target.value='';return;}
    form.dataset.uploading='true';target.disabled=true;form.querySelectorAll('[type=submit]').forEach(b=>b.disabled=true);status.textContent='Подготавливаю и сохраняю фотографии…';errorEl.textContent='';
    try{const result=await uploadOwnerImages(files,{api});if(!form.isConnected)return;form.querySelector('[data-owner-photos]').innerHTML=owner.renderOwnerPhotos([...existing,...result.images.map(v=>v.id)]);status.textContent=`Сохранено фотографий: ${result.images.length}. Сохрани карточку, чтобы прикрепить их.`;}
    catch(error){await handleAuthFailure(error);errorEl.textContent=error.message;status.textContent='';}
    finally{form.dataset.uploading='false';target.disabled=false;target.value='';form.querySelectorAll('[type=submit]').forEach(b=>b.disabled=false);}
    return;
  }
  if(target.closest('[data-composition-row]'))updateCompositionForm(target.closest('form'));
  if(target.name==='answer'&&state.attempt)state.attempt.answers[state.attempt.index]=Number(target.value);
  if(target.id==='link-quiz'){const quiz=state.catalog.quizzes.find(q=>q.id===target.value);document.querySelector('#link-result').innerHTML=quiz?.results.map(r=>`<option value="${e(r.id)}">${e(r.title)}</option>`).join('')||'';}
});
document.addEventListener('input',event=>{if(event.target.classList.contains('material-percent'))updateCompositionForm(event.target.closest('form'));});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();if(form.dataset.busy==='true')return;
  const errorEl=form.querySelector('.form-error');if(errorEl)errorEl.textContent='';
  const submit=event.submitter||form.querySelector('[type=submit]');
  try{
    if(browseOnly()&&!['catalog-filters','quiz-filters','quiz-answer','owner-shop-filters','owner-blog-filters'].includes(form.id))throw new Error('В этой версии нет регистрации и отправки публикаций.');
    if(['catalog-filters','quiz-filters','owner-shop-filters','owner-blog-filters'].includes(form.id)){const params=new URLSearchParams();for(const [key,value]of new FormData(form))if(String(value).trim()&&!(key==='sort'&&value==='new'))params.set(key,String(value));const path=currentRoute().pathname;location.hash=path+(params.size?'?'+params.toString():'');return;}
    if(form.id==='quiz-answer'){const fd=new FormData(form),value=fd.get('answer');if(value===null)throw new Error('Выбери ответ, который ближе тебе.');const a=state.attempt,q=state.catalog.quizzes.find(q=>q.id===a.quizId);a.answers[a.index]=Number(value);if(a.index<q.questions.length-1){a.index++;await render();}else{const result=scoreQuiz(q,a.answers);a.resultId=result.id;location.hash=`/quiz/${encodeURIComponent(q.id)}/result/${encodeURIComponent(result.id)}`;}return;}
    form.dataset.busy='true';form.querySelectorAll('[type=submit]').forEach(b=>b.disabled=true);
    if(form.id==='auth-form'){
      const mode=authMode,fd=new FormData(form),data={username:String(fd.get('username')),password:String(fd.get('password'))};
      if(mode==='register'){if(data.password!==fd.get('passwordConfirm'))throw new Error('Пароли не совпадают.');data.inviteCode=String(fd.get('inviteCode')).trim();}
      data.turnstileToken=await turnstileToken(form,mode==='register'?'register':'login');
      const result=await api('/auth/'+(mode==='register'?'register':'login'),{method:'POST',body:data});forgetSession();state.user=result.user;state.authProvider=result.authProvider||null;setCSRF(result.csrfToken);initialized=true;notifySessionChange();await loadContent();clearTurnstile(form);form.reset?.();dialog.close();toast('Ты в сообществе. Добро пожаловать!');await render({scroll:false});
    }
    else if(form.id==='owner-entry-form'){
      if(form.dataset.uploading==='true')throw new Error('Дождись загрузки фотографий.');
      const data=owner.readOwnerForm(form),kind=form.dataset.kind,endpoint='/owner/'+(kind==='post'?'posts':'products')+(form.dataset.id?'/'+encodeURIComponent(form.dataset.id):'');
      await api(endpoint,{method:form.dataset.id?'PUT':'POST',body:data});toast(data.status==='published'?'Опубликовано на сайте':'Черновик сохранён');location.hash='/manage?tab='+kind;
    }
    else if(form.id==='submission-form'){
      const data=readSubmission(form);data.turnstileToken=await turnstileToken(form,'submit');await api('/submissions',{method:'POST',body:data});clearTurnstile(form);main.innerHTML=`<div class="page form-shell">${intro('Спасибо за твою идею','Отправлено на проверку','Администратор проверит публикацию. Она пока не видна другим участникам.')}<div class="form-success"><p>Решение и комментарий появятся в личном кабинете.</p><a class="button primary" href="#/account">Мои публикации ${icon('arrow')}</a></div></div>`;window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});
    }
    else if(form.classList.contains('review-form')){
      const decision=event.submitter?.value;if(!['approved','rejected'].includes(decision))return;
      const note=String(new FormData(form).get('note')||'').trim();if(decision==='rejected'&&!note)throw new Error('Добавь причину, чтобы автор понял решение.');
      await api('/admin/review',{method:'POST',body:{id:form.dataset.id,decision,note}});await loadContent();toast(decision==='approved'?'Публикация одобрена':'Публикация отклонена или снята');await render({scroll:false});
    }
  }catch(error){await handleAuthFailure(error);if(errorEl){errorEl.textContent=error.message;errorEl.scrollIntoView({block:'nearest'});}else toast(error.message,true);}
  finally{resetTurnstile(form);form.dataset.busy='false';form.querySelectorAll('[type=submit]').forEach(b=>b.disabled=false);}
});
document.addEventListener('close',event=>{if(event.target===dialog)clearTurnstile(document.querySelector('#auth-form'));},true);
window.addEventListener('hashchange',()=>{clearTurnstile(document.querySelector('#auth-form'));dialog.close();render();});
window.addEventListener('storage',event=>{if(event.key==='vibe-session-change')return revalidateSession();});
window.addEventListener('pageshow',()=>revalidateSession());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')return revalidateSession();});
async function initialize(){
  try{await refreshSession();await loadContent();await render();initialized=true;}
  catch(error){if(await handleAuthFailure(error))return;document.querySelector('#header').innerHTML=header(state,'/');document.querySelector('#footer').innerHTML=footer(state);main.innerHTML=`<div class="page">${empty('Сайт пока не подключился к базе',error.message)}<div class="notice">Если ты запускаешь проект впервые, открой инструкцию README.md и запусти сервер командой npm run dev. Открытие HTML-файла двойным щелчком не запускает базу данных.</div><button class="button primary" data-action="reload">Попробовать снова</button></div>`;}
}
initialize();
