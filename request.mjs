import { endpoint, requestBody, requestHeaders, protocol, createSSEParser } from './core.mjs';

// This module knows nothing about tabs, DOM, timers for automatic analysis, or UI.
export async function sendRequest(settings, image, { signal, onDelta, onThinking = () => {}, onThinkingDelta = () => {}, onConnected = () => {} }) {
  const started = performance.now();
  let text = '', firstAnswerMs = null, finished = false, finishReason = null, thinkingReported = false;
  const response = await fetch(endpoint(settings.url), {
    method:'POST', headers:requestHeaders(settings),
    body:JSON.stringify(requestBody(settings,image)), signal
  });
  if (!response.ok) {
    const labels={400:'请求不被支持，请检查模型和图片输入。',401:'API Key 无效或已过期。',402:'API 余额不足。',403:'API 拒绝访问。',404:'API URL 或模型名称不存在。',429:'请求频率或额度受限。'};
    throw new Error(labels[response.status] || `API 返回 HTTP ${response.status}。`);
  }
  onConnected();
  const anthropic=protocol(settings)==='anthropic';
  function thinking(){if(!thinkingReported){thinkingReported=true;onThinking();}}
  function appendThinking(part){if(typeof part==='string'&&part){thinking();onThinkingDelta(part);}}
  function append(part) {
    if (!part) return;
    firstAnswerMs ??= performance.now()-started;
    text+=part; onDelta(part);
  }
  if ((response.headers.get('content-type')||'').includes('application/json')) {
    const value=await response.json();
    if (value.error) throw new Error('API 返回错误，请检查配置。');
    if(anthropic){
      for(const block of value.content||[]){if(block.type==='thinking'){thinking();appendThinking(block.thinking);}if(block.type==='text')append(block.text);}
      finishReason=value.stop_reason;
    }else{appendThinking(value.choices?.[0]?.message?.reasoning_content);append(value.choices?.[0]?.message?.content);finishReason=value.choices?.[0]?.finish_reason;}
    finished=true;
  } else {
    if (!response.body) throw new Error('API 未返回响应流。');
    const reader=response.body.getReader(), decoder=new TextDecoder();
    const parser=createSSEParser(event=>{
      if(anthropic){
        if(event.type==='content_block_start'){
          if(event.content_block?.type==='thinking'){thinking();appendThinking(event.content_block.thinking);}
          if(event.content_block?.type==='text')append(event.content_block.text);
        }
        if(event.type==='content_block_delta'){
          if(event.delta?.type==='thinking_delta')appendThinking(event.delta.thinking);
          if(event.delta?.type==='text_delta')append(event.delta.text);
        }
        if(event.type==='message_delta')finishReason=event.delta?.stop_reason||finishReason;
        if(event.type==='message_stop')finished=true;
        return;
      }
      if (event.done) finished=true;
      const choice=event.choices?.[0];
      appendThinking(choice?.delta?.reasoning_content);
      if (choice?.finish_reason) { finished=true; finishReason=choice.finish_reason; }
      append(choice?.delta?.content);
    });
    try {
      while (true) { const {done,value}=await reader.read(); if(done)break; parser.push(decoder.decode(value,{stream:true})); }
      parser.push(decoder.decode()); parser.finish();
    } finally { await reader.cancel().catch(()=>{}); }
  }
  if (!text) throw new Error('模型没有返回答案，请检查图片输入支持。');
  if (!finished || ['length','max_tokens'].includes(finishReason)) throw new Error('答案可能不完整，请重新分析。');
  return {text,firstAnswerMs,totalMs:performance.now()-started};
}
