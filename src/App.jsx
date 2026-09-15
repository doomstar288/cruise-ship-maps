import React, { useCallback, useMemo, useState } from 'react';
import HeaderNavbar from './components/HeaderNavbar';
import DeckSwitcher from './components/DeckSwitcher';
import DeckMapViewer from './components/DeckMapViewer';
import CabinInspectorModal from './components/CabinInspectorModal';
import ApiInspectorModal from './components/ApiInspectorModal';
import MultiSourceInspectorModal from './components/MultiSourceInspectorModal';
import { CELEBRITY_XCEL_DECKS, CELEBRITY_XCEL_METADATA, SAMPLE_WAYFINDING_ROUTES } from './data/celebrityXcelData';
import { VENUE_COLORS } from './utils/deckPlanDataPipeline';
import { buildRoute } from './utils/wayfinding';
import { Search, Navigation, ChevronRight, X, ChevronLeft, CheckCircle2 } from 'lucide-react';
import './styles/design-system.css';

const MAX_SEARCH_RESULTS = 40;

// Filter chips share the map's palette so a chip's dot matches what it highlights.
const CATEGORIES = [
  { label: 'All Venues', key: 'ALL', color: 'var(--accent-cyan)' },
  { label: 'Magic Carpet', key: 'MAGIC CARPET', color: VENUE_COLORS.magicCarpet },
  { label: 'Dining', key: 'FINE DINING', color: VENUE_COLORS.dining },
  { label: 'Bars & Lounges', key: 'BARS & LOUNGES', color: VENUE_COLORS.bar },
  { label: 'Staterooms', key: 'STATEROOMS', color: VENUE_COLORS.veranda },
  { label: 'Suites', key: 'SUITES', color: VENUE_COLORS.suite },
  { label: 'Entertainment', key: 'ENTERTAINMENT', color: VENUE_COLORS.entertainment },
  { label: 'Pools & Sun Deck', key: 'POOL & SUN DECK', color: VENUE_COLORS.pool },
];

const deckByLevel = (level) => CELEBRITY_XCEL_DECKS.find((d) => d.level === level);

const startsCollapsed = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1024px)').matches;

