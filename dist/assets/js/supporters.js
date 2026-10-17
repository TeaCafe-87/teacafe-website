(() => {
  const list = document.querySelector('[data-supporters-list]');
  const status = document.querySelector('[data-supporters-status]');
  if (!list || !status) return;
  fetch('/api/supporters', { cache: 'no-store' }).then(response => response.json()).then(data => {
    if (!data.configured) { status.textContent = '支持名單暫時無法讀取，請稍後再試。'; return; }
    const rows = Array.isArray(data.supporters) ? data.supporters : [];
    status.textContent = rows.length ? `感謝 ${rows.length} 位支持暖居的玩家` : '名單正在整理中，感謝每一位支持我們的玩家。';
    if (!rows.length) {
      const empty = document.createElement('div'); empty.className = 'supporters-empty';
      const image = document.createElement('img'); image.src = '/image/server_icon.png'; image.alt = '';
      const text = document.createElement('p'); text.textContent = '第一份公開的支持紀錄，會從這裡開始。';
      empty.append(image, text); list.append(empty);
      return;
    }
    for (const row of rows) {
      const card = document.createElement('article'); card.className = 'supporter-card';
      const icon = document.createElement('img'); icon.className = 'supporter-icon'; icon.src = '/image/server_icon.png'; icon.alt = '';
      const content = document.createElement('div');
      const name = document.createElement('h3'); name.textContent = row.player_name;
      const date = document.createElement('time'); date.dateTime = row.supported_at; date.textContent = row.supported_at;
      content.append(name, date);
      if (row.note) { const note = document.createElement('p'); note.textContent = row.note; content.append(note); }
      card.append(icon, content); list.append(card);
    }
  }).catch(() => { status.textContent = '暫時無法讀取支持名單，請稍後再試。'; });
})();
