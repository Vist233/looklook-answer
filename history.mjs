const KEY='analysisHistory', MAX_ENTRIES=100, MAX_BYTES=4*1024*1024;
let queue=Promise.resolve();
export async function listHistory() { await queue; return (await chrome.storage.local.get(KEY))[KEY] || []; }
export function saveHistory(value) {
  // Explicit allowlist: no API keys, screenshots or raw request bodies are persisted.
  const entry={id:value.id,time:value.time,title:value.title||'',url:value.url||'',model:value.model||'',status:value.status,answer:(value.answer||'').slice(0,40000),error:value.error||'',firstAnswerMs:value.firstAnswerMs??null,totalMs:value.totalMs??null,localMs:value.localMs??null};
  const work=queue.then(async()=>{
    const saved=(await chrome.storage.local.get(KEY))[KEY]||[];
    const entries=[entry,...saved].slice(0,MAX_ENTRIES);
    while(entries.length>1&&new TextEncoder().encode(JSON.stringify(entries)).length>MAX_BYTES)entries.pop();
    await chrome.storage.local.set({[KEY]:entries});
  });
  queue=work.catch(()=>{});return work;
}
export function clearHistory() {
  const work=queue.then(()=>chrome.storage.local.remove(KEY));
  queue=work.catch(()=>{});return work;
}
