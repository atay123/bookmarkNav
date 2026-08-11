// 全局变量存储书签数据
let allBookmarks = [];
let currentFolder = null;
let expandedFolders = new Set(); // Store IDs of expanded folders
let draggedFolderNode = null; // Store the currently dragged folder node
const LAST_SELECTED_FOLDER_KEY = 'lastSelectedFolderId';

// --- 主题切换逻辑 ---
let currentThemePreference = localStorage.getItem('color-theme') || 'system'; // Default to system

function applyTheme(preference) {
    const htmlElement = document.documentElement;
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const systemIcon = document.getElementById('theme-toggle-system-icon');

    // Hide all icons first
    [lightIcon, darkIcon, systemIcon].forEach(icon => { if(icon) icon.classList.add('hidden'); });

    if (preference === 'dark') {
        htmlElement.classList.add('dark');
        if (darkIcon) darkIcon.classList.remove('hidden');
    } else if (preference === 'light') {
        htmlElement.classList.remove('dark');
        if (lightIcon) lightIcon.classList.remove('hidden');
    } else { // 'system'
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            htmlElement.classList.add('dark');
        } else {
            htmlElement.classList.remove('dark');
        }
        if (systemIcon) systemIcon.classList.remove('hidden');
    }
    localStorage.setItem('color-theme', preference);
    currentThemePreference = preference; // Update global state
}

// 立即执行主题检查，防止页面闪烁
// Note: Icon visibility is handled by applyTheme, so we need to call it directly.
applyTheme(currentThemePreference);

// 初始化函数
document.addEventListener('DOMContentLoaded', function () {
    loadBookmarks();
    setupSearch();
    setupThemeEventListener(); // Renamed to avoid confusion with immediate apply
});

function setupThemeEventListener() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', function() {
            let nextPreference;
            if (currentThemePreference === 'light') {
                nextPreference = 'dark';
            } else if (currentThemePreference === 'dark') {
                nextPreference = 'system';
            } else { // currentThemePreference === 'system'
                nextPreference = 'light';
            }
            applyTheme(nextPreference);
        });

        // Listen for system theme changes if current preference is 'system'
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (currentThemePreference === 'system') {
                applyTheme('system'); // Re-apply to reflect system change
            }
        });
    }
}

// 获取 Chrome 内部 Favicon URL
function getFaviconUrl(pageUrl) {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', '32');
    return url.toString();
}

