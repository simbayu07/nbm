// 数据状态
let allBookmarks = [];        // 扁平化的所有有 URL 的书签
let allTagsMap = {};         // bookmarkId -> tags array
let uniqueTags = [];         // unique tag strings (sorted alphabetically)
let tagCounts = {};          // tag -> count of bookmarks
let selectedTags = [];       // 当前用于筛选的标签列表
let currentView = 'all';     // 'all', 'untagged', 或 'folder'
let currentFolderId = 'all'; // 'all', 'untagged', 或 具体的数字 ID（如 '1', '2' 等）
let searchQuery = '';
let modalActiveTags = [];    // 模态框中当前正在编辑的标签列表
let lastLoadedUrl = '';      // 最近一次自动从记忆库中装载标签的 URL
let lastLoadedTags = [];     // 最近一次自动装载的标签列表备份
// 文件夹相关状态
let folderTreeRaw = null;     // 原始树根节点 (ID: '0')
let foldersList = [];         // 扁平化的文件夹列表，用于下拉框选择 { id, title, pathName }
let parentMap = {};          // 节点 ID -> 父节点 ID 映射表，用于向上寻找祖先
let collapsedFolders = new Set(); // 记录折叠状态的文件夹 ID 集合

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

// 目录新增 DOM
const sidebarFoldersTree = document.getElementById('sidebar-folders-tree');
const btnNewFolder = document.getElementById('btn-new-folder');
const breadcrumbsBar = document.getElementById('breadcrumbs-bar');
const breadcrumbsList = document.getElementById('breadcrumbs-list');
const foldersGrid = document.getElementById('folders-grid');
const formFolderId = document.getElementById('form-folder-id');

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
      folderTreeRaw = tree[0]; // 根节点 (ID: '0')
      allBookmarks = [];
      foldersList = [];
      parentMap = {};

      // 递归解析树结构：收集书签、文件夹，构建父子映射映射表
      parseBookmarkTree(folderTreeRaw);

      // 3. 计算标签统计信息
      calculateTagsInfo();
      
      // 4. 更新侧边栏数量和分类
      updateSidebarUI();

      // 5. 加载模态框的文件夹选择下拉菜单
      populateFolderDropdown();

      // 6. 渲染侧边栏文件夹树
      renderFolderTree();

      // 7. 渲染右侧内容区（书签与文件夹）
      renderBookmarksGrid();
    });
  });
}

// 递归遍历原生书签树
function parseBookmarkTree(node, path = []) {
  if (node.id) {
    // 建立父节点关联
    if (node.children) {
      node.children.forEach(child => {
        parentMap[child.id] = node.id;
      });
    }
  }

  // 分类处理
  if (node.url) {
    // 书签
    allBookmarks.push(node);
  } else if (node.id !== '0') {
    // 文件夹 (排除根节点 0)
    const currentPath = [...path, node.title || '未命名文件夹'];
    foldersList.push({
      id: node.id,
      title: node.title,
      pathName: '/' + currentPath.join('/')
    });

    if (node.children) {
      node.children.forEach(child => parseBookmarkTree(child, currentPath));
    }
  } else {
    // 根节点，直接向下递归
    if (node.children) {
      node.children.forEach(child => parseBookmarkTree(child, path));
    }
  }
}

