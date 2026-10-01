import { DEFAULTS, endpoint, permissionPattern } from './core.mjs';
const $ = id => document.getElementById(id);
let activeTab;
const show = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };
async function message(data) {
  const result = await chrome.runtime.sendMessage({ target: 'background', ...data });
  if (!result?.ok) throw new Error(result?.error || '扩展暂时不可用。');
  return result;
}
async function load() {
  const saved = await chrome.storage.local.get('config');
  const config = { ...DEFAULTS, ...saved.config };
  for (const name of ['url','model','key']) $(name).value = config[name];
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { state } = await message({ type: 'state' });
  $('enabled').checked = state?.tabId === activeTab?.id;
  if (state && state.tabId !== activeTab?.id) $('scope').textContent = '另一个标签页正在分析';
}
async function save() {
  const config = { url: $('url').value.trim(), model: $('model').value.trim(), key: $('key').value.trim() };
  endpoint(config.url);
  if (!config.model || !config.key) throw new Error('请填写模型名称和 API Key。');
  const granted = await chrome.permissions.request({ origins: [permissionPattern(config.url)] });
  if (!granted) throw new Error('需要你允许访问所配置的 API 地址。');
  await message({ type: 'save', config });
  return config;
}
$('config').addEventListener('submit', async event => {
  event.preventDefault();
  try { await save(); show('配置已保存。'); } catch (error) { show(error.message, true); }
});
$('enabled').addEventListener('change', async () => {
  const enabled = $('enabled').checked;
  $('enabled').disabled = true;
  try {
    if (enabled) {
      const granted=await chrome.permissions.request({origins:['https://*/*','http://*/*']});
      if(!granted)throw new Error('跨网址继续分析需要允许访问网页。');
      await save();
      await message({ type: 'start', tabId: activeTab.id });
      show('已开启并立即分析。网页点击或 URL 改变后等待 1.6 秒分析。');
    } else { await message({ type: 'stop' }); show('已关闭。'); }
  } catch (error) { $('enabled').checked = false; show(error.message, true); }
  finally { $('enabled').disabled = false; }
});
$('refresh').addEventListener('click', async () => {
  try { await message({ type: 'manual', tabId: activeTab.id }); show('已立即开始截图分析。'); }
  catch (error) { show(error.message, true); }
});
$('history').addEventListener('click',()=>message({type:'open-history'}).catch(error=>show(error.message,true)));
$('reveal').addEventListener('click', () => {
  const hidden = $('key').type === 'password';
  $('key').type = hidden ? 'text' : 'password'; $('reveal').textContent = hidden ? '隐藏' : '显示';
});
$('clear').addEventListener('click', async () => {
  try { await message({ type: 'clear-key' }); $('key').value = ''; $('enabled').checked = false; show('密钥已清除，自动分析已关闭。'); }
  catch (error) { show(error.message, true); }
});
load().catch(error => show(error.message, true));
