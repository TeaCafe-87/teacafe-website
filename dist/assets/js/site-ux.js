(() => {
  const style=document.createElement('style');
  style.textContent=`
  .topbar .top-tools :is(.discord-invite,.topbar-music-toggle,.settings-button){width:42px!important;height:42px!important;min-width:42px;padding:9px!important;display:grid;place-items:center;border:1px solid #d8dac454!important;border-radius:10px!important;background:#ffffff0d!important;color:#eeeadd!important;box-shadow:none!important}
  .top-tools .discord-invite img{width:22px;height:22px}.top-tools :is(a,button):hover{background:#ffffff20!important}
  .site-footer{position:relative!important;display:flex!important;opacity:1!important;visibility:visible!important;min-height:160px;z-index:3!important;transform:none!important;flex-wrap:wrap;gap:24px}
  .back-to-top{border:1px solid #a5ae98;border-radius:50%;width:48px;height:48px;font-size:24px;background:#e8eadd;color:#233322;cursor:pointer}
  .home-page-main[data-scene-story]>section{min-height:100svh!important;scroll-snap-align:start;scroll-snap-stop:always}
  .home-page .scene-panel{position:relative!important;top:auto!important}.home-page [data-footer]{scroll-snap-align:end;min-height:160px;opacity:1!important;visibility:visible!important;transform:none!important;display:block!important}
  .home-page .home-hero-content{opacity:1!important;transform:none!important;filter:none!important}
  .home-page .home-hero-content h1{clip-path:none!important;animation:none!important;opacity:1!important;transform:none!important}
  .modern-more{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);border:0;border-radius:999px;padding:17px 32px;background:#f5f4e9;color:#24372d;font-family:inherit;font-size:15px;font-weight:600;letter-spacing:.12em;box-shadow:0 8px 24px #0002;cursor:pointer;z-index:4}
  .transition-tip{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:3000;padding:14px 20px;max-width:90vw;border:1px solid #c9cfbd;border-radius:14px;background:#f3f4e9;color:#243426;box-shadow:0 8px 25px #0003;animation:tip-rise .5s ease-out}
  @keyframes tip-rise{from{opacity:0;translate:0 20px}to{opacity:1;translate:0 0}}
  .setting-hint{animation:setting-breathe 1s ease-in-out 3}@keyframes setting-breathe{50%{outline:3px solid #9fb393;outline-offset:5px}}
  @media(prefers-reduced-motion:reduce){.setting-hint,.transition-tip{animation:none}}
  `;
  document.head.append(style);
  const footer=document.querySelector('.site-footer');
  const brand=footer?.querySelector('.brand');
  if(brand){const button=document.createElement('button');button.className='back-to-top';button.textContent='↑';button.setAttribute('aria-label','回到頁面頂端');button.onclick=()=>scrollTo({top:0,behavior:'smooth'});brand.replaceWith(button);}
  if(Number(sessionStorage.getItem('tea-navigation-count')||0)>=2&&!sessionStorage.getItem('tea-tip-shown')){
    sessionStorage.setItem('tea-tip-shown','1');
    const tip=document.createElement('button');tip.className='transition-tip';tip.textContent='不想再看到跳轉動畫嗎？點我設定';
    tip.onclick=()=>{const dialog=document.querySelector('#settings');if(!dialog.open)dialog.showModal();document.querySelectorAll('.mc-settings-panel').forEach(x=>x.classList.remove('open'));document.querySelector('#interface-panel')?.classList.add('open');const button=document.querySelector('#intro-switch');button?.classList.add('setting-hint');button?.focus();tip.remove();};
    document.body.append(tip);
  }
  if(!document.body.classList.contains('home-page'))return;
  document.documentElement.style.scrollSnapType='y mandatory';
  const newsHost=document.querySelector('.home-news-layout');
  if(newsHost)fetch('/api/news').then(r=>r.ok?r.json():null).then(data=>{
    if(!data?.items?.length)return;
    const list=document.createElement('div');list.className='home-live-news';
    for(const item of data.items.slice(0,3)){const article=document.createElement('article');const title=document.createElement('h3');title.textContent=item.title;const body=document.createElement('p');body.textContent=item.body.slice(0,240);article.append(title,body);if(item.discord_url?.startsWith('https://discord.com/')){const link=document.createElement('a');link.href=item.discord_url;link.textContent='在 Discord 閱讀 →';link.target='_blank';link.rel='noopener noreferrer';article.append(link);}list.append(article);}newsHost.append(list);
  }).catch(()=>{});
  const hero=document.querySelector('#home');
  const more=document.createElement('button');more.className='modern-more';more.textContent='MORE ↓';more.setAttribute('aria-label','查看伺服器資訊');
  more.onclick=()=>document.querySelector('.server-overview-inner')?.scrollIntoView({behavior:'smooth',block:'start'});
  hero.append(more);
  // Expanding radial refraction starts at the MORE button and affects only the backdrop.
  function ripple(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const backdrop=document.querySelector('[data-scene-backdrop]');if(!backdrop)return;
    const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('width','0');svg.setAttribute('height','0');svg.style.position='absolute';
    svg.innerHTML='<filter id="more-water" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feImage width="100%" height="100%" preserveAspectRatio="none" result="wave"/><feDisplacementMap in="SourceGraphic" in2="wave" scale="24" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.append(svg);const image=svg.querySelector('feImage');const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d');const data=ctx.createImageData(96,96);const rect=more.getBoundingClientRect();const cx=(rect.left+rect.width/2)/innerWidth,cy=(rect.top+rect.height/2)/innerHeight;const start=performance.now();backdrop.style.filter='url(#more-water)';
    function tick(now){const t=(now-start)/1600;if(t>=1){backdrop.style.filter='';svg.remove();return;}for(let y=0;y<96;y++)for(let x=0;x<96;x++){const dx=x/96-cx,dy=y/96-cy,r=Math.hypot(dx,dy)||.001;const a=Math.sin((r-t)*35)*Math.exp(-Math.pow((r-t*.9)/.14,2))*(1-t)*70;const i=(y*96+x)*4;data.data[i]=128+dx/r*a;data.data[i+1]=128+dy/r*a;data.data[i+2]=128;data.data[i+3]=255;}ctx.putImageData(data,0,0);image.setAttribute('href',canvas.toDataURL());requestAnimationFrame(tick);}requestAnimationFrame(tick);
  }
  if(window.teaIntroResult)ripple();else addEventListener('teacafe-intro-finished',ripple,{once:true});
})();
