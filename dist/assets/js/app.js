const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>[...p.querySelectorAll(s)];
const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();
const nav=[["index.html","首頁"],["guide.html","遊玩指南"],["wiki.html","Wiki"],["gallery.html","玩家相冊"],["news.html","公告"],["rules.html","規則"],["pass.html","通行證"]];
const header=document.querySelector("[data-header]");
if(header)header.innerHTML='<header class="topbar '+(page==="index.html"?"home-topbar topbar-hidden":"")+'"><a class="brand" href="/"><span class="brand-block"></span><span><b>茶咖暖居</b><small>TEACAFE</small></span></a><nav class="topnav">'+nav.map(([u,n])=>'<a class="mc-nav '+(page===u?"active":"")+'" href="/'+u+'">'+n+'</a>').join("")+'</nav><div class="top-tools"><span class="server-version">JAVA 26.2</span><button class="discord-button" data-auth>登入 Discord</button><button class="mc-nav settings-button" data-settings aria-label="設定">⚙</button><button class="mc-nav mobile-menu" data-mobile>☰</button></div></header>';
const footer=document.querySelector("[data-footer]");
if(footer)footer.innerHTML='<footer class="site-footer"><a class="brand" href="/"><span class="brand-block"></span><span><b>茶咖暖居</b><small>TEACAFE</small></span></a><nav><a href="/guide.html">指南</a><a href="/wiki.html">Wiki</a><a href="/rules.html">規則</a></nav></footer>';
document.head.insertAdjacentHTML("beforeend",'<link rel="stylesheet" href="/assets/css/effects.css">');
document.body.insertAdjacentHTML("beforeend",`<div class="toast" id="toast" role="status"></div>
<dialog id="settings"><form method="dialog"><div class="mc-menu-screen">
  <h2 class="mc-menu-title">遊戲選單</h2><p class="mc-menu-subtitle">TeaCafe · 茶咖暖居</p>
  <div class="mc-menu-grid">
    <button type="button" class="mc-menu-button wide green" data-settings-resume>返回網站</button>
    <button type="button" class="mc-menu-button" data-settings-sound>音樂與音效</button>
    <button type="button" class="mc-menu-button" data-settings-interface>介面設定</button>
    <button type="button" class="mc-menu-button discord" data-settings-discord>Discord</button>
    <button type="button" class="mc-menu-button" data-settings-home>回到首頁</button>
  </div>
  <section class="mc-settings-panel" id="sound-panel">
    <h3>音樂與音效</h3>
    <div class="mc-settings-row"><div><b>背景音樂</b><small>TeaCafe 環境音</small></div><button type="button" class="mc-menu-button mc-settings-toggle" id="music-switch">關閉</button><span></span><input id="music-volume" type="range" min="0" max="100" value="20"><span class="mc-settings-value" id="music-value">20%</span></div>
    <div class="mc-settings-row"><div><b>介面音效</b><small>按鈕與選單音效</small></div><button type="button" class="mc-menu-button mc-settings-toggle" id="sound-switch">開啟</button><span></span><input id="sound-volume" type="range" min="0" max="100" value="45"><span class="mc-settings-value" id="sound-value">45%</span></div>
    <button type="button" class="mc-menu-button wide" data-settings-back>完成</button>
  </section>
  <section class="mc-settings-panel" id="interface-panel"><h3>介面設定</h3><p>介面維持 Minecraft 風格與方塊化顯示。</p><button type="button" class="mc-menu-button wide" data-settings-back>完成</button></section>
</div></form></dialog>
<dialog id="auth" class="auth-dialog"><form method="dialog"><button class="dialog-close">×</button><p class="kicker">Discord 帳號</p><div id="auth-content"></div></form></dialog>
<div class="chest-transition" id="chest-transition" aria-hidden="true"><div class="chest-wrap"><div class="chest-lid"></div><div class="chest-base"></div><div class="chest-lock"></div></div></div>`);
const toast=msg=>{const el=$("#toast");el.textContent=msg;el.classList.add("show");clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove("show"),2100)};
let ctx,musicOn=false,soundOn=localStorage.getItem("teacafe-sound-on")!=="false",musicNodes=[];
let musicVol=Number(localStorage.getItem("teacafe-music-vol")||20),soundVol=Number(localStorage.getItem("teacafe-sound-vol")||45);
const ensureCtx=()=>ctx??=new(window.AudioContext||window.webkitAudioContext)();
function clickSound(){if(!soundOn||soundVol===0)return;ensureCtx();const o=ctx.createOscillator(),g=ctx.createGain();o.type="square";o.frequency.setValueAtTime(180,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(105,ctx.currentTime+.055);g.gain.setValueAtTime(.055*soundVol/100,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.07);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+.075)}
function startMusic(){ensureCtx();stopMusic();[130.81,164.81,196].forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=i?"sine":"triangle";o.frequency.value=f;g.gain.value=.022*(musicVol/100)/(i+1);o.connect(g).connect(ctx.destination);o.start();musicNodes.push({o,g,i})});musicOn=true;$("#music-switch").textContent="開啟"}
function stopMusic(){musicNodes.forEach(n=>{try{n.o.stop()}catch{}});musicNodes=[];musicOn=false;if($("#music-switch"))$("#music-switch").textContent="關閉"}
document.addEventListener("click",e=>{if(e.target.closest("button,a"))clickSound()});
const settings=$("#settings"),auth=$("#auth");
$("[data-settings]")?.addEventListener("click",()=>settings.showModal());
$$("[data-mobile]").forEach(x=>x.addEventListener("click",()=>{const nav=$(".topnav");nav.classList.toggle("mobile-open")}));
const closeSettingPanels=()=>$$('.mc-settings-panel').forEach(p=>p.classList.remove('open'));
$('[data-settings-resume]')?.addEventListener('click',()=>settings.close());
$('[data-settings-sound]')?.addEventListener('click',()=>{closeSettingPanels();$('#sound-panel').classList.add('open')});
$('[data-settings-interface]')?.addEventListener('click',()=>{closeSettingPanels();$('#interface-panel').classList.add('open')});
$$('[data-settings-back]').forEach(b=>b.addEventListener('click',closeSettingPanels));
$('[data-settings-home]')?.addEventListener('click',()=>location.href='/');
$('[data-settings-discord]')?.addEventListener('click',()=>{settings.close();const b=$('[data-auth]');if(b)b.click()});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;e.preventDefault();if(settings.open){closeSettingPanels();settings.close();return}if(auth?.open){auth.close();return}settings.showModal()},{capture:true});
$("#music-switch").onclick=()=>musicOn?stopMusic():startMusic();
$("#sound-switch").onclick=e=>{soundOn=!soundOn;e.currentTarget.textContent=soundOn?"開啟":"關閉";localStorage.setItem("teacafe-sound-on",soundOn)};
$("#music-volume").value=musicVol;$("#sound-volume").value=soundVol;$("#sound-switch").textContent=soundOn?"開啟":"關閉";$("#music-switch").textContent=musicOn?"開啟":"關閉";$("#music-value").textContent=musicVol+"%";$("#sound-value").textContent=soundVol+"%";
$("#music-volume").oninput=e=>{musicVol=Number(e.target.value);$("#music-value").textContent=musicVol+"%";localStorage.setItem("teacafe-music-vol",musicVol);musicNodes.forEach(n=>n.g.gain.value=.022*(musicVol/100)/(n.i+1))};
$("#sound-volume").oninput=e=>{soundVol=Number(e.target.value);$("#sound-value").textContent=soundVol+"%";localStorage.setItem("teacafe-sound-vol",soundVol)};
$$("[data-copy]").forEach(b=>b.onclick=async()=>{const value=b.dataset.copy==="SERVER_IP"?"teacafe.xyz":b.dataset.copy;try{await navigator.clipboard.writeText(value);toast(value+" 已複製")}catch{toast(value)}});

