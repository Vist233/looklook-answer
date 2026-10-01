(() => {
  const INSTANCE = '__pageVisionObserverV1';
  if (globalThis[INSTANCE]) return;
  globalThis[INSTANCE] = true;
  const isTop = window === window.top;
  let enabled = false, timer, host, shadow, answer, status, badge, thinkingBox, thinkingText, currentRequest = '';
  let heartbeat, responseText = '', reasoningText = '', collapsed = false;
  const send = data => chrome.runtime.sendMessage({ target: 'background', ...data }).catch(() => null);
  function ownNode(node) { return Boolean(host && (node === host || (node?.nodeType && host.contains(node)))); }
  function changed() {
    if (!enabled || document.visibilityState !== 'visible') return;
    if (!isTop) { send({ type: 'frame-change' }); return; }
    scheduleAutoAnalysis();
  }
  function scheduleAutoAnalysis() {
    if (!enabled) return;
    clearTimeout(timer);
    timer = setTimeout(analyzeNow, 1600);
  }
  function analyzeNow() {
    clearTimeout(timer); timer = undefined;
    if (enabled && document.visibilityState === 'visible') send({ type: 'analyze' });
  }
  function setStatus(text, state = 'idle') {
    if (status) status.textContent = text;
    if (badge) badge.dataset.state = state;
  }
  function buildPanel() {
    if (host?.isConnected) return;
    host = document.createElement('div'); host.id = 'page-vision-panel';
    Object.assign(host.style, { position: 'fixed', top: '96px', right: '20px', width: '350px', height: '390px', zIndex: '2147483647', colorScheme: 'light', minWidth: '240px', minHeight: '160px', maxWidth: '90vw', maxHeight: '85vh', resize: 'both', overflow: 'hidden', borderRadius: '14px', boxShadow: '0 8px 36px rgba(10,35,30,.2)' });
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}.dot[data-state=thinking]{background:#b88930}.dot[data-state=output]{background:#18816c}.panel{height:100%;display:flex;flex-direction:column;background:#fbfdfc;color:#203d36;border:1px solid #bcd4ca;border-radius:14px;font:13px/1.65 system-ui,"Microsoft YaHei",sans-serif;overflow:hidden}
      header{display:flex;align-items:center;gap:8px;background:#eef5f1;padding:10px 12px;cursor:grab;user-select:none;flex:none}header:active{cursor:grabbing}.dot{width:7px;height:7px;background:#7b9188;border-radius:50%}.dot[data-state=stream]{background:#18816c}.dot[data-state=wait]{background:#d3a339}.dot[data-state=error]{background:#c74b46}strong{font-size:13px;flex:1}button{font:inherit;cursor:pointer;color:inherit;background:white;border:1px solid #cdded6;border-radius:6px;padding:3px 8px}button:hover{background:#dcebe3}.icon{border:0;background:none;padding:0 5px;font-size:17px}.status{padding:8px 12px;color:#6c8278;font-size:11px;border-bottom:1px solid #e7eee9;flex:none}.answer{margin:0;padding:12px 14px;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;flex:1;font:13px/1.8 system-ui,"Microsoft YaHei",sans-serif;color:#1e342d;user-select:text}footer{display:flex;gap:8px;padding:8px 12px;border-top:1px solid #e7eee9;flex:none;font-size:11px}footer span{flex:1;color:#84948c;align-self:center}.hidden{display:none}
      .thinking{flex:none;max-height:40%;overflow:auto;border-bottom:1px solid #e7eee9;background:#f5f7f4}.thinking summary{padding:7px 12px;cursor:pointer;color:#827047;font-size:12px}.thinking pre{margin:0;padding:0 12px 10px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 system-ui,"Microsoft YaHei",sans-serif;color:#6c756b}
      </style><div class="panel"><header><span class="dot"></span><strong>看题 · 图片分析</strong><button class="icon" id="collapse" title="收起">−</button><button class="icon" id="close" title="关闭并停止">×</button></header><div class="status">准备分析…</div><details class="thinking hidden" open><summary>Thinking · 思考内容</summary><pre></pre></details><pre class="answer">自动变化等待 1.6 秒；重新分析立即执行。\n\n请把此框拖到不遮挡题目的位置。</pre><footer><button id="refresh">重新分析</button><button id="copy">复制</button><button id="history">历史</button><span>自动等待 1.6 秒</span></footer></div>`;
    answer = shadow.querySelector('.answer'); status = shadow.querySelector('.status'); badge = shadow.querySelector('.dot');
    thinkingBox = shadow.querySelector('.thinking'); thinkingText = shadow.querySelector('.thinking pre');
    const header = shadow.querySelector('header');
    let drag;
    header.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = host.getBoundingClientRect(); drag = { x:event.clientX, y:event.clientY, left:rect.left, top:rect.top };
      header.setPointerCapture(event.pointerId);
    });
    header.addEventListener('pointermove', event => {
      if (!drag) return;
      host.style.right = 'auto';
      host.style.left = Math.max(0, Math.min(innerWidth-host.offsetWidth, drag.left+event.clientX-drag.x))+'px';
      host.style.top = Math.max(0, Math.min(innerHeight-45, drag.top+event.clientY-drag.y))+'px';
    });
    header.addEventListener('pointerup', () => { drag = null; });
    header.addEventListener('lostpointercapture', () => { drag = null; });
    shadow.getElementById('close').onclick = () => send({ type: 'stop' });
    shadow.getElementById('refresh').onclick = analyzeNow;
    shadow.getElementById('history').onclick = () => send({type:'open-history'});
    shadow.getElementById('copy').onclick = async () => {
      try { await navigator.clipboard.writeText(responseText || answer.textContent); setStatus('已复制答案'); }
      catch { setStatus('复制失败，可手动选择文字复制。', 'error'); }
    };
    shadow.getElementById('collapse').onclick = () => {
      collapsed = !collapsed;
      host.style.height = collapsed ? '46px' : '390px'; host.style.minHeight = collapsed ? '46px' : '160px';
      host.style.resize = collapsed ? 'none' : 'both';
      for (const selector of ['.status','.answer','footer']) shadow.querySelector(selector).classList.toggle('hidden', collapsed);
      thinkingBox.classList.toggle('hidden', collapsed || !reasoningText);
      shadow.getElementById('collapse').textContent = collapsed ? '+' : '−';
    };
    (document.body || document.documentElement).append(host);
  }
  function start(delayed = false) {
    if (enabled) return;
    enabled = true;
    if (isTop) {
      buildPanel();
      heartbeat = setInterval(() => send({ type:'heartbeat' }), 20000);
      if(delayed)scheduleAutoAnalysis();else analyzeNow();
    }
  }
  function stop() {
    enabled = false; clearTimeout(timer); clearInterval(heartbeat);
    host?.remove(); host = undefined;
  }
  // Only actual clicks outside the extension count; DOM, movement and media are not observed.
  for (const name of ['click','auxclick']) {
    window.addEventListener(name, event => { if (event.isTrusted && !ownNode(event.target)) changed(); }, true);
  }
  function render(message) {
    if (!isTop || !enabled) return;
    if (message.type === 'begin') {
      currentRequest=message.id;responseText='';reasoningText='';answer.textContent='';thinkingText.textContent='';thinkingBox.open=true;thinkingBox.classList.toggle('hidden',true);setStatus(`${message.model || ''} · 准备分析…`,'stream');return;
    }
    if (message.id && message.id !== currentRequest) return;
    if (message.type === 'thinking-delta') {
      const nearBottom=thinkingBox.scrollHeight-thinkingBox.scrollTop-thinkingBox.clientHeight<55;
      reasoningText+=message.text;thinkingText.textContent=reasoningText;
      thinkingBox.classList.toggle('hidden',collapsed);
      if(nearBottom)thinkingBox.scrollTop=thinkingBox.scrollHeight;
    } else if (message.type === 'delta') {
      const nearBottom=answer.scrollHeight-answer.scrollTop-answer.clientHeight<55;
      responseText+=message.text;answer.textContent=responseText;
      if(nearBottom)answer.scrollTop=answer.scrollHeight;
    } else if(message.type==='status')setStatus(message.text,message.state);
    else if(message.type==='error'){setStatus(message.text,'error');if(!responseText)answer.textContent=message.text;}
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.target !== 'content') return;
    switch (message.type) {
      case 'start': start(message.delayed); reply({ ok:true }); break;
      case 'stop': stop(); reply({ ok:true }); break;
      case 'change': if (isTop) scheduleAutoAnalysis(); break;
      case 'manual': if (isTop) analyzeNow(); break;
      case 'geometry': {
        if (!isTop) break;
        const rect = host?.getBoundingClientRect();
        reply({ viewport:{width:innerWidth,height:innerHeight}, rect:rect ? {x:rect.x,y:rect.y,width:rect.width,height:rect.height} : null });
        break;
      }
      case 'begin':
      case 'delta':
      case 'thinking-delta':
      case 'status':
      case 'error':
        render(message); break;
    }
  });
  send({ type:'ready' }).then(result => { if (result?.enabled) start(result.delayed); });
})();
