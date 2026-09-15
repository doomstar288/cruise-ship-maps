import React from 'react';

/**
 * Elevator-style deck rail (top deck at the top) plus a card naming the
 * current deck. Arrow keys move between decks, like a tablist.
 */
export default function DeckSwitcher({ decks, currentDeck, onSelectDeck }) {
  const ordered = [...decks].sort((a, b) => b.level - a.level);

  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const index = ordered.findIndex((d) => d.level === currentDeck.level);
    const next = ordered[index + (event.key === 'ArrowUp' ? -1 : 1)];
    if (!next) return;
    onSelectDeck(next);
    requestAnimationFrame(() => document.getElementById(`deck-tab-${next.level}`)?.focus());
  };

  return (
    <>
      <nav className="deck-rail" aria-label="Decks">
        <div className="deck-rail-label">Deck</div>
        <div className="deck-rail-list" role="tablist" aria-orientation="vertical" onKeyDown={handleKeyDown}>
          {ordered.map((deck) => {
            const isActive = currentDeck.level === deck.level;
            const hasMagicCarpet = deck.venues.some((v) => v.category === 'Magic Carpet');
            return (
              <button
                key={deck.level}
                id={`deck-tab-${deck.level}`}
                className={`deck-rail-btn ${isActive ? 'active' : ''}`}
                onClick={() => onSelectDeck(deck)}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                title={deck.name}
                aria-label={`${deck.name}${hasMagicCarpet ? ' (Magic Carpet stop)' : ''}`}
              >
                {deck.level}
                {hasMagicCarpet && <span className="deck-rail-mc" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="deck-info-card" aria-live="polite">
        <div className="deck-info-eyebrow">
          Deck {currentDeck.level} · {currentDeck.category}
        </div>
        <div className="deck-info-title">{currentDeck.title ?? currentDeck.name}</div>
        <p className="deck-info-desc">{currentDeck.description}</p>
      </div>
    </>
  );
}
