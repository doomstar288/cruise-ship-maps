import React from 'react';
import { Layers } from 'lucide-react';

export default function DeckSwitcher({ decks, currentDeck, onSelectDeck }) {
  const popularDecks = [
    { level: 5, label: "Magic Carpet" },
    { level: 12, label: "Iconic Suites" },
    { level: 14, label: "Resort Pool" },
    { level: 16, label: "The Retreat" }
  ];

  const getDeckBadge = (deck) => {
    if (deck.level === 16 || deck.level === 12) return { text: "VIP", type: "vip" };
    if (deck.level === 1 || deck.level === 2 || deck.level === 13) return { text: "CREW", type: "crew" };
    if (deck.level === 3 || deck.level === 4 || deck.level === 5 || deck.level === 14 || deck.level === 15) return { text: "PUBLIC", type: "public" };
    return null;
  };

  return (
    <nav className="deck-switcher-overlay" aria-label="Ship Deck Selection">
      <div className="deck-switcher-label">
        <Layers size={14} color="var(--accent-cyan)" />
        Celebrity Xcel Decks
      </div>

      {/* Main Deck List */}
      <div className="deck-list-scroll" role="tablist" aria-orientation="vertical">
        {decks.map((deck) => {
          const isActive = currentDeck.level === deck.level;
          const badge = getDeckBadge(deck);
          return (
            <button
              key={deck.level}
              className={`deck-pill ${isActive ? 'active' : ''}`}
              onClick={() => onSelectDeck(deck)}
              role="tab"
              aria-selected={isActive}
              aria-label={`Select Deck ${deck.level} - ${deck.name}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="deck-num">DECK {deck.level < 10 ? `0${deck.level}` : deck.level}</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {badge && (
                  <span style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    letterSpacing: '0.04em',
                    background: badge.type === 'vip' ? 'hsla(280, 75%, 60%, 0.2)' : badge.type === 'crew' ? 'hsla(348, 83%, 47%, 0.2)' : 'hsla(187, 100%, 50%, 0.15)',
                    color: badge.type === 'vip' ? 'var(--accent-purple)' : badge.type === 'crew' ? 'var(--accent-crimson)' : 'var(--accent-cyan)',
                    border: `1px solid ${badge.type === 'vip' ? 'var(--accent-purple)' : badge.type === 'crew' ? 'var(--accent-crimson)' : 'var(--accent-cyan)'}`
                  }}>
                    {badge.text}
                  </span>
                )}
                <span className="deck-tag">{deck.shortName ? deck.shortName : `Deck ${deck.level}`}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Quick Jump Bar */}
      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--glass-border)' }}>
        <div style={{ fontSize: 'var(--text-size-micro)', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
          Quick Jump
        </div>
        <div className="quick-decks-bar">
          {popularDecks.map((pd) => {
            const targetDeck = decks.find(d => d.level === pd.level);
            if (!targetDeck) return null;
            return (
              <button
                key={pd.level}
                className="quick-deck-btn"
                onClick={() => onSelectDeck(targetDeck)}
                title={`Jump to Deck ${pd.level} (${pd.label})`}
              >
                D{pd.level < 10 ? `0${pd.level}` : pd.level}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

