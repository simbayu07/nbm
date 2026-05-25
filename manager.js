// 数据状态
let allBookmarks = [];      // 扁平化的所有有 URL 的书签
let allTagsMap = {};       // bookmarkId -> tags array
let uniqueTags = [];       // unique tag strings (sorted alphabetically)
let tagCounts = {};        // tag -> count of bookmarks
let selectedTags = [];     // 当前用于筛选的标签列表
let currentView = 'all';   // 'all' 或 'untagged'
let searchQuery = '';
let modalActiveTags = [];  // 模态框中当前正在编辑的标签列表

// DOM 缓存
const navAll = document.getElementById('nav-all');
const navUntagged = document.getElementById('nav-untagged');
const countAll = document.getElementById('count-all');
const countUntagged = document.getElementById('count-untagged');
const sidebarTagsList = document.getElementById('sidebar-tags-list');
const btnClearTags = document.getElementById('btn-clear-tags');
const searchInput = document.getElementById('search-input');
const btnAddBookmark = document.getElementById('btn-add-bookmark');
const btnExport = document.getElementById('btn-export');
const btnImportTrigger = document.getElementById('btn-import-trigger');
const importFileInput = document.getElementById('import-file-input');
const filterStatusBar = document.getElementById('filter-status-bar');
const activeFilterChips = document.getElementById('active-filter-chips');
const btnResetFilters = document.getElementById('btn-reset-filters');
const viewTitle = document.getElementById('view-title');
const bookmarksCount = document.getElementById('bookmarks-count');
const bookmarksGrid = document.getElementById('bookmarks-grid');
const bookmarksEmpty = document.getElementById('bookmarks-empty');

// 模态框 DOM
const bookmarkModal = document.getElementById('bookmark-modal');
const modalTitle = document.getElementById('modal-title');
const bookmarkForm = document.getElementById('bookmark-form');
const formBookmarkId = document.getElementById('form-bookmark-id');
const formTitle = document.getElementById('form-title');
const formUrl = document.getElementById('form-url');
const modalActiveTagsEl = document.getElementById('modal-active-tags');
const modalTagInput = document.getElementById('modal-tag-input');
const modalSuggestionChips = document.getElementById('modal-suggestion-chips');
const btnCloseModals = document.querySelectorAll('.btn-close-modal');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  refreshData();
  setupEventListeners();
});

// 核心数据加载与界面刷新
function refreshData() {
  // 1. 获取本地标签数据
  chrome.storage.local.get(['bookmarkTags'], (result) => {
    allTagsMap = result.bookmarkTags || {};

    // 2. 递归拉取原生 Chrome 书签
    chrome.bookmarks.getTree((tree) => {
      allBookmarks = [];
      
      function collectBookmarks(nodes) {
        nodes.forEach(node => {
          if (node.url) {
            allBookmarks.push(node);
          }
          if (node.children) {
            collectBookmarks(node.children);
          }
        });
      }
      collectBookmarks(tree);

      // 3. 计算标签统计信息
      calculateTagsInfo();
      
      // 4. 更新侧边栏数量和分类
      updateSidebarUI();

      // 5. 渲染书签列表
      renderBookmarksGrid();
    });
  });
}

