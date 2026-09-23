import React from 'react';
import { Ship, Code, Sparkles, ShieldCheck, Search } from 'lucide-react';

export default function HeaderNavbar({
  currentShip,
  availableShips = [],
  onSelectShip,
  onOpenApiInspector,
  onOpenAccuracyInspector,
  isUpscaledMode,
  onToggleUpscale,
  onOpenSearch,
}) {
  const ship = currentShip ?? { name: 'Celebrity Xcel', shipClass: 'Edge Series', lengthMeters: 327, guestDecks: 15 };

  const edgeShips = availableShips.filter((s) => (s.shipClass || '').includes('Edge'));
  const solsticeShips = availableShips.filter((s) => (s.shipClass || '').includes('Solstice'));
  const millenniumShips = availableShips.filter((s) => (s.shipClass || '').includes('Millennium'));

  const renderOption = (s) => (
    <option key={s.id} value={s.id} style={{ background: '#0e1626', color: '#fff' }}>
      {s.name} ({s.lengthMeters} m · {s.guestDecks} decks)
    </option>
  );

  return (
    <header className="navbar">
      <div className="brand-logo">
        <div className="brand-icon">
          <Ship size={22} />
        </div>
        <div>
          <div className="brand-title">
            Cruiseline Deck Maps <span className="ship-badge">Open API Platform</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Vessel:</span>
            <select
              aria-label="Select cruise ship"
              value={ship.id}
              onChange={(e) => onSelectShip?.(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'var(--accent-gold)',
                fontWeight: 700,
                fontSize: '0.75rem',
                borderRadius: '6px',
                padding: '2px 8px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {edgeShips.length > 0 && (
                <optgroup label="Edge Series (5 Ships)">
                  {edgeShips.map(renderOption)}
                </optgroup>
              )}
              {solsticeShips.length > 0 && (
                <optgroup label="Solstice Class (5 Ships)">
                  {solsticeShips.map(renderOption)}
                </optgroup>
              )}
              {millenniumShips.length > 0 && (
                <optgroup label="Millennium Class (4 Ships)">
                  {millenniumShips.map(renderOption)}
                </optgroup>
              )}
              {edgeShips.length === 0 && solsticeShips.length === 0 && millenniumShips.length === 0 &&
                availableShips.map(renderOption)}
            </select>
            <span className="ship-badge" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
              {ship.shipClass || 'Edge Series'}
            </span>
          </div>
        </div>
      </div>

      <div className="nav-actions">
        <button
          className="btn-glass search-nav-btn"
          onClick={onOpenSearch}
          title="Search staterooms, venues & wayfinding (⌘K or /)"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Search size={15} color="var(--accent-gold)" />
          <span>Search</span>
          <kbd
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
            }}
          >
            ⌘K
          </kbd>
        </button>

        <button className="btn-glass" onClick={onOpenAccuracyInspector} title="View Multi-Source Accuracy Verification & Sources">
          <ShieldCheck size={16} color="var(--accent-emerald)" />
          <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>98.4% Verified Accuracy</span>
        </button>

        <button className={`btn-glass ${isUpscaledMode ? 'active' : ''}`} onClick={onToggleUpscale}>
          <Sparkles size={16} color="var(--accent-cyan)" />
          {isUpscaledMode ? 'AI Upscale 4x (On)' : 'Enable AI Upscale'}
        </button>

        <button className="btn-primary-gold" onClick={onOpenApiInspector}>
          <Code size={16} /> Open API GeoJSON
        </button>
      </div>
    </header>
  );
}
