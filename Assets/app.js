
// Halifax Time v4 — Final Ship (Assets build)
// Startup safety: clear stale active timer keys
(() => { 
  localStorage.removeItem('tt_active_timer_v3p'); 
  localStorage.removeItem('halifax_active_timer_v3'); 
})();

const state = {
  currentUser: null,
  timer: { running: false, start: null, client: null, intervalId: null },
  data: null,
  lastInvoiceHTML: null
};
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

function loadData(){
  fetch("./assets/dummy_data.json").then(r=>r.json()).then(d=>{
    const local = localStorage.getItem("halifax_store_v4_final");
    state.data = local ? JSON.parse(local) : d;
    persist();
    hydrateClients();
  });
}
function persist(){ localStorage.setItem("halifax_store_v4_final", JSON.stringify(state.data)); }

function fmtH(ms){ const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }
function roundingMinutes(){ return state.data?.settings?.rounding_minutes ?? 6; }
function roundToMinutes(ms){ const mins=Math.round(ms/60000); const inc=roundingMinutes(); return Math.round(mins/inc)*inc*60000; }
function nyDateFromLocalString(s){ return new Date(s.replace(" ","T")+":00"); }
function fmtDateStr(dISO){ const d=new Date(dISO+"T00:00:00"); return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function fmtMoney(x){ return Number(x||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}); }
function uid(prefix){ return prefix + "_" + Math.random().toString(36).slice(2,10); }

function show(view){
  ["login","timer","timesheet","approvals","invoices","admin-clients","admin-users","admin-rates"].forEach(v=> $(`#${v}-view`)?.classList.add("hidden"));
  $(`#${view}-view`)?.classList.remove("hidden");
  if (view!=="login") $("#nav").classList.remove("hidden");
  if (view==="timer") checkForResume();
  if (["admin-clients","admin-users","admin-rates"].includes(view)) guardAdmin();
  if (view==="admin-clients") renderClients();
  if (view==="admin-users") renderUsers();
  if (view==="admin-rates") renderRates();
}

function login(){
  const email=$("#email").value.trim(), pass=$("#password").value.trim();
  const u=(state.data.users||[]).find(x=>!x.deleted && x.email===email && x.password===pass);
  if (!u) return alert("Invalid credentials");
  state.currentUser=u;
  $("#active-user").textContent = `${u.name} (${u.role})`;
  $$(".admin-only").forEach(b=> u.role==="Admin" ? b.classList.remove("hidden") : b.classList.add("hidden"));
  hydrateClients();
  show("timer");
}
function logout(){ state.currentUser=null; $("#nav").classList.add("hidden"); show("login"); }

function activeClients(){ return (state.data.clients||[]).filter(c=>!c.deleted); }
function hydrateClients(){
  const fill = (sel)=>{ const s=$(sel); if(!s) return; s.innerHTML=""; activeClients().forEach(c=>{ const o=document.createElement("option"); o.value=c.id; o.textContent=c.name; s.appendChild(o); }); };
  fill("#client-select"); fill("#man-client"); fill("#invoice-client");
  validateInvoicePrecheck();
}

