// AI 语义搜索核心逻辑（与 DOM 无关，便于复用与测试）
// Pipeline:
//   1. LLM 只接收用户的搜索描述，返回候选关键词 / 域名（query expansion）
//   2. 在本地对书签做匹配打分（书签数据默认不离开浏览器）
//   3. 可选：把本地预筛出的少量候选（标题 / 文件夹 / 域名，不含完整 URL）交给 LLM 精排并给出理由
(function (root) {
    'use strict';

    const CONFIG_STORAGE_KEY = 'aiSearchConfig';
    const CACHE_STORAGE_KEY = 'aiSearchCache:v1';
    const CACHE_LIMIT = 60;
    const REQUEST_TIMEOUT_MS = 45000;
    const DIRECT_CATALOG_LIMIT = 600;
    const MAX_RERANK_CANDIDATES = 120;
    const MAX_LOCAL_RESULTS = 24;

    const PRESETS = Object.freeze({
        deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
        siliconflow: { label: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
        openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
        gemini: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
        ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' }
    });

    // ---------------------------------------------------------------------
    // URL helpers
    // ---------------------------------------------------------------------

    function parseUrl(value) {
        try {
            const parsed = new URL(String(value || '').trim());
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    // 保留用户填写的路径；只有在完全没有路径时才补 /v1
    // e.g. https://api.deepseek.com            -> https://api.deepseek.com/v1/chat/completions
    //      https://api.deepseek.com/v1         -> https://api.deepseek.com/v1/chat/completions
    //      https://.../v1beta/openai/          -> https://.../v1beta/openai/chat/completions
    //      https://.../v1/chat/completions     -> unchanged
    function normalizeChatCompletionsUrl(baseUrl) {
        const parsed = parseUrl(baseUrl);
        if (!parsed) return '';

        let pathname = parsed.pathname.replace(/\/+$/, '');
        if (!/\/chat\/completions$/i.test(pathname)) {
            if (!pathname) pathname = '/v1';
            pathname = `${pathname}/chat/completions`;
        }

        parsed.pathname = pathname;
        parsed.hash = '';
        return parsed.toString();
    }

    function getEndpointOrigin(baseUrl) {
        const parsed = parseUrl(baseUrl);
        return parsed ? parsed.origin : '';
    }

    // Chrome 匹配模式不区分端口，因此按 scheme + hostname 申请
    function getHostPermissionPattern(baseUrl) {
        const parsed = parseUrl(baseUrl);
        return parsed ? `${parsed.protocol}//${parsed.hostname}/*` : '';
    }

    function isLocalEndpoint(baseUrl) {
        const parsed = parseUrl(baseUrl);
        if (!parsed) return false;
        const host = parsed.hostname;
        return host === 'localhost'
            || host === '127.0.0.1'
            || host === '[::1]'
            || host.endsWith('.local')
            || /^10\./.test(host)
            || /^192\.168\./.test(host)
            || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    }

    function isLikelyOllama(baseUrl) {
        const parsed = parseUrl(baseUrl);
        return Boolean(parsed && (parsed.port === '11434' || /ollama/i.test(parsed.hostname)));
    }

    // ---------------------------------------------------------------------
    // Bookmark catalog + local matching
    // ---------------------------------------------------------------------

    function buildCatalog(rootNode) {
        const items = [];

        function walk(node, pathSegments) {
            if (!node) return;

            if (node.url) {
                const parsed = parseUrl(node.url);
                const host = parsed ? parsed.hostname.replace(/^www\./, '').toLowerCase() : '';
                const path = parsed ? decodeSafe(parsed.pathname).toLowerCase() : '';
                const title = node.title || 'Untitled';
                const folderPath = pathSegments.join(' / ');
                items.push({
                    id: node.id,
                    title,
                    host,
                    folderPath,
                    folderName: pathSegments[pathSegments.length - 1] || '',
                    titleLower: title.toLowerCase(),
                    folderLower: folderPath.toLowerCase(),
                    pathLower: path
                });
                return;
            }

            const nextPath = node.title && node.id !== '0'
                ? [...pathSegments, node.title]
                : pathSegments;

            if (Array.isArray(node.children)) {
                node.children.forEach(child => walk(child, nextPath));
            }
        }

        walk(rootNode, []);
        return items;
    }

    function decodeSafe(value) {
        try {
            return decodeURIComponent(value);
        } catch (e) {
            return value;
        }
    }

    function normalizeTerm(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    }

    function normalizeDomain(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return '';
        const withScheme = /^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`;
        const parsed = parseUrl(withScheme);
        return parsed ? parsed.hostname.replace(/^www\./, '') : '';
    }

    function uniqueNonEmpty(values, limit) {
        const seen = new Set();
        const result = [];
        values.forEach(value => {
            if (!value || seen.has(value)) return;
            seen.add(value);
            result.push(value);
        });
        return result.slice(0, limit);
    }

    function tokenizeQuery(query) {
        return uniqueNonEmpty(
            String(query || '')
                .toLowerCase()
                .split(/[\s,.;:!?，。；：！？、"'“”‘’()（）[\]{}<>/\\|]+/)
                .map(token => token.trim())
                .filter(token => token.length >= 2),
            12
        );
    }

    // 对本地书签打分：LLM 生成的关键词 / 域名 + 原始查询分词
    function scoreCatalog(catalog, expansion, options = {}) {
        const limit = options.limit || MAX_RERANK_CANDIDATES;
        const keywords = (expansion.keywords || []).map(normalizeTerm).filter(Boolean);
        const domains = (expansion.domains || []).map(normalizeDomain).filter(Boolean);
        const queryTokens = (expansion.queryTokens || []).map(normalizeTerm).filter(Boolean);

        const terms = [
            ...keywords.map(term => ({ term, weight: 1 })),
            ...queryTokens.filter(term => !keywords.includes(term)).map(term => ({ term, weight: 0.6 }))
        ];

        const scored = [];

        catalog.forEach(item => {
            let score = 0;
            const hits = [];

            domains.forEach(domain => {
                if (!item.host) return;
                if (item.host === domain || item.host.endsWith(`.${domain}`)) {
                    score += 10;
                    hits.push({ term: domain, field: 'domain', weight: 10 });
                    return;
                }
                const label = domain.split('.').slice(-2, -1)[0];
                if (label && label.length >= 3 && item.host.includes(label)) {
                    score += 5;
                    hits.push({ term: domain, field: 'domain', weight: 5 });
                }
            });

            terms.forEach(({ term, weight }) => {
                const compact = term.replace(/\s+/g, '');
                if (compact.length >= 3 && item.host.includes(compact)) {
                    score += 4 * weight;
                    hits.push({ term, field: 'domain', weight: 4 * weight });
                }
                if (item.titleLower.includes(term)) {
                    score += 3 * weight;
                    hits.push({ term, field: 'title', weight: 3 * weight });
                }
                if (item.folderLower.includes(term)) {
                    score += 1.5 * weight;
                    hits.push({ term, field: 'folder', weight: 1.5 * weight });
                }
                if (term.length >= 3 && item.pathLower.includes(term)) {
                    score += 1 * weight;
                    hits.push({ term, field: 'path', weight: 1 * weight });
                }
            });

            if (score > 0) {
                hits.sort((a, b) => b.weight - a.weight);
                scored.push({ item, score, hits });
            }
        });

        scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
        return scored.slice(0, limit);
    }

    // 仅本地模式下的结果过滤：去掉和最佳结果差距过大的弱匹配
    function selectLocalMatches(scored) {
        if (scored.length === 0) return [];
        const threshold = Math.max(3, scored[0].score * 0.3);
        return scored
            .filter(entry => entry.score >= threshold)
            .slice(0, MAX_LOCAL_RESULTS)
            .map(entry => ({ id: entry.item.id, reason: describeHits(entry.hits) }));
    }

    const FIELD_LABELS = { domain: 'domain', title: 'title', folder: 'folder', path: 'URL' };

    function describeHits(hits) {
        const seen = new Set();
        const parts = [];
        hits.forEach(hit => {
            const key = `${hit.term}|${hit.field}`;
            if (seen.has(key) || parts.length >= 3) return;
            seen.add(key);
            parts.push(`“${hit.term}” in ${FIELD_LABELS[hit.field] || hit.field}`);
        });
        return parts.length ? `Matched ${parts.join(', ')}` : '';
    }

    // ---------------------------------------------------------------------
    // Prompts + response parsing
    // ---------------------------------------------------------------------

    function buildExpansionMessages(query) {
        return [
            {
                role: 'system',
                content: [
                    'You help a user find a website in their own browser bookmarks.',
                    'The user describes a site they saved (what it does, its topic, or a vague impression).',
                    'Output search terms likely to appear in the bookmark title, domain, or folder name:',
                    '- specific site / product / tool names that fit the description',
                    '- their domains (e.g. "excalidraw.com")',
                    '- short topic keywords, in BOTH the user\'s language and English',
                    'Respond with JSON only: {"keywords": ["up to 15 short terms"], "domains": ["up to 10 domains"]}'
                ].join('\n')
            },
            { role: 'user', content: String(query) }
        ];
    }

    // 使用短序号代替真实书签 ID，且只发送标题 / 文件夹 / 域名
    function buildRerankMessages(query, candidates) {
        const lines = candidates
            .map((entry, index) => `${index + 1}|${entry.item.folderPath || '-'}|${entry.item.title}|${entry.item.host || '-'}`)
            .join('\n');

        return [
            {
                role: 'system',
                content: [
                    'You are a high-precision bookmark search engine.',
                    'Each candidate bookmark is formatted as: N|FolderPath|Title|Domain',
                    'Use the fields AND your knowledge of websites to pick the candidates that genuinely match the user\'s description.',
                    'Rules: never pad results with loosely related items; return [] in "matches" if nothing fits; order from most to least relevant.',
                    'Respond with JSON only: {"matches": [{"n": 1, "reason": "why it matches, under 20 words, in the user\'s language"}]}'
                ].join('\n')
            },
            { role: 'user', content: `Description: ${query}\n\nCandidates:\n${lines}` }
        ];
    }

    function stripReasoning(text) {
        return String(text || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .trim();
    }

    function extractJson(text) {
        const cleaned = stripReasoning(text);
        if (!cleaned) return null;

        const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidate = fenceMatch ? fenceMatch[1].trim() : cleaned;

        try {
            return JSON.parse(candidate);
        } catch (e) {
            // 退化：截取第一个完整的 {...} 或 [...]
            for (const [open, close] of [['{', '}'], ['[', ']']]) {
                const start = candidate.indexOf(open);
                const end = candidate.lastIndexOf(close);
                if (start !== -1 && end > start) {
                    try {
                        return JSON.parse(candidate.slice(start, end + 1));
                    } catch (innerError) {
                        // try next shape
                    }
                }
            }
        }
        return null;
    }

    function toStringArray(value) {
        if (Array.isArray(value)) return value.map(item => String(item || ''));
        if (typeof value === 'string') return value.split(/[,，\n]/);
        return [];
    }

    function parseExpansion(content) {
        const parsed = extractJson(content);
        if (!parsed || typeof parsed !== 'object') {
            throw new AiRequestError('Model reply was not valid JSON', { kind: 'parse' });
        }

        const source = Array.isArray(parsed) ? { keywords: parsed } : parsed;
        return {
            keywords: uniqueNonEmpty(toStringArray(source.keywords || source.terms).map(normalizeTerm), 20),
            domains: uniqueNonEmpty(toStringArray(source.domains || source.sites).map(normalizeDomain), 12)
        };
    }

    function parseRerank(content, candidates) {
        const parsed = extractJson(content);
        if (!parsed || typeof parsed !== 'object') {
            throw new AiRequestError('Model reply was not valid JSON', { kind: 'parse' });
        }

        const list = Array.isArray(parsed)
            ? parsed
            : (parsed.matches || parsed.results || parsed.bookmarks || []);
        if (!Array.isArray(list)) return [];

        const seen = new Set();
        const matches = [];
        list.forEach(entry => {
            if (!entry || typeof entry !== 'object') return;
            const index = Number.parseInt(entry.n ?? entry.id ?? entry.index, 10) - 1;
            const candidate = candidates[index];
            if (!candidate || seen.has(candidate.item.id)) return;
            seen.add(candidate.item.id);
            matches.push({ id: candidate.item.id, reason: String(entry.reason || '').trim().slice(0, 200) });
        });
        return matches;
    }

    // ---------------------------------------------------------------------
    // Networking
    // ---------------------------------------------------------------------

    class AiRequestError extends Error {
        constructor(message, { status = 0, kind = 'http', detail = '' } = {}) {
            super(message);
            this.name = 'AiRequestError';
            this.status = status;
            this.kind = kind;
            this.detail = detail;
        }
    }

    // 合并调用方的取消信号与超时
    function createRequestSignal(parentSignal, timeoutMs = REQUEST_TIMEOUT_MS) {
        const controller = new AbortController();
        const onAbort = () => controller.abort(parentSignal.reason);
        if (parentSignal) {
            if (parentSignal.aborted) controller.abort(parentSignal.reason);
            else parentSignal.addEventListener('abort', onAbort, { once: true });
        }
        const timer = setTimeout(() => {
            controller.abort(new AiRequestError('Request timed out', { kind: 'timeout' }));
        }, timeoutMs);

        return {
            signal: controller.signal,
            dispose() {
                clearTimeout(timer);
                if (parentSignal) parentSignal.removeEventListener('abort', onAbort);
            }
        };
    }

    async function readErrorDetail(response) {
        try {
            const text = await response.text();
            try {
                const json = JSON.parse(text);
                return json.error?.message || json.message || json.detail || text.slice(0, 300);
            } catch (e) {
                return text.slice(0, 300);
            }
        } catch (e) {
            return '';
        }
    }

    async function postChat({ endpoint, apiKey, body, signal }) {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal,
                credentials: 'omit',
                referrerPolicy: 'no-referrer'
            });
        } catch (error) {
            if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : error;
            throw new AiRequestError(error.message || 'Network request failed', { kind: 'network' });
        }

        if (!response.ok) {
            const detail = await readErrorDetail(response);
            if (signal.aborted) throw signal.reason;
            throw new AiRequestError(detail || `HTTP ${response.status}`, { status: response.status, detail });
        }

        let data;
        try {
            data = await response.json();
        } catch (error) {
            if (signal.aborted) throw signal.reason;
            throw new AiRequestError('Response was not JSON', { kind: 'parse' });
        }
        return data?.choices?.[0]?.message?.content || '';
    }

    // 先带上可选参数（JSON 模式 / temperature），若服务端不支持则自动降级重试一次
    async function requestChatCompletion({ baseUrl, apiKey, model, messages, signal, jsonMode = true, timeoutMs }) {
        const endpoint = normalizeChatCompletionsUrl(baseUrl);
        if (!endpoint) throw new AiRequestError('Invalid API Base URL', { kind: 'config' });

        const request = createRequestSignal(signal, timeoutMs);
        try {
            const body = { model, messages, temperature: 0.1 };
            if (jsonMode) body.response_format = { type: 'json_object' };

            try {
                return await postChat({ endpoint, apiKey, body, signal: request.signal });
            } catch (error) {
                const retryable = error instanceof AiRequestError
                    && (error.status === 400 || error.status === 422)
                    && /response_format|json|temperature|unsupported|not supported|invalid.*param/i.test(error.message);
                if (!retryable) throw error;
                return await postChat({ endpoint, apiKey, body: { model, messages }, signal: request.signal });
            }
        } finally {
            request.dispose();
        }
    }

    function isAbortError(error) {
        return Boolean(error) && (error.name === 'AbortError' || (error instanceof DOMException && error.code === 20));
    }

    // 把技术错误翻译成用户能直接操作的提示
    function describeAiError(error, baseUrl) {
        const local = isLocalEndpoint(baseUrl);
        const ollama = local && isLikelyOllama(baseUrl);
        const ollamaHint = 'Ollama only accepts browser extensions that are explicitly allowed. Set OLLAMA_ORIGINS="chrome-extension://*" and restart Ollama.';
        const detail = error?.detail || error?.message || '';
        const status = error?.status || 0;

        if (error?.kind === 'permission') {
            return { title: 'Permission needed', hint: 'Allow Bookmark Nav to contact this API host when Chrome asks, then try again.', detail: '' };
        }
        if (error?.kind === 'config') {
            return { title: 'Invalid settings', hint: 'Enter a valid http(s) API Base URL and a model name.', detail: '' };
        }
        if (error?.kind === 'timeout') {
            return { title: 'The AI service timed out', hint: `No reply within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. Try again, or pick a faster model.`, detail: '' };
        }
        if (error?.kind === 'network') {
            return {
                title: local ? 'Can\'t reach the local model' : 'Can\'t reach the API',
                hint: ollama
                    ? `Make sure Ollama is running. ${ollamaHint}`
                    : 'Check the Base URL and your network connection. If Chrome asked for access to this host, allow it.',
                detail
            };
        }
        if (error?.kind === 'parse') {
            return { title: 'Unexpected reply from the model', hint: 'The model did not return valid JSON. Try again or choose a more capable model.', detail };
        }

        if (status === 401) {
            return { title: 'API key rejected', hint: 'Check that the key belongs to this provider and is still active.', detail };
        }
        if (status === 403) {
            return {
                title: 'Access denied',
                hint: ollama ? ollamaHint : 'The key may not have access to this model, or the account is restricted.',
                detail
            };
        }
        if (status === 404) {
            return {
                title: 'Endpoint or model not found',
                hint: `Check the Base URL path and the model name. Requests go to ${normalizeChatCompletionsUrl(baseUrl) || 'an invalid URL'}.`,
                detail
            };
        }
        if (status === 402 || status === 429) {
            return { title: 'Rate limited or out of credit', hint: 'Wait a moment, or check your provider account balance and limits.', detail };
        }
        if (status === 400 && /context|token|too long|maximum/i.test(detail)) {
            return { title: 'Request too long for this model', hint: 'Try a model with a larger context window.', detail };
        }
        if (status >= 500) {
            return { title: 'The AI service had an error', hint: `HTTP ${status}. Try again in a moment.`, detail };
        }
        return { title: 'AI request failed', hint: status ? `HTTP ${status}` : 'Unknown error', detail };
    }

    // ---------------------------------------------------------------------
    // Settings storage (chrome.storage.local, never synced)
    // ---------------------------------------------------------------------

    function normalizeConfig(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const apiKeys = {};
        if (source.apiKeys && typeof source.apiKeys === 'object') {
            Object.entries(source.apiKeys).forEach(([origin, key]) => {
                if (origin && typeof key === 'string' && key.trim()) apiKeys[origin] = key.trim();
            });
        }
        return {
            baseUrl: String(source.baseUrl || '').trim(),
            model: String(source.model || '').trim(),
            apiKeys,
            verifiedFingerprint: String(source.verifiedFingerprint || '')
        };
    }

    function getApiKey(config, baseUrl = config.baseUrl) {
        return config.apiKeys[getEndpointOrigin(baseUrl)] || '';
    }

    function isConfigured(config) {
        return Boolean(config && config.model && normalizeChatCompletionsUrl(config.baseUrl));
    }

    function hashString(input) {
        // FNV-1a, used for compact configuration and catalog signatures
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i += 1) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(16);
    }

    function fingerprint(baseUrl, model, apiKey) {
        return hashString(`${normalizeChatCompletionsUrl(baseUrl)}|${model}|${apiKey}`);
    }

    function hasChromeStorage() {
        return typeof chrome !== 'undefined' && Boolean(chrome.storage && chrome.storage.local);
    }

    async function loadConfig() {
        let config = null;
        if (hasChromeStorage()) {
            const stored = await chrome.storage.local.get(CONFIG_STORAGE_KEY);
            config = stored ? stored[CONFIG_STORAGE_KEY] : null;
        }

        // 兼容 localStorage（旧版本迁移，或扩展尚未在 chrome://extensions 重新加载 manifest 时的降级存储）
        const legacyRaw = root.localStorage ? root.localStorage.getItem(CONFIG_STORAGE_KEY) : null;
        if (legacyRaw) {
            if (!config) {
                try {
                    const legacy = JSON.parse(legacyRaw);
                    if (legacy && typeof legacy === 'object') {
                        if (legacy.apiKeys && typeof legacy.apiKeys === 'object') {
                            config = legacy;
                        } else {
                            const origin = getEndpointOrigin(legacy.baseUrl);
                            config = {
                                baseUrl: legacy.baseUrl,
                                model: legacy.model,
                                apiKeys: origin && legacy.apiKey ? { [origin]: legacy.apiKey } : {}
                            };
                        }
                        if (hasChromeStorage()) {
                            await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: normalizeConfig(config) });
                            root.localStorage.removeItem(CONFIG_STORAGE_KEY);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to migrate legacy AI config:', e);
                }
            } else if (hasChromeStorage()) {
                root.localStorage.removeItem(CONFIG_STORAGE_KEY);
            }
        }

        return normalizeConfig(config);
    }

    async function saveConfig(config) {
        const normalized = normalizeConfig(config);
        if (hasChromeStorage()) {
            await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: normalized });
            if (root.localStorage) root.localStorage.removeItem(CONFIG_STORAGE_KEY);
        } else if (root.localStorage) {
            root.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalized));
        }
        return normalized;
    }

    async function clearConfig() {
        if (hasChromeStorage()) {
            await chrome.storage.local.remove(CONFIG_STORAGE_KEY);
        }
        if (root.localStorage) {
            root.localStorage.removeItem(CONFIG_STORAGE_KEY);
        }
        clearCache();
        return normalizeConfig(null);
    }

    // ---------------------------------------------------------------------
    // Session cache (cleared when the browser session ends)
    // ---------------------------------------------------------------------

    function readCache() {
        try {
            return JSON.parse(root.sessionStorage.getItem(CACHE_STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function cacheGet(key) {
        const cache = readCache();
        return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key].value : undefined;
    }

    function cacheSet(key, value) {
        try {
            const cache = readCache();
            cache[key] = { value, at: Date.now() };
            const keys = Object.keys(cache);
            if (keys.length > CACHE_LIMIT) {
                keys.sort((a, b) => cache[a].at - cache[b].at)
                    .slice(0, keys.length - CACHE_LIMIT)
                    .forEach(oldKey => delete cache[oldKey]);
            }
            root.sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
        } catch (e) {
            // Cache is best-effort only
        }
    }

    function clearCache() {
        try {
            root.sessionStorage.removeItem(CACHE_STORAGE_KEY);
        } catch (e) {
            // ignore
        }
    }

    function cacheKey(parts) {
        return parts.map(part => String(part)).join('\u241f');
    }

    // ---------------------------------------------------------------------
    // High level search
    // ---------------------------------------------------------------------

    // 书签数 <= DIRECT_CATALOG_LIMIT 时直接 1 次请求让 AI 筛选并生成理由；
    // 超出阈值时自动先扩展关键词在本地初筛，再交给 AI 精排
    async function search({ query, rootNode, config, signal, onStage = () => {} }) {
        const apiKey = getApiKey(config);
        const endpoint = normalizeChatCompletionsUrl(config.baseUrl);
        const catalog = buildCatalog(rootNode);

        if (catalog.length === 0) {
            return { matches: [], catalogSize: 0, candidateCount: 0 };
        }

        let candidates;
        if (catalog.length <= DIRECT_CATALOG_LIMIT) {
            onStage('analyzing', { catalogSize: catalog.length });
            candidates = catalog.map(item => ({ item }));
        } else {
            onStage('expanding', { catalogSize: catalog.length });
            const expansionKey = cacheKey(['expand', endpoint, config.model, query.trim().toLowerCase()]);
            let expansion = cacheGet(expansionKey);
            if (!expansion) {
                const content = await requestChatCompletion({
                    baseUrl: config.baseUrl,
                    apiKey,
                    model: config.model,
                    messages: buildExpansionMessages(query),
                    signal
                });
                expansion = parseExpansion(content);
                cacheSet(expansionKey, expansion);
            }

            candidates = scoreCatalog(catalog, { ...expansion, queryTokens: tokenizeQuery(query) }, {
                limit: MAX_RERANK_CANDIDATES
            });
            if (candidates.length === 0) {
                return { matches: [], catalogSize: catalog.length, candidateCount: 0 };
            }
            onStage('ranking', { candidateCount: candidates.length });
        }

        const candidateSignature = JSON.stringify(candidates.map(({ item }) => [
            item.id, item.folderPath, item.title, item.host
        ]));
        const rerankKey = cacheKey(['rerank', endpoint, config.model, query.trim().toLowerCase(), hashString(candidateSignature)]);
        let matches = cacheGet(rerankKey);
        if (!matches) {
            const content = await requestChatCompletion({
                baseUrl: config.baseUrl,
                apiKey,
                model: config.model,
                messages: buildRerankMessages(query, candidates),
                signal
            });
            matches = parseRerank(content, candidates);
            cacheSet(rerankKey, matches);
        }

        return {
            matches,
            catalogSize: catalog.length,
            candidateCount: candidates.length
        };
    }

    async function testConnection({ baseUrl, apiKey, model, signal }) {
        await requestChatCompletion({
            baseUrl,
            apiKey,
            model,
            signal,
            jsonMode: false,
            timeoutMs: 20000,
            messages: [{ role: 'user', content: 'Reply with OK.' }]
        });
    }

    root.BookmarkAi = Object.freeze({
        PRESETS,
        REQUEST_TIMEOUT_MS,
        DIRECT_CATALOG_LIMIT,
        MAX_RERANK_CANDIDATES,
        AiRequestError,
        normalizeChatCompletionsUrl,
        getEndpointOrigin,
        getHostPermissionPattern,
        isLocalEndpoint,
        isLikelyOllama,
        buildCatalog,
        scoreCatalog,
        selectLocalMatches,
        tokenizeQuery,
        extractJson,
        parseExpansion,
        parseRerank,
        requestChatCompletion,
        isAbortError,
        describeAiError,
        normalizeConfig,
        getApiKey,
        isConfigured,
        fingerprint,
        loadConfig,
        saveConfig,
        clearConfig,
        clearCache,
        search,
        testConnection
    });
})(typeof window !== 'undefined' ? window : globalThis);
