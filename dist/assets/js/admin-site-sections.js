(() => {
  'use strict';
  const form = document.querySelector('[data-section-form]');
  if (!form) return;
  const tabs = [...document.querySelectorAll('[data-copy-tab]')];
  const list = document.querySelector('[data-section-list]');
  const status = document.querySelector('[data-section-status]');
  const message = document.querySelector('[data-section-message]');
  const save = document.querySelector('[data-section-save]');
  const reset = document.querySelector('[data-section-new]');
  const anchor = form.elements.anchor;
  const labels = {
    wiki: { start: '入門與帳號', travel: '移動與家園', progress: '職業與成長', economy: '經濟與道具', activities: '活動與探索', extras: '更多玩法' },
    rules: { intro: '伺服器介紹', features: '伺服器特色', basic: '基本遊玩規則', automation: '生電與自動化', 'new-residents': '給新居民的話' }
  };
  const cache = new Map();
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('teacafe-site-copy') : null;
  let page = 'wiki';
  let ready = false;
  let original = null;
  const beforeTitle = document.querySelector('[data-section-before-title]');
  const beforeBody = document.querySelector('[data-section-before-body]');
  const afterTitle = document.querySelector('[data-section-after-title]');
  const afterBody = document.querySelector('[data-section-after-body]');
  function preview() {
    beforeTitle.textContent = original?.title || '新增段落';
    beforeBody.textContent = original?.body || '此分類目前沒有這段內容。';
    afterTitle.textContent = form.elements.title.value.trim() || '段落標題';
    afterBody.textContent = form.elements.body.value.trim() || '內容會在輸入時顯示於此。';
  }
  function resetForm() {
    form.reset();
    original = null;
    form.elements.id.value = '';
    save.textContent = '新增並公開';
    message.textContent = '';
    preview();
  }
  function fillAnchors() {
    anchor.replaceChildren(...Object.entries(labels[page]).map(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      return option;
    }));
  }
  async function send(payload) {
    const response = await fetch('/api/admin/site-sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'request_failed');
    return result;
  }
  async function load() {
    status.textContent = '讀取中…';
    try {
      const response = await fetch(`/api/site-sections?page=${page}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.configured) throw new Error('migration_required');
      cache.set(page, result.items || []);
      save.disabled = false;
      render();
    } catch {
      status.textContent = '請先在 D1 執行 migrations/0007_site_sections.sql，然後重新整理。';
      save.disabled = true;
      list.replaceChildren();
    }
  }
  function makeButton(text, action, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.disabled = disabled;
    button.addEventListener('click', action);
    return button;
  }
  async function reorder(item, direction) {
    const siblings = (cache.get(page) || []).filter(entry => entry.anchor === item.anchor);
    const index = siblings.findIndex(entry => entry.id === item.id);
    const other = index + direction;
    if (other < 0 || other >= siblings.length) return;
    [siblings[index], siblings[other]] = [siblings[other], siblings[index]];
    try {
      await send({ action: 'reorder', anchor: item.anchor, ids: siblings.map(entry => entry.id) });
      channel?.postMessage({ page });
      await load();
      message.textContent = '段落順序已更新。';
    } catch {
      message.textContent = '順序更新失敗，請重新整理後再試。';
      await load();
    }
  }
  function render() {
    const items = cache.get(page) || [];
    list.replaceChildren();
    status.textContent = items.length ? `目前有 ${items.length} 個自訂段落。` : '尚未新增段落。';
    for (const [section, label] of Object.entries(labels[page])) {
      const siblings = items.filter(item => item.anchor === section);
      if (!siblings.length) continue;
      const group = document.createElement('div');
      group.className = 'section-manage-group';
      const heading = document.createElement('h5');
      heading.textContent = label;
      group.append(heading);
      siblings.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'section-manage-item';
        const title = document.createElement('strong');
        title.textContent = item.title;
        const excerpt = document.createElement('p');
        excerpt.textContent = item.body.length > 110 ? `${item.body.slice(0, 110)}…` : item.body;
        const actions = document.createElement('div');
        actions.className = 'section-manage-actions';
        actions.append(
          makeButton('編輯', () => {
            form.elements.id.value = item.id;
            anchor.value = item.anchor;
            form.elements.title.value = item.title;
            form.elements.body.value = item.body;
            original = { title: item.title, body: item.body };
            preview();
            save.textContent = '儲存修改';
            message.textContent = `正在編輯「${item.title}」。`;
            form.scrollIntoView({ block: 'center' });
            form.elements.title.focus({ preventScroll: true });
          }),
          makeButton('上移', () => reorder(item, -1), index === 0),
          makeButton('下移', () => reorder(item, 1), index === siblings.length - 1)
        );
        const remove = makeButton('刪除', async () => {
          if (!confirm(`確定刪除「${item.title}」？公開頁面將不再顯示此段落。`)) return;
          try {
            await send({ action: 'delete', anchor: item.anchor, id: item.id });
            if (form.elements.id.value === item.id) resetForm();
            channel?.postMessage({ page });
            await load();
            message.textContent = '段落已刪除。';
          } catch { message.textContent = '刪除失敗，請稍後重試。'; }
        });
        remove.classList.add('danger');
        actions.append(remove);
        card.append(title, excerpt, actions);
        group.append(card);
      });
      list.append(group);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || !form.reportValidity()) return;
    save.disabled = true;
    message.textContent = '儲存中…';
    try {
      await send({
        action: 'save',
        anchor: anchor.value,
        id: form.elements.id.value || undefined,
        title: form.elements.title.value,
        body: form.elements.body.value
      });
      resetForm();
      channel?.postMessage({ page });
      await load();
      message.textContent = '已儲存，公開頁面會顯示最新內容。';
    } catch {
      save.disabled = false;
      message.textContent = '儲存失敗，請檢查內容與 D1 設定。';
    }
  });
  form.addEventListener('input', preview);
  reset.addEventListener('click', resetForm);
  tabs.forEach(tab => tab.addEventListener('click', () => {
    page = tab.dataset.copyTab;
    resetForm();
    fillAnchors();
    if (ready) load();
  }));
  window.TeaCafeAuth?.ready.then(state => {
    if (!state.is_official) return;
    ready = true;
    fillAnchors();
    load();
  });
})();
