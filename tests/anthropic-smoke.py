"""One minimal authorized request; key is hidden input, never saved. No retries."""
import getpass, http.client, json, time
key=getpass.getpass('MiMo token (hidden): ')
body={'model':'mimo-v2.6-pro','max_tokens':1152,'stream':True,'thinking':{'type':'enabled','budget_tokens':1024},'messages':[{'role':'user','content':'只回复 OK。'}]}
started=time.perf_counter();phase='connect';connection=http.client.HTTPSConnection('api.xiaomimimo.com',timeout=15)
try:
    connection.connect();tls=time.perf_counter()-started;phase='request'
    connection.request('POST','/anthropic/messages',json.dumps(body).encode(),{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'})
    response=connection.getresponse();print(json.dumps({'status':response.status,'tls_s':round(tls,3),'headers_s':round(time.perf_counter()-started,3),'model_sent':body['model']},ensure_ascii=False),flush=True)
    if response.status==200:
        for line in response:
            if not line.startswith(b'data:'):continue
            event=json.loads(line[5:].strip());kind=event.get('type')
            if kind=='content_block_delta':
                delta=event.get('delta',{});print(json.dumps({'phase':delta.get('type'),'elapsed_s':round(time.perf_counter()-started,3),'text':delta.get('text','')},ensure_ascii=False),flush=True)
            if kind in ['message_stop','error']:print(json.dumps({'event':kind,'elapsed_s':round(time.perf_counter()-started,3)},ensure_ascii=False),flush=True)
    else:print(json.dumps({'result':'API rejected request; response body withheld'},ensure_ascii=False),flush=True)
except Exception as error:print(json.dumps({'failure_phase':phase,'error_type':type(error).__name__,'elapsed_s':round(time.perf_counter()-started,3)},ensure_ascii=False),flush=True)
finally:connection.close();key=''
