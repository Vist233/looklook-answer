import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('仅可信网页点击/URL 信号触发；1.6 秒重置；鼠标滚动排除；Thinking 独立显示', async () => {
  let now=0, nextId=0, listener, host;
  const timers=new Map(), messages=[];
  const element=()=>({style:{},dataset:{},textContent:'',getAttribute(){return 'new';},classList:{toggle(){}},addEventListener(){},contains(node){return node===this;},getBoundingClientRect(){return {x:0,y:0,width:350,height:390};}});
  const shadowElements=new Map();
  const getElement=selector=>{if(!shadowElements.has(selector))shadowElements.set(selector,element());return shadowElements.get(selector);};
  const doc={visibilityState:'visible',documentElement:element(),addEventListener(){},
    createElement(){host=element();host.attachShadow=()=>({set innerHTML(value){},querySelector:getElement,getElementById:getElement});host.remove=()=>{host.isConnected=false;};return host;},
    body:{append(node){node.isConnected=true;}}
  };
  const schedule=(fn,delay,repeat=false)=>{const id=++nextId;timers.set(id,{fn,time:now+delay,delay,repeat});return id;};
  const advance=milliseconds=>{
    const end=now+milliseconds;
    while(true){let chosen;for(const [id,timer]of timers){if(timer.time<=end&&(!chosen||timer.time<chosen[1].time))chosen=[id,timer];}if(!chosen)break;
      const[id,timer]=chosen;now=timer.time;timers.delete(id);if(timer.repeat)timers.set(id,{...timer,time:now+timer.delay});timer.fn();
    }now=end;
  };
  const events=new Map();
  const window={addEventListener(name,callback){events.set(name,callback);}};window.top=window;
  const context=vm.createContext({window,document:doc,innerWidth:1000,innerHeight:700,navigator:{clipboard:{writeText:async()=>{}}},
    setTimeout:(fn,delay)=>schedule(fn,delay),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,delay)=>schedule(fn,delay,true),clearInterval:id=>timers.delete(id),
    Date:{now:()=>now},
    chrome:{runtime:{sendMessage:message=>{messages.push({...message,at:now});return Promise.resolve({enabled:false});},onMessage:{addListener(value){listener=value;}}}}
  });
  vm.runInContext(await readFile(new URL('../content.js',import.meta.url),'utf8'),context);
  await Promise.resolve();
  const invoke=(type,extra={})=>listener({target:'content',type,...extra},{},()=>{});
  const captures=()=>messages.filter(message=>message.type==='analyze');
  const change=()=>events.get('click')({isTrusted:true,target:doc.documentElement});
  invoke('start');
  assert.equal(captures().length,1);advance(1600);assert.equal(captures().length,1);
  for(const name of ['pointermove','pointerover','pointerout','scroll','input','change','resize','load','transitionend','animationend'])assert.equal(events.has(name),false);
  events.get('click')({isTrusted:false,target:doc.documentElement});
  advance(1700);assert.equal(captures().length,1);
  change();advance(600);change();advance(1599);assert.equal(captures().length,1);advance(1);assert.equal(captures().length,2);
  invoke('change');advance(1600);assert.equal(captures().length,3); // background URL change
  invoke('begin',{id:'new'});invoke('thinking-delta',{id:'old',text:'stale'});
  invoke('thinking-delta',{id:'new',text:'思考片段'});invoke('delta',{id:'new',text:'答案：A'});
  assert.equal(getElement('.thinking pre').textContent,'思考片段');assert.equal(getElement('.answer').textContent,'答案：A');
  invoke('begin',{id:'next'});assert.equal(getElement('.thinking pre').textContent,'');
  events.get('click')({isTrusted:true,target:host});advance(3000);assert.equal(captures().length,3);
  advance(60000);assert.equal(captures().length,3); // heartbeat is not a screenshot/model poll
  change();advance(600);invoke('manual');assert.equal(captures().length,4);
  advance(1600);assert.equal(captures().length,4); // manual removed pending automatic task
  change();advance(600);invoke('stop');advance(1600);assert.equal(captures().length,4);
  invoke('start',{delayed:true});advance(1599);assert.equal(captures().length,4);advance(1);assert.equal(captures().length,5);
  events.get('auxclick')({isTrusted:true,target:doc.documentElement});advance(1600);assert.equal(captures().length,6);
  invoke('stop');
});
