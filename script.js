// 全局变量存储书签数据
let allBookmarks = [];
let currentFolder = null;
let expandedFolders = new Set(); // Store IDs of expanded folders
let draggedFolderNode = null; // Store the currently dragged folder node
const LAST_SELECTED_FOLDER_KEY = 'lastSelectedFolderId';

// --- 搜索与 AI 运行时状态 ---
const IS_MAC_PLATFORM = /Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const AI_SHORTCUT_LABEL = IS_MAC_PLATFORM ? '⌘↵' : 'Ctrl+↵';
const SPARKLES_ICON_PATH = 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z';
const KBD_CLASS = 'inline-flex items-center px-1 py-px rounded border border-slate-200 bg-white text-[10px] font-sans font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400';
const RESULTS_GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 pb-10';
const AI_SEARCH_BTN_CONFIGURED_CLASSES = ['bg-indigo-50', 'text-indigo-600', 'hover:bg-indigo-100', 'dark:bg-indigo-900/40', 'dark:text-indigo-300', 'dark:hover:bg-indigo-900/70'];
const AI_SEARCH_BTN_UNCONFIGURED_CLASSES = ['bg-slate-200/70', 'text-slate-500', 'hover:bg-slate-200', 'hover:text-indigo-600', 'dark:bg-slate-700', 'dark:text-slate-300', 'dark:hover:bg-slate-600'];

let aiConfig = typeof BookmarkAi !== 'undefined' ? BookmarkAi.normalizeConfig(null) : { baseUrl: '', model: '', apiKeys: {}, verifiedFingerprint: '' };
let aiSearchAbortController = null;
let pendingAiQueryAfterConfig = '';
let lastAiSearchState = null; // { query, matches }
let searchView = { type: 'folder', query: '', count: 0 };

const aiSettingsUi = {
    modal: null,
    panel: null,
    form: null,
    baseUrlInput: null,
    apiKeyInput: null,
    modelInput: null,
    endpointPreview: null,
    ollamaHint: null,
    statusBox: null,
    toggleKeyBtn: null,
    testBtn: null,
    saveBtn: null,
    clearBtn: null
};
let aiSettingsDraft = null;
let aiSettingsReturnFocus = null;
let aiSettingsTestController = null;
let aiClearConfirmTimer = null;

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
    setupAiSettings();
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
            if (lastAiSearchState && lastAiSearchState.query === activeQuery) {
                renderAiSearchResults(lastAiSearchState);
            } else {
                renderSearchResults(activeQuery);
            }
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
    cancelActiveAiSearch();
    lastAiSearchState = null;
    searchView = { type: 'folder', query: '', count: 0 };

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
// options: { showPath, variant: 'default' | 'ai', aiReason, folderLabel, primary }
function renderSiteCard(node, container, options = {}) {
    const {
        showPath = false,
        variant = 'default',
        aiReason = '',
        folderLabel = '',
        primary = false
    } = options;
    const isAiCard = variant === 'ai';

    let hostname = '';
    try {
        const url = new URL(node.url);
        hostname = url.hostname.replace(/^www\./, '');
    } catch (e) {
        hostname = node.url;
    }

    const faviconUrl = getFaviconUrl(node.url);
    const displayTitle = node.title || 'Untitled';
    const safeTitle = escapeHtml(displayTitle);
    const safeHostname = escapeHtml(hostname);
    const safeUrl = escapeHtml(node.url);
    // 卡片内容层是 pointer-events-none，悬停提示需要挂在链接层上
    const linkTitle = escapeHtml(isAiCard && aiReason ? `${displayTitle}\n${aiReason}` : displayTitle);

    const card = document.createElement('div');
    card.dataset.id = node.id;
    card.dataset.bookmarkCard = 'true';
    if (primary) card.dataset.primaryResult = 'true';
    card.className = `
        bookmark-card group bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgb(0,0,0,0.04)]
        hover:shadow-[0_8px_24px_rgb(0,0,0,0.08)] hover:-translate-y-1 
        transition-all duration-300 flex flex-col relative ${isAiCard ? 'h-44' : 'h-32'} cursor-pointer
        dark:bg-slate-800 dark:shadow-none dark:hover:bg-slate-750 dark:hover:shadow-lg dark:hover:shadow-black/20
        ${primary ? 'ring-2 ring-indigo-500/30 dark:ring-indigo-400/40' : ''}
    `;
    card.className += " overflow-hidden";

    if (showPath && !isAiCard && node.parentId) {
        chrome.bookmarks.get(node.parentId, (parents) => {
            if (parents && parents.length > 0) {
                const parentTitle = parents[0].title;
                const badge = document.createElement('span');
                badge.className = 'absolute bottom-2 right-2 max-w-[45%] truncate text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600 pointer-events-none opacity-80 z-10';
                badge.textContent = parentTitle;
                card.appendChild(badge);
            }
        });
    }

    card.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, node.id, 'bookmark', node.url);
    });

    const folderHtml = isAiCard && folderLabel
        ? `<span class="flex-shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
           <span class="truncate text-slate-500 dark:text-slate-400" data-card-folder>${escapeHtml(folderLabel)}</span>`
        : '';

    const reasonHtml = isAiCard && aiReason
        ? `<p class="mt-2 pt-2 border-t border-slate-100 text-[11px] leading-4 text-indigo-600 line-clamp-2 dark:border-slate-700 dark:text-indigo-300" data-card-reason>${escapeHtml(aiReason)}</p>`
        : '';

    card.innerHTML = `
        <a href="${safeUrl}" draggable="false" data-card-link class="absolute inset-0 z-0" aria-label="Open ${safeTitle}" title="${linkTitle}"></a>
        <div class="relative z-10 flex items-start justify-between mb-3 pointer-events-none">
            <div class="w-10 h-10 rounded-xl bg-slate-50 p-0.5 flex items-center justify-center group-hover:scale-105 transition-transform dark:bg-slate-700/50 pointer-events-none">
                <img src="${faviconUrl}" class="w-8 h-8 object-contain rounded-lg" alt="icon">
            </div>
            <button type="button" data-card-menu-button aria-label="More actions for ${safeTitle}" aria-haspopup="menu" title="More actions" class="pointer-events-auto opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200 transform translate-x-2 group-hover:translate-x-0 focus:translate-x-0 text-slate-400 hover:text-indigo-500 p-1 rounded-lg hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:text-slate-500 dark:hover:text-indigo-400 dark:hover:bg-slate-700 dark:focus:bg-slate-700">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
            </button>
        </div>
        <div class="relative z-10 mt-auto pointer-events-none min-w-0">
            <h3 class="font-bold text-slate-700 text-sm mb-0.5 truncate dark:text-slate-200 group-hover:text-indigo-600 transition-colors" title="${safeTitle}">${safeTitle}</h3>
            <p class="flex items-center gap-1.5 min-w-0 text-xs text-slate-400 dark:text-slate-500">
                <span class="truncate font-mono opacity-80" data-card-host>${safeHostname}</span>${folderHtml}
            </p>
            ${reasonHtml}
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

// --- 搜索：关键字实时过滤 + AI 语义搜索 ---

function sparklesIcon(className) {
    return `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${SPARKLES_ICON_PATH}"></path></svg>`;
}

