// 全局状态
let currentTab = null;
let bookmarkId = null;
let activeTags = [];
let allTagsMap = {}; // bookmarkId -> tags array
let uniqueTags = []; // unique tag strings

// DOM 元素
const pageTitleEl = document.getElementById('page-title');
const pageUrlEl = document.getElementById('page-url');
const btnToggleBookmark = document.getElementById('btn-toggle-bookmark');
const bookmarkIcon = document.getElementById('bookmark-icon');
const tagSection = document.getElementById('tag-section');
const activeTagsEl = document.getElementById('active-tags');
const tagInput = document.getElementById('tag-input');
const tagSuggestions = document.getElementById('tag-suggestions');
const suggestionList = document.getElementById('suggestion-list');
const searchInput = document.getElementById('search-input');
const resultsList = document.getElementById('results-list');
const resultsEmpty = document.getElementById('results-empty');
const btnOpenManager = document.getElementById('btn-open-manager');
const folderSection = document.getElementById('folder-section');
const popupFolderSelect = document.getElementById('popup-folder-select');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initPopup();
  setupEventListeners();
});

// 初始化 Popup 数据
async function initPopup() {
  // 获取当前活动标签页
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    currentTab = tabs[0];
    pageTitleEl.textContent = currentTab.title;
    pageUrlEl.textContent = currentTab.url;
    
    // 加载全局标签数据
    await loadGlobalTags();
    
    // 检查当前网页是否已收藏
    checkBookmarkState();
  } else {
    pageTitleEl.textContent = "无法获取当前网页";
    pageUrlEl.textContent = "";
  }

  // 默认显示最近收藏的书签
  showRecentBookmarks();
}

// 绑定事件监听
function setupEventListeners() {
  // 收藏/取消收藏按钮
  btnToggleBookmark.addEventListener('click', toggleBookmark);

  // 标签输入框事件
  tagInput.addEventListener('keydown', handleTagInputKeyDown);
  tagInput.addEventListener('input', handleTagInputInput);

  // 搜索输入框事件
  searchInput.addEventListener('input', handleSearchInput);

  // 文件夹选择切换事件
  popupFolderSelect.addEventListener('change', handleFolderChange);

  // 打开管理后台页面
  btnOpenManager.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
  });
}

// 加载全局标签数据
function loadGlobalTags() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['bookmarkTags'], (result) => {
      allTagsMap = result.bookmarkTags || {};
      
      // 提取所有不重复的标签
      const tagsSet = new Set();
      Object.values(allTagsMap).forEach(tags => {
        if (Array.isArray(tags)) {
          tags.forEach(t => tagsSet.add(t));
        }
      });
      uniqueTags = Array.from(tagsSet);
      resolve();
    });
  });
}

// 检查当前网页收藏状态
function checkBookmarkState() {
  if (!currentTab || !currentTab.url) return;

  chrome.bookmarks.search({ url: currentTab.url }, (results) => {
    if (results && results.length > 0) {
      // 已收藏
      const bookmark = results[0];
      bookmarkId = bookmark.id;
      btnToggleBookmark.classList.add('active');
      tagSection.classList.remove('hidden');
      folderSection.classList.remove('hidden');
      
      // 读取该书签的标签
      activeTags = allTagsMap[bookmarkId] || [];
      renderActiveTags();
      renderSuggestions();
      
      // 加载并定位所属的文件夹
      loadFolderSelect(bookmark.parentId);
      
      // 已收藏页面打开时，默认自动聚焦标签输入框
      setTimeout(() => tagInput.focus(), 100);
    } else {
      // 未收藏 -> 自动收藏当前合法网页
      const url = currentTab.url;
      const isBookmarkable = url && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') && !url.startsWith('about:');
      
      if (isBookmarkable) {
        chrome.bookmarks.create({
          title: currentTab.title,
          url: currentTab.url
        }, (newBookmark) => {
          bookmarkId = newBookmark.id;
          btnToggleBookmark.classList.add('active');
          tagSection.classList.remove('hidden');
          folderSection.classList.remove('hidden');
          activeTags = [];
          renderActiveTags();
          renderSuggestions();
          
          // 加载并定位所属的文件夹
          loadFolderSelect(newBookmark.parentId);
          
          // 自动聚焦到标签输入框
          setTimeout(() => tagInput.focus(), 100);
          
          // 重新加载最近列表以显示新收藏
          showRecentBookmarks();
        });
      } else {
        // 无法收藏的页面，保持未收藏状态
        bookmarkId = null;
        btnToggleBookmark.classList.remove('active');
        tagSection.classList.add('hidden');
        folderSection.classList.add('hidden');
        activeTags = [];
        activeTagsEl.innerHTML = '';
      }
    }
  });
}

