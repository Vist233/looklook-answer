import test from 'node:test';
import assert from 'node:assert/strict';
import { saveHistory,listHistory,clearHistory } from '../history.mjs';
test('历史并发写入不丢失，只保存白名单字段，保留最近 100 条',async()=>{
  const data={};globalThis.chrome={storage:{local:{get:async key=>({[key]:data[key]}),set:async value=>Object.assign(data,value),remove:async key=>delete data[key]}}};
  await Promise.all(Array.from({length:110},(_,index)=>saveHistory({id:String(index),time:'2026-10-01',model:'mimo-v2.6-pro',answer:'答案',status:'completed',key:'secret',image:'screenshot'})));
  const entries=await listHistory();assert.equal(entries.length,100);assert.equal(entries[0].id,'109');assert.equal(entries.at(-1).id,'10');
  assert.ok(!JSON.stringify(entries).includes('secret'));assert.ok(!JSON.stringify(entries).includes('screenshot'));
  await clearHistory();assert.deepEqual(await listHistory(),[]);
});