function isAiConfigured() {
    return BookmarkAi.isConfigured(aiConfig);
}

function getSearchInputValue() {
    const searchInput = document.getElementById('search-input');
    return searchInput ? searchInput.value.trim() : '';
}

function getBookmarkTree() {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getTree((nodes) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(nodes);
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const aiSearchBtn = document.getElementById('ai-search-btn');
    const aiSettingsBtn = document.getElementById('ai-settings-btn');

    searchInput.placeholder = `Search bookmarks · ${AI_SHORTCUT_LABEL} ask AI`;

    searchInput.addEventListener('input', (e) => {
        cancelActiveAiSearch();
        lastAiSearchState = null;

        const query = e.target.value.trim();
        if (!query) {
            if (currentFolder) renderBookmarkSites(currentFolder);
            return;
        }

        renderSearchResults(query);
    });

    searchInput.addEventListener('keydown', (e) => {
        // 输入法组字期间（中文 / 日文候选确认）不处理 Enter / Escape
        if (e.isComposing || e.keyCode === 229) return;

        if (e.key === 'Escape') {
            const query = searchInput.value.trim();
            if (aiSearchAbortController) {
                e.preventDefault();
                cancelActiveAiSearch();
                renderSearchResults(query);
            } else if (searchInput.value) {
                e.preventDefault();
                searchInput.value = '';
                lastAiSearchState = null;
                if (currentFolder) renderBookmarkSites(currentFolder);
            }
            return;
        }

        if (e.key !== 'Enter') return;
        e.preventDefault();

        const query = searchInput.value.trim();
        if (!query) return;

        if (e.metaKey || e.ctrlKey) {
            triggerAiSearch(query);
            return;
        }
        handleSearchEnter(query);
    });

    if (aiSearchBtn) {
        aiSearchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (!query) {
                searchInput.focus();
                showToast('Describe the bookmark you are looking for, then ask AI');
                return;
            }
            triggerAiSearch(query);
        });
    }

    if (aiSettingsBtn) {
        aiSettingsBtn.addEventListener('click', () => {
            pendingAiQueryAfterConfig = '';
            openAiSettingsModal({ returnFocus: aiSettingsBtn });
        });
    }
}

// Enter：有结果时打开第一个；关键字无结果且已配置 AI 时才发起 AI 搜索
function handleSearchEnter(query) {
    if (searchView.query === query) {
        if (searchView.type === 'ai-loading') return;
        if (searchView.type === 'keyword' || searchView.type === 'ai') {
            if (searchView.count > 0) {
                openPrimaryResult();
            } else if (searchView.type === 'keyword' && isAiConfigured()) {
                runAiSearch(query);
            }
            return;
        }
    }

    // 当前查询的结果尚未渲染，渲染后再处理
    renderSearchResults(query, () => handleSearchEnter(query));
}

function openPrimaryResult() {
    const link = document.querySelector('#bookmark-sites [data-primary-result] [data-card-link]');
    if (link) link.click();
}

