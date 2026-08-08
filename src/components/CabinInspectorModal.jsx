import React from 'react';
import { X, Navigation, Sparkles, CheckCircle2 } from 'lucide-react';
import { calculateSourceConsensus } from '../utils/multiSourceDataConsensus';

export default function CabinInspectorModal({ venue, deck, onClose, onStartWayfinding }) {
  if (!venue) return null;

  const isStateroom = venue.category === 'Staterooms' || venue.category === 'Suites';
  const isMagicCarpet = venue.category === 'Magic Carpet';
  const consensus = calculateSourceConsensus(venue.id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: venue.color,
              boxShadow: `0 0 12px ${venue.color}`
            }}></span>
            <div>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)' }}>{venue.name}</h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {deck.name} • Grid Coordinates: [{venue.center[0]}m Bow, {venue.center[1]}m Port]
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
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
              <CheckCircle2 size={16} /> Multi-Source Accuracy Verified
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 800 }}>
              {(consensus.confidenceScore * 100).toFixed(0)}% Confidence ({consensus.sourcesCount} Sources)
            </span>
          </div>

          {/* Key Metric Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <span className="ship-badge" style={{ background: 'rgba(0,217,245,0.1)', borderColor: '#00d9f5', color: '#00d9f5' }}>
              {venue.category}
            </span>

            {isStateroom && venue.sqft && (
              <span className="ship-badge" style={{ background: 'rgba(245,158,11,0.1)', borderColor: '#f59e0b', color: '#f59e0b' }}>
                📐 {venue.sqft} sq ft {venue.verandaSqft ? `(+${venue.verandaSqft} sq ft Veranda)` : ''}
              </span>
            )}

            {isStateroom && venue.ada && (
              <span className="ship-badge" style={{ background: 'rgba(20,184,166,0.15)', borderColor: '#14b8a6', color: '#14b8a6' }}>
                ♿ ADA Accessible (Roll-in Shower)
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
              Venue Specification & Details
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
              🔗 <strong>Connecting Stateroom Door:</strong> Direct access to Stateroom {venue.connecting}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <button className="btn-primary-gold" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onStartWayfinding(venue)}>
              <Navigation size={16} /> Route Wayfinding to Venue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
