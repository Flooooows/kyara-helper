// ==UserScript==
// @name         Kyara - Doublons entre amis
// @namespace    kyara-local-helper
// @version      1.0.2
// @description  Croise les doublons manquants et prépare des lots sans envoyer l'échange.
// @match        https://kyara.games/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  const data = { characters: null, mine: null, friends: new Map() };
  const originalFetch = window.fetch;
  // Observe only responses the site already requests; no tokens are read or stored.
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = new URL(response.url);
      const friend = url.pathname.match(/^\/api\/trades\/(available|owned)\/([\w-]+)$/);
      const key = url.pathname === '/api/characters' ? 'characters'
        : url.pathname === '/api/me/collection' ? 'mine' : null;
      if (url.origin === location.origin && response.ok && (key || friend)) {
        response.clone().json().then(value => {
          if (!Array.isArray(value)) return;
          if (key) data[key] = value;
          else {
            const entry = data.friends.get(friend[2]) || {};
            entry[friend[1]] = value;
            data.friends.set(friend[2], entry);
          }
        }).catch(() => {});
      }
    } catch { /* Observing must not interfere with the site's requests. */ }
    return response;
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normalize = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

  function candidates(id) {
    const friend = data.friends.get(id);
    if (!data.characters || !data.mine || !friend?.available || !friend?.owned) {
      throw new Error('Données en attente : recharge la page puis ouvre un nouvel échange.');
    }
    const mine = new Map(data.mine.map(c => [c.characterId, c]));
    const theirs = new Set(friend.owned);
    const catalog = new Map(data.characters.map(c => [c.id, c]));
    const give = data.mine.filter(c => c.qty > 1 && c.listable > 0 && !theirs.has(c.characterId));
    // n is the number of freely tradable copies, not the number of duplicates.
    // Requiring n >= 2 conservatively leaves at least one copy with the friend.
    const want = friend.available.filter(c => c.n >= 2 && !(mine.get(c.characterId)?.qty > 0));
    const cards = rows => rows.map(c => catalog.get(c.characterId)).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    return [cards(give), cards(want)];
  }

  function mount(dialog, friendId) {
    const panel = document.createElement('details');
    panel.dataset.kyaraHelper = 'true';
    panel.open = true;
    panel.style.cssText = 'padding:12px;margin:12px 0;border:1px solid #888;border-radius:8px';
    const summary = document.createElement('summary');
    summary.textContent = 'Doublons utiles entre amis';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Analyse les collections pour préparer un lot.';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Filtrer par personnage ou anime';
    search.setAttribute('aria-label', search.placeholder);
    search.style.cssText = 'width:100%;padding:8px;margin:8px 0';
    const list = document.createElement('div');
    list.style.cssText = 'max-height:240px;overflow:auto;white-space:pre-line';
    let sets = [[], []];
    let busy = false;
    function display() {
      const query = normalize(search.value.trim());
      const filtered = sets.map(cards => cards.filter(c => normalize(`${c.name} ${c.series}`).includes(query)));
      list.textContent = filtered.map((cards, side) =>
        `${side === 0 ? 'À donner' : 'À recevoir'} (${cards.length})\n` +
        cards.map(c => `• ${c.name} — ${c.series}`).join('\n')).join('\n\n');
      return filtered;
    }
    const analyze = document.createElement('button');
    analyze.type = 'button';
    analyze.textContent = 'Analyser / actualiser les listes';
    analyze.onclick = () => {
      try {
        sets = candidates(friendId);
        display();
        status.textContent = `${sets[0].length} doublons pour elle/lui ; ${sets[1].length} pour toi. ` +
          'Un lot contient au plus 20 cartes de chaque côté (40 au total), un exemplaire par personnage. ' +
          'Après acceptation, recharge la page pour recalculer les manquants.';
      } catch (error) { status.textContent = error.message; }
    };
    search.oninput = display;
    const prepare = document.createElement('button');
    prepare.type = 'button';
    prepare.textContent = 'Préparer le premier lot affiché';
    prepare.style.marginLeft = '8px';
    prepare.onclick = async () => {
      if (busy) return;
      busy = true;
      prepare.disabled = analyze.disabled = true;
      const shelf = dialog.querySelector('.shelf');
      const input = shelf?.querySelector('input[type="search"]');
      try {
        if (!shelf || !input || dialog.querySelectorAll('.trays .slot').length ||
            [...dialog.querySelectorAll('.trays input')].some(i => Number(i.value) > 0)) {
          throw new Error('Ouvre un échange vide, sans carte ni chakra, avant de préparer un lot.');
        }
        if (shelf.querySelector('.only[aria-pressed="true"], .chip[aria-pressed="true"]:not(:has(.dot.all))')) {
          throw new Error('Désactive les filtres natifs et choisis toutes les raretés avant de préparer le lot.');
        }
        sets = candidates(friendId);
        const filtered = display();
        const counts = filtered.map(cards => Math.min(20, cards.length));
        if (!counts.some(Boolean)) throw new Error('Aucune carte disponible avec ce filtre.');
        for (let side = 0; side < 2; side++) {
          if (!counts[side]) continue;
          const tab = shelf.querySelectorAll('[role="tab"]')[side];
          if (!tab || !dialog.isConnected) throw new Error('Fenêtre d’échange fermée ou interface modifiée.');
          tab.click();
          await sleep(150);
          for (const card of filtered[side].slice(0, counts[side])) {
            input.value = card.name;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            let tile;
            for (let attempt = 0; attempt < 150; attempt++) {
              await sleep(100);
              tile = [...shelf.querySelectorAll('.grid button.tile')].find(button =>
                button.querySelector('img')?.getAttribute('src') === `/cards/sm/${card.id}.webp`);
              if (tile) break;
              // Short names (e.g. "A") can match more than the first 60 cards.
              const more = shelf.querySelector('button.more');
              if (more && !more.disabled) more.click();
            }
            if (!dialog.isConnected || !tile || tile.disabled) throw new Error(`Carte indisponible : ${card.name}.`);
            const before = dialog.querySelectorAll('.trays .slot').length;
            tile.click();
            await sleep(100);
            if (dialog.querySelectorAll('.trays .slot').length !== before + 1) {
              throw new Error(`La sélection de ${card.name} n’a pas été confirmée.`);
            }
          }
        }
        status.textContent = `Lot préparé : ${counts[0]} à donner, ${counts[1]} à recevoir. Vérifie les cartes et les éventuelles limites de don affichées par Kyara, puis envoie manuellement.`;
      } catch (error) {
        status.textContent = `${error.message} Aucun échange envoyé. Si des cartes sont déjà sélectionnées, vérifie-les ou ferme la fenêtre pour recommencer.`;
      } finally {
        if (input?.isConnected) {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        busy = false;
        prepare.disabled = analyze.disabled = false;
      }
    };
    panel.append(summary, status, analyze, prepare, search, list);
    dialog.querySelector('.shelf').before(panel);
  }

  setInterval(() => {
    const friendId = location.pathname.match(/^\/profil\/([\w-]+)$/)?.[1];
    if (!friendId) return;
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (dialog.querySelector('.shelf [role="tablist"]') && !dialog.querySelector('[data-kyara-helper]')) {
        mount(dialog, friendId);
      }
    }
  }, 700);
})();