function renderSearchResults(query, onRendered) {
    chrome.bookmarks.search(query, (results) => {
        // 忽略过期的回调，避免旧结果覆盖新输入
        if (getSearchInputValue() !== query) return;

        const bookmarkResults = (results || []).filter(node => Boolean(node.url));
        const sitesContainer = document.getElementById('bookmark-sites');
        const breadcrumbsContainer = document.getElementById('breadcrumbs');
        const safeQuery = escapeHtml(query);
        sitesContainer.innerHTML = '';
        searchView = { type: 'keyword', query, count: bookmarkResults.length };

        if (breadcrumbsContainer) {
            const openHint = bookmarkResults.length > 0
                ? `<span class="hidden md:inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500"><kbd class="${KBD_CLASS}">↵</kbd> open first</span>`
                : '';
            breadcrumbsContainer.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <span class="truncate text-slate-500 dark:text-slate-400">Search Results: "${safeQuery}" (${bookmarkResults.length})</span>
                    ${openHint}
                    <button type="button" id="breadcrumbs-ai-btn"
                        class="inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 dark:text-indigo-300 dark:hover:bg-indigo-900/40">
                        ${sparklesIcon('w-3.5 h-3.5')}
                        Ask AI
                        <kbd class="${KBD_CLASS}">${AI_SHORTCUT_LABEL}</kbd>
                    </button>
                </div>
            `;
            breadcrumbsContainer.querySelector('#breadcrumbs-ai-btn')
                .addEventListener('click', () => triggerAiSearch(query));
        }

        if (bookmarkResults.length === 0) {
            renderKeywordEmptyState(sitesContainer, query);
        } else {
            const sitesGrid = document.createElement('div');
            sitesGrid.className = RESULTS_GRID_CLASS;
            bookmarkResults.forEach((node, index) => {
                renderSiteCard(node, sitesGrid, { showPath: true, primary: index === 0 });
            });
            sitesContainer.appendChild(sitesGrid);
        }

        if (typeof onRendered === 'function') onRendered();
    });
}

function renderKeywordEmptyState(sitesContainer, query) {
    const safeQuery = escapeHtml(query);
    const configured = isAiConfigured();
    const description = configured
        ? 'Can\'t remember the exact name? Describe what the site does and let AI find it.'
        : 'Can\'t remember the exact name? Connect an AI provider and search by description.';
    const ctaLabel = configured ? 'Ask AI' : 'Set up AI search';
    const ctaHint = configured
        ? `<p class="mt-3 text-xs text-slate-400 dark:text-slate-500">or press <kbd class="${KBD_CLASS}">↵</kbd></p>`
        : '';

    sitesContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-96 text-center px-4">
            <div class="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4 dark:bg-slate-800 dark:text-slate-500">
                <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
            </div>
            <p class="text-slate-600 font-medium mb-1 dark:text-slate-300">No bookmarks match "${safeQuery}"</p>
            <p class="text-xs text-slate-400 mb-5 max-w-md dark:text-slate-500">${description}</p>
            <button type="button" id="empty-state-ai-btn"
                class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-sm hover:bg-indigo-500 transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
                ${sparklesIcon('w-4 h-4')}
                <span>${ctaLabel}</span>
            </button>
            ${ctaHint}
        </div>
    `;
    sitesContainer.querySelector('#empty-state-ai-btn')
        .addEventListener('click', () => triggerAiSearch(query));
}

function cancelActiveAiSearch() {
    if (aiSearchAbortController) {
        const controller = aiSearchAbortController;
        aiSearchAbortController = null;
        controller.abort();
    }
}

function triggerAiSearch(query) {
    if (!isAiConfigured()) {
        pendingAiQueryAfterConfig = query;
        openAiSettingsModal({ notice: 'Connect an AI provider to search your bookmarks by description.' });
        return;
    }
    runAiSearch(query);
}

async function runAiSearch(query) {
    cancelActiveAiSearch();

    const controller = new AbortController();
    aiSearchAbortController = controller;
    const isCurrent = () => aiSearchAbortController === controller && !controller.signal.aborted;
    const config = aiConfig;

    searchView = { type: 'ai-loading', query, count: 0 };
    renderAiLoading(query);

    try {
        // 每次搜索前读取最新书签树，避免使用编辑前的快照
        const tree = await getBookmarkTree();
        if (!isCurrent()) return;
        allBookmarks = tree;

        const result = await BookmarkAi.search({
            query,
            rootNode: tree[0],
            config,
            signal: controller.signal,
            onStage: (stage, info) => {
                if (isCurrent()) updateAiLoadingStage(query, stage, info);
            }
        });
        if (!isCurrent()) return;

        aiSearchAbortController = null;
        lastAiSearchState = {
            query,
            matches: result.matches
        };
        renderAiSearchResults(lastAiSearchState);
    } catch (error) {
        // 已被取消或被新的搜索取代：不要覆盖当前界面
        if (!isCurrent()) return;
        aiSearchAbortController = null;
        if (BookmarkAi.isAbortError(error)) return;

        console.warn('AI search failed:', error);
        renderAiError(query, error, config);
    }
}

function renderAiLoading(query) {
    const sitesContainer = document.getElementById('bookmark-sites');
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    const safeQuery = escapeHtml(query);

    if (breadcrumbsContainer) {
        breadcrumbsContainer.innerHTML = `
            <span class="inline-flex items-center gap-1.5 truncate text-indigo-600 font-medium dark:text-indigo-400">
                ${sparklesIcon('w-4 h-4 flex-shrink-0')}
                AI search: "${safeQuery}"
            </span>
        `;
    }

    sitesContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-96 text-center px-4" aria-busy="true">
            <div class="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 dark:bg-indigo-900/40 dark:text-indigo-400">
                <svg class="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
            </div>
            <p id="ai-loading-stage" class="text-slate-700 font-medium mb-1 dark:text-slate-200" role="status" aria-live="polite">AI is analyzing your bookmarks…</p>
            <p class="text-xs text-slate-400 mb-5 max-w-md dark:text-slate-500">Matching titles, folder categories, and domain knowledge for "${safeQuery}"</p>
            <button type="button" id="cancel-ai-search-btn" class="modal-button-secondary text-xs py-1.5">Cancel <span class="ml-1.5 text-slate-400">Esc</span></button>
        </div>
    `;

    sitesContainer.querySelector('#cancel-ai-search-btn').addEventListener('click', () => {
        cancelActiveAiSearch();
        renderSearchResults(query);
    });
}

function updateAiLoadingStage(query, stage, info = {}) {
    const stageEl = document.getElementById('ai-loading-stage');
    if (!stageEl) return;

    if (stage === 'analyzing') {
        stageEl.textContent = `AI is analyzing your ${info.catalogSize} bookmarks…`;
    } else if (stage === 'expanding') {
        stageEl.textContent = `Pre-filtering ${info.catalogSize} bookmarks…`;
    } else if (stage === 'ranking') {
        stageEl.textContent = `AI is ranking ${info.candidateCount} candidate bookmarks…`;
    }
}

function renderAiResultsHeader(state, count) {
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    if (!breadcrumbsContainer) return;

    breadcrumbsContainer.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
            <span class="inline-flex items-center gap-1.5 truncate text-indigo-600 font-medium dark:text-indigo-400">
                ${sparklesIcon('w-4 h-4 flex-shrink-0')}
                AI results for "${escapeHtml(state.query)}" (${count})
            </span>
            <button type="button" data-ai-action="keyword"
                class="flex-shrink-0 text-xs text-slate-400 hover:text-indigo-600 transition-colors dark:hover:text-indigo-400">
                Keyword results
            </button>
            <button type="button" data-ai-action="settings"
                class="flex-shrink-0 text-xs text-slate-400 hover:text-indigo-600 transition-colors dark:hover:text-indigo-400">
                AI settings
            </button>
        </div>
    `;
    bindAiActions(breadcrumbsContainer, state.query);
}

function bindAiActions(container, query) {
    container.querySelectorAll('[data-ai-action]').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.aiAction;
            if (action === 'keyword') {
                cancelActiveAiSearch();
                lastAiSearchState = null;
                renderSearchResults(query);
            } else if (action === 'settings') {
                pendingAiQueryAfterConfig = searchView.type === 'ai-error' ? query : '';
                openAiSettingsModal({ returnFocus: button });
            } else if (action === 'retry') {
                runAiSearch(query);
            }
        });
    });
}