// 切换收藏状态（收藏/取消收藏）
function toggleBookmark() {
  if (!currentTab) return;

  if (bookmarkId) {
    // 如果已收藏，则直接取消收藏（不显示 confirm）
    chrome.bookmarks.remove(bookmarkId, () => {
      // background.js 会自动清理 storage，但我们立即同步本地 UI
      delete allTagsMap[bookmarkId];
      chrome.storage.local.set({ bookmarkTags: allTagsMap }, () => {
        bookmarkId = null;
        btnToggleBookmark.classList.remove('active');
        tagSection.classList.add('hidden');
        folderSection.classList.add('hidden');
        activeTags = [];
        activeTagsEl.innerHTML = '';
        loadGlobalTags().then(() => {
          showRecentBookmarks();
        });
      });
    });
  } else {
    // 如果未收藏，则进行收藏
    chrome.bookmarks.create({
      title: currentTab.title,
      url: currentTab.url
    }, (newBookmark) => {
      bookmarkId = newBookmark.id;
      btnToggleBookmark.classList.add('active');
      tagSection.classList.remove('hidden');
      folderSection.classList.remove('hidden');
      activeTags = [];
      renderActiveTags();
      renderSuggestions();
      
      // 加载并定位所属的文件夹
      loadFolderSelect(newBookmark.parentId);
      
      // 聚焦到标签输入框
      setTimeout(() => tagInput.focus(), 100);
      
      // 重新加载最近列表
      showRecentBookmarks();
    });
  }
}

// 渲染当前书签的标签芯片
function renderActiveTags() {
  activeTagsEl.innerHTML = '';
  activeTags.forEach((tag, index) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    
    // 生成动态色彩
    const colors = getTagColors(tag);
    chip.style.backgroundColor = colors.bg;
    chip.style.color = colors.text;
    chip.style.border = `1px solid ${colors.border}`;
    chip.textContent = tag;
    
    // 删除按钮
    const removeBtn = document.createElement('button');
    removeBtn.className = 'tag-chip-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = '删除标签';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeTag(index);
    });
    
    chip.appendChild(removeBtn);
    activeTagsEl.appendChild(chip);
  });
}

// 处理标签输入
function handleTagInputKeyDown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = tagInput.value.trim().replace(/,/g, '');
    if (val) {
      addTag(val);
      tagInput.value = '';
    }
  }
}

// 输入框输入时过滤推荐
function handleTagInputInput() {
  renderSuggestions();
}

// 添加标签
function addTag(tag) {
  if (!bookmarkId) return;
  
  // 避免重复标签
  if (!activeTags.includes(tag)) {
    activeTags.push(tag);
    allTagsMap[bookmarkId] = activeTags;
    
    chrome.storage.local.set({ bookmarkTags: allTagsMap }, () => {
      renderActiveTags();
      loadGlobalTags().then(() => {
        renderSuggestions();
        // 如果正在搜索，刷新搜索结果以显示新标签
        if (searchInput.value.trim()) {
          handleSearchInput();
        } else {
          showRecentBookmarks();
        }
      });
    });
  }
}

// 删除标签
function removeTag(index) {
  if (!bookmarkId) return;
  
  activeTags.splice(index, 1);
  if (activeTags.length === 0) {
    delete allTagsMap[bookmarkId];
  } else {
    allTagsMap[bookmarkId] = activeTags;
  }
  
  chrome.storage.local.set({ bookmarkTags: allTagsMap }, () => {
    renderActiveTags();
    loadGlobalTags().then(() => {
      renderSuggestions();
      if (searchInput.value.trim()) {
        handleSearchInput();
      } else {
        showRecentBookmarks();
      }
    });
  });
}

// 根据当前输入渲染标签推荐
function renderSuggestions() {
  const query = tagInput.value.trim().toLowerCase();
  
  // 过滤出未添加过的标签
  let filtered = uniqueTags.filter(t => !activeTags.includes(t));
  
  // 如果输入框有文字，根据关键字过滤
  if (query) {
    filtered = filtered.filter(t => t.toLowerCase().includes(query));
  } else {
    // 否则仅推荐前 5 个最常用的标签
    // 这里简单按出现频次排序，取前 5 个
    const freq = {};
    Object.values(allTagsMap).forEach(tags => {
      if (Array.isArray(tags)) {
        tags.forEach(t => {
          if (!activeTags.includes(t)) {
            freq[t] = (freq[t] || 0) + 1;
          }
        });
      }
    });
    filtered = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 5);
  }

  if (filtered.length > 0) {
    tagSuggestions.classList.remove('hidden');
    suggestionList.innerHTML = '';
    filtered.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'suggestion-chip';
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        addTag(tag);
        tagInput.value = '';
        tagInput.focus();
      });
      suggestionList.appendChild(chip);
    });
  } else {
    tagSuggestions.classList.add('hidden');
  }
}

