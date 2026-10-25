const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let books = [], members = [], loans = [];
const today = new Date();
$('#today').textContent = today.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
$('#due-date').min = today.toISOString().slice(0,10);
$('#due-date').value = new Date(today.getTime() + 14*86400000).toISOString().slice(0,10);

async function api(url, options={}) {
  const response = await fetch(url, { headers: {'Content-Type':'application/json'}, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}
function toast(message, error=false) {
  const el = $('#toast'); el.textContent = message; el.className = error ? 'show error' : 'show';
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className='', 3300);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function dateLabel(value) {
  if (!value) return '—';
  const d = new Date(`${String(value).slice(0,10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function statusPill(status) {
  const c = status.toLowerCase();
  return `<span class="status status-${c}">${escapeHtml(status)}</span>`;
}
async function loadAll() {
  try {
    const [dashboard, b, m, l] = await Promise.all([
      api('/api/dashboard'), api('/api/books'), api('/api/members'), api('/api/loans')
    ]);
    books=b; members=m; loans=l;
    $('#stat-books').textContent=dashboard.books; $('#stat-copies').textContent=dashboard.copies;
    $('#stat-members').textContent=dashboard.members; $('#stat-loans').textContent=dashboard.activeLoans;
    $('#stat-overdue').textContent=dashboard.overdue;
    renderBooks(); renderMembers(); renderLoans(); renderRecent(); fillLoanOptions();
  } catch (e) {
    toast(`Could not load data: ${e.message}. Check MySQL and your .env settings.`, true);
    const dot = $('.live-dot'); if(dot) dot.style.background='#d65b5b';
    const label = $('.top-right span:nth-child(2)'); if(label) label.textContent='Database connection issue';
  }
}
function go(page) {
  $$('.page').forEach(p=>p.classList.add('hidden'));
  $(`#page-${page}`).classList.remove('hidden');
  $$('.nav').forEach(n=>n.classList.toggle('active', n.dataset.page===page));
  $('#page-title').textContent = ({overview:'Overview',books:'Books',members:'Members',loans:'Issue / Return'})[page];
}
$$('.nav').forEach(n=>n.addEventListener('click',()=>go(n.dataset.page)));
$$('[data-goto]').forEach(n=>n.addEventListener('click',()=>go(n.dataset.goto)));

function renderBooks() {
  const q=$('#book-search').value.toLowerCase();
  const list=books.filter(b=>[b.title,b.isbn,b.authors,b.category,b.publisher].some(x=>String(x||'').toLowerCase().includes(q)));
  $('#book-count').textContent=`${list.length} title${list.length===1?'':'s'}`;
  $('#books-body').innerHTML=list.map(b=>`<tr><td>${escapeHtml(b.title)}<br><small style="color:#9a9db0;font-weight:400">${escapeHtml(b.isbn)}</small></td><td>${escapeHtml(b.authors)}</td><td>${escapeHtml(b.category)}</td><td>${escapeHtml(b.publisher||'—')}</td><td><b>${b.available_copies}</b> / ${b.total_copies}</td></tr>`).join('') || '<tr><td colspan="5">No books found.</td></tr>';
}
function renderMembers() {
  const q=$('#member-search').value.toLowerCase();
  const list=members.filter(m=>[m.full_name,m.email,m.phone].some(x=>String(x||'').toLowerCase().includes(q)));
  $('#member-count').textContent=`${list.length} member${list.length===1?'':'s'}`;
  $('#members-body').innerHTML=list.map(m=>`<tr><td>${escapeHtml(m.full_name)}</td><td>${escapeHtml(m.email)}</td><td>${escapeHtml(m.phone||'—')}</td><td>${dateLabel(m.joined_on)}</td><td>#${m.member_id}</td></tr>`).join('') || '<tr><td colspan="5">No members found.</td></tr>';
}
function renderLoans() {
  const q=$('#loan-search').value.toLowerCase();
  const list=loans.filter(l=>[l.title,l.member,l.email,l.status].some(x=>String(x||'').toLowerCase().includes(q)));
  $('#loan-count').textContent=`${list.length} record${list.length===1?'':'s'}`;
  $('#loans-body').innerHTML=list.map(l=>`<tr><td>${escapeHtml(l.title)}</td><td>${escapeHtml(l.member)}<br><small style="color:#9a9db0;font-weight:400">${escapeHtml(l.email)}</small></td><td>${dateLabel(l.issued_on)}</td><td>${dateLabel(l.due_on)}</td><td>${statusPill(l.status)}</td><td><button class="return-btn" data-return="${l.loan_id}" ${l.returned_on?'disabled':''}>${l.returned_on?'Returned':'Return book'}</button></td></tr>`).join('') || '<tr><td colspan="6">No loan records found.</td></tr>';
  $$('[data-return]').forEach(btn=>btn.addEventListener('click',async()=>{
    try { const r=await api(`/api/loans/${btn.dataset.return}/return`,{method:'POST',body:'{}'}); toast(r.message); await loadAll(); }
    catch(e){toast(e.message,true);}
  }));
}
function renderRecent() {
  const list=loans.slice(0,5);
  $('#recent-loans').innerHTML=list.map(l=>`<tr><td>${escapeHtml(l.title)}</td><td>${escapeHtml(l.member)}</td><td>${dateLabel(l.issued_on)}</td><td>${dateLabel(l.due_on)}</td><td>${statusPill(l.status)}</td></tr>`).join('') || '<tr><td colspan="5">No circulation activity yet. Issue a book to get started.</td></tr>';
}
function fillLoanOptions() {
  $('#loan-book').innerHTML='<option value="">Choose an available book</option>'+books.filter(b=>b.available_copies>0).map(b=>`<option value="${b.book_id}">${escapeHtml(b.title)} (${b.available_copies} available)</option>`).join('');
  $('#loan-member').innerHTML='<option value="">Choose a member</option>'+members.map(m=>`<option value="${m.member_id}">${escapeHtml(m.full_name)} — ${escapeHtml(m.email)}</option>`).join('');
}
function toggleForm(id, show) { $(`#${id}`).classList.toggle('hidden', !show); }
$('#show-book-form').onclick=()=>toggleForm('book-form-panel',true);
$('#cancel-book').onclick=()=>toggleForm('book-form-panel',false);
$('#show-member-form').onclick=()=>toggleForm('member-form-panel',true);
$('#cancel-member').onclick=()=>toggleForm('member-form-panel',false);
$('#show-loan-form').onclick=()=>toggleForm('loan-form-panel',true);
$('#cancel-loan').onclick=()=>toggleForm('loan-form-panel',false);
$('#book-search').addEventListener('input',renderBooks);
$('#member-search').addEventListener('input',renderMembers);
$('#loan-search').addEventListener('input',renderLoans);

$('#book-form').addEventListener('submit',async e=>{
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries());
  try { const r=await api('/api/books',{method:'POST',body:JSON.stringify(data)}); toast(r.message); e.target.reset(); toggleForm('book-form-panel',false); await loadAll(); }
  catch(err){toast(err.message,true);}
});
$('#member-form').addEventListener('submit',async e=>{
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries());
  try { const r=await api('/api/members',{method:'POST',body:JSON.stringify(data)}); toast(r.message); e.target.reset(); toggleForm('member-form-panel',false); await loadAll(); }
  catch(err){toast(err.message,true);}
});
$('#loan-form').addEventListener('submit',async e=>{
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries());
  try { const r=await api('/api/loans',{method:'POST',body:JSON.stringify(data)}); toast(r.message); e.target.reset(); $('#due-date').value=new Date(Date.now()+14*86400000).toISOString().slice(0,10); toggleForm('loan-form-panel',false); await loadAll(); }
  catch(err){toast(err.message,true);}
});
loadAll();