function renderAiSearchResults(state) {
    const sitesContainer = document.getElementById('bookmark-sites');
    sitesContainer.innerHTML = '';

    const rootNode = allBookmarks && allBookmarks.length > 0 ? allBookmarks[0] : null;
    const matches = state.matches || [];
    const resolvedItems = [];
    const seenIds = new Set();

    matches.forEach(match => {
        if (seenIds.has(match.id)) return;
        const node = findNodeById(rootNode, match.id);
        if (node && node.url) {
            seenIds.add(match.id);
            const parent = node.parentId ? findNodeById(rootNode, node.parentId) : null;
            resolvedItems.push({ node, reason: match.reason, folderLabel: parent ? parent.title : '' });
        }
    });

    searchView = { type: 'ai', query: state.query, count: resolvedItems.length };
    renderAiResultsHeader(state, resolvedItems.length);

    if (resolvedItems.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'flex flex-col items-center justify-center h-80 text-center px-4';
        emptyState.innerHTML = `
            <p class="text-slate-600 font-medium mb-1 dark:text-slate-300">No bookmarks matched "${escapeHtml(state.query)}"</p>
            <p class="text-xs text-slate-400 mb-5 max-w-md dark:text-slate-500">Try describing the site with different keywords or topic clues.</p>
            <button type="button" data-ai-action="keyword" class="modal-button-secondary">Keyword results</button>
        `;
        sitesContainer.appendChild(emptyState);
        bindAiActions(emptyState, state.query);
        return;
    }

    const sitesGrid = document.createElement('div');
    sitesGrid.className = RESULTS_GRID_CLASS;
    resolvedItems.forEach(({ node, reason, folderLabel }, index) => {
        renderSiteCard(node, sitesGrid, {
            variant: 'ai',
            aiReason: reason,
            folderLabel,
            primary: index === 0
        });
    });
    sitesContainer.appendChild(sitesGrid);
}

