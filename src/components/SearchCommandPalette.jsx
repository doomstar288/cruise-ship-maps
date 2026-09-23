import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  X,
  MapPin,
  Compass,
  Navigation,
  ExternalLink,
  History,
  CornerDownLeft,
  Ship,
  Sparkles,
} from 'lucide-react';
import {
  decodeCabinNumber,
  findCabinInDecks,
  findFleetAmenity,
  CABIN_CATEGORIES,
} from '../utils/cabinDecoder';

const RECENT_SEARCHES_KEY = 'cm_recent_searches';
const MAX_RECENT_SEARCHES = 5;
const MAX_DISPLAY_RESULTS = 30;

const CATEGORY_TABS = [
  'All',
  'Dining',
  'Bars',
  'Staterooms',
  'Entertainment',
  'Pools & Deck',
  'Services',
];

function getStoredRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(term) {
  if (!term || typeof term !== 'string') return;
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 2) return;
  try {
    const existing = getStoredRecentSearches();
    const updated = [
      trimmed,
      ...existing.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore in private browsing / sandboxed storage
  }
}

function clearStoredRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore
  }
}

function matchesCategory(venueCategory, filterTab) {
  if (filterTab === 'All') return true;
  const c = String(venueCategory || '').toLowerCase();
  switch (filterTab) {
    case 'Dining':
      return (
        c.includes('dining') ||
        c.includes('restaurant') ||
        c.includes('cafe') ||
        c.includes('food')
      );
    case 'Bars':
      return c.includes('bar') || c.includes('lounge');
    case 'Staterooms':
      return c.includes('stateroom') || c.includes('suite') || c.includes('cabin');
    case 'Entertainment':
      return (
        c.includes('entertainment') ||
        c.includes('theater') ||
        c.includes('theatre') ||
        c.includes('club') ||
        c.includes('casino') ||
        c.includes('bazaar')
      );
    case 'Pools & Deck':
      return (
        c.includes('pool') ||
        c.includes('sun deck') ||
        c.includes('spa') ||
        c.includes('fitness') ||
        c.includes('outdoor')
      );
    case 'Services':
      return (
        c.includes('service') ||
        c.includes('excursion') ||
        c.includes('crew') ||
        c.includes('medical') ||
        c.includes('reception')
      );
    default:
      return true;
  }
}

