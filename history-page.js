let entries=[];
const container=document.getElementById('entries'),status=document.getElementById('status');
async function message(type){const result=await chrome.runtime.sendMessage({target:'background',type});if(!result?.ok)throw new Error(result?.error||'读取失败');return result;}
function draw(){
  container.replaceChildren();
  for(const entry of entries){
    const article=document.createElement('article'),title=document.createElement('h2'),meta=document.createElement('div'),answer=document.createElement('pre');
    title.textContent=entry.title||'页面分析';meta.className='meta';
    const states={completed:'完成',cancelled:'已取消（部分答案）',error:'失败'};
    meta.textContent=`${new Date(entry.time).toLocaleString('zh-CN')} · ${entry.model} · ${states[entry.status]||entry.status}${entry.localMs!=null?' · 本地 '+Math.round(entry.localMs)+'ms':''}${entry.firstAnswerMs!=null?' · 首字 '+(entry.firstAnswerMs/1000).toFixed(2)+'s':''}\n${entry.url}`;
    answer.textContent=entry.answer||entry.error||'无答案';article.append(title,meta,answer);container.append(article);
  }
  status.textContent=entries.length?`共 ${entries.length} 条记录`:'还没有分析历史。';
}
async function load(){entries=(await message('history-list')).entries||[];draw();}
document.getElementById('export').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(entries,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='page-vision-history.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
document.getElementById('clear').onclick=async()=>{
  if(!confirm('清空本机分析历史？此操作无法撤销。'))return;
  try{await message('history-clear');await load();}catch(error){status.textContent=error.message;}
};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.analysisHistory)load().catch(error=>{status.textContent=error.message;});});
load().catch(error=>{status.textContent=error.message;});