function renderAiError(query, error, config) {
    const sitesContainer = document.getElementById('bookmark-sites');
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    const info = BookmarkAi.describeAiError(error, config.baseUrl);
    searchView = { type: 'ai-error', query, count: 0 };

    if (breadcrumbsContainer) {
        breadcrumbsContainer.innerHTML = '<span class="text-red-500 dark:text-red-400">AI search failed</span>';
    }

    const detailHtml = info.detail
        ? `<p class="mb-5 max-w-md break-all font-mono text-[11px] text-slate-400 dark:text-slate-500">${escapeHtml(info.detail)}</p>`
        : '<div class="mb-5"></div>';

    sitesContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center h-96 text-center px-4" role="alert">
            <div class="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-3 dark:bg-red-900/30 dark:text-red-400">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
            </div>
            <p class="text-slate-700 font-semibold mb-1 dark:text-slate-200">${escapeHtml(info.title)}</p>
            <p class="text-sm text-slate-500 mb-2 max-w-md dark:text-slate-400">${escapeHtml(info.hint)}</p>
            ${detailHtml}
            <div class="flex items-center gap-3">
                <button type="button" data-ai-action="retry" class="modal-button-primary">Retry</button>
                <button type="button" data-ai-action="settings" class="modal-button-secondary">AI settings</button>
                <button type="button" data-ai-action="keyword" class="modal-button-secondary">Keyword results</button>
            </div>
        </div>
    `;
    bindAiActions(sitesContainer, query);
}

// --- AI 设置弹窗 ---

function updateAiEntryState() {
    const aiSearchBtn = document.getElementById('ai-search-btn');
    if (!aiSearchBtn) return;

    const configured = isAiConfigured();
    AI_SEARCH_BTN_CONFIGURED_CLASSES.forEach(cls => aiSearchBtn.classList.toggle(cls, configured));
    AI_SEARCH_BTN_UNCONFIGURED_CLASSES.forEach(cls => aiSearchBtn.classList.toggle(cls, !configured));

    const label = configured ? `Ask AI (${AI_SHORTCUT_LABEL})` : 'Set up AI search';
    aiSearchBtn.title = label;
    aiSearchBtn.setAttribute('aria-label', label);
}

function showAiSettingsStatus(message, type = 'info') {
    const statusBox = aiSettingsUi.statusBox;
    if (!statusBox) return;

    if (!message) {
        statusBox.classList.add('hidden');
        statusBox.textContent = '';
        return;
    }

    const styles = {
        error: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50',
        warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/50',
        success: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50',
        info: 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800/50'
    };
    statusBox.className = `rounded-lg border px-3 py-2 text-xs leading-5 break-words ${styles[type] || styles.info}`;
    statusBox.textContent = message;
}

function readAiSettingsForm() {
    return {
        baseUrl: aiSettingsUi.baseUrlInput.value.trim(),
        apiKey: aiSettingsUi.apiKeyInput.value.trim(),
        model: aiSettingsUi.modelInput.value.trim()
    };
}

function validateAiSettingsForm(values) {
    if (!values.baseUrl || !BookmarkAi.normalizeChatCompletionsUrl(values.baseUrl)) {
        showAiSettingsStatus('Enter a valid http(s) API Base URL.', 'error');
        aiSettingsUi.baseUrlInput.focus();
        return false;
    }
    if (!values.model) {
        showAiSettingsStatus('Enter a model name.', 'error');
        aiSettingsUi.modelInput.focus();
        return false;
    }
    return true;
}

function updateAiEndpointPreview() {
    const baseUrl = aiSettingsUi.baseUrlInput.value.trim();
    const endpoint = BookmarkAi.normalizeChatCompletionsUrl(baseUrl);
    aiSettingsUi.endpointPreview.textContent = endpoint || '—';
    aiSettingsUi.endpointPreview.title = endpoint;
    aiSettingsUi.ollamaHint.classList.toggle('hidden', !BookmarkAi.isLikelyOllama(baseUrl));

    const currentEndpoint = endpoint.toLowerCase();
    aiSettingsUi.modal.querySelectorAll('[data-ai-preset]').forEach(button => {
        const preset = BookmarkAi.PRESETS[button.dataset.aiPreset];
        const presetEndpoint = preset ? BookmarkAi.normalizeChatCompletionsUrl(preset.baseUrl).toLowerCase() : '';
        button.setAttribute('aria-pressed', String(Boolean(currentEndpoint) && presetEndpoint === currentEndpoint));
    });
}

// 服务商（origin）变化时切换到该服务商自己的 Key，绝不把旧 Key 发给新服务商
function syncApiKeyWithOrigin() {
    if (!aiSettingsDraft) return;
    const origin = BookmarkAi.getEndpointOrigin(aiSettingsUi.baseUrlInput.value);
    if (origin === aiSettingsDraft.keyOrigin) return;

    aiSettingsDraft.keyOrigin = origin;
    aiSettingsUi.apiKeyInput.value = (origin && aiSettingsDraft.apiKeys[origin]) || '';
    setApiKeyVisibility(false);
}

function setApiKeyVisibility(visible) {
    aiSettingsUi.apiKeyInput.type = visible ? 'text' : 'password';
    aiSettingsUi.toggleKeyBtn.setAttribute('aria-pressed', String(visible));
    aiSettingsUi.toggleKeyBtn.setAttribute('aria-label', visible ? 'Hide API key' : 'Show API key');
    aiSettingsUi.toggleKeyBtn.title = visible ? 'Hide API key' : 'Show API key';
    aiSettingsUi.toggleKeyBtn.querySelector('[data-eye-open]').classList.toggle('hidden', visible);
    aiSettingsUi.toggleKeyBtn.querySelector('[data-eye-closed]').classList.toggle('hidden', !visible);
}

function resetAiClearButton() {
    clearTimeout(aiClearConfirmTimer);
    aiClearConfirmTimer = null;
    if (!aiSettingsUi.clearBtn) return;
    aiSettingsUi.clearBtn.dataset.confirming = 'false';
    aiSettingsUi.clearBtn.textContent = 'Clear';
}

function openAiSettingsModal({ notice = '', returnFocus = null } = {}) {
    const ui = aiSettingsUi;
    if (!ui.modal) return;

    aiSettingsReturnFocus = returnFocus || document.activeElement;
    aiSettingsDraft = {
        apiKeys: { ...aiConfig.apiKeys },
        keyOrigin: BookmarkAi.getEndpointOrigin(aiConfig.baseUrl),
        testedFingerprint: aiConfig.verifiedFingerprint
    };

    ui.baseUrlInput.value = aiConfig.baseUrl;
    ui.apiKeyInput.value = BookmarkAi.getApiKey(aiConfig);
    ui.modelInput.value = aiConfig.model;
    setApiKeyVisibility(false);
    updateAiEndpointPreview();
    resetAiClearButton();
    setAiSettingsPending(false);

    if (notice) {
        showAiSettingsStatus(notice, 'info');
    } else if (isAiConfigured()) {
        const verified = aiConfig.verifiedFingerprint
            && aiConfig.verifiedFingerprint === BookmarkAi.fingerprint(aiConfig.baseUrl, aiConfig.model, BookmarkAi.getApiKey(aiConfig));
        showAiSettingsStatus(
            verified ? 'Connection verified.' : 'Saved, but the connection has not been tested yet.',
            verified ? 'success' : 'warning'
        );
    } else {
        showAiSettingsStatus('');
    }

    ui.modal.classList.remove('hidden');

    setTimeout(() => {
        if (!ui.baseUrlInput.value) {
            ui.baseUrlInput.focus();
        } else if (!ui.apiKeyInput.value && !BookmarkAi.isLocalEndpoint(ui.baseUrlInput.value)) {
            ui.apiKeyInput.focus();
        } else {
            ui.modelInput.focus();
        }
    }, 50);
}

function closeAiSettingsModal() {
    const ui = aiSettingsUi;
    if (!ui.modal || ui.modal.classList.contains('hidden')) return;

    if (aiSettingsTestController) {
        aiSettingsTestController.abort();
        aiSettingsTestController = null;
    }
    ui.modal.classList.add('hidden');
    showAiSettingsStatus('');
    resetAiClearButton();
    ui.apiKeyInput.value = '';
    aiSettingsDraft = null;
    pendingAiQueryAfterConfig = '';

    const returnFocus = aiSettingsReturnFocus;
    aiSettingsReturnFocus = null;
    if (returnFocus && document.contains(returnFocus) && typeof returnFocus.focus === 'function') {
        returnFocus.focus();
    }
}

function isAiSettingsModalOpen() {
    return Boolean(aiSettingsUi.modal) && !aiSettingsUi.modal.classList.contains('hidden');
}

function setAiSettingsPending(isPending, label = '') {
    const { testBtn, saveBtn } = aiSettingsUi;
    testBtn.disabled = isPending;
    saveBtn.disabled = isPending;
    testBtn.textContent = isPending && label === 'test' ? 'Testing…' : 'Test connection';
    saveBtn.textContent = isPending && label === 'save' ? 'Saving…' : 'Save';
    [testBtn, saveBtn].forEach(button => {
        button.classList.toggle('opacity-75', isPending);
        button.classList.toggle('cursor-not-allowed', isPending);
    });
}

// 必须在用户手势（click / submit）中同步调用，Chrome 才会弹出授权
function requestHostPermission(baseUrl) {
    const pattern = BookmarkAi.getHostPermissionPattern(baseUrl);
    if (!pattern) return Promise.resolve(false);
    if (!chrome.permissions || !chrome.permissions.request) return Promise.resolve(true);

    return chrome.permissions.request({ origins: [pattern] }).catch((error) => {
        console.warn('Host permission request failed:', error);
        return false;
    });
}

async function runAiConnectionTest(values, permissionRequest) {
    setAiSettingsPending(true, 'test');
    showAiSettingsStatus(`Connecting to ${BookmarkAi.normalizeChatCompletionsUrl(values.baseUrl)}…`, 'info');

    const controller = new AbortController();
    aiSettingsTestController = controller;

    try {
        const granted = await permissionRequest;
        if (!granted) {
            throw new BookmarkAi.AiRequestError('Host permission denied', { kind: 'permission' });
        }

        await BookmarkAi.testConnection({ ...values, signal: controller.signal });
        if (controller.signal.aborted || !aiSettingsDraft) return;

        aiSettingsDraft.testedFingerprint = BookmarkAi.fingerprint(values.baseUrl, values.model, values.apiKey);
        showAiSettingsStatus('Connected. AI search is ready — remember to save.', 'success');
    } catch (error) {
        if (controller.signal.aborted || BookmarkAi.isAbortError(error)) return;
        const info = BookmarkAi.describeAiError(error, values.baseUrl);
        showAiSettingsStatus(`${info.title}. ${info.hint}${info.detail ? ` (${info.detail})` : ''}`, 'error');
    } finally {
        if (aiSettingsTestController === controller) {
            aiSettingsTestController = null;
            setAiSettingsPending(false);
        }
    }
}

async function saveAiSettings(values, permissionRequest) {
    setAiSettingsPending(true, 'save');

    try {
        const granted = await permissionRequest;
        if (!aiSettingsDraft) return;

        const origin = BookmarkAi.getEndpointOrigin(values.baseUrl);
        const apiKeys = { ...aiSettingsDraft.apiKeys };
        if (values.apiKey) {
            apiKeys[origin] = values.apiKey;
        } else {
            delete apiKeys[origin];
        }

        const currentFingerprint = BookmarkAi.fingerprint(values.baseUrl, values.model, values.apiKey);
        aiConfig = await BookmarkAi.saveConfig({
            baseUrl: values.baseUrl,
            model: values.model,
            apiKeys,
            verifiedFingerprint: aiSettingsDraft.testedFingerprint === currentFingerprint ? currentFingerprint : ''
        });
        aiSettingsDraft.apiKeys = apiKeys;
        aiSettingsDraft.keyOrigin = origin;
        updateAiEntryState();

        if (!granted) {
            showAiSettingsStatus(`Saved, but Chrome access to ${new URL(values.baseUrl).hostname} was not granted. AI search can't reach it until you allow access — click Save again to retry.`, 'warning');
            return;
        }

        const queryToRun = pendingAiQueryAfterConfig;
        closeAiSettingsModal();
        showToast('AI search settings saved');

        if (queryToRun && queryToRun === getSearchInputValue()) {
            runAiSearch(queryToRun);
        } else if (lastAiSearchState) {
            lastAiSearchState = null;
        }
    } catch (error) {
        console.error('Failed to save AI settings:', error);
        showAiSettingsStatus(`Failed to save settings: ${error.message || error}`, 'error');
    } finally {
        if (aiSettingsUi.saveBtn) setAiSettingsPending(false);
    }
}