// 填充模态框中的文件夹下拉选择器
function populateFolderDropdown() {
  formFolderId.innerHTML = '';
  // 按路径名称字母排序，让选择更加清晰
  const sortedFolders = [...foldersList].sort((a, b) => a.pathName.localeCompare(b.pathName, 'zh-CN'));
  
  sortedFolders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.pathName;
    formFolderId.appendChild(opt);
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

// 渲染侧边栏文件夹树
function renderFolderTree() {
  sidebarFoldersTree.innerHTML = '';
  if (!folderTreeRaw || !folderTreeRaw.children) return;

  // 从第一级节点（书签栏、其他书签、移动设备书签）向下渲染
  folderTreeRaw.children.forEach(rootChild => {
    if (!rootChild.url) { // 只渲染文件夹
      renderFolderNode(rootChild, sidebarFoldersTree, 0);
    }
  });
}

// 递归渲染文件夹树的节点
function renderFolderNode(node, container, depth) {
  const hasSubfolders = node.children && node.children.some(child => !child.url);
  const isCollapsed = collapsedFolders.has(node.id);
  const isActive = currentFolderId === node.id;

  const nodeEl = document.createElement('div');
  nodeEl.className = 'folder-tree-node';

  const itemEl = document.createElement('div');
  itemEl.className = `folder-tree-item ${isActive ? 'active' : ''}`;
  itemEl.style.paddingLeft = `${depth * 14 + 10}px`;

  // 展开折叠三角形图标
  const toggleEl = document.createElement('span');
  toggleEl.className = `folder-tree-toggle ${isCollapsed ? 'collapsed' : ''}`;
  if (hasSubfolders) {
    toggleEl.innerHTML = `
      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    toggleEl.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止触发选中文件夹
      if (isCollapsed) {
        collapsedFolders.delete(node.id);
      } else {
        collapsedFolders.add(node.id);
      }
      renderFolderTree(); // 重新局部渲染树
    });
  } else {
    // 占位字符以保持对齐
    toggleEl.style.width = '14px';
    toggleEl.style.height = '14px';
  }

  // 文件夹图标 (SVG)
  const iconEl = document.createElement('span');
  iconEl.className = 'folder-tree-icon';
  iconEl.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  `;

  // 文件夹名称
  const nameEl = document.createElement('span');
  nameEl.className = 'folder-tree-name';
  nameEl.textContent = node.title;

  itemEl.appendChild(toggleEl);
  itemEl.appendChild(iconEl);
  itemEl.appendChild(nameEl);

  // 点击事件：切入该文件夹目录视图
  itemEl.addEventListener('click', () => {
    navigateToFolder(node.id);
  });

  nodeEl.appendChild(itemEl);

  // 递归渲染子文件夹 (只有在未折叠且存在子文件夹时渲染)
  if (hasSubfolders && !isCollapsed) {
    const subContainer = document.createElement('div');
    subContainer.className = 'folder-tree-sub';
    node.children.forEach(child => {
      if (!child.url) {
        renderFolderNode(child, subContainer, depth + 1);
      }
    });
    nodeEl.appendChild(subContainer);
  }

  container.appendChild(nodeEl);
}

// 导航到指定文件夹
function navigateToFolder(id) {
  currentFolderId = id;
  currentView = 'folder';
  selectedTags = []; // 切换文件夹时清空标签筛选

  // 移除左侧边栏常规视图的 active
  navAll.classList.remove('active');
  navUntagged.classList.remove('active');
  
  updateSidebarUI();
  renderFolderTree();
  renderBookmarksGrid();
}

// 递归检测书签是否属于某个父目录的后代
function isDescendant(childId, ancestorId) {
  if (ancestorId === 'all') return true;
  let cur = childId;
  while (cur && cur !== '0') {
    if (cur === ancestorId) return true;
    cur = parentMap[cur];
  }
  return false;
}

// 渲染右侧内容区的卡片网格与面包屑
function renderBookmarksGrid() {
  bookmarksGrid.innerHTML = '';
  foldersGrid.innerHTML = '';
  
  const isGlobalView = currentFolderId === 'all' || currentFolderId === 'untagged';
  const isSearchOrFilterActive = searchQuery !== '' || selectedTags.length > 0;

  // 1. 如果是文件夹视图，且没有搜索或标签过滤条件激活 -> 进入目录式列表排布
  if (!isGlobalView && !isSearchOrFilterActive) {
    breadcrumbsBar.classList.remove('hidden');
    filterStatusBar.classList.add('hidden');
    renderBreadcrumbs();

    // 加载当前文件夹下的直接子项
    chrome.bookmarks.getChildren(currentFolderId, (children) => {
      const folders = children.filter(child => !child.url);
      const bookmarks = children.filter(child => child.url);
      
      // 更新状态标题与计数
      viewTitle.textContent = foldersList.find(f => f.id === currentFolderId)?.title || '未命名文件夹';
      bookmarksCount.textContent = `包含 ${folders.length} 个文件夹，${bookmarks.length} 个书签`;

      // 渲染子文件夹小卡片
      if (folders.length > 0) {
        foldersGrid.classList.remove('hidden');
        folders.forEach(folder => {
          const card = document.createElement('div');
          card.className = 'folder-card';
          
          const mainPart = document.createElement('div');
          mainPart.className = 'folder-card-main';
          mainPart.innerHTML = `
            <span class="folder-card-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"></path>
              </svg>
            </span>
            <span class="folder-card-name" title="${folder.title}">${folder.title}</span>
          `;
          
          // 右侧交互操作 (编辑文件夹名称，删除文件夹)
          const actionsPart = document.createElement('div');
          actionsPart.className = 'folder-card-actions';
          
          const btnRename = document.createElement('button');
          btnRename.className = 'btn-action-icon';
          btnRename.title = '重命名文件夹';
          btnRename.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          `;
          btnRename.addEventListener('click', (e) => {
            e.stopPropagation();
            renameFolder(folder.id, folder.title);
          });
          
          const btnDelFolder = document.createElement('button');
          btnDelFolder.className = 'btn-action-icon btn-delete';
          btnDelFolder.title = '删除文件夹及其内容';
          btnDelFolder.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          `;
          btnDelFolder.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFolder(folder.id);
          });
          
          actionsPart.appendChild(btnRename);
          actionsPart.appendChild(btnDelFolder);
          
          card.appendChild(mainPart);
          card.appendChild(actionsPart);
          
          // 点击文件夹卡片进入下一层
          card.addEventListener('click', () => {
            navigateToFolder(folder.id);
          });
          
          foldersGrid.appendChild(card);
        });
      } else {
        foldersGrid.classList.add('hidden');
      }

      // 渲染直接子书签
      if (bookmarks.length > 0) {
        bookmarksGrid.classList.remove('hidden');
        bookmarksEmpty.classList.add('hidden');
        // 按 ID 降序（最新加入优先）渲染书签
        bookmarks.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
        bookmarks.forEach(bm => renderSingleBookmarkCard(bm));
      } else {
        bookmarksGrid.classList.add('hidden');
        if (folders.length === 0) {
          bookmarksEmpty.classList.remove('hidden');
        }
      }
    });
  } else {
    // 2. 全局视图（All / Untagged）或者在文件夹里激活了“搜索/过滤” -> 展示扁平的书签列表
    foldersGrid.classList.add('hidden');
    
    if (isGlobalView) {
      breadcrumbsBar.classList.add('hidden');
    } else {
      breadcrumbsBar.classList.remove('hidden');
      renderBreadcrumbs();
    }

    // 过滤书签
    let filtered = allBookmarks.filter(bm => {
      // 文件夹局限范围 (如果是局部视图，则只过滤当前文件夹及子孙文件夹下的书签)
      if (!isGlobalView) {
        if (!isDescendant(bm.id, currentFolderId)) return false;
      }

      // 视图属性过滤
      if (currentFolderId === 'untagged') {
        const tags = allTagsMap[bm.id] || [];
        if (tags.length > 0) return false;
      }

      // 标签交集筛选
      if (selectedTags.length > 0) {
        const tags = allTagsMap[bm.id] || [];
        const hasAllTags = selectedTags.every(t => tags.includes(t));
        if (!hasAllTags) return false;
      }

      // 关键字搜索过滤
      if (searchQuery) {
        const titleMatch = bm.title.toLowerCase().includes(searchQuery);
        const urlMatch = bm.url.toLowerCase().includes(searchQuery);
        const tags = allTagsMap[bm.id] || [];
        const tagMatch = tags.some(tag => tag.toLowerCase().includes(searchQuery));
        if (!titleMatch && !urlMatch && !tagMatch) return false;
      }

      return true;
    });

    // 渲染头部汇总信息
    updateHeaderViewStatus(filtered.length);

    // 扁平渲染卡片
    if (filtered.length === 0) {
      bookmarksEmpty.classList.remove('hidden');
      bookmarksGrid.classList.add('hidden');
      return;
    }

    bookmarksEmpty.classList.add('hidden');
    bookmarksGrid.classList.remove('hidden');

    filtered.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    filtered.forEach(bm => renderSingleBookmarkCard(bm));
  }
}

