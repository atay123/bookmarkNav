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

// 面包屑更新逻辑
function updateBreadcrumbs(folder) {
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    if (!breadcrumbsContainer) return;
    
    const path = [];
    
    function buildPath(nodeId) {
        if (!nodeId || nodeId === '0') { // 0 is root
            renderBreadcrumbs(path.reverse());
            return;
        }
        chrome.bookmarks.get(nodeId, (results) => {
            if (results && results.length > 0) {
                const node = results[0];
                path.push(node);
                buildPath(node.parentId);
            } else {
                renderBreadcrumbs(path.reverse());
            }
        });
    }

    buildPath(folder.id);
}

function renderBreadcrumbs(path) {
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    breadcrumbsContainer.innerHTML = '';

    // 首页图标
    const homeLink = document.createElement('span');
    homeLink.className = 'flex items-center gap-1 cursor-pointer hover:text-indigo-600 transition-colors';
    homeLink.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
        首页
    `;
    homeLink.onclick = () => {
         if (allBookmarks && allBookmarks.length > 0) {
             const defaultFolder = findFirstFolder(allBookmarks[0]);
             if (defaultFolder) renderBookmarkSites(defaultFolder);
         }
    };
    breadcrumbsContainer.appendChild(homeLink);

    path.forEach((node, index) => {
        const separator = document.createElement('span');
        separator.className = 'mx-1 text-slate-300 dark:text-slate-600';
        separator.textContent = '/';
        breadcrumbsContainer.appendChild(separator);

        const item = document.createElement('span');
        if (index === path.length - 1) {
            item.className = 'font-semibold text-slate-800 dark:text-slate-200';
        } else {
            item.className = 'cursor-pointer hover:text-indigo-600 transition-colors';
            item.onclick = () => {
                chrome.bookmarks.getSubTree(node.id, (results) => {
                     if (results && results.length > 0) {
                         renderBookmarkSites(results[0]);
                     }
                });
            };
        }
        item.textContent = node.title || 'Root';
        breadcrumbsContainer.appendChild(item);
    });
}


// 渲染左侧书签目录树
function renderBookmarkTree(bookmark) {
    const treeContainer = document.getElementById('bookmark-tree');
    treeContainer.innerHTML = '';
    
    function renderNode(node, container, level = 0) {
        if (level === 0 && !node.title) {
             if (node.children) {
                node.children.forEach(child => renderNode(child, container, level + 1));
            }
            return;
        }

        if (node.children) {
             const itemWrapper = document.createElement('div');
             
             const nodeElement = document.createElement('div');
             nodeElement.className = `
                flex items-center px-3 py-2 cursor-pointer transition-all duration-200
                hover:bg-slate-100 group mb-0.5 text-sm font-medium text-slate-600
                border-l-4 border-transparent
                bookmark-folder-item
                dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200
             `;
             nodeElement.dataset.id = node.id;
             
             const hasSubFolders = node.children.some(child => child.children);
             
             nodeElement.innerHTML = `
                <span class="mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors dark:text-slate-500 dark:group-hover:text-indigo-400">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                </span>
                <span class="truncate flex-1">${node.title}</span>
             `;
             
             nodeElement.addEventListener('click', function(e) {
                 e.stopPropagation();
                 chrome.bookmarks.getSubTree(node.id, (results) => {
                    if (results && results.length > 0) {
                        renderBookmarkSites(results[0]);
                    }
                 });

                 document.querySelectorAll('.bookmark-folder-item').forEach(el => {
                     el.classList.remove('border-indigo-500', 'bg-indigo-50', 'text-indigo-700', 'dark:border-indigo-500', 'dark:bg-indigo-900/20', 'dark:text-indigo-300');
                     el.classList.add('border-transparent', 'text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-400', 'dark:hover:bg-slate-800');
                 });
                 
                 nodeElement.classList.remove('border-transparent', 'text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-400', 'dark:hover:bg-slate-800');
                 nodeElement.classList.add('border-indigo-500', 'bg-indigo-50', 'text-indigo-700', 'dark:border-indigo-500', 'dark:bg-indigo-900/20', 'dark:text-indigo-300');
             });
             
             itemWrapper.appendChild(nodeElement);
             
             if (node.children.some(child => child.children)) {
                 const childrenContainer = document.createElement('div');
                 childrenContainer.className = 'ml-4 pl-1 border-l border-slate-200 dark:border-slate-700 space-y-0.5';
                 itemWrapper.appendChild(childrenContainer);
                 
                 node.children.forEach(child => renderNode(child, childrenContainer, level + 1));
             }
             
             container.appendChild(itemWrapper);
        }
    }
    
    renderNode(bookmark, treeContainer);
}

// 渲染右侧书签站点
function renderBookmarkSites(folder) {
    const sitesContainer = document.getElementById('bookmark-sites');
    sitesContainer.innerHTML = '';
    currentFolder = folder;
    
    updateBreadcrumbs(folder);

    const sites = folder.children ? folder.children.filter(node => !node.children) : [];

    if (sites.length === 0) {
        sitesContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-96 text-slate-400">
                <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                <p class="mb-4">此文件夹为空</p>
                <button class="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50" onclick="alert('请使用浏览器快捷键 Ctrl+D (Cmd+D) 添加书签')">
                    如何添加书签?
                </button>
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
            setTimeout(() => {
                item.classList.add('opacity-50', 'scale-95');
            }, 0);
        });

        item.addEventListener('dragend', function(e) {
            item.classList.remove('opacity-50', 'scale-95');
            draggedItem = null;
            sitesGrid.querySelectorAll('.border-indigo-500').forEach(el => {
                el.classList.remove('border-indigo-500', 'border-2', 'border-dashed');
            });
        });

        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        
        item.addEventListener('dragenter', function(e) {
            e.preventDefault();
            if (item !== draggedItem) {
                item.classList.add('border-indigo-500', 'border-2', 'border-dashed');
            }
        });

        item.addEventListener('dragleave', function(e) {
            item.classList.remove('border-indigo-500', 'border-2', 'border-dashed');
        });

        item.addEventListener('drop', function(e) {
            e.preventDefault();
            if (item === draggedItem) return;
            
            const allItems = Array.from(sitesGrid.children);
            const draggedIndex = allItems.indexOf(draggedItem);
            const targetIndex = allItems.indexOf(item);
            
            if (draggedIndex < targetIndex) {
                item.parentNode.insertBefore(draggedItem, item.nextSibling);
            } else {
                item.parentNode.insertBefore(draggedItem, item);
            }
            
            const newPositionInDom = Array.from(sitesGrid.children).indexOf(draggedItem);
            
            chrome.bookmarks.move(draggedItem.dataset.id, {
                parentId: currentFolder.id,
                index: newPositionInDom
            }, function() {
                loadBookmarks();
            });
        });
    });
}

// 渲染单个站点卡片
function renderSiteCard(node, container) {
    let hostname = '';
    try {
        const url = new URL(node.url);
        hostname = url.hostname.replace(/^www\./, '');
    } catch (e) {
        hostname = node.url;
    }

    const faviconUrl = getFaviconUrl(node.url);
    
    const card = document.createElement('a');
    card.href = node.url;
    card.target = "_blank";
    card.dataset.id = node.id;
    card.className = `
        group bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgb(0,0,0,0.04)] 
        hover:shadow-[0_8px_24px_rgb(0,0,0,0.08)] hover:-translate-y-1 
        transition-all duration-300 flex flex-col relative overflow-hidden h-32
        dark:bg-slate-800 dark:shadow-none dark:hover:bg-slate-750 dark:hover:shadow-lg dark:hover:shadow-black/20
    `;

    card.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, node.id);
    });
    
    card.innerHTML = `
        <div class="flex items-start justify-between mb-3">
            <div class="w-10 h-10 rounded-xl bg-slate-50 p-0.5 flex items-center justify-center group-hover:scale-105 transition-transform dark:bg-slate-700/50">
                <img src="${faviconUrl}" class="w-8 h-8 object-contain rounded-lg" alt="icon">
            </div>
            <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 transform translate-x-2 group-hover:translate-x-0">
                <span class="text-slate-400 hover:text-indigo-500 p-1 transition-colors dark:text-slate-500 dark:hover:text-indigo-400">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                </span>
            </div>
        </div>
        <div class="mt-auto">
            <h3 class="font-bold text-slate-700 text-sm mb-0.5 truncate dark:text-slate-200 group-hover:text-indigo-600 transition-colors" title="${node.title}">${node.title}</h3>
            <p class="text-xs text-slate-400 truncate font-mono opacity-80 dark:text-slate-500">${hostname}</p>
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
        
        chrome.bookmarks.search(query, (results) => {
            const sitesContainer = document.getElementById('bookmark-sites');
            sitesContainer.innerHTML = '';
            
            const breadcrumbsContainer = document.getElementById('breadcrumbs');
            if(breadcrumbsContainer) {
                breadcrumbsContainer.innerHTML = `<span class="text-slate-500 dark:text-slate-400">搜索结果: "${query}" (${results.length})</span>`;
            }
            
            if (results.length === 0) {
                sitesContainer.innerHTML = '<p class="text-center text-slate-400 mt-10">未找到匹配的书签</p>';
                return;
            }
            
            const sitesGrid = document.createElement('div');
            sitesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-10';
            
            results.forEach(node => {
                if (node.url) {
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

// 删除按钮
document.getElementById('ctx-delete').addEventListener('click', () => {
    if (contextMenuTargetId) {
        if (confirm('确定要删除这个书签吗？')) {
            chrome.bookmarks.remove(contextMenuTargetId, () => {
                // 删除成功后刷新视图
                const cardToRemove = document.querySelector(`a[data-id="${contextMenuTargetId}"]`);
                if (cardToRemove) {
                    cardToRemove.remove();
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
    editModal.classList.add('hidden');
});

// 模态框：保存
document.getElementById('btn-save').addEventListener('click', () => {
    if (contextMenuTargetId && editTitleInput.value && editUrlInput.value) {
        chrome.bookmarks.update(contextMenuTargetId, {
            title: editTitleInput.value,
            url: editUrlInput.value
        }, (updatedNode) => {
            editModal.classList.add('hidden');
            // 更新 UI
            const card = document.querySelector(`a[data-id="${contextMenuTargetId}"]`);
            if (card) {
                card.querySelector('h3').textContent = updatedNode.title;
                card.querySelector('h3').title = updatedNode.title;
                
                let newHostname = '';
                try {
                    newHostname = new URL(updatedNode.url).hostname.replace(/^www\./, '');
                } catch (e) { newHostname = updatedNode.url; }
                card.querySelector('p').textContent = newHostname;
                
                const newIconUrl = getFaviconUrl(updatedNode.url);
                card.querySelector('img').src = newIconUrl;
                
                card.href = updatedNode.url;
            }
        });
    }
});

// 显示菜单函数
function showContextMenu(x, y, id) {
    contextMenuTargetId = id;
    
    const w = window.innerWidth;
    const h = window.innerHeight;
    const mw = 144;
    const mh = 80;
    
    if (x + mw > w) x = x - mw;
    if (y + mh > h) y = y - mh;

    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.remove('hidden');
    
    requestAnimationFrame(() => {
        contextMenu.classList.remove('opacity-0', 'scale-95');
        contextMenu.classList.add('opacity-100', 'scale-100');
    });
}

// 隐藏菜单函数
function hideContextMenu() {
    if (contextMenu && !contextMenu.classList.contains('hidden')) {
        contextMenu.classList.add('opacity-0', 'scale-95');
        contextMenu.classList.remove('opacity-100', 'scale-100');
        setTimeout(() => {
            contextMenu.classList.add('hidden');
        }, 100);
    }
}