// 加载所有书签
function loadBookmarks(options = {}) {
    const { selectedFolderId = null, preserveSearch = true } = options;
    chrome.bookmarks.getTree(function (bookmarkTreeNodes) {
        allBookmarks = bookmarkTreeNodes;
        const rootNode = bookmarkTreeNodes[0];
        const storedFolderId = localStorage.getItem(LAST_SELECTED_FOLDER_KEY);
        const preferredFolderIds = [selectedFolderId, storedFolderId].filter(Boolean);
        let selectedFolder = null;

        for (const folderId of preferredFolderIds) {
            const candidate = findNodeById(rootNode, folderId);
            if (candidate && Array.isArray(candidate.children)) {
                selectedFolder = candidate;
                break;
            }
        }

        if (!selectedFolder) {
            selectedFolder = findFirstFolder(rootNode);
        }

        if (storedFolderId) {
            const storedNode = findNodeById(rootNode, storedFolderId);
            if (!storedNode || !Array.isArray(storedNode.children)) {
                localStorage.removeItem(LAST_SELECTED_FOLDER_KEY);
            }
        }

        renderBookmarkTree(rootNode, selectedFolder ? selectedFolder.id : null);

        const searchInput = document.getElementById('search-input');
        const activeQuery = preserveSearch && searchInput ? searchInput.value.trim() : '';
        if (activeQuery) {
            if (selectedFolder) {
                currentFolder = selectedFolder;
                saveSelectedFolder(selectedFolder.id);
                updateFolderSelection(selectedFolder.id);
            }
            renderSearchResults(activeQuery);
            return;
        }

        if (selectedFolder) {
            renderBookmarkSites(selectedFolder);
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

function findNodeById(node, targetId) {
    if (!node || !targetId) return null;
    if (node.id === targetId) return node;
    if (!node.children) return null;

    for (const child of node.children) {
        const found = findNodeById(child, targetId);
        if (found) return found;
    }

    return null;
}

function saveSelectedFolder(folderId) {
    if (folderId) {
        localStorage.setItem(LAST_SELECTED_FOLDER_KEY, folderId);
    }
}

function expandFolderAncestors(node, targetId) {
    if (!node || !node.children) return false;
    if (node.id === targetId) return true;

    for (const child of node.children) {
        if (expandFolderAncestors(child, targetId)) {
            if (node.id !== '0') expandedFolders.add(node.id);
            return true;
        }
    }

    return false;
}

function updateFolderSelection(folderId) {
    document.querySelectorAll('.bookmark-folder-item').forEach((element) => {
        const isSelected = element.dataset.id === folderId;

        element.classList.toggle('border-indigo-500', isSelected);
        element.classList.toggle('bg-indigo-50', isSelected);
        element.classList.toggle('text-indigo-700', isSelected);
        element.classList.toggle('dark:border-indigo-500', isSelected);
        element.classList.toggle('dark:bg-indigo-900/20', isSelected);
        element.classList.toggle('dark:text-indigo-300', isSelected);

        element.classList.toggle('border-transparent', !isSelected);
        element.classList.toggle('text-slate-600', !isSelected);
        element.classList.toggle('hover:bg-slate-100', !isSelected);
        element.classList.toggle('dark:text-slate-400', !isSelected);
        element.classList.toggle('dark:hover:bg-slate-800', !isSelected);
    });
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
        Home
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
function renderBookmarkTree(bookmark, selectedFolderId = null) {
    const treeContainer = document.getElementById('bookmark-tree');
    treeContainer.innerHTML = '';

    // Restore expanded state
    try {
        const saved = localStorage.getItem('expandedFolders');
        if (saved) {
            expandedFolders = new Set(JSON.parse(saved));
        } else {
            // Default: Expand top-level folders (usually "Bookmarks Bar" and "Other Bookmarks")
            if (bookmark.children) {
                bookmark.children.forEach(child => expandedFolders.add(child.id));
            }
        }
    } catch (e) {
        console.error("Failed to load expanded state", e);
        // Fallback default
        if (bookmark.children) {
            bookmark.children.forEach(child => expandedFolders.add(child.id));
        }
    }

    function saveExpandedState() {
        localStorage.setItem('expandedFolders', JSON.stringify([...expandedFolders]));
    }

    if (selectedFolderId) {
        expandFolderAncestors(bookmark, selectedFolderId);
        saveExpandedState();
    }

    // 辅助函数：检查是否为后代节点（防止拖拽死循环）
    function isDescendant(parent, childId) {
        if (!parent.children) return false;
        for (let child of parent.children) {
            if (child.id === childId) return true;
            if (isDescendant(child, childId)) return true;
        }
        return false;
    }

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
            // Added pointer-events-none to children below, so drag events trigger on nodeElement
            nodeElement.className = `
                flex items-center px-3 py-2 cursor-pointer transition-all duration-200
                hover:bg-slate-100 group mb-0.5 text-sm font-medium text-slate-600
                border-l-4 border-transparent
                bookmark-folder-item
                dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200
             `;
            nodeElement.dataset.id = node.id;
            
            // 启用文件夹拖拽 (根目录的直接子级通常是系统文件夹，最好不要动，但这里先开放)
            if (node.parentId !== '0') {
                nodeElement.draggable = true;
            }

            // Check for sub-folders (only folders can be expanded)
            const hasSubFolders = node.children.some(child => child.children);
            const isExpanded = expandedFolders.has(node.id);

            // Chevron Icon (Increased hit area)
            let chevronHtml = '';
            if (hasSubFolders) {
                chevronHtml = `
                    <span class="mr-1 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors folder-toggle transform ${isExpanded ? 'rotate-90' : ''}">
                        <svg class="w-3 h-3 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </span>
                 `;
            } else {
                chevronHtml = `<span class="w-6 mr-1"></span>`;
            }

            nodeElement.innerHTML = `
                ${chevronHtml}
                <span class="mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors dark:text-slate-500 dark:group-hover:text-indigo-400 pointer-events-none">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
                </span>
                <span class="truncate flex-1 pointer-events-none select-none">${node.title}</span>
             `;

            // Define toggle function
            const toggleFolder = () => {
                if (!hasSubFolders) return;

                const toggleBtn = nodeElement.querySelector('.folder-toggle');
                const childContainer = itemWrapper.querySelector('.children-container');

                const currentlyExpanded = expandedFolders.has(node.id);

                if (currentlyExpanded) {
                    // Collapse
                    expandedFolders.delete(node.id);
                    if (toggleBtn) toggleBtn.classList.remove('rotate-90');
                    if (childContainer) childContainer.classList.add('hidden');
                } else {
                    // Expand
                    expandedFolders.add(node.id);
                    if (toggleBtn) toggleBtn.classList.add('rotate-90');
                    if (childContainer) childContainer.classList.remove('hidden');
                }
                saveExpandedState();
            };

            // Toggle Click (Chevron)
            if (hasSubFolders) {
                const toggleBtn = nodeElement.querySelector('.folder-toggle');
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleFolder();
                });
            }

            // Item Click (Selection + Toggle)
            nodeElement.addEventListener('click', function (e) {
                e.stopPropagation();

                // 1. Toggle Folder (Always toggle on click as per user request)
                if (hasSubFolders) {
                    toggleFolder();
                }

                // 2. Load Content
                chrome.bookmarks.getSubTree(node.id, (results) => {
                    if (results && results.length > 0) {
                        renderBookmarkSites(results[0]);
                    }
                });
            });

            // --- 右键菜单 (文件夹) ---
            nodeElement.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(e.clientX, e.clientY, node.id, 'folder');
            });
            
            // --- 文件夹拖拽事件 (Drag Start/End) ---
            nodeElement.addEventListener('dragstart', (e) => {
                draggedFolderNode = node;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', node.id); // Required for FF
                
                // 视觉反馈
                requestAnimationFrame(() => {
                    nodeElement.classList.add('opacity-50', 'scale-[0.98]');
                });
            });

            nodeElement.addEventListener('dragend', (e) => {
                draggedFolderNode = null;
                nodeElement.classList.remove('opacity-50', 'scale-[0.98]');
                // 清理可能的残留样式
                document.querySelectorAll('.bookmark-folder-item').forEach(el => {
                    el.classList.remove('ring-2', 'ring-inset', 'ring-indigo-500', 'bg-indigo-50', 'dark:ring-indigo-400', 'dark:bg-indigo-900/20');
                    el.style.boxShadow = 'none';
                    delete el.dataset.dropAction;
                });
            });

            // --- 拖拽目标 (Drag Over / Drop) ---
            nodeElement.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';

                // 1. 如果是拖拽书签 (保持原有逻辑)
                if (!draggedFolderNode) {
                    nodeElement.classList.add('ring-2', 'ring-inset', 'ring-indigo-500', 'bg-indigo-50', 'dark:ring-indigo-400', 'dark:bg-indigo-900/20');
                    nodeElement.dataset.dropAction = 'inside';
                    return;
                }

                // 2. 如果是拖拽文件夹
                
                // 防止拖拽到自己或自己的子代中
                if (draggedFolderNode.id === node.id || isDescendant(draggedFolderNode, node.id)) {
                    e.dataTransfer.dropEffect = 'none';
                    return;
                }
                
                // 计算拖拽区域 (Top/Middle/Bottom)
                const rect = nodeElement.getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                const height = rect.height;
                const threshold = height * 0.25; // Top/Bottom 25% triggers reorder
                
                // Reset visual states
                nodeElement.classList.remove('ring-2', 'ring-inset', 'ring-indigo-500', 'bg-indigo-50', 'dark:ring-indigo-400', 'dark:bg-indigo-900/20');
                nodeElement.style.boxShadow = 'none';
                
                if (offsetY < threshold) {
                    // Before
                    nodeElement.style.boxShadow = 'inset 0 3px 0 0 #6366f1'; // Top blue line
                    nodeElement.dataset.dropAction = 'before';
                } else if (offsetY > height - threshold) {
                    // After
                    nodeElement.style.boxShadow = 'inset 0 -3px 0 0 #6366f1'; // Bottom blue line
                    nodeElement.dataset.dropAction = 'after';
                } else {
                    // Inside
                    nodeElement.classList.add('ring-2', 'ring-inset', 'ring-indigo-500', 'bg-indigo-50', 'dark:ring-indigo-400', 'dark:bg-indigo-900/20');
                    nodeElement.dataset.dropAction = 'inside';
                }
            });

            nodeElement.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // 避免子元素触发导致闪烁
                if (nodeElement.contains(e.relatedTarget)) return;

                nodeElement.classList.remove('ring-2', 'ring-inset', 'ring-indigo-500', 'bg-indigo-50', 'dark:ring-indigo-400', 'dark:bg-indigo-900/20');
                nodeElement.style.boxShadow = 'none';
                delete nodeElement.dataset.dropAction;
            });

            nodeElement.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Clear visuals
                nodeElement.classList.remove('ring-2', 'ring-inset', 'ring-indigo-500', 'bg-indigo-50', 'dark:ring-indigo-400', 'dark:bg-indigo-900/20');
                nodeElement.style.boxShadow = 'none';
                
                const action = nodeElement.dataset.dropAction;
                delete nodeElement.dataset.dropAction;

                // 1. 文件夹拖拽处理
                if (draggedFolderNode) {
                    if (draggedFolderNode.id === node.id) return;
                    
                    const destination = {};
                    if (action === 'before') {
                        destination.parentId = node.parentId;
                        destination.index = node.index; // Insert at current index pushes this one down
                    } else if (action === 'after') {
                        destination.parentId = node.parentId;
                        destination.index = node.index + 1;
                    } else { // inside or default
                        destination.parentId = node.id;
                        // index not specified -> append to end
                    }
                    
                    chrome.bookmarks.move(draggedFolderNode.id, destination, () => {
                        loadBookmarks();
                    });
                    return;
                }

                // 2. 书签拖拽处理 (原有逻辑)
                const bookmarkId = e.dataTransfer.getData('text/plain');
                if (bookmarkId) {
                    chrome.bookmarks.move(bookmarkId, { parentId: node.id }, () => {
                        loadBookmarks();
                    });
                }
            });

            itemWrapper.appendChild(nodeElement);

            if (hasSubFolders) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = `children-container ml-4 pl-1 border-l border-slate-200 dark:border-slate-700 space-y-0.5 ${isExpanded ? '' : 'hidden'}`;
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
    saveSelectedFolder(folder.id);
    updateFolderSelection(folder.id);

    updateBreadcrumbs(folder);

    const sites = folder.children ? folder.children.filter(node => !node.children) : [];

    if (sites.length === 0) {
        sitesContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-96 text-slate-400">
                <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                <p class="mb-4">This folder is empty</p>
                <button id="btn-empty-help" class="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50">
                    How to add bookmarks?
                </button>
            </div>
        `;
        // Bind event listener safely (CSP compliant)
        const helpBtn = sitesContainer.querySelector('#btn-empty-help');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                alert('Please use the browser shortcut Ctrl+D (Cmd+D) to add bookmarks.');
            });
        }
        return;
    }

    const sitesGrid = document.createElement('div');
    sitesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-10';

    sites.forEach(node => renderSiteCard(node, sitesGrid));
    sitesContainer.appendChild(sitesGrid);

    // 初始化原生拖拽
    let draggedItem = null;

    sitesGrid.querySelectorAll('[data-bookmark-card]').forEach(item => {
        item.setAttribute('draggable', true);

        item.addEventListener('dragstart', function (e) {
            draggedItem = item;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.id);
            // 延迟添加样式，避免拖拽时的 ghost image 也变半透明
            requestAnimationFrame(() => {
                item.classList.add('opacity-50', 'scale-95', 'ring-2', 'ring-indigo-200');
            });
        });

        item.addEventListener('dragend', function (e) {
            item.classList.remove('opacity-50', 'scale-95', 'ring-2', 'ring-indigo-200');
            draggedItem = null;
            // 清除所有卡片的指示样式
            sitesGrid.querySelectorAll('[data-bookmark-card]').forEach(el => {
                el.style.boxShadow = 'none';
                el.style.transform = ''; // 清除可能的位移
            });
        });

        item.addEventListener('dragover', function (e) {
            e.preventDefault(); // 允许 drop
            e.dataTransfer.dropEffect = 'move';

            if (item === draggedItem) return;

            // 核心逻辑：计算鼠标在卡片的左侧还是右侧
            const rect = item.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;

            // 清除旧样式
            item.style.boxShadow = 'none';

            if (e.clientX < midX) {
                // 鼠标在左侧 -> 插入到前面
                item.style.boxShadow = '-4px 0 0 0 #6366f1'; // indigo-500 border-l
                item.dataset.insertPos = 'before';
            } else {
                // 鼠标在右侧 -> 插入到后面
                item.style.boxShadow = '4px 0 0 0 #6366f1'; // indigo-500 border-r
                item.dataset.insertPos = 'after';
            }
        });

        item.addEventListener('dragleave', function (e) {
            // 只有当真正离开元素时才移除（避免子元素触发）
            // 注意：由于我们给子元素加了 pointer-events: none，这里的 relatedTarget 检查可能变得更简单
            // 但为了保险起见，还是保留检查。
            if (e.relatedTarget && !item.contains(e.relatedTarget)) {
                item.style.boxShadow = 'none';
            }
        });

        item.addEventListener('drop', function (e) {
            e.preventDefault();
            item.style.boxShadow = 'none'; // 清除样式

            if (item === draggedItem) return;

            const insertPos = item.dataset.insertPos; // 'before' or 'after'

            // DOM 操作：移动元素
            if (insertPos === 'before') {
                item.parentNode.insertBefore(draggedItem, item);
            } else {
                item.parentNode.insertBefore(draggedItem, item.nextSibling);
            }

            // 计算新索引并调用 Chrome API
            // 注意：这里需要获取移动后在父容器中的实际 index
            // Array.from(item.parentNode.children) 包含了所有的卡片，顺序即为当前 DOM 顺序
            const newIndex = Array.from(item.parentNode.children).indexOf(draggedItem);

            chrome.bookmarks.move(draggedItem.dataset.id, {
                parentId: currentFolder.id,
                index: newIndex
            }, function () {
                // 可选：如果不重载，需要手动更新 allBookmarks 数据以保持同步
                // loadBookmarks(); 
            });
        });
    });
}

function escapeHtml(value) {
    const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return String(value || '').replace(/[&<>"']/g, char => entities[char]);
}

// 渲染单个站点卡片
function renderSiteCard(node, container, showPath = false) {
    let hostname = '';
    try {
        const url = new URL(node.url);
        hostname = url.hostname.replace(/^www\./, '');
    } catch (e) {
        hostname = node.url;
    }

    const faviconUrl = getFaviconUrl(node.url);
    const safeTitle = escapeHtml(node.title || 'Untitled');
    const safeHostname = escapeHtml(hostname);
    const safeUrl = escapeHtml(node.url);

    const card = document.createElement('div');
    card.dataset.id = node.id;
    card.dataset.bookmarkCard = 'true';
    card.className = `
        bookmark-card group bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgb(0,0,0,0.04)]
        hover:shadow-[0_8px_24px_rgb(0,0,0,0.08)] hover:-translate-y-1 
        transition-all duration-300 flex flex-col relative h-32 cursor-pointer
        dark:bg-slate-800 dark:shadow-none dark:hover:bg-slate-750 dark:hover:shadow-lg dark:hover:shadow-black/20
    `;
    card.className += " overflow-hidden";

    if (showPath && node.parentId) {
        chrome.bookmarks.get(node.parentId, (parents) => {
            if (parents && parents.length > 0) {
                const parentTitle = parents[0].title;
                const badge = document.createElement('span');
                badge.className = 'absolute bottom-2 right-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600 pointer-events-none opacity-80';
                badge.textContent = parentTitle;
                card.appendChild(badge);
            }
        });
    }

    card.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, node.id, 'bookmark', node.url);
    });

    card.innerHTML = `
        <a href="${safeUrl}" draggable="false" data-card-link class="absolute inset-0 z-0" aria-label="Open ${safeTitle}"></a>
        <div class="relative z-10 flex items-start justify-between mb-3 pointer-events-none">
            <div class="w-10 h-10 rounded-xl bg-slate-50 p-0.5 flex items-center justify-center group-hover:scale-105 transition-transform dark:bg-slate-700/50 pointer-events-none">
                <img src="${faviconUrl}" class="w-8 h-8 object-contain rounded-lg" alt="icon">
            </div>
            <button type="button" data-card-menu-button aria-label="More actions for ${safeTitle}" aria-haspopup="menu" title="More actions" class="pointer-events-auto opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200 transform translate-x-2 group-hover:translate-x-0 focus:translate-x-0 text-slate-400 hover:text-indigo-500 p-1 rounded-lg hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:text-slate-500 dark:hover:text-indigo-400 dark:hover:bg-slate-700 dark:focus:bg-slate-700">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
            </button>
        </div>
        <div class="relative z-10 mt-auto pointer-events-none">
            <h3 class="font-bold text-slate-700 text-sm mb-0.5 truncate dark:text-slate-200 group-hover:text-indigo-600 transition-colors" title="${safeTitle}">${safeTitle}</h3>
            <p class="text-xs text-slate-400 truncate font-mono opacity-80 dark:text-slate-500">${safeHostname}</p>
        </div>
    `;

    const menuButton = card.querySelector('[data-card-menu-button]');
    if (menuButton) {
        menuButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const rect = menuButton.getBoundingClientRect();
            showContextMenu(rect.right - 240, rect.bottom + 6, node.id, 'bookmark', node.url);
        });
    }

    container.appendChild(card);
}

// 简单的搜索功能
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (!query) {
            if (currentFolder) renderBookmarkSites(currentFolder);
            return;
        }

        renderSearchResults(query);
    });
}

function renderSearchResults(query) {
    chrome.bookmarks.search(query, (results) => {
        const sitesContainer = document.getElementById('bookmark-sites');
        sitesContainer.innerHTML = '';

        const breadcrumbsContainer = document.getElementById('breadcrumbs');
        if (breadcrumbsContainer) {
            breadcrumbsContainer.innerHTML = `<span class="text-slate-500 dark:text-slate-400">Search Results: "${query}" (${results.length})</span>`;
        }

        if (results.length === 0) {
            sitesContainer.innerHTML = '<p class="text-center text-slate-400 mt-10">No matching bookmarks found</p>';
            return;
        }

        const sitesGrid = document.createElement('div');
        sitesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-10';

        results.forEach(node => {
            if (node.url) {
                renderSiteCard(node, sitesGrid, true);
            }
        });
        sitesContainer.appendChild(sitesGrid);
    });
}

// --- 右键菜单与编辑功能逻辑 ---

let contextMenuTargetId = null;
let contextMenuTargetType = 'bookmark'; // 'bookmark' or 'folder'
let contextMenuTargetUrl = '';
let pendingNewFolderParentId = null;
let isCreateFolderPending = false;
let pendingDeleteTarget = null;
let isDeletePending = false;
let toastTimer = null;

const contextMenu = document.getElementById('context-menu');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const newFolderModal = document.getElementById('new-folder-modal');
const newFolderForm = document.getElementById('new-folder-form');
const newFolderNameInput = document.getElementById('new-folder-name');
const newFolderCancelBtn = document.getElementById('btn-new-folder-cancel');
const createFolderBtn = document.getElementById('btn-create-folder');
const editModal = document.getElementById('edit-modal');
const editTitleInput = document.getElementById('edit-title');
const editUrlInput = document.getElementById('edit-url');
const editUrlContainer = editUrlInput.parentElement; // Used to hide/show URL input
const deleteModal = document.getElementById('delete-modal');
const deleteModalTitle = document.getElementById('delete-modal-title');
const deleteModalDescription = document.getElementById('delete-modal-description');
const deleteModalName = document.getElementById('delete-modal-name');
const deleteModalMeta = document.getElementById('delete-modal-meta');
const deleteCancelBtn = document.getElementById('btn-delete-cancel');
const deleteConfirmBtn = document.getElementById('btn-delete-confirm');
const bookmarkContextButtons = [
    document.getElementById('ctx-open-new-tab'),
    document.getElementById('ctx-open-new-window'),
    document.getElementById('ctx-open-incognito'),
    document.getElementById('ctx-copy-link'),
    document.getElementById('ctx-bookmark-divider')
];

// 初始化菜单事件
document.addEventListener('click', (e) => {
    // 点击任何地方关闭菜单
    hideContextMenu();
});

function showBookmarkError(actionLabel) {
    if (!chrome.runtime.lastError) return false;

    const message = chrome.runtime.lastError.message || 'Unknown error';
    console.error(`Failed to ${actionLabel}:`, message);
    alert(`Failed to ${actionLabel}: ${message}`);
    return true;
}

function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        const copied = document.execCommand('copy');
        return copied ? Promise.resolve() : Promise.reject(new Error('Copy command was rejected.'));
    } finally {
        textarea.remove();
    }
}

function showToast(message) {
    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.classList.remove('hidden');

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-3', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.add('translate-y-3', 'opacity-0');
        toast.classList.remove('translate-y-0', 'opacity-100');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 200);
    }, 1800);
}

function getNodeDisplayName(node, type) {
    if (node && node.title) return node.title;
    return type === 'folder' ? 'Untitled folder' : 'Untitled bookmark';
}

function countFolderContents(node) {
    const totals = { bookmarks: 0, folders: 0 };

    function walk(currentNode) {
        if (!currentNode.children) return;

        currentNode.children.forEach(child => {
            if (child.children) {
                totals.folders += 1;
                walk(child);
            } else {
                totals.bookmarks += 1;
            }
        });
    }

    walk(node);
    return totals;
}

function formatFolderDeleteMeta(totals) {
    const details = [];
    if (totals.bookmarks > 0) {
        details.push(`${totals.bookmarks} bookmark${totals.bookmarks === 1 ? '' : 's'}`);
    }
    if (totals.folders > 0) {
        details.push(`${totals.folders} subfolder${totals.folders === 1 ? '' : 's'}`);
    }

    if (details.length === 0) {
        return 'This folder is empty.';
    }

    return `Contains ${details.join(' and ')}.`;
}

function setCreateFolderPendingState(isPending) {
    isCreateFolderPending = isPending;
    createFolderBtn.disabled = isPending;
    newFolderCancelBtn.disabled = isPending;
    newFolderNameInput.disabled = isPending;
    createFolderBtn.textContent = isPending ? 'Creating...' : 'Create';
    createFolderBtn.classList.toggle('opacity-75', isPending);
    createFolderBtn.classList.toggle('cursor-not-allowed', isPending);
}

function openNewFolderModal(parentId) {
    pendingNewFolderParentId = parentId;
    newFolderNameInput.value = '';
    newFolderModal.classList.remove('hidden');
    setCreateFolderPendingState(false);

    setTimeout(() => {
        newFolderNameInput.focus();
    }, 50);
}

function closeNewFolderModal(force = false) {
    if (isCreateFolderPending && !force) return;

    newFolderModal.classList.add('hidden');
    pendingNewFolderParentId = null;
    newFolderNameInput.value = '';
}

function createNewFolder() {
    if (!pendingNewFolderParentId || isCreateFolderPending) return;

    const name = newFolderNameInput.value.trim();
    if (!name) {
        newFolderNameInput.reportValidity();
        return;
    }

    setCreateFolderPendingState(true);
    const parentId = pendingNewFolderParentId;

    chrome.bookmarks.create({
        parentId,
        title: name
    }, () => {
        if (showBookmarkError('create the folder')) {
            setCreateFolderPendingState(false);
            return;
        }

        closeNewFolderModal(true);
        loadBookmarks({ selectedFolderId: parentId });
    });
}

function setDeleteModalPendingState(isPending) {
    isDeletePending = isPending;
    deleteConfirmBtn.disabled = isPending;
    deleteCancelBtn.disabled = isPending;
    deleteConfirmBtn.textContent = isPending ? 'Deleting...' : 'Delete';
    deleteConfirmBtn.classList.toggle('opacity-75', isPending);
    deleteConfirmBtn.classList.toggle('cursor-not-allowed', isPending);
}

function openDeleteModal(config) {
    pendingDeleteTarget = config;
    deleteModalTitle.textContent = config.title;
    deleteModalDescription.textContent = config.description;
    deleteModalName.textContent = config.name;
    deleteModalMeta.textContent = config.meta || '';
    deleteModalMeta.classList.toggle('hidden', !config.meta);
    deleteModal.classList.remove('hidden');
    setDeleteModalPendingState(false);

    setTimeout(() => {
        deleteCancelBtn.focus();
    }, 50);
}

function closeDeleteModal(force = false) {
    if (isDeletePending && !force) return;

    deleteModal.classList.add('hidden');
    pendingDeleteTarget = null;
}

document.getElementById('ctx-open-new-tab').addEventListener('click', () => {
    const url = contextMenuTargetUrl;
    hideContextMenu();
    if (!url) return;

    chrome.tabs.create({ url }, () => {
        showBookmarkError('open the bookmark in a new tab');
    });
});

document.getElementById('ctx-open-new-window').addEventListener('click', () => {
    const url = contextMenuTargetUrl;
    hideContextMenu();
    if (!url) return;

    chrome.windows.create({ url }, () => {
        showBookmarkError('open the bookmark in a new window');
    });
});

document.getElementById('ctx-open-incognito').addEventListener('click', () => {
    const url = contextMenuTargetUrl;
    hideContextMenu();
    if (!url) return;

    chrome.windows.create({ url, incognito: true }, () => {
        showBookmarkError('open the bookmark in an incognito window');
    });
});

document.getElementById('ctx-copy-link').addEventListener('click', () => {
    const url = contextMenuTargetUrl;
    hideContextMenu();
    if (!url) return;

    copyTextToClipboard(url)
        .then(() => {
            showToast('Link copied');
        })
        .catch((error) => {
            console.error('Failed to copy the bookmark URL:', error);
            alert('Failed to copy the bookmark URL.');
        });
});

// 删除按钮
document.getElementById('ctx-delete').addEventListener('click', () => {
    if (!contextMenuTargetId) return;

    hideContextMenu();

    if (contextMenuTargetType === 'folder') {
        chrome.bookmarks.getSubTree(contextMenuTargetId, (results) => {
            if (showBookmarkError('load the folder details')) return;
            if (!results || results.length === 0) return;

            const folder = results[0];
            const totals = countFolderContents(folder);

            openDeleteModal({
                id: folder.id,
                type: 'folder',
                parentId: folder.parentId,
                name: getNodeDisplayName(folder, 'folder'),
                title: 'Delete folder?',
                description: 'This will permanently remove the folder and everything inside it.',
                meta: formatFolderDeleteMeta(totals)
            });
        });
        return;
    }

    chrome.bookmarks.get(contextMenuTargetId, (results) => {
        if (showBookmarkError('load the bookmark details')) return;
        if (!results || results.length === 0) return;

        const bookmark = results[0];
        openDeleteModal({
            id: bookmark.id,
            type: 'bookmark',
            parentId: bookmark.parentId,
            name: getNodeDisplayName(bookmark, 'bookmark'),
            title: 'Delete bookmark?',
            description: 'This will permanently remove the bookmark from Chrome.',
            meta: bookmark.url || ''
        });
    });
});

// 新建文件夹按钮
document.getElementById('ctx-new-folder').addEventListener('click', () => {
    if (contextMenuTargetId && contextMenuTargetType === 'folder') {
        hideContextMenu();
        openNewFolderModal(contextMenuTargetId);
    }
});

// 编辑按钮
document.getElementById('ctx-edit').addEventListener('click', () => {
    if (contextMenuTargetId) {
        chrome.bookmarks.get(contextMenuTargetId, (results) => {
            if (results && results.length > 0) {
                const bookmark = results[0];
                editTitleInput.value = bookmark.title;

                if (contextMenuTargetType === 'folder') {
                    editUrlContainer.classList.add('hidden');
                    editUrlInput.removeAttribute('required');
                } else {
                    editUrlContainer.classList.remove('hidden');
                    editUrlInput.value = bookmark.url;
                    editUrlInput.setAttribute('required', 'true');
                }

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

newFolderCancelBtn.addEventListener('click', () => {
    closeNewFolderModal();
});

newFolderModal.addEventListener('click', (e) => {
    const newFolderPanel = newFolderModal.querySelector('[data-new-folder-panel]');
    if (newFolderPanel && !newFolderPanel.contains(e.target)) {
        closeNewFolderModal();
    }
});

newFolderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    createNewFolder();
});

createFolderBtn.addEventListener('click', () => {
    createNewFolder();
});

deleteCancelBtn.addEventListener('click', () => {
    closeDeleteModal();
});

deleteModal.addEventListener('click', (e) => {
    const deletePanel = deleteModal.querySelector('[data-delete-panel]');
    if (deletePanel && !deletePanel.contains(e.target)) {
        closeDeleteModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !newFolderModal.classList.contains('hidden')) {
        closeNewFolderModal();
        return;
    }

    if (e.key === 'Escape' && !deleteModal.classList.contains('hidden')) {
        closeDeleteModal();
    }
});

deleteConfirmBtn.addEventListener('click', () => {
    if (!pendingDeleteTarget || isDeletePending) return;

    setDeleteModalPendingState(true);

    const { id, type, parentId } = pendingDeleteTarget;
    const removeFunc = type === 'folder' ? chrome.bookmarks.removeTree : chrome.bookmarks.remove;

    removeFunc(id, () => {
        if (showBookmarkError(`delete the ${type}`)) {
            setDeleteModalPendingState(false);
            return;
        }

        closeDeleteModal(true);
        loadBookmarks({ selectedFolderId: parentId });
    });
});

// 模态框：保存
document.getElementById('btn-save').addEventListener('click', () => {
    if (contextMenuTargetId && editTitleInput.value) {
        const updates = { title: editTitleInput.value };

        if (contextMenuTargetType === 'bookmark') {
            if (!editUrlInput.value) return; // URL required for bookmarks
            updates.url = editUrlInput.value;
        }

        chrome.bookmarks.update(contextMenuTargetId, updates, (updatedNode) => {
            editModal.classList.add('hidden');

            if (contextMenuTargetType === 'folder') {
                loadBookmarks(); // 文件夹改名刷新树
            } else {
                // 更新 UI
                const card = document.querySelector(`[data-bookmark-card][data-id="${contextMenuTargetId}"]`);
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

                    const cardLink = card.querySelector('[data-card-link]');
                    if (cardLink) {
                        cardLink.href = updatedNode.url;
                        cardLink.setAttribute('aria-label', `Open ${updatedNode.title || 'Untitled'}`);
                    }

                    const menuButton = card.querySelector('[data-card-menu-button]');
                    if (menuButton) {
                        menuButton.setAttribute('aria-label', `More actions for ${updatedNode.title || 'Untitled'}`);
                    }
                }
            }
        });
    }
});

// 显示菜单函数
function showContextMenu(x, y, id, type = 'bookmark', url = '') {
    contextMenuTargetId = id;
    contextMenuTargetType = type;
    contextMenuTargetUrl = type === 'bookmark' ? url : '';

    // Toggle buttons based on type
    const newFolderBtn = document.getElementById('ctx-new-folder');
    bookmarkContextButtons.forEach((button) => {
        button.classList.toggle('hidden', type !== 'bookmark');
    });

    if (type === 'folder') {
        newFolderBtn.classList.remove('hidden');
    } else {
        newFolderBtn.classList.add('hidden');
    }

    contextMenu.style.left = '0px';
    contextMenu.style.top = '0px';
    contextMenu.classList.remove('hidden');
    contextMenu.classList.add('opacity-0');
    contextMenu.classList.remove('opacity-100');

    const padding = 8;
    const menuRect = contextMenu.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - padding;
    const maxY = window.innerHeight - menuRect.height - padding;
    const safeX = Math.max(padding, Math.min(x, maxX));
    const safeY = Math.max(padding, Math.min(y, maxY));

    contextMenu.style.left = `${safeX}px`;
    contextMenu.style.top = `${safeY}px`;

    requestAnimationFrame(() => {
        contextMenu.classList.remove('opacity-0');
        contextMenu.classList.add('opacity-100');
    });
}

// 隐藏菜单函数
function hideContextMenu() {
    if (contextMenu && !contextMenu.classList.contains('hidden')) {
        contextMenu.classList.add('opacity-0');
        contextMenu.classList.remove('opacity-100');
        setTimeout(() => {
            contextMenu.classList.add('hidden');
        }, 100);
    }
}