// 绘制单个书签卡片
function renderSingleBookmarkCard(bm) {
  const card = document.createElement('div');
  card.className = 'bookmark-card';

  // 主信息区
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

  // 标签芯片
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
    
    // 点击标签进行全局过滤
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedTags = [tag];
      currentView = 'all';
      currentFolderId = 'all';
      navAll.classList.add('active');
      navUntagged.classList.remove('active');
      updateSidebarUI();
      renderFolderTree();
      renderBookmarksGrid();
    });

    tagsWrapper.appendChild(badge);
  });

  if (tags.length > 0) {
    mainSection.appendChild(tagsWrapper);
  }

  // 下方操作区 (编辑、删除)
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
}

// 绘制主视图顶部的面包屑导航
function renderBreadcrumbs() {
  breadcrumbsList.innerHTML = '';
  
  // 建立溯源链：当前节点 -> 父节点 -> 书签根节点
  const chain = [];
  let curId = currentFolderId;
  
  while (curId && curId !== '0') {
    const folder = foldersList.find(f => f.id === curId);
    if (folder) {
      chain.unshift({ id: folder.id, title: folder.title });
    }
    curId = parentMap[curId];
  }

  // 1. 顶部插入“根级别”面包屑
  const rootItem = document.createElement('span');
  rootItem.className = 'breadcrumb-item';
  rootItem.textContent = '所有书签';
  rootItem.addEventListener('click', () => {
    currentFolderId = 'all';
    currentView = 'all';
    navAll.classList.add('active');
    updateSidebarUI();
    renderFolderTree();
    renderBookmarksGrid();
  });
  breadcrumbsList.appendChild(rootItem);

  // 2. 依次渲染父层文件夹
  chain.forEach((item, index) => {
    // 插入分隔符
    const separator = document.createElement('span');
    separator.className = 'breadcrumb-separator';
    separator.textContent = '>';
    breadcrumbsList.appendChild(separator);

    const crumb = document.createElement('span');
    const isLast = index === chain.length - 1;
    crumb.className = `breadcrumb-item ${isLast ? 'active' : ''}`;
    crumb.textContent = item.title;
    
    if (!isLast) {
      crumb.addEventListener('click', () => navigateToFolder(item.id));
    }
    breadcrumbsList.appendChild(crumb);
  });
}

