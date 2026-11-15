// 管理台页面（模板字符串，导出给 worker.js 使用）
export const HTML_ADMIN = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>TG 书源管理 · MoonTV</title>
<style>
body{font-family:-apple-system,"PingFang SC",sans-serif;background:#0f1720;color:#e6edf3;margin:0;padding:20px 16px 40px}
h1{font-size:19px;margin:0 0 15px}
.card{background:#16212b;border:1px solid #24333f;border-radius:12px;padding:15px;margin-bottom:14px}
input,button{font:inherit;font-size:14px;border-radius:8px;border:1px solid #2f4452;background:#0e1820;color:#e6edf3;padding:9px 12px}
button{cursor:pointer;background:#1f6feb;border:none;white-space:nowrap}button.ghost{background:#24333f}button.danger{background:#a33}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.row input{flex:1 1 180px;min-width:0}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:8px;text-align:left;border-bottom:1px solid #24333f}
.muted{color:#8b9aa8;font-size:13px;line-height:1.5}
.tag{display:inline-block;background:#213547;padding:2px 8px;border-radius:999px;font-size:12px;white-space:nowrap}
pre{white-space:pre-wrap;word-break:break-word;background:#0e1820;padding:12px;border-radius:8px;max-height:320px;overflow:auto;font-size:12.5px}
@media (max-width:560px){
  body{padding:16px 12px 36px}
  thead{display:none}
  tbody tr{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;gap:5px 10px;padding:12px 0;border-bottom:1px solid #24333f;align-items:center}
  tbody tr:last-child{border-bottom:none}
  tbody td{border:none;padding:0}
  td:nth-child(1){grid-column:1;grid-row:1;font-weight:600;word-break:break-all}
  td:nth-child(2){grid-column:1;grid-row:2}
  td:nth-child(3){grid-column:2;grid-row:1/3;text-align:right}
  td:nth-child(3) button{font-size:12.5px;padding:7px 10px}
}
</style></head><body>
<h1>Telegram 资源频道管理</h1>
<div class="card">
  <div class="row"><input id="tok" placeholder="管理口令"><button class="ghost" id="btnSave">保存口令</button></div>
  <div class="muted" id="hint">口令会自动带到链接里，换设备或重开都能直接用。</div>
</div>
<div class="card">
  <div class="row"><input id="ch" placeholder="频道，如 @movie_channel 或 t.me/xxx"><button id="btnAdd">添加频道</button></div>
  <div class="muted">只支持公开频道（能在 t.me/s/xxx 预览的）。加完自动检测能不能抓到东西。</div>
</div>
<div class="card">
  <div class="row"><strong>已配置频道</strong><span id="cnt" class="muted"></span></div>
  <table><thead><tr><th>频道</th><th>状态</th><th>操作</th></tr></thead><tbody id="list"></tbody></table>
</div>
<div class="card">
  <div class="row"><input id="apiBase" placeholder="MTProto 后端地址，如 https://tgapi.xxx.workers.dev"></div>
  <div class="row"><input id="apiTok" placeholder="后端 API_TOKEN（可选）"><button class="ghost" id="btnSaveApi">保存后端</button><button class="ghost" id="btnTestApi">测试后端</button></div>
  <div class="muted" id="apiHint">填了后端，预览关闭的频道也能抓（走 MTProto）。</div>
</div>
<div class="card">
  <div class="row"><input id="q" placeholder="搜关键词，如 流浪地球"><button id="btnSearch">测试搜索</button></div>
<pre id="out" class="muted">（结果会显示在这里）</pre>
</div>
<script>
(function(){
  function $(id){ return document.getElementById(id); }
  function cookieGet(n){ var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)')); return m?decodeURIComponent(m[1]):''; }
  function cookieSet(n,v){ document.cookie=n+'='+encodeURIComponent(v)+'; path=/; max-age=15552000; SameSite=Lax'; }
  var urlTok = new URLSearchParams(location.search).get('token') || '';
  var T = urlTok || '';
  if(!T){ try{ T = localStorage.getItem('tg_token') || ''; }catch(e){ T=''; } }
  if(!T) T = cookieGet('tg_token') || '';
  $('tok').value = T;

  function persist(v){ if(!v) return; T=v;
    try{ localStorage.setItem('tg_token', v); }catch(e){}
    try{ cookieSet('tg_token', v); }catch(e){}
  }
  if(urlTok) persist(urlTok);

  function api(path, opt){
    opt = opt || {};
    opt.headers = Object.assign({'Content-Type':'application/json','X-Token':T}, opt.headers || {});
    return fetch(path, opt).then(function(r){ return r.json().catch(function(){ return {error:'HTTP '+r.status}; }); });
  }

  function row(c){
    var tr = document.createElement('tr');
    var td1 = document.createElement('td'); td1.textContent = c;
    var td2 = document.createElement('td');
    var tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = '检测中…'; tag.dataset.ch = c; td2.appendChild(tag);
    var td3 = document.createElement('td');
    var b1 = document.createElement('button'); b1.className='ghost'; b1.textContent='测试抓取';
    b1.addEventListener('click', function(){ testOne(c); });
    var b2 = document.createElement('button'); b2.className='danger'; b2.textContent='删除';
    b2.addEventListener('click', function(){ removeCh(c); });
    td3.appendChild(b1); td3.appendChild(document.createTextNode(' ')); td3.appendChild(b2);
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
    probe(c, tag);
    return tr;
  }

  function probe(c, tag){
    api('/api/probe?channel=' + encodeURIComponent(c)).then(function(d){
      if(!d || d.error){ tag.textContent = '检测失败'; return; }
      if(d.ok){ tag.textContent = '可抓 ' + d.count + ' 条'; tag.style.background = '#1c4a2c'; tag.style.color = '#7ee2a8'; }
      else { tag.textContent = '预览关闭'; tag.style.background = '#5a2020'; tag.style.color = '#ffb3b3'; }
      tag.title = d.reason || '';
    });
  }

  function setRows(msg){
    var tb = $('list'); tb.textContent = '';
    if(msg){ var tr=document.createElement('tr'); var td=document.createElement('td'); td.colSpan=3; td.className='muted'; td.textContent=msg; tr.appendChild(td); tb.appendChild(tr); }
    return tb;
  }

  function load(){
    if(!T){ setRows('先在上面填口令并点「保存口令」'); $('cnt').textContent=''; return; }
    setRows('加载中…');
    api('/api/channels').then(function(d){
      if(d.error){ setRows(d.error); $('cnt').textContent=''; return; }
      var cs = d.channels || [];
      $('cnt').textContent = '共 ' + cs.length + ' 个';
      var tb = setRows(cs.length ? '' : '还没有频道，上面加一个');
      cs.forEach(function(c){ tb.appendChild(row(c)); });
    }).catch(function(e){ setRows('请求失败：' + e.message); });
  }

  $('btnSave').addEventListener('click', function(){
    var v = $('tok').value.trim();
    if(!v){ alert('先填口令'); return; }
    persist(v);
    var link = location.origin + '/admin?token=' + encodeURIComponent(v);
    history.replaceState(null, '', '/admin?token=' + encodeURIComponent(v));
    $('hint').textContent = '已记住。保存这个链接，下次点开自动带口令：' + link;
    load();
  });

  $('btnAdd').addEventListener('click', function(){
    var v = $('ch').value.trim(); if(!v) return;
    api('/api/channels', {method:'POST', body: JSON.stringify({add:[v]})}).then(function(){
      $('ch').value=''; load();
    });
  });

  function loadApi(){
    api('/api/settings').then(function(d){
      $('apiBase').value = d.apiBase || '';
      $('apiTok').value = d.apiTok || '';
      if(d.apiBase) $('apiHint').textContent = '后端已配置：' + d.apiBase;
    });
  }
  $('btnSaveApi').addEventListener('click', function(){
    api('/api/settings', {method:'POST', body: JSON.stringify({apiBase: $('apiBase').value.trim(), apiTok: $('apiTok').value.trim()})})
      .then(function(){ $('apiHint').textContent = '后端已保存：' + $('apiBase').value.trim(); });
  });
  $('btnTestApi').addEventListener('click', function(){
    var b = $('apiBase').value.trim();
    if(!b){ $('apiHint').textContent = '先填后端地址'; return; }
    $('apiHint').textContent = '测试中…';
    fetch(b.replace(/\/$/, '') + '/health', { headers: $('apiTok').value.trim() ? {'X-Token': $('apiTok').value.trim()} : {} })
      .then(function(r){ return r.text(); })
      .then(function(t){ $('apiHint').textContent = '后端返回：' + t.slice(0, 120); })
      .catch(function(e){ $('apiHint').textContent = '连不上：' + e.message; });
  });

  $('btnSearch').addEventListener('click', function(){
    var q = $('q').value.trim();
    api('/api/search?q=' + encodeURIComponent(q)).then(show);
  });

  function testOne(c){
    api('/api/search?q=&pages=1&only=' + encodeURIComponent(c)).then(show);
  }
  function removeCh(c){
    api('/api/channels', {method:'POST', body: JSON.stringify({remove:[c]})}).then(load);
  }
  function show(d){
    var o = $('out');
    if(d.error){ o.textContent = '错误：' + d.error; return; }
    var it = (d.items || []).slice(0, 20);
    if(!it.length){ o.textContent = '没结果。可能频道没货，或私有频道预览不到。'; return; }
    o.textContent = '命中 ' + (d.total||0) + ' 条（' + (d.ms||0) + 'ms）\\n\\n' + it.map(function(x){
      return '[' + x.channel + '] ' + (x.text||'').slice(0,150).replace(/\\n/g,' ') + '\\n  磁力' + (x.magnets||[]).length + ' | 网盘' + (x.pan||[]).length + '\\n  ' + x.url;
    }).join('\\n\\n');
  }

  load();
  loadApi();
})();
</script></body></html>`;
