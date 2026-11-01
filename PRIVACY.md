# Bookmark Navigation Privacy Policy

Last updated: 2026-11-01

This policy describes the data handled by Bookmark Navigation, including its optional AI bookmark search. The same information is provided in 简体中文 below.

## English

### Bookmarks and local processing

Bookmark Navigation reads your Chrome bookmark tree, including bookmark titles, URLs, folder structure, IDs, and creation dates, to display, search, edit, and organize your bookmarks. Normal bookmark browsing, keyword search, and organization are processed in your browser. The extension does not read Chrome's browsing-history database or maintain a log of page visits or visit timestamps. A bookmark's creation date is the date it was saved, not a record of when you visited its website.

Theme preferences, expanded folders, and the last selected folder are saved locally. Site icons are displayed through Chrome's built-in favicon API. Opening a bookmark navigates to its website normally. Chrome's own bookmark synchronization, if you enable it, is governed by your Chrome settings; the extension does not provide its own bookmark synchronization service.

### Optional AI search and connection tests

You can configure an OpenAI-compatible AI endpoint and model, including a local endpoint such as Ollama. AI search sends requests directly from your browser to the endpoint you configure. Requests can contain:

- Your search description.
- Candidate bookmark titles, folder paths, domains, and creation dates, formatted as `YYYY-MM-DD` in your local time zone.
- Today's and yesterday's dates, to interpret time-related searches.

For libraries of 600 bookmarks or fewer, all bookmark entries can be sent as candidates for AI selection. For larger libraries, the extension first sends your search description to obtain search terms, selects candidates locally, and sends at most 120 candidate entries for AI ranking.

The saved full bookmark URL is not included as a separate field in AI requests. The extension does not separately add the saved URL's path, query string, or fragment. However, your search description, bookmark titles, or folder names may themselves contain URLs or personal information; that text is sent as written. The AI service also receives ordinary connection information associated with requests to its endpoint.

If you configure an API key, the key for the selected endpoint is sent to that endpoint in the `Authorization` request header to authenticate AI searches and connection tests. A connection test sends a simple test message and the configured model name, rather than bookmark entries. The extension uses the HTTP or HTTPS protocol specified by your endpoint URL; it does not claim that HTTP requests are encrypted.

### Local storage and clearing data

AI endpoint settings, model names, provider-specific API keys, and connection-verification state are stored in `chrome.storage.local` in your current browser profile. The extension does not sync these settings or keys. It does not add its own encryption to local API-key storage. Search terms and AI search results may be cached in the extension tab's `sessionStorage`.

The AI Search settings dialog provides a Clear action. It removes the saved AI configuration and provider keys, clears the AI cache in the tab where you use it, and attempts to revoke the optional API-host permissions previously granted to the extension. Other open tabs have their own session caches. Clearing local settings does not delete your bookmarks or data already received by an AI provider. Local browser data and tab sessions are otherwise retained according to your browser's storage and session behavior.

### Third parties and telemetry

The extension has no built-in developer-operated data collection backend and includes no analytics, advertising, or telemetry requests. Bookmark data is not sent to an AI endpoint during ordinary local browsing, organization, or keyword search.

When you use optional AI search, the endpoint you configure receives the request data described above. The provider's own privacy policy and terms apply to its processing, retention, and possible use for model training. Bookmark Navigation cannot guarantee a provider's retention, deletion, or training practices. Choose an endpoint whose practices you accept, or configure a local model if that suits your needs.

### Contact

For questions about this policy, contact [rontaekang@gmail.com](mailto:rontaekang@gmail.com).

## 简体中文

### 书签与本地处理

Bookmark Navigation 读取 Chrome 书签树，包括书签标题、网址、文件夹结构、ID 和创建日期，用于显示、搜索、编辑和整理书签。普通书签浏览、关键词搜索和整理在浏览器本地处理。扩展不会读取 Chrome 的浏览历史数据库，也不会维护网页访问记录或访问时间列表。书签创建日期表示保存书签的日期，不表示访问网站的时间。

主题偏好、已展开的文件夹和上次选中的文件夹保存在本地。网站图标通过 Chrome 内置 favicon API 显示。打开书签时，浏览器会正常访问对应网站。如果你启用了 Chrome 自身的书签同步，其行为由你的 Chrome 设置决定；扩展不提供独立的书签同步服务。

### 可选 AI 搜索与连接测试

你可以配置 OpenAI 兼容的 AI 接口和模型，包括本地 Ollama 等接口。AI 搜索请求由浏览器直接发送到你配置的接口。请求可能包含：

- 你的搜索描述。
- 候选书签的标题、文件夹路径、域名和创建日期。日期按本地时区格式化为 `YYYY-MM-DD`。
- 当天和昨天的日期，用于理解时间相关搜索。

书签数量不超过 600 时，全部书签条目都可能作为候选发送给 AI 筛选。超过 600 时，扩展先发送搜索描述以获取搜索词，再在本地筛选候选，并将不超过 120 个候选条目发送给 AI 排序。

AI 请求不会将完整书签网址作为独立字段发送，也不会另行添加该网址的路径、查询参数或片段。但搜索描述、书签标题或文件夹名本身可能包含网址或个人信息，这些文字会按原文发送。AI 服务也会收到与连接其接口有关的常规请求信息。

如果配置了 API Key，所选接口的 Key 会通过 `Authorization` 请求头发送到该接口，用于验证 AI 搜索和连接测试请求。连接测试只发送简单测试消息及所配置的模型名，不发送书签条目。请求使用你配置的接口网址所指定的 HTTP 或 HTTPS 协议；扩展不保证 HTTP 请求经过加密。

### 本地存储与清除

AI 接口设置、模型名、各服务商的 API Key 和连接验证状态保存在当前浏览器配置文件的 `chrome.storage.local` 中。扩展不会同步这些设置或 Key，也不会对本地保存的 API Key 另行加密。搜索词和 AI 搜索结果可能缓存在扩展标签页的 `sessionStorage` 中。

AI Search 设置对话框提供 Clear 清除操作。该操作会删除已保存的 AI 配置及各服务商 Key，清除执行操作的标签页中的 AI 缓存，并尝试撤销之前授予扩展的可选接口主机权限。其他已打开标签页拥有各自的会话缓存。清除本地设置不会删除你的书签，也不会删除 AI 服务商已经收到的数据。其他本地浏览器数据和标签页会话的保留方式由浏览器的存储与会话机制决定。

### 第三方与遥测

扩展未内置开发者运营的数据收集后端，也不包含分析统计、广告或遥测请求。在普通本地书签浏览、整理和关键词搜索期间，不会将书签数据发送到 AI 接口。

使用可选 AI 搜索时，你配置的接口会收到前述请求数据。服务商如何处理、保留数据以及是否将其用于模型训练，由相应服务商的隐私政策和条款决定。Bookmark Navigation 无法保证服务商的数据保留、删除或模型训练行为。请根据自己的需求选择接受其规则的接口，也可以配置本地模型。

### 联系方式

如对本政策有疑问，请联系 [rontaekang@gmail.com](mailto:rontaekang@gmail.com)。
