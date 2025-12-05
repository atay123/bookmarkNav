# 书签导航扩展 (Bookmark Navigation Extension)

本项目是一个 Chrome 浏览器扩展，旨在将默认的“新标签页”替换为一个功能丰富的书签导航仪表板。它通过左侧目录树和右侧卡片网格的形式展示您的书签，让您更便捷地浏览和访问收藏的网站。

**最新更新 (2025-12-04):**
UI 界面已使用 **Tailwind CSS** 风格进行了全面重构，提供了现代化、简洁且美观的视觉体验。

## 项目概览

*   **名称:** 书签导航网站
*   **类型:** Chrome 扩展 (Manifest V3)
*   **核心功能:** 覆盖 `newtab` 页面以展示用户书签。
*   **权限:** `bookmarks` (只读访问权限，用于显示书签树)。

## 项目结构

*   `manifest.json`: 扩展配置文件 (V3 版本)，定义了权限和入口点。
*   `newtab.html`: 主仪表板界面，使用 Tailwind Utility 类名构建布局。
*   `style.css`: 样式文件。
    *   *注意:* 目前包含预编译的 CSS 样式以确保直接可用性。
    *   在完整开发环境中，应通过 Tailwind CLI 从 `src/input.css` 生成。
*   `script.js`: 核心逻辑脚本。
    *   负责书签数据的获取与渲染。
    *   动态生成带有 Tailwind 类名的 HTML 元素。
    *   包含搜索功能和智能图标加载逻辑。
*   `tailwind.config.js`: Tailwind CSS 配置文件（供后续开发构建使用）。
*   `package.json`: 项目依赖配置。

## 安装与使用

1.  打开 Chrome 浏览器并访问 `chrome://extensions/`。
2.  在右上角开启 **开发者模式 (Developer mode)**。
3.  点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
4.  选择本项目所在的目录 (`/Users/rontae/code/bookmarkNav`)。
5.  打开一个新的标签页，体验全新的 UI 界面。

## 界面与功能特性

*   **现代化 UI 设计:**
    *   采用 Slate (青灰) 和 Indigo (靛蓝) 配色方案，清爽护眼。
    *   卡片式设计，带有优雅的阴影和悬停动画。
    *   响应式网格布局，适应不同屏幕尺寸。
*   **增强的交互体验:**
    *   **左侧侧边栏:** 选中文件夹高亮显示，支持多级目录缩进。
    *   **右侧主面板:** 显示书签网格，支持 Favicon 显示。
    *   **搜索功能:** 顶部导航栏包含实时搜索框，可快速查找所有文件夹下的书签。
*   **智能 Favicon 系统:**
    *   自动尝试多源加载图标 (本地 -> Google -> Icon Horse)。
    *   加载失败时自动回退到精美的 SVG 占位符。

## 开发指南 (Development Workflow)

本项目采用 Tailwind CSS 标准构建流程。为了确保样式的一致性和可维护性，**请勿直接手动修改 `style.css`**。

### 1. 环境准备
确保您的系统已安装 Node.js。首次开发前，请安装项目依赖：

```bash
npm install
```

### 2. 开发模式
在开发过程中，运行以下命令启动 Tailwind CLI 的监听模式。它会实时监控 HTML/JS 文件的变化，并自动重新编译 `style.css`。

```bash
npm run dev
```

### 3. 生产构建
在准备发布或提交代码前，运行构建命令以生成压缩优化后的 CSS 文件：

```bash
npm run build
```

### 注意事项
*   目前的 `style.css` 包含了一个手动生成的快照，以支持非 Node 环境下的预览。
*   一旦您开始使用 `npm run dev`，该文件将被自动重写，这是正常的。

