import React, { useCallback, useMemo, useState } from 'react';
import HeaderNavbar from './components/HeaderNavbar';
import DeckSwitcher from './components/DeckSwitcher';
import DeckMapViewer from './components/DeckMapViewer';
import CabinInspectorModal from './components/CabinInspectorModal';
import ApiInspectorModal from './components/ApiInspectorModal';
import MultiSourceInspectorModal from './components/MultiSourceInspectorModal';
import RouteBuilderPanel from './components/RouteBuilderPanel';
import SearchCommandPalette from './components/SearchCommandPalette';
import { AVAILABLE_SHIPS, generateShip } from './utils/shipGenerator';
import { getSampleRoutesForShip, routeOnShip } from './data/fleetRouting';
import { VENUE_COLORS } from './utils/deckPlanDataPipeline';
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

const startsCollapsed = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1024px)').matches;

export default function App() {
  const [selectedShipId, setSelectedShipId] = useState('celebrity-xcel');
  const shipData = useMemo(() => generateShip(selectedShipId), [selectedShipId]);
  const currentShip = shipData.metadata;
  const shipDecks = shipData.decks;

  const [currentDeckLevel, setCurrentDeckLevel] = useState(5);
  const currentDeck = useMemo(() => {
    return (
      shipDecks.find((d) => d.level === currentDeckLevel) ||
      shipDecks.find((d) => d.level === 5) ||
      shipDecks[0]
    );
  }, [shipDecks, currentDeckLevel]);

  const [selectedVenue, setSelectedVenue] = useState(null);
  const [isUpscaledMode, setIsUpscaledMode] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showApiInspector, setShowApiInspector] = useState(false);
  const [showAccuracyInspector, setShowAccuracyInspector] = useState(false);
  const [isSearchPaletteOpen, setIsSearchPaletteOpen] = useState(false);
  const [routeSpec, setRouteSpec] = useState(null);
  const [stepFree, setStepFree] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(startsCollapsed);

  const allVenuesList = useMemo(
    () =>
      shipDecks.flatMap((d) =>
        d.venues.filter((v) => !v.hideLabel).map((v) => ({ ...v, deck: d }))
      ),
    [shipDecks]
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

  const sampleRoutes = useMemo(
    () => getSampleRoutesForShip(selectedShipId, shipDecks, { stepFree }),
    [selectedShipId, shipDecks, stepFree]
  );

  // Re-routed when ship, step-free toggle, or spec changes; null when an end isn't routable.
  const activeRoute = useMemo(() => {
    if (!routeSpec) return null;
    try {
      return routeOnShip(selectedShipId, shipDecks, routeSpec, { stepFree });
    } catch {
      return null;
    }
  }, [selectedShipId, shipDecks, routeSpec, stepFree]);

  const selectVenue = useCallback((venue) => setSelectedVenue(venue), []);
  const toggleUpscale = useCallback(() => setIsUpscaledMode((on) => !on), []);

  const goToDeck = useCallback((level) => {
    setCurrentDeckLevel(level);
  }, []);

  const handleSelectShip = (newShipId) => {
    if (newShipId === selectedShipId) return;
    setSelectedShipId(newShipId);
    const newShipData = generateShip(newShipId);
    const defaultDeck = newShipData.decks.find((d) => d.level === 5) || newShipData.decks[0];
    setCurrentDeckLevel(defaultDeck.level);
    setSelectedVenue(null);
    setSearchQuery('');
    setRouteSpec(null);
  };

  const handleSelectSearchResult = (item) => {
    setCurrentDeckLevel(item.deck.level);
    setSelectedVenue(item);
    setSearchQuery('');
  };

  const handleStartWayfinding = (venue) => {
    const targetDeck = venue.deckNumber || currentDeck.level;
    const spec = {
      id: `to-${venue.id}`,
      from: { deck: currentDeck.level },
      to: { deck: targetDeck, venueId: venue.id },
    };
    try {
      routeOnShip(selectedShipId, shipDecks, spec, { stepFree });
    } catch {
      // Crew space and other features off the routing graph have no route.
      setRouteSpec(null);
      return;
    }
    setRouteSpec(spec);
    setSelectedVenue(null);
    setIsDockCollapsed(false);
  };

  const handleRouteFromHere = (venue) => {
    const fromDeck = venue.deckNumber || currentDeck.level;
    setRouteSpec((prev) => ({
      id: `from-${venue.id}`,
      from: { deck: fromDeck, venueId: venue.id },
      to: prev?.to ?? null,
    }));
    setSelectedVenue(null);
    setIsDockCollapsed(false);
  };

  const handleSearchSelectVenue = useCallback((venue) => {
    const deckLvl = venue.deckNumber ?? venue.deckLevel ?? venue.deck?.level;
    if (deckLvl) {
      setCurrentDeckLevel(deckLvl);
    }
    setSelectedVenue(venue);
    setIsSearchPaletteOpen(false);
  }, []);

  const handleSearchRouteToVenue = useCallback((venue) => {
    const targetDeck = venue.deckNumber ?? venue.deckLevel ?? venue.deck?.level ?? currentDeck.level;
    setCurrentDeckLevel(targetDeck);
    setSelectedVenue(venue);
    setRouteSpec({
      id: `to-${venue.id}`,
      from: { deck: currentDeck.level },
      to: { deck: targetDeck, venueId: venue.id },
    });
    setIsSearchPaletteOpen(false);
    setIsDockCollapsed(false);
  }, [currentDeck.level]);

  const handleSearchGoToDeck = useCallback((deckLevel) => {
    setCurrentDeckLevel(deckLevel);
    setSelectedVenue(null);
    setIsSearchPaletteOpen(false);
  }, []);

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <HeaderNavbar
        currentShip={currentShip}
        availableShips={AVAILABLE_SHIPS}
        onSelectShip={handleSelectShip}
        onOpenApiInspector={() => setShowApiInspector(true)}
        onOpenAccuracyInspector={() => setShowAccuracyInspector(true)}
        isUpscaledMode={isUpscaledMode}
        onToggleUpscale={toggleUpscale}
        onOpenSearch={() => setIsSearchPaletteOpen(true)}
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
                IMO {currentShip.imoNumber}
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

                {/* Wayfinding & Custom Route Builder */}
                <div>
                  <div className="filter-section-title">Wayfinding & Routes</div>
                  <RouteBuilderPanel
                    decks={shipDecks}
                    currentDeck={currentDeck}
                    activeRoute={activeRoute}
                    routeSpec={routeSpec}
                    onBuildRoute={(spec) => {
                      setRouteSpec(spec);
                      setIsDockCollapsed(false);
                    }}
                    onClearRoute={() => setRouteSpec(null)}
                    stepFree={stepFree}
                    onToggleStepFree={(sf) => setStepFree(sf)}
                    onGoToDeck={goToDeck}
                  />

                  {/* Preset Sample Routes */}
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Popular Routes
                    </div>
                    <div className="search-results-list">
                      {sampleRoutes.map((route) => (
                        <button
                          key={route.id}
                          className={`search-result-card ${activeRoute?.id === route.id ? 'active' : ''}`}
                          onClick={() => {
                            goToDeck(route.origin.deck);
                            setRouteSpec(route.spec);
                          }}
                        >
                          <div style={{ textAlign: 'left' }}>
                            <div className="res-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Navigation size={14} color="var(--accent-cyan)" /> {route.name}
                            </div>
                            <div className="res-sub">
                              Deck {route.origin.deck} → Deck {route.destination.deck} • ~{route.estimatedMinutes} min
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
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
                    {currentShip.name} ({currentShip.shipClass})
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '6px' }}>
                    <span>Length: <strong>{currentShip.lengthMeters} m</strong></span>
                    <span>Beam: <strong>{currentShip.beamMeters} m</strong></span>
                    <span>Guests: <strong>{(currentShip.maxPassengers || 3200).toLocaleString()}</strong></span>
                    <span>Guest decks: <strong>{currentShip.guestDecks}</strong></span>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Center Interactive Map Viewer Canvas */}
        <div className="map-stage">
          <DeckSwitcher
            decks={shipDecks}
            currentDeck={currentDeck}
            onSelectDeck={(deck) => {
              setCurrentDeckLevel(deck.level);
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
          onRouteFromHere={handleRouteFromHere}
        />
      )}

      {showApiInspector && (
        <ApiInspectorModal
          currentDeck={currentDeck}
          currentShip={currentShip}
          onClose={() => setShowApiInspector(false)}
        />
      )}

      {showAccuracyInspector && (
        <MultiSourceInspectorModal
          currentDeck={currentDeck}
          currentShip={currentShip}
          onClose={() => setShowAccuracyInspector(false)}
        />
      )}

      {/* Global Search & Command Palette (Cmd+K / /) */}
      <SearchCommandPalette
        isOpen={isSearchPaletteOpen}
        onClose={() => setIsSearchPaletteOpen(false)}
        onOpen={() => setIsSearchPaletteOpen(true)}
        currentShip={currentShip}
        shipDecks={shipDecks}
        availableShips={AVAILABLE_SHIPS}
        onSelectShip={(shipId) => {
          handleSelectShip(shipId);
          setIsSearchPaletteOpen(false);
        }}
        onSelectVenue={handleSearchSelectVenue}
        onRouteToVenue={handleSearchRouteToVenue}
        onGoToDeck={handleSearchGoToDeck}
      />
    </div>
  );
}
