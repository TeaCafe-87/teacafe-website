
  const el=id=>document.getElementById(id), fmt=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(Number(n)||0);
  const time=t=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t));
  let refresh=5000,lastData=null,selectedFrame='5m',hoverIndex=-1,chartState={candles:[],centers:[]};
  const frameNames={'5m':'5 分鐘','15m':'15 分鐘','1h':'1 小時'};
  function selectedCandles(data){return data?.['candles'+selectedFrame]||data?.candles||[]}
  let refreshTimer = 0;
  let loading = false;
  const marketError = document.querySelector('[data-market-error]');
  const marketErrorMessage = document.querySelector('[data-market-error-message]');
  document.querySelector('[data-market-retry]')?.addEventListener('click', () => { clearTimeout(refreshTimer); update(); });
  async function update() {
    if (loading) return;
    loading = true;
    clearTimeout(refreshTimer);
    try {
      const response = await fetch('/api/market', { cache: 'no-store' });
      if (!response.ok) throw new Error('market_unavailable');
      const data = await response.json();
      if (!data || !Number.isFinite(Number(data.price))) throw new Error('invalid_market_data');
      lastData = data;
      refresh = Math.max(5000, Number(data.refreshSeconds || 5) * 1000);
      el('name').textContent = data.serverName || '月映茶行';
      document.title = `${el('name').textContent} · 即時行情`;
      el('price').textContent = fmt(data.price);
      el('buys').textContent = fmt(data.buyShares24h);
      el('sells').textContent = fmt(data.sellShares24h);
      el('count').textContent = fmt(data.tradeCount24h);
      el('reserveStatus').textContent = data.reserveStatus || '—';
      el('reserveStatus').className = data.reserveStatus === '充足' ? 'buy' : data.reserveStatus === '偏低' ? 'sell' : '';
      el('reserve').textContent = fmt(data.reserve);
      el('reserveRatio').textContent = fmt(data.reserveRatio);
      el('status').textContent = `行情更新 ${time(data.generatedAt)}`;
      marketError.hidden = true;
      renderPressure(data);
      renderTrades(Array.isArray(data.trades) ? data.trades : []);
      el('event').textContent = data.event ? `${data.event.title}｜${data.event.description}` : '目前沒有掌櫃事件';
      el('kdText').textContent = `K ${fmt(data.k)}／D ${fmt(data.d)}`;
      draw(data);
    } catch {
      el('status').textContent = '行情暫時離線';
      marketErrorMessage.textContent = lastData ? '暫時無法取得即時行情，已顯示最後一次成功讀取的資料；你可以稍後重試。' : '暫時無法取得即時行情，請稍後重試。';
      marketError.hidden = false;
      if (!lastData) el('trades').innerHTML = '<tr><td class="empty" colspan="6">行情暫時無法讀取</td></tr>';
    } finally {
      loading = false;
      refreshTimer = setTimeout(update, refresh);
    }
  }
  function renderPressure(d){const b=Number(d.buyShares24h),s=Number(d.sellShares24h),total=b+s,p=total?Math.round(b/total*100):50;el('bar').style.width=p+'%';el('buyPct').textContent=p+'%';el('sellPct').textContent=(100-p)+'%';const dir=el('direction');dir.className='';if(!total)dir.textContent='等待成交';else if(b>s){dir.textContent='買盤較強';dir.className='buy'}else if(s>b){dir.textContent='賣盤較強';dir.className='sell'}else dir.textContent='買賣平衡'}
  function renderTrades(rows){const body=el('trades');body.textContent='';if(!rows.length){body.innerHTML='<tr><td class="empty" colspan="6">目前還沒有成交紀錄</td></tr>';return}for(const x of rows){const tr=document.createElement('tr');const cells=[time(x.time),x.player,x.side==='BUY'?'買入':'賣出',fmt(x.shares)+' 股',fmt(x.price)+' 咖豆',fmt(x.settledAmount)+' 咖豆'];cells.forEach((v,i)=>{const td=document.createElement('td');if(i===2){const span=document.createElement('span');span.className='badge '+(x.side==='BUY'?'buy':'sell');span.textContent=v;td.append(span)}else td.textContent=v;tr.append(td)});body.append(tr)}}
  function draw(data){const candles=(selectedCandles(data).length?selectedCandles(data):[{open:Number(data?.price)||100,high:Number(data?.price)||100,low:Number(data?.price)||100,close:Number(data?.price)||100,volume:0}]);const currentPrice=Number(data?.price)||100,c=el('chart'),rect=c.getBoundingClientRect(),dpr=devicePixelRatio||1;c.width=Math.max(1,rect.width*dpr);c.height=Math.max(1,rect.height*dpr);const x=c.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);const w=rect.width,h=rect.height,pad=30,top=pad,priceBottom=Math.floor(h*.70),volumeTop=priceBottom+22,bottom=h-pad;x.clearRect(0,0,w,h);let min=Math.min(...candles.map(v=>Number(v.low))),max=Math.max(...candles.map(v=>Number(v.high)));if(min===max){min-=1;max+=1}const range=max-min,padValue=range*.08;min-=padValue;max+=padValue;const px=i=>pad+(w-pad*2)*(candles.length===1?.5:i/(candles.length-1)),py=v=>priceBottom-(Number(v)-min)/(max-min)*(priceBottom-top),step=(w-pad*2)/Math.max(1,candles.length),body=Math.max(3,Math.min(12,step*.72)),volMax=Math.max(1,...candles.map(v=>Number(v.volume)||0));for(let i=0;i<5;i++){const y=top+(priceBottom-top)*i/4;x.strokeStyle='#343a3f';x.lineWidth=1;x.beginPath();x.moveTo(pad,y);x.lineTo(w-pad,y);x.stroke()}x.strokeStyle='#343a3f';x.beginPath();x.moveTo(pad,volumeTop-8);x.lineTo(w-pad,volumeTop-8);x.stroke();x.fillStyle='#aab1b7';x.font='12px system-ui';x.fillText('成交量',pad, h-8);chartState={candles,centers:candles.map((_,i)=>px(i)),rect,py};candles.forEach((v,i)=>{const cx=px(i),cmp=Number(v.close)-Number(v.open),color=cmp>0?'#67d391':cmp<0?'#ff7d7d':'#aab1b7';const vh=Math.max(1,(Number(v.volume)||0)/volMax*(bottom-volumeTop));x.fillStyle=color+'99';x.fillRect(cx-body/2,bottom-vh,body,vh);x.strokeStyle=color;x.lineWidth=cmp===0?1.5:2;x.beginPath();x.moveTo(cx,py(v.high));x.lineTo(cx,py(v.low));x.stroke();const y=Math.min(py(v.open),py(v.close)),bh=Math.max(2,Math.abs(py(v.close)-py(v.open)));x.fillStyle=color;x.fillRect(cx-body/2,y,body,bh);x.strokeStyle='#4d3527aa';x.lineWidth=1;x.strokeRect(cx-body/2,y,body,bh)});const period=5;x.strokeStyle='#e7bd66';x.lineWidth=2.5;x.lineJoin='round';x.beginPath();candles.forEach((v,i)=>{const from=Math.max(0,i-period+1),avg=candles.slice(from,i+1).reduce((sum,q)=>sum+Number(q.close),0)/(i-from+1);i?x.lineTo(px(i),py(avg)):x.moveTo(px(i),py(avg))});x.stroke();x.fillStyle='#e7bd66';x.fillText('MA5 · '+frameNames[selectedFrame],w-pad-95,pad-8);x.fillStyle='#aab1b7';x.fillText('高 '+fmt(max),4,pad+4);x.fillText('低 '+fmt(min),4,priceBottom+4);if(hoverIndex>=0&&hoverIndex<candles.length){const hx=px(hoverIndex);x.strokeStyle='#e7bd6699';x.setLineDash([4,4]);x.beginPath();x.moveTo(hx,top);x.lineTo(hx,bottom);x.stroke();x.setLineDash([])}}
  function showTip(index,clientX,clientY){const v=chartState.candles[index],tip=el('chartTip');if(!v){tip.style.display='none';return}tip.innerHTML='<strong>'+frameNames[selectedFrame]+' · '+time(v.time||v.bucket)+'</strong><br>開 '+fmt(v.open)+'　高 '+fmt(v.high)+'<br>低 '+fmt(v.low)+'　收 '+fmt(v.close)+'<br>成交量 '+fmt(v.volume)+' 股';const r=el('chart').getBoundingClientRect();tip.style.left=Math.min(r.width-190,Math.max(8,clientX-r.left+14))+'px';tip.style.top=Math.min(r.height-112,Math.max(8,clientY-r.top-18))+'px';tip.style.display='block'}
  el('chart').addEventListener('mousemove',e=>{if(!chartState.centers.length)return;const r=el('chart').getBoundingClientRect(),x=e.clientX-r.left;let next=0,best=Infinity;chartState.centers.forEach((cx,i)=>{const dist=Math.abs(cx-x);if(dist<best){best=dist;next=i}});hoverIndex=next;draw(lastData);showTip(next,e.clientX,e.clientY)});el('chart').addEventListener('mouseleave',()=>{hoverIndex=-1;el('chartTip').style.display='none';if(lastData)draw(lastData)});document.querySelectorAll('.range-btn').forEach(btn=>btn.addEventListener('click',()=>{selectedFrame=btn.dataset.frame;hoverIndex=-1;document.querySelectorAll('.range-btn').forEach(x=>x.classList.toggle('active',x===btn));if(lastData)draw(lastData)}));addEventListener('resize',()=>{if(lastData)draw(lastData)});update();
