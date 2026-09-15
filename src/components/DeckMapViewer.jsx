import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ZoomIn, ZoomOut, RotateCw, Sparkles, Compass } from 'lucide-react';
import { venueMatchesFilter, getLabelPriority, isStateroom } from '../utils/venueTaxonomy';

// Padding (px) reserved so fit-to-bounds never tucks the deck under the
// floating overlays: the deck switcher (top-left) and the toolbar / status bar.
const FIT_PADDING_TOP_LEFT = [270, 48];
const FIT_PADDING_BOTTOM_RIGHT = [96, 96];

export default function DeckMapViewer({
  currentDeck,
  selectedVenue,
  onSelectVenue,
  isUpscaledMode,
  onToggleUpscale,
  activeRoute,
  activeFilter,
}) {
  const mapRef = useRef(null);
  const leafletInstance = useRef(null);
  const geometryLayerRef = useRef(null);
  const labelLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  // Bounds of the deck currently drawn, so resizes and the reset button can
  // re-fit without recomputing from scratch, and so we only auto-fit on a
  // genuine deck change (not on every filter toggle or label refresh).
  const deckBoundsRef = useRef(null);
  const fittedDeckRef = useRef(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [lodLevel, setLodLevel] = useState(1);
  const [bearing, setBearing] = useState(0);

  const fitToDeck = (map, bounds) => {
    // Bail if the map was torn down (e.g. StrictMode remount) or has no extent.
    if (!map || map !== leafletInstance.current || !map._container || !map._mapPane) return;
    if (!bounds || !bounds.isValid()) return;
    map.invalidateSize();
    map.fitBounds(bounds, {
      paddingTopLeft: FIT_PADDING_TOP_LEFT,
      paddingBottomRight: FIT_PADDING_BOTTOM_RIGHT,
      animate: false,
    });
  };

  // Initialize Leaflet Map (CRS.Simple for Vessel Cartesian Coordinates)
  useEffect(() => {
    if (!mapRef.current || leafletInstance.current) return;

    const map = L.map(mapRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 4,
      zoomControl: false,
      attributionControl: false,
      doubleClickZoom: false,
    });
    // Seed an initial view so the map is never in an unpositioned state before
    // the first fitBounds runs (previously left the canvas blank on load).
    map.setView([50, 163], 0);

    geometryLayerRef.current = L.layerGroup().addTo(map);
    labelLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    map.on('zoomend moveend', () => {
      const z = map.getZoom();
      setCurrentZoom(z);
      if (z < 0.5) setLodLevel(0); // LOD 0: Macro Ship Overview
      else if (z < 2) setLodLevel(1); // LOD 1: Zone & Public Venues
      else setLodLevel(2); // LOD 2: Micro Stateroom Layout
    });

    leafletInstance.current = map;

    // Re-fit on container resize (flex reflow, dock collapse) via rAF-debounce.
    let rafId = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => fitToDeck(map, deckBoundsRef.current));
    });
    resizeObserver.observe(mapRef.current);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      map.remove();
      leafletInstance.current = null;
    };
  }, []);

  // Geometry layer: hull + venue polygons. Redraws only when the deck, filter,
  // selection, or upscale styling changes — never on pan/zoom.
  useEffect(() => {
    const map = leafletInstance.current;
    const geometryLayer = geometryLayerRef.current;
    if (!map || !geometryLayer || !currentDeck) return;

    geometryLayer.clearLayers();
    const fitTargets = [];

    // 1. Hull silhouette outer frame
    if (currentDeck.shapeCoordinates?.length > 0) {
      const hullPoly = L.polygon(
        currentDeck.shapeCoordinates.map(([x, y]) => [y, x]),
        {
          color: isUpscaledMode ? '#00d9f5' : '#334155',
          weight: isUpscaledMode ? 3 : 2,
          fillColor: '#0c1527',
          fillOpacity: 0.85,
          dashArray: isUpscaledMode ? null : '4, 4',
        }
      );
      geometryLayer.addLayer(hullPoly);
      fitTargets.push(hullPoly);
    }

    // Blueprint grid lines in upscaled mode
    if (isUpscaledMode) {
      for (let x = 20; x < 320; x += 20) {
        geometryLayer.addLayer(
          L.polyline([[0, x], [100, x]], { color: 'rgba(0, 217, 245, 0.08)', weight: 1 })
        );
      }
    }

    // 2. Venue / cabin polygons
    const venues = (currentDeck.venues ?? []).filter((venue) =>
      venueMatchesFilter(venue, activeFilter)
    );

    venues.forEach((venue) => {
      const [[x1, y1], [x2, y2]] = venue.bounds;
      const isSelected = selectedVenue && selectedVenue.id === venue.id;

      const venuePoly = L.rectangle([[y1, x1], [y2, x2]], {
        color: isSelected ? '#00d9f5' : venue.color,
        weight: isSelected ? 4 : isUpscaledMode ? 2 : 1.5,
        fillColor: venue.color,
        fillOpacity: isSelected ? 0.65 : isUpscaledMode ? 0.38 : 0.25,
        className: isUpscaledMode ? 'upscaled-vector-polygon' : '',
      });

      venuePoly.on('click', () => onSelectVenue(venue));
      venuePoly.bindTooltip(
        `<div style="font-family: Inter, sans-serif; padding: 4px 6px;">
          <strong style="color: #f8fafc; font-size: 13px;">${venue.name}</strong>
          <div style="color: #94a3b8; font-size: 11px;">${venue.category} • Deck ${currentDeck.level}</div>
        </div>`,
        { permanent: false, direction: 'top', className: 'leaflet-custom-tooltip' }
      );

      geometryLayer.addLayer(venuePoly);
      fitTargets.push(venuePoly);
    });

    // Compute the deck's real extent from what we actually drew, then fit —
    // but only when the deck itself changed, so filtering/selecting doesn't
    // yank the viewport around under the user.
    if (fitTargets.length > 0) {
      const bounds = L.featureGroup(fitTargets).getBounds();
      deckBoundsRef.current = bounds;
      if (fittedDeckRef.current !== currentDeck.level) {
        fittedDeckRef.current = currentDeck.level;
        requestAnimationFrame(() => fitToDeck(map, bounds));
      }
    }
  }, [currentDeck, selectedVenue, isUpscaledMode, activeFilter, onSelectVenue]);

  // Label layer: collision-aware pills. Redraws on zoom (for LOD thinning and
  // collision recompute) independently of the geometry layer.
  useEffect(() => {
    const map = leafletInstance.current;
    const labelLayer = labelLayerRef.current;
    if (!map || !labelLayer || !currentDeck) return;

    labelLayer.clearLayers();

    const venues = (currentDeck.venues ?? []).filter((venue) =>
      venueMatchesFilter(venue, activeFilter)
    );

    // Priority sort: selected > headline venues > suites > staterooms.
    const prioritized = [...venues].sort((a, b) => {
      const selA = selectedVenue && selectedVenue.id === a.id ? 100 : 0;
      const selB = selectedVenue && selectedVenue.id === b.id ? 100 : 0;
      return getLabelPriority(b) + selB - (getLabelPriority(a) + selA);
    });

    const placedBoxes = [];

    prioritized.forEach((venue) => {
      const [centerX, centerY] = venue.center;
      const isSelected = selectedVenue && selectedVenue.id === venue.id;

      // Hide dense stateroom labels when zoomed out unless selected.
      if (currentZoom < 1.0 && isStateroom(venue) && !isSelected) return;

      let screenPt = { x: 0, y: 0 };
      try {
        if (map._container) {
          screenPt = map.latLngToContainerPoint(L.latLng(centerY, centerX));
        }
      } catch {
        screenPt = { x: 0, y: 0 };
      }

      const approxWidth = venue.name.length * 7 + 24;
      const approxHeight = 24;
      const box = {
        left: screenPt.x - approxWidth / 2,
        top: screenPt.y - approxHeight / 2,
        right: screenPt.x + approxWidth / 2,
        bottom: screenPt.y + approxHeight / 2,
      };

      if (!isSelected && screenPt.x > 0) {
        const collides = placedBoxes.some(
          (p) =>
            !(box.right < p.left || box.left > p.right) &&
            !(box.bottom < p.top || box.top > p.bottom)
        );
        if (collides) return;
      }

      if (screenPt.x > 0) placedBoxes.push(box);

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
        iconSize: [0, 0],
      });

      const labelMarker = L.marker([centerY, centerX], { icon: labelIcon });
      labelMarker.on('click', () => onSelectVenue(venue));
      labelLayer.addLayer(labelMarker);
    });
  }, [currentDeck, selectedVenue, activeFilter, currentZoom, onSelectVenue]);

  // Wayfinding route overlay
  useEffect(() => {
    const map = leafletInstance.current;
    const routeGroup = routeLayerRef.current;
    if (!map || !routeGroup || !currentDeck) return;

    routeGroup.clearLayers();
    if (!activeRoute) return;

    const isOriginDeck = activeRoute.origin.deck === currentDeck.level;
    const isDestDeck = activeRoute.destination.deck === currentDeck.level;
    if (!isOriginDeck && !isDestDeck) return;

    const startPoint = isOriginDeck
      ? [activeRoute.origin.coords[1], activeRoute.origin.coords[0]]
      : [activeRoute.destination.coords[1], activeRoute.destination.coords[0]];
    const endPoint = [startPoint[0], startPoint[1] + 40];

    routeGroup.addLayer(
      L.polyline([startPoint, endPoint], {
        color: '#00d9f5',
        weight: 5,
        opacity: 0.95,
        className: 'leaflet-path-route',
      })
    );

    const pinIcon = L.divIcon({
      className: 'custom-pin-marker',
      html: `<div style="
        width: 32px; height: 32px; background: #00d9f5; color: #050914;
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-weight: 800; box-shadow: 0 0 20px #00d9f5; transform: translate(-16px, -16px);
      ">📍</div>`,
    });
    routeGroup.addLayer(L.marker(startPoint, { icon: pinIcon }));
  }, [activeRoute, currentDeck]);

  const handleZoomIn = () => leafletInstance.current?.zoomIn();
  const handleZoomOut = () => leafletInstance.current?.zoomOut();
  const handleResetView = () => {
    fitToDeck(leafletInstance.current, deckBoundsRef.current);
    setBearing(0);
  };

  return (
    <div className="map-container">
      <div id="deck-map" ref={mapRef} />

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

