import { requestBody } from '../core.mjs';
import { sendRequest } from '../request.mjs';
import { saveHistory } from '../history.mjs';
import { writeFile } from 'node:fs/promises';

// Hard network block: this fetch never opens a socket. Remote APIs cannot be contacted.
let calls=0;
globalThis.fetch=async()=>{
  calls++;
  const events=Array.from({length:500},()=> 'data: '+JSON.stringify({choices:[{delta:{content:'答案：A。'}}]})+'\n\n').join('')+'data: [DONE]\n\n';
  return new Response(events,{headers:{'content-type':'text/event-stream'}});
};
const data={};chromeSetup();
function chromeSetup(){globalThis.chrome={storage:{local:{get:async key=>({[key]:data[key]}),set:async value=>Object.assign(data,value)}}};}
const settings={url:'https://api.xiaomimimo.com/v1',model:'mimo-v2.6-pro',key:'FAKE-LOCAL-ONLY'};
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
const results={note:'No network requests. Fake API response; Chrome capture/storage IPC not represented.',measurements:{}};
for(const chars of [100000,1000000,5000000]){
  const samples=[];const image='data:image/png;base64,'+'A'.repeat(chars);
  for(let index=0;index<60;index++){const start=performance.now();JSON.stringify(requestBody(settings,image));if(index>=10)samples.push(performance.now()-start);}
  results.measurements[`request_serialize_${chars}_base64_chars`]={median_ms:percentile(samples,.5),p95_ms:percentile(samples,.95)};
}
const streamSamples=[],historySamples=[];
for(let index=0;index<30;index++){
  let chunks=0;const start=performance.now();const answer=await sendRequest(settings,'data:image/png;base64,AAAA',{signal:new AbortController().signal,onDelta:()=>chunks++});
  streamSamples.push(performance.now()-start);
  const saved=performance.now();await saveHistory({id:String(index),time:new Date().toISOString(),answer:answer.text,status:'completed',model:settings.model});historySamples.push(performance.now()-saved);
  if(chunks!==500)throw new Error('Unexpected stream parsing');
}
results.measurements.parse_500_stream_chunks={median_ms:percentile(streamSamples,.5),p95_ms:percentile(streamSamples,.95)};
results.measurements.history_serialize_mock_storage={median_ms:percentile(historySamples,.5),p95_ms:percentile(historySamples,.95)};
const start=performance.now();await new Promise(resolve=>setTimeout(resolve,1500));
results.measurements.single_change_debounce_ms=performance.now()-start;
const burstStart=performance.now();await new Promise(resolve=>{let timer;const change=()=>{clearTimeout(timer);timer=setTimeout(resolve,1500);};change();for(let i=1;i<=6;i++)setTimeout(change,i*300);});
results.measurements.six_changes_300ms_apart_debounce_ms=performance.now()-burstStart;
results.fake_api_calls=calls;
await writeFile('tests/local-latency-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
