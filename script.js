// 全局变量存储书签数据
let allBookmarks = [];
let currentFolder = null;

// 初始化函数
document.addEventListener('DOMContentLoaded', function() {
    loadBookmarks();
    setupSearch();
});

// 获取 Chrome 内部 Favicon URL
function getFaviconUrl(pageUrl) {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', '32');
    return url.toString();
}

// 加载所有书签
function loadBookmarks() {
    chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
        allBookmarks = bookmarkTreeNodes;
        const rootNode = bookmarkTreeNodes[0];
        
        renderBookmarkTree(rootNode);
        
        // 默认显示第一个有内容的文件夹
        let defaultFolder = findFirstFolder(rootNode);
        if (defaultFolder) {
            renderBookmarkSites(defaultFolder);
        }
    });
}

// 辅助：找到第一个包含子节点的文件夹
function findFirstFolder(node) {
    if (node.children && node.children.some(child => !child.children)) {
        return node;
    }
    if (node.children) {
        for (let child of node.children) {
            const found = findFirstFolder(child);
            if (found) return found;
        }
    }
    return null;
}

// 渲染左侧书签目录树
function renderBookmarkTree(bookmark) {
    const treeContainer = document.getElementById('bookmark-tree');
    treeContainer.innerHTML = '';
    
    function renderNode(node, parentElement, level = 0) {
        // 跳过根节点
        if (level === 0 && node.title === '') {
            if (node.children) {
                node.children.forEach(child => renderNode(child, parentElement, level + 1));
            }
            return;
        }
        
        // 仅渲染文件夹
        if (node.children) {
            const nodeElement = document.createElement('div');
            // Tailwind 样式
            nodeElement.className = `
                flex items-center px-3 py-2 rounded-lg cursor-pointer transition-all duration-200
                hover:bg-slate-100 group mb-0.5 text-sm font-medium text-slate-600
                bookmark-folder-item
                dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200
            `;
            nodeElement.dataset.id = node.id;
            // 动态缩进
            nodeElement.style.paddingLeft = `${(level - 1) * 16 + 12}px`;
            
            const hasSubFolders = node.children.some(child => child.children);
            
            nodeElement.innerHTML = `
                <span class="mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors dark:text-slate-500 dark:group-hover:text-indigo-400">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                </span>
                <span class="truncate">${node.title}</span>
                ${hasSubFolders ? '<span class="ml-auto text-xs text-slate-300 dark:text-slate-600">›</span>' : ''}
            `;
            
            nodeElement.addEventListener('click', function(e) {
                e.stopPropagation();
                renderBookmarkSites(node);
                
                // 高亮状态处理
                document.querySelectorAll('.bookmark-folder-item').forEach(el => {
                    el.classList.remove('bg-indigo-50', 'text-indigo-700', 'shadow-sm', 'ring-1', 'ring-indigo-200', 'dark:bg-indigo-900/50', 'dark:text-indigo-300', 'dark:ring-indigo-700');
                    el.classList.add('text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-400', 'dark:hover:bg-slate-800');
                });
                nodeElement.classList.remove('text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-400', 'dark:hover:bg-slate-800');
                nodeElement.classList.add('bg-indigo-50', 'text-indigo-700', 'shadow-sm', 'ring-1', 'ring-indigo-200', 'dark:bg-indigo-900/50', 'dark:text-indigo-300', 'dark:ring-indigo-700');
            });
            
            parentElement.appendChild(nodeElement);
            
            node.children.forEach(child => renderNode(child, parentElement, level + 1));
        }
    }
    
    renderNode(bookmark, treeContainer);
}