// 搜索书签
function handleSearchInput() {
  const queryText = searchInput.value.trim().toLowerCase();
  
  if (!queryText) {
    showRecentBookmarks();
    return;
  }
  
  // 1. 获取所有书签（包含文件夹中的书签，递归获取）
  chrome.bookmarks.getTree((tree) => {
    const allBookmarksList = [];
    
    // 递归函数收集所有具有 URL 的书签
    function collectBookmarks(nodes) {
      nodes.forEach(node => {
        if (node.url) {
          allBookmarksList.push(node);
        }
        if (node.children) {
          collectBookmarks(node.children);
        }
      });
    }
    collectBookmarks(tree);
    
    // 2. 根据查询匹配 (匹配标题、URL 或标签)
    const matches = allBookmarksList.filter(bm => {
      const titleMatch = bm.title.toLowerCase().includes(queryText);
      const urlMatch = bm.url.toLowerCase().includes(queryText);
      
      // 标签匹配
      const tags = allTagsMap[bm.id] || [];
      const tagMatch = tags.some(tag => tag.toLowerCase().includes(queryText));
      
      return titleMatch || urlMatch || tagMatch;
    });
    
    renderSearchResults(matches, `未找到与 “${queryText}” 匹配的书签`);
  });
}

// 显示最近收藏的书签
function showRecentBookmarks() {
  // 获取最近的 15 个书签
  chrome.bookmarks.getRecent(15, (recentList) => {
    // 仅保留有 URL 的（防止把文件夹等其他怪异节点拉进来）
    const validRecent = recentList.filter(bm => bm.url);
    renderSearchResults(validRecent, '暂无书签数据，点击上方星星图标收藏当前页面。');
  });
}

// 渲染搜索/最近结果列表
function renderSearchResults(bookmarks, emptyMessage) {
  resultsList.innerHTML = '';
  
  if (!bookmarks || bookmarks.length === 0) {
    resultsEmpty.style.display = 'flex';
    resultsEmpty.querySelector('p').textContent = emptyMessage;
    return;
  }
  
  resultsEmpty.style.display = 'none';
  
  bookmarks.forEach(bm => {
    const item = document.createElement('div');
    item.className = 'result-item';
    
    // 头部：Favicon + 标题
    const header = document.createElement('div');
    header.className = 'result-header';
    
    const favicon = document.createElement('img');
    favicon.className = 'result-favicon';
    favicon.src = `chrome-extension://_favicon/?pageUrl=${encodeURIComponent(bm.url)}&size=32`;
    favicon.onerror = () => {
      // 备用图标：加载失败时使用一个地球 SVG 图标或空白图片
      favicon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
    };
    
    const title = document.createElement('span');
    title.className = 'result-title';
    title.textContent = bm.title || bm.url;
    title.title = bm.title || bm.url;
    
    header.appendChild(favicon);
    header.appendChild(title);
    
    // 链接
    const url = document.createElement('div');
    url.className = 'result-url';
    url.textContent = bm.url;
    
    // 标签区
    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'result-tags';
    const tags = allTagsMap[bm.id] || [];
    tags.forEach(tag => {
      const tagChip = document.createElement('span');
      tagChip.className = 'result-tag-chip';
      const colors = getTagColors(tag);
      tagChip.style.backgroundColor = colors.bg;
      tagChip.style.color = colors.text;
      tagChip.style.border = `1px solid ${colors.border}`;
      tagChip.textContent = tag;
      tagsWrapper.appendChild(tagChip);
    });
    
    item.appendChild(header);
    item.appendChild(url);
    if (tags.length > 0) {
      item.appendChild(tagsWrapper);
    }
    
    // 点击项打开网页
    item.addEventListener('click', () => {
      chrome.tabs.create({ url: bm.url });
    });
    
    resultsList.appendChild(item);
  });
}

// 辅助函数：根据标签文本哈希生成唯一的 HSL 颜色，确保同一个标签颜色始终一致且对比度良好
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

// 加载文件夹下拉框数据
function loadFolderSelect(currentParentId) {
  chrome.bookmarks.getTree((tree) => {
    const folders = [];
    
    // 递归遍历树，过滤出所有文件夹节点，并生成类似 "书签栏 / 子文件夹" 的层级路径
    function traverse(nodes, path = []) {
      nodes.forEach(node => {
        if (!node.url && node.id !== '0') {
          const currentPath = [...path, node.title || '未命名文件夹'];
          folders.push({
            id: node.id,
            pathName: currentPath.join(' / ')
          });
          if (node.children) {
            traverse(node.children, currentPath);
          }
        } else if (node.children) {
          traverse(node.children, path);
        }
      });
    }
    
    traverse(tree);
    
    // 渲染至下拉选择框
    popupFolderSelect.innerHTML = '';
    folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.pathName;
      if (f.id === currentParentId) {
        opt.selected = true;
      }
      popupFolderSelect.appendChild(opt);
    });
  });
}

// 切换保存的文件夹
function handleFolderChange() {
  if (bookmarkId) {
    const targetFolderId = popupFolderSelect.value;
    chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId }, (movedNode) => {
      console.log(`书签已成功移动到文件夹: ${targetFolderId}`);
      // 成功高亮微动效：边框变绿色一下
      popupFolderSelect.style.borderColor = 'var(--accent-color)';
      setTimeout(() => {
        popupFolderSelect.style.borderColor = '';
      }, 1000);
      
      // 刷新底部的最近书签列表
      showRecentBookmarks();
    });
  }
}

