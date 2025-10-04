// === Konfiguration ===
const API_BASE = "https://script.google.com/macros/s/AKfycbw1J3ES7SHjM_cqC8jalvgEyx2eCs5dFZU5jhUosCC3BaZkLT6mE5sJBXjraKcxubAA6A/exec";
const MAX_ITEMS = 50;
const PENDING_KEY = 'comments_pending_v1';
const ADMIN_TOKEN_KEY = 'comments_admin_token_v1';

const els = {
  form: document.getElementById('commentForm'),
  name: document.getElementById('name'),
  comment: document.getElementById('comment'),
  charCount: document.getElementById('charCount'),
  sendBtn: document.getElementById('sendBtn'),
  clearBtn: document.getElementById('clearBtn'),
  feed: document.getElementById('feed'),
  status: document.getElementById('status'),
  formMsg: document.getElementById('formMsg'),
  refreshBtn: document.getElementById('refreshBtn'),
  adminPanel: document.getElementById('adminPanel'),
  adminToken: document.getElementById('adminToken'),
  adminLogin: document.getElementById('adminLogin'),
  adminLogout: document.getElementById('adminLogout'),
  adminRefresh: document.getElementById('adminRefresh'),
  pendingList: document.getElementById('pendingList'),
  adminStatus: document.getElementById('adminStatus')
};

