# Bookmark Navigation Extension

一个用来替换 Chrome 默认新标签页的书签导航扩展。界面采用左侧文件夹树 + 右侧书签卡片网格布局，适合快速浏览、整理和搜索浏览器书签。

## Screenshot

![BookmarkNav UI Screenshot](https://lh3.googleusercontent.com/Lk9FWL2sugDv_1XOwZCcjAfnrjGMbj7D8ZkxG7CACj571De0O4KBlVp-23v4uduakR877S1zdTTBx5ZHBOINVMc-AA=s1280-w1280-h800)

## Features

- 书签树导航：左侧支持多层级文件夹展开、折叠，并记住展开状态。
- 卡片式书签视图：右侧以卡片展示书签，并自动读取站点 favicon。
- 右键快捷管理：支持编辑、删除书签，以及为文件夹新建子文件夹、重命名、删除。
- 自定义删除确认：删除书签或文件夹时使用内置确认弹窗；删除文件夹时会显示包含的书签和子文件夹数量。
- 拖拽整理：支持在网格内调整书签顺序，也支持将书签拖到左侧文件夹中归档。
- 文件夹拖拽：支持拖拽调整文件夹顺序，并支持嵌套到其他文件夹下。
- 实时搜索：顶部搜索框会实时过滤书签结果，并在结果卡片上显示父级文件夹标签。
- 主题切换：支持浅色、深色和跟随系统三种主题模式。
- 空状态引导：空文件夹会显示提示信息，方便用户继续整理书签。

## Tech Stack

- Vanilla JavaScript
- Tailwind CSS
- Chrome Extension APIs
  - `chrome.bookmarks`
  - `chrome.runtime`
  - `chrome_url_overrides`
- Manifest V3

## Permissions

- `bookmarks`: 读取、创建、编辑、删除书签与文件夹，并支持拖拽整理所需的书签结构变更。
- `favicon`: 读取站点 favicon 用于书签卡片展示。

## Privacy / Data

- 所有书签数据仅在本地浏览器中读取与处理。
- 扩展不收集、不上传你的书签数据；也不依赖任何远程服务端。

## Development

1. 克隆仓库：

```bash
git clone https://github.com/atay123/bookmarkNav.git
cd bookmarkNav
```

2. 安装依赖：

```bash
npm install
```

3. 开发模式下监听 Tailwind 构建：

```bash
npm run dev
```

4. 生成发布用 CSS：

```bash
npm run build
```

## Load In Chrome

1. 打开 `chrome://extensions/`
2. 开启右上角 `Developer mode`
3. 点击 `Load unpacked`
4. 选择项目根目录
5. 打开新标签页查看扩展效果

## Project Structure

```text
bookmarkNav/
├── manifest.json
├── newtab.html
├── script.js
├── style.css
├── src/
│   └── input.css
├── tailwind.config.js
├── package.json
├── package-lock.json
├── icon.png
└── README.md
```

## Interaction Notes

- 左键点击书签卡片：打开书签页面
- 左键点击文件夹：切换右侧内容；点击箭头可展开或折叠目录树
- 右键点击书签卡片：编辑或删除书签
- 右键点击文件夹：新建子文件夹、重命名或删除文件夹
- 拖拽书签卡片：调整顺序，或移动到左侧文件夹
- 拖拽文件夹：调整层级或排序

## Security

- 遵循 Manifest V3
- 不使用内联脚本
- 所有交互事件均通过 JavaScript 动态绑定

## Manual Check List

- 书签树能正常渲染和展开
- 右键菜单能正常打开
- 编辑书签和文件夹后界面正确刷新
- 删除确认弹窗正常显示，删除后结果正确同步
- 书签拖拽排序和跨文件夹移动正常
- 搜索结果与清空搜索后的视图切换正常

## License

MIT License. See [LICENSE](./LICENSE).