// 顶部栏和筛选条更新
function updateHeaderViewStatus(totalCount) {
  if (selectedTags.length > 0) {
    viewTitle.textContent = `标签筛选：${selectedTags.join(' + ')}`;
  } else if (currentView === 'untagged') {
    viewTitle.textContent = '未分类书签';
  } else if (currentFolderId !== 'all') {
    viewTitle.textContent = foldersList.find(f => f.id === currentFolderId)?.title || '文件夹';
  } else {
    viewTitle.textContent = '所有书签';
  }

  bookmarksCount.textContent = `共 ${totalCount} 个书签`;

  // 渲染顶部的已激活标签条
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
  // 左侧视图切换：所有书签
  navAll.addEventListener('click', () => {
    currentView = 'all';
    currentFolderId = 'all';
    selectedTags = [];
    navAll.classList.add('active');
    navUntagged.classList.remove('active');
    updateSidebarUI();
    renderFolderTree();
    renderBookmarksGrid();
  });

  // 左侧视图切换：未标签分类书签
  navUntagged.addEventListener('click', () => {
    currentView = 'untagged';
    currentFolderId = 'untagged';
    selectedTags = [];
    navAll.classList.remove('active');
    navUntagged.classList.add('active');
    updateSidebarUI();
    renderFolderTree();
    renderBookmarksGrid();
  });

  // 侧边栏新建文件夹
  btnNewFolder.addEventListener('click', createNewFolder);

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

  // 监听 URL 输入框变化以自动装载历史标签记忆
  formUrl.addEventListener('blur', handleFormUrlBlur);
  formUrl.addEventListener('change', handleFormUrlBlur);
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
      refreshData();
    });
  }
}

// 新建文件夹
function createNewFolder() {
  const folderName = prompt('请输入新文件夹的名称:');
  if (!folderName || !folderName.trim()) return;

  // 如果是在特定文件夹视图下，默认创建在其子层级；如果在所有/未分类下，默认创建在“书签栏”(ID: '1')
  let parentId = '1';
  if (currentFolderId !== 'all' && currentFolderId !== 'untagged') {
    parentId = currentFolderId;
  }

  chrome.bookmarks.create({
    parentId: parentId,
    title: folderName.trim()
  }, () => {
    refreshData();
  });
}

// 重命名文件夹
function renameFolder(id, currentTitle) {
  const newName = prompt('请输入新文件夹名称:', currentTitle);
  if (!newName || !newName.trim() || newName.trim() === currentTitle) return;

  chrome.bookmarks.update(id, {
    title: newName.trim()
  }, () => {
    refreshData();
  });
}

