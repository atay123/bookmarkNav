// 全局变量存储书签数据
let allBookmarks = [];
let currentFolder = null;
let allSites = []; // 用于搜索缓存

// 初始化函数
document.addEventListener('DOMContentLoaded', function() {
    loadBookmarks();
    setupSearch();
});

// 处理图标加载失败的函数
function handleFaviconError(img, faviconUrls, currentIndex) {
    img.onerror = null; // 清除监听器防止循环
    currentIndex++;
    if (currentIndex < faviconUrls.length) {
        img.src = faviconUrls[currentIndex];
        // 重新绑定错误处理
        img.addEventListener('error', () => {
            handleFaviconError(img, faviconUrls, currentIndex);
        }, { once: true });
    } else {
        // 使用SVG Placeholder
        img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' /%3E%3C/svg%3E`;
        img.parentElement.classList.add('bg-slate-100', 'p-2'); // 样式调整
    }
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
            `;
            nodeElement.dataset.id = node.id;
            // 动态缩进
            nodeElement.style.paddingLeft = `${(level - 1) * 16 + 12}px`;
            
            const hasSubFolders = node.children.some(child => child.children);
            
            nodeElement.innerHTML = `
                <span class="mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                </span>
                <span class="truncate">${node.title}</span>
                ${hasSubFolders ? '<span class="ml-auto text-xs text-slate-300">›</span>' : ''}
            `;
            
            nodeElement.addEventListener('click', function(e) {
                e.stopPropagation();
                renderBookmarkSites(node);
                
                // 高亮状态处理
                document.querySelectorAll('.bookmark-folder-item').forEach(el => {
                    el.classList.remove('bg-indigo-50', 'text-indigo-700', 'shadow-sm', 'ring-1', 'ring-indigo-200');
                    el.classList.add('text-slate-600', 'hover:bg-slate-100');
                });
                nodeElement.classList.remove('text-slate-600', 'hover:bg-slate-100');
                nodeElement.classList.add('bg-indigo-50', 'text-indigo-700', 'shadow-sm', 'ring-1', 'ring-indigo-200');
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
}

// 渲染单个站点卡片
function renderSiteCard(node, container) {
    const url = new URL(node.url);
    const hostname = url.hostname;
    const faviconUrls = [
        `${url.protocol}//${hostname}/favicon.ico`,
        `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
        `https://icon.horse/icon/${hostname}`
    ];
    
    const card = document.createElement('a');
    card.href = node.url;
    card.target = "_blank";
    card.className = `
        group bg-white rounded-2xl p-5 border border-slate-100 shadow-sm 
        hover:shadow-xl hover:shadow-indigo-100/50 hover:-translate-y-1 hover:border-indigo-100 
        transition-all duration-300 flex flex-col relative overflow-hidden h-32
    `;
    
    card.innerHTML = `
        <div class="flex items-start justify-between mb-3">
            <div class="w-10 h-10 rounded-xl bg-slate-50 p-0.5 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <img src="${faviconUrls[0]}" class="w-8 h-8 object-contain rounded-lg" alt="icon">
            </div>
            <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 transform translate-x-2 group-hover:translate-x-0">
                <span class="text-indigo-500 bg-indigo-50 p-1.5 rounded-lg hover:bg-indigo-100 block">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </span>
            </div>
        </div>
        <div class="mt-auto">
            <h3 class="font-bold text-slate-700 text-sm mb-0.5 truncate" title="${node.title}">${node.title}</h3>
            <p class="text-xs text-slate-400 truncate font-mono opacity-80 group-hover:text-indigo-400 transition-colors">${hostname}</p>
        </div>
    `;
    
    // 图标错误处理
    const img = card.querySelector('img');
    img.addEventListener('error', () => {
        handleFaviconError(img, faviconUrls, 0);
    }, { once: true });
    
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
