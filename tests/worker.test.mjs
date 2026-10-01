import test from 'node:test';
import assert from 'node:assert/strict';

test('MiMo 配置保留、连接/Thinking/输出阶段都可被新请求替换、本地历史保存、关闭停止',async()=>{
  const local={config:{url:'https://api.xiaomimimo.com/v1',model:'mimo-v2.6-pro',key:'fixture-secret'}},session={},events=[];
  let handler,fetches=0,hold=false,aborted=false,onUpdated,onActivated;
  const storage=data=>({get:async key=>({[key]:data[key]}),set:async value=>Object.assign(data,value),remove:async key=>delete data[key]});
  globalThis.chrome={
    storage:{local:storage(local),session:storage(session)},permissions:{contains:async()=>true},scripting:{executeScript:async()=>[]},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},offscreen:{hasDocument:async()=>true},
    tabs:{get:async id=>({id,windowId:1,url:'https://example.com/exercise',title:'测试题'}),query:async()=>[{id:7}],captureVisibleTab:async()=>'data:image/png;base64,AAAA',
      sendMessage:async(id,event)=>{events.push(event);return event.type==='geometry'?{viewport:{width:1000,height:700},rect:null}:{ok:true};},
      onUpdated:{addListener(fn){onUpdated=fn;}},onRemoved:{addListener(){}},onActivated:{addListener(fn){onActivated=fn;}},create:async()=>{}},
    runtime:{onMessage:{addListener(value){handler=value;}},sendMessage:async value=>({ok:true,image:value.image}),getURL:path=>'chrome-extension://fixture/'+path}
  };
  globalThis.fetch=async(url,options)=>{
    fetches++;assert.equal(url,'https://api.xiaomimimo.com/v1/chat/completions');
    const body=JSON.parse(options.body);assert.equal(body.model,'mimo-v2.6-pro');assert.equal(body.thinking.type,'enabled');assert.equal(body.reasoning_effort,undefined);assert.equal(body.max_completion_tokens,8192);
    if(hold==='connecting')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));}));
    if(hold)return new Response(new ReadableStream({start(controller){
      const delta=hold==='thinking'?{reasoning_content:'旧思考'}:{content:'部分旧答案'};
      controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta}]})+'\n\n'));
      options.signal.addEventListener('abort',()=>{aborted=true;controller.error(new DOMException('Aborted','AbortError'));});
    }}),{headers:{'content-type':'text/event-stream'}});
    return new Response('data: {"choices":[{"delta":{"reasoning_content":"internal-reasoning"}}]}\n\ndata: {"choices":[{"delta":{"content":"答案 A"}}]}\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  };
  await import('../worker.mjs');
  const message=(type,content=false,extra={})=>new Promise(resolve=>handler({target:'background',type,...extra},content?{tab:{id:7},url:'https://example.com/exercise'}:{url:'chrome-extension://fixture/popup.html'},resolve));
  const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('worker timeout');};
  assert.equal((await message('start',false,{tabId:7})).ok,true);
  await message('analyze',true);await wait(()=>local.analysisHistory?.length===1);
  assert.equal(local.analysisHistory[0].answer,'答案 A');assert.equal(local.analysisHistory[0].model,'mimo-v2.6-pro');
  assert.ok(!JSON.stringify(local.analysisHistory).includes('fixture-secret'));
  assert.ok(!JSON.stringify(local.analysisHistory).includes('internal-reasoning'));
  assert.ok(events.some(event=>event.type==='status'&&event.text.includes('正在思考')));
  assert.ok(events.some(event=>event.type==='thinking-delta'&&event.text==='internal-reasoning'));
  assert.deepEqual(local.config,{url:'https://api.xiaomimimo.com/v1',model:'mimo-v2.6-pro',key:'fixture-secret'});
  hold=true;await message('analyze',true);await wait(()=>fetches===2);await wait(()=>events.some(event=>event.type==='delta'&&event.text==='部分旧答案'));
  hold=false;await message('analyze',true);await wait(()=>fetches===3);await wait(()=>local.analysisHistory?.length===3);
  assert.equal(aborted,true);assert.ok(local.analysisHistory.some(entry=>entry.status==='cancelled'));
  const result=await new Promise(resolve=>handler({target:'background',type:'history-list'},{tab:{id:9},url:'chrome-extension://fixture/history.html'},resolve));
  assert.equal(result.entries.length,3);
  for(const stage of ['connecting','thinking']){
    aborted=false;hold=stage;const previous=fetches;
    await message('analyze',true);await wait(()=>fetches===previous+1);
    if(stage==='thinking')await wait(()=>events.some(event=>event.type==='thinking-delta'&&event.text==='旧思考'));
    hold=false;await message('analyze',true);await wait(()=>fetches===previous+2);await wait(()=>aborted);
    await wait(()=>local.analysisHistory.length===(stage==='connecting'?4:5));
  }
  assert.ok(!JSON.stringify(local.analysisHistory).includes('旧思考'));
  let before=events.filter(event=>event.type==='change').length;
  await onActivated({tabId:7});assert.equal(events.filter(event=>event.type==='change').length,before);
  await onUpdated(7,{url:'https://example.com/exercise/next'});assert.equal(events.filter(event=>event.type==='change').length,before+1);
  await onUpdated(7,{status:'loading',url:'https://another.example/exercise'});
  assert.equal(session.running.origin,'https://another.example');assert.equal(session.running.navigating,true);
  await onUpdated(7,{status:'complete'});assert.equal(session.running.navigating,false);
  assert.ok(events.some(event=>event.type==='start'&&event.delayed===true));
  await message('stop');await message('analyze',true);assert.equal(fetches,7);
});
