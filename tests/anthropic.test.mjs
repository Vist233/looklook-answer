import test from 'node:test';
import assert from 'node:assert/strict';
import { endpoint,protocol,requestBody,requestHeaders } from '../core.mjs';
import { sendRequest } from '../request.mjs';
const config={url:'https://api.xiaomimimo.com/anthropic',model:'mimo-v2.6-pro[1m]',key:'mock-only'};
test('Anthropic 地址、图片格式、认证、模型名及提早回答提示词',()=>{
  assert.equal(endpoint(config.url),'https://api.xiaomimimo.com/anthropic/messages');
  assert.equal(endpoint(config.url+'/messages'),'https://api.xiaomimimo.com/anthropic/messages');
  assert.equal(protocol(config),'anthropic');
  const body=requestBody(config,'data:image/png;base64,AAAA');
  assert.equal(body.model,'mimo-v2.6-pro');assert.equal(body.reasoning_effort,undefined);
  assert.equal(body.messages[0].content[1].source.media_type,'image/png');
  assert.equal(body.messages[0].content[1].source.data,'AAAA');
  assert.equal(body.thinking.type,'enabled');assert.match(body.system,/尽可能提早回答/);
  for(const type of ['判断题','单选题','多选题','简答题'])assert.ok(body.system.includes(type));
  assert.match(body.system,/无法确定/);
  assert.equal(requestHeaders(config)['anthropic-version'],'2023-06-01');
  assert.ok(!JSON.stringify(body).includes(config.key));
});
test('Anthropic 思考与答案阶段分别解析，不丢失 message_stop',async()=>{
  const phases=[],answer=[],thinking=[];
  const events=[
    {type:'message_start',message:{role:'assistant'}},
    {type:'content_block_start',content_block:{type:'thinking',thinking:''}},
    {type:'content_block_delta',delta:{type:'thinking_delta',thinking:'private model reasoning'}},
    {type:'content_block_start',content_block:{type:'text',text:''}},
    {type:'content_block_delta',delta:{type:'text_delta',text:'答案：A'}},
    {type:'message_delta',delta:{stop_reason:'end_turn'}},{type:'message_stop'}
  ];
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.xiaomimimo.com/anthropic/messages');
    assert.equal(options.headers['x-api-key'],'mock-only');
    return new Response(events.map(event=>'event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
  };
  const result=await sendRequest(config,'data:image/png;base64,AAAA',{signal:new AbortController().signal,onConnected:()=>phases.push('connected'),onThinking:()=>phases.push('thinking'),onThinkingDelta:part=>thinking.push(part),onDelta:text=>{phases.push('output');answer.push(text);}});
  assert.deepEqual(phases,['connected','thinking','output']);assert.equal(result.text,'答案：A');assert.equal(answer.join(''),'答案：A');
  assert.equal(thinking.join(''),'private model reasoning');
});

test('OpenAI 思考片段单独流式输出，不混入答案',async()=>{
  const thinking=[],answer=[];
  globalThis.fetch=async()=>new Response([
    {choices:[{delta:{reasoning_content:'先判断'}}]},
    {choices:[{delta:{reasoning_content:'题型'}}]},
    {choices:[{delta:{content:'答案：正确（√）'}}]},
    {choices:[{delta:{},finish_reason:'stop'}]}
  ].map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
  const result=await sendRequest({...config,url:'https://api.xiaomimimo.com/v1'},'data:image/png;base64,AAAA',{
    signal:new AbortController().signal,onThinkingDelta:part=>thinking.push(part),onDelta:part=>answer.push(part)
  });
  assert.equal(thinking.join(''),'先判断题型');assert.equal(result.text,answer.join(''));assert.ok(!result.text.includes('先判断'));
});
