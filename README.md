# 书签导航扩展 (Bookmark Navigation Extension)

一个功能丰富、交互现代化的 Chrome 浏览器扩展，旨在将默认的“新标签页”替换为优雅的书签管理仪表板。它采用左侧目录树和右侧卡片网格的布局，提供流畅的拖拽排序、文件夹管理和搜索功能。

![Preview](./icon.png) <!-- 这是一个占位符，实际项目中可以使用截图 -->

## 🌟 功能特性 (Features)

### 1. 现代化 UI/UX 设计
*   **卡片式布局**：右侧以精美的卡片形式展示书签，支持网站 Favicon 自动提取。
*   **响应式网格**：自适应不同屏幕宽度的网格系统。
*   **流畅动画**：所有交互（悬停、点击、拖拽）均带有平滑的过渡动画。
*   **深色模式支持**：基于系统设置自动适配深色/浅色主题。

### 2. 强大的侧边栏管理
*   **可折叠目录树**：支持无限层级的文件夹折叠/展开，点击文件夹名称或箭头均可操作。
*   **状态记忆**：自动记住文件夹的展开/折叠状态，刷新页面不丢失工作流。
*   **右键管理菜单**：
    *   **新建子文件夹**：在侧边栏直接创建新分类。
    *   **重命名**：快速修改文件夹名称。
    *   **删除**：安全删除文件夹及其内容（含二次确认）。
*   **拖拽归档**：将右侧书签拖拽至左侧文件夹，支持 **高亮视觉反馈**（Indigo Ring），轻松归档。

### 3. 直观的书签排序
*   **网格拖拽排序**：支持在右侧网格中自由拖拽书签调整顺序。
*   **精准插入指示**：拖拽时显示 **蓝色竖线** 指示器，明确指示书签将插入到目标的前方还是后方，彻底告别页面抖动。
*   **拖拽样式优化**：拖拽时卡片半透明并缩小，提升操作质感。

### 4. 便捷的搜索与导航
*   **实时搜索**：顶部搜索框支持实时过滤，结果页显示每个书签的 **父级文件夹路径**，防止上下文丢失。
*   **面包屑导航**：顶部显示当前路径，支持点击跳转至任意上级目录。
*   **Google 搜索栏**：集成了 Google 搜索框，保留新标签页的搜索习惯。

### 5. 安全与容错
*   **原生确认机制**：删除书签或文件夹时弹出浏览器原生确认框，防止误操作。
*   **空状态引导**：空文件夹显示友好的引导提示和“如何添加书签”按钮（CSP 安全兼容）。

## 🛠 技术栈 (Tech Stack)

*   **前端框架**：原生 JavaScript (Vanilla JS)，无庞大框架依赖，追求极致性能。
*   **样式库**：[Tailwind CSS](https://tailwindcss.com/) (Utility-first CSS framework)。
*   **API**：Chrome Extension APIs (`chrome.bookmarks`, `chrome.runtime`)。
*   **构建工具**：Tailwind CLI (用于生成优化后的 CSS)。
*   **规范**：Manifest V3。

## 🚀 安装与使用 (Installation & Usage)

### 开发环境运行
1.  克隆本项目：
    ```bash
    git clone <repository-url>
    cd bookmarkNav
    ```
2.  安装依赖（仅用于 Tailwind CSS 构建）：
    ```bash
    npm install
    ```
3.  启动 Tailwind 监听模式（实时编译 CSS）：
    ```bash
    npm run dev
    ```

### 加载到 Chrome 浏览器
1.  打开 Chrome 浏览器，访问 `chrome://extensions/`。
2.  在右上角开启 **开发者模式 (Developer mode)**。
3.  点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
4.  选择本项目所在的根目录。
5.  打开一个新的标签页，即可体验。

## 📂 项目结构 (Project Structure)

```
bookmarkNav/
├── manifest.json        # 扩展核心配置文件 (Manifest V3)
├── newtab.html          # 新标签页入口 HTML
├── script.js            # 核心逻辑 (渲染、交互、拖拽、API调用)
├── style.css            # Tailwind 生成的最终 CSS
├── src/
│   └── input.css        # Tailwind 输入 CSS (含自定义指令)
├── tailwind.config.js   # Tailwind 配置文件
├── package.json         # npm 依赖配置
├── icon.png             # 扩展图标
└── README.md            # 项目说明文档
```

## 📝 交互指南

*   **左键点击**：打开书签（新标签页）；展开/折叠文件夹。
*   **右键点击**：
    *   **书签卡片**：编辑、删除。
    *   **侧边栏文件夹**：新建子文件夹、重命名、删除。
*   **拖拽**：
    *   **网格内**：调整书签顺序。
    *   **网格 -> 侧边栏**：将书签移动到指定文件夹。

## 🔒 安全性说明

本项目严格遵守 Chrome Manifest V3 的 Content Security Policy (CSP)：
*   不包含任何 `unsafe-inline` 脚本。
*   所有的事件监听器（如点击、拖拽）均在 JavaScript 文件中动态绑定。

---
Enjoy your organized browsing experience!