// === Hjälpfunktioner ===
function esc(s=''){
  return s.replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function now(){ return new Date().toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'}); }
function dttxt(ts){
  try{ return new Date(ts).toLocaleString('sv-SE',{dateStyle:'medium', timeStyle:'short'}); }
  catch{ return '' }
}
function showToast(msg, cssClass='ok', ms=2800){
  const el=document.getElementById('toast'); if(!el) return;
  el.textContent=msg; el.className=`toast ${cssClass}`;
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>el.classList.remove('show'), ms);
}
function hashCode(str=''){ let h=0; for(let i=0;i<str.length;i++) h=(h<<5)-h+str.charCodeAt(i)|0; return Math.abs(h); }
function avatarStyle(name){
  const hues=[180,200,160,190,210,170,150]; const h=hues[hashCode(name)%hues.length];
  return `background:hsl(${h} 80% 60%)`;
}
function initials(name='Anonym'){
  const parts=String(name).trim().split(/\s+/);
  const a=parts[0]?.[0]||'A'; const b=parts[1]?.[0]||'';
  return (a+b).toUpperCase();
}

function setPending(item){ try{ localStorage.setItem(PENDING_KEY, JSON.stringify(item)); }catch{} }
function getPending(){ try{ return JSON.parse(localStorage.getItem(PENDING_KEY)||'null'); }catch{ return null } }
function clearPending(){ try{ localStorage.removeItem(PENDING_KEY); }catch{} }
function sameComment(a,b){
  if(!a||!b) return false;
  const an=String(a.name||'').trim().toLowerCase();
  const bn=String(b.name||'').trim().toLowerCase();
  const ac=String(a.comment||'').trim();
  const bc=String(b.comment||'').trim();
  return an===bn && ac===bc;
}

function getAdminToken(){ return localStorage.getItem(ADMIN_TOKEN_KEY)||''; }
function setAdminToken(t){ localStorage.setItem(ADMIN_TOKEN_KEY, t||''); }
function isAdmin(){ return !!getAdminToken(); }

// === JSONP (undviker CORS för GET) ===
function loadJSONP(url, cbParam = 'callback') {
  return new Promise((resolve, reject) => {
    const cbName = 'jsonp_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    window[cbName] = (data) => { resolve(data); cleanup(); };

    const s = document.createElement('script');
    s.src = url + (url.includes('?') ? '&' : '?') + cbParam + '=' + cbName;
    s.onerror = () => { reject(new Error('JSONP failed')); cleanup(); };
    document.head.appendChild(s);

    function cleanup(){
      try { delete window[cbName]; } catch {}
      s.remove();
    }
  });
}

// === Publikt flöde – via JSONP (kringgår CORS) ===
async function listComments(){
  els.status.textContent='Hämtar kommentarer…';
  try{
    const url = `${API_BASE}?action=list&limit=${MAX_ITEMS}&t=${Date.now()}`;
    const json = await loadJSONP(url); // JSONP i stället för fetch
    if(!json.ok) throw new Error(json.error||'Okänt fel');
    renderFeed(json.items||[]);
    els.status.textContent = `Senast uppdaterad ${now()}`;
  }catch(err){
    console.error(err);
    els.status.textContent='Kunde inte hämta kommentarer.';
  }
}

function renderFeed(items){
  els.feed.innerHTML='';
  const pending = getPending();
  let pendingStillWaiting=false;

  if(pending && !items.some(it=>sameComment(pending,it))){
    pendingStillWaiting=true;
    const li=document.createElement('li'); li.className='item pending';
    const name=esc(pending.name||'Anonym'); const text=esc(pending.comment||'');
    li.innerHTML = `
      <div class="avatar" style="${avatarStyle(name)}"><span>${initials(name)}</span></div>
      <div>
        <div class="meta"><span class="name">${name}</span></div>
        <div class="text">${text}</div>
      </div>`;
    els.feed.appendChild(li);
  }

  if(!items.length && !pendingStillWaiting){
    els.feed.innerHTML='<li class="muted">Inga kommentarer ännu.</li>';
    return;
  }

  for(const it of items){
    const li=document.createElement('li'); li.className='item';
    const name=esc(it.name||'Anonym'); const text=esc(it.comment||''); const ts = it.ts ? dttxt(it.ts) : '';
    li.innerHTML = `
      <div class="avatar" style="${avatarStyle(name)}"><span>${initials(name)}</span></div>
      <div>
        <div class="meta"><span class="name">${name}</span><span class="badge">${ts}</span></div>
        <div class="text">${text}</div>
      </div>`;
    if(pending && sameComment(pending,it)){
      clearPending(); li.classList.add('new');
      showToast('Din kommentar är nu godkänd och syns på sidan!', 'ok', 2400);
    }
    els.feed.appendChild(li);
  }
}

// === Skicka kommentar (POST) ===
function setFormMsg(txt, cssClass=''){ els.formMsg.className=`msg ${cssClass}`; els.formMsg.textContent=txt; }
async function submitComment(ev){
  ev.preventDefault();
  const name = els.name.value.trim().slice(0,60);
  const comment = els.comment.value.trim();
  if(comment.length < 3){ setFormMsg('Skriv minst 3 tecken.', 'warn'); return; }
  if(comment.length > 500){ setFormMsg('Max 500 tecken.', 'warn'); return; }
  els.sendBtn.disabled=true; setFormMsg('Skickar…');
  try{
    const data = new URLSearchParams();
    data.set('action','submit'); data.set('name', name); data.set('comment', comment);

    const res = await fetch(API_BASE, {
      method:'POST',
      redirect:'follow',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:data.toString()
    });
    const json = await res.json(); if(!json.ok) throw new Error(json.error||'Okänt fel');

    els.comment.value=''; els.charCount.textContent='0';
    setFormMsg('Tack! Din kommentar är skickad och visas här efter godkännande.', 'ok');
    showToast('Kommentar skickad! Visas efter godkännande.', 'ok');
    setPending({ name, comment });
    renderFeed([]);
  }catch(err){
    console.error(err);
    setFormMsg('Kunde inte skicka. Försök igen.', 'err');
    showToast('Kunde inte skicka', 'err');
  } finally{
    els.sendBtn.disabled=false;
  }
}

// === Admin ===
function showAdminPanel(show){ els.adminPanel.hidden = !show; }
function updateAdminButtons(){
  const on=isAdmin();
  els.adminLogout.hidden=!on; els.adminRefresh.hidden=!on;
  els.adminToken.hidden=on; els.adminLogin.hidden=on;
}

async function adminLogin(){
  const t=els.adminToken.value.trim();
  if(!t){ showToast('Fyll i token', 'warn'); return; }
  setAdminToken(t); updateAdminButtons();
  await listPending();
  showToast('Admin inloggad', 'ok');
}
function adminLogout(){
  setAdminToken('');
  els.pendingList.innerHTML='';
  updateAdminButtons();
  showToast('Admin utloggad', 'ok');
}

// (GET) Pendings via JSONP
async function listPending(){
  if(!isAdmin()){ els.adminStatus.textContent='Inte inloggad.'; return; }
  els.adminStatus.textContent='Hämtar väntande…';
  try{
    const url = `${API_BASE}?action=list&status=pending&token=${encodeURIComponent(getAdminToken())}&t=${Date.now()}`;
    const json = await loadJSONP(url); // JSONP i stället för fetch
    if(!json.ok) throw new Error(json.error||'Okänt fel');
    renderPending(json.items||[]);
    els.adminStatus.textContent=`${(json.items||[]).length} väntande`;
  }catch(err){
    console.error(err);
    els.adminStatus.textContent='Kunde inte hämta väntande.';
  }
}

function renderPending(items){
  els.pendingList.innerHTML='';
  if(!items.length){
    els.pendingList.innerHTML='<li class="muted">Inga väntande.</li>';
    return;
  }
  for(const it of items){
    const li=document.createElement('li'); li.className='item pending';
    const name=esc(it.name||'Anonym'); const text=esc(it.comment||''); const ts=it.ts? dttxt(it.ts):'';
    li.innerHTML=`
      <div class="avatar" style="${avatarStyle(name)}"><span>${initials(name)}</span></div>
      <div>
        <div class="meta"><span class="name">${name}</span><span class="badge">${ts}</span></div>
        <div class="text">${text}</div>
        <div class="actions-admin">
          <button class="approve">Godkänn</button>
          <button class="decline">Avslå</button>
          <button class="delete">Ta bort</button>
        </div>
      </div>`;
    li.querySelector('.approve').addEventListener('click', ()=>moderate(it.row,'approve',li));
    li.querySelector('.decline').addEventListener('click', ()=>moderate(it.row,'decline',li));
    li.querySelector('.delete').addEventListener('click', ()=>moderate(it.row,'delete',li));
    els.pendingList.appendChild(li);
  }
}

// (POST) Moderera
async function moderate(row, op, el){
  if(!isAdmin()) return;
  try{
    const data = new URLSearchParams();
    data.set('action','moderate'); data.set('token', getAdminToken());
    data.set('row', String(row));  data.set('op', op);

    const res = await fetch(API_BASE, {
      method:'POST',
      redirect:'follow',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:data.toString()
    });
    const json = await res.json(); if(!json.ok) throw new Error(json.error||'Okänt fel');

    showToast(op==='approve'?'Godkänd': op==='decline'?'Avslagen':'Borttagen', 'ok');
    el?.remove();
    await listComments();
  }catch(err){
    console.error(err);
    showToast('Kunde inte utföra åtgärden', 'err');
  }
}

// === Init & events ===
function onCommentInput(){ els.charCount.textContent=String(els.comment.value.length); }
els.form.addEventListener('submit', submitComment);
els.clearBtn.addEventListener('click', ()=>{
  els.name.value=''; els.comment.value=''; els.charCount.textContent='0'; setFormMsg('');
});
els.comment.addEventListener('input', onCommentInput);
els.refreshBtn.addEventListener('click', listComments);
// admin
els.adminLogin.addEventListener('click', adminLogin);
els.adminLogout.addEventListener('click', adminLogout);
els.adminRefresh.addEventListener('click', listPending);

// Auto-refresh / visibility
setInterval(listComments, 60000);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') listComments(); });

// Start
(function(){
  const hasToken = getAdminToken();
  const url = new URL(location.href);
  const hashAdmin = url.hash.includes('admin');
  showAdminPanel(hashAdmin || !!hasToken);
  updateAdminButtons();
  listComments();
  if(isAdmin()) listPending();
})();