export default function SearchCommandPalette({
  isOpen,
  onClose,
  onOpen,
  currentShip,
  shipDecks = [],
  availableShips = [],
  onSelectShip,
  onSelectVenue,
  onRouteToVenue,
  onGoToDeck,
}) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [recentSearches, setRecentSearches] = useState(getStoredRecentSearches);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const cardRef = useRef(null);
  const listRef = useRef(null);

  // Global Keyboard Listener: Cmd+K / Ctrl+K and '/'
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (isOpen) {
          onClose?.();
        } else {
          onOpen?.();
        }
        return;
      }

      // '/' shortcut when user is not focused on an editable element
      if (e.key === '/' && !isOpen) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isEditable = document.activeElement?.isContentEditable;
        if (
          activeTag !== 'input' &&
          activeTag !== 'textarea' &&
          activeTag !== 'select' &&
          !isEditable
        ) {
          e.preventDefault();
          onOpen?.();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onOpen, onClose]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape and Trap Focus within modal dialog
  const handleModalKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
      return;
    }

    // Arrow navigation through results
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredVenues.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  // Flattened venues across all decks of current ship
  const allVenues = useMemo(() => {
    return shipDecks.flatMap((deck) =>
      (deck.venues || [])
        .filter((v) => !v.hideLabel)
        .map((v) => ({ ...v, deck }))
    );
  }, [shipDecks]);

  // Smart Cabin Decoding Telemetry
  const cabinTelemetry = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const decoded = decodeCabinNumber(trimmed, currentShip);
    return decoded.isValid ? decoded : null;
  }, [query, currentShip]);

  // Cross-Ship Signature Amenity Availability
  const fleetAmenity = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    return findFleetAmenity(trimmed, currentShip?.id);
  }, [query, currentShip]);

  // Filtered venue results based on query and selected category tab
  const q = query.trim().toLowerCase();
  const filteredVenues = allVenues.filter((v) => {
    const matchesText =
      !q ||
      v.name.toLowerCase().includes(q) ||
      v.category.toLowerCase().includes(q) ||
      (v.label && v.label.toLowerCase().includes(q)) ||
      (v.tags && v.tags.some((t) => t.toLowerCase().includes(q)));

    const matchesCat = matchesCategory(v.category, activeCategory);
    return matchesText && matchesCat;
  });

  const activeIndex = selectedIndex >= filteredVenues.length ? 0 : selectedIndex;

  // Scroll active item into view when navigating with keyboard
  useEffect(() => {
    if (listRef.current && listRef.current.children[activeIndex]) {
      const activeEl = listRef.current.children[activeIndex];
      activeEl.scrollIntoView?.({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Handlers
  const handleSelectRecent = (term) => {
    setQuery(term);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  const handleClearRecent = (e) => {
    e.stopPropagation();
    clearStoredRecentSearches();
    setRecentSearches([]);
  };

  const handleShowCabinOnMap = useCallback(() => {
    saveRecentSearch(query);
    const match = findCabinInDecks(shipDecks, query);
    if (match.deck) {
      onGoToDeck?.(match.deck.level);
    }
    if (match.venue) {
      // Attach the deck so callers get the cabin's own deck, not the one on screen.
      onSelectVenue?.({ ...match.venue, deck: match.deck }, match.deck);
    }
    onClose?.();
  }, [query, shipDecks, onGoToDeck, onSelectVenue, onClose]);

  const handleRouteToCabin = useCallback(() => {
    saveRecentSearch(query);
    const match = findCabinInDecks(shipDecks, query);
    if (match.venue) {
      onRouteToVenue?.({ ...match.venue, deck: match.deck }, match.deck);
    } else if (match.deck) {
      onGoToDeck?.(match.deck.level);
    }
    onClose?.();
  }, [query, shipDecks, onRouteToVenue, onGoToDeck, onClose]);

  const handleSelectVenueItem = useCallback(
    (item) => {
      saveRecentSearch(query || item.name);
      if (item.deck) {
        onGoToDeck?.(item.deck.level);
      }
      onSelectVenue?.(item, item.deck);
      onClose?.();
    },
    [query, onGoToDeck, onSelectVenue, onClose]
  );

  const handleRouteVenueItem = useCallback(
    (e, item) => {
      e.stopPropagation();
      saveRecentSearch(query || item.name);
      onRouteToVenue?.(item, item.deck);
      onClose?.();
    },
    [query, onRouteToVenue, onClose]
  );

  const handleSwitchShip = useCallback(
    (targetShipId) => {
      onSelectShip?.(targetShipId);
      onClose?.();
    },
    [onSelectShip, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="command-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        ref={cardRef}
        className="command-palette-card"
        role="dialog"
        aria-modal="true"
        aria-label="Search ship venues and cabins"
        onKeyDown={handleModalKeyDown}
      >
        {/* Search Header Input Area */}
        <div className="command-palette-header">
          <div className="command-palette-input-wrapper">
            <Search className="command-palette-search-icon" size={20} />
            <input
              ref={inputRef}
              type="text"
              className="command-palette-input"
              placeholder="Cabin number (e.g. 8124), venue, or amenity…"
              aria-label="Search cabin number, venue, or amenity"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (cabinTelemetry) {
                    handleShowCabinOnMap();
                  } else if (filteredVenues[activeIndex]) {
                    handleSelectVenueItem(filteredVenues[activeIndex]);
                  }
                }
              }}
            />
            {query ? (
              <button
                className="command-palette-clear"
                onClick={() => {
                  setQuery('');
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
                aria-label="Clear search query"
              >
                <X size={16} />
              </button>
            ) : (
              <kbd className="command-palette-kbd">ESC</kbd>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div className="command-palette-tabs" role="tablist" aria-label="Filter venues by category">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeCategory === tab}
                className={`palette-tab ${activeCategory === tab ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(tab);
                  setSelectedIndex(0);
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="command-palette-body">
          {/* Smart Cabin Decoder Telemetry Card */}
          {cabinTelemetry && (
            <div className="cabin-telemetry-card" aria-live="polite">
              <div className="telemetry-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Compass size={18} color="var(--accent-cyan)" />
                  <span className="telemetry-title">
                    Cabin {cabinTelemetry.cabinNumber} Telemetry
                  </span>
                </div>
                <span className="telemetry-id font-mono">{cabinTelemetry.fullId}</span>
              </div>

              {/* Telemetry Badges Matrix */}
              <div className="telemetry-badges-row">
                <span className="telemetry-badge deck">
                  <MapPin size={12} /> Deck {cabinTelemetry.deckLevel}
                </span>

                <span
                  className={`telemetry-badge ${cabinTelemetry.side === 'Port' ? 'port' : 'starboard'}`}
                >
                  <span className="status-dot"></span>
                  {cabinTelemetry.side === 'Port' ? '🔵 Port Side' : '🟢 Starboard Side'}
                </span>

                <span className="telemetry-badge zone">
                  🧭 {cabinTelemetry.zone}
                </span>

                <span className="telemetry-badge category">
                  🏷️ {cabinTelemetry.suggestedCategory || CABIN_CATEGORIES.VERANDA}
                </span>
              </div>

              {/* Quick Actions */}
              <div className="telemetry-actions">
                <button
                  type="button"
                  className="btn-palette-primary"
                  onClick={handleShowCabinOnMap}
                >
                  <MapPin size={15} /> Show on Map
                </button>
                <button
                  type="button"
                  className="btn-palette-secondary"
                  onClick={handleRouteToCabin}
                >
                  <Navigation size={15} /> Route To Here
                </button>
              </div>
            </div>
          )}

          {/* Cross-Ship / Fleet Availability Alert */}
          {fleetAmenity && (
            <div className="cross-ship-card">
              <div className="cross-ship-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Ship size={16} color="var(--accent-gold)" />
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                    {fleetAmenity.name}
                  </span>
                </div>
                <span className="cross-ship-badge">
                  {fleetAmenity.shipClass} ({fleetAmenity.shipCount} {fleetAmenity.shipCount === 1 ? 'ship' : 'ships'})
                </span>
              </div>

              <p className="cross-ship-desc">{fleetAmenity.description}</p>

              {fleetAmenity.customNote && (
                <div className="cross-ship-note">
                  <Sparkles size={13} color="var(--accent-gold)" /> {fleetAmenity.customNote}
                </div>
              )}

              {/* 1-Click Ship Switcher when not on current ship */}
              {!fleetAmenity.isOnCurrentShip && fleetAmenity.switchTargetShipId && (
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn-switch-ship"
                    onClick={() => handleSwitchShip(fleetAmenity.switchTargetShipId)}
                  >
                    <ExternalLink size={14} />
                    Switch to{' '}
                    {availableShips.find((s) => s.id === fleetAmenity.switchTargetShipId)?.name ||
                      'Sister Ship'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Recent Searches (when query is blank) */}
          {!query && recentSearches.length > 0 && (
            <div className="recent-searches-section">
              <div className="recent-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={14} color="var(--text-muted)" />
                  <span>Recent Searches</span>
                </div>
                <button
                  type="button"
                  className="recent-clear-btn"
                  onClick={handleClearRecent}
                  aria-label="Clear recent searches"
                >
                  Clear history
                </button>
              </div>
              <div className="recent-pills-row">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="recent-search-pill"
                    onClick={() => handleSelectRecent(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Instant Results List */}
          <div className="command-palette-results-wrapper">
            <div className="results-header-count">
              {query ? (
                <span>
                  Matches for &ldquo;{query}&rdquo; ({filteredVenues.length})
                </span>
              ) : (
                <span>Suggested Venues ({filteredVenues.slice(0, MAX_DISPLAY_RESULTS).length})</span>
              )}
            </div>

            <div ref={listRef} className="command-palette-results-list" role="listbox">
              {filteredVenues.length === 0 ? (
                <div className="palette-empty-state">
                  <p>No matching venues or staterooms found for &ldquo;{query}&rdquo;.</p>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Try searching for a cabin number (e.g. 8124, 7206) or signature venue like Sunset Bar or Solarium.
                  </span>
                </div>
              ) : (
                filteredVenues.slice(0, MAX_DISPLAY_RESULTS).map((venue, idx) => (
                  <div
                    key={`${venue.deck?.level}-${venue.id}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={`palette-result-item ${idx === activeIndex ? 'selected' : ''}`}
                    onClick={() => handleSelectVenueItem(venue)}
                  >
                    <span
                      className="venue-color-indicator"
                      style={{ background: venue.color || 'var(--accent-cyan)' }}
                    />
                    <div className="palette-result-info">
                      <div className="venue-title-row">
                        <span className="venue-name">{venue.name}</span>
                        {venue.category && (
                          <span className="venue-category-pill">{venue.category}</span>
                        )}
                      </div>
                      <div className="venue-deck-meta">
                        <MapPin size={11} /> {venue.deck?.shortName || `Deck ${venue.deck?.level}`} •{' '}
                        {venue.deck?.title || venue.category}
                      </div>
                    </div>

                    <div className="palette-result-actions">
                      <button
                        type="button"
                        className="btn-palette-action view"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectVenueItem(venue);
                        }}
                        title="Show on map"
                      >
                        <MapPin size={13} /> View
                      </button>
                      <button
                        type="button"
                        className="btn-palette-action route"
                        onClick={(e) => handleRouteVenueItem(e, venue)}
                        title="Calculate route to venue"
                      >
                        <Navigation size={13} /> Route
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Navigation Hints */}
        <div className="command-palette-footer">
          <span className="footer-hint">
            <kbd className="footer-kbd">↑</kbd> <kbd className="footer-kbd">↓</kbd> Navigate
          </span>
          <span className="footer-hint">
            <kbd className="footer-kbd"><CornerDownLeft size={10} /></kbd> Select
          </span>
          <span className="footer-hint">
            <kbd className="footer-kbd">ESC</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