async function loadServerStatus(){
  const status=$("[data-server-status]"); if(!status)return;
  try{
    const r=await fetch("/api/server/status",{headers:{Accept:"application/json"}}); if(!r.ok)throw new Error("status");
    const data=await r.json();
    const addressEl=$("[data-server-address]"); if(addressEl)addressEl.textContent=data.address||"teacafe.xyz";
    status.classList.remove("status-loading","status-offline");
    if(data.online){
      status.textContent="● 線上"; status.classList.add("status-online");
      $("[data-server-players]").textContent=`${data.players.online} / ${data.players.max}`;
      $("[data-server-version]").textContent=data.version||"未知";
      const panel=$("[data-online-player-panel]"),heads=$("[data-online-player-heads]");
      const players=Array.isArray(data.players?.list)?data.players.list:[];
      if(panel&&heads){
        heads.replaceChildren(...players.map(player=>{
          const img=document.createElement("img");
          img.className="online-player-head";
          img.src=`https://mc-heads.net/avatar/${encodeURIComponent(player.uuid)}/40`;
          img.alt="";
          img.width=40; img.height=40; img.loading="lazy"; img.decoding="async";
          return img;
        }));
        panel.hidden=players.length===0;
      }
    }else{
      status.textContent="● 離線"; status.classList.add("status-offline");
      $("[data-server-players]").textContent="0 / 0";
      $("[data-server-version]").textContent="26.2";
      const panel=$("[data-online-player-panel]"),heads=$("[data-online-player-heads]");
      if(heads)heads.replaceChildren();
      if(panel)panel.hidden=true;
    }
  }catch{
    status.textContent="狀態無法取得"; status.classList.remove("status-loading"); status.classList.add("status-offline");
  }
}
loadServerStatus();

