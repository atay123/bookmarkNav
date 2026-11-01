const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'ai-search.js');
const source = readFileSync(sourcePath, 'utf8');

function createHarness(now, responses = []) {
  const requests = [];
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }

  const context = vm.createContext({
    URL,
    Date: FixedDate,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      const request = JSON.parse(options.body);
      const response = responses[requests.length];
      requests.push(request);
      assert.notEqual(response, undefined, `Unexpected request to ${url}`);
      const content = typeof response === 'function' ? response(request) : response;
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content } }] })
      };
    }
  });
  vm.runInContext(source, context, { filename: sourcePath });

  const ai = context.BookmarkAi;
  const config = ai.normalizeConfig({
    baseUrl: 'https://ai.example/v1',
    model: 'test-model'
  });
  return {
    ai,
    requests,
    search: (query, rootNode) => ai.search({ query, rootNode, config })
  };
}

function readCandidates(request) {
  return request.messages[1].content.split('\n')
    .filter(line => /^\d+\|/.test(line))
    .map(line => {
      const [n, folder, title, domain, addedDate] = line.split('|');
      return { n: Number(n), folder, title, domain, addedDate };
    });
}

function createLargeBookmarkTree(now) {
  const olderBookmarks = Array.from({ length: 100 }, (_, index) => ({
    id: `reference-${index}`,
    title: `React reference ${index}`,
    url: `https://react.dev/reference/${index}`,
    dateAdded: now - 100 * 86400000
  }));
  const target = {
    id: 'newest-react-tool',
    title: 'React drawing tool',
    url: 'https://drawing.example',
    dateAdded: now
  };
  const otherBookmarks = Array.from({ length: 500 }, (_, index) => ({
    id: `other-${index}`,
    title: `Unrelated page ${index}`,
    url: `https://site-${index}.example`,
    dateAdded: now - (index + 1) * 1000
  }));
  return { id: '0', children: [...olderBookmarks, target, ...otherBookmarks] };
}

test('time search retains a recent related bookmark outside the main score cutoff', async () => {
  const now = Date.parse('2026-11-01T12:00:00+08:00');
  const harness = createHarness(now, [
    JSON.stringify({ keywords: ['react'], domains: ['react.dev'] }),
    request => JSON.stringify({
      matches: readCandidates(request).map(({ n }) => ({ n, reason: 'Relevant bookmark' }))
    })
  ]);
  const result = await harness.search('最近保存的 React 工具', createLargeBookmarkTree(now));

  assert.equal(result.catalogSize, 601);
  assert.equal(harness.requests.length, 2);
  const candidates = readCandidates(harness.requests[1]);
  assert.ok(candidates.some(item => item.title === 'React drawing tool'), 'The latest related bookmark must reach reranking');
  assert.ok(result.matches.some(item => item.id === 'newest-react-tool'));
  assert.ok(candidates.length <= 120);
  assert.equal(result.candidateCount, candidates.length);
  assert.equal(new Set(candidates.map(item => item.title)).size, candidates.length);
  assert.equal(new Set(result.matches.map(item => item.id)).size, result.matches.length);
});

test('recent candidate selection respects smaller limits without duplicates', () => {
  const now = Date.parse('2026-11-01T12:00:00+08:00');
  const { ai } = createHarness(now);
  const catalog = ai.buildCatalog(createLargeBookmarkTree(now));

  for (const limit of [1, 5, 30, 31]) {
    const candidates = ai.scoreCatalog(catalog, {
      keywords: ['react'],
      domains: ['react.dev']
    }, { limit, includeRecent: true });

    assert.equal(candidates.length, limit, `Candidate count for limit ${limit}`);
    assert.equal(new Set(candidates.map(entry => entry.item.id)).size, candidates.length);
    assert.ok(candidates.some(entry => entry.item.id === 'newest-react-tool'), `Latest bookmark for limit ${limit}`);
  }
});

const dateCases = [
  {
    name: 'America/New_York fall DST transition',
    timezone: 'America/New_York',
    now: '2026-11-01T23:30:00-05:00',
    today: '2026-11-01',
    yesterday: '2026-10-31'
  },
  {
    name: 'America/New_York spring DST transition',
    timezone: 'America/New_York',
    now: '2026-03-09T00:30:00-04:00',
    today: '2026-03-09',
    yesterday: '2026-03-08'
  },
  {
    name: 'Asia/Shanghai ordinary midnight',
    timezone: 'Asia/Shanghai',
    now: '2026-11-01T00:30:00+08:00',
    today: '2026-11-01',
    yesterday: '2026-10-31'
  }
];

for (const dateCase of dateCases) {
  test(`search uses the previous local calendar date at ${dateCase.name}`, async () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = dateCase.timezone;
    try {
      const now = Date.parse(dateCase.now);
      const harness = createHarness(now, [JSON.stringify({ matches: [] })]);
      await harness.search('yesterday', {
        id: '0',
        children: [{ id: '1', title: 'Example', url: 'https://example.com', dateAdded: now }]
      });

      assert.equal(harness.requests.length, 1);
      const prompt = harness.requests[0].messages[1].content;
      assert.equal(prompt.split('\n')[0], `Today: ${dateCase.today} (Yesterday: ${dateCase.yesterday})`);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });
}
