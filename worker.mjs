import { DEFAULTS, endpoint, permissionPattern } from './core.mjs';
import { sendRequest } from './request.mjs';
import { saveHistory, listHistory, clearHistory } from './history.mjs';

let revision=0, controller, offscreenCreating;
const state=async()=>(await chrome.storage.session.get('running')).running||null;
const config=async()=>({...DEFAULTS,...(await chrome.storage.local.get('config')).config});
async function render(tabId,event) {
  try{return await chrome.tabs.sendMessage(tabId,{target:'content',...event},{frameId:0});}catch{return null;}
}
function cancelCurrent(){revision++;controller?.abort();controller=undefined;}
async function stop(){
  const running=await state();await chrome.storage.session.remove('running');cancelCurrent();
  if(running){try{await chrome.tabs.sendMessage(running.tabId,{target:'content',type:'stop'});}catch{}}
  await chrome.action.setBadgeText({text:''});
}
async function inject(tabId,delayed=false){
  try{await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['content.js']});}
  catch{await chrome.scripting.executeScript({target:{tabId},files:['content.js']});}
  await chrome.tabs.sendMessage(tabId,{target:'content',type:'start',delayed});
}
async function start(tabId){
  const settings=await config();
  if(!settings.key||!settings.model)throw new Error('请先保存 API 配置。');
  if(!await chrome.permissions.contains({origins:[permissionPattern(settings.url)]}))throw new Error('请保存配置并允许访问 API。');
  const tab=await chrome.tabs.get(tabId);
  if(!/^https?:\/\//.test(tab.url||''))throw new Error('请在普通 HTTP(S) 网页开启。');
  await stop();await chrome.storage.session.set({running:{tabId,windowId:tab.windowId,origin:new URL(tab.url).origin}});
  try{await inject(tabId);}catch{await stop();throw new Error('无法开启，请刷新页面后重试。');}
  await chrome.action.setBadgeBackgroundColor({color:'#136a60'});await chrome.action.setBadgeText({text:'ON'});
}
async function ensureOffscreen(){
  if(await chrome.offscreen.hasDocument())return;
  offscreenCreating??=chrome.offscreen.createDocument({url:'offscreen.html',reasons:['BLOBS'],justification:'遮挡截图中的扩展输出框，避免旧答案进入模型。'}).finally(()=>{offscreenCreating=undefined;});
  await offscreenCreating;
}
// Capture only: no model calls, rendering or automatic-analysis timer.
async function capturePage(running,valid){
  const [active]=await chrome.tabs.query({active:true,windowId:running.windowId});
  if(active?.id!==running.tabId||!valid())return null;
  const geometry=await render(running.tabId,{type:'geometry'});if(!geometry||!valid())return null;
  const image=await chrome.tabs.captureVisibleTab(running.windowId,{format:'png'});
  const [after]=await chrome.tabs.query({active:true,windowId:running.windowId});
  if(after?.id!==running.tabId||!valid())return null;
  await ensureOffscreen();
  const prepared=await chrome.runtime.sendMessage({target:'offscreen',type:'prepare-image',image,...geometry});
  if(!prepared?.ok)throw new Error('截图处理失败。');
  return valid()?prepared.image:null;
}
// The single immediate entry point, shared by manual requests and the automatic timer.
async function analyzeNow(tabId){
  const localStarted=performance.now();
  cancelCurrent();const token=revision,id=`${Date.now()}-${token}`;
  const localController=new AbortController();controller=localController;
  const valid=()=>revision===token&&!localController.signal.aborted;
  let text='',record,firstAnswerMs=null,totalMs=null,localMs=null,timeout;
  try{
    const running=await state();if(!running||running.tabId!==tabId||!valid())return;
    const settings=await config(),tab=await chrome.tabs.get(tabId);
    record={id,time:new Date().toISOString(),title:tab.title,url:tab.url,model:settings.model,status:'cancelled'};
    await render(tabId,{type:'begin',id,model:settings.model});if(!valid())return;
    await render(tabId,{type:'status',id,text:'正在截图…',state:'stream'});
    const image=await capturePage(running,valid);if(!image)return;
    await render(tabId,{type:'status',id,text:`${settings.model} · 正在连接 API…`,state:'stream'});
    localMs=performance.now()-localStarted;
    timeout=setTimeout(()=>localController.abort('timeout'),120000);
    let answered=false;
    const result=await sendRequest(settings,image,{signal:localController.signal,
      onConnected:()=>{if(valid())void render(tabId,{type:'status',id,text:'已连接 · 等待 Thinking…',state:'stream'});},
      onThinking:()=>{if(valid())void render(tabId,{type:'status',id,text:`Thinking · 正在思考…`,state:'thinking'});},
      onThinkingDelta:part=>{if(valid())void render(tabId,{type:'thinking-delta',id,text:part});},
      onDelta:part=>{
        text+=part;
        if(valid()){
          if(!answered){answered=true;void render(tabId,{type:'status',id,text:'Output · 正在输出答案…',state:'output'});}
          void render(tabId,{type:'delta',id,text:part});
        }
      }
    });
    firstAnswerMs=result.firstAnswerMs;totalMs=result.totalMs;
    if(!valid())return;
    record.status='completed';
    await render(tabId,{type:'status',id,text:`完成 · 本地 ${Math.round(localMs)}ms · 首字 ${(firstAnswerMs/1000).toFixed(2)}s / 全部 ${(totalMs/1000).toFixed(2)}s`,state:'idle'});
  }catch(error){
    if(revision!==token)return;
    const message=localController.signal.reason==='timeout'?'请求超过 120 秒，请重新分析。':error instanceof TypeError?'无法连接 API，请检查地址及网络。':error.message||'分析失败。';
    if(record){record.status='error';record.error=message;}
    await render(tabId,{type:'error',id,text:message});
  }finally{
    clearTimeout(timeout);
    if(record&&(text||record.status==='error')){
      try{await saveHistory({...record,answer:text,firstAnswerMs,totalMs,localMs});}
      catch{if(revision===token)await render(tabId,{type:'status',id,text:'答案已返回，但本地历史保存失败。',state:'error'});}
    }
    if(controller===localController)controller=undefined;
  }
}
async function openHistory(){await chrome.tabs.create({url:chrome.runtime.getURL('history.html')});}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.target!=='background')return;
  (async()=>{
    const running=await state(),fromContent=sender.url?.startsWith('chrome-extension:')?undefined:sender.tab?.id;
    if(fromContent){
      if(message.type==='ready')return{ok:true,enabled:running?.tabId===fromContent,delayed:Boolean(running?.navigating)};
      if(running?.tabId!==fromContent)return{ok:true};
      switch(message.type){
        case 'frame-change':await render(fromContent,{type:'change'});break;
        case 'analyze':void analyzeNow(fromContent);break;
        case 'stop':await stop();break;
        case 'open-history':await openHistory();break;
        case 'heartbeat':break;
        default:return{ok:false,error:'不支持的页面操作。'};
      }return{ok:true};
    }
    switch(message.type){
      case 'state':return{ok:true,state:running};
      case 'save':endpoint(message.config.url);await chrome.storage.local.set({config:message.config});if(running){await render(running.tabId,{type:'manual'});}break;
      case 'start':await start(message.tabId);break;
      case 'stop':await stop();break;
      case 'clear-key':{await stop();const settings=await config();settings.key='';await chrome.storage.local.set({config:settings});break;}
      case 'manual':if(running?.tabId!==message.tabId)throw new Error('请先开启当前标签页的自动分析。');await render(running.tabId,{type:'manual'});break;
      case 'open-history':await openHistory();break;
      case 'history-list':return{ok:true,entries:await listHistory()};
      case 'history-clear':await clearHistory();break;
      default:return{ok:false,error:'未知操作。'};
    }return{ok:true};
  })().then(reply).catch(error=>reply({ok:false,error:error.message||'扩展操作失败。'}));return true;
});
chrome.tabs.onUpdated.addListener(async(tabId,change)=>{
  const running=await state();if(running?.tabId!==tabId)return;
  if(change.status==='loading'){cancelCurrent();running.navigating=true;await chrome.storage.session.set({running});}
  if(change.url){
    if(!/^https?:\/\//.test(change.url)){await stop();return;}
    running.origin=new URL(change.url).origin;
    await chrome.storage.session.set({running});
    if(!running.navigating)await render(tabId,{type:'change'});
  }
  if(change.status==='complete'){
    try{await inject(tabId,true);await render(tabId,{type:'change'});running.navigating=false;await chrome.storage.session.set({running});}
    catch{await stop();}
  }
});
chrome.tabs.onRemoved.addListener(async tabId=>{if((await state())?.tabId===tabId)await stop();});
chrome.tabs.onActivated.addListener(async({tabId})=>{
  const running=await state();if(!running)return;
  if(running.tabId!==tabId)cancelCurrent();
});
