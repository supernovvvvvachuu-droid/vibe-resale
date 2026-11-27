// The same content fingerprint is used by GitHub's moderation workflow and
// the public catalogue. No key or authorization token belongs in this module.
export const APPROVED_LABEL='approved';
export const REVIEW_LABEL_PREFIX='review:';
const DEFAULT_REPOSITORY='supernovvvvvachuu-droid/vibe-resale';
const REPOSITORY=/^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i;

export function approvalPayload(issue,repository=DEFAULT_REPOSITORY) {
  if(typeof repository!=='string'||!REPOSITORY.test(repository))throw new TypeError('Invalid repository.');
  if(!issue||typeof issue!=='object'||Array.isArray(issue)||!Number.isSafeInteger(issue.number)||issue.number<1||typeof issue.title!=='string'||issue.title.length>300)throw new TypeError('Invalid issue.');
  const body=issue.body??'';
  if(typeof body!=='string'||body.length>65536)throw new TypeError('Invalid issue body.');
  return JSON.stringify({v:1,repository:repository.toLowerCase(),number:issue.number,title:issue.title,body});
}

export async function approvalLabel(issue,repository=DEFAULT_REPOSITORY) {
  const payload=approvalPayload(issue,repository);
  const bytes=new TextEncoder().encode(payload);
  const digest=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes));
  const encoded=btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  return REVIEW_LABEL_PREFIX+encoded;
}

export async function hasCurrentApproval(issue,repository=DEFAULT_REPOSITORY) {
  try {
    if(!Array.isArray(issue?.labels)||issue.labels.length>100)return false;
    const names=issue.labels.map(label=>typeof label==='string'?label:label?.name);
    if(!names.includes(APPROVED_LABEL))return false;
    const proofs=names.filter(name=>typeof name==='string'&&name.startsWith(REVIEW_LABEL_PREFIX));
    // Stale or conflicting receipts never become an implicit new approval.
    if(proofs.length!==1||!/^review:[A-Za-z0-9_-]{43}$/.test(proofs[0]))return false;
    return proofs[0]===await approvalLabel(issue,repository);
  } catch {
    // Missing crypto support, malformed API records and invalid fingerprints
    // hide a listing rather than bypassing moderation.
    return false;
  }
}
