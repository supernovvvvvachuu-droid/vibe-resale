import { api } from './api.mjs?v=20261127-4';

const SCRIPT='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const actions=new Set(['login','register','submit']);
const forms=new Map();
let configPromise,scriptPromise;

export function initTurnstile() {
  if(!configPromise) configPromise=api('/security').then(data=>{
    const config=data?.turnstile;
    if(config?.enabled===false) return {enabled:false};
    if(config?.enabled!==true||typeof config.siteKey!=='string'||!/^[A-Za-z0-9_-]{20,200}$/.test(config.siteKey)) throw new Error('Защита форм ещё не настроена.');
    return {enabled:true,siteKey:config.siteKey};
  }).catch(error=>{configPromise=null;throw error;});
  return configPromise;
}

function loadScript() {
  if(globalThis.turnstile?.render) return Promise.resolve(globalThis.turnstile);
  if(scriptPromise) return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>finish(new Error('Проверка защиты не загрузилась. Попробуйте позже.')),10000);
    const finish=error=>{
      clearTimeout(timer);
      if(error){script.remove();scriptPromise=null;reject(error);}
      else if(globalThis.turnstile?.render)resolve(globalThis.turnstile);
      else reject(new Error('Проверка защиты недоступна.'));
    };
    script.src=SCRIPT;script.async=true;script.defer=true;
    script.addEventListener('load',()=>finish());
    script.addEventListener('error',()=>finish(new Error('Не удалось загрузить проверку защиты.')));
    document.head.append(script);
  });
  return scriptPromise;
}

export async function mountTurnstile(form,action) {
  if(!form||!actions.has(action)) return;
  const existing=forms.get(form);
  if(existing&&existing.action===action) return existing.ready;
  clearTurnstile(form);
  const entry={action,token:null,enabled:false,widgetId:null,cancelled:false,container:null};
  forms.set(form,entry);
  entry.ready=(async()=>{
    const config=await initTurnstile();
    entry.enabled=config.enabled;
    if(!config.enabled||entry.cancelled||form.isConnected===false)return;
    const widget=await loadScript();
    if(entry.cancelled||form.isConnected===false)return;
    const container=document.createElement('div');
    container.setAttribute('aria-label','Проверка защиты от автоматических отправок');
    entry.container=container;
    form.insertBefore(container,form.querySelector('.form-error')||form.querySelector('[type=submit]'));
    entry.widgetId=widget.render(container,{sitekey:config.siteKey,action,theme:'dark',size:'flexible','response-field':false,
      callback:token=>{if(!entry.cancelled)entry.token=token;},
      'expired-callback':()=>{entry.token=null;},
      'error-callback':()=>{entry.token=null;return true;},
    });
  })();
  try { await entry.ready; }
  catch(error) { clearTurnstile(form);throw error; }
}

export async function turnstileToken(form,action) {
  await mountTurnstile(form,action);
  const entry=forms.get(form);
  if(!entry||entry.cancelled||form.isConnected===false) throw new Error('Форма закрыта. Откройте её заново.');
  if(!entry.enabled)return undefined;
  if(typeof entry.token!=='string'||!entry.token.length)throw new Error('Пройдите проверку защиты формы и повторите отправку.');
  return entry.token;
}

export function resetTurnstile(form) {
  const entry=forms.get(form);
  if(!entry)return;
  entry.token=null;
  if(entry.widgetId!==null)globalThis.turnstile?.reset(entry.widgetId);
}
export function clearTurnstile(form) {
  const entry=forms.get(form);
  if(!entry)return;
  entry.cancelled=true;entry.token=null;
  if(entry.widgetId!==null)globalThis.turnstile?.remove(entry.widgetId);
  entry.container?.remove();forms.delete(form);
}
export function clearAllTurnstile() { for(const form of forms.keys())clearTurnstile(form); }