// 删除文件夹及其所有内容 (递归删除树)
function deleteFolder(id) {
  const folder = foldersList.find(f => f.id === id);
  const title = folder ? folder.title : '该文件夹';
  if (confirm(`确定要彻底删除 [${title}] 文件夹吗？这将连同该文件夹下的所有子文件夹及书签一并删除！此操作无法撤销！`)) {
    chrome.bookmarks.removeTree(id, () => {
      // 如果被删除的文件夹正是当前所处视图，删除后退回到根级“所有书签”
      if (currentFolderId === id) {
        currentFolderId = 'all';
        currentView = 'all';
        navAll.classList.add('active');
      }
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
  lastLoadedUrl = '';
  lastLoadedTags = [];
  
  // 默认位置：如果在特定目录中，直接选中它；否则选“书签栏”(ID: '1')
  let defaultFolderId = '1';
  if (currentFolderId !== 'all' && currentFolderId !== 'untagged') {
    defaultFolderId = currentFolderId;
  }
  formFolderId.value = defaultFolderId;

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
  
  // 选中该书签当前的所属文件夹
  formFolderId.value = bm.parentId || '1';

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
  const targetFolderId = formFolderId.value;
  
  if (id) {
    // 1. 编辑状态
    chrome.bookmarks.update(id, { title, url }, (updatedBookmark) => {
      // 检查书签目录是否发生了变更，如果是，则移动书签
      if (updatedBookmark.parentId !== targetFolderId) {
        chrome.bookmarks.move(id, { parentId: targetFolderId }, () => {
          saveTagsAndClose();
        });
      } else {
        saveTagsAndClose();
      }
    });
  } else {
    // 2. 新增状态
    chrome.bookmarks.create({
      parentId: targetFolderId,
      title,
      url
    }, (newBookmark) => {
      if (modalActiveTags.length > 0) {
        allTagsMap[newBookmark.id] = modalActiveTags;
        chrome.storage.local.set({ bookmarkTags: allTagsMap }, () => {
          saveTagsToMemory(url, modalActiveTags);
          closeModal();
          refreshData();
        });
      } else {
        // 如果用户没有手动键入标签，检查是否有历史记忆标签并自动继承
        chrome.storage.local.get(['urlTagsMemory'], (result) => {
          const memory = result.urlTagsMemory || {};
          const historicalTags = memory[url];
          if (historicalTags && historicalTags.length > 0) {
            allTagsMap[newBookmark.id] = historicalTags;
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
    });
  }

  // 内部辅助：保存标签配置并刷新关闭
  function saveTagsAndClose() {
    if (modalActiveTags.length > 0) {
      allTagsMap[id] = modalActiveTags;
    } else {
      delete allTagsMap[id];
    }
    
    chrome.storage.local.set({ bookmarkTags: allTagsMap }, () => {
      saveTagsToMemory(url, modalActiveTags);
      closeModal();
      refreshData();
    });
  }
}

// 导出备份 (URL-based tags mapping)
function exportData() {
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

// 辅助函数：将标签记忆备份保存至基于 URL 的 urlTagsMemory 字典中
function saveTagsToMemory(url, tags) {
  if (!url) return;
  chrome.storage.local.get(['urlTagsMemory'], (result) => {
    const memory = result.urlTagsMemory || {};
    if (tags && tags.length > 0) {
      memory[url] = tags;
    } else {
      delete memory[url];
    }
    chrome.storage.local.set({ urlTagsMemory: memory }, () => {
      console.log(`管理后台：已同步标签记忆至 URL: ${url}`);
    });
  });
}

// 自动检测并从 urlTagsMemory 自动加载历史标签
function handleFormUrlBlur() {
  const id = formBookmarkId.value;
  if (!id) { // 仅在“新建书签”时触发
    const url = formUrl.value.trim();
    
    // 如果 URL 没变，直接忽略
    if (url === lastLoadedUrl) return;
    
    if (url && url !== 'https://' && url !== 'http://') {
      // 检查当前显示标签是否未被手动更改过（依然跟上一次加载的 tags 一致，或者是初始的空状态）
      const isUnchanged = (modalActiveTags.length === lastLoadedTags.length) && 
                          modalActiveTags.every((v, i) => v === lastLoadedTags[i]);
                          
      if (isUnchanged) {
        chrome.storage.local.get(['urlTagsMemory'], (result) => {
          const memory = result.urlTagsMemory || {};
          const historicalTags = memory[url];
          
          if (historicalTags && historicalTags.length > 0) {
            modalActiveTags = [...historicalTags];
            lastLoadedUrl = url;
            lastLoadedTags = [...historicalTags];
            
            renderModalTags();
            renderModalSuggestions();
            console.log(`添加书签：URL变动，自动加载了新记忆标签: ${historicalTags.join(', ')}`);
          } else {
            // 如果新的 URL 没有任何记忆标签，且当前依然是上一次自动加载的，则自动将其清空重置
            modalActiveTags = [];
            lastLoadedUrl = url;
            lastLoadedTags = [];
            
            renderModalTags();
            renderModalSuggestions();
            console.log(`添加书签：URL变动，新URL无历史标签，已自动清空`);
          }
        });
      } else {
        // 如果用户手动编辑过标签，仅更新 lastLoadedUrl，保留用户的手动改动，不强行覆盖
        lastLoadedUrl = url;
      }
    }
  }
}