async function clearAiSettings() {
    try {
        aiConfig = await BookmarkAi.clearConfig();

        // 同时撤销之前为 AI 服务申请的主机权限
        if (chrome.permissions && chrome.permissions.getAll) {
            const granted = await chrome.permissions.getAll();
            const origins = (granted.origins || []).filter(origin => origin !== 'chrome://favicon/*');
            if (origins.length > 0) {
                await chrome.permissions.remove({ origins }).catch(error => {
                    console.warn('Failed to revoke host permissions:', error);
                });
            }
        }

        lastAiSearchState = null;
        aiSettingsDraft = { apiKeys: {}, keyOrigin: '', testedFingerprint: '' };
        aiSettingsUi.baseUrlInput.value = '';
        aiSettingsUi.apiKeyInput.value = '';
        aiSettingsUi.modelInput.value = '';
        updateAiEndpointPreview();
        updateAiEntryState();
        showAiSettingsStatus('AI settings and all saved API keys were removed.', 'success');
    } catch (error) {
        console.error('Failed to clear AI settings:', error);
        showAiSettingsStatus(`Failed to clear settings: ${error.message || error}`, 'error');
    }
}

function trapFocusInPanel(e, panel) {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(panel.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(el => el.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

function setupAiSettings() {
    const ui = aiSettingsUi;
    ui.modal = document.getElementById('ai-settings-modal');
    if (!ui.modal) return;

    ui.panel = ui.modal.querySelector('[data-ai-settings-panel]');
    ui.form = document.getElementById('ai-settings-form');
    ui.baseUrlInput = document.getElementById('ai-base-url');
    ui.apiKeyInput = document.getElementById('ai-api-key');
    ui.modelInput = document.getElementById('ai-model-name');
    ui.endpointPreview = document.getElementById('ai-endpoint-preview');
    ui.ollamaHint = document.getElementById('ai-ollama-hint');
    ui.statusBox = document.getElementById('ai-settings-status');
    ui.toggleKeyBtn = document.getElementById('toggle-api-key-visibility');
    ui.testBtn = document.getElementById('btn-ai-test');
    ui.saveBtn = document.getElementById('btn-ai-save');
    ui.clearBtn = document.getElementById('btn-ai-clear');
    const cancelBtn = document.getElementById('btn-ai-cancel');

    updateAiEntryState();
    BookmarkAi.loadConfig()
        .then((config) => {
            aiConfig = config;
            updateAiEntryState();
        })
        .catch(error => console.error('Failed to load AI settings:', error));

    // 其他新标签页修改设置后保持同步
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes.aiSearchConfig) return;
            aiConfig = BookmarkAi.normalizeConfig(changes.aiSearchConfig.newValue);
            updateAiEntryState();
        });
    }

    ui.modal.querySelectorAll('[data-ai-preset]').forEach(button => {
        button.addEventListener('click', () => {
            const preset = BookmarkAi.PRESETS[button.dataset.aiPreset];
            if (!preset) return;

            ui.baseUrlInput.value = preset.baseUrl;
            ui.modelInput.value = preset.model;
            syncApiKeyWithOrigin();
            updateAiEndpointPreview();

            if (BookmarkAi.isLocalEndpoint(preset.baseUrl)) {
                showAiSettingsStatus(`${preset.label} preset filled. Make sure the model is pulled and running, then test the connection.`, 'info');
                ui.modelInput.focus();
            } else {
                showAiSettingsStatus(
                    ui.apiKeyInput.value
                        ? `${preset.label} preset filled with your saved key. Test the connection to confirm.`
                        : `${preset.label} preset filled. Paste your API key, then test the connection.`,
                    'info'
                );
                ui.apiKeyInput.focus();
            }
        });
    });

    ui.baseUrlInput.addEventListener('input', updateAiEndpointPreview);
    ui.baseUrlInput.addEventListener('change', () => {
        syncApiKeyWithOrigin();
        updateAiEndpointPreview();
    });

    ui.toggleKeyBtn.addEventListener('click', () => {
        setApiKeyVisibility(ui.apiKeyInput.type === 'password');
    });

    ui.testBtn.addEventListener('click', () => {
        syncApiKeyWithOrigin();
        const values = readAiSettingsForm();
        if (!validateAiSettingsForm(values)) return;
        runAiConnectionTest(values, requestHostPermission(values.baseUrl));
    });

    ui.form.addEventListener('submit', (e) => {
        e.preventDefault();
        syncApiKeyWithOrigin();
        const values = readAiSettingsForm();
        if (!validateAiSettingsForm(values)) return;
        saveAiSettings(values, requestHostPermission(values.baseUrl));
    });

    ui.clearBtn.addEventListener('click', () => {
        if (ui.clearBtn.dataset.confirming === 'true') {
            resetAiClearButton();
            clearAiSettings();
            return;
        }
        ui.clearBtn.dataset.confirming = 'true';
        ui.clearBtn.textContent = 'Click again to clear';
        showAiSettingsStatus('This removes the saved URL, model and API keys for every provider.', 'warning');
        aiClearConfirmTimer = setTimeout(resetAiClearButton, 4000);
    });

    cancelBtn.addEventListener('click', closeAiSettingsModal);

    ui.modal.addEventListener('click', (e) => {
        if (ui.panel && !ui.panel.contains(e.target)) {
            closeAiSettingsModal();
        }
    });

    ui.modal.addEventListener('keydown', (e) => trapFocusInPanel(e, ui.panel));
}

