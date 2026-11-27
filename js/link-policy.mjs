// One policy for submission validation and rendering existing/legacy records.
// This validates a URL locally; it deliberately never follows or fetches it.
const HOSTS=new Set(['avito.ru','www.avito.ru','t.me']);
const TELEGRAM_RESERVED=new Set(['login','auth','oauth','proxy','socks','iv','share','addstickers','addemoji','addtheme','setlanguage','addlist','joinchat','c','s','boost','passport','confirmphone','invoice','giftcode','nft','nftrecord','contact','settings','resolve','msg','web','loginwidget']);
const REDIRECT_ROUTES=new Set(['redirect','redirects','redir','away','out','external','go','goto','link','links','url','click','track','tracking','login','auth','oauth','authorize','callback','logout','signout','signin','sso']);
const UNSAFE_CHARACTERS=/[\p{Cc}\p{Cf}\p{White_Space}\\]/u;

export function validatedExternalUrl(value) {
  if(typeof value!=='string'||!value.length||value.length>1000||UNSAFE_CHARACTERS.test(value)) return null;
  const authority=/^https:\/\/([^/?#]+)/i.exec(value);
  // Match the original authority too: URL() otherwise accepts percent-encoded
  // host names, normalizes Unicode dots, and removes an explicit default port.
  if(!authority||!HOSTS.has(authority[1].toLowerCase())||value.includes('?')||value.includes('#')) return null;
  let url;
  try { url=new URL(value); } catch { return null; }
  if(url.protocol!=='https:'||url.hostname!==authority[1].toLowerCase()||url.username||url.password||url.port) return null;
  const path=value.slice(authority[0].length)||'/';
  if(path!==url.pathname||!path.startsWith('/')||path.includes('//')) return null;
  let decoded;
  try { decoded=decodeURIComponent(path); } catch { return null; }
  // Block encoded delimiters/dot segments and nested encoding that could hide
  // a redirect endpoint from the route checks below.
  if(UNSAFE_CHARACTERS.test(decoded)||/%(?:2f|5c|3a|3f|23|25|2e)/i.test(path)) return null;
  const segments=decoded.split('/').filter(Boolean);
  if(segments.some(part=>part==='.'||part==='..'||(url.hostname!=='t.me'&&REDIRECT_ROUTES.has(part.toLowerCase())))) return null;
  if(url.hostname==='avito.ru'||url.hostname==='www.avito.ru') {
    // Only a direct listing address, ending in its positive numeric item ID.
    // Search, login, short/redirect routes and arbitrary query parameters are
    // not listing URLs. A copied tracking URL must be replaced with its clean
    // direct address; the server does not silently follow it to find one.
    if(!/^\/(?:[a-z0-9][a-z0-9_-]*\/){0,7}[a-z0-9][a-z0-9_-]*_[1-9][0-9]{0,19}$/i.test(path)) return null;
  }
  if(url.hostname==='t.me') {
    const direct=/^\/([a-z][a-z0-9_]{4,31})(?:\/([1-9][0-9]{0,19}))?$/i.exec(path);
    const publicPost=/^\/s\/([a-z][a-z0-9_]{4,31})\/([1-9][0-9]{0,19})$/i.exec(path);
    const username=(direct||publicPost)?.[1]?.toLowerCase();
    if(!username||TELEGRAM_RESERVED.has(username)||username.endsWith('bot')) return null;
  }
  return url.href;
}
