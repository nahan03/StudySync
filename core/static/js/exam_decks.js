/* Saved flashcard decks (Flashcards page). Decks are named snapshots of the card list,
   stored under 'studySyncDecks' (synced to the server by sync.js). */
window.ssReady(function () {
  const $ = id => document.getElementById(id);
  if (!$('fc-deck-select')) return;

  const CARDS_KEY = 'studySyncFlashcards';
  const DECKS_KEY = 'studySyncDecks';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  const alertMsg = (msg, type) => window.showGlobalAlert ? window.showGlobalAlert(msg, type || 'info') : console.log(msg);

  function render() {
    const sel = $('fc-deck-select');
    const decks = read(DECKS_KEY);
    sel.innerHTML = '<option value="">Saved decks…</option>' + decks.map(d =>
      `<option value="${d.id}">${d.name.replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';')} (${d.cards.length})</option>`
    ).join('');
    toggle();
  }
  function toggle() {
    const has = !!$('fc-deck-select').value;
    $('fc-deck-load').disabled = !has;
    $('fc-deck-delete').disabled = !has;
  }
  $('fc-deck-select').addEventListener('change', toggle);

  $('fc-deck-save').addEventListener('click', () => {
    const cards = read(CARDS_KEY);
    if (!cards.length) { alertMsg('Add or generate some flashcards before saving a deck.', 'warning'); return; }
    const plan = (() => { try { return JSON.parse(localStorage.getItem('studySyncExamPlan') || '{}'); } catch (e) { return {}; } })();
    const name = (window.prompt('Name this deck:', plan.subject || 'My deck') || '').trim().slice(0, 60);
    if (!name) return;
    const decks = read(DECKS_KEY);
    const existing = decks.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (existing && !window.confirm(`Replace the existing deck "${existing.name}"?`)) return;
    const deck = { id: existing ? existing.id : Date.now().toString(), name, cards, savedAt: Date.now() };
    localStorage.setItem(DECKS_KEY, JSON.stringify(existing ? decks.map(d => d === existing ? deck : d) : decks.concat(deck)));
    render();
    $('fc-deck-select').value = deck.id; toggle();
    alertMsg(`Saved deck "${name}" (${cards.length} cards).`, 'info');
  });

  $('fc-deck-load').addEventListener('click', () => {
    const deck = read(DECKS_KEY).find(d => d.id === $('fc-deck-select').value);
    if (!deck) return;
    const current = read(CARDS_KEY);
    if (current.length && !window.confirm(`Replace your ${current.length} current cards with "${deck.name}"? Save them as a deck first if you want to keep them.`)) return;
    localStorage.setItem(CARDS_KEY, JSON.stringify(deck.cards));
    window.location.reload();
  });

  $('fc-deck-delete').addEventListener('click', () => {
    const id = $('fc-deck-select').value;
    const deck = read(DECKS_KEY).find(d => d.id === id);
    if (!deck || !window.confirm(`Delete deck "${deck.name}"? Your current cards are not affected.`)) return;
    localStorage.setItem(DECKS_KEY, JSON.stringify(read(DECKS_KEY).filter(d => d.id !== id)));
    render();
  });

  render();
});