// TeaCafe server age. The server opened on 2026-08-07 in Taiwan time.
const TEACAFE_STARTED_AT=Date.parse("2026-08-07T00:00:00+08:00");
function updateServerUptime(){
  const el=$("[data-server-uptime]"); if(!el)return;
  const total=Math.max(0,Math.floor((Date.now()-TEACAFE_STARTED_AT)/1000));
  const days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
  el.textContent=`${days}天 ${String(hours).padStart(2,"0")}小時 ${String(minutes).padStart(2,"0")}分鐘 ${String(seconds).padStart(2,"0")}秒`;
}
updateServerUptime();
setInterval(updateServerUptime,1000);

let authState={authenticated:false};
function authName(user){return user?.global_name||user?.username||"Discord 使用者"}
async function loadAuth(){
  try{const r=await fetch("/api/auth/me",{headers:{Accept:"application/json"}});authState=r.ok?await r.json():{authenticated:false}}catch{authState={authenticated:false}}
  $$("[data-auth]").forEach(b=>b.textContent=authState.authenticated?authName(authState.user):"登入 Discord");
}
loadAuth();
async function openAuth(e){
  e?.preventDefault();
  if(!authState.authenticated){location.href="/api/auth/login?return="+encodeURIComponent(location.pathname+location.search);return}
  const u=authState.user,content=$("#auth-content");content.replaceChildren();
  if(u.avatar_url){const avatar=document.createElement("img");avatar.className="discord-avatar";avatar.src=u.avatar_url;avatar.alt="";content.append(avatar)}
  const title=document.createElement("h2");title.textContent=authName(u);content.append(title);
  const handle=document.createElement("p");handle.textContent="@"+u.username;content.append(handle);
  const info=document.createElement("div");info.className="auth-list";info.textContent="✓ Discord 已登入";content.append(info);
  const logout=document.createElement("button");logout.type="button";logout.className="mc-button";logout.id="logout-button";logout.textContent="登出";content.append(logout);
  auth.showModal();
  logout.onclick=async()=>{await fetch("/api/auth/logout",{method:"POST"});location.reload()};
}
$$("[data-auth]").forEach(x=>x.addEventListener("click",openAuth));
$$(".auth-required").forEach(x=>x.addEventListener("click",e=>{e.preventDefault();if(!authState.authenticated){openAuth(e);return}toast("目前尚未開放購買")}));

const topbar=$(".topbar");
if(page==="index.html"&&topbar){
  const hotzone=$("[data-topbar-hotzone]");
  let hideTopbarTimer;
  const showTopbar=()=>{clearTimeout(hideTopbarTimer);topbar.classList.remove("topbar-hidden")};
  const hideTopbar=()=>{clearTimeout(hideTopbarTimer);hideTopbarTimer=setTimeout(()=>topbar.classList.add("topbar-hidden"),180)};
  hotzone?.addEventListener("mouseenter",showTopbar);
  hotzone?.addEventListener("pointerdown",showTopbar);
  topbar.addEventListener("mouseenter",showTopbar);
  topbar.addEventListener("mouseleave",hideTopbar);
  document.addEventListener("mousemove",e=>{if(e.clientY<=6)showTopbar()},{passive:true});
}else{
  let lastScroll=window.scrollY;
  window.addEventListener("scroll",()=>{const y=window.scrollY;topbar?.classList.toggle("topbar-hidden",y>lastScroll&&y>120);lastScroll=y},{passive:true});
  document.addEventListener("mousemove",e=>{if(e.clientY<70)topbar?.classList.remove("topbar-hidden")},{passive:true});
}

