(() => {
  'use strict';
  const kinds = ['news', 'wiki', 'pass'];
  const labels = { news: '公告', wiki: 'Wiki 條目', pass: '通行證季節' };
  const statusLabels = { draft: '草稿', published: '公開', hidden: '隱藏' };
  const forms = Object.fromEntries(kinds.map(type => [type, document.querySelector(`[data-content-form="${type}"]`)]));
  const lists = Object.fromEntries(kinds.map(type => [type, document.querySelector(`[data-content-list="${type}"]`)]));
  const messages = Object.fromEntries(kinds.map(type => [type, document.querySelector(`[data-content-status="${type}"]`)]));
  if (kinds.some(type => !forms[type] || !lists[type] || !messages[type])) return;

  function localDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const isoOrNull = value => value ? new Date(value).toISOString() : null;
  function reset(type) {
    forms[type].reset();
    if (type === 'news') forms.news.elements.published_at.value = localDate();
    if (type === 'wiki') forms.wiki.elements.slug.readOnly = false;
    messages[type].textContent = '';
  }
  function edit(type, item) {
    const form = forms[type];
    for (const [key, value] of Object.entries(item)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      field.value = ['published_at', 'starts_at', 'ends_at'].includes(key) ? (value ? localDate(value) : '') : String(value ?? '');
    }
    if (type === 'wiki') form.elements.slug.readOnly = true;
    messages[type].textContent = `正在編輯：${item.title}`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.title.focus({ preventScroll: true });
  }
  function render(type, items) {
    const list = lists[type];
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p'); empty.textContent = `目前沒有${labels[type]}。`;
      list.append(empty); return;
    }
    for (const item of items) {
      const row = document.createElement('article'); row.className = 'admin-content-row';
      const description = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = item.title;
      const detail = document.createElement('small');
      detail.textContent = type === 'wiki' ? `${item.section} · ${statusLabels[item.status] || item.status}` : type === 'pass' ? `${item.active ? '已啟用' : '未啟用'} · 最高 ${item.max_level} 級` : statusLabels[item.status] || item.status;
      description.append(title, detail);
      const button = document.createElement('button'); button.className = 'mc-button'; button.type = 'button'; button.textContent = '編輯';
      button.addEventListener('click', () => edit(type, item));
      row.append(description, button); list.append(row);
    }
  }
  async function load(type) {
    messages[type].textContent = '讀取中…';
    try {
      const response = await fetch(`/api/admin/content?type=${type}`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      render(type, Array.isArray(data.items) ? data.items : []);
      messages[type].textContent = '';
    } catch { messages[type].textContent = `${labels[type]}無法讀取，請稍後重新整理。`; }
  }
  for (const type of kinds) {
    const form = forms[type];
    form.querySelector('[data-content-new]')?.addEventListener('click', () => reset(type));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      messages[type].textContent = '儲存中…';
      const item = Object.fromEntries(new FormData(form));
      for (const field of ['published_at', 'starts_at', 'ends_at']) {
        if (field in item) item[field] = isoOrNull(item[field]);
      }
      try {
        const response = await fetch('/api/admin/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, item }) });
        if (!response.ok) throw new Error();
        reset(type);
        await load(type);
        messages[type].textContent = `${labels[type]}已儲存。`;
      } catch { messages[type].textContent = '儲存失敗，請檢查欄位與資料庫設定。'; }
      finally { button.disabled = false; }
    });
  }
  window.TeaCafeAuth?.ready.then(state => {
    if (!state.is_official) return;
    reset('news');
    Promise.all(kinds.map(load));
  });
})();
