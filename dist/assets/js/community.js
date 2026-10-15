(() => {
  'use strict';
  const kind = document.body.classList.contains('gallery-page') ? 'gallery' : 'forum';
  const $ = (selector, root = document) => root.querySelector(selector);
  const feed = $('[data-community-feed]');
  if (!feed) return;
  const status = $('[data-community-status]');
  const dialog = $('[data-community-dialog]');
  const form = $('[data-community-form]');
  const fileInput = form.elements.media;
  const previews = $('[data-community-previews]');
  const fileSummary = $('[data-community-file-summary]');
  const feedback = $('[data-community-feedback]');
  const more = $('[data-community-more]');
  const MAX_BYTES = 20 * 1024 * 1024;
  const TYPES = new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']);
  const categories = [
    ['all','全部'], ['general','閒聊交流'], ['help','新手提問'],
    ['professions','職業與料理'], ['homes','家園與建築'],
    ['economy','交易與經濟'], ['pets','寵物與冒險'],
    ['pass','季節通行證'], ['suggestions','玩法建議']
  ];
  const categoryName = id => categories.find(x => x[0] === id)?.[1] || '玩家交流';
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const say = text => window.dispatchEvent(new CustomEvent('teacafe-toast',{detail:text}));
  const fmt = value => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(+date) ? '' : date.toLocaleString('zh-TW',{dateStyle:'medium',timeStyle:'short'});
  };
  let configured = false;
  let cursor = null;
  let posts = [];
  let activeCategory = new URL(location.href).searchParams.get('category') || 'all';
  let search = '';
  let objectUrls = [];

  async function auth() {
    const state = await window.TeaCafeAuth?.ready;
    if (!state?.authenticated) {
      location.href = '/api/auth/login?return=' + encodeURIComponent(location.pathname + location.search);
      return false;
    }
    return true;
  }
  function cleanupPreviews() {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls = [];
    previews.replaceChildren();
  }
  function selectedFiles() {
    const files = [...fileInput.files];
    const total = files.reduce((sum,file) => sum + file.size,0);
    const valid = total <= MAX_BYTES && files.every(file => TYPES.has(file.type));
    fileSummary.textContent = `${files.length} 個檔案 · ${(total / 1048576).toFixed(1)} / 20 MiB`;
    feedback.textContent = !valid ? (total > MAX_BYTES ? '檔案總大小超過 20 MiB。' : '檔案格式不支援。') : '';
    return valid;
  }
  fileInput.addEventListener('change', () => {
    cleanupPreviews();
    selectedFiles();
    for (const file of fileInput.files) {
      if (!TYPES.has(file.type)) continue;
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const figure = el('figure','community-preview');
      const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
      media.src = url;
      if (media.tagName === 'VIDEO') { media.controls = true; media.preload = 'metadata'; }
      else media.alt = file.name;
      figure.append(media,el('figcaption','',file.name));
      previews.append(figure);
    }
  });
  dialog.addEventListener('close',cleanupPreviews);
  document.querySelectorAll('[data-community-close]').forEach(button => button.addEventListener('click',()=>dialog.close()));
  $('[data-community-create]')?.addEventListener('click',async()=>{
    if (!await auth()) return;
    if (!configured) { say('資料庫與媒體儲存空間尚未連接'); return; }
    form.reset(); feedback.textContent=''; fileSummary.textContent=''; cleanupPreviews();
    if (kind === 'forum') form.elements.category.value = activeCategory === 'all' ? 'general' : activeCategory;
    dialog.showModal();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!await auth() || !selectedFiles()) return;
    if (kind === 'gallery' && !fileInput.files.length) { feedback.textContent = '相冊貼文至少需要一張圖片或一段影片。'; return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true; feedback.textContent='上傳中…';
    const data = new FormData(form);
    data.set('kind',kind);
    try {
      const response = await fetch('/api/community/posts',{method:'POST',body:data});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === 'files_too_large' ? '檔案總大小超過 20 MiB。' : result.error === 'post_rate_limited' ? '請稍等 30 秒再發布。' : '發布失敗，請稍後再試。');
      dialog.close(); form.reset(); await load(true); say('貼文已發布');
    } catch (error) { feedback.textContent=error.message; }
    finally { submit.disabled=false; }
  });

  function mediaPanel(post) {
    const items = Array.isArray(post.media) ? post.media : post.image_url ? [{url:post.image_url,type:'image/webp'}] : [];
    if (!items.length) return null;
    const shell = el('div','post-media-shell');
    const stage = el('div','post-media-stage');
    const previous = el('button','post-media-arrow','‹'); previous.type='button'; previous.setAttribute('aria-label','上一個媒體');
    const next = el('button','post-media-arrow','›'); next.type='button'; next.setAttribute('aria-label','下一個媒體');
    const counter = el('span','post-media-count');
    let index=0;
    function show() {
      const item=items[index];
      const media=document.createElement(item.type?.startsWith('video/')?'video':'img');
      media.src=item.url; media.className='post-media';
      if (media.tagName==='VIDEO') { media.controls=true; media.preload='metadata'; }
      else { media.alt=post.title || '玩家上傳的圖片'; media.loading='lazy'; }
      stage.replaceChildren(media);
      counter.textContent=`${index+1} / ${items.length}`;
      previous.hidden=next.hidden=items.length<2;
    }
    previous.addEventListener('click',()=>{index=(index-1+items.length)%items.length;show()});
    next.addEventListener('click',()=>{index=(index+1)%items.length;show()});
    shell.append(stage,previous,next,counter); show();
    return shell;
  }
  async function commentsFor(post, host) {
    host.replaceChildren(el('p','post-comment-empty','讀取留言中…'));
    if (!configured || post.demo) { host.replaceChildren(el('p','post-comment-empty','後端連接後開放留言。')); return; }
    try {
      const response=await fetch(`/api/community/comments?post=${encodeURIComponent(post.id)}`);
      if (!response.ok) throw new Error();
      const data=await response.json();
      const comments=Array.isArray(data.comments)?data.comments:[];
      host.replaceChildren(...comments.map(comment=>{
        const row=el('div','post-comment');
        const name=el('strong','',comment.author_name||comment.author_username||'玩家');
        const body=el('span','',comment.body);
        row.append(name,body); return row;
      }));
      if (!comments.length) host.append(el('p','post-comment-empty','還沒有留言，來當第一位吧。'));
      post.comment_count=comments.length;
    } catch { host.replaceChildren(el('p','post-comment-empty','留言暫時無法讀取。')); }
  }
  function card(post) {
    const article=el('article','community-post'); article.id=`post-${post.id}`;
    const head=el('header','post-head');
    const avatar=el('img','post-avatar'); avatar.src=post.author_avatar_url||'/image/logo.png'; avatar.alt=''; avatar.loading='lazy';
    const byline=el('div','post-byline');
    byline.append(el('strong','',post.author_name||post.author_username||'TeaCafe'),el('small','',fmt(post.created_at)||(kind==='gallery'?'版型預覽':'討論提案')));
    head.append(avatar,byline);
    if (kind==='forum') head.append(el('span','post-category',post.demo ? '討論提案 · ' + categoryName(post.category) : categoryName(post.category)));
    article.append(head);
    const media=mediaPanel(post); if (media) article.append(media);
    const content=el('div','post-content');
    content.append(el('h2','',post.title),el('p','',post.body||'')); article.append(content);
    const actions=el('div','post-actions');
    const like=el('button','post-action',`♥ ${Number(post.like_count)||0}`); like.type='button';
    like.setAttribute('aria-label','按讚'); like.setAttribute('aria-pressed',post.liked?'true':'false');
    const comment=el('button','post-action',`▤ ${Number(post.comment_count)||0}`); comment.type='button'; comment.setAttribute('aria-label','留言');
    const share=el('button','post-action',`↗ 分享`); share.type='button';
    actions.append(like,comment,share); article.append(actions);
    const commentArea=el('div','post-comments'); commentArea.hidden=true;
    const commentList=el('div','post-comment-list');
    const commentForm=el('form','post-comment-form');
    const input=el('textarea'); input.name='body'; input.maxLength=1000; input.rows=2; input.placeholder='留下留言…'; input.setAttribute('aria-label','留言內容');
    const send=el('button','mc-button','發布'); send.type='submit';
    commentForm.append(input,send); commentArea.append(commentList,commentForm); article.append(commentArea);
    comment.addEventListener('click',()=>{commentArea.hidden=!commentArea.hidden;if (!commentArea.hidden) commentsFor(post,commentList)});
    like.addEventListener('click',async()=>{
      if (!configured || post.demo) {say('後端連接後開放按讚');return;}
      if (!await auth()) return;
      const target=post.liked!==true;
      try {const response=await fetch('/api/community/likes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId:post.id,liked:target})});if(!response.ok)throw new Error();const data=await response.json();post.liked=data.liked;post.like_count=data.like_count;like.textContent=`♥ ${data.like_count}`;like.setAttribute('aria-pressed',data.liked?'true':'false')}catch{say('按讚失敗，請稍後再試')}
    });
    commentForm.addEventListener('submit',async event=>{
      event.preventDefault(); if (!configured || post.demo) {say('後端連接後開放留言');return;}
      if (!await auth()) return;
      const body=input.value.trim(); if(!body)return;
      send.disabled=true;
      try {const response=await fetch('/api/community/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId:post.id,body})});if(!response.ok)throw new Error();input.value='';await commentsFor(post,commentList);comment.textContent=`▤ ${post.comment_count}`;say('留言已發布')}catch{say('留言失敗，請稍後再試')}finally{send.disabled=false}
    });
    share.addEventListener('click',async()=>{
      const url=new URL(location.pathname,location.origin);url.searchParams.set('post',post.id);
      try {if(navigator.share)await navigator.share({title:post.title,url:url.href});else {await navigator.clipboard.writeText(url.href);say('貼文連結已複製')}if(configured&&!post.demo)fetch('/api/community/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId:post.id})}).catch(()=>{})}catch(error){if(error.name!=='AbortError')say('無法分享連結')}
    });
    return article;
  }
  function redraw() {
    let visible=posts;
    if(kind==='forum'&&activeCategory!=='all')visible=visible.filter(post=>post.category===activeCategory);
    if(search)visible=visible.filter(post=>`${post.title} ${post.body}`.toLocaleLowerCase().includes(search));
    feed.replaceChildren(...visible.map(card));
    if(!visible.length)feed.append(el('div','community-empty',configured?'這裡還沒有貼文。':'還沒有可顯示的貼文。'));
    const focus=new URL(location.href).searchParams.get('post');
    if(focus)document.getElementById(`post-${focus}`)?.scrollIntoView({block:'center'});
  }
  async function load(reset=false) {
    if(reset){cursor=null;posts=[];}
    status.textContent='讀取貼文中…';
    try {
      const url=new URL('/api/community/posts',location.origin);url.searchParams.set('kind',kind);if(cursor)url.searchParams.set('cursor',cursor);
      const response=await fetch(url,{headers:{Accept:'application/json'}});
      const data=response.ok?await response.json():{configured:false,posts:[]};configured=Boolean(data.configured);
      posts.push(...(Array.isArray(data.posts)?data.posts:[]));cursor=data.next_cursor||null;
      if(!configured) {
        const fallback=await fetch(kind==='forum'?'/data/forum.json':'/data/gallery.json',{cache:'no-store'});
        const examples=await fallback.json();posts=examples.posts||[];
        status.textContent=kind==='forum'?'目前顯示玩法討論提案；連接 D1 和 R2 後即可發文互動。':'目前顯示相冊版型預覽；連接 D1 和 R2 後即可分享作品。';
      } else status.textContent=posts.length?'':'目前還沒有貼文。';
      more.hidden=!cursor;redraw();
    } catch {status.textContent='貼文暫時無法載入。';feed.replaceChildren();}
  }
  more.addEventListener('click',()=>load());
  $('[data-community-search]')?.addEventListener('input',event=>{search=event.target.value.trim().toLocaleLowerCase();redraw()});
  const nav=$('[data-community-categories]');
  if(nav){
    const select=$('[data-community-category]');
    select.replaceChildren(...categories.filter(x=>x[0]!=='all').map(([id,name])=>{const option=el('option','',name);option.value=id;return option}));
    for(const [id,name] of categories){const button=el('button',activeCategory===id?'active':'',name);button.type='button';button.addEventListener('click',()=>{activeCategory=id;nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===button));redraw()});nav.append(button)}
  }
  load(true);
})();