// 统计标签信息
function calculateTagsInfo() {
  tagCounts = {};
  const tagsSet = new Set();
  
  // 遍历所有有 URL 的书签，统计标签
  allBookmarks.forEach(bm => {
    const tags = allTagsMap[bm.id] || [];
    tags.forEach(tag => {
      tagsSet.add(tag);
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });

  uniqueTags = Array.from(tagsSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

// 刷新左侧边栏界面
function updateSidebarUI() {
  // 书签计数
  countAll.textContent = allBookmarks.length;
  
  const untaggedCount = allBookmarks.filter(bm => {
    const tags = allTagsMap[bm.id] || [];
    return tags.length === 0;
  }).length;
  countUntagged.textContent = untaggedCount;

  // 清除失效的标签数据 (书签已不在原生列表中，但在 storage 中残留的)
  const activeIds = new Set(allBookmarks.map(b => b.id));
  let storageNeedsUpdate = false;
  Object.keys(allTagsMap).forEach(id => {
    if (!activeIds.has(id)) {
      delete allTagsMap[id];
      storageNeedsUpdate = true;
    }
  });
  if (storageNeedsUpdate) {
    chrome.storage.local.set({ bookmarkTags: allTagsMap });
  }

  // 渲染侧边栏标签列表
  sidebarTagsList.innerHTML = '';
  if (uniqueTags.length === 0) {
    sidebarTagsList.innerHTML = '<div class="count-text" style="padding: 10px 8px;">无可用标签</div>';
    return;
  }

  uniqueTags.forEach(tag => {
    const isActive = selectedTags.includes(tag);
    const item = document.createElement('div');
    item.className = `tag-filter-item ${isActive ? 'active' : ''}`;
    
    // 复选框效果
    const checkbox = document.createElement('span');
    checkbox.className = 'tag-checkbox';
    
    // 渐变小圆点
    const dot = document.createElement('span');
    dot.className = 'tag-color-dot';
    const colors = getTagColors(tag);
    dot.style.backgroundColor = colors.text;
    dot.style.color = colors.text;

    const name = document.createElement('span');
    name.className = 'tag-name';
    name.textContent = tag;

    const count = document.createElement('span');
    count.className = 'badge';
    count.textContent = tagCounts[tag] || 0;

    item.appendChild(checkbox);
    item.appendChild(dot);
    item.appendChild(name);
    item.appendChild(count);

    item.addEventListener('click', () => toggleTagFilter(tag));
    sidebarTagsList.appendChild(item);
  });

  // 控制“清除选择”的显示
  if (selectedTags.length > 0) {
    btnClearTags.classList.remove('hidden');
  } else {
    btnClearTags.classList.add('hidden');
  }
}

// 渲染主内容区的书签列表
function renderBookmarksGrid() {
  bookmarksGrid.innerHTML = '';
  
  // 1. 根据视图和标签筛选符合条件的书签
  let filtered = allBookmarks.filter(bm => {
    // 视图过滤
    if (currentView === 'untagged') {
      const tags = allTagsMap[bm.id] || [];
      if (tags.length > 0) return false;
    }

    // 侧边栏多标签过滤 (交集过滤: 书签必须包含选中的所有标签)
    if (selectedTags.length > 0) {
      const tags = allTagsMap[bm.id] || [];
      const hasAllTags = selectedTags.every(t => tags.includes(t));
      if (!hasAllTags) return false;
    }

    // 搜索词过滤 (支持标题、URL、标签模糊匹配)
    if (searchQuery) {
      const titleMatch = bm.title.toLowerCase().includes(searchQuery);
      const urlMatch = bm.url.toLowerCase().includes(searchQuery);
      const tags = allTagsMap[bm.id] || [];
      const tagMatch = tags.some(tag => tag.toLowerCase().includes(searchQuery));
      if (!titleMatch && !urlMatch && !tagMatch) return false;
    }

    return true;
  });

  // 2. 更新标题和数量展示
  updateHeaderViewStatus(filtered.length);

  // 3. 渲染书签项
  if (filtered.length === 0) {
    bookmarksEmpty.classList.remove('hidden');
    bookmarksGrid.classList.add('hidden');
    return;
  }

  bookmarksEmpty.classList.add('hidden');
  bookmarksGrid.classList.remove('hidden');

  // 按最新创建时间排序 (Chrome 原生 ID 越大代表越新创建，这里也可以默认用)
  filtered.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

  filtered.forEach(bm => {
    const card = document.createElement('div');
    card.className = 'bookmark-card';

    // 核心信息
    const mainSection = document.createElement('div');
    mainSection.className = 'bookmark-card-main';

    const header = document.createElement('div');
    header.className = 'bookmark-card-header';

    const favicon = document.createElement('img');
    favicon.className = 'bookmark-favicon';
    favicon.src = `chrome-extension://_favicon/?pageUrl=${encodeURIComponent(bm.url)}&size=32`;
    favicon.onerror = () => {
      favicon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
    };

    const titleLink = document.createElement('a');
    titleLink.className = 'bookmark-title-link';
    titleLink.href = bm.url;
    titleLink.target = '_blank';
    titleLink.textContent = bm.title || bm.url;
    titleLink.title = bm.title || bm.url;

    header.appendChild(favicon);
    header.appendChild(titleLink);

    const urlSpan = document.createElement('span');
    urlSpan.className = 'bookmark-url';
    urlSpan.textContent = bm.url;

    mainSection.appendChild(header);
    mainSection.appendChild(urlSpan);

    // 标签徽章
    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'bookmark-card-tags';
    const tags = allTagsMap[bm.id] || [];
    tags.forEach(tag => {
      const badge = document.createElement('span');
      badge.className = 'bookmark-tag-badge';
      const colors = getTagColors(tag);
      badge.style.backgroundColor = colors.bg;
      badge.style.color = colors.text;
      badge.style.border = `1px solid ${colors.border}`;
      badge.textContent = tag;
      
      // 点击标签直接进行该标签的单选过滤
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedTags = [tag];
        currentView = 'all';
        navAll.classList.add('active');
        navUntagged.classList.remove('active');
        updateSidebarUI();
        renderBookmarksGrid();
      });

      tagsWrapper.appendChild(badge);
    });

    if (tags.length > 0) {
      mainSection.appendChild(tagsWrapper);
    }

    // 操作按钮 (编辑、删除)
    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'bookmark-card-actions';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-action-icon';
    btnEdit.title = '编辑书签与标签';
    btnEdit.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;
    btnEdit.addEventListener('click', () => openEditModal(bm));

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-action-icon btn-delete';
    btnDelete.title = '删除书签';
    btnDelete.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    `;
    btnDelete.addEventListener('click', () => deleteBookmark(bm.id));

    actionsWrapper.appendChild(btnEdit);
    actionsWrapper.appendChild(btnDelete);

    card.appendChild(mainSection);
    card.appendChild(actionsWrapper);
    bookmarksGrid.appendChild(card);
  });
}

// 顶部栏和筛选条更新
function updateHeaderViewStatus(totalCount) {
  // 更新主文本标题
  if (selectedTags.length > 0) {
    viewTitle.textContent = `标签筛选：${selectedTags.join(' + ')}`;
  } else if (currentView === 'untagged') {
    viewTitle.textContent = '未分类书签';
  } else {
    viewTitle.textContent = '所有书签';
  }

  bookmarksCount.textContent = `共 ${totalCount} 个书签`;

  // 渲染顶部的已激活筛选条件横条
  if (selectedTags.length > 0) {
    filterStatusBar.classList.remove('hidden');
    activeFilterChips.innerHTML = '';
    
    selectedTags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      const colors = getTagColors(tag);
      chip.style.backgroundColor = colors.bg;
      chip.style.color = colors.text;
      chip.style.border = `1px solid ${colors.border}`;
      chip.textContent = tag;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'tag-chip-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', () => toggleTagFilter(tag));

      chip.appendChild(removeBtn);
      activeFilterChips.appendChild(chip);
    });
  } else {
    filterStatusBar.classList.add('hidden');
  }
}

// 绑定全局事件
function setupEventListeners() {
  // 视图菜单切换
  navAll.addEventListener('click', () => {
    currentView = 'all';
    navAll.classList.add('active');
    navUntagged.classList.remove('active');
    renderBookmarksGrid();
  });

  navUntagged.addEventListener('click', () => {
    currentView = 'untagged';
    navAll.classList.remove('active');
    navUntagged.classList.add('active');
    renderBookmarksGrid();
  });

  // 侧边栏一键清除标签筛选
  btnClearTags.addEventListener('click', () => {
    selectedTags = [];
    updateSidebarUI();
    renderBookmarksGrid();
  });

  // 顶层筛选条重置
  btnResetFilters.addEventListener('click', () => {
    selectedTags = [];
    searchQuery = '';
    searchInput.value = '';
    updateSidebarUI();
    renderBookmarksGrid();
  });

  // 实时搜索
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderBookmarksGrid();
  });

  // 手动添加书签按钮
  btnAddBookmark.addEventListener('click', openAddModal);

  // 导出 JSON 备份
  btnExport.addEventListener('click', exportData);

  // 导入触发
  btnImportTrigger.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', importData);

  // 模态框关闭事件
  btnCloseModals.forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
  
  // 键盘快捷键（Esc 关闭模态框）
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });

  // 模态框中的标签键入
  modalTagInput.addEventListener('keydown', handleModalTagInputKeyDown);

  // 模态表单提交
  bookmarkForm.addEventListener('submit', handleModalSubmit);
}

// 切换标签筛选状态
function toggleTagFilter(tag) {
  const index = selectedTags.indexOf(tag);
  if (index > -1) {
    selectedTags.splice(index, 1);
  } else {
    selectedTags.push(tag);
  }
  updateSidebarUI();
  renderBookmarksGrid();
}

// 删除书签
function deleteBookmark(id) {
  if (confirm('确定要彻底删除该书签吗？')) {
    chrome.bookmarks.remove(id, () => {
      // background.js 会自动清理 tag 数据，在此处我们拉取数据并重新渲染
      refreshData();
    });
  }
}

// 模态框：打开添加新书签
function openAddModal() {
  modalTitle.textContent = '添加新书签';
  formBookmarkId.value = '';
  formTitle.value = '';
  formUrl.value = 'https://';
  modalActiveTags = [];
  
  renderModalTags();
  renderModalSuggestions();
  
  bookmarkModal.classList.remove('hidden');
  formTitle.focus();
}

// 模态框：打开编辑已有书签
function openEditModal(bm) {
  modalTitle.textContent = '编辑书签与标签';
  formBookmarkId.value = bm.id;
  formTitle.value = bm.title;
  formUrl.value = bm.url;
  modalActiveTags = [...(allTagsMap[bm.id] || [])];
  
  renderModalTags();
  renderModalSuggestions();
  
  bookmarkModal.classList.remove('hidden');
  formTitle.focus();
}

// 模态框：关闭
function closeModal() {
  bookmarkModal.classList.add('hidden');
}

// 模态框：渲染当前已添加标签芯片
function renderModalTags() {
  modalActiveTagsEl.innerHTML = '';
  modalActiveTags.forEach((tag, index) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    const colors = getTagColors(tag);
    chip.style.backgroundColor = colors.bg;
    chip.style.color = colors.text;
    chip.style.border = `1px solid ${colors.border}`;
    chip.textContent = tag;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-chip-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => {
      modalActiveTags.splice(index, 1);
      renderModalTags();
      renderModalSuggestions();
    });

    chip.appendChild(removeBtn);
    modalActiveTagsEl.appendChild(chip);
  });
}

// 模态框：渲染推荐/可快捷添加的标签
function renderModalSuggestions() {
  modalSuggestionChips.innerHTML = '';
  
  // 找出所有还未添加到该书签的标签
  const filtered = uniqueTags.filter(t => !modalActiveTags.includes(t));
  
  if (filtered.length === 0) {
    modalSuggestionChips.innerHTML = '<span class="count-text">无其他历史标签</span>';
    return;
  }

  filtered.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'suggestion-chip';
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      modalActiveTags.push(tag);
      renderModalTags();
      renderModalSuggestions();
      modalTagInput.value = '';
      modalTagInput.focus();
    });
    modalSuggestionChips.appendChild(chip);
  });
}

// 模态框：输入标签处理
function handleModalTagInputKeyDown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = modalTagInput.value.trim().replace(/,/g, '');
    if (val) {
      if (!modalActiveTags.includes(val)) {
        modalActiveTags.push(val);
        renderModalTags();
        renderModalSuggestions();
      }
      modalTagInput.value = '';
    }
  }
}

// 模态框：提交表单
function handleModalSubmit(e) {
  e.preventDefault();
  
  const id = formBookmarkId.value;
  const title = formTitle.value.trim();
  const url = formUrl.value.trim();
  
  if (id) {
    // 1. 编辑状态
    chrome.bookmarks.update(id, { title, url }, () => {
      // 更新标签映射
      if (modalActiveTags.length > 0) {
        allTagsMap[id] = modalActiveTags;
      } else {
        delete allTagsMap[id];
      }
      
      chrome.storage.local.set({ bookmarkTags: allTagsMap }, () => {
        closeModal();
        refreshData();
      });
    });
  } else {
    // 2. 新增状态
    chrome.bookmarks.create({ title, url }, (newBookmark) => {
      if (modalActiveTags.length > 0) {
        allTagsMap[newBookmark.id] = modalActiveTags;
        chrome.storage.local.set({ bookmarkTags: allTagsMap }, () => {
          closeModal();
          refreshData();
        });
      } else {
        closeModal();
        refreshData();
      }
    });
  }
}

// 导出备份 (URL-based tags mapping)
function exportData() {
  // 生成 URL -> 标签列表的映射关系，以保证跨设备或重新导入时能够完美恢复
  const urlTags = {};
  
  allBookmarks.forEach(bm => {
    const tags = allTagsMap[bm.id] || [];
    if (tags.length > 0) {
      urlTags[bm.url] = tags;
    }
  });

  const backupData = {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    urlTags: urlTags
  };

  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmark-tags-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 导入备份 (基于 URL 匹配书签恢复)
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (!data.urlTags || typeof data.urlTags !== 'object') {
        alert('文件格式错误：未找到有效的标签数据！');
        return;
      }

      const importedUrlTags = data.urlTags;
      let matchedCount = 0;

      // 遍历当前书签，进行 URL 匹配并恢复标签
      allBookmarks.forEach(bm => {
        if (importedUrlTags[bm.url]) {
          allTagsMap[bm.id] = importedUrlTags[bm.url];
          matchedCount++;
        }
      });

      chrome.storage.local.set({ bookmarkTags: allTagsMap }, () => {
        alert(`标签数据恢复成功！匹配并同步了 ${matchedCount} 个书签的标签信息。`);
        // 重置上传框，允许同名文件再次上传触发 change
        importFileInput.value = '';
        refreshData();
      });

    } catch (err) {
      console.error(err);
      alert('解析备份文件失败，请确保导入的是有效的标签备份 JSON 文件！');
    }
  };
  reader.readAsText(file);
}

// 辅助函数：根据标签文本哈希生成唯一的 HSL 颜色
function getTagColors(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return {
    bg: `hsla(${h}, 70%, 45%, 0.15)`,
    text: `hsl(${h}, 85%, 75%)`,
    border: `hsla(${h}, 70%, 45%, 0.3)`
  };
}
