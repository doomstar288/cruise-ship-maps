import React, { useState } from 'react';
import { X, Code, Copy, Check, ShieldCheck, Database, Cpu, Download } from 'lucide-react';
import { CELEBRITY_XCEL_METADATA } from '../data/celebrityXcelData';

export default function ApiInspectorModal({ currentDeck, onClose, currentShip = CELEBRITY_XCEL_METADATA }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('GEOJSON'); // GEOJSON | OPENAPI | SDK

  const ship = currentShip ?? CELEBRITY_XCEL_METADATA;

  const mockGeoJson = {
    type: "FeatureCollection",
    crs: {
      type: "name",
      properties: { name: "urn:ogc:def:crs:EPSG::3857" }
    },
    shipMetadata: {
      name: ship.name,
      imo: ship.imoNumber,
      cruiseLine: ship.cruiseLine,
      deckLevel: currentDeck.level,
      deckName: currentDeck.name
    },
    features: currentDeck.venues.map((venue) => ({
      type: "Feature",
      id: venue.id,
      geometry: {
        type: "Polygon",
        coordinates: [[
          [venue.bounds[0][0], venue.bounds[0][1]],
          [venue.bounds[1][0], venue.bounds[0][1]],
          [venue.bounds[1][0], venue.bounds[1][1]],
          [venue.bounds[0][0], venue.bounds[1][1]],
          [venue.bounds[0][0], venue.bounds[0][1]]
        ]]
      },
      properties: {
        name: venue.name,
        category: venue.category,
        colorHex: venue.color,
        description: venue.description,
        tags: venue.tags || [],
        sqft: venue.sqft || null,
        adaAccessible: venue.ada || false
      }
    }))
  };

  const openApiSnippet = `openapi: 3.1.0
info:
  title: Open Cruise Ship Deck Plan API
  version: 1.0.0
  description: Standardized geospatial deck maps & GeoJSON API for trip planning apps.
paths:
  /v1/ships/${ship.id || 'celebrity-xcel'}/decks/${currentDeck.level}/geojson:
    get:
      summary: Retrieve GeoJSON FeatureCollection for ${currentDeck.name}
      responses:
        '200':
          description: Standard GeoJSON payload with vessel relative coordinates
          content:
            application/geo+json:
              schema:
                $ref: '#/components/schemas/DeckFeatureCollection'`;

  const sdkSnippet = `import { CruiseMapClient } from '@cruise-maps/sdk';

const client = new CruiseMapClient({ apiKey: 'cm_live_open_access' });

// Fetch GeoJSON for ${ship.name} Deck ${currentDeck.level}
const deckMap = await client.ships.getDeckGeoJSON({
  shipId: '${ship.id || 'celebrity-xcel'}',
  deckLevel: ${currentDeck.level},
  upscaleQuality: 'REAL_ESRGAN_4X'
});

console.log(\`Loaded \${deckMap.features.length} venues on \${deckMap.shipMetadata.deckName}\`);`;

  const handleCopy = () => {
    let textToCopy = JSON.stringify(mockGeoJson, null, 2);
    if (activeTab === 'OPENAPI') textToCopy = openApiSnippet;
    if (activeTab === 'SDK') textToCopy = sdkSnippet;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadGeoJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mockGeoJson, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `celebrity_xcel_deck_${currentDeck.level}.geojson`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-api-title">
      <div className="modal-card" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="brand-icon" style={{ width: '40px', height: '40px' }}>
              <Code size={20} />
            </div>
            <div>
              <h3 id="modal-api-title" style={{ fontSize: 'var(--text-size-h2)', color: 'var(--text-primary)', fontWeight: 700 }}>Open API & GeoJSON Inspector</h3>
              <div style={{ fontSize: 'var(--text-size-body-sm)', color: 'var(--text-secondary)' }}>
                Targeting Endpoint: <code style={{ color: 'var(--accent-cyan)' }}>GET /v1/ships/celebrity-xcel/decks/{currentDeck.level}/geojson</code>
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close API Inspector Modal">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', gap: '12px' }} role="tablist">
            <button 
              className={`filter-chip ${activeTab === 'GEOJSON' ? 'active' : ''}`}
              onClick={() => setActiveTab('GEOJSON')}
              role="tab"
              aria-selected={activeTab === 'GEOJSON'}
              style={{ borderRadius: '8px 8px 0 0', borderBottom: activeTab === 'GEOJSON' ? '2px solid var(--accent-cyan)' : 'none' }}
            >
              <Database size={14} /> GeoJSON Payload ({mockGeoJson.features.length} Features)
            </button>
            <button 
              className={`filter-chip ${activeTab === 'OPENAPI' ? 'active' : ''}`}
              onClick={() => setActiveTab('OPENAPI')}
              role="tab"
              aria-selected={activeTab === 'OPENAPI'}
              style={{ borderRadius: '8px 8px 0 0', borderBottom: activeTab === 'OPENAPI' ? '2px solid var(--accent-cyan)' : 'none' }}
            >
              <ShieldCheck size={14} /> OpenAPI 3.1 Spec
            </button>
            <button 
              className={`filter-chip ${activeTab === 'SDK' ? 'active' : ''}`}
              onClick={() => setActiveTab('SDK')}
              role="tab"
              aria-selected={activeTab === 'SDK'}
              style={{ borderRadius: '8px 8px 0 0', borderBottom: activeTab === 'SDK' ? '2px solid var(--accent-cyan)' : 'none' }}
            >
              <Cpu size={14} /> TS/JS SDK Usage
            </button>
          </div>

          {/* Code Viewer Panel */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: '14px', top: '14px', display: 'flex', gap: '8px', zIndex: 10 }}>
              {activeTab === 'GEOJSON' && (
                <button 
                  className="btn-glass" 
                  onClick={handleDownloadGeoJson}
                  style={{ minHeight: '34px', padding: '4px 12px', fontSize: 'var(--text-size-body-sm)' }}
                >
                  <Download size={14} color="var(--accent-gold)" /> Export .geojson
                </button>
              )}

              <button 
                className="btn-glass" 
                onClick={handleCopy}
                style={{ minHeight: '34px', padding: '4px 12px', fontSize: 'var(--text-size-body-sm)' }}
              >
                {copied ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                {copied ? 'Copied to Clipboard' : 'Copy Code'}
              </button>
            </div>

            <pre className="code-block" style={{ maxHeight: '380px', overflowY: 'auto' }}>
              {activeTab === 'GEOJSON' && JSON.stringify(mockGeoJson, null, 2)}
              {activeTab === 'OPENAPI' && openApiSnippet}
              {activeTab === 'SDK' && sdkSnippet}
            </pre>
          </div>

          <div style={{ fontSize: 'var(--text-size-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
            <span>⚡ Ready for direct ingestion into external trip planning applications.</span>
            <span style={{ color: 'var(--accent-gold-light)', fontWeight: 600 }}>Open License: MIT / OGC GeoJSON</span>
          </div>
        </div>
      </div>
    </div>
  );
}

