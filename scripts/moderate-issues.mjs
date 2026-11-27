import { readFile } from 'node:fs/promises';
import { createGitHubAPI, moderateIssue, GitHubRequestError } from './moderation-core.mjs';

try{
  if(process.env.GITHUB_EVENT_NAME!=='issues')throw new Error('Unexpected event.');
  const path=process.env.GITHUB_EVENT_PATH,repository=process.env.GITHUB_REPOSITORY;
  if(!path||!repository)throw new Error('Missing workflow context.');
  const input=await readFile(path,'utf8');
  if(Buffer.byteLength(input)>1048576)throw new Error('Event is too large.');
  const event=JSON.parse(input);
  const api=createGitHubAPI(repository,process.env.GITHUB_TOKEN);
  const result=await moderateIssue({event,repository,api});
  console.log(`Moderation completed: ${result.action}.`);
}catch(error){
  // Do not print event content, request bodies, credentials or raw provider errors.
  console.error(error instanceof GitHubRequestError?error.message:'Moderation failed; no new approval was granted.');
  process.exitCode=1;
}