// 渲染右侧书签站点
function renderBookmarkSites(folder) {
    const sitesContainer = document.getElementById('bookmark-sites');
    sitesContainer.innerHTML = '';
    currentFolder = folder;
    
    // 更新头部标题
    document.getElementById('current-folder-title').textContent = folder.title || '全部书签';
    
    const sites = folder.children ? folder.children.filter(node => !node.children) : [];
    document.getElementById('folder-count').textContent = `${sites.length} 个书签`;

    if (sites.length === 0) {
        sitesContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-96 text-slate-400">
                <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                <p>此文件夹为空</p>
            </div>
        `;
        return;
    }
    
    const sitesGrid = document.createElement('div');
    sitesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-10';
    
    sites.forEach(node => renderSiteCard(node, sitesGrid));
    sitesContainer.appendChild(sitesGrid);

    // 初始化原生拖拽
    let draggedItem = null;

    sitesGrid.querySelectorAll('a').forEach(item => {
        item.setAttribute('draggable', true);
        
        item.addEventListener('dragstart', function(e) {
            draggedItem = item;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.id);
            // 稍微延迟添加样式，避免拖拽时的残影也带有这个样式
            setTimeout(() => {
                item.classList.add('opacity-50', 'scale-95');
            }, 0);
        });

        item.addEventListener('dragend', function(e) {
            item.classList.remove('opacity-50', 'scale-95');
            draggedItem = null;
            // 移除所有占位样式
            sitesGrid.querySelectorAll('.border-indigo-500').forEach(el => {
                el.classList.remove('border-indigo-500', 'border-2', 'border-dashed');
            });
        });

        item.addEventListener('dragover', function(e) {
            e.preventDefault(); // 允许 drop
            e.dataTransfer.dropEffect = 'move';
            // 可以添加视觉反馈，比如高亮目标位置
            // 这里简单处理，不做复杂的插入指示器
        });
        
        item.addEventListener('dragenter', function(e) {
            e.preventDefault();
            if (item !== draggedItem) {
                // 简单的视觉反馈
                item.classList.add('border-indigo-500', 'border-2', 'border-dashed');
            }
        });

        item.addEventListener('dragleave', function(e) {
            item.classList.remove('border-indigo-500', 'border-2', 'border-dashed');
        });

        item.addEventListener('drop', function(e) {
            e.preventDefault();
            if (item === draggedItem) return;
            
            // 简单的交换逻辑：将 draggedItem 插入到当前 item 之前或之后
            // 为了更精确的排序，通常我们将其插入到 drop 目标之前
            // 注意：HTML Collection 是实时的
            
                        const allItems = Array.from(sitesGrid.children);
                        const draggedIndex = allItems.indexOf(draggedItem);
                        const targetIndex = allItems.indexOf(item);
            
                        if (draggedIndex < targetIndex) {
                            // 从前往后拖，插入到目标之后
                            item.parentNode.insertBefore(draggedItem, item.nextSibling);
                        } else {
                            // 从后往前拖，插入到目标之前
                            item.parentNode.insertBefore(draggedItem, item);
                        }
            
                        // 获取拖动项在 DOM 中新的位置（0-based index）
                        const newPositionInDom = Array.from(sitesGrid.children).indexOf(draggedItem);
            
                        // 调用 Chrome 书签 API 移动书签
                        chrome.bookmarks.move(draggedItem.dataset.id, {
                            parentId: currentFolder.id,
                            index: newPositionInDom
                        }, function() {
                            // 书签移动成功后，重新加载所有书签以更新 UI
                            // 这会确保 UI 反映 Chrome API 中已保存的最新顺序
                            loadBookmarks();
                        });        });
    });
}

// 渲染单个站点卡片
function renderSiteCard(node, container) {
    let hostname = '';
    try {
        const url = new URL(node.url);
        hostname = url.hostname;
    } catch (e) {
        hostname = node.url;
    }

    // 使用 Chrome 内部 API 获取图标
    const faviconUrl = getFaviconUrl(node.url);
    
    const card = document.createElement('a');
    card.href = node.url;
    card.target = "_blank";
    card.dataset.id = node.id; // 添加 data-id 用于排序
    card.className = `
        group bg-white rounded-2xl p-5 border border-slate-100 shadow-sm 
        hover:shadow-xl hover:shadow-indigo-100/50 hover:-translate-y-1 hover:border-indigo-100 
        transition-all duration-300 flex flex-col relative overflow-hidden h-32
        dark:bg-slate-800 dark:border-slate-700 dark:hover:shadow-none dark:hover:border-indigo-500/50
    `;

    // 添加右键菜单事件
    card.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, node.id);
    });
    
    card.innerHTML = `
        <div class="flex items-start justify-between mb-3">
            <div class="w-10 h-10 rounded-xl bg-slate-50 p-0.5 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform dark:bg-slate-700/50 dark:shadow-none">
                <img src="${faviconUrl}" class="w-8 h-8 object-contain rounded-lg" alt="icon">
            </div>
            <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 transform translate-x-2 group-hover:translate-x-0">
                <span class="text-indigo-500 bg-indigo-50 p-1.5 rounded-lg hover:bg-indigo-100 block dark:text-indigo-400 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </span>
            </div>
        </div>
        <div class="mt-auto">
            <h3 class="font-bold text-slate-700 text-sm mb-0.5 truncate dark:text-slate-200" title="${node.title}">${node.title}</h3>
            <p class="text-xs text-slate-400 truncate font-mono opacity-80 group-hover:text-indigo-400 transition-colors dark:text-slate-500 dark:group-hover:text-indigo-300">${hostname}</p>
        </div>
    `;
    
    container.appendChild(card);
}

// 简单的搜索功能
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) {
            if (currentFolder) renderBookmarkSites(currentFolder);
            return;
        }
        
        // 搜索所有书签
        chrome.bookmarks.search(query, (results) => {
            const sitesContainer = document.getElementById('bookmark-sites');
            sitesContainer.innerHTML = '';
            
            document.getElementById('current-folder-title').textContent = `搜索结果: "${query}"`;
            document.getElementById('folder-count').textContent = `${results.length} 个匹配`;
            
            if (results.length === 0) {
                sitesContainer.innerHTML = '<p class="text-center text-slate-400 mt-10">未找到匹配的书签</p>';
                return;
            }
            
            const sitesGrid = document.createElement('div');
            sitesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-10';
            
            results.forEach(node => {
                if (node.url) { // 只显示书签，不显示文件夹
                    renderSiteCard(node, sitesGrid);
                }
            });
            sitesContainer.appendChild(sitesGrid);
        });
    });
}

// --- 右键菜单与编辑功能逻辑 ---

let contextMenuTargetId = null;
const contextMenu = document.getElementById('context-menu');
const editModal = document.getElementById('edit-modal');
const editTitleInput = document.getElementById('edit-title');
const editUrlInput = document.getElementById('edit-url');

// 初始化菜单事件
document.addEventListener('click', (e) => {
    // 点击任何地方关闭菜单
    hideContextMenu();
});

// 阻止菜单内部点击关闭（可选，但为了体验通常点击选项后应关闭）
// contextMenu.addEventListener('click', (e) => e.stopPropagation());

// 删除按钮
document.getElementById('ctx-delete').addEventListener('click', () => {
    if (contextMenuTargetId) {
        if (confirm('确定要删除这个书签吗？')) {
            chrome.bookmarks.remove(contextMenuTargetId, () => {
                // 删除成功后刷新视图
                const cardToRemove = document.querySelector(`a[data-id="${contextMenuTargetId}"]`);
                if (cardToRemove) {
                    cardToRemove.remove();
                    // 更新计数
                    const countEl = document.getElementById('folder-count');
                    if (countEl) {
                        const currentCount = parseInt(countEl.textContent) || 0;
                        if (currentCount > 0) countEl.textContent = `${currentCount - 1} 个书签`;
                    }
                }
            });
        }
    }
});

// 编辑按钮
document.getElementById('ctx-edit').addEventListener('click', () => {
    if (contextMenuTargetId) {
        chrome.bookmarks.get(contextMenuTargetId, (results) => {
            if (results && results.length > 0) {
                const bookmark = results[0];
                editTitleInput.value = bookmark.title;
                editUrlInput.value = bookmark.url;
                editModal.classList.remove('hidden');
                // 聚焦输入框
                setTimeout(() => editTitleInput.focus(), 100);
            }
        });
    }
});

// 模态框：取消
document.getElementById('btn-cancel').addEventListener('click', () => {
    console.log('Cancel button clicked');
    editModal.classList.add('hidden');
});

// 模态框：保存
document.getElementById('btn-save').addEventListener('click', () => {
    console.log('Save button clicked');
    console.log('Target ID:', contextMenuTargetId);
    console.log('Title:', editTitleInput.value);
    console.log('URL:', editUrlInput.value);
    
    if (contextMenuTargetId && editTitleInput.value && editUrlInput.value) {
        chrome.bookmarks.update(contextMenuTargetId, {
            title: editTitleInput.value,
            url: editUrlInput.value
        }, (updatedNode) => {
            console.log('Bookmark updated:', updatedNode);
            editModal.classList.add('hidden');
            // 更新 UI
            const card = document.querySelector(`a[data-id="${contextMenuTargetId}"]`);
            if (card) {
                card.querySelector('h3').textContent = updatedNode.title;
                card.querySelector('h3').title = updatedNode.title; // tooltip
                
                // 更新 URL 显示
                let newHostname = '';
                try {
                    newHostname = new URL(updatedNode.url).hostname;
                } catch (e) { newHostname = updatedNode.url; }
                card.querySelector('p').textContent = newHostname;
                
                // 更新图标
                const newIconUrl = getFaviconUrl(updatedNode.url);
                card.querySelector('img').src = newIconUrl;
                
                card.href = updatedNode.url;
            }
        });
    } else {
        console.warn('Missing required fields or target ID');
    }
});

// 显示菜单函数
function showContextMenu(x, y, id) {
    contextMenuTargetId = id;
    
    // 防止菜单溢出屏幕
    const w = window.innerWidth;
    const h = window.innerHeight;
    const mw = 144; // approximate menu width
    const mh = 80;  // approximate menu height
    
    if (x + mw > w) x = x - mw;
    if (y + mh > h) y = y - mh;

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.remove('hidden');
    
    // 动画效果
    requestAnimationFrame(() => {
        contextMenu.classList.remove('opacity-0', 'scale-95');
        contextMenu.classList.add('opacity-100', 'scale-100');
    });
}

// 隐藏菜单函数
function hideContextMenu() {
    if (!contextMenu.classList.contains('hidden')) {
        contextMenu.classList.add('opacity-0', 'scale-95');
        contextMenu.classList.remove('opacity-100', 'scale-100');
        setTimeout(() => {
            contextMenu.classList.add('hidden');
        }, 100); // wait for transition
    }
}