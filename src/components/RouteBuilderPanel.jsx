import React, { useMemo, useState } from 'react';
import { Navigation, ArrowUpDown, X } from 'lucide-react';

export default function RouteBuilderPanel({
  decks,
  currentDeck,
  activeRoute,
  routeSpec,
  onBuildRoute,
  onClearRoute,
  stepFree,
  onToggleStepFree,
  onGoToDeck,
}) {
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');

  // deckChanges is the list of lift/stair hops on the route, not a count.
  const deckChangeCount = activeRoute?.deckChanges?.length ?? 0;

  // All routable items: cabins and venues across all decks
  const routableItems = useMemo(() => {
    return decks.flatMap((d) =>
      d.venues
        .filter((v) => !v.hideLabel && (v.featureType === 'venue' || v.category === 'Staterooms' || v.category === 'Suites'))
        .map((v) => ({ ...v, deckNumber: d.level, deckName: d.shortName }))
    );
  }, [decks]);

  const selectedFrom = useMemo(() => {
    if (!routeSpec?.from?.venueId) return null;
    return routableItems.find((item) => item.id === routeSpec.from.venueId) || null;
  }, [routableItems, routeSpec]);

  const selectedTo = useMemo(() => {
    if (!routeSpec?.to?.venueId) return null;
    return routableItems.find((item) => item.id === routeSpec.to.venueId) || null;
  }, [routableItems, routeSpec]);

  const filteredFromList = useMemo(() => {
    const q = fromQuery.trim().toLowerCase();
    if (!q) return [];
    return routableItems
      .filter((item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
      .slice(0, 10);
  }, [routableItems, fromQuery]);

  const filteredToList = useMemo(() => {
    const q = toQuery.trim().toLowerCase();
    if (!q) return [];
    return routableItems
      .filter((item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
      .slice(0, 10);
  }, [routableItems, toQuery]);

  const handleSelectFrom = (item) => {
    setFromQuery('');
    const targetTo = selectedTo;
    onBuildRoute({
      id: `custom-${item ? item.id : 'elevators'}-to-${targetTo ? targetTo.id : 'destination'}`,
      from: item ? { deck: item.deckNumber, venueId: item.id } : { deck: currentDeck.level },
      to: targetTo ? { deck: targetTo.deckNumber, venueId: targetTo.id } : null,
    });
  };

  const handleSelectTo = (item) => {
    setToQuery('');
    onBuildRoute({
      id: `custom-${selectedFrom ? selectedFrom.id : 'elevators'}-to-${item.id}`,
      from: selectedFrom ? { deck: selectedFrom.deckNumber, venueId: selectedFrom.id } : { deck: currentDeck.level },
      to: { deck: item.deckNumber, venueId: item.id },
    });
  };

  const handleSwap = () => {
    if (selectedFrom && selectedTo) {
      onBuildRoute({
        id: `custom-${selectedTo.id}-to-${selectedFrom.id}`,
        from: { deck: selectedTo.deckNumber, venueId: selectedTo.id },
        to: { deck: selectedFrom.deckNumber, venueId: selectedFrom.id },
      });
    }
  };

  const handleClear = () => {
    setFromQuery('');
    setToQuery('');
    onClearRoute();
  };

  return (
    <div className="route-builder-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Navigation size={14} /> Custom Wayfinding
        </div>
        {(selectedFrom || selectedTo || activeRoute) && (
          <button
            onClick={handleClear}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Clear route"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* From / To Inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
        {/* From Picker */}
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Start Point (Origin):</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="text"
              className="search-input"
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
              placeholder={selectedFrom ? selectedFrom.name : `Nearest Elevators (Deck ${currentDeck.level})`}
              value={fromQuery}
              onChange={(e) => setFromQuery(e.target.value)}
            />
            {selectedFrom && (
              <button
                type="button"
                onClick={() => handleSelectFrom(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                title="Reset to nearest elevators"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {filteredFromList.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#18202c', border: '1px solid #2d3b4d', zIndex: 100, borderRadius: '6px', maxHeight: '160px', overflowY: 'auto', marginTop: '2px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
              <div
                style={{ padding: '6px 8px', fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #2d3b4d', color: 'var(--accent-cyan)' }}
                onClick={() => handleSelectFrom(null)}
              >
                📍 Nearest Elevators (Deck {currentDeck.level})
              </div>
              {filteredFromList.map((item) => (
                <div
                  key={item.id}
                  style={{ padding: '6px 8px', fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}
                  onClick={() => handleSelectFrom(item)}
                >
                  <strong>{item.name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({item.deckName})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Swap Button */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={handleSwap}
            disabled={!selectedFrom || !selectedTo}
            style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: selectedFrom && selectedTo ? 'pointer' : 'default', opacity: selectedFrom && selectedTo ? 1 : 0.4 }}
            title="Swap Origin and Destination"
          >
            <ArrowUpDown size={12} />
          </button>
        </div>

        {/* To Picker */}
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Destination:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="text"
              className="search-input"
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px 8px' }}
              placeholder={selectedTo ? selectedTo.name : 'Choose venue or cabin…'}
              value={toQuery}
              onChange={(e) => setToQuery(e.target.value)}
            />
            {selectedTo && (
              <button
                type="button"
                onClick={() => {
                  setToQuery('');
                  onBuildRoute({
                    id: `custom-${selectedFrom ? selectedFrom.id : 'elevators'}`,
                    from: selectedFrom ? { deck: selectedFrom.deckNumber, venueId: selectedFrom.id } : { deck: currentDeck.level },
                    to: null,
                  });
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                title="Clear destination"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {filteredToList.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#18202c', border: '1px solid #2d3b4d', zIndex: 100, borderRadius: '6px', maxHeight: '160px', overflowY: 'auto', marginTop: '2px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
              {filteredToList.map((item) => (
                <div
                  key={item.id}
                  style={{ padding: '6px 8px', fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}
                  onClick={() => handleSelectTo(item)}
                >
                  <strong>{item.name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({item.deckName})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step Free Toggle */}
      <label className="step-free-toggle" style={{ margin: 0, fontSize: '0.75rem' }}>
        <input type="checkbox" checked={stepFree} onChange={(e) => onToggleStepFree(e.target.checked)} />
        Step-free mode (elevators only, avoid stairs)
      </label>

      {/* Active Route Results & Turn-by-Turn Stepper */}
      {activeRoute && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          {/* Route Metrics Card */}
          <div style={{ background: 'rgba(34, 211, 238, 0.08)', border: '1px solid rgba(34, 211, 238, 0.25)', borderRadius: '8px', padding: '10px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', marginBottom: '4px' }}>
              Calculated Route
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {activeRoute.name}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span>🚶 <strong>{activeRoute.distanceMeters} m</strong></span>
              <span>⏱️ <strong>~{activeRoute.estimatedMinutes} min</strong></span>
              <span>↕️ <strong>{deckChangeCount === 0 ? 'Single Deck' : `${deckChangeCount} Deck Change${deckChangeCount > 1 ? 's' : ''}`}</strong></span>
            </div>
          </div>

          {/* Turn-by-turn Step List */}
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>
            Turn-by-Turn Directions ({activeRoute.steps.length} steps)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
            {activeRoute.steps.map((step, idx) => {
              const isLast = idx === activeRoute.steps.length - 1;
              const isVertical = step.includes('elevator') || step.includes('stairs');

              // Extract deck number if mentioned in step (e.g. "Deck 4")
              const deckMatch = step.match(/Deck\s+(\d+)/i);
              const stepDeck = deckMatch ? Number(deckMatch[1]) : null;

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    background: isLast ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: isLast ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)',
                    padding: '8px',
                    borderRadius: '6px',
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: isLast ? 'var(--accent-emerald)' : isVertical ? 'var(--accent-gold)' : 'var(--accent-cyan)',
                      color: '#0a0f18',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {isLast ? '✓' : idx + 1}
                  </div>
                  <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {step}
                  </div>
                  {stepDeck && stepDeck !== currentDeck.level && (
                    <button
                      onClick={() => onGoToDeck(stepDeck)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.65rem',
                        color: 'var(--accent-cyan)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                      title={`Switch view to Deck ${stepDeck}`}
                    >
                      Deck {stepDeck}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
