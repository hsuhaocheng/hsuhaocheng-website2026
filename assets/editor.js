// Weebly-Style Interactive Visual Editor (v2 - Upload, Drag Resize, Free Columns, Social Icons)
(function() {
  let isEditMode = true;
  let undoStack = [];
  let mediaCache = null;
  let mediaSelectCallback = null;
  let mediaMultiSelect = false;
  let selectedMediaSet = new Set();
  let insertAfterTarget = null;
  const API_BASE = window.location.protocol.startsWith('http') ? '' : 'http://localhost:8080';

  const SOCIAL_SVGS = {
    fb: {
      title: 'Facebook',
      defaultHref: 'https://www.facebook.com/hsu.hsu.sa/',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M15.12 5.32H17V2.14A26.11 26.11 0 0 0 14.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.62H6.61v3.56h3.07V22h3.68v-9.12h3.06l.46-3.56h-3.52V6.65c0-1.05.29-1.73 1.76-1.73Z"/></svg>'
    },
    ig: {
      title: 'Instagram',
      defaultHref: 'https://www.instagram.com/hsu__hao/',
      svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z"/></svg>'
    },
    email: {
      title: 'Email',
      defaultHref: 'mailto:hsuhao23@gmail.com',
      svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>'
    }
  };

  function getCurrentPageFile() {
    let p = decodeURIComponent(window.location.pathname).replace(/\\/g, '/').split('/').pop();
    return p || 'index.html';
  }

  function pushUndo() {
    const main = document.querySelector('.site-main');
    if (!main) return;
    const snap = getCleanMainHTML();
    if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== snap) {
      undoStack.push(snap);
      if (undoStack.length > 30) undoStack.shift();
    }
    setStatus('尚未儲存變更 *', '#fbbf24');
  }

  function setStatus(text, color) {
    const el = document.getElementById('wb-status-msg');
    if (el) {
      el.textContent = text;
      el.style.color = color || '#9ca3af';
    }
  }

  // Strip editor UI artifacts before saving or snapshotting
  function getCleanMainHTML() {
    const main = document.querySelector('.site-main');
    const clone = main.cloneNode(true);
    clone.querySelectorAll('.wb-block-toolbar, .wb-item-overlay, .wb-add-section-zone, .wb-resize-handle, .wb-social-row-bar, .wb-social-icon-del').forEach(el => el.remove());
    clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    return clone.innerHTML.trim();
  }

  // Inject Editor Top Bar & Modals
  function initEditorShell() {
    if (document.getElementById('wb-editor-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'wb-editor-bar';
    bar.innerHTML = `
      <div class="wb-bar-left">
        <span class="wb-brand">⚡ Weebly 編輯器</span>
        <button class="wb-btn primary" id="wb-toggle-mode-btn" onclick="window.WBEditor.toggleMode()">✏️ 編輯模式</button>
        <button class="wb-btn" onclick="window.WBEditor.openPagesModal()">📑 分頁管理</button>
        <button class="wb-btn" onclick="window.WBEditor.openAddBlockModal(null)">➕ 新增區塊/元件</button>
        <button class="wb-btn" onclick="document.getElementById('wb-global-file-input').click()">📤 上傳新圖片</button>
        <input type="file" id="wb-global-file-input" multiple accept="image/*" style="display:none" onchange="window.WBEditor.handleFileUpload(this.files, true)" />
        <button class="wb-btn" onclick="window.WBEditor.undo()">↩️ 復原</button>
      </div>
      <div class="wb-bar-right">
        <span id="wb-status-msg" class="wb-status">可拉動圖片右下角 ↘ 縮放、點文字修改、移至元件上方調整</span>
        <button class="wb-btn success" onclick="window.WBEditor.savePage()">💾 儲存此頁 (Ctrl+S)</button>
      </div>
    `;
    document.body.prepend(bar);

    // Modals Container
    const modals = document.createElement('div');
    modals.innerHTML = `
      <!-- Pages Manager Modal -->
      <div id="wb-pages-modal" class="wb-modal-backdrop">
        <div class="wb-modal">
          <div class="wb-modal-header">
            <span>📑 網站分頁與導覽列管理（刪除不要的分頁、改名、調整順序）</span>
            <button class="wb-btn" onclick="window.WBEditor.closeModals()">✕</button>
          </div>
          <div class="wb-modal-body">
            <p style="font-size:13px;color:#475569;margin-bottom:12px;">
              您可以在此直接刪除不需要的分頁、修改分頁顯示名稱或上下移動順序。點擊「儲存並同步全站導覽列」後，所有頁面的上方選單會自動更新。
            </p>
            <div id="wb-pages-list"></div>
            <div style="margin-top:14px;display:flex;gap:8px;">
              <button class="wb-btn" style="background:#f1f5f9;color:#1e293b;border-color:#cbd5e1;" onclick="window.WBEditor.addNewNavPage(false)">➕ 新增主分頁</button>
              <button class="wb-btn" style="background:#f1f5f9;color:#1e293b;border-color:#cbd5e1;" onclick="window.WBEditor.addNewNavPage(true)">➕ 新增下拉子分頁</button>
            </div>
          </div>
          <div class="wb-modal-footer">
            <button class="wb-btn" onclick="window.WBEditor.closeModals()">取消</button>
            <button class="wb-btn success" onclick="window.WBEditor.saveNavChanges()">💾 儲存並同步全站導覽列</button>
          </div>
        </div>
      </div>

      <!-- Add Block Modal -->
      <div id="wb-addblock-modal" class="wb-modal-backdrop">
        <div class="wb-modal" style="max-width:600px;">
          <div class="wb-modal-header">
            <span>➕ 選擇要插入的元件區塊</span>
            <button class="wb-btn" onclick="window.WBEditor.closeModals()">✕</button>
          </div>
          <div class="wb-modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <button class="wb-btn" style="padding:16px;justify-content:center;font-size:14px;background:#eff6ff;color:#1d4ed8;border-color:#93c5fd;" onclick="window.WBEditor.insertBlock('illus-split')">🎨 Illustration 年份排版 (左大圖+右相簿)</button>
            <button class="wb-btn" style="padding:16px;justify-content:center;font-size:14px;background:#eff6ff;color:#1d4ed8;border-color:#93c5fd;" onclick="window.WBEditor.insertBlock('works-item')">🎬 Works 專案區塊 (黑底按鈕+置中大圖)</button>
            <button class="wb-btn" style="padding:16px;justify-content:center;font-size:14px;" onclick="window.WBEditor.insertBlock('single-image')">🌄 單張圖片 (可自由縮放/並排)</button>
            <button class="wb-btn" style="padding:16px;justify-content:center;font-size:14px;" onclick="window.WBEditor.insertBlock('two-col')">📐 多欄並排 (圖+圖 / 圖+文)</button>
            <button class="wb-btn" style="padding:16px;justify-content:center;font-size:14px;" onclick="window.WBEditor.insertBlock('gallery')">🖼️ 相簿網格 (Gallery)</button>
            <button class="wb-btn" style="padding:16px;justify-content:center;font-size:14px;" onclick="window.WBEditor.insertBlock('social')">📱 FB / IG / Email 社群按鈕列</button>
            <button class="wb-btn" style="padding:16px;justify-content:center;font-size:14px;" onclick="window.WBEditor.insertBlock('text')">📝 標題與文字段落</button>
            <button class="wb-btn" style="padding:16px;justify-content:center;font-size:14px;" onclick="window.WBEditor.insertBlock('youtube')">🎬 YouTube 影片嵌入</button>
          </div>
        </div>
      </div>

      <!-- Media Library Picker Modal -->
      <div id="wb-media-modal" class="wb-modal-backdrop">
        <div class="wb-modal">
          <div class="wb-modal-header">
            <span id="wb-media-modal-title">🖼️ 選擇圖片或上傳新圖片</span>
            <button class="wb-btn" onclick="window.WBEditor.closeModals()">✕</button>
          </div>
          <div class="wb-modal-body">
            <div class="wb-upload-banner">
              <div>
                <strong style="color:#1e40af;font-size:14px;">📤 從電腦上傳新圖片 / GIF</strong>
                <div style="font-size:12px;color:#475569;">上傳後會自動存入 <code>uploads/custom/</code> 並顯示在最上方</div>
              </div>
              <div>
                <button class="wb-btn primary" onclick="document.getElementById('wb-modal-file-input').click()">➕ 選擇電腦檔案上傳</button>
                <input type="file" id="wb-modal-file-input" multiple accept="image/*" style="display:none" onchange="window.WBEditor.handleFileUpload(this.files, false)" />
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <input type="text" id="wb-media-search" placeholder="🔍 搜尋檔名 (例如: character, dea, s12, pigeon, gif...)" style="flex:1;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;" oninput="window.WBEditor.renderMediaGrid()" />
              <input type="text" id="wb-media-custom-url" placeholder="或直接貼上外部圖片網址..." style="width:230px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" />
            </div>
            <div id="wb-media-grid" class="wb-media-grid">載入圖庫中...</div>
          </div>
          <div class="wb-modal-footer">
            <button class="wb-btn" onclick="window.WBEditor.closeModals()">取消</button>
            <button class="wb-btn success" onclick="window.WBEditor.confirmMediaSelection()">✔ 確認選擇</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modals);
  }

  // Upload files from computer to /api/upload
  async function handleFileUpload(fileList, insertDirectly) {
    if (!fileList || !fileList.length) return;
    setStatus('正在上傳圖片...', '#60a5fa');
    const filesPayload = [];
    for (const file of Array.from(fileList)) {
      const b64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      filesPayload.push({ name: file.name, data: b64 });
    }
    try {
      const resp = await fetch(API_BASE + '/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesPayload })
      });
      const res = await resp.json();
      if (res.ok && res.uploaded) {
        mediaCache = null;
        await loadMediaList();
        setStatus(`✔ 成功上傳 ${res.uploaded.length} 張圖片！`, '#34d399');
        if (document.getElementById('wb-media-modal').classList.contains('open')) {
          res.uploaded.forEach(u => selectedMediaSet.add(u.disp));
          renderMediaGrid();
        } else if (insertDirectly && res.uploaded.length) {
          pushUndo();
          const main = document.querySelector('.site-main');
          const wrapper = document.createElement('div');
          wrapper.className = 'section-block';
          if (res.uploaded.length === 1) {
            const u = res.uploaded[0];
            wrapper.innerHTML = `<div class="single-image align-center" style="max-width: 600px;"><img src="${u.disp}" data-full="${u.full}" alt="" loading="lazy" onclick="openLightbox(this)" /></div>`;
          } else {
            const itemsHtml = res.uploaded.map(u => `<div class="gallery-item"><img src="${u.disp}" data-full="${u.full}" alt="" loading="lazy" onclick="openLightbox(this)" /></div>`).join('\n');
            wrapper.innerHTML = `<div class="gallery-grid cols-3" style="gap: 10px;">${itemsHtml}</div>`;
          }
          placeNewBlock(wrapper);
        }
      } else {
        alert('上傳失敗：' + (res.error || '未知錯誤'));
      }
    } catch (e) {
      alert('上傳失敗：請確認已啟動本地編輯伺服器 (start_editor.bat)');
    }
  }

  function createSocialIconEl(type) {
    const info = SOCIAL_SVGS[type];
    if (!info) return null;
    const href = prompt(`請輸入 ${info.title} 的連結或信箱 (若是信箱請保留 mailto:):`, info.defaultHref);
    if (!href) return null;
    const a = document.createElement('a');
    a.href = href;
    if (!href.startsWith('mailto:')) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    a.className = 'home-social-icon';
    a.title = info.title;
    a.innerHTML = info.svg;
    return a;
  }

  // Decorate all blocks and items with interactive Weebly controls
  function refreshEditControls() {
    document.querySelectorAll('.wb-block-toolbar, .wb-item-overlay, .wb-add-section-zone, .wb-resize-handle, .wb-social-row-bar, .wb-social-icon-del').forEach(el => el.remove());

    if (!isEditMode) {
      document.body.classList.remove('weebly-edit-mode');
      document.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
      return;
    }

    document.body.classList.add('weebly-edit-mode');

    // Make text elements inline-editable
    const textSelectors = '.page-title, .section-heading, .year-divider, .img-caption, .project-card-btn, .works-btn, .about-info h1, .about-info p, .about-info li, .custom-text-p';
    document.querySelectorAll(textSelectors).forEach(el => {
      el.setAttribute('contenteditable', 'true');
      el.oninput = () => setStatus('尚未儲存變更 *', '#fbbf24');
    });

    // Prevent links inside .site-main from navigating while in Edit Mode
    document.querySelectorAll('.site-main a').forEach(a => {
      a.onclick = function(e) {
        if (isEditMode && !e.ctrlKey) {
          e.preventDefault();
        }
      };
    });

    document.querySelectorAll('.site-main img').forEach(img => {
      img.onclick = function(e) {
        if (!isEditMode && typeof window.openLightbox === 'function') {
          window.openLightbox(img);
        }
      };
    });

    // 1. Decorate top-level blocks inside .site-main
    const main = document.querySelector('.site-main');
    if (!main) return;

    Array.from(main.children).forEach(block => {
      if (block.classList.contains('wb-add-section-zone')) return;

      const tb = document.createElement('div');
      tb.className = 'wb-block-toolbar';
      tb.contentEditable = 'false';

      // Move Up / Down
      const upBtn = document.createElement('button');
      upBtn.textContent = '⬆️ 上移';
      upBtn.onclick = (e) => {
        e.stopPropagation();
        const prev = block.previousElementSibling;
        if (prev) {
          pushUndo();
          main.insertBefore(block, prev);
          refreshEditControls();
        }
      };

      const downBtn = document.createElement('button');
      downBtn.textContent = '⬇️ 下移';
      downBtn.onclick = (e) => {
        e.stopPropagation();
        const next = block.nextElementSibling;
        if (next && !next.classList.contains('wb-add-section-zone')) {
          pushUndo();
          main.insertBefore(next, block);
          refreshEditControls();
        }
      };

      tb.appendChild(upBtn);
      tb.appendChild(downBtn);

      // If block has a .cols-row (multi-column layout), add free column controls!
      const colsRow = block.querySelector('.cols-row');
      if (colsRow) {
        const sep = document.createElement('span');
        sep.className = 'wb-toolbar-sep';
        tb.appendChild(sep);

        const addColImgBtn = document.createElement('button');
        addColImgBtn.textContent = '➕ 並排加圖欄';
        addColImgBtn.onclick = (e) => {
          e.stopPropagation();
          openMediaPicker(false, (sel) => {
            if (!sel.length) return;
            pushUndo();
            const col = document.createElement('div');
            col.className = 'col';
            col.innerHTML = `<div class="single-image align-center" style="max-width: 100%;"><img src="${sel[0].disp}" data-full="${sel[0].full}" alt="" loading="lazy" onclick="openLightbox(this)" /></div>`;
            colsRow.appendChild(col);
            refreshEditControls();
          });
        };
        tb.appendChild(addColImgBtn);

        const addColTxtBtn = document.createElement('button');
        addColTxtBtn.textContent = '➕ 並排加文字欄';
        addColTxtBtn.onclick = (e) => {
          e.stopPropagation();
          pushUndo();
          const col = document.createElement('div');
          col.className = 'col';
          col.innerHTML = `<h2 class="section-heading">標題</h2><p class="custom-text-p" style="color:#626262;">點擊輸入並排文字內容...</p>`;
          colsRow.appendChild(col);
          refreshEditControls();
        };
        tb.appendChild(addColTxtBtn);

        // Ratio preset selector for 2-column rows
        const ratioSel = document.createElement('select');
        ratioSel.title = '調整左右欄位寬度比例';
        [
          { label: '欄寬比例', val: '' },
          { label: '50% : 50% (均分)', val: '1,1' },
          { label: '40% : 60% (左窄右寬)', val: '2,3' },
          { label: '60% : 40% (左寬右窄)', val: '3,2' },
          { label: '33% : 67% (1:2)', val: '1,2' },
          { label: '67% : 33% (2:1)', val: '2,1' },
        ].forEach(optData => {
          const o = document.createElement('option');
          o.value = optData.val;
          o.textContent = optData.label;
          ratioSel.appendChild(o);
        });
        ratioSel.onchange = (e) => {
          if (!e.target.value) return;
          pushUndo();
          const parts = e.target.value.split(',').map(Number);
          const cols = Array.from(colsRow.querySelectorAll(':scope > .col'));
          cols.forEach((c, i) => {
            c.style.flex = String(parts[i] || 1);
          });
        };
        tb.appendChild(ratioSel);
      }

      // If block has a gallery-grid, add gallery controls!
      const gal = block.querySelector('.gallery-grid');
      if (gal) {
        const sep = document.createElement('span');
        sep.className = 'wb-toolbar-sep';
        tb.appendChild(sep);

        const colSelect = document.createElement('select');
        colSelect.title = '調整相簿欄數';
        [1, 2, 3, 4, 5].forEach(n => {
          const opt = document.createElement('option');
          opt.value = n;
          opt.textContent = `${n} 欄`;
          if (gal.classList.contains(`cols-${n}`)) opt.selected = true;
          colSelect.appendChild(opt);
        });
        colSelect.onchange = (e) => {
          pushUndo();
          [1, 2, 3, 4, 5].forEach(n => gal.classList.remove(`cols-${n}`));
          gal.classList.add(`cols-${e.target.value}`);
        };
        tb.appendChild(colSelect);

        const ratioSelect = document.createElement('select');
        ratioSelect.title = '調整縮圖裁切比例';
        [
          { val: 'none', label: '原圖比例' },
          { val: 'ratio-rect', label: '4:3 整齊矩形' },
          { val: 'ratio-square', label: '1:1 正方形' }
        ].forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.val;
          opt.textContent = r.label;
          if (r.val !== 'none' && gal.classList.contains(r.val)) opt.selected = true;
          ratioSelect.appendChild(opt);
        });
        ratioSelect.onchange = (e) => {
          pushUndo();
          gal.classList.remove('ratio-rect', 'ratio-square');
          if (e.target.value !== 'none') gal.classList.add(e.target.value);
        };
        tb.appendChild(ratioSelect);

        const addImgBtn = document.createElement('button');
        addImgBtn.textContent = '➕ 加圖';
        addImgBtn.onclick = (e) => {
          e.stopPropagation();
          openMediaPicker(true, (selectedList) => {
            pushUndo();
            selectedList.forEach(item => {
              const div = document.createElement('div');
              div.className = 'gallery-item';
              div.innerHTML = `<img src="${item.disp}" data-full="${item.full}" alt="" loading="lazy" onclick="openLightbox(this)" />`;
              gal.appendChild(div);
            });
            refreshEditControls();
          });
        };
        tb.appendChild(addImgBtn);
      }

      // If block is works-item, allow setting the project link for both button and cover image
      if (block.classList.contains('works-item')) {
        const linkBtn = document.createElement('button');
        linkBtn.textContent = '🔗 設定專案連結';
        linkBtn.onclick = (e) => {
          e.stopPropagation();
          const btnA = block.querySelector('.works-btn');
          const curHref = btnA ? btnA.getAttribute('href') : 'works.html';
          const nextHref = prompt('請輸入點擊按鈕與大圖後要前往的分頁檔名或網址:', curHref);
          if (nextHref) {
            pushUndo();
            block.querySelectorAll('a').forEach(a => a.setAttribute('href', nextHref.trim()));
          }
        };
        tb.appendChild(linkBtn);
      }

      // If block is projects-grid, allow adding a project card
      if (block.classList.contains('projects-grid')) {
        const addCardBtn = document.createElement('button');
        addCardBtn.textContent = '➕ 新增專案卡片';
        addCardBtn.onclick = (e) => {
          e.stopPropagation();
          openMediaPicker(false, (selectedList) => {
            if (!selectedList.length) return;
            const link = prompt('請輸入點擊後要前往的分頁檔名 (例如 realign.html):', 'works.html');
            if (!link) return;
            const title = prompt('請輸入專案按鈕名稱:', 'NEW PROJECT');
            pushUndo();
            const a = document.createElement('a');
            a.href = link;
            a.className = 'project-card';
            a.innerHTML = `
              <div class="project-card-thumb">
                <img src="${selectedList[0].disp}" alt="${title || ''}" loading="lazy" />
              </div>
              <span class="project-card-btn">${title || 'PROJECT'}</span>
            `;
            block.appendChild(a);
            refreshEditControls();
          });
        };
        tb.appendChild(addCardBtn);
      }

      const addBelowBtn = document.createElement('button');
      addBelowBtn.textContent = '➕ 下方插入';
      addBelowBtn.onclick = (e) => {
        e.stopPropagation();
        openAddBlockModal(block);
      };
      tb.appendChild(addBelowBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'wb-del-btn';
      delBtn.textContent = '🗑️ 刪除區塊';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('確定要刪除整個區塊嗎？（可按上方「復原」恢復）')) {
          pushUndo();
          block.remove();
          refreshEditControls();
        }
      };
      tb.appendChild(delBtn);

      block.appendChild(tb);
    });

    // 2. Decorate columns inside .cols-row (skip .illus-split fixed 42:58 layout columns)
    document.querySelectorAll('.cols-row:not(.illus-split) > .col').forEach(col => {
      const ov = document.createElement('div');
      ov.className = 'wb-item-overlay';
      ov.style.top = '-12px';
      ov.style.left = '6px';
      ov.style.right = 'auto';
      ov.contentEditable = 'false';

      const leftBtn = document.createElement('button');
      leftBtn.textContent = '◀ 欄左移';
      leftBtn.onclick = (e) => {
        e.stopPropagation();
        const prev = col.previousElementSibling;
        if (prev) { pushUndo(); col.parentNode.insertBefore(col, prev); }
      };

      const rightBtn = document.createElement('button');
      rightBtn.textContent = '欄右移 ▶';
      rightBtn.onclick = (e) => {
        e.stopPropagation();
        const next = col.nextElementSibling;
        if (next) { pushUndo(); col.parentNode.insertBefore(next, col); }
      };

      const delColBtn = document.createElement('button');
      delColBtn.className = 'wb-del-btn';
      delColBtn.textContent = '🗑️ 刪欄';
      delColBtn.onclick = (e) => {
        e.stopPropagation();
        pushUndo();
        col.remove();
        refreshEditControls();
      };

      ov.append(leftBtn, rightBtn, delColBtn);
      col.appendChild(ov);
    });

    // 3. Decorate individual gallery items (.gallery-item)
    document.querySelectorAll('.gallery-item').forEach(item => {
      const ov = document.createElement('div');
      ov.className = 'wb-item-overlay';
      ov.contentEditable = 'false';

      const leftBtn = document.createElement('button');
      leftBtn.textContent = '◀';
      leftBtn.title = '往前移';
      leftBtn.onclick = (e) => {
        e.stopPropagation();
        const prev = item.previousElementSibling;
        if (prev) { pushUndo(); item.parentNode.insertBefore(item, prev); }
      };

      const rightBtn = document.createElement('button');
      rightBtn.textContent = '▶';
      rightBtn.title = '往後移';
      rightBtn.onclick = (e) => {
        e.stopPropagation();
        const next = item.nextElementSibling;
        if (next) { pushUndo(); item.parentNode.insertBefore(next, item); }
      };

      const replaceBtn = document.createElement('button');
      replaceBtn.textContent = '🔄 換圖';
      replaceBtn.onclick = (e) => {
        e.stopPropagation();
        const img = item.querySelector('img');
        openMediaPicker(false, (sel) => {
          if (sel.length && img) {
            pushUndo();
            img.src = sel[0].disp;
            img.setAttribute('data-full', sel[0].full);
          }
        });
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'wb-del-btn';
      delBtn.textContent = '🗑️';
      delBtn.title = '刪除此張圖';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        pushUndo();
        item.remove();
      };

      // If inside an .illus-split block, allow swapping this gallery thumbnail with the left featured image!
      const splitBlock = item.closest('.illus-split');
      if (splitBlock) {
        const makeFeatBtn = document.createElement('button');
        makeFeatBtn.textContent = '⭐ 設左主圖';
        makeFeatBtn.title = '將這張圖與左方大張主圖對調位置';
        makeFeatBtn.onclick = (e) => {
          e.stopPropagation();
          const featImg = splitBlock.querySelector('.col-featured .single-image img');
          const thisImg = item.querySelector('img');
          if (featImg && thisImg) {
            pushUndo();
            const tmpSrc = featImg.getAttribute('src');
            const tmpFull = featImg.getAttribute('data-full') || tmpSrc;
            const thisSrc = thisImg.getAttribute('src');
            const thisFull = thisImg.getAttribute('data-full') || thisSrc;
            featImg.setAttribute('src', thisSrc);
            featImg.setAttribute('data-full', thisFull);
            thisImg.setAttribute('src', tmpSrc);
            thisImg.setAttribute('data-full', tmpFull);
          }
        };
        ov.appendChild(makeFeatBtn);
      }

      ov.append(leftBtn, rightBtn, replaceBtn, delBtn);
      item.appendChild(ov);
    });

    // 4. Decorate single images (.single-image) with Alignment, Link, Side-by-Side, and Drag-to-Resize Handle!
    document.querySelectorAll('.single-image').forEach(single => {
      const ov = document.createElement('div');
      ov.className = 'wb-item-overlay';
      ov.contentEditable = 'false';

      // Align Left / Center / Right
      [
        { label: '⬅️', cls: 'align-left', title: '靠左對齊' },
        { label: '↔️', cls: 'align-center', title: '置中對齊' },
        { label: '➡️', cls: 'align-right', title: '靠右對齊' }
      ].forEach(al => {
        const b = document.createElement('button');
        b.textContent = al.label;
        b.title = al.title;
        b.onclick = (e) => {
          e.stopPropagation();
          pushUndo();
          single.classList.remove('align-left', 'align-center', 'align-right');
          single.classList.add(al.cls);
          if (al.cls === 'align-left') {
            single.style.marginLeft = '0';
            single.style.marginRight = 'auto';
            single.style.textAlign = 'left';
          } else if (al.cls === 'align-right') {
            single.style.marginLeft = 'auto';
            single.style.marginRight = '0';
            single.style.textAlign = 'right';
          } else {
            single.style.marginLeft = 'auto';
            single.style.marginRight = 'auto';
            single.style.textAlign = 'center';
          }
        };
        ov.appendChild(b);
      });

      const sizeBtn = document.createElement('button');
      sizeBtn.textContent = '📐 寬度';
      sizeBtn.title = '輸入寬度或拉動圖片右下角藍色方塊縮放';
      sizeBtn.onclick = (e) => {
        e.stopPropagation();
        const cur = single.style.maxWidth || '100%';
        const next = prompt('請輸入最大寬度 (例如 100%, 65%, 450px)，或直接拉動圖片右下角 ↘ 縮放:', cur);
        if (next) {
          pushUndo();
          single.style.maxWidth = next;
        }
      };

      const linkBtn = document.createElement('button');
      linkBtn.textContent = '🔗 連結';
      linkBtn.title = '設定點擊圖片跳轉的分頁或網址';
      linkBtn.onclick = (e) => {
        e.stopPropagation();
        const existingA = single.querySelector('a.img-link');
        const curHref = existingA ? existingA.getAttribute('href') : '';
        const nextHref = prompt('設定點擊圖片前往的分頁或網址 (留空則點擊放大原圖):', curHref);
        if (nextHref === null) return;
        pushUndo();
        const img = single.querySelector('img');
        if (!img) return;
        if (nextHref.trim() === '') {
          if (existingA) {
            single.insertBefore(img, existingA);
            existingA.remove();
          }
        } else {
          if (existingA) {
            existingA.setAttribute('href', nextHref.trim());
          } else {
            const a = document.createElement('a');
            a.className = 'img-link';
            a.href = nextHref.trim();
            single.insertBefore(a, img);
            a.appendChild(img);
          }
        }
      };

      // If not already inside a .cols-row, allow turning into a 2-column side-by-side row!
      if (!single.closest('.cols-row')) {
        const makeColBtn = document.createElement('button');
        makeColBtn.textContent = '➕ 並排';
        makeColBtn.title = '在旁邊新增並排圖片（變成雙欄自由排版）';
        makeColBtn.onclick = (e) => {
          e.stopPropagation();
          openMediaPicker(false, (sel) => {
            if (!sel.length) return;
            pushUndo();
            const row = document.createElement('div');
            row.className = 'cols-row';
            row.style.alignItems = 'center';
            const col1 = document.createElement('div');
            col1.className = 'col';
            const col2 = document.createElement('div');
            col2.className = 'col';
            single.parentNode.insertBefore(row, single);
            col1.appendChild(single);
            col2.innerHTML = `<div class="single-image align-center" style="max-width: 100%;"><img src="${sel[0].disp}" data-full="${sel[0].full}" alt="" loading="lazy" onclick="openLightbox(this)" /></div>`;
            row.append(col1, col2);
            refreshEditControls();
          });
        };
        ov.appendChild(makeColBtn);
      }

      const replaceBtn = document.createElement('button');
      replaceBtn.textContent = '🔄 換圖';
      replaceBtn.onclick = (e) => {
        e.stopPropagation();
        const img = single.querySelector('img');
        openMediaPicker(false, (sel) => {
          if (sel.length && img) {
            pushUndo();
            img.src = sel[0].disp;
            img.setAttribute('data-full', sel[0].full);
          }
        });
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'wb-del-btn';
      delBtn.textContent = '🗑️';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        pushUndo();
        const colParent = single.closest('.col');
        if (colParent && colParent.parentNode.classList.contains('cols-row') && colParent.parentNode.children.length > 1) {
          colParent.remove();
        } else {
          single.remove();
        }
        refreshEditControls();
      };

      ov.append(sizeBtn, linkBtn, replaceBtn, delBtn);
      single.appendChild(ov);

      // Drag-to-resize handle on bottom-right corner
      const handle = document.createElement('div');
      handle.className = 'wb-resize-handle';
      handle.textContent = '↘';
      handle.title = '按住滑鼠左右拖曳即可自由縮放圖片大小';
      handle.onmousedown = function(e) {
        e.preventDefault();
        e.stopPropagation();
        pushUndo();
        const startX = e.clientX;
        const startWidth = single.getBoundingClientRect().width;
        function onMove(ev) {
          const newW = Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
          single.style.maxWidth = newW + 'px';
          setStatus(`目前圖片寬度: ${newW}px (放開滑鼠完成縮放)`, '#60a5fa');
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          setStatus('尚未儲存變更 *', '#fbbf24');
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
      single.appendChild(handle);
    });

    // 5. Decorate Social Icon Rows (.home-social-row) & Individual FB / IG / Email buttons
    document.querySelectorAll('.home-social-row').forEach(row => {
      // Decorate each existing icon inside the row
      Array.from(row.querySelectorAll('.home-social-icon')).forEach(icon => {
        // Clicking the icon in edit mode lets you change its URL / email
        icon.onclick = (e) => {
          if (!isEditMode) return;
          e.preventDefault();
          e.stopPropagation();
          const cur = icon.getAttribute('href') || '';
          const next = prompt(`修改 ${icon.title || '按鈕'} 連結網址 (Email 請加 mailto:):`, cur);
          if (next) {
            pushUndo();
            icon.setAttribute('href', next.trim());
          }
        };

        const delIconBtn = document.createElement('button');
        delIconBtn.className = 'wb-social-icon-del';
        delIconBtn.textContent = '×';
        delIconBtn.title = `單獨刪除 ${icon.title || '此按鈕'}`;
        delIconBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          pushUndo();
          icon.remove();
        };
        icon.appendChild(delIconBtn);
      });

      // Row toolbar for adding back FB / IG / Email or changing alignment
      const bar = document.createElement('div');
      bar.className = 'wb-social-row-bar';
      bar.contentEditable = 'false';

      [
        { type: 'fb', label: '+FB' },
        { type: 'ig', label: '+IG' },
        { type: 'email', label: '+Email' }
      ].forEach(btnInfo => {
        const b = document.createElement('button');
        b.textContent = btnInfo.label;
        b.title = `新增 ${btnInfo.label} 圖示按鈕`;
        b.onclick = (e) => {
          e.stopPropagation();
          const newIcon = createSocialIconEl(btnInfo.type);
          if (newIcon) {
            pushUndo();
            row.insertBefore(newIcon, bar);
            refreshEditControls();
          }
        };
        bar.appendChild(b);
      });

      // Alignment of the social row
      [
        { label: '⬅️', justify: 'flex-start', title: '靠左' },
        { label: '↔️', justify: 'center', title: '置中' },
        { label: '➡️', justify: 'flex-end', title: '靠右' }
      ].forEach(al => {
        const b = document.createElement('button');
        b.textContent = al.label;
        b.title = al.title;
        b.onclick = (e) => {
          e.stopPropagation();
          pushUndo();
          row.style.justifyContent = al.justify;
        };
        bar.appendChild(b);
      });

      const delRowBtn = document.createElement('button');
      delRowBtn.style.background = '#ef4444';
      delRowBtn.textContent = '🗑️ 刪整列';
      delRowBtn.onclick = (e) => {
        e.stopPropagation();
        pushUndo();
        row.remove();
      };
      bar.appendChild(delRowBtn);

      row.appendChild(bar);
    });

    // 6. Decorate project cards (.project-card)
    document.querySelectorAll('.project-card').forEach(card => {
      const ov = document.createElement('div');
      ov.className = 'wb-item-overlay';
      ov.contentEditable = 'false';

      const leftBtn = document.createElement('button');
      leftBtn.textContent = '◀';
      leftBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const prev = card.previousElementSibling;
        if (prev) { pushUndo(); card.parentNode.insertBefore(card, prev); }
      };

      const rightBtn = document.createElement('button');
      rightBtn.textContent = '▶';
      rightBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const next = card.nextElementSibling;
        if (next) { pushUndo(); card.parentNode.insertBefore(next, card); }
      };

      const replaceBtn = document.createElement('button');
      replaceBtn.textContent = '🔄 換封面';
      replaceBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const img = card.querySelector('img');
        openMediaPicker(false, (sel) => {
          if (sel.length && img) { pushUndo(); img.src = sel[0].disp; }
        });
      };

      const linkBtn = document.createElement('button');
      linkBtn.textContent = '🔗 連結';
      linkBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const nextHref = prompt('設定點擊卡片前往的分頁檔名:', card.getAttribute('href'));
        if (nextHref) { pushUndo(); card.setAttribute('href', nextHref); }
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'wb-del-btn';
      delBtn.textContent = '🗑️';
      delBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (confirm('確定要刪除此專案卡片嗎？')) {
          pushUndo();
          card.remove();
        }
      };

      ov.append(leftBtn, rightBtn, replaceBtn, linkBtn, delBtn);
      card.appendChild(ov);
    });

    // Bottom Add Section Button
    const bottomZone = document.createElement('div');
    bottomZone.className = 'wb-add-section-zone';
    bottomZone.innerHTML = `<button class="wb-add-section-btn" onclick="window.WBEditor.openAddBlockModal(null)">➕ 在頁面底部新增區塊 / 圖片 / 並排 / 社群按鈕 / 影片</button>`;
    main.appendChild(bottomZone);
  }

  // Media Library Modal
  async function loadMediaList() {
    if (mediaCache) return mediaCache;
    try {
      const resp = await fetch(API_BASE + '/api/media');
      mediaCache = await resp.json();
    } catch (e) {
      mediaCache = [];
    }
    return mediaCache;
  }

  async function openMediaPicker(multi, callback) {
    mediaMultiSelect = multi;
    mediaSelectCallback = callback;
    selectedMediaSet.clear();
    document.getElementById('wb-media-custom-url').value = '';
    document.getElementById('wb-media-modal-title').textContent = multi
      ? '🖼️ 選擇圖片（可點選多張圖片，或從上方上傳電腦圖片）'
      : '🖼️ 選擇單張圖片（或從上方上傳電腦圖片）';
    document.getElementById('wb-media-modal').classList.add('open');
    await loadMediaList();
    renderMediaGrid();
  }

  function renderMediaGrid() {
    const grid = document.getElementById('wb-media-grid');
    const q = (document.getElementById('wb-media-search').value || '').toLowerCase().trim();
    if (!mediaCache || !mediaCache.length) {
      grid.innerHTML = '<p>找不到圖片或未啟動本地編輯伺服器。</p>';
      return;
    }
    const filtered = mediaCache.filter(m => !q || m.name.toLowerCase().includes(q)).slice(0, 200);
    grid.innerHTML = '';
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'wb-media-card' + (selectedMediaSet.has(item.disp) ? ' selected' : '');
      card.innerHTML = `<img src="${item.disp}" loading="lazy" /><span>${item.name}</span>`;
      card.onclick = () => {
        if (!mediaMultiSelect) {
          selectedMediaSet.clear();
          selectedMediaSet.add(item.disp);
          confirmMediaSelection();
        } else {
          if (selectedMediaSet.has(item.disp)) selectedMediaSet.delete(item.disp);
          else selectedMediaSet.add(item.disp);
          card.classList.toggle('selected');
        }
      };
      grid.appendChild(card);
    });
  }

  function confirmMediaSelection() {
    const customUrl = document.getElementById('wb-media-custom-url').value.trim();
    let results = [];
    if (customUrl) {
      results.push({ disp: customUrl, full: customUrl });
    } else if (mediaCache) {
      selectedMediaSet.forEach(disp => {
        const found = mediaCache.find(m => m.disp === disp);
        if (found) results.push(found);
      });
    }
    closeModals();
    if (mediaSelectCallback && results.length) {
      mediaSelectCallback(results);
    }
  }

  // Add Block Logic
  function openAddBlockModal(afterEl) {
    insertAfterTarget = afterEl;
    document.getElementById('wb-addblock-modal').classList.add('open');
  }

  function insertBlock(type) {
    closeModals();
    const wrapper = document.createElement('div');
    wrapper.className = 'section-block';

    if (type === 'illus-split') {
      openMediaPicker(true, (sel) => {
        if (!sel.length) return;
        pushUndo();
        const feat = sel[0];
        const rest = sel.slice(1);
        const itemsHtml = (rest.length ? rest : [feat]).map(s => `<div class="gallery-item"><img src="${s.disp}" data-full="${s.full}" alt="" loading="lazy" onclick="openLightbox(this)" /></div>`).join('\n');
        wrapper.innerHTML = `
          <div class="cols-row illus-split">
            <div class="col col-featured">
              <div class="year-divider">2026 <strong>SEASON</strong></div>
              <div class="single-image align-center" style="max-width: 100%;">
                <img src="${feat.disp}" data-full="${feat.full}" alt="" loading="lazy" onclick="openLightbox(this)" />
              </div>
            </div>
            <div class="col col-gallery">
              <div class="gallery-grid cols-3" style="gap: 20px;">${itemsHtml}</div>
            </div>
          </div>
          <hr class="section-hr" />
        `;
        placeNewBlock(wrapper);
      });
      return;
    } else if (type === 'works-item') {
      openMediaPicker(false, (sel) => {
        if (!sel.length) return;
        const title = prompt('請輸入黑色專案按鈕名稱 (例如 NEW PROJECT):', 'NEW PROJECT') || 'NEW PROJECT';
        const link = prompt('請輸入點擊後前往的分頁檔名或網址 (例如 tadamm-da-les-fables.html):', 'works.html') || 'works.html';
        pushUndo();
        wrapper.className = 'section-block works-item';
        wrapper.innerHTML = `
          <div class="works-btn-wrap">
            <a href="${link}" class="works-btn">${title}</a>
          </div>
          <div class="single-image align-center" style="max-width: 584px;">
            <a href="${link}" class="img-link">
              <img src="${sel[0].disp}" data-full="${sel[0].full}" alt="${title}" loading="lazy" />
            </a>
          </div>
          <hr class="section-hr" />
        `;
        placeNewBlock(wrapper);
      });
      return;
    } else if (type === 'gallery') {
      openMediaPicker(true, (sel) => {
        pushUndo();
        const itemsHtml = sel.map(s => `<div class="gallery-item"><img src="${s.disp}" data-full="${s.full}" alt="" loading="lazy" onclick="openLightbox(this)" /></div>`).join('\n');
        wrapper.innerHTML = `
          <h2 class="section-heading">section title</h2>
          <div class="gallery-grid cols-3" style="gap: 10px;">${itemsHtml}</div>
        `;
        placeNewBlock(wrapper);
      });
      return;
    } else if (type === 'single-image') {
      openMediaPicker(false, (sel) => {
        if (!sel.length) return;
        pushUndo();
        wrapper.innerHTML = `
          <div class="single-image align-center" style="max-width: 600px;">
            <img src="${sel[0].disp}" data-full="${sel[0].full}" alt="" loading="lazy" onclick="openLightbox(this)" />
          </div>
        `;
        placeNewBlock(wrapper);
      });
      return;
    } else if (type === 'two-col') {
      openMediaPicker(true, (sel) => {
        if (!sel.length) return;
        pushUndo();
        const img1 = sel[0];
        const img2 = sel[1] || sel[0];
        wrapper.innerHTML = `
          <div class="cols-row" style="align-items: center;">
            <div class="col"><div class="single-image align-center" style="max-width: 100%;"><img src="${img1.disp}" data-full="${img1.full}" alt="" loading="lazy" onclick="openLightbox(this)" /></div></div>
            <div class="col"><div class="single-image align-center" style="max-width: 100%;"><img src="${img2.disp}" data-full="${img2.full}" alt="" loading="lazy" onclick="openLightbox(this)" /></div></div>
          </div>
        `;
        placeNewBlock(wrapper);
      });
      return;
    } else if (type === 'social') {
      pushUndo();
      wrapper.innerHTML = `
        <div class="home-social-row" style="margin: 12px 0;">
          <a href="${SOCIAL_SVGS.fb.defaultHref}" target="_blank" rel="noopener" class="home-social-icon" title="Facebook">${SOCIAL_SVGS.fb.svg}</a>
          <a href="${SOCIAL_SVGS.ig.defaultHref}" target="_blank" rel="noopener" class="home-social-icon" title="Instagram">${SOCIAL_SVGS.ig.svg}</a>
          <a href="${SOCIAL_SVGS.email.defaultHref}" class="home-social-icon" title="Email">${SOCIAL_SVGS.email.svg}</a>
        </div>
      `;
      placeNewBlock(wrapper);
    } else if (type === 'youtube') {
      const urlOrId = prompt('請輸入 YouTube 影片網址或 11 碼影片 ID (例如 4YTvXCWoWsc):', '');
      if (!urlOrId) return;
      let vid = urlOrId.trim();
      const m = vid.match(/(?:v=|youtu\.be\/|embed\/)([A-ZaX0-9_-]{11})/i);
      if (m) vid = m[1];
      pushUndo();
      wrapper.innerHTML = `
        <div class="video-container">
          <iframe src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe>
        </div>
      `;
      placeNewBlock(wrapper);
    } else if (type === 'year-divider') {
      pushUndo();
      const div = document.createElement('div');
      div.className = 'year-divider';
      div.innerHTML = `2025 <strong>CATEGORY TITLE</strong>`;
      placeNewBlock(div);
    } else if (type === 'text') {
      pushUndo();
      wrapper.innerHTML = `
        <h2 class="section-heading">標題文字</h2>
        <p class="custom-text-p" style="color:#626262;">點擊此處直接編輯段落內容...</p>
      `;
      placeNewBlock(wrapper);
    }
  }

  function placeNewBlock(newEl) {
    const main = document.querySelector('.site-main');
    if (insertAfterTarget && insertAfterTarget.parentNode === main) {
      main.insertBefore(newEl, insertAfterTarget.nextElementSibling);
    } else {
      const bottomZone = main.querySelector('.wb-add-section-zone');
      if (bottomZone) main.insertBefore(newEl, bottomZone);
      else main.appendChild(newEl);
    }
    refreshEditControls();
    newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Pages & Navigation Manager
  let currentNavState = [];

  function parseDomNav() {
    const navItems = [];
    const topLis = document.querySelectorAll('.site-nav > ul > li');
    topLis.forEach(li => {
      const a = li.querySelector(':scope > a');
      if (!a) return;
      const children = [];
      li.querySelectorAll(':scope > ul.dropdown > li > a').forEach(subA => {
        children.push({ label: subA.textContent.trim(), href: subA.getAttribute('href') });
      });
      navItems.push({
        label: a.textContent.trim(),
        href: a.getAttribute('href'),
        children: children
      });
    });
    return navItems;
  }

  function openPagesModal() {
    currentNavState = parseDomNav();
    renderPagesList();
    document.getElementById('wb-pages-modal').classList.add('open');
  }

  function renderPagesList() {
    const container = document.getElementById('wb-pages-list');
    container.innerHTML = '';
    currentNavState.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'wb-page-row';
      row.innerHTML = `
        <strong>主選單</strong>
        <input type="text" value="${item.label}" oninput="window.WBEditor.updateNavItem(${idx}, null, this.value)" />
        <span class="wb-page-file">📄 ${item.href}</span>
        <button class="wb-btn" onclick="window.location.href='${item.href}'" title="前往編輯此頁">前往 ↗</button>
        <button class="wb-btn" onclick="window.WBEditor.moveNavItem(${idx}, null, -1)">⬆️</button>
        <button class="wb-btn" onclick="window.WBEditor.moveNavItem(${idx}, null, 1)">⬇️</button>
        <button class="wb-btn danger" onclick="window.WBEditor.deleteNavItem(${idx}, null)">🗑️ 刪除分頁</button>
      `;
      container.appendChild(row);

      (item.children || []).forEach((sub, subIdx) => {
        const subRow = document.createElement('div');
        subRow.className = 'wb-page-row sub-page';
        subRow.innerHTML = `
          <span>↳ 子分頁</span>
          <input type="text" value="${sub.label}" oninput="window.WBEditor.updateNavItem(${idx}, ${subIdx}, this.value)" />
          <span class="wb-page-file">📄 ${sub.href}</span>
          <button class="wb-btn" onclick="window.location.href='${sub.href}'" title="前往編輯此頁">前往 ↗</button>
          <button class="wb-btn" onclick="window.WBEditor.moveNavItem(${idx}, ${subIdx}, -1)">⬆️</button>
          <button class="wb-btn" onclick="window.WBEditor.moveNavItem(${idx}, ${subIdx}, 1)">⬇️</button>
          <button class="wb-btn danger" onclick="window.WBEditor.deleteNavItem(${idx}, ${subIdx})">🗑️ 刪除分頁</button>
        `;
        container.appendChild(subRow);
      });
    });
  }

  function updateNavItem(idx, subIdx, val) {
    if (subIdx === null) currentNavState[idx].label = val;
    else currentNavState[idx].children[subIdx].label = val;
  }

  function moveNavItem(idx, subIdx, dir) {
    if (subIdx === null) {
      const target = idx + dir;
      if (target < 0 || target >= currentNavState.length) return;
      const tmp = currentNavState[idx];
      currentNavState[idx] = currentNavState[target];
      currentNavState[target] = tmp;
    } else {
      const list = currentNavState[idx].children;
      const target = subIdx + dir;
      if (target < 0 || target >= list.length) return;
      const tmp = list[subIdx];
      list[subIdx] = list[target];
      list[target] = tmp;
    }
    renderPagesList();
  }

  function deleteNavItem(idx, subIdx) {
    const targetItem = subIdx === null ? currentNavState[idx] : currentNavState[idx].children[subIdx];
    if (!confirm(`確定要從網站選單中刪除「${targetItem.label} (${targetItem.href})」分頁嗎？`)) return;
    if (subIdx === null) currentNavState.splice(idx, 1);
    else currentNavState[idx].children.splice(subIdx, 1);
    renderPagesList();
  }

  function addNewNavPage(asSubPage) {
    const label = prompt('請輸入新分頁顯示名稱:', 'New Page');
    if (!label) return;
    let slug = prompt('請輸入新分頁的檔案名稱 (英文小寫+.html):', label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.html');
    if (!slug) return;
    if (!slug.endsWith('.html')) slug += '.html';
    if (asSubPage) {
      const worksIdx = currentNavState.findIndex(i => i.href === 'works.html' || (i.children && i.children.length));
      const targetIdx = worksIdx >= 0 ? worksIdx : 0;
      currentNavState[targetIdx].children = currentNavState[targetIdx].children || [];
      currentNavState[targetIdx].children.push({ label, href: slug });
    } else {
      currentNavState.push({ label, href: slug, children: [] });
    }
    renderPagesList();
  }

  async function saveNavChanges() {
    setStatus('正在同步全站導覽列...', '#60a5fa');
    try {
      const resp = await fetch(API_BASE + '/api/nav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nav: currentNavState })
      });
      const res = await resp.json();
      if (res.ok) {
        closeModals();
        setStatus('✔ 全站導覽列與分頁已同步更新！', '#34d399');
        setTimeout(() => window.location.reload(), 400);
      } else {
        alert('儲存失敗：' + (res.error || '未知錯誤'));
      }
    } catch (e) {
      alert('無法連線至本地編輯伺服器，請確認已執行 start_editor.bat！');
    }
  }

  async function savePage() {
    setStatus('儲存中...', '#60a5fa');
    const payload = {
      file: getCurrentPageFile(),
      mainHtml: getCleanMainHTML(),
      logoText: 'hao-cheng hsu'
    };
    try {
      const resp = await fetch(API_BASE + '/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (data.ok) {
        setStatus('✔ 已成功儲存至硬碟 (' + payload.file + ')', '#34d399');
      } else {
        setStatus('儲存失敗: ' + data.error, '#f87171');
      }
    } catch (e) {
      alert('無法儲存至硬碟：請執行 start_editor.bat 啟動背景儲存服務！');
      setStatus('儲存失敗 (未連線本地伺服器)', '#f87171');
    }
  }

  function toggleMode() {
    isEditMode = !isEditMode;
    const btn = document.getElementById('wb-toggle-mode-btn');
    if (btn) {
      btn.textContent = isEditMode ? '✏️ 編輯模式' : '👁️ 預覽模式 (點此回編輯)';
      btn.className = isEditMode ? 'wb-btn primary' : 'wb-btn';
    }
    refreshEditControls();
  }

  function undo() {
    if (!undoStack.length) {
      alert('沒有可復原的步驟');
      return;
    }
    const prevHtml = undoStack.pop();
    const main = document.querySelector('.site-main');
    if (main) {
      main.innerHTML = prevHtml;
      refreshEditControls();
      setStatus('已復原上一步 (請記得按儲存)', '#fbbf24');
    }
  }

  function closeModals() {
    document.querySelectorAll('.wb-modal-backdrop').forEach(m => m.classList.remove('open'));
  }

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      savePage();
    }
  });

  window.WBEditor = {
    toggleMode,
    openPagesModal,
    openAddBlockModal,
    insertBlock,
    handleFileUpload,
    renderMediaGrid,
    confirmMediaSelection,
    updateNavItem,
    moveNavItem,
    deleteNavItem,
    addNewNavPage,
    saveNavChanges,
    savePage,
    undo,
    closeModals
  };

  window.addEventListener('DOMContentLoaded', () => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:' || window.location.search.includes('edit=1');
    if (!isLocal) return;
    initEditorShell();
    refreshEditControls();
  });
})();
