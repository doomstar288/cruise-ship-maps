import React, { useEffect } from 'react';
import { X, Navigation, Sparkles, CheckCircle2, MapPin } from 'lucide-react';
import { calculateSourceConsensus } from '../utils/multiSourceDataConsensus';
import { describeLocation } from '../utils/deckPlanDataPipeline';

export default function CabinInspectorModal({ venue, deck, onClose, onStartWayfinding, onRouteFromHere }) {
  // Escape closes the drawer; the map behind it stays usable.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!venue) return null;

  const isStateroom = venue.category === 'Staterooms' || venue.category === 'Suites';
  const isMagicCarpet = venue.category === 'Magic Carpet';
  const consensus = calculateSourceConsensus(venue.id);

  return (
    <div className="modal-overlay drawer">
      <div className="modal-card" role="dialog" aria-modal="false" aria-labelledby="venue-inspector-title">
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: venue.color,
              boxShadow: `0 0 12px ${venue.color}`,
              flexShrink: 0
            }}></span>
            <div>
              <h3 id="venue-inspector-title" style={{ fontSize: '1.15rem', color: 'var(--text-primary)' }}>{venue.name}</h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={12} /> Deck {deck.level} · {describeLocation(venue.center)}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Multi-source accuracy verification pill */}
          <div style={{
            background: 'hsla(160, 84%, 39%, 0.12)',
            border: '1px solid var(--accent-emerald)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
              <CheckCircle2 size={16} />
              <span>Multi-Source Verified: {consensus.confidence}</span>
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{consensus.sourcesAgreed}/{consensus.sourcesChecked} sources</span>
          </div>

          {/* Subheader Badges */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className="ship-badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
              {venue.category}
            </span>

            {isStateroom && venue.sqft && (
              <span className="ship-badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
                📐 {venue.sqft} sq ft {venue.verandaSqft ? `(+{venue.verandaSqft} veranda)` : ''}
              </span>
            )}

            {isStateroom && venue.side && (
              <span className="ship-badge" style={{ background: 'rgba(255,255,255,0.06)' }}>
                Side: {venue.side}
              </span>
            )}

            {isStateroom && venue.ada && (
              <span className="ship-badge" style={{ background: 'rgba(20,184,166,0.15)', borderColor: '#14b8a6', color: '#14b8a6' }}>
                ♿ Accessible
              </span>
            )}

            {isMagicCarpet && (
              <span className="ship-badge" style={{ background: 'rgba(234,179,8,0.2)', borderColor: '#eab308', color: '#eab308' }}>
                ✨ Cantilevered Floating Platform
              </span>
            )}
          </div>

          {/* Description */}
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              About
            </h4>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {venue.description}
            </p>
          </div>

          {/* Tags */}
          {venue.tags && venue.tags.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Features & Amenities
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {venue.tags.map((tag, idx) => (
                  <span key={idx} className="filter-chip" style={{ cursor: 'default' }}>
                    <Sparkles size={12} color="var(--accent-cyan)" /> {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stateroom specific attributes */}
          {isStateroom && venue.connecting && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              🔗 <strong>Connecting stateroom:</strong> {venue.connecting}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              className="btn-primary-gold"
              style={{ flex: 1, justifyContent: 'center', fontSize: '0.82rem', padding: '8px' }}
              onClick={() => onStartWayfinding(venue)}
              title="Calculate route to this venue from elevators"
            >
              <Navigation size={14} /> Route To Here
            </button>
            {onRouteFromHere && (
              <button
                className="btn-glass"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.82rem', padding: '8px' }}
                onClick={() => onRouteFromHere(venue)}
                title="Set as start point for custom wayfinding"
              >
                <Navigation size={14} color="var(--accent-cyan)" /> Start From Here
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