// Minecraft chest transition for internal page navigation.
const chest=$('#chest-transition');
document.addEventListener('click',e=>{
  const link=e.target.closest('a[href]');
  if(!link||e.defaultPrevented||e.button>0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  const href=link.getAttribute('href');
  if(!href||href.startsWith('#')||href.startsWith('http')||href.startsWith('mailto:')||link.hasAttribute('download'))return;
  const target=new URL(link.href,location.href);
  if(target.origin!==location.origin)return;
  e.preventDefault();
  if(!chest){location.href=target.href;return}
  chest.classList.add('active');
  setTimeout(()=>{location.href=target.href},420);
});
const search=$("#wiki-search");if(search)search.oninput=e=>{const q=e.target.value.trim().toLowerCase();$$(".wiki-card").forEach(c=>c.hidden=!!(q&&!c.dataset.keywords.toLowerCase().includes(q)&&!c.textContent.toLowerCase().includes(q)))};

if(page==="guide.html"){
  const bag=$$(".command-table code").find(node=>node.textContent.trim()==="/tb");
  if(bag){const link=document.createElement("a");link.href="/wiki.html#shards";link.textContent="/tb → 升級碎片";bag.replaceWith(link)}
}
if(page==="guide.html"||page==="wiki.html"){
  const panel=$(".content-panel");let chapter=null;
  if(panel){[...panel.childNodes].forEach(node=>{if(node.nodeType===1&&node.matches("h2")){chapter=document.createElement("section");chapter.className="chapter-screen snap-screen";panel.append(chapter)}if(chapter)chapter.append(node)});}
}

// Gallery: horizontal rail with wheel, drag, keys, arrows and an honest progress marker.
const galleryRail=$("[data-gallery-rail]");
if(galleryRail){
  const slides=$$(".gallery-slide",galleryRail),current=$("[data-gallery-current]"),total=$("[data-gallery-total]"),progress=$("[data-gallery-progress]"),prev=$("[data-gallery-prev]"),next=$("[data-gallery-next]");
  $$(".gallery-shot[data-photo]",galleryRail).forEach(holder=>{const img=new Image();img.alt=holder.querySelector("span")?.textContent||"茶咖暖居遊戲畫面";img.loading="lazy";img.decoding="async";img.onload=()=>holder.append(img);img.src=holder.dataset.photo});
  let activeIndex=0,dragStartX=0,dragStartScroll=0,dragging=false;
  if(total)total.textContent=String(slides.length).padStart(2,"0");
  const update=()=>{const midpoint=galleryRail.scrollLeft+galleryRail.clientWidth*.35;let best=0,dist=Infinity;slides.forEach((s,i)=>{const d=Math.abs(s.offsetLeft-galleryRail.offsetLeft-midpoint);if(d<dist){dist=d;best=i}});activeIndex=best;if(current)current.textContent=String(best+1).padStart(2,"0");if(progress)progress.style.width=((best+1)/slides.length*100)+"%";if(prev)prev.disabled=best===0;if(next)next.disabled=best===slides.length-1};
  const goTo=index=>{const slide=slides[Math.max(0,Math.min(slides.length-1,index))];if(slide)galleryRail.scrollTo({left:slide.offsetLeft-galleryRail.offsetLeft,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"})};
  prev?.addEventListener("click",()=>goTo(activeIndex-1));next?.addEventListener("click",()=>goTo(activeIndex+1));
  galleryRail.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);
  galleryRail.addEventListener("wheel",e=>{if(Math.abs(e.deltaY)<=Math.abs(e.deltaX))return;const max=galleryRail.scrollWidth-galleryRail.clientWidth;const canMove=e.deltaY>0?galleryRail.scrollLeft<max-2:galleryRail.scrollLeft>2;if(canMove){e.preventDefault();galleryRail.scrollLeft+=e.deltaY}},{passive:false});
  galleryRail.addEventListener("pointerdown",e=>{if(e.pointerType==="touch")return;dragging=true;dragStartX=e.clientX;dragStartScroll=galleryRail.scrollLeft;galleryRail.classList.add("dragging");galleryRail.setPointerCapture(e.pointerId)});
  galleryRail.addEventListener("pointermove",e=>{if(dragging)galleryRail.scrollLeft=dragStartScroll-(e.clientX-dragStartX)});
  const stopDrag=()=>{dragging=false;galleryRail.classList.remove("dragging")};galleryRail.addEventListener("pointerup",stopDrag);galleryRail.addEventListener("pointercancel",stopDrag);
  galleryRail.addEventListener("keydown",e=>{if(e.key==="ArrowRight"){e.preventDefault();goTo(activeIndex+1)}if(e.key==="ArrowLeft"){e.preventDefault();goTo(activeIndex-1)}});
  update();
}

// Keep the rule index pressed on the section closest to the reading position.
const ruleSections=$$("[data-rule-section]"),ruleLinks=$$("[data-rule-link]");
if(ruleSections.length){
  const updateRuleIndex=()=>{const target=window.innerHeight*.32;let active=ruleSections[0],distance=Infinity;ruleSections.forEach(section=>{const rect=section.getBoundingClientRect();const d=rect.top<=target&&rect.bottom>=target?0:Math.min(Math.abs(rect.top-target),Math.abs(rect.bottom-target));if(d<distance){distance=d;active=section}});ruleLinks.forEach(link=>{const selected=link.dataset.ruleLink===active.id;link.classList.toggle("scroll-active",selected);if(selected)link.setAttribute("aria-current","location");else link.removeAttribute("aria-current")})};
  window.addEventListener("scroll",updateRuleIndex,{passive:true});window.addEventListener("resize",updateRuleIndex);updateRuleIndex();
}
