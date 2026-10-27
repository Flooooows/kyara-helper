const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the userscript with a native-form stand-in; no network or real sales.
function harness(storage = new Map(), responses = [200], marketPages = [{ items: [], total: 0 }], priceHistories = {}) {
  let opened = false, submissions = 0;
  const price = { min: '1', value: '', dispatchEvent() {} };
  const fixed = { textContent: 'Fixed price', getAttribute: () => 'true' };
  const input = { dispatchEvent() {} };
  const pick = {
    querySelector: () => ({ getAttribute: () => '/cards/sm/1.webp' }),
    click() { opened = true; }
  };
  const tab = {
    querySelector: selector => selector.includes('input') ? input : pick,
    querySelectorAll: () => [pick]
  };
  const submit = { disabled: false, click() {
    submissions++;
    assert.ok(storage.get('kyara-helper-listed-cards').includes('pending'));
    void (async () => {
      for (const status of responses) await context.window.fetch('/api/market/listings', { method: 'POST', status });
    })();
  } };
  const dialog = {
    querySelector(selector) {
      if (selector === '.who') return { textContent: 'Median: 10 ◆' };
      if (selector.includes('input')) return price;
      if (selector.includes('submit')) return submit;
      return {};
    },
    querySelectorAll: () => [fixed]
  };
  const context = vm.createContext({
    URL, URLSearchParams, Headers, Request, Event, console,
    location: { origin: 'https://kyara.games', pathname: '/marche' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setInterval() {}, setTimeout: fn => fn(),
    document: {
      querySelector: selector => selector.includes('tabpanel') ? tab : (opened ? dialog : null),
      querySelectorAll: () => opened ? [dialog] : []
    },
    window: {
      addEventListener() {},
      async fetch(path, options) {
        if (path.startsWith('/api/market/prices/')) return { ok: true, json: async () => priceHistories[path.split('/').pop()] };
        if (path.startsWith('/api/market/listings?')) {
          const page = Number(new URL(path, 'https://kyara.games').searchParams.get('page'));
          const data = marketPages[page - 1];
          if (!data) throw new Error('Lecture impossible');
          return { ok: true, json: async () => data };
        }
        return { url: `https://kyara.games${path}`, ok: (options.status || 200) < 400,
          status: options.status || 200, json: async () => [{ characterId: 1, qty: 4, listable: 4 }] };
      }
    }
  });
  const source = fs.readFileSync(`${__dirname}/kyara-market-series.user.js`, 'utf8');
  vm.runInContext(source.replace('  setInterval(mount, 800);', `
    accountId = 'test-account'; headers = new Headers(); salesStatus = {};
    globalThis.sales = { prepareSale, saleMarked, status: salesStatus,
      async scanSales(catalog, owned) {
        characters = catalog; collection = owned; salesSearch = { value: '' };
        await analyzeSalePrices(); return saleRows().map(c => ({ id: c.id, price: salePrices.get(c.id)?.price }));
      },
      filterSeries(catalog, owned, values) {
        characters = catalog; collection = owned; filters = values; return seriesList();
      }
    };
    setInterval(mount, 800);`), context);
  return { ...context.sales, storage, price, submissions: () => submissions };
}

test('One click submits the median and prevents repeats after reload', async () => {
  const h = harness();
  await h.prepareSale({ id: 1, name: 'Test' });
  assert.equal(h.submissions(), 1);
  assert.equal(h.price.value, '10');
  assert.match(h.status.textContent, /mise en vente/);
  await h.prepareSale({ id: 1, name: 'Test' });
  assert.equal(h.submissions(), 1);
  const reloaded = harness(h.storage);
  await reloaded.prepareSale({ id: 1, name: 'Test' });
  assert.equal(reloaded.submissions(), 0);
});

test('Native pass renewal may succeed after a rejection', async () => {
  const h = harness(new Map(), [403, 200]);
  await h.prepareSale({ id: 1, name: 'Test' });
  assert.match(h.status.textContent, /mise en vente/);
  assert.equal(h.submissions(), 1);
});

test('Sales use the lowest active fixed price across pages, including own listings', async () => {
  const listing = (id, price, extra = {}) => ({ character: { id, series: 'A' }, price,
    type: 'fixed', status: 'active', endsAt: '2099-01-01', ...extra });
  const first = Array.from({ length: 24 }, () => listing(2, 1));
  first[0] = listing(1, 1, { endsAt: '2000-01-01' });
  first[1] = listing(1, 2, { type: 'auction' });
  const h = harness(new Map(), [200], [{ items: first, total: 27 },
    { items: [listing(1, 8), listing(1, 6, { isMine: true }), listing(1, 3, { status: 'sold' })], total: 27 }]);
  await h.prepareSale({ id: 1, name: 'Test', series: 'A' });
  assert.equal(h.submissions(), 1);
  assert.equal(h.price.value, '6');
  assert.match(h.status.textContent, /le plus bas/);
});

test('A failed or incomplete market read does not fall back to the median', async () => {
  for (const pages of [[], [{ items: [], total: 30 }], [{ items: [], total: '0' }]]) {
    const h = harness(new Map(), [200], pages);
    await h.prepareSale({ id: 1, name: 'Test', series: 'A' });
    assert.equal(h.submissions(), 0);
    assert.equal(h.saleMarked(1), false);
  }
});

test('Ascending-price scan stops as soon as an eligible offer is found', async () => {
  const items = Array.from({ length: 24 }, (_, i) => ({
    character: { id: i === 3 ? 1 : 2, series: 'A' }, price: i + 1,
    type: 'fixed', status: 'active', endsAt: '2099-01-01'
  }));
  // A request for page two would fail: only page one is provided.
  const h = harness(new Map(), [200], [{ items, total: 100 }]);
  await h.prepareSale({ id: 1, name: 'Test', series: 'A' });
  assert.equal(h.submissions(), 1);
  assert.equal(h.price.value, '4');
});

test('Sales ranking groups requests by series and puts the highest minimum price first', async () => {
  const listing = (id, price) => ({ character: { id, series: 'A' }, price,
    type: 'fixed', status: 'active', endsAt: '2099-01-01' });
  const h = harness(new Map(), [200], [{ items: [listing(1, 5), listing(2, 80)], total: 100 }]);
  const ranked = await h.scanSales([{ id: 1, name: 'Cheap', series: 'A' }, { id: 2, name: 'Expensive', series: 'A' }],
    [{ characterId: 1, qty: 4, listable: 4 }, { characterId: 2, qty: 2, listable: 2 }]);
  assert.deepEqual(Array.from(ranked, c => [c.id, c.price]), [[2, 80], [1, 5]]);
  assert.equal(h.submissions(), 0);
});

test('Sales ranking falls back to the native median and leaves unknown prices last', async () => {
  const h = harness(new Map(), [200], [{ items: [], total: 0 }], {
    1: { characterId: 1, median7d: null, median30d: 40 },
    2: { characterId: 2, median7d: 90, median30d: 10 },
    3: { characterId: 3, median7d: null, median30d: null }
  });
  const ranked = await h.scanSales([1, 2, 3].map(id => ({ id, name: String(id), series: 'A' })),
    [1, 2, 3].map(characterId => ({ characterId, qty: 2, listable: 2 })));
  assert.deepEqual(Array.from(ranked, c => [c.id, c.price]), [[2, 90], [1, 40], [3, null]]);
  assert.equal(h.submissions(), 0);
});

test('Rejected or uncertain submissions remain hidden', async () => {
  for (const responses of [[400], [500], []]) {
    const h = harness(new Map(), responses);
    await h.prepareSale({ id: 1, name: 'Test' });
    assert.equal(h.saleMarked(1), true);
    assert.match(h.status.textContent, /masquée/);
    assert.equal(h.submissions(), 1);
  }
});

test('Dashboard combines size, missing-count and started filters with sorting', () => {
  const h = harness();
  const catalog = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: i, series: 'Small' })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, series: 'Large' }))
  ];
  const owned = [{ characterId: 0, qty: 1 }];
  const names = values => Array.from(h.filterSeries(catalog, owned, values), s => s.name);
  assert.deepEqual(names({ missingMax: { value: '4' } }), ['Small']);
  assert.deepEqual(names({ totalMin: { value: '6' } }), ['Large']);
  assert.deepEqual(names({ started: { checked: true } }), ['Small']);
  assert.deepEqual(names({ search: { value: 'LARGE' }, totalMax: { value: '5' } }), []);
  assert.deepEqual(names({ sort: { value: 'name' } }), ['Large', 'Small']);
  assert.deepEqual(names({ sort: { value: 'progress' } }), ['Small', 'Large']);
});
