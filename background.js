// 监听书签删除事件，清除对应的标签数据
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  chrome.storage.local.get(['bookmarkTags'], (result) => {
    const bookmarkTags = result.bookmarkTags || {};
    if (bookmarkTags[id]) {
      delete bookmarkTags[id];
      chrome.storage.local.set({ bookmarkTags }, () => {
        console.log(`已自动清理书签 ID ${id} 的标签数据`);
      });
    }
  });
});

// 监听快捷键指令
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-manager') {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
  } else if (command === 'quick-bookmark') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.url) {
        // 检查是否已收藏
        chrome.bookmarks.search({ url: activeTab.url }, (results) => {
          if (results && results.length > 0) {
            // 已存在，显示已存提示
            showBadgeFeedback("已存");
          } else {
            // 进行收藏
            chrome.bookmarks.create({
              title: activeTab.title,
              url: activeTab.url
            }, (newBookmark) => {
              showBadgeFeedback("✓");
            });
          }
        });
      }
    });
  }
});

// 统一的角标提示函数
function showBadgeFeedback(text) {
  chrome.action.setBadgeText({ text: text });
  chrome.action.setBadgeBackgroundColor({ color: text === "✓" ? "#14b8a6" : "#6366f1" }); // 绿色为成功，靛蓝为已存
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, 2000);
}
