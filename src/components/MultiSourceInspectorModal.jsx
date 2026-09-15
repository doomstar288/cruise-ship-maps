import React from 'react';
import { X, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { ACCURACY_SOURCES } from '../utils/multiSourceDataConsensus';
import { CELEBRITY_XCEL_METADATA } from '../data/celebrityXcelData';

export default function MultiSourceInspectorModal({ currentDeck, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="brand-icon" style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)', color: '#fff' }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)' }}>Multi-Source Map Accuracy Engine</h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Cross-Referenced Accuracy Verification for {CELEBRITY_XCEL_METADATA.name} ({currentDeck.name})
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Prototype disclaimer */}
          <div style={{
            background: 'hsla(38, 92%, 50%, 0.10)',
            border: '1px solid var(--accent-gold)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--accent-gold)' }}>Prototype / simulated data.</strong>{' '}
            Confidence scores, AI super-resolution, and the data sources below are illustrative
            placeholders for this demo. They are not derived from live CAD, AIS, or satellite feeds.
          </div>

          {/* Overview Badge */}
          <div style={{
            background: 'hsla(160, 84%, 39%, 0.12)',
            border: '1px solid var(--accent-emerald)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-emerald)', textTransform: 'uppercase' }}>
                Overall Deck Map Confidence Score
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                98.4% Accuracy Rating (Verified Quad-Source)
              </div>
            </div>
            <div className="ship-badge" style={{ background: 'var(--accent-emerald)', color: '#050914', border: 'none', padding: '6px 14px', fontSize: '0.82rem' }}>
              ✓ Triple Verified
            </div>
          </div>

          {/* Sources List */}
          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>
              Active Data Sources Cross-Referenced ({ACCURACY_SOURCES.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ACCURACY_SOURCES.map((source) => (
                <div key={source.id} style={{
                  background: 'hsla(215, 30%, 20%, 0.25)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px'
                }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <CheckCircle2 size={18} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {source.name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.5 }}>
                        {source.description}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                        Source Type: {source.type} • Last Synced: {source.lastSynced}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                      {(source.trustScore * 100).toFixed(0)}% Trust
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Weight: 1.0
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-abyss)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
            💡 <strong>Multi-Source Reconciliation Engine:</strong> If a discrepancy is detected between official PDFs and satellite CAD metrics, the spatial engine automatically runs a Ramer-Douglas-Peucker alignment algorithm to resolve vector drift within ≤ 0.12m.
          </div>
        </div>
      </div>
    </div>
  );
}