// 书签编辑后同步内存中的书签树，保证后续搜索使用最新数据
function syncCachedBookmarkNode(updatedNode) {
    if (!updatedNode || !allBookmarks || allBookmarks.length === 0) return;
    const cachedNode = findNodeById(allBookmarks[0], updatedNode.id);
    if (!cachedNode) return;

    cachedNode.title = updatedNode.title;
    if (typeof updatedNode.url === 'string') {
        cachedNode.url = updatedNode.url;
    }
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
    if (e.key === 'Escape' && isAiSettingsModalOpen()) {
        closeAiSettingsModal();
        return;
    }

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
            if (showBookmarkError(`save the ${contextMenuTargetType}`) || !updatedNode) return;
            editModal.classList.add('hidden');

            // 同步内存中的书签树，避免后续 AI 搜索使用旧标题 / 旧 URL
            syncCachedBookmarkNode(updatedNode);

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
                    const hostEl = card.querySelector('[data-card-host]') || card.querySelector('p');
                    hostEl.textContent = newHostname;

                    const newIconUrl = getFaviconUrl(updatedNode.url);
                    card.querySelector('img').src = newIconUrl;

                    const cardLink = card.querySelector('[data-card-link]');
                    if (cardLink) {
                        cardLink.href = updatedNode.url;
                        cardLink.setAttribute('aria-label', `Open ${updatedNode.title || 'Untitled'}`);
                        const reasonEl = card.querySelector('[data-card-reason]');
                        cardLink.title = reasonEl
                            ? `${updatedNode.title || 'Untitled'}\n${reasonEl.textContent}`
                            : (updatedNode.title || 'Untitled');
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
