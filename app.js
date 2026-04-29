(function() {
  // ========== SERVICE WORKER REGISTRATION ==========
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ========== PWA INSTALL PROMPT ==========
  let deferredPrompt = null;
  const installBanner = document.createElement('div');
  installBanner.className = 'install-banner';
  installBanner.innerHTML = '<span>📱 Установить приложение</span><button id="installBtn">Установить</button>';

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBanner.classList.add('show');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBanner.classList.remove('show');
    console.log('PWA установлено');
  });

  // ========== STORAGE KEYS ==========
  const STORAGE = {
    entries: 'warehouse_entries',
    employees: 'warehouse_employees',
    models: 'warehouse_models',
    quickColors: 'warehouse_colors',
    quickSizes: 'warehouse_sizes'
  };

  function load(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ========== GLOBAL STATE ==========
  let entries = load(STORAGE.entries, []);
  let employees = load(STORAGE.employees, ['Анна', 'Олег', 'Мария']);
  let models = load(STORAGE.models, ['Футболка', 'Джинсы', 'Куртка']);
  let quickColors = load(STORAGE.quickColors, ['Чёрный', 'Белый', 'Синий']);
  let quickSizes = load(STORAGE.quickSizes, ['42', '44', '46', '48', '50', '52']);

  let currentTab = 'add';
  let historyFilter = { search: '', employee: '', model: '', size: '', dateFrom: '', dateTo: '' };
  let statsPeriod = 'all';

  function persistAll() {
    save(STORAGE.entries, entries);
    save(STORAGE.employees, employees);
    save(STORAGE.models, models);
    save(STORAGE.quickColors, quickColors);
    save(STORAGE.quickSizes, quickSizes);
  }

  // ========== HELPERS ==========
  function normalizeSize(s) {
    return (s || '').trim().toLowerCase();
  }

  function groupSum(list, keyFn) {
    const map = new Map();
    list.forEach(item => {
      const key = keyFn(item);
      const qty = Number(item.quantity) || 0;
      map.set(key, (map.get(key) || 0) + qty);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('ru-RU');
  }

  // ========== APP CONTAINER ==========
  const appContent = document.getElementById('app-content');

  function render() {
    switch (currentTab) {
      case 'add': renderAdd(); break;
      case 'history': renderHistory(); break;
      case 'stats': renderStats(); break;
      case 'models': renderModelAnalysis(); break;
      case 'settings': renderSettings(); break;
    }
    if (installBanner.classList.contains('show') && !appContent.contains(installBanner)) {
      appContent.insertBefore(installBanner, appContent.firstChild);
    }
    const installBtn = document.getElementById('installBtn');
    if (installBtn && deferredPrompt) {
      installBtn.addEventListener('click', async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Установка: ${outcome}`);
        deferredPrompt = null;
        installBanner.classList.remove('show');
      });
    }
  }

  function navHtml() {
    const tabs = [
      { key: 'add', label: '➕' },
      { key: 'history', label: '📋' },
      { key: 'stats', label: '📊' },
      { key: 'models', label: '📐' },
      { key: 'settings', label: '⚙️' }
    ];
    return `<nav>${tabs.map(t =>
      `<button class="${currentTab === t.key ? 'active' : ''}" data-tab="${t.key}" title="${t.key}">${t.label}</button>`
    ).join('')}</nav>`;
  }

  // ========== TAB: ADD ==========
  function renderAdd() {
    let html = navHtml();
    html += `<h2>📦 Новая запись</h2>`;
    html += `<div class="form-group"><label>Сотрудник</label>`;
    html += `<select id="empSelect">${employees.map(e => `<option>${e}</option>`).join('')}</select>`;
    html += `<input placeholder="Новый сотрудник" id="newEmp" style="margin-top:6px;"></div>`;
    html += `<div class="form-group"><label>Модель</label>`;
    html += `<select id="modelSelect">${models.map(m => `<option>${m}</option>`).join('')}</select>`;
    html += `<input placeholder="Новая модель" id="newModel" style="margin-top:6px;"></div>`;
    html += `<div class="form-group"><label>Цвет</label>`;
    html += `<input id="colorInput" placeholder="Введите цвет">`;
    html += `<div class="chip-row">${quickColors.map(c => `<span class="chip color-chip">${c}</span>`).join('')}</div></div>`;
    html += `<div class="form-group"><label>Размер</label>`;
    html += `<input id="sizeInput" placeholder="Размер">`;
    html += `<div class="chip-row">${quickSizes.map(s => `<span class="chip size-chip">${s}</span>`).join('')}</div></div>`;
    html += `<div class="form-group"><label>Количество</label><input id="qtyInput" type="number" value="1" min="1"></div>`;
    html += `<div class="form-group"><label>Комментарий</label><textarea id="noteInput" placeholder="Необязательно"></textarea></div>`;
    html += `<div class="actions"><button class="btn" id="saveBtn">💾 Сохранить</button><button class="btn secondary" id="clearBtn">🧹 Очистить</button></div>`;
    appContent.innerHTML = html;

    document.getElementById('saveBtn').addEventListener('click', () => {
      const employee = document.getElementById('empSelect').value || document.getElementById('newEmp').value.trim();
      const model = document.getElementById('modelSelect').value || document.getElementById('newModel').value.trim();
      const color = document.getElementById('colorInput').value.trim();
      const size = normalizeSize(document.getElementById('sizeInput').value);
      const quantity = parseInt(document.getElementById('qtyInput').value, 10) || 0;
      const note = document.getElementById('noteInput').value.trim();
      if (!employee || !model || !size || quantity <= 0) {
        alert('Заполните обязательные поля: сотрудник, модель, размер, количество > 0');
        return;
      }
      entries.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        createdAt: new Date().toISOString(),
        employee, model, color, size, quantity, note
      });
      if (!employees.includes(employee)) employees.push(employee);
      if (!models.includes(model)) models.push(model);
      persistAll();
      renderAdd();
    });
    document.getElementById('clearBtn').addEventListener('click', () => renderAdd());
    document.querySelectorAll('.color-chip').forEach(chip => {
      chip.addEventListener('click', () => { document.getElementById('colorInput').value = chip.textContent; });
    });
    document.querySelectorAll('.size-chip').forEach(chip => {
      chip.addEventListener('click', () => { document.getElementById('sizeInput').value = chip.textContent; });
    });
  }

  // ========== TAB: HISTORY ==========
  function filteredEntries() {
    return entries.filter(e => {
      const f = historyFilter;
      if (f.search) {
        const allText = `${e.employee} ${e.model} ${e.color} ${e.size} ${e.note}`.toLowerCase();
        if (!allText.includes(f.search.toLowerCase())) return false;
      }
      if (f.employee && e.employee !== f.employee) return false;
      if (f.model && e.model !== f.model) return false;
      if (f.size && e.size !== normalizeSize(f.size)) return false;
      if (f.dateFrom && e.createdAt < f.dateFrom) return false;
      if (f.dateTo && e.createdAt > f.dateTo + 'T23:59:59') return false;
      return true;
    });
  }

  function renderHistory() {
    const filtered = filteredEntries();
    const totalQty = filtered.reduce((s, e) => s + (e.quantity || 0), 0);
    const uniqueEmps = new Set(filtered.map(e => e.employee)).size;
    const uniqueModels = new Set(filtered.map(e => e.model)).size;
    const uniqueSizes = new Set(filtered.map(e => e.size)).size;

    let html = navHtml();
    html += `<h2>📋 История</h2>`;
    html += `<div class="summary-bar">
      <span class="stat-item">📌 Записей: ${filtered.length}</span>
      <span class="stat-item">🔢 Сумма: ${totalQty}</span>
      <span class="stat-item">👥 Сотрудников: ${uniqueEmps}</span>
      <span class="stat-item">👕 Моделей: ${uniqueModels}</span>
      <span class="stat-item">📏 Размеров: ${uniqueSizes}</span>
    </div>`;
    html += `<div class="filters">
      <input placeholder="🔍 Поиск" id="hSearch" value="${historyFilter.search}">
      <select id="hEmp"><option value="">Все сотрудники</option>${employees.map(e => `<option ${historyFilter.employee === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
      <select id="hModel"><option value="">Все модели</option>${models.map(m => `<option ${historyFilter.model === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <input placeholder="Размер" id="hSize" value="${historyFilter.size}">
      <input type="date" id="hFrom" value="${historyFilter.dateFrom}">
      <input type="date" id="hTo" value="${historyFilter.dateTo}">
    </div>`;
    filtered.forEach(e => {
      html += `<div class="entry-row">
        <div class="entry-info">
          <span class="badge">${e.employee}</span>
          <span>${e.model}</span>
          <span>🎨 ${e.color || '-'}</span>
          <span>📏 ${e.size}</span>
          <span>✖️ ${e.quantity}</span>
          <small>${formatDate(e.createdAt)}</small>
          ${e.note ? `<small style="color:#8b6a50;">💬 ${e.note}</small>` : ''}
        </div>
        <button class="del-btn" data-id="${e.id}">🗑️</button>
      </div>`;
    });
    if (filtered.length === 0) {
      html += `<div class="empty-state">Нет записей</div>`;
    }
    appContent.innerHTML = html;

    const bindFilter = (id, prop) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', (e) => { historyFilter[prop] = e.target.value; renderHistory(); });
    };
    bindFilter('hSearch', 'search');
    bindFilter('hSize', 'size');
    bindFilter('hFrom', 'dateFrom');
    bindFilter('hTo', 'dateTo');
    document.getElementById('hEmp').addEventListener('change', (e) => { historyFilter.employee = e.target.value; renderHistory(); });
    document.getElementById('hModel').addEventListener('change', (e) => { historyFilter.model = e.target.value; renderHistory(); });
    document.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        entries = entries.filter(e => e.id !== btn.dataset.id);
        persistAll();
        renderHistory();
      });
    });
  }

  // ========== TAB: STATS ==========
  function getPeriodEntries(period) {
    const now = new Date();
    if (period === 'today') {
      const today = now.toISOString().slice(0, 10);
      return entries.filter(e => e.createdAt.startsWith(today));
    } else if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      return entries.filter(e => e.createdAt >= weekAgo);
    } else if (period === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
      return entries.filter(e => e.createdAt >= monthAgo);
    }
    return [...entries];
  }

  function renderStats() {
    const periodKeys = ['today', 'week', 'month', 'all'];
    const periodLabels = { today: 'Сегодня', week: 'Неделя', month: 'Месяц', all: 'Всё' };
    const data = getPeriodEntries(statsPeriod);
    const totalQty = data.reduce((s, e) => s + (e.quantity || 0), 0);
    const topEmployees = groupSum(data, e => e.employee);
    const topModels = groupSum(data, e => e.model);
    const topSizes = groupSum(data, e => e.size);

    let html = navHtml();
    html += `<h2>📊 Статистика</h2>`;
    html += `<div class="chip-row" style="margin-bottom:16px;">`;
    periodKeys.forEach(p => {
      html += `<button class="chip period-chip ${statsPeriod === p ? 'active' : ''}" data-period="${p}">${periodLabels[p]}</button>`;
    });
    html += `</div>`;
    html += `<div class="stats-grid">
      <div class="card"><strong>📦 Общее количество</strong><span>${totalQty}</span></div>
      <div class="card"><strong>📋 Записей</strong><span>${data.length}</span></div>
      <div class="card"><strong>👥 Уник. сотрудников</strong><span>${new Set(data.map(e => e.employee)).size}</span></div>
      <div class="card"><strong>👕 Уник. моделей</strong><span>${new Set(data.map(e => e.model)).size}</span></div>
      <div class="card"><strong>📏 Уник. размеров</strong><span>${new Set(data.map(e => e.size)).size}</span></div>
    </div>`;
    html += `<h3>🏆 Топ сотрудников</h3><ul class="top-list">${topEmployees.slice(0,5).map(([k,v])=>`<li><span>${k}</span><span>${v}</span></li>`).join('')||'<li>—</li>'}</ul>`;
    html += `<h3>👕 Топ моделей</h3><ul class="top-list">${topModels.slice(0,5).map(([k,v])=>`<li><span>${k}</span><span>${v}</span></li>`).join('')||'<li>—</li>'}</ul>`;
    html += `<h3>🔥 Топ размеров</h3><ul class="top-list">${topSizes.map(([k,v])=>`<li><span>${k}</span><span>${v}</span></li>`).join('')||'<li>—</li>'}</ul>`;
    html += `<h3>📈 Динамика (14 дней)</h3><canvas id="chart" width="400" height="180"></canvas>`;
    html += `<hr><div class="actions">
      <button class="btn secondary" id="exportCSV">📥 CSV</button>
      <button class="btn secondary" id="exportXLSX">📥 XLSX</button>
      <button class="btn secondary" id="importJSON">📤 Импорт JSON</button>
      <input type="file" id="importFile" accept=".json" style="display:none">
    </div>`;
    appContent.innerHTML = html;

    document.querySelectorAll('.period-chip').forEach(chip => {
      chip.addEventListener('click', () => { statsPeriod = chip.dataset.period; renderStats(); });
    });
    setTimeout(() => {
      const canvas = document.getElementById('chart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const days = [];
      for (let i = 13; i >= 0; i--) {
        days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0,10));
      }
      const dayTotals = days.map(d => entries.filter(e => e.createdAt.startsWith(d)).reduce((s,e)=> s+(e.quantity||0),0));
      const maxVal = Math.max(...dayTotals, 1);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#faf5f0';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      const barW = (canvas.width-20)/days.length;
      dayTotals.forEach((v,i) => {
        const h = (v/maxVal)*140;
        ctx.fillStyle = '#e8836b';
        ctx.fillRect(10+i*barW, 160-h, barW-4, h);
      });
      ctx.fillStyle = '#3d2c1e';
      ctx.font = '10px sans-serif';
      days.forEach((d,i) => { if(i%3===0) ctx.fillText(d.slice(5), 10+i*barW, 175); });
    }, 20);

    document.getElementById('exportCSV').addEventListener('click', () => {
      const rows = [['Сотрудник','Модель','Цвет','Размер','Кол-во','Комментарий','Дата']];
      entries.forEach(e => rows.push([e.employee,e.model,e.color,e.size,e.quantity,e.note,formatDate(e.createdAt)]));
      downloadBlob(rows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(',')).join('\n'), 'warehouse.csv', 'text/csv');
    });
    document.getElementById('exportXLSX').addEventListener('click', () => {
      let xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table>`;
      xml += '<Row><Cell><Data>Сотрудник</Data></Cell><Cell><Data>Модель</Data></Cell><Cell><Data>Цвет</Data></Cell><Cell><Data>Размер</Data></Cell><Cell><Data>Кол-во</Data></Cell><Cell><Data>Комментарий</Data></Cell><Cell><Data>Дата</Data></Cell></Row>';
      entries.forEach(e => xml += `<Row><Cell><Data>${e.employee}</Data></Cell><Cell><Data>${e.model}</Data></Cell><Cell><Data>${e.color||''}</Data></Cell><Cell><Data>${e.size}</Data></Cell><Cell><Data>${e.quantity}</Data></Cell><Cell><Data>${e.note||''}</Data></Cell><Cell><Data>${formatDate(e.createdAt)}</Data></Cell></Row>`);
      xml += '</Table></Worksheet></Workbook>';
      downloadBlob(xml, 'warehouse.xls', 'application/vnd.ms-excel');
    });
    document.getElementById('importJSON').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if(Array.isArray(data)) { entries = data; persistAll(); renderStats(); }
        } catch { alert('Ошибка JSON'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  // ========== TAB: MODEL ANALYSIS ==========
  function renderModelAnalysis() {
    const allModels = [...new Set(entries.map(e => e.model))].sort();
    const stored = sessionStorage.getItem('analysisModel');
    const selectedModel = (stored && allModels.includes(stored)) ? stored : (allModels[0] || '');
    const setModel = (m) => { sessionStorage.setItem('analysisModel', m); renderModelAnalysis(); };

    let html = navHtml() + `<h2>📐 Анализ по моделям</h2>`;
    if (!allModels.length) { appContent.innerHTML = html + `<div class="empty-state">Нет данных</div>`; return; }

    html += `<div class="model-selector">${allModels.map(m => `<button class="chip ${m===selectedModel?'active':''}" data-model="${m}">${m}</button>`).join('')}</div>`;
    const modelEntries = entries.filter(e => e.model === selectedModel);
    const total = modelEntries.reduce((s,e)=> s+(e.quantity||0),0);
    const sizes = groupSum(modelEntries, e => e.size);
    const colors = groupSum(modelEntries, e => e.color||'без цвета');

    html += `<h3>👕 Модель: <span style="color:#c45a40;">${selectedModel}</span></h3>`;
    html += `<div class="stats-grid">
      <div class="card"><strong>📦 Всего единиц</strong><span>${total}</span></div>
      <div class="card"><strong>📋 Записей</strong><span>${modelEntries.length}</span></div>
      <div class="card"><strong>📏 Размеров</strong><span>${sizes.length}</span></div>
      <div class="card"><strong>🎨 Цветов</strong><span>${colors.length}</span></div>
    </div>`;

    html += `<h3>📏 Размеры «${selectedModel}»</h3><table class="size-model-table"><thead><tr><th>Размер</th><th>Кол-во</th><th>%</th></tr></thead><tbody>`;
    sizes.forEach(([s,q]) => html += `<tr><td><span class="highlight">${s}</span></td><td>${q}</td><td>${total?((q/total)*100).toFixed(1):0}%</td></tr>`);
    html += `</tbody></table>`;

    html += `<h3>🎨 Цвета «${selectedModel}»</h3><table class="size-model-table"><thead><tr><th>Цвет</th><th>Кол-во</th></tr></thead><tbody>`;
    colors.forEach(([c,q]) => html += `<tr><td>${c}</td><td>${q}</td></tr>`);
    html += `</tbody></table>`;

    const sizeList = [...new Set(modelEntries.map(e=>e.size))].sort();
    const colorList = [...new Set(modelEntries.map(e=>e.color||'без цвета'))].sort();
    html += `<h3>🔍 Размер × Цвет</h3><table class="size-model-table"><thead><tr><th>Размер \\ Цвет</th>${colorList.map(c=>`<th>${c}</th>`).join('')}<th>Итого</th></tr></thead><tbody>`;
    sizeList.forEach(s => {
      html += `<tr><td><strong>${s}</strong></td>`;
      let rt = 0;
      colorList.forEach(c => {
        const q = modelEntries.filter(e=>e.size===s&&(e.color||'без цвета')===c).reduce((a,e)=>a+(e.quantity||0),0);
        rt += q;
        html += `<td>${q||'-'}</td>`;
      });
      html += `<td><strong>${rt}</strong></td></tr>`;
    });
    html += `</tbody></table>`;

    const empBreakdown = groupSum(modelEntries, e => e.employee);
    html += `<h3>👥 Сотрудники</h3><ul class="top-list">${empBreakdown.map(([e,q])=>`<li><span>${e}</span><span>${q}</span></li>`).join('')}</ul>`;

    appContent.innerHTML = html;
    document.querySelectorAll('[data-model]').forEach(b => b.addEventListener('click', () => setModel(b.dataset.model)));
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], {type: mime});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ========== TAB: SETTINGS ==========
  function renderSettings() {
    let html = navHtml() + `<h2>⚙️ Настройки</h2>`;
    html += `<div class="settings-list"><strong>👥 Сотрудники</strong><div id="empList">${employees.map((e,i)=>`<div class="inline-edit"><input value="${e}" data-idx="${i}" class="empVal"><button class="chip delEmp" data-idx="${i}">✕</button></div>`).join('')}</div><div class="inline-edit"><input placeholder="Добавить" id="addEmp"><button class="chip" id="addEmpBtn">+</button></div></div>`;
    html += `<div class="settings-list"><strong>👕 Модели</strong><div id="modelList">${models.map((m,i)=>`<div class="inline-edit"><input value="${m}" data-idx="${i}" class="modelVal"><button class="chip delModel" data-idx="${i}">✕</button></div>`).join('')}</div><div class="inline-edit"><input placeholder="Добавить" id="addModel"><button class="chip" id="addModelBtn">+</button></div></div>`;
    html += `<div class="settings-list"><strong>🎨 Быстрые цвета</strong><div id="colorList">${quickColors.map((c,i)=>`<div class="inline-edit"><input value="${c}" data-idx="${i}" class="colorVal"><button class="chip delColor" data-idx="${i}">✕</button></div>`).join('')}</div><div class="inline-edit"><input placeholder="Добавить" id="addColor"><button class="chip" id="addColorBtn">+</button></div></div>`;
    html += `<div class="settings-list"><strong>📏 Быстрые размеры</strong><div id="sizeList">${quickSizes.map((s,i)=>`<div class="inline-edit"><input value="${s}" data-idx="${i}" class="sizeVal"><button class="chip delSize" data-idx="${i}">✕</button></div>`).join('')}</div><div class="inline-edit"><input placeholder="Добавить" id="addSize"><button class="chip" id="addSizeBtn">+</button></div></div>`;
    html += `<hr><div class="install-info"><strong>📱 Установка приложения</strong><p>Откройте в Chrome на телефоне → «⋮» → «Установить приложение»</p><p style="font-size:12px;opacity:0.7;">Работает офлайн. Данные на устройстве.</p></div>`;
    appContent.innerHTML = html;

    function bindList(cls, list) {
      document.querySelectorAll(`.${cls}`).forEach(inp => inp.addEventListener('input', (e) => { list[+e.target.dataset.idx] = e.target.value; persistAll(); }));
    }
    bindList('empVal', employees);
    bindList('modelVal', models);
    bindList('colorVal', quickColors);
    bindList('sizeVal', quickSizes);

    document.querySelectorAll('.delEmp').forEach(b => b.addEventListener('click', function() { employees.splice(+this.dataset.idx,1); persistAll(); renderSettings(); }));
    document.querySelectorAll('.delModel').forEach(b => b.addEventListener('click', function() { models.splice(+this.dataset.idx,1); persistAll(); renderSettings(); }));
    document.querySelectorAll('.delColor').forEach(b => b.addEventListener('click', function() { quickColors.splice(+this.dataset.idx,1); persistAll(); renderSettings(); }));
    document.querySelectorAll('.delSize').forEach(b => b.addEventListener('click', function() { quickSizes.splice(+this.dataset.idx,1); persistAll(); renderSettings(); }));

    document.getElementById('addEmpBtn').addEventListener('click', () => { const v = document.getElementById('addEmp').value.trim(); if(v&&!employees.includes(v)){employees.push(v);persistAll();renderSettings();} });
    document.getElementById('addModelBtn').addEventListener('click', () => { const v = document.getElementById('addModel').value.trim(); if(v&&!models.includes(v)){models.push(v);persistAll();renderSettings();} });
    document.getElementById('addColorBtn').addEventListener('click', () => { const v = document.getElementById('addColor').value.trim(); if(v&&!quickColors.includes(v)){quickColors.push(v);persistAll();renderSettings();} });
    document.getElementById('addSizeBtn').addEventListener('click', () => { const v = document.getElementById('addSize').value.trim(); if(v&&!quickSizes.includes(v)){quickSizes.push(v);persistAll();renderSettings();} });
  }

  // ========== NAVIGATION ==========
  appContent.addEventListener('click', (e) => {
    if (e.target.dataset.tab) { currentTab = e.target.dataset.tab; render(); }
  });

  render();
})();
