import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ZoomIn, ZoomOut, RotateCw, Sparkles, Compass } from 'lucide-react';

export default function DeckMapViewer({ 
  currentDeck, 
  selectedVenue, 
  onSelectVenue, 
  isUpscaledMode, 
  onToggleUpscale,
  activeRoute,
  onClearRoute,
  activeFilter
}) {
  const mapRef = useRef(null);
  const leafletInstance = useRef(null);
  const layerGroupRef = useRef(null);
  const routeLayerRef = useRef(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [lodLevel, setLodLevel] = useState(1);
  const [bearing, setBearing] = useState(0);

  // Initialize Leaflet Map (CRS.Simple for Vessel Cartesian Coordinates)
  useEffect(() => {
    if (mapRef.current && !leafletInstance.current) {
      const map = L.map(mapRef.current, {
        crs: L.CRS.Simple,
        minZoom: -1.5,
        maxZoom: 4,
        zoomControl: false,
        attributionControl: false,
        doubleClickZoom: false
      });

      layerGroupRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);

      map.on('zoomend moveend', () => {
        const z = map.getZoom();
        setCurrentZoom(z);
        if (z < 0.5) setLodLevel(0); // LOD 0: Macro Ship Overview
        else if (z < 2) setLodLevel(1); // LOD 1: Zone & Public Venues
        else setLodLevel(2); // LOD 2: Micro Stateroom Layout
      });

      leafletInstance.current = map;

      // Invalidate size after DOM layout computes
      setTimeout(() => {
        if (map && map._container) {
          map.invalidateSize();
          map.fitBounds([[-10, -10], [110, 337]], { padding: [30, 30] });
        }
      }, 100);

      // ResizeObserver to handle flex container & dock collapse resizes
      const resizeObserver = new ResizeObserver(() => {
        if (leafletInstance.current && leafletInstance.current._container) {
          leafletInstance.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  // Fit deck bounds & invalidate size when currentDeck changes
  useEffect(() => {
    if (leafletInstance.current && leafletInstance.current._container) {
      setTimeout(() => {
        if (leafletInstance.current && leafletInstance.current._container) {
          leafletInstance.current.invalidateSize();
          leafletInstance.current.fitBounds([[-10, -10], [110, 337]], { padding: [30, 30] });
        }
      }, 50);
    }
  }, [currentDeck]);

  // Render Deck Polygons and Venues with Dynamic Label Collision & LOD Filtering
  useEffect(() => {
    if (!leafletInstance.current || !currentDeck) return;

    const map = leafletInstance.current;
    const layerGroup = layerGroupRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();

    // 1. Draw Hull Silhouette Outer Frame
    if (currentDeck.shapeCoordinates && currentDeck.shapeCoordinates.length > 0) {
      const hullPoly = L.polygon(
        currentDeck.shapeCoordinates.map(([x, y]) => [y, x]),
        {
          color: isUpscaledMode ? '#00d9f5' : '#334155',
          weight: isUpscaledMode ? 3 : 2,
          fillColor: '#0c1527',
          fillOpacity: 0.85,
          dashArray: isUpscaledMode ? null : '4, 4'
        }
      );
      layerGroup.addLayer(hullPoly);
    }

    // Render Grid lines if Upscaled Mode is active
    if (isUpscaledMode) {
      for (let x = 20; x < 320; x += 20) {
        const line = L.polyline([[0, x], [100, x]], {
          color: 'rgba(0, 217, 245, 0.08)',
          weight: 1
        });
        layerGroup.addLayer(line);
      }
    }

    // 2. Render Venues / Cabins with Collision-free Label Engine
    if (currentDeck.venues && currentDeck.venues.length > 0) {
      // Filter venues according to category filter
      const filteredVenues = currentDeck.venues.filter(venue => {
        if (activeFilter === 'ALL') return true;
        const cat = venue.category.toUpperCase();
        if (activeFilter === 'MAGIC CARPET') return cat === 'MAGIC CARPET';
        if (activeFilter === 'FINE DINING') return cat === 'FINE DINING';
        if (activeFilter === 'BARS & LOUNGES') return cat === 'BARS & LOUNGES';
        if (activeFilter === 'STATEROOMS') return cat === 'STATEROOMS';
        if (activeFilter === 'SUITES') return cat === 'SUITES';
        if (activeFilter === 'ENTERTAINMENT') return cat === 'ENTERTAINMENT';
        if (activeFilter === 'POOL & SUN DECK') return cat === 'POOL & SUN DECK';
        return true;
      });

      // Render venue polygons first
      filteredVenues.forEach((venue) => {
        const [[x1, y1], [x2, y2]] = venue.bounds;
        const isSelected = selectedVenue && selectedVenue.id === venue.id;

        const venuePoly = L.rectangle([[y1, x1], [y2, x2]], {
          color: isSelected ? '#00d9f5' : venue.color,
          weight: isSelected ? 4 : (isUpscaledMode ? 2 : 1.5),
          fillColor: venue.color,
          fillOpacity: isSelected ? 0.65 : (isUpscaledMode ? 0.38 : 0.25),
          className: isUpscaledMode ? 'upscaled-vector-polygon' : ''
        });

        venuePoly.on('click', () => onSelectVenue(venue));

        venuePoly.bindTooltip(
          `<div style="font-family: Inter, sans-serif; padding: 4px 6px;">
            <strong style="color: #f8fafc; font-size: 13px;">${venue.name}</strong>
            <div style="color: #94a3b8; font-size: 11px;">${venue.category} • Deck ${currentDeck.level}</div>
          </div>`,
          {
            permanent: false,
            direction: 'top',
            className: 'leaflet-custom-tooltip'
          }
        );

        layerGroup.addLayer(venuePoly);
      });

      // Dynamic Label Collision Prevention Algorithm
      // Priority sorting: Selected > Public / Dining / Magic Carpet > Suites > Staterooms
      const prioritizedVenues = [...filteredVenues].sort((a, b) => {
        const isSelA = selectedVenue && selectedVenue.id === a.id ? 100 : 0;
        const isSelB = selectedVenue && selectedVenue.id === b.id ? 100 : 0;
        
        const getPrio = (v) => {
          if (v.category === 'Magic Carpet') return 90;
          if (v.category === 'Entertainment' || v.category === 'Fine Dining') return 80;
          if (v.category === 'Bars & Lounges' || v.category === 'Pool & Sun Deck') return 70;
          if (v.category === 'Suites') return 40;
          return 10;
        };

        return (getPrio(b) + isSelB) - (getPrio(a) + isSelA);
      });

      const placedLabelBoxes = [];

      prioritizedVenues.forEach((venue) => {
        const [centerX, centerY] = venue.center;
        const isSelected = selectedVenue && selectedVenue.id === venue.id;

        // At low zoom levels (LOD 0), hide individual stateroom text labels unless selected or high priority
        const isStateroom = venue.category === 'Staterooms';
        if (currentZoom < 1.0 && isStateroom && !isSelected) {
          return; // Skip label to prevent wall of text
        }

        // Defensive container point calculation
        let screenPt = { x: 0, y: 0 };
        try {
          const latLng = L.latLng(centerY, centerX);
          if (map && map._container) {
            screenPt = map.latLngToContainerPoint(latLng);
          }
        } catch (err) {
          screenPt = { x: 0, y: 0 };
        }

        // Approximate label width/height in pixels
        const approxWidth = venue.name.length * 7 + 24;
        const approxHeight = 24;

        const box = {
          left: screenPt.x - approxWidth / 2,
          top: screenPt.y - approxHeight / 2,
          right: screenPt.x + approxWidth / 2,
          bottom: screenPt.y + approxHeight / 2
        };

        // Check collision against already placed higher-priority labels
        let hasCollision = false;
        if (!isSelected && screenPt.x > 0) {
          for (const placed of placedLabelBoxes) {
            const overlapX = !(box.right < placed.left || box.left > placed.right);
            const overlapY = !(box.bottom < placed.top || box.top > placed.bottom);
            if (overlapX && overlapY) {
              hasCollision = true;
              break;
            }
          }
        }

        // If collision occurs on non-selected items, suppress text pill to keep map clean
        if (hasCollision && !isSelected) return;

        if (screenPt.x > 0) {
          placedLabelBoxes.push(box);
        }

        const labelIcon = L.divIcon({
          className: 'custom-venue-label-container',
          html: `
            <div class="custom-venue-label-pill" style="
              background: ${isSelected ? 'rgba(0, 217, 245, 0.95)' : 'rgba(10, 17, 30, 0.90)'};
              color: ${isSelected ? '#050914' : '#f8fafc'};
              border: 1px solid ${isSelected ? '#00d9f5' : 'rgba(255, 255, 255, 0.2)'};
            ">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${venue.color}; flex-shrink: 0;"></span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${venue.name}</span>
            </div>
          `,
          iconSize: [0, 0]
        });

        const labelMarker = L.marker([centerY, centerX], { icon: labelIcon });
        labelMarker.on('click', () => onSelectVenue(venue));
        layerGroup.addLayer(labelMarker);
      });
    }

  }, [currentDeck, selectedVenue, isUpscaledMode, activeFilter, currentZoom]);

  // Render Wayfinding Active Route Overlay
  useEffect(() => {
    if (!leafletInstance.current || !routeLayerRef.current) return;

    const routeGroup = routeLayerRef.current;
    routeGroup.clearLayers();

    if (activeRoute) {
      const isOriginDeck = activeRoute.origin.deck === currentDeck.level;
      const isDestDeck = activeRoute.destination.deck === currentDeck.level;

      if (isOriginDeck || isDestDeck) {
        const startPoint = isOriginDeck 
          ? [activeRoute.origin.coords[1], activeRoute.origin.coords[0]]
          : [activeRoute.destination.coords[1], activeRoute.destination.coords[0]];

        const endPoint = [startPoint[0], startPoint[1] + 40]; // Corridor path

        // Draw animated marching ant route line
        const polyline = L.polyline([startPoint, endPoint], {
          color: '#00d9f5',
          weight: 5,
          opacity: 0.95,
          className: 'leaflet-path-route'
        });
        routeGroup.addLayer(polyline);

        // Add Marker Pin for Start
        const pinIcon = L.divIcon({
          className: 'custom-pin-marker',
          html: `<div style="
            width: 32px; height: 32px; background: #00d9f5; color: #050914;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-weight: 800; box-shadow: 0 0 20px #00d9f5; transform: translate(-16px, -16px);
          ">📍</div>`
        });
        routeGroup.addLayer(L.marker(startPoint, { icon: pinIcon }));
      }
    }
  }, [activeRoute, currentDeck]);

  const handleZoomIn = () => leafletInstance.current?.zoomIn();
  const handleZoomOut = () => leafletInstance.current?.zoomOut();
  const handleResetView = () => {
    if (leafletInstance.current && leafletInstance.current._container) {
      leafletInstance.current.invalidateSize();
      leafletInstance.current.fitBounds([[-10, -10], [110, 337]], { padding: [30, 30] });
      setBearing(0);
    }
  };

  return (
    <div className="map-container">
      {/* Leaflet Canvas */}
      <div id="deck-map" ref={mapRef} />

      {/* Floating Toolbar Controls */}
      <div className="map-toolbar">
        <div className="toolbar-group">
          <button className="tool-btn" onClick={handleZoomIn} title="Zoom In (+)">
            <ZoomIn size={18} />
          </button>
          <button className="tool-btn" onClick={handleZoomOut} title="Zoom Out (-)">
            <ZoomOut size={18} />
          </button>
          <button className="tool-btn" onClick={handleResetView} title="Reset Deck View & Alignment">
            <RotateCw size={18} />
          </button>
        </div>

        {/* Compass Navigation Widget */}
        <div className="toolbar-group">
          <button className="tool-btn" onClick={handleResetView} title="Compass (Orient North)">
            <div className="compass-icon-wrapper" style={{ transform: `rotate(${-bearing}deg)` }}>
              <Compass size={18} color="var(--accent-cyan)" />
            </div>
          </button>
        </div>

        <div className="toolbar-group">
          <button 
            className={`tool-btn ${isUpscaledMode ? 'active' : ''}`}
            onClick={onToggleUpscale}
            title="Toggle AI Super-Resolution & Vector Upscale Mode"
          >
            <Sparkles size={18} />
          </button>
        </div>
      </div>

      {/* AI Upscale Telemetry Pill Indicator */}
      <div className="upscale-status-bar">
        <div className="status-badge-active">
          <span className="status-pulse"></span>
          {isUpscaledMode ? 'AI Real-ESRGAN Vector Layer (4x Upscaled)' : 'Standard CAD Vector Mode'}
        </div>
        <div style={{ fontSize: 'var(--text-size-micro)', color: 'var(--text-muted)', borderLeft: '1px solid var(--glass-border)', paddingLeft: '14px' }}>
          LOD Level: <strong style={{ color: 'var(--text-primary)' }}>LOD {lodLevel} ({currentZoom > 1.5 ? 'Micro Staterooms' : 'Deck Zone'})</strong>
        </div>
      </div>
    </div>
  );
}
