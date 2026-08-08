import React from 'react';
import { Ship, Code, Sparkles, ShieldCheck } from 'lucide-react';
import { CELEBRITY_XCEL_METADATA } from '../data/celebrityXcelData';

export default function HeaderNavbar({ onOpenApiInspector, onOpenAccuracyInspector, isUpscaledMode, onToggleUpscale }) {
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
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Active Vessel: <strong style={{ color: 'var(--accent-gold)' }}>{CELEBRITY_XCEL_METADATA.name}</strong> ({CELEBRITY_XCEL_METADATA.shipClass})
          </div>
        </div>
      </div>

      <div className="nav-actions">
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