function activeTimerKey(){ return "halifax_active_timer_v4"; }
function saveActiveTimer(){ if(!state.currentUser||!state.timer.running) return; const p={user_email:state.currentUser.email, client_id:state.timer.client, start_iso:state.timer.start.toISOString()}; localStorage.setItem(activeTimerKey(), JSON.stringify(p)); }
function clearActiveTimer(){ localStorage.removeItem(activeTimerKey()); }
function formatDateTime(dt){ return dt.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function showResumeBanner(ses){
  const div=$("#resume-banner"); const started=new Date(ses.start_iso); const client=activeClients().find(c=>c.id===ses.client_id);
  div.innerHTML = `<div style="display:flex;justify-content:space-between;gap:16px;align-items:center">
    <div><strong>Resumed timer detected</strong><br><span class="muted">Last session for</span> <em>${client?.name||"Client"}</em> <span class="muted">started</span> ${formatDateTime(started)}</div>
    <div class="actions"><button id="resume-continue" class="primary">Continue</button><button id="resume-discard" class="ghost">Discard</button></div>
  </div>`;
  div.classList.remove("hidden");
  $("#resume-continue").onclick=()=>{ state.timer.running=true; state.timer.client=ses.client_id; state.timer.start=new Date(ses.start_iso); $("#client-select").value=ses.client_id; $("#start-stop-btn").textContent="Stop"; if(state.timer.intervalId) clearInterval(state.timer.intervalId); state.timer.intervalId=setInterval(()=>$("#timer-display").textContent=fmtH(new Date()-state.timer.start),500); div.classList.add("hidden"); };
  $("#resume-discard").onclick=()=>{ clearActiveTimer(); state.timer={running:false,start:null,client:$("#client-select").value,intervalId:null}; $("#start-stop-btn").textContent="Start"; $("#timer-display").textContent="00:00:00"; div.classList.add("hidden"); };
}
function checkForResume(){ const raw=localStorage.getItem(activeTimerKey()); if(!raw) return; try{ const s=JSON.parse(raw); if(!s || s.user_email!==(state.currentUser&&state.currentUser.email)) return; if(!state.timer.running) showResumeBanner(s);}catch(e){} }

function startStopTimer(){
  if(!state.currentUser) return;
  const btn=$("#start-stop-btn");
  if(!state.timer.running){
    const client=$("#client-select").value;
    state.timer.running=true; state.timer.client=client; state.timer.start=new Date(); btn.textContent="Stop";
    state.timer.intervalId=setInterval(()=>$("#timer-display").textContent=fmtH(new Date()-state.timer.start),500);
    saveActiveTimer();
  }else{
    $("#stop-modal").classList.remove("hidden");
  }
}
function saveStop(){
  const note=$("#work-note").value.trim(); if(!note) return alert("Please enter a brief description.");
  $("#stop-modal").classList.add("hidden");
  const stopTime=new Date(); clearInterval(state.timer.intervalId);
  const dur=stopTime-state.timer.start, rounded=roundToMinutes(dur), started=state.timer.start, stopped=new Date(started.getTime()+rounded);
  const clientObj=activeClients().find(c=>c.id===state.timer.client);
  (state.data.time_entries=state.data.time_entries||[]).push({id:uid("t"), user_email:state.currentUser.email, client_id:state.timer.client, client_name:clientObj?.name||"", started_at_local: started.toISOString().slice(0,16).replace("T"," "), stopped_at_local: stopped.toISOString().slice(0,16).replace("T"," "), note, status:"draft"});
  persist(); state.timer={running:false,start:null,client:null,intervalId:null}; clearActiveTimer(); $("#start-stop-btn").textContent="Start"; $("#timer-display").textContent="00:00:00"; $("#work-note").value=""; renderTimesheet();
}
function cancelStop(){ $("#stop-modal").classList.add("hidden"); }

function addManualEntry(){
  const d=$("#man-date").value, st=$("#man-start").value, en=$("#man-end").value, cid=$("#man-client").value, note=$("#man-note").value.trim();
  if(!d||!st||!en||!cid||!note) return alert("Please complete date, start, end, client, and description.");
  const s=new Date(`${d}T${st}:00`), e=new Date(`${d}T${en}:00`); if(e<=s) return alert("End must be after start.");
  const rounded=roundToMinutes(e-s), stopped=new Date(s.getTime()+rounded); const c=activeClients().find(x=>x.id===cid);
  (state.data.time_entries=state.data.time_entries||[]).push({id:uid("t"), user_email:state.currentUser.email, client_id:cid, client_name:c?.name||"", started_at_local:`${d} ${st}`, stopped_at_local:`${d} ${stopped.toTimeString().slice(0,5)}`, note, status:"draft"});
  persist(); $("#man-note").value=""; $("#man-start").value=""; $("#man-end").value=""; renderTimesheet();
}

function renderTimesheet(){
  const tbody=$("#timesheet-table tbody"); tbody.innerHTML="";
  const entries=(state.data.time_entries||[]).filter(e=>e.user_email===state.currentUser.email);
  entries.sort((a,b)=>a.started_at_local.localeCompare(b.started_at_local));
  for(const e of entries){
    const st=nyDateFromLocalString(e.started_at_local), en=nyDateFromLocalString(e.stopped_at_local), hrs=(en-st)/3600000;
    const c=(activeClients().find(x=>x.id===e.client_id)?.name) || e.client_name;
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${fmtDateStr(e.started_at_local.slice(0,10))}</td><td>${c}</td><td>${e.started_at_local.slice(11)}</td><td>${e.stopped_at_local.slice(11)}</td><td>${hrs.toFixed(2)}</td><td>${e.status}</td><td>${e.note}</td><td>${e.status==="draft" ? '<button class="ghost sm edit">Edit</button> <button class="ghost sm del">Delete</button> <button class="primary sm submit">Submit</button>' : ''}</td>`;
    tr.querySelector(".edit")?.addEventListener("click",()=>{
      const ns=prompt("Edit start (HH:MM)", e.started_at_local.slice(11))||e.started_at_local.slice(11);
      const ne=prompt("Edit end (HH:MM)", e.stopped_at_local.slice(11))||e.stopped_at_local.slice(11);
      const nn=prompt("Edit description", e.note)||e.note;
      const d=e.started_at_local.slice(0,10);
      if(!/^[0-2]\d:[0-5]\d$/.test(ns)||!/^[0-2]\d:[0-5]\d$/.test(ne)) return alert("Invalid time format.");
      const s=new Date(`${d}T${ns}:00`), x=new Date(`${d}T${ne}:00`); if(x<=s) return alert("End must be after start.");
      const rounded=roundToMinutes(x-s), stopped=new Date(s.getTime()+rounded);
      e.started_at_local=`${d} ${ns}`; e.stopped_at_local=`${d} ${stopped.toTimeString().slice(0,5)}`; e.note=nn; persist(); renderTimesheet();
    });
    tr.querySelector(".del")?.addEventListener("click",()=>{ if(confirm("Delete entry?")){ const i=state.data.time_entries.indexOf(e); state.data.time_entries.splice(i,1); persist(); renderTimesheet(); } });
    tr.querySelector(".submit")?.addEventListener("click",()=>{ e.status="submitted"; persist(); renderTimesheet(); });
    tbody.appendChild(tr);
  }
}

function renderApprovals(){
  const tbody=$("#approvals-table tbody"); tbody.innerHTML="";
  const entries=(state.data.time_entries||[]).filter(e=>e.status==="submitted");
  entries.sort((a,b)=>a.started_at_local.localeCompare(b.started_at_local));
  for(const e of entries){
    const s=nyDateFromLocalString(e.started_at_local), x=nyDateFromLocalString(e.stopped_at_local), hrs=(x-s)/3600000;
    const user=(state.data.users||[]).find(u=>u.email===e.user_email), client=(activeClients().find(c=>c.id===e.client_id)?.name)||e.client_name;
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${user?.name||e.user_email}</td><td>${fmtDateStr(e.started_at_local.slice(0,10))}</td><td>${client}</td><td>${hrs.toFixed(2)}</td><td>${e.note}</td><td>${e.status}</td><td><button class="primary sm approve">Approve</button></td>`;
    tr.querySelector(".approve").addEventListener("click",()=>{ e.status="approved"; e.approved_at=new Date().toISOString(); e.approved_by=state.currentUser.email; persist(); renderApprovals(); });
    tbody.appendChild(tr);
  }
}

function rateFor(email, clientId, dateISO){
  const rows=(state.data.rates||[]).filter(r=>r.consultant_email===email && r.client_id===clientId);
  if(rows.length===0) return null;
  const t=new Date(dateISO+"T00:00:00").getTime();
  const elig=rows.filter(r=> new Date(r.effective_from+"T00:00:00").getTime() <= t);
  if(elig.length===0) return null;
  elig.sort((a,b)=> new Date(b.effective_from) - new Date(a.effective_from));
  return elig[0];
}

function startOfWeekSunday(dt){ const d=new Date(dt); const day=d.getDay(); const diff=(7-day)%7; const sun=new Date(d); sun.setDate(d.getDate()+diff); sun.setHours(0,0,0,0); return sun; }

function validateInvoicePrecheck(){
  const cid=$("#invoice-client")?.value; const mm=$("#invoice-month")?.value || new Date().toISOString().slice(0,7);
  const warn=$("#invoice-warnings"); if(!cid){ $("#gen-invoice").disabled=true; return; }
  const [yr,mo]=mm.split("-").map(n=>parseInt(n,10)); const m0=new Date(yr,mo-1,1), m1=new Date(yr,mo,0);
  const rows=(state.data.time_entries||[]).filter(e=> e.client_id===cid && e.status==="approved" && nyDateFromLocalString(e.started_at_local)>=m0 && nyDateFromLocalString(e.started_at_local)<=m1);
  const missing=new Set();
  for(const e of rows){ const d=e.started_at_local.slice(0,10); if(!rateFor(e.user_email, cid, d)) missing.add(`${e.user_email} on ${d}`); }
  if(missing.size){ warn.classList.remove("hidden"); warn.innerHTML=`<strong>Missing rates:</strong><br>`+Array.from(missing).map(x=>`• ${x}`).join("<br>")+`<br><em>Fix in Admin → Rates</em>`; $("#gen-invoice").disabled=true; }
  else { warn.classList.add("hidden"); $("#gen-invoice").disabled=false; }
}

function generateInvoice(){
  const cid=$("#invoice-client").value, mm=$("#invoice-month").value || new Date().toISOString().slice(0,7);
  const client=(activeClients().find(c=>c.id===cid)) || (state.data.clients||[]).find(c=>c.id===cid);
  const [yr,mo]=mm.split("-").map(n=>parseInt(n,10)); const m0=new Date(yr,mo-1,1), m1=new Date(yr,mo,0);
  const rows=(state.data.time_entries||[]).filter(e=> e.client_id===cid && e.status==="approved" && nyDateFromLocalString(e.started_at_local)>=m0 && nyDateFromLocalString(e.started_at_local)<=m1);
  const agg={};
  for(const e of rows){
    const user=(state.data.users||[]).find(u=>u.email===e.user_email);
    const s=nyDateFromLocalString(e.started_at_local), x=nyDateFromLocalString(e.stopped_at_local), h=(x-s)/3600000;
    const key=`${user?.name||e.user_email}|${e.user_email}|${cid}|${e.started_at_local.slice(0,10)}`;
    if(!agg[key]) agg[key]={consultant_name:user?.name||e.user_email, consultant_email:e.user_email, client_id:cid, date:e.started_at_local.slice(0,10), hours:0, notes:[]};
    agg[key].hours+=h; agg[key].notes.push(e.note);
  }
  const days=Object.values(agg).sort((a,b)=> a.consultant_name.localeCompare(b.consultant_name) || a.date.localeCompare(b.date));
  let totalH=0,total$=0;
  const weekly={}; const daily=[];
  for(const r of days){
    const rt=rateFor(r.consultant_email,cid,r.date); if(!rt) continue;
    const amt=r.hours*rt.rate; totalH+=r.hours; total$+=amt;
    const wk=startOfWeekSunday(new Date(r.date+"T00:00:00")).toISOString().slice(0,10);
    if(!weekly[wk]) weekly[wk]={week_ending_date:wk,hours:0,amount:0};
    weekly[wk].hours+=r.hours; weekly[wk].amount+=amt;
    daily.push({consultant:r.consultant_name,date:r.date,billable_hours:r.hours.toFixed(2),amount:amt,summary:Array.from(new Set(r.notes)).join(" ")});
  }
  const wks=Object.values(weekly).sort((a,b)=>a.week_ending_date.localeCompare(b.week_ending_date));
  const header=`<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
    <div>
      <h2>${client.name}</h2>
      <div class="subtle">${client.address||""}</div>
      <div class="subtle">Terms: ${client.terms}</div>
      <div class="subtle">Invoice Month: ${mm}</div>
    </div>
    <div><img src="./assets/logo.svg" alt="logo" style="height:40px"></div>
  </div><hr>`;
  const weeklyTable=['<table class="table"><thead><tr><th>Week Ending</th><th>Total Billable Hours</th><th>Amount</th></tr></thead><tbody>',
    ...wks.map(w=>`<tr><td>${fmtDateStr(w.week_ending_date)}</td><td>${w.hours.toFixed(2)}</td><td>${fmtMoney(w.amount)}</td></tr>`),
    `<tr><th>Total</th><th>${totalH.toFixed(2)}</th><th>${fmtMoney(total$)}</th></tr>`,
  '</tbody></table>'].join("");
  const dailyTable=['<table class="table"><thead><tr><th>Consultant</th><th>Date</th><th>Billable Hours</th><th>Amount</th><th>Summary</th></tr></thead><tbody>',
    ...daily.map(d=>`<tr><td>${d.consultant}</td><td>${fmtDateStr(d.date)}</td><td>${d.billable_hours}</td><td>${fmtMoney(d.amount)}</td><td>${d.summary}</td></tr>`),
  '</tbody></table>'].join("");
  const html=header+weeklyTable+dailyTable;
  document.getElementById("invoice-output").innerHTML=html;
  state.lastInvoiceHTML = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice</title><style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif;padding:24px;color:#111}
    h2{margin:0 0 4px 0}.subtle{color:#555} hr{border:0;border-top:1px solid #ddd;margin:12px 0}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
    th{background:#f6f6f6}
    img{height:40px}
  </style></head><body>${html}</body></html>`;
  document.getElementById("dl-invoice").disabled=document.getElementById("print-invoice").disabled=false;
}

function guardAdmin(){ if(state.currentUser?.role!=="Admin") alert("Admin only"); }

function renderClients(){
  const tbody=$("#clients-table tbody"); tbody.innerHTML="";
  for(const c of (state.data.clients||[])){
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${c.name}</td><td>${c.billing_email||""}</td><td>${c.terms||""}</td><td>${c.address||""}</td><td>${c.deleted?"Deleted":"Active"}</td><td>${c.deleted?'<button class="ghost sm restore-client">Restore</button>':'<button class="ghost sm del-client">Soft Delete</button>'}</td>`;
    tr.querySelector(".del-client")?.addEventListener("click",()=>{
      if(!confirm("Soft delete client?")) return;
      c.deleted=true; persist(); renderClients(); hydrateClients();
    });
    tr.querySelector(".restore-client")?.addEventListener("click",()=>{ c.deleted=false; persist(); renderClients(); hydrateClients(); });
    tbody.appendChild(tr);
  }
}
function addClient(){
  const name=prompt("Client name:"); if(!name) return;
  const billing=prompt("Billing email (optional):","ap@example.com");
  const terms=prompt("Terms (e.g., Net 15):","Net 15");
  const addr=prompt("Address (optional):","");
  state.data.clients.push({id:uid("c"), name, billing_email:billing||"", terms:terms||"", address:addr||"", deleted:false});
  persist(); renderClients(); hydrateClients();
}

function renderUsers(){
  const tbody=$("#users-table tbody"); tbody.innerHTML="";
  for(const u of (state.data.users||[])){
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td>${u.deleted?"Deleted":"Active"}</td><td>${u.deleted?"":"<button class='ghost sm del-user'>Soft Delete</button>"}</td>`;
    tr.querySelector(".del-user")?.addEventListener("click",()=>{ if(confirm("Soft delete user?")){ u.deleted=true; persist(); renderUsers(); } });
    tbody.appendChild(tr);
  }
}
function addUserWizard(){
  const name=prompt("User name:"); if(!name) return;
  const email=prompt("User email:"); if(!email) return;
  const role=prompt("Role (Admin/Manager/Consultant):","Consultant"); if(!role) return;
  const password="demo123";
  const user={id:uid("u"), name,email,role,password,deleted:false};
  const newRates=[];
  for(const c of activeClients()){
    let v=prompt(`Rate for ${name} × ${c.name} (USD/hr). Enter a number (required).`,"200");
    if(!v) return alert("Each client must have a rate.");
    const rate=parseFloat(v); if(!(rate>=0)) return alert("Invalid rate.");
    const eff=prompt(`Effective From for ${c.name} (YYYY-MM-DD):`,"2025-07-01"); if(!/^\d{4}-\d{2}-\d{2}$/.test(eff)) return alert("Invalid date.");
    newRates.push({id:uid("r"), consultant_email:email, client_id:c.id, client_name:c.name, rate:parseFloat(rate.toFixed(2)), effective_from:eff});
  }
  state.data.users.push(user); state.data.rates.push(...newRates); persist(); renderUsers(); renderRates(); alert("User created with required rate coverage.");
}

function renderRates(){
  const tbody=$("#rates-table tbody"); tbody.innerHTML="";
  const rows=(state.data.rates||[]).slice().sort((a,b)=> a.consultant_email.localeCompare(b.consultant_email) || a.client_name.localeCompare(b.client_name) || a.effective_from.localeCompare(b.effective_from));
  for(const r of rows){
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${r.consultant_email}</td><td>${r.client_name}</td><td>${r.rate.toFixed(2)}</td><td>${r.effective_from}</td><td><button class="ghost sm del-rate">Delete</button></td>`;
    tr.querySelector(".del-rate").addEventListener("click",()=>{ if(confirm("Delete this rate row?")){ const i=state.data.rates.indexOf(r); state.data.rates.splice(i,1); persist(); renderRates(); } });
    tbody.appendChild(tr);
  }
}
function addRateRow(){
  const consultant=prompt("Consultant email:"); if(!consultant) return;
  const cname=prompt("Client name (exact):"); if(!cname) return;
  const client=activeClients().find(c=>c.name===cname); if(!client) return alert("Client not found (use exact name).");
  const rate=parseFloat(prompt("Rate (USD/hr):","200")); if(!(rate>=0)) return alert("Invalid rate.");
  const eff=prompt("Effective From (YYYY-MM-DD):","2025-07-01"); if(!/^\d{4}-\d{2}-\d{2}$/.test(eff)) return alert("Invalid date.");
  state.data.rates.push({id:uid("r"), consultant_email:consultant, client_id:client.id, client_name:client.name, rate:parseFloat(rate.toFixed(2)), effective_from:eff});
  persist(); renderRates(); alert("Rate added.");
}

function downloadInvoice(){ const blob=new Blob([state.lastInvoiceHTML||""],{type:"text/html"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="invoice.html"; document.body.appendChild(a); a.click(); a.remove(); }
function printInvoice(){ const w=window.open("","_blank"); w.document.write(state.lastInvoiceHTML||""); w.document.close(); w.focus(); w.print(); }

function initEvents(){
  $("#login-btn").addEventListener("click", login);
  $("#logout").addEventListener("click", logout);
  $$("#nav button[data-view]").forEach(b=> b.addEventListener("click",(e)=> show(e.target.getAttribute("data-view")) ));
  $("#start-stop-btn").addEventListener("click", startStopTimer);
  $("#cancel-stop").addEventListener("click", cancelStop);
  $("#confirm-stop").addEventListener("click", saveStop);
  $("#man-add").addEventListener("click", addManualEntry);
  $("#invoice-client").addEventListener("change", validateInvoicePrecheck);
  $("#invoice-month").addEventListener("change", validateInvoicePrecheck);
  $("#gen-invoice").addEventListener("click", generateInvoice);
  $("#dl-invoice").addEventListener("click", downloadInvoice);
  $("#print-invoice").addEventListener("click", printInvoice);
  $("#add-client").addEventListener("click", addClient);
  $("#add-user").addEventListener("click", addUserWizard);
  $("#add-rate").addEventListener("click", addRateRow);
}
document.addEventListener("DOMContentLoaded", ()=>{ loadData(); initEvents(); show("login"); });
