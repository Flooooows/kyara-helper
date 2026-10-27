// ==UserScript==
// @name         Kyara - Compléter les petites séries
// @namespace    kyara-local-helper
// @version      2.10.0
// @description  Collection, cartes manquantes, offres les moins chères et budgets.
// @match        https://kyara.games/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(() => {
  'use strict';

  function buildSeries(characters, collection, scope = null) {
    const owned = new Set(collection.filter(c => c.qty > 0).map(c => c.characterId));
    const groups = new Map();
    for (const c of characters) {
      if (!groups.has(c.series)) groups.set(c.series, []);
      groups.get(c.series).push(c);
    }
    return [...groups].filter(([name]) => scope ? scope.includes(name) : true)
      .map(([name, cards]) => ({ name, total: cards.length, missing: cards.filter(c => !owned.has(c.id)) }))
      .filter(s => s.missing.length)
      .sort((a, b) => a.missing.length - b.missing.length || a.name.localeCompare(b.name));
  }

  function bestOffers(items, now = Date.now(), includeMine = false) {
    const best = new Map();
    for (const item of items) {
      if (item.type !== 'fixed' || item.status !== 'active' || (item.isMine && !includeMine) ||
          !(Date.parse(item.endsAt) > now) || !Number.isFinite(item.price) || item.price < 0 || !item.character?.id) continue;
      const id = item.character.id;
      if (!best.has(id) || item.price < best.get(id).price) best.set(id, item);
    }
    return best;
  }

  function sellableDuplicates(entry) {
    return Math.max(0, Math.min(entry?.listable ?? 0, (entry?.qty ?? 0) - 1));
  }

  function estimate(series, quote, cardBudget, seriesBudget, chakra, now = Date.now()) {
    const best = bestOffers(quote?.items || [], now);
    const offers = series.missing.map(c => best.get(c.id));
    const subtotal = offers.reduce((n, o) => n + (o?.price || 0), 0);
    const complete = Boolean(quote?.complete && offers.every(Boolean));
    return { offers, subtotal, complete,
      affordable: complete && offers.every(o => o.price <= cardBudget) && subtotal <= seriesBudget &&
        (chakra == null || subtotal <= chakra) };
  }

  function updatePinnedSeries(snapshot, collection) {
    const owned = new Set(collection.filter(c => c.qty > 0).map(c => c.characterId));
    return snapshot.map(s => ({ ...s, displayCards: s.missing, missing: s.missing.filter(c => !owned.has(c.id)) }));
  }

  function sortSaleCards(rows, prices) {
    return rows.sort((a, b) => (prices.get(b.id)?.price ?? -1) - (prices.get(a.id)?.price ?? -1) || a.name.localeCompare(b.name));
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildSeries, bestOffers, estimate, sellableDuplicates, updatePinnedSeries, sortSaleCards };
    return;
  }

  const storageKey = 'kyara-helper-series';
  const nativeFetch = window.fetch;
  let headers = null, characters = null, collection = null, chakra = null;
  let scope = null, panel, body, status, cardInput, seriesInput, affordableInput, scopeInput;
  let busy = false, cancel = false, accountId = null;
  let salesBody, salesSearch, salesStatus, preparingSale = false;
  const salePrices = new Map();
  let pricingSales = false, cancelSalesPricing = false;
  let purchasesSection, salesSection;
  let filters = {}, dashboardPage = 0;
  let pinnedSeries = null, filterSignature = '', purchasePosition = null;
  let saleAttempt = null;
  const salesKey = 'kyara-helper-listed-cards';
  function saleHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(salesKey) || '{}');
      if (!history || typeof history !== 'object' || Array.isArray(history)) throw new Error();
      return history;
    }
    catch { throw new Error('Historique des ventes illisible : vente interrompue.'); }
  }
  function saleMarked(id) { return Boolean(saleHistory()[`${accountId}:${id}`]); }
  function markSale(id, state) {
    const history = saleHistory(), key = `${accountId}:${id}`;
    if (state) history[key] = { state, at: new Date().toISOString() };
    else delete history[key];
    localStorage.setItem(salesKey, JSON.stringify(history));
  }
  const quotes = new Map();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(saved) && saved.every(s => typeof s === 'string')) scope = saved;
  } catch {}

  function consume(path, value) {
    if (path === '/api/characters' && Array.isArray(value)) characters = value;
    if (path === '/api/me/collection' && Array.isArray(value)) collection = value;
    if (path === '/api/me/bootstrap' && value.me) {
      if (accountId && value.me.id !== accountId) { collection = null; quotes.clear(); salePrices.clear(); cancelSalesPricing = true; pinnedSeries = null; purchasePosition = null; }
      accountId = value.me.id;
      chakra = Number.isFinite(value.me.chakra) ? value.me.chakra : null;
    }
    render();
  }

  // Read only the responses already requested by Kyara. Keep auth in memory.
  window.fetch = async function (...args) {
    const response = await nativeFetch.apply(this, args);
    try {
      const url = new URL(response.url);
      const method = args[1]?.method || (args[0] instanceof Request ? args[0].method : 'GET');
      if (saleAttempt && url.origin === location.origin && url.pathname === '/api/market/listings' && method.toUpperCase() === 'POST') {
        saleAttempt.result = { ok: response.ok, status: response.status };
      }
      const paths = ['/api/characters', '/api/me/collection', '/api/me/bootstrap'];
      if (url.origin === location.origin && paths.includes(url.pathname) && response.ok) {
        if (url.pathname.startsWith('/api/me/')) {
          const h = new Headers(args[0] instanceof Request ? args[0].headers : undefined);
          new Headers(args[1]?.headers).forEach((v, k) => h.set(k, v));
          headers = h;
        }
        response.clone().json().then(value => consume(url.pathname, value)).catch(() => {});
      }
    } catch { /* Never interrupt the site's request. */ }
    return response;
  };

  async function get(path) {
    const response = await nativeFetch.call(window, path, {
      method: 'GET', headers: headers || undefined, credentials: 'same-origin', cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Lecture impossible (${response.status}). ${response.status === 429 ? 'Attends avant de relancer.' : 'Vérifie ta connexion à Kyara.'}`);
    return response.json();
  }

  function element(tag, text) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    return el;
  }
  function button(text, action) {
    const el = element('button', text); el.type = 'button'; el.onclick = action;
    el.style.cssText = 'padding:6px 10px;margin:4px;border:1px solid #888;border-radius:6px';
    return el;
  }
  function budget(input) { return input.value === '' ? Infinity : Math.max(0, Number(input.value) || 0); }
  function seriesList() {
    const rows = characters && collection ? buildSeries(characters, collection, scopeInput?.value === 'import' ? scope : null) : [];
    const value = key => filters[key]?.value || '';
    const within = (n, min, max) => (value(min) === '' || n >= Number(value(min))) && (value(max) === '' || n <= Number(value(max)));
    return rows.filter(s => s.name.toLocaleLowerCase().includes(value('search').toLocaleLowerCase()) &&
      within(s.missing.length, 'missingMin', 'missingMax') && within(s.total, 'totalMin', 'totalMax') &&
      (!filters.started?.checked || s.missing.length < s.total))
      .sort((a, b) => {
        const order = value('sort');
        const delta = order === 'total' ? a.total - b.total : order === 'progress' ?
          a.missing.length / a.total - b.missing.length / b.total : order === 'name' ? 0 : a.missing.length - b.missing.length;
        return delta || a.name.localeCompare(b.name);
      });
  }

  function render() {
    renderSales();
    if (!body?.isConnected) return;
    const expanded = new Set([...body.querySelectorAll('details[open]')].map(d => d.dataset.series));
    body.replaceChildren();
    if (!characters || !collection) {
      body.textContent = 'Chargement de la collection… Si nécessaire, recharge la page avec le script activé.';
      return;
    }
    const signature = JSON.stringify([Object.values(filters).map(i => [i.value, i.checked]), scopeInput.value, scope,
      cardInput.value, seriesInput.value, affordableInput.checked]);
    if (signature !== filterSignature) { pinnedSeries = null; filterSignature = signature; }
    const filtered = seriesList();
    const series = pinnedSeries ? updatePinnedSeries(pinnedSeries, collection) : filtered.filter(s => !affordableInput.checked || estimate(s, quotes.get(s.name), budget(cardInput), budget(seriesInput), chakra).affordable);
    const pages = Math.max(1, Math.ceil(series.length / 25));
    dashboardPage = Math.min(dashboardPage, pages - 1);
    const stats = element('div'); stats.className = 'kh-stats';
    for (const [value, label] of [[series.length, 'séries sélectionnées'], [series.reduce((n, s) => n + s.missing.length, 0), 'cartes à trouver'], [chakra ?? '—', 'chakra disponible ◆']]) {
      const stat = element('div'); stat.append(element('strong', value), element('span', label)); stats.append(stat);
    }
    body.append(stats);
    const notice = element('div', 'Ordre conservé pendant tes achats. Les quantités restent à jour. '); notice.className = 'kh-notice';
    const reorder = button('Réappliquer le tri', () => { pinnedSeries = null; purchasePosition = null; render(); });
    reorder.disabled = !pinnedSeries; notice.append(reorder); body.append(notice);
    const pager = element('nav'); pager.setAttribute('aria-label', 'Pages des séries');
    const previous = button('← Précédent', () => { dashboardPage--; render(); });
    const next = button('Suivant →', () => { dashboardPage++; render(); });
    previous.disabled = dashboardPage === 0; next.disabled = dashboardPage >= pages - 1;
    pager.append(previous, element('span', ` Page ${dashboardPage + 1} / ${pages} `), next);
    body.append(pager);
    let shown = 0;
    for (const s of series.slice(dashboardPage * 25, (dashboardPage + 1) * 25)) {
      const q = quotes.get(s.name);
      const e = estimate(s, q, budget(cardInput), budget(seriesInput), chakra);
      shown++;
      const details = element('details');
      details.dataset.series = s.name;
      details.open = expanded.has(s.name);
      details.className = 'kh-series';
      const price = q ? `${e.subtotal} ◆ ${e.complete ? '(série complétable)' : '(sous-total seulement)'}` : 'prix non analysés';
      const summary = element('summary');
      summary.className = 'kh-series-row';
      summary.append(element('strong', s.name), element('span', `${s.total - s.missing.length} / ${s.total} possédées`),
        element('span', s.missing.length ? `${s.missing.length} à trouver` : '✓ Série terminée'), element('span', s.missing.length ? price : 'Collection complète'));
      details.append(summary);
      const progress = element('progress'); progress.max = s.total; progress.value = s.total - s.missing.length;
      progress.setAttribute('aria-label', `Progression de ${s.name}`); details.append(progress);
      const scan = button('Actualiser les prix de cette série', () => scanSeries([s]));
      scan.disabled = busy;
      details.append(scan);
      if (q) {
        details.append(element('p', `Relevé : ${new Date(q.at).toLocaleTimeString()} · ${q.complete ? 'pagination terminée' : 'analyse partielle'}${q.error ? ` · ${q.error}` : ''}`));
        if (e.complete) details.append(element('p', e.affordable ? 'Dans les budgets définis et le solde connu.' : 'Dépasse un budget ou ton solde de chakra.'));
      }
      const ul = element('ul'); ul.className = 'kh-card-list';
      (s.displayCards || s.missing).forEach(card => {
        const missingIndex = s.missing.findIndex(c => c.id === card.id);
        const li = element('li'), offer = e.offers[missingIndex];
        const image = element('img'); image.src = `/cards/sm/${card.id}.webp`; image.alt = ''; image.loading = 'lazy';
        const name = element('strong', card.name); li.append(image, name);
        if (missingIndex === -1) {
          li.className = 'kh-owned'; li.append(element('span', '✓ Dans ta collection'));
        } else if (offer) {
          const link = element('a', `Acheter · ${offer.price} ◆`);
          link.href = `/marche?annonce=${encodeURIComponent(offer.id)}`;
          link.setAttribute('data-sveltekit-noscroll', '');
          link.setAttribute('data-sveltekit-keepfocus', '');
          link.onclick = event => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
            if (!pinnedSeries) pinnedSeries = series.map(row => ({ ...row, missing: [...row.missing] }));
            purchasePosition = { name: s.name, top: details.getBoundingClientRect().top, y: window.scrollY, opened: false, at: Date.now() };
          };
          // Kyara's router opens its native purchase dialog for this query.
          // Keep its live price checks and purchase flow in the current tab.
          link.style.cssText = 'display:inline-block;padding:6px 10px;margin:4px;border:1px solid #888;border-radius:6px';
          li.append(link);
          if (offer.price > budget(cardInput)) li.append(' · dépasse le plafond par carte');
        } else li.append(element('span', q?.complete ? 'Aucune offre disponible' : 'Prix à analyser'));
        ul.append(li);
      });
      details.append(ul); body.append(details);
    }
    if (!shown) body.append(element('p', 'Aucune série ne correspond. Élargis les filtres ou désactive le filtre de budget ; les prix doivent être analysés pour ce dernier.'));
  }

  function saleRows() {
    if (!collection || !characters) return [];
    const catalog = new Map(characters.map(c => [c.id, c]));
    const query = salesSearch.value.trim().toLocaleLowerCase();
    return sortSaleCards(collection.filter(c => sellableDuplicates(c) > 0 && catalog.has(c.characterId) && !saleMarked(c.characterId))
      .map(c => ({ ...catalog.get(c.characterId), copies: sellableDuplicates(c) }))
      .filter(c => `${c.name} ${c.series}`.toLocaleLowerCase().includes(query)), salePrices);
  }

  function renderSales() {
    if (!salesBody?.isConnected) return;
    salesBody.replaceChildren();
    let rows;
    try { rows = saleRows();
    } catch (e) { salesBody.textContent = e.message; return; }
    salesBody.append(element('p', `${rows.length} personnages · prix décroissant · ${rows.filter(c => salePrices.get(c.id)?.price != null).length} prix connus. Les prix inconnus sont placés à la fin. Un exemplaire conservé.`));
    for (const card of rows) {
      const quote = salePrices.get(card.id);
      const row = element('div', `${card.name} — ${card.series} — ${card.copies} doublon(s) — ${quote?.price != null ? `${quote.price} ◆ · ${quote.source}` : quote ? 'prix indisponible' : 'prix à analyser'} `);
      if (quote) row.title = `Relevé : ${new Date(quote.at).toLocaleTimeString()}. Prix revérifié au clic Vendre.`;
      const prepare = button('Vendre 1 au prix du marché', () => prepareSale(card));
      prepare.disabled = busy || preparingSale || pricingSales;
      row.append(prepare); salesBody.append(row);
    }
  }

  async function analyzeSalePrices() {
    if (busy || preparingSale || pricingSales) return;
    pricingSales = true; cancelSalesPricing = false;
    const owner = accountId;
    const stopped = () => cancelSalesPricing || accountId !== owner;
    try {
      const rows = saleRows(), groups = new Map();
      for (const card of rows) {
        salePrices.delete(card.id);
        if (!groups.has(card.series)) groups.set(card.series, []);
        groups.get(card.series).push(card);
      }
      renderSales();
      let done = 0;
      for (const [series, cards] of groups) {
        const remaining = new Map(cards.map(c => [c.id, c]));
        let complete = false;
        for (let page = 1; page <= 100; page++) {
          if (stopped()) break;
          salesStatus.textContent = `Prix de vente : ${done}/${rows.length} · ${series} · page ${page}…`;
          const params = new URLSearchParams({ series, type: 'fixed', sort: 'price_asc', page: String(page), pageSize: '24' });
          const result = await get(`/api/market/listings?${params}`);
          if (stopped()) break;
          if (!Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0 ||
              result.items.some(o => o.character?.series !== series)) throw new Error('Format des annonces non reconnu.');
          for (const [id, offer] of bestOffers(result.items, Date.now(), true)) {
            if (!remaining.has(id)) continue;
            salePrices.set(id, { price: offer.price, source: 'minimum marché', at: Date.now() });
            remaining.delete(id); done++;
          }
          renderSales();
          if (!remaining.size || page * 24 >= result.total) { complete = true; break; }
          if (result.items.length < 24) throw new Error('Relevé du marché incomplet.');
          await sleep(300);
        }
        if (stopped()) break;
        if (!complete) throw new Error('Limite de pages atteinte : classement partiel.');
        for (const card of remaining.values()) {
          if (stopped()) break;
          const history = await get(`/api/market/prices/${encodeURIComponent(card.id)}`);
          if (stopped()) break;
          if (history?.characterId !== card.id) throw new Error('Historique de prix non reconnu.');
          const median = history.median7d ?? history.median30d;
          salePrices.set(card.id, { price: Number.isFinite(median) && median > 0 ? median : null, source: 'médiane', at: Date.now() });
          done++; renderSales(); await sleep(300);
        }
        if (stopped()) break;
        await sleep(300);
      }
      salesStatus.textContent = stopped() ? 'Analyse arrêtée : classement partiel, prix inconnus à la fin.' : 'Prix analysés : les doublons les plus chers sont en premier. Le prix est revérifié avant chaque vente.';
    } catch (e) { salesStatus.textContent = `${e.message} Classement partiel : relance l’analyse pour le compléter.`; }
    finally { pricingSales = false; renderSales(); }
  }

  async function lowestSalePrice(card) {
    for (let page = 1; page <= 100; page++) {
      salesStatus.textContent = `Recherche du prix le plus bas pour ${card.name} · page ${page}…`;
      const params = new URLSearchParams({ series: card.series, type: 'fixed', sort: 'price_asc', page: String(page), pageSize: '24' });
      const result = await get(`/api/market/listings?${params}`);
      if (!Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0 ||
          result.items.some(o => o.character?.series !== card.series)) throw new Error('Prix du marché non vérifiable : vente interrompue.');
      // Pages are ordered by increasing price: later pages cannot improve this offer.
      const cheapest = bestOffers(result.items, Date.now(), true).get(card.id);
      if (cheapest) return cheapest.price;
      if (page * 24 >= result.total) return null;
      if (result.items.length < 24) throw new Error('Relevé du marché incomplet : vente interrompue.');
      await sleep(300);
    }
    throw new Error('Trop de pages pour vérifier le prix minimum : vente interrompue.');
  }

  async function prepareSale(card) {
    if (busy || preparingSale || pricingSales) return;
    preparingSale = true; renderSales();
    try {
      if (!accountId) throw new Error('Compte non identifié : recharge la page.');
      if (saleMarked(card.id)) throw new Error('Cette carte a déjà été envoyée à la vente avec cet outil.');
      if (document.querySelector('[role="dialog"]')) throw new Error('Ferme la fenêtre ouverte avant de préparer une autre annonce.');
      const tab = document.querySelector('[role="tabpanel"]');
      const input = tab?.querySelector('input[type="search"]');
      if (!tab?.querySelector('button.sellpick') || !input) throw new Error('Ouvre l’onglet Vendre du marché, puis réessaie. Efface les filtres natifs si nécessaire.');
      if (!headers) throw new Error('Recharge la page pour retrouver ta session.');
      const current = await get('/api/me/collection?lean=1');
      if (!Array.isArray(current)) throw new Error('Collection indisponible.');
      collection = current;
      if (!sellableDuplicates(current.find(c => c.characterId === card.id))) throw new Error('Cette carte n’a plus de doublon vendable.');
      const marketPrice = await lowestSalePrice(card);
      input.value = card.name;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      let pick;
      for (let attempt = 0; attempt < 80; attempt++) {
        await sleep(150);
        pick = [...tab.querySelectorAll('button.sellpick')].find(b => b.querySelector('img')?.getAttribute('src') === `/cards/sm/${card.id}.webp`);
        if (pick) break;
        const more = [...tab.querySelectorAll('button')].find(b => /^(Show 120 more|Afficher 120)/.test(b.textContent.trim()));
        if (more && !more.disabled) more.click();
      }
      if (!pick) throw new Error('Carte absente de la liste native. Efface ses filtres de rareté, puis réessaie.');
      pick.click();
      let dialog, median;
      for (let attempt = 0; attempt < 50; attempt++) {
        await sleep(150);
        dialog = [...document.querySelectorAll('[role="dialog"]')].find(d => d.querySelector(`img[src="/cards/sm/${card.id}.webp"]`) && d.querySelector('[role="radiogroup"]'));
        median = dialog?.querySelector('.who')?.textContent.match(/(?:Median|Médiane)\s*:\s*([\d\s.,\u00a0\u202f]+)\s*◆/i);
        if (dialog && (median || marketPrice !== null)) break;
      }
      if (!dialog) throw new Error('Le formulaire de vente n’a pas été reconnu.');
      const fixed = [...dialog.querySelectorAll('[role="radiogroup"] [role="radio"]')].find(b => /^(Fixed price|Prix fixe)/i.test(b.textContent.trim()));
      if (!fixed) throw new Error('Option prix fixe introuvable.');
      if (fixed.getAttribute('aria-checked') !== 'true') fixed.click();
      await sleep(100);
      if (marketPrice === null && !median) throw new Error('Aucune annonce active ni médiane affichée par Kyara. Choisis le prix manuellement.');
      const amount = median?.[1].replace(/\s/g, '') || '';
      // Accept grouped English integers but do not turn a decimal into 100x its value.
      const value = marketPrice ?? Number(/^\d{1,3}(,\d{3})+$/.test(amount) ? amount.replace(/,/g, '') : amount.replace(',', '.'));
      const price = dialog.querySelector('.fields input[type="number"]');
      if (!price || !Number.isSafeInteger(value) || value < 1) throw new Error('Prix non reconnu. Vérifie le formulaire.');
      if (value < Number(price.min || 1)) throw new Error('Le prix est inférieur au minimum de Kyara : ajuste le prix manuellement.');
      price.value = String(value); price.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(150);
      const submit = dialog.querySelector('button[type="submit"]');
      if (!submit || submit.disabled || fixed.getAttribute('aria-checked') !== 'true' || Number(price.value) !== value) {
        throw new Error('Le formulaire ne permet pas de publier cette annonce.');
      }
      // Persist BEFORE submitting. An interrupted request must never invite a retry.
      if (saleMarked(card.id)) throw new Error('Cette carte est déjà marquée comme mise en vente.');
      markSale(card.id, 'pending');
      renderSales();
      saleAttempt = { id: card.id, result: null };
      submit.click();
      // Kyara can renew its session/pass and retry internally after a rejection.
      for (let attempt = 0; attempt < 300 && !saleAttempt.result?.ok; attempt++) await sleep(100);
      const result = saleAttempt.result;
      if (result?.ok) {
        markSale(card.id, 'listed');
        salesStatus.textContent = `${card.name} mise en vente à ${value} ◆ (${marketPrice === null ? 'médiane, aucune annonce active' : 'prix fixe le plus bas du marché'}). Cette carte est masquée pour éviter une autre vente.`;
        const close = dialog.querySelector('.head button.x');
        if (dialog.isConnected && close) close.click();
      } else if (result && result.status >= 400 && result.status < 500) {
        salesStatus.textContent = `Vente refusée (${result.status}). Consulte le message de Kyara. Carte masquée par précaution : vérifie « Mes ventes ».`;
      } else {
        salesStatus.textContent = `Résultat incertain pour ${card.name}. Carte masquée : vérifie « Mes ventes » avant toute nouvelle tentative.`;
      }
    } catch (e) { salesStatus.textContent = e.message; }
    finally { saleAttempt = null; preparingSale = false; render(); }
  }

  async function refresh() {
    if (busy || pricingSales) return;
    busy = true; render();
    try {
      if (!headers) throw new Error('Session pas encore observée : recharge cette page avec le script activé.');
      const c = await get('/api/characters');
      const mine = await get('/api/me/collection?lean=1');
      const bootstrap = await get('/api/me/bootstrap');
      if (!Array.isArray(c) || !Array.isArray(mine)) throw new Error('Format du catalogue ou de la collection modifié.');
      consume('/api/me/bootstrap', bootstrap);
      characters = c; collection = mine; quotes.clear();
      status.textContent = 'Collection actualisée. Les séries complètes sont retirées automatiquement.';
    } catch (e) { status.textContent = e.message; }
    finally { busy = false; render(); }
  }

  async function scanSeries(series) {
    if (busy || pricingSales || !series.length) return;
    busy = true; cancel = false; render();
    try {
      for (const s of series) {
        if (cancel) break;
        const q = { items: [], complete: false, at: Date.now() };
        quotes.set(s.name, q);
        try {
          for (let page = 1; page <= 100; page++) {
            if (cancel) break;
            status.textContent = `Analyse : ${s.name} · page ${page}…`;
            const params = new URLSearchParams({ series: s.name, type: 'fixed', sort: 'price_asc', page: String(page), pageSize: '24' });
            const result = await get(`/api/market/listings?${params}`);
            if (!Array.isArray(result.items) || !Number.isFinite(result.total)) throw new Error('Format des annonces modifié.');
            if (result.items.some(o => o.character?.series !== s.name)) throw new Error('Le filtre de série a changé ; analyse interrompue.');
            q.items.push(...result.items);
            if (result.items.length < 24 || page * 24 >= result.total) { q.complete = true; break; }
            await sleep(300);
          }
          q.at = Date.now();
          render();
          await sleep(300);
        } catch (e) { q.error = e.message; throw e; }
      }
      status.textContent = cancel ? 'Analyse arrêtée. Les résultats incomplets sont signalés.' : 'Analyse terminée. Prix indicatifs à l’heure du relevé ; les annonces peuvent être vendues entre-temps.';
    } catch (e) { status.textContent = e.message; }
    finally { busy = false; render(); }
  }

  function syncMarketTab() {
    if (!panel?.isConnected || !purchasesSection || !salesSection) return;
    const tab = new URLSearchParams(location.search).get('onglet') || 'acheter';
    const onMarket = location.pathname === '/marche';
    const dashboard = onMarket && tab === 'acheter';
    purchasesSection.hidden = !dashboard;
    salesSection.hidden = !onMarket || dashboard || tab !== 'vendre';
    panel.hidden = !onMarket;
    for (const link of panel.querySelectorAll('.kh-navigation a')) link.setAttribute('aria-current',
      (link.getAttribute('href').includes('vendre') ? tab === 'vendre' : tab === 'acheter') ? 'page' : 'false');
    if (purchasePosition) {
      if (!dashboard) { purchasePosition = null; return; }
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) purchasePosition.opened = true;
      else if (purchasePosition.opened) {
        const position = purchasePosition;
        purchasePosition = null;
        requestAnimationFrame(() => {
          const row = [...body.querySelectorAll('details')].find(d => d.dataset.series === position.name);
          window.scrollTo({ top: row ? window.scrollY + row.getBoundingClientRect().top - position.top : position.y, behavior: 'instant' });
        });
      } else if (Date.now() - purchasePosition.at > 15000) purchasePosition = null;
    }
  }

  function mount() {
    syncMarketTab();
    if (location.pathname !== '/marche' || document.getElementById('kyara-series-helper')) return;
    const main = document.querySelector('main'); if (!main) return;
    panel = element('section'); panel.id = 'kyara-series-helper';
    panel.append(element('h2', 'Un peu plus près de la collection complète.'));
    panel.append(element('p', 'Tes séries, les cartes à trouver et les meilleures offres — au même endroit.'));
    const filterBar = element('div'); filterBar.className = 'kh-filters';
    function filter(key, label, type = 'number') {
      const wrapper = element('label', label), control = element('input');
      control.type = type;
      if (type === 'number') { control.min = '0'; control.step = '1'; control.placeholder = 'Tous'; }
      control.oninput = () => { dashboardPage = 0; render(); };
      wrapper.append(control); filterBar.append(wrapper); filters[key] = control;
    }
    filter('search', 'Rechercher une série', 'search');
    filter('missingMin', 'Manquantes · minimum'); filter('missingMax', 'Manquantes · maximum');
    filter('totalMin', 'Taille de série · minimum'); filter('totalMax', 'Taille de série · maximum');
    filter('started', 'Séries déjà commencées', 'checkbox');
    const sortLabel = element('label', 'Trier par'); filters.sort = element('select');
    for (const [name, value] of [['Cartes manquantes', 'missing'], ['Taille de série', 'total'], ['Progression décroissante', 'progress'], ['Nom de série', 'name']]) filters.sort.append(new Option(name, value));
    filters.sort.onchange = () => { dashboardPage = 0; render(); };
    sortLabel.append(filters.sort); filterBar.append(sortLabel);
    filterBar.append(button('Réinitialiser les filtres', () => {
      Object.values(filters).forEach(input => { if (input.type === 'checkbox') input.checked = false; else input.value = ''; });
      filters.sort.value = 'missing'; affordableInput.checked = false; dashboardPage = 0; pinnedSeries = null; render();
    }));
    const filterSection = element('details'); filterSection.className = 'kh-filter-section';
    filterSection.append(element('summary', 'Affiner ma sélection · filtres et budgets'), filterBar);
    panel.append(filterSection);
    scopeInput = element('select'); scopeInput.setAttribute('aria-label', 'Séries suivies');
    scopeInput.append(new Option('Toutes les séries incomplètes', 'all'), new Option('Ma liste importée', 'import'));
    scopeInput.value = 'all'; scopeInput.onchange = render;
    filterSection.append(scopeInput);
    const fileLabel = element('label', ' Importer la liste .md : '), file = element('input');
    file.type = 'file'; file.accept = '.md,.txt'; fileLabel.append(file); filterSection.append(fileLabel);
    file.onchange = async () => {
      try {
        if (!file.files[0]) return;
        const text = await file.files[0].text();
        const names = [...new Set([...text.matchAll(/^\d+\.\s+(.+)$/gm)].map(m => m[1].trim()))];
        if (!names.length) throw new Error('Aucune série numérotée dans ce fichier.');
        localStorage.setItem(storageKey, JSON.stringify(names)); scope = names; scopeInput.value = 'import';
        status.textContent = `${names.length} séries importées. Les séries complètes sont masquées.`;
        render();
      } catch (e) { status.textContent = e.message; }
    };
    const budgets = element('p');
    function input(label) {
      const l = element('label', label), i = element('input');
      i.type = 'number'; i.min = '0'; i.step = '1'; i.placeholder = 'illimité';
      i.style.width = '100px'; i.oninput = render; l.append(i); budgets.append(l); return i;
    }
    cardInput = input('Maximum par carte ◆ : ');
    seriesInput = input(' Maximum par série ◆ : ');
    affordableInput = element('input'); affordableInput.type = 'checkbox'; affordableInput.onchange = render;
    const affordableLabel = element('label'); affordableLabel.append(affordableInput, ' Seulement les séries complétables dans mon budget');
    filterSection.append(budgets, affordableLabel);
    const actions = element('div'); actions.className = 'kh-actions';
    const analyze = button('Analyser les séries filtrées', () => scanSeries(seriesList())); analyze.className = 'kh-primary';
    actions.append(analyze, button('Actualiser ma collection', refresh), button('Arrêter l’analyse', () => { cancel = true; })); panel.append(actions);
    status = element('p', 'Les prix fixes sont analysés à la demande. Achats via les annonces du site.');
    status.setAttribute('role', 'status');
    body = element('div');
    panel.append(status, body); main.prepend(panel); render();
    purchasesSection = element('div');
    purchasesSection.append(...panel.childNodes);
    panel.append(purchasesSection);
    const sales = element('details');
    salesSection = sales;
    sales.open = true;
    sales.append(element('summary', 'Vendre rapidement mes doublons — prix fixe'));
    salesSearch = element('input'); salesSearch.type = 'search';
    salesSearch.placeholder = 'Chercher un doublon ou une série';
    salesSearch.setAttribute('aria-label', salesSearch.placeholder);
    salesSearch.oninput = renderSales;
    salesStatus = element('p', 'Clique sur « Analyser les prix » pour classer les doublons affichés du plus cher au moins cher. Vendre publie UNE copie au minimum du marché ou, sans annonce, à la médiane Kyara. Frais appliqués et personnage ensuite masqué.');
    salesStatus.setAttribute('role', 'status');
    salesBody = element('div'); salesBody.style.cssText = 'max-height:400px;overflow:auto';
    sales.append(salesSearch, button('Analyser les prix · plus chers en premier', analyzeSalePrices),
      button('Arrêter le relevé', () => { cancelSalesPricing = true; }), button('Actualiser ma collection', refresh), salesStatus, salesBody);
    panel.append(sales); renderSales();
    const navigation = element('nav'); navigation.className = 'kh-navigation';
    navigation.setAttribute('aria-label', 'Navigation du tableau de bord');
    for (const [label, href] of [['Acheter', '/marche'], ['Vendre', '/marche?onglet=vendre']]) {
      const link = element('a', label); link.href = href; navigation.append(link);
    }
    panel.prepend(navigation);
    if (!document.getElementById('kh-dashboard-style')) {
      const style = element('style'); style.id = 'kh-dashboard-style';
      style.textContent = `
        #kyara-series-helper { background:#111923; color:#edf0f5; line-height:1.6; padding:32px; border:1px solid #354352; border-radius:16px; margin:24px 0; font-size:15px; }
        #kyara-series-helper * { box-sizing:border-box; }
        #kyara-series-helper [hidden] { display:none !important; }
        #kyara-series-helper h2 { font-size:clamp(24px,3vw,32px); line-height:1.2; max-width:650px; margin:32px 0 8px; letter-spacing:-.025em; }
        #kyara-series-helper p { color:#b9c2d1; margin:16px 0; }
        #kyara-series-helper .kh-navigation { display:flex; gap:8px; flex-wrap:wrap; border-bottom:1px solid #394354; padding-bottom:16px; }
        #kyara-series-helper a { color:#b4d8ff; }
        #kyara-series-helper .kh-navigation a { padding:8px 16px; border:1px solid #48566b; border-radius:8px; }
        #kyara-series-helper .kh-navigation a[aria-current=page] { background:#b5ebd6; color:#102a23; border-color:#b5ebd6; font-weight:600; }
        #kyara-series-helper .kh-filter-section { background:#192430; padding:16px; margin:24px 0; border:1px solid #354352; border-radius:12px; }
        #kyara-series-helper summary { cursor:pointer; }
        #kyara-series-helper .kh-stats { display:flex; flex-wrap:wrap; gap:32px; margin:24px 0; padding:24px 0; border-block:1px solid #354352; }
        #kyara-series-helper .kh-stats strong { display:block; font-size:28px; font-weight:600; font-variant-numeric:tabular-nums; }
        #kyara-series-helper .kh-stats span { color:#aebecd; font-size:13px; }
        #kyara-series-helper .kh-notice { color:#b5ebd6; margin:16px 0; }
        #kyara-series-helper .kh-series { border:1px solid #354352; border-radius:12px; margin:12px 0; padding:16px; background:#17222e; }
        #kyara-series-helper .kh-series[open] { border-color:#6a9e91; }
        #kyara-series-helper .kh-card-list { list-style:none; padding:0; margin:16px 0 0; }
        #kyara-series-helper .kh-card-list li { display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:16px; padding:12px 0; border-top:1px solid #354352; }
        #kyara-series-helper .kh-card-list img { width:40px; height:56px; object-fit:cover; border-radius:4px; }
        #kyara-series-helper .kh-card-list li > span { color:#aebecd; font-size:13px; }
        #kyara-series-helper .kh-card-list a { background:#b5ebd6; color:#102a23; font-weight:600; text-decoration:none; white-space:nowrap; }
        #kyara-series-helper .kh-owned { opacity:.65; }
        #kyara-series-helper .kh-filters { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:16px; margin:24px 0; }
        #kyara-series-helper .kh-filters label { display:flex; flex-direction:column; gap:8px; color:#b9c2d1; font-size:14px; }
        #kyara-series-helper input, #kyara-series-helper select { background:#202938; color:#edf0f5; border:1px solid #526076; padding:8px; border-radius:6px; max-width:100%; }
        #kyara-series-helper input[type=checkbox] { align-self:start; }
        #kyara-series-helper button { background:#263347; color:#edf0f5; cursor:pointer; }
        #kyara-series-helper button:hover:not(:disabled) { background:#354b61; }
        #kyara-series-helper .kh-actions { display:flex; flex-wrap:wrap; gap:8px; margin:24px 0 8px; }
        #kyara-series-helper button.kh-primary { background:#b5ebd6; color:#102a23; font-weight:600; }
        #kyara-series-helper button.kh-primary:hover:not(:disabled) { background:#d4f5e8; }
        #kyara-series-helper button:disabled { opacity:.45; cursor:default; }
        #kyara-series-helper :focus-visible { outline:2px solid #97caff; outline-offset:3px; }
        #kyara-series-helper .kh-series-row { display:grid; grid-template-columns:minmax(180px,2fr) 1fr 1fr 1.5fr; gap:16px; align-items:center; cursor:pointer; padding:8px; }
        #kyara-series-helper .kh-series-row span { color:#b9c2d1; font-size:14px; }
        #kyara-series-helper progress { width:100%; height:4px; accent-color:#97caff; }
        @media(max-width:700px) { #kyara-series-helper { padding:16px; } #kyara-series-helper .kh-series-row { grid-template-columns:1fr 1fr; } #kyara-series-helper .kh-card-list li { gap:8px; grid-template-columns:32px minmax(0,1fr); } #kyara-series-helper .kh-card-list img { width:32px; height:44px; grid-row:span 2; } #kyara-series-helper .kh-card-list a, #kyara-series-helper .kh-card-list li > span { grid-column:2; justify-self:start; } }
      `;
      document.head.append(style);
    }
    syncMarketTab();
  }
  window.addEventListener('hashchange', syncMarketTab);
  setInterval(mount, 800);
  // Returning to the market tab also refreshes ownership and prices.
  window.addEventListener('focus', () => {
    if (location.pathname === '/marche' && panel?.isConnected && headers && !busy && !purchasePosition && !pinnedSeries) refresh();
  });
})();
