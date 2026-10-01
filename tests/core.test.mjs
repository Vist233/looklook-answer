import test from 'node:test';
import assert from 'node:assert/strict';
import { endpoint, permissionPattern, requestBody, createSSEParser, SYSTEM_PROMPT, IMAGE_PROMPT } from '../core.mjs';

test('API 地址支持根路径、v1 路径以及完整 endpoint', () => {
  assert.equal(endpoint('https://api.deepseek.com/'), 'https://api.deepseek.com/chat/completions');
  assert.equal(endpoint('https://example.com/v1/'), 'https://example.com/v1/chat/completions');
  assert.equal(endpoint('http://localhost:8080/v1/chat/completions'), 'http://localhost:8080/v1/chat/completions');
  assert.equal(permissionPattern('https://example.com/v1'), 'https://example.com/*');
  for (const value of ['file:///tmp/a','https://user:password@example.com','https://example.com/?key=abc']) assert.throws(() => endpoint(value));
});

test('流式解析支持逐字节分块、CRLF、中文及 DONE', () => {
  const events=[]; const parser=createSSEParser(event => events.push(event));
  const input=': keepalive\r\n\r\ndata: {"choices":[{"delta":{"content":"答案：A"}}]}\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
  for (const character of input) parser.push(character);
  parser.finish();
  assert.equal(events[0].choices[0].delta.content,'答案：A');
  assert.equal(events[1].choices[0].finish_reason,'stop');
  assert.deepEqual(events[2],{done:true});
});

test('流末尾无空行仍解析，API 错误不会静默丢失', () => {
  const events=[]; const parser=createSSEParser(event => events.push(event));
  parser.push('data: {"choices":[]}'); parser.finish(); assert.equal(events.length,1);
  assert.throws(() => createSSEParser(()=>{}).push('data: {"error":{"message":"invalid model"}}\n\n'), /invalid model/);
});

test('默认始终包含图片，密钥不会混入请求体', () => {
  const config={url:'https://api.deepseek.com',model:'deepseek-flash',key:'test-secret'};
  const body=requestBody(config,'data:image/png;base64,AAAA');
  assert.equal(body.stream,true);
  assert.equal(body.messages[1].content[1].image_url.detail,'high');
  assert.equal(body.thinking.type,'enabled');
  assert.equal(body.reasoning_effort,'low');
  assert.ok(!JSON.stringify(body).includes(config.key));
  assert.ok(!requestBody({...config,url:'https://example.com/v1'},'image').thinking);
  const mimo=requestBody({...config,url:'https://api.xiaomimimo.com/v1',model:'mimo-v2.6-pro'},'image');
  assert.equal(mimo.thinking.type,'enabled');
  assert.equal(mimo.reasoning_effort,undefined);
  assert.equal(mimo.max_completion_tokens,8192);
  assert.equal(mimo.max_tokens,undefined);
  assert.equal(mimo.model,'mimo-v2.6-pro');
});

test('双协议统一使用仅解答当前题目的提示词，保留四类格式和歧义处理',()=>{
  for(const url of ['https://api.xiaomimimo.com/v1','https://api.xiaomimimo.com/anthropic']){
    const body=requestBody({url,model:'mimo-v2.6-pro',key:'mock'},'data:image/png;base64,AAAA');
    const anthropic=url.endsWith('/anthropic');
    assert.equal(anthropic?body.system:body.messages[0].content,SYSTEM_PROMPT);
    assert.equal((anthropic?body.messages[0]:body.messages[1]).content[0].text,IMAGE_PROMPT);
  }
  assert.match(SYSTEM_PROMPT,/仅解答截图中当前正在作答的一道题/);
  assert.match(SYSTEM_PROMPT,/无法确定当前题目/);
  assert.match(SYSTEM_PROMPT,/不存在题目/);
  assert.match(SYSTEM_PROMPT,/尽可能提早回答/);
  for(const type of ['判断题','单选题','多选题','简答题'])assert.ok(SYSTEM_PROMPT.includes(type));
});
