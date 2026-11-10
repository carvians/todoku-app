// =====================================================================
// TodoKu frontend (Vanilla JS, tanpa framework)
// Berkomunikasi dengan REST API /api/* yang diteruskan Nginx ke container app
// =====================================================================
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LABEL = {
    status: { todo: 'Belum mulai', in_progress: 'Dikerjakan', done: 'Selesai' },
    priority: { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' },
  };
  const TOKEN_KEY = 'todoku_token';

  const state = {
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
    categories: [],
    filters: { q: '', status: '', priority: '', due: '', category_id: '', sort: 'created_at:desc', page: 1 },
    editingTask: null,
    editingCategory: null,
  };

  // ---------------------------------------------------------------- API
  async function api(path, { method = 'GET', body, raw } = {}) {
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(`/api${path}`, {
      method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && state.token) { logout(); throw new Error('Sesi berakhir, silakan login ulang'); }
    if (raw) return res;
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Gagal (${res.status})`);
      err.details = data.details;
      throw err;
    }
    return data;
  }

  function toast(msg, isError = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = `toast${isError ? ' error' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.add('hidden'), 2800);
  }

  function showErrors(form, errEl, err) {
    $$('.err', form).forEach((e) => { e.textContent = ''; });
    errEl.textContent = '';
    if (err?.details) {
      for (const [field, msg] of Object.entries(err.details)) {
        const slot = $(`[data-err="${field}"]`, form);
        if (slot) slot.textContent = msg; else errEl.textContent = msg;
      }
    } else if (err) errEl.textContent = err.message;
  }

  // ---------------------------------------------------------------- Format
  const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD lokal
  function fmtDate(d) {
    if (!d) return '';
    return new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function dueChip(task) {
    if (!task.due_date) return '';
    const diff = Math.round((new Date(`${task.due_date}T00:00:00`) - new Date(`${today()}T00:00:00`)) / 864e5);
    if (task.status !== 'done' && diff < 0) return `<span class="chip overdue">⏰ Terlambat ${-diff} hari</span>`;
    if (task.status !== 'done' && diff === 0) return '<span class="chip today">⏰ Hari ini</span>';
    if (task.status !== 'done' && diff === 1) return '<span class="chip today">📅 Besok</span>';
    return `<span class="chip">📅 ${fmtDate(task.due_date)}</span>`;
  }
  const fmtSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const fileIcon = (mime) => (mime.startsWith('image/') ? '🖼️' : mime === 'application/pdf' ? '📕' : mime.includes('zip') ? '🗜️' : '📄');

  // ---------------------------------------------------------------- Auth
  let authMode = 'login';
  function setAuthMode(mode) {
    authMode = mode;
    $$('[data-auth-tab]').forEach((b) => b.classList.toggle('active', b.dataset.authTab === mode));
    $$('.register-only').forEach((el) => el.classList.toggle('hidden', mode !== 'register'));
    $('#auth-submit').textContent = mode === 'login' ? 'Masuk' : 'Buat akun';
    $('[name=password]', $('#auth-form')).autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    showErrors($('#auth-form'), $('#auth-error'));
  }

  async function submitAuth(e) {
    e.preventDefault();
    const form = e.target;
    const body = Object.fromEntries(new FormData(form));
    if (authMode === 'login') delete body.name;
    const btn = $('#auth-submit');
    btn.disabled = true;
    try {
      const data = await api(`/auth/${authMode}`, { method: 'POST', body });
      state.token = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
      form.reset();
      await enterApp(data.user);
      toast(authMode === 'login' ? `Selamat datang kembali, ${data.user.name}!` : 'Akun berhasil dibuat');
    } catch (err) {
      showErrors(form, $('#auth-error'), err);
    } finally {
      btn.disabled = false;
    }
  }

  function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    $('#main-view').classList.add('hidden');
    $('#auth-view').classList.remove('hidden');
    closeModals();
  }

  async function enterApp(user) {
    state.user = user;
    $('#user-name').textContent = user.name;
    $('#user-email').textContent = user.email;
    $('#user-avatar').textContent = user.name.trim()[0].toUpperCase();
    $('#auth-view').classList.add('hidden');
    $('#main-view').classList.remove('hidden');
    await loadCategories();
    route();
  }

  // ---------------------------------------------------------------- Kategori
  async function loadCategories() {
    state.categories = await api('/categories');
    const active = state.filters.category_id;
    const allCount = state.categories.reduce((n, c) => n + c.open_count, 0);
    $('#category-list').innerHTML = [
      `<li data-cat="" class="${active === '' ? 'active' : ''}"><span class="dot" style="background:#111827"></span><span class="name">Semua</span><span class="count">${allCount || ''}</span></li>`,
      ...state.categories.map((c) => `
        <li data-cat="${c.id}" class="${String(active) === String(c.id) ? 'active' : ''}">
          <span class="dot" style="background:${esc(c.color)}"></span>
          <span class="name">${esc(c.name)}</span>
          <span class="count">${c.open_count || ''}</span>
          <button class="icon-btn edit" data-edit-cat="${c.id}" title="Ubah">✎</button>
        </li>`),
      `<li data-cat="none" class="${active === 'none' ? 'active' : ''}"><span class="dot" style="background:#cbd5e1"></span><span class="name">Tanpa kategori</span></li>`,
    ].join('');
    $('#task-category').innerHTML = '<option value="">— Tanpa kategori —</option>' +
      state.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  function openCategoryModal(cat = null) {
    state.editingCategory = cat;
    const form = $('#category-form');
    form.reset();
    showErrors(form, $('#category-error'));
    $('#cat-modal-title').textContent = cat ? 'Ubah kategori' : 'Kategori baru';
    form.name.value = cat?.name || '';
    form.color.value = cat?.color || '#4f46e5';
    $('#delete-category').classList.toggle('hidden', !cat);
    $('#category-modal').classList.remove('hidden');
    form.name.focus();
  }

  async function saveCategory(e) {
    e.preventDefault();
    const form = e.target;
    const body = { name: form.name.value, color: form.color.value };
    try {
      const cat = state.editingCategory;
      await api(cat ? `/categories/${cat.id}` : '/categories', { method: cat ? 'PUT' : 'POST', body });
      closeModals();
      await loadCategories();
      loadTasks();
      toast('Kategori disimpan');
    } catch (err) {
      showErrors(form, $('#category-error'), err);
    }
  }

  async function deleteCategory() {
    const cat = state.editingCategory;
    if (!confirm(`Hapus kategori "${cat.name}"? Tugas di dalamnya tidak ikut terhapus.`)) return;
    await api(`/categories/${cat.id}`, { method: 'DELETE' });
    if (String(state.filters.category_id) === String(cat.id)) state.filters.category_id = '';
    closeModals();
    await loadCategories();
    loadTasks();
    toast('Kategori dihapus');
  }

  // ---------------------------------------------------------------- Tugas
  async function loadTasks() {
    const f = state.filters;
    const [sort, order] = f.sort.split(':');
    const params = new URLSearchParams({ sort, order, page: f.page, limit: 15 });
    for (const k of ['q', 'status', 'priority', 'due', 'category_id']) if (f[k]) params.set(k, f[k]);

    const { data, pagination } = await api(`/tasks?${params}`);
    const cat = state.categories.find((c) => String(c.id) === String(f.category_id));
    $('#tasks-title').textContent = f.category_id === 'none' ? 'Tanpa kategori' : cat ? cat.name : 'Semua Tugas';
    $('#tasks-subtitle').textContent = `${pagination.total} tugas ditemukan`;

    $('#task-list').innerHTML = data.length ? data.map((t) => `
      <li class="task p-${t.priority} ${t.status === 'done' ? 'done' : ''}" data-id="${t.id}">
        <input type="checkbox" class="check" ${t.status === 'done' ? 'checked' : ''} title="Tandai selesai" />
        <div class="body">
          <div class="title">${esc(t.title)}</div>
          ${t.description ? `<div class="desc">${esc(t.description)}</div>` : ''}
          <div class="meta">
            ${t.status !== 'todo' ? `<span class="chip st-${t.status}">${LABEL.status[t.status]}</span>` : ''}
            <span class="chip pr-${t.priority}">${t.priority === 'high' ? '🔥 ' : ''}${LABEL.priority[t.priority]}</span>
            ${dueChip(t)}
            ${t.category_name ? `<span class="chip"><span style="color:${esc(t.category_color)}">●</span> ${esc(t.category_name)}</span>` : ''}
            ${t.attachment_count ? `<span class="chip">📎 ${t.attachment_count}</span>` : ''}
          </div>
        </div>
      </li>`).join('')
      : `<li class="empty"><div class="big">🗒️</div>Belum ada tugas yang cocok.<br/>Tambahkan tugas baru di atas.</li>`;

    $('#pager').innerHTML = pagination.total_pages > 1 ? `
      <button class="btn ghost small" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? 'disabled' : ''}>‹ Sebelumnya</button>
      <span class="muted">Halaman ${pagination.page} dari ${pagination.total_pages}</span>
      <button class="btn ghost small" data-page="${pagination.page + 1}" ${pagination.page >= pagination.total_pages ? 'disabled' : ''}>Berikutnya ›</button>` : '';
  }

  async function quickAdd(e) {
    e.preventDefault();
    const title = $('#quick-title').value.trim();
    if (!title) return $('#quick-title').focus();
    const body = { title, priority: $('#quick-priority').value };
    if ($('#quick-due').value) body.due_date = $('#quick-due').value;
    const catId = state.filters.category_id;
    if (catId && catId !== 'none') body.category_id = Number(catId);
    try {
      await api('/tasks', { method: 'POST', body });
      $('#quick-add').reset();
      await Promise.all([loadTasks(), loadCategories()]);
      toast('Tugas ditambahkan');
    } catch (err) { toast(err.message, true); }
  }

  async function toggleDone(id, done) {
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', body: { status: done ? 'done' : 'todo' } });
      await Promise.all([loadTasks(), loadCategories()]);
      if (done) toast('Mantap, tugas selesai! 🎉');
    } catch (err) { toast(err.message, true); }
  }

  async function openTaskModal(id = null) {
    const form = $('#task-form');
    form.reset();
    showErrors(form, $('#task-error'));
    state.editingTask = null;
    if (id) {
      try { state.editingTask = await api(`/tasks/${id}`); } catch (err) { return toast(err.message, true); }
    }
    const t = state.editingTask;
    $('#modal-title').textContent = t ? 'Detail tugas' : 'Tugas baru';
    form.title.value = t?.title || '';
    form.description.value = t?.description || '';
    form.status.value = t?.status || 'todo';
    form.priority.value = t?.priority || 'medium';
    form.due_date.value = t?.due_date || '';
    const cf = state.filters.category_id;
    form.category_id.value = t ? (t.category_id ?? '') : (cf && cf !== 'none' ? cf : '');
    $('#delete-task').classList.toggle('hidden', !t);
    $('#attachment-section').classList.toggle('hidden', !t);
    if (t) renderAttachments(t.attachments);
    $('#task-modal').classList.remove('hidden');
    form.title.focus();
  }

  async function saveTask(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      title: form.title.value, description: form.description.value, status: form.status.value,
      priority: form.priority.value, due_date: form.due_date.value || null,
      category_id: form.category_id.value ? Number(form.category_id.value) : null,
    };
    const btn = $('#save-task');
    btn.disabled = true;
    try {
      const t = state.editingTask;
      await api(t ? `/tasks/${t.id}` : '/tasks', { method: t ? 'PATCH' : 'POST', body });
      closeModals();
      await Promise.all([loadTasks(), loadCategories()]);
      toast(t ? 'Perubahan disimpan' : 'Tugas dibuat');
    } catch (err) {
      showErrors(form, $('#task-error'), err);
    } finally { btn.disabled = false; }
  }

  async function deleteTask() {
    const t = state.editingTask;
    if (!confirm(`Hapus tugas "${t.title}" beserta seluruh lampirannya?`)) return;
    await api(`/tasks/${t.id}`, { method: 'DELETE' });
    closeModals();
    await Promise.all([loadTasks(), loadCategories()]);
    toast('Tugas dihapus');
  }

  // ---------------------------------------------------------------- Lampiran
  function renderAttachments(list) {
    $('#attachment-list').innerHTML = list.length ? list.map((a) => `
      <li>
        <span>${fileIcon(a.mime_type)}</span>
        <a data-download="${a.id}" data-name="${esc(a.original_name)}" title="Unduh">${esc(a.original_name)}</a>
        <span class="muted small">${fmtSize(a.size_bytes)}</span>
        <button type="button" class="icon-btn" data-del-att="${a.id}" title="Hapus lampiran">🗑</button>
      </li>`).join('') : '<li class="muted small">Belum ada lampiran</li>';
  }

  async function refreshAttachments() {
    const t = state.editingTask;
    t.attachments = await api(`/tasks/${t.id}/attachments`);
    renderAttachments(t.attachments);
    loadTasks();
  }

  // Upload memakai XMLHttpRequest agar progress bar bisa ditampilkan
  function uploadFile(file) {
    const t = state.editingTask;
    if (file.size > 5 * 1024 * 1024) return toast('Ukuran file maksimal 5 MB', true);
    const fd = new FormData();
    fd.append('file', file);
    const bar = $('#upload-progress');
    bar.classList.remove('hidden');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/tasks/${t.id}/attachments`);
    xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.firstElementChild.style.width = `${(e.loaded / e.total) * 100}%`; };
    xhr.onloadend = async () => {
      bar.classList.add('hidden');
      bar.firstElementChild.style.width = '0';
      $('#file-input').value = '';
      if (xhr.status === 201) { toast('Lampiran diunggah'); refreshAttachments(); } else {
        let msg = 'Upload gagal';
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* abaikan */ }
        toast(msg, true);
      }
    };
    xhr.send(fd);
  }

  // Download memakai fetch + header Authorization lalu dibuat blob URL
  async function downloadAttachment(id, name) {
    const res = await api(`/tasks/${state.editingTask.id}/attachments/${id}/download`, { raw: true });
    if (!res.ok) return toast('Gagal mengunduh file', true);
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------------------------------------------------------------- Dashboard
  async function loadDashboard() {
    const s = await api('/stats');
    const m = s.summary;
    $('#stat-cards').innerHTML = `
      <div class="card"><div class="label">Total tugas</div><div class="value">${m.total}</div><div class="sub">${m.todo} belum mulai · ${m.in_progress} dikerjakan</div></div>
      <div class="card"><div class="label">Selesai</div><div class="value">${m.completion_rate}%</div><div class="sub">${m.done} tugas · ${m.done_this_week} minggu ini</div></div>
      <div class="card ${m.overdue ? 'alert' : ''}"><div class="label">Terlambat</div><div class="value">${m.overdue}</div><div class="sub">Lewat deadline, belum selesai</div></div>
      <div class="card"><div class="label">Deadline hari ini</div><div class="value">${m.due_today}</div><div class="sub">Segera selesaikan</div></div>`;

    // Grafik batang harian
    const max = Math.max(1, ...s.daily.flatMap((d) => [d.created, d.completed]));
    $('#chart-daily').innerHTML = s.daily.map((d, i) => `
      <div class="bar-group" title="${fmtDate(d.date)}: ${d.created} dibuat, ${d.completed} selesai">
        <div class="bars">
          <div style="height:${(d.created / max) * 100}%;background:#c7d2fe"></div>
          <div style="height:${(d.completed / max) * 100}%;background:#4f46e5"></div>
        </div>
        ${i % 2 === 1 ? `<span class="bar-label">${new Date(`${d.date}T00:00:00`).getDate()}</span>` : ''}
      </div>`).join('');

    // Donut status (conic-gradient)
    const parts = [['Belum mulai', m.todo, '#cbd5e1'], ['Dikerjakan', m.in_progress, '#60a5fa'], ['Selesai', m.done, '#10b981']];
    let acc = 0;
    const stops = m.total ? parts.map(([, n, c]) => { const a = acc; acc += (n / m.total) * 360; return `${c} ${a}deg ${acc}deg`; }).join(',') : '#f1f2f6 0 360deg';
    $('#chart-status').innerHTML = `
      <div class="donut" style="background:conic-gradient(${stops})"><span>${m.total}</span></div>
      <div class="donut-legend">${parts.map(([l, n, c]) => `<div><i style="background:${c}"></i>${l}: <strong>${n}</strong></div>`).join('')}</div>`;

    const hbar = (label, open, done, color) => {
      const total = open + done || 1;
      return `<div class="hbar"><div class="top"><span>${label}</span><span class="muted">${done}/${open + done} selesai</span></div>
        <div class="track"><div style="width:${(done / total) * 100}%;background:${color}"></div><div style="width:${(open / total) * 100}%;background:${color};opacity:.25"></div></div></div>`;
    };
    const pColor = { high: '#dc2626', medium: '#d97706', low: '#64748b' };
    $('#chart-priority').innerHTML = s.by_priority.map((p) => hbar(LABEL.priority[p.priority], p.open, p.done, pColor[p.priority])).join('');
    $('#chart-category').innerHTML = s.by_category.length
      ? s.by_category.map((c) => hbar(esc(c.name), c.total - c.done, c.done, esc(c.color))).join('')
      : '<p class="muted">Belum ada data</p>';

    $('#upcoming').innerHTML = s.upcoming.length ? s.upcoming.map((u) => `
      <li data-open-task="${u.id}">
        <span>${u.priority === 'high' ? '🔥 ' : ''}${esc(u.title)}</span>
        ${dueChip({ ...u, status: 'todo' })}
      </li>`).join('') : '<li class="muted">Tidak ada deadline dalam 7 hari ke depan 🎉</li>';
  }

  // ---------------------------------------------------------------- Router & event
  function route() {
    if (!state.user) return;
    const page = location.hash === '#/dashboard' ? 'dashboard' : 'tasks';
    $$('.page').forEach((p) => p.classList.add('hidden'));
    $(`#${page}-page`).classList.remove('hidden');
    $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.route === page));
    (page === 'dashboard' ? loadDashboard() : loadTasks()).catch((err) => toast(err.message, true));
  }

  function closeModals() {
    $$('.modal').forEach((m) => m.classList.add('hidden'));
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function bind() {
    $$('[data-auth-tab]').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.authTab)));
    $('#auth-form').addEventListener('submit', submitAuth);
    $('#logout').addEventListener('click', () => { logout(); toast('Anda telah keluar'); });
    window.addEventListener('hashchange', route);

    $('#quick-add').addEventListener('submit', quickAdd);
    $('#new-task').addEventListener('click', () => openTaskModal());
    $('#task-form').addEventListener('submit', saveTask);
    $('#delete-task').addEventListener('click', deleteTask);
    $('#add-category').addEventListener('click', () => openCategoryModal());
    $('#category-form').addEventListener('submit', saveCategory);
    $('#delete-category').addEventListener('click', deleteCategory);
    $('#file-input').addEventListener('change', (e) => e.target.files[0] && uploadFile(e.target.files[0]));

    const setFilter = (key, value) => {
      state.filters[key] = value;
      state.filters.page = 1;
      loadTasks().catch((err) => toast(err.message, true));
    };
    $('#search').addEventListener('input', debounce((e) => setFilter('q', e.target.value.trim()), 300));
    for (const [id, key] of [['#f-status', 'status'], ['#f-priority', 'priority'], ['#f-due', 'due'], ['#f-sort', 'sort']]) {
      $(id).addEventListener('change', (e) => setFilter(key, e.target.value));
    }

    $('#pager').addEventListener('click', (e) => {
      const p = e.target.closest('[data-page]');
      if (p && !p.disabled) { state.filters.page = Number(p.dataset.page); loadTasks(); }
    });

    $('#task-list').addEventListener('click', (e) => {
      const li = e.target.closest('.task');
      if (!li) return;
      if (e.target.classList.contains('check')) toggleDone(li.dataset.id, e.target.checked);
      else openTaskModal(li.dataset.id);
    });

    $('#category-list').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit-cat]');
      if (edit) return openCategoryModal(state.categories.find((c) => String(c.id) === edit.dataset.editCat));
      const li = e.target.closest('[data-cat]');
      if (!li) return;
      state.filters.category_id = li.dataset.cat;
      state.filters.page = 1;
      $$('#category-list li').forEach((x) => x.classList.toggle('active', x === li));
      if (location.hash !== '#/tasks') location.hash = '#/tasks'; else loadTasks();
    });

    $('#attachment-list').addEventListener('click', async (e) => {
      const dl = e.target.closest('[data-download]');
      if (dl) return downloadAttachment(dl.dataset.download, dl.dataset.name);
      const del = e.target.closest('[data-del-att]');
      if (del && confirm('Hapus lampiran ini?')) {
        await api(`/tasks/${state.editingTask.id}/attachments/${del.dataset.delAtt}`, { method: 'DELETE' });
        toast('Lampiran dihapus');
        refreshAttachments();
      }
    });

    $('#upcoming').addEventListener('click', (e) => {
      const li = e.target.closest('[data-open-task]');
      if (li) openTaskModal(li.dataset.openTask);
    });

    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
    $$('.modal').forEach((m) => m.addEventListener('mousedown', (e) => { if (e.target === m) closeModals(); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });
  }

  // ---------------------------------------------------------------- Start
  async function init() {
    bind();
    // Tampilkan versi build (berisi commit SHA dari pipeline CI/CD)
    fetch('/api/health').then((r) => r.json()).then((h) => { $$('.app-version').forEach((el) => { el.textContent = h.version; }); }).catch(() => {});
    if (state.token) {
      try { return await enterApp(await api('/auth/me')); } catch { logout(); }
    }
    $('#auth-view').classList.remove('hidden');
  }

  init();
})();