export default function App() {
  const [currentDeck, setCurrentDeck] = useState(() => deckByLevel(5)); // Grand Plaza & Magic Carpet
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [isUpscaledMode, setIsUpscaledMode] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showApiInspector, setShowApiInspector] = useState(false);
  const [showAccuracyInspector, setShowAccuracyInspector] = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);
  const [isDockCollapsed, setIsDockCollapsed] = useState(startsCollapsed);

  const allVenuesList = useMemo(
    () =>
      CELEBRITY_XCEL_DECKS.flatMap((d) =>
        d.venues.filter((v) => !v.hideLabel).map((v) => ({ ...v, deck: d }))
      ),
    []
  );

  const filteredSearchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return allVenuesList.filter(
      (v) =>
        v.name.toLowerCase().includes(query) ||
        v.category.toLowerCase().includes(query) ||
        v.tags?.some((t) => t.toLowerCase().includes(query))
    );
  }, [allVenuesList, searchQuery]);

  const selectVenue = useCallback((venue) => setSelectedVenue(venue), []);
  const toggleUpscale = useCallback(() => setIsUpscaledMode((on) => !on), []);

  const goToDeck = (level) => {
    const deck = deckByLevel(level);
    if (deck) setCurrentDeck(deck);
  };

  const handleSelectSearchResult = (item) => {
    setCurrentDeck(item.deck);
    setSelectedVenue(item);
    setSearchQuery('');
  };

  const handleStartWayfinding = (venue) => {
    try {
      setActiveRoute(
        buildRoute(CELEBRITY_XCEL_DECKS, {
          id: `to-${venue.id}`,
          from: { deck: currentDeck.level },
          to: { deck: currentDeck.level, venueId: venue.id },
        })
      );
      setSelectedVenue(null);
      setIsDockCollapsed(false);
    } catch {
      // Venues on decks without a guest elevator bank cannot be routed to.
      setActiveRoute(null);
    }
  };

  const routeDecks = activeRoute
    ? [...new Set([activeRoute.origin.deck, activeRoute.destination.deck])]
    : [];

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <HeaderNavbar
        onOpenApiInspector={() => setShowApiInspector(true)}
        onOpenAccuracyInspector={() => setShowAccuracyInspector(true)}
        isUpscaledMode={isUpscaledMode}
        onToggleUpscale={toggleUpscale}
      />

      {/* Main Viewport Workspace */}
      <div className="main-viewport">
        {/* Left Sidebar Search & Filter Dock */}
        <aside className={`sidebar-dock ${isDockCollapsed ? 'collapsed' : ''}`}>
          <button
            className="dock-toggle-btn"
            onClick={() => setIsDockCollapsed(!isDockCollapsed)}
            title={isDockCollapsed ? 'Show search panel' : 'Hide search panel'}
            aria-label={isDockCollapsed ? 'Show search panel' : 'Hide search panel'}
            aria-expanded={!isDockCollapsed}
          >
            {isDockCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <div className="dock-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Search the ship
              </span>
              <span className="ship-badge" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                IMO {CELEBRITY_XCEL_METADATA.imoNumber}
              </span>
            </div>

            <div className="search-box">
              <Search className="search-icon" size={16} />
              <input
                type="search"
                className="search-input"
                placeholder="Cabin number, venue, Magic Carpet…"
                aria-label="Search cabins and venues"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="dock-content">
            {searchQuery ? (
              <div>
                <div className="filter-section-title">
                  {filteredSearchResults.length > MAX_SEARCH_RESULTS
                    ? `Showing ${MAX_SEARCH_RESULTS} of ${filteredSearchResults.length}`
                    : `Results (${filteredSearchResults.length})`}
                </div>
                <div className="search-results-list">
                  {filteredSearchResults.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '12px 0' }}>
                      No matching venues or cabins found.
                    </div>
                  ) : (
                    filteredSearchResults.slice(0, MAX_SEARCH_RESULTS).map((item) => (
                      <button
                        key={`${item.deck.level}-${item.id}`}
                        className="search-result-card"
                        onClick={() => handleSelectSearchResult(item)}
                      >
                        <span className="filter-dot" style={{ background: item.color }} />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div className="res-title">{item.name}</div>
                          <div className="res-sub">{item.deck.shortName} • {item.category}</div>
                        </div>
                        <ChevronRight size={16} color="var(--text-muted)" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Category Filters */}
                <div>
                  <div className="filter-section-title">Show on map</div>
                  <div className="filter-tags">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        className={`filter-chip ${activeFilter === cat.key ? 'active' : ''}`}
                        onClick={() => setActiveFilter(cat.key)}
                        aria-pressed={activeFilter === cat.key}
                      >
                        <span className="filter-dot" style={{ background: cat.color }}></span>
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Wayfinding Presets & Active Guidance */}
                <div>
                  <div className="filter-section-title">Directions</div>
                  {activeRoute && (
                    <div className="route-card">
                      <div className="route-card-header">
                        <span>{activeRoute.name}</span>
                        <button onClick={() => setActiveRoute(null)} aria-label="Clear route">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="res-sub" style={{ marginBottom: '8px' }}>
                        ~{activeRoute.distanceMeters} m • about {activeRoute.estimatedMinutes} min walk
                      </div>
                      <ol>
                        {activeRoute.steps.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ol>
                      {routeDecks.length > 1 && (
                        <div className="route-deck-buttons">
                          {routeDecks.map((level) => (
                            <button
                              key={level}
                              className={`filter-chip ${currentDeck.level === level ? 'active' : ''}`}
                              onClick={() => goToDeck(level)}
                            >
                              View Deck {level}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="search-results-list">
                    {SAMPLE_WAYFINDING_ROUTES.map((route) => (
                      <button
                        key={route.id}
                        className={`search-result-card ${activeRoute?.id === route.id ? 'active' : ''}`}
                        onClick={() => {
                          goToDeck(route.origin.deck);
                          setActiveRoute(route);
                        }}
                      >
                        <div style={{ textAlign: 'left' }}>
                          <div className="res-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Navigation size={14} color="var(--accent-cyan)" /> {route.name}
                          </div>
                          <div className="res-sub">
                            Deck {route.origin.deck} → Deck {route.destination.deck} • ~{route.estimatedMinutes} min walk
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Multi-Source Accuracy Card */}
                <button className="accuracy-card" onClick={() => setShowAccuracyInspector(true)}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-emerald)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Multi-Source Accuracy Engine</span>
                    <CheckCircle2 size={14} />
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                    98.4% Verified Quad-Source Confidence
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
                    Simulated demo data — scores are illustrative, not from live feeds.
                  </div>
                </button>

                {/* Vessel Specifications Summary Card */}
                <div className="specs-card">
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-gold)', textTransform: 'uppercase' }}>
                    Ship at a glance
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: '4px 0', fontWeight: 700 }}>
                    {CELEBRITY_XCEL_METADATA.name} ({CELEBRITY_XCEL_METADATA.shipClass})
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '6px' }}>
                    <span>Length: <strong>{CELEBRITY_XCEL_METADATA.lengthMeters} m</strong></span>
                    <span>Beam: <strong>{CELEBRITY_XCEL_METADATA.beamMeters} m</strong></span>
                    <span>Guests: <strong>{CELEBRITY_XCEL_METADATA.maxPassengers.toLocaleString()}</strong></span>
                    <span>Guest decks: <strong>{CELEBRITY_XCEL_METADATA.guestDecks}</strong></span>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Center Interactive Map Viewer Canvas */}
        <div className="map-stage">
          <DeckSwitcher
            decks={CELEBRITY_XCEL_DECKS}
            currentDeck={currentDeck}
            onSelectDeck={(deck) => {
              setCurrentDeck(deck);
              setSelectedVenue(null);
            }}
          />

          <DeckMapViewer
            currentDeck={currentDeck}
            selectedVenue={selectedVenue}
            onSelectVenue={selectVenue}
            isUpscaledMode={isUpscaledMode}
            onToggleUpscale={toggleUpscale}
            activeRoute={activeRoute}
            activeFilter={activeFilter}
          />
        </div>
      </div>

      {/* Venue/Cabin Inspector Drawer */}
      {selectedVenue && (
        <CabinInspectorModal
          venue={selectedVenue}
          deck={currentDeck}
          onClose={() => setSelectedVenue(null)}
          onStartWayfinding={handleStartWayfinding}
        />
      )}

      {showApiInspector && (
        <ApiInspectorModal
          currentDeck={currentDeck}
          onClose={() => setShowApiInspector(false)}
        />
      )}

      {showAccuracyInspector && (
        <MultiSourceInspectorModal
          currentDeck={currentDeck}
          onClose={() => setShowAccuracyInspector(false)}
        />
      )}
    </div>
  );
}
