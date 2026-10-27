const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSeries, bestOffers, estimate, sellableDuplicates, updatePinnedSeries } = require('./kyara-market-series.user.js');
const cards = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `Card ${i}`, series: 'A' }));
test('Purchases update counts without moving rows or removing completed series and card slots', () => {
  const snapshot = [{ name: 'B', total: 2, missing: [{ id: 10 }, { id: 11 }] },
    { name: 'A', total: 3, missing: [{ id: 20 }, { id: 21 }] }];
  const afterOne = updatePinnedSeries(snapshot, [{ characterId: 20, qty: 1 }]);
  assert.deepEqual(afterOne.map(s => s.name), ['B', 'A']);
  assert.equal(afterOne[1].missing.length, 1);
  assert.equal(afterOne[1].displayCards.length, 2);
  const afterTwo = updatePinnedSeries(snapshot, [{ characterId: 20, qty: 1 }, { characterId: 21, qty: 1 }]);
  assert.equal(afterTwo.length, 2);
  assert.equal(afterTwo[1].missing.length, 0);
  assert.equal(snapshot[1].missing.length, 2);
});
test('Sales preserve one copy and respect locked/reserved quantities', () => {
  assert.equal(sellableDuplicates({qty: 1, listable: 1}), 0);
  assert.equal(sellableDuplicates({qty: 5, listable: 5}), 4);
  assert.equal(sellableDuplicates({qty: 5, listable: 2}), 2);
  assert.equal(sellableDuplicates({qty: 5, listable: 0}), 0);
  assert.equal(sellableDuplicates(undefined), 0);
});
const offer = (id, price, extra = {}) => ({ id: `offer-${id}-${price}`, character: { id }, price,
  type: 'fixed', status: 'active', endsAt: '2099-01-01', isMine: false, ...extra });

test('All series sizes are included and sorted by missing count', () => {
  const catalog = [...cards, { id: 20, name: 'Solo', series: 'Solo' },
    ...Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, name: `${i}`, series: 'Large' }))];
  const series = buildSeries(catalog, []);
  assert.deepEqual(series.map(s => [s.name, s.missing.length]), [['Solo', 1], ['A', 5], ['Large', 12]]);
  assert.deepEqual(buildSeries(catalog, [], ['Large']).map(s => s.name), ['Large']);
});

test('Owned duplicates count once; complete series disappear', () => {
  assert.equal(buildSeries(cards, [{ characterId: 1, qty: 20 }])[0].missing.length, 4);
  assert.equal(buildSeries(cards, cards.map(c => ({ characterId: c.id, qty: 1 }))).length, 0);
  assert.equal(buildSeries(cards, [], ['Other']).length, 0);
});
test('Minimum excludes own, expired and auction listings', () => {
  const best = bestOffers([offer(1, 10), offer(1, 7), offer(1, 1, { isMine: true }),
    offer(1, 2, { endsAt: '2000-01-01' }), offer(1, 3, { type: 'auction' })]);
  assert.equal(best.size, 1); assert.equal(best.get(1).price, 7);
});
test('No complete price for missing offers or truncated pagination', () => {
  const series = { missing: cards.slice(0, 2) };
  assert.equal(estimate(series, { complete: true, items: [offer(1, 10)] }, Infinity, Infinity, 100).complete, false);
  assert.equal(estimate(series, { complete: false, items: [offer(1, 10), offer(2, 20)] }, Infinity, Infinity, 100).complete, false);
});
test('Card, series and chakra budgets are independent; zero is a real budget', () => {
  const s = { missing: cards.slice(0, 2) }, q = { complete: true, items: [offer(1, 10), offer(2, 20)] };
  assert.equal(estimate(s, q, 20, 30, 30).affordable, true);
  for (const limits of [[19, 100, 100], [100, 29, 100], [100, 100, 29], [0, 100, 100]]) {
    assert.equal(estimate(s, q, ...limits).affordable, false);
  }
  assert.equal(estimate(s, q, Infinity, Infinity, null).subtotal, 30);
});
