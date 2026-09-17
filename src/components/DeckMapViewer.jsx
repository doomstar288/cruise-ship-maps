import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ZoomIn, ZoomOut, Maximize2, Sparkles } from 'lucide-react';
import { venueMatchesFilter, getLabelPriority } from '../utils/venueTaxonomy';
import { CENTERLINE_Y, VENUE_COLORS, hullHalfWidth } from '../utils/deckPlanDataPipeline';
import { routePathForDeck } from '../utils/wayfinding';

// Space (px) kept clear of the floating overlays when fitting a deck: the deck
// rail and info card (left/top), the toolbar (right) and the legend (bottom).
const FIT_PADDING = {
  wide: { topLeft: [150, 130], bottomRight: [110, 90] },
  narrow: { topLeft: [100, 110], bottomRight: [40, 64] },
};

// Width of the cabin inspector drawer, so selections are framed beside it.
const DRAWER_WIDTH = 520;

const LEGEND = [
  { label: 'Staterooms', color: VENUE_COLORS.veranda },
  { label: 'Suites', color: VENUE_COLORS.suite },
  { label: 'Dining', color: VENUE_COLORS.dining },
  { label: 'Bars', color: VENUE_COLORS.bar },
  { label: 'Entertainment', color: VENUE_COLORS.entertainment },
  { label: 'Pools', color: VENUE_COLORS.pool },
  { label: 'Spa & Fitness', color: VENUE_COLORS.spa },
  { label: 'Services', color: VENUE_COLORS.service },
  { label: 'Magic Carpet', color: VENUE_COLORS.magicCarpet },
];

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const isCabin = (venue) => Boolean(venue.cabinClass);
const toLatLng = ([x, y]) => [y, x];

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
  // Bounds of the deck currently drawn, so resizes and the fit button can
  // re-fit, and so we only auto-fit on a genuine deck change.
  const deckBoundsRef = useRef(null);
  const fittedDeckRef = useRef(null);
  const [currentZoom, setCurrentZoom] = useState(0);

  const fitToDeck = (map, bounds, animate = false) => {
    // Bail if the map was torn down (e.g. StrictMode remount) or has no extent.
    if (!map || map !== leafletInstance.current || !map._container || !map._mapPane) return;
    if (!bounds || !bounds.isValid()) return;
    map.invalidateSize();
    const padding = map.getSize().x < 720 ? FIT_PADDING.narrow : FIT_PADDING.wide;
    map.fitBounds(bounds, {
      paddingTopLeft: padding.topLeft,
      paddingBottomRight: padding.bottomRight,
      animate,
    });
  };

  // Initialize Leaflet (CRS.Simple: one map unit = one metre of deck plan).
  useEffect(() => {
    if (!mapRef.current || leafletInstance.current) return;

    const map = L.map(mapRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 5,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
      zoomControl: false,
      attributionControl: false,
    });
    map.setView([CENTERLINE_Y, 163], 1);
    L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 110 }).addTo(map);

    geometryLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    labelLayerRef.current = L.layerGroup().addTo(map);

    map.on('zoomend', () => setCurrentZoom(map.getZoom()));
    leafletInstance.current = map;

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

  // Geometry: hull, frame lines, orientation marks and venue rectangles.
  useEffect(() => {
    const map = leafletInstance.current;
    const geometryLayer = geometryLayerRef.current;
    if (!map || !geometryLayer || !currentDeck) return;

    geometryLayer.clearLayers();
    const fitTargets = [];
    const level = currentDeck.level;
    const outline = currentDeck.shapeCoordinates ?? [];

    if (outline.length > 0) {
      const hull = L.polygon(outline.map(toLatLng), {
        color: isUpscaledMode ? '#22d3ee' : '#4a6a96',
        weight: isUpscaledMode ? 2 : 1.5,
        fillColor: isUpscaledMode ? '#0a1a2e' : '#0f1b2f',
        fillOpacity: 1,
        className: isUpscaledMode ? 'hull-outline-glow' : '',
        interactive: false,
      });
      geometryLayer.addLayer(hull);
      fitTargets.push(hull);

      const xs = outline.map(([x]) => x);
      const xStart = Math.min(...xs);
      const xEnd = Math.max(...xs);

      // Centreline and frame stations every 10 m, clipped to the deck.
      geometryLayer.addLayer(
        L.polyline([[CENTERLINE_Y, xStart], [CENTERLINE_Y, xEnd]], {
          color: isUpscaledMode ? 'rgba(34, 211, 238, 0.22)' : 'rgba(148, 163, 184, 0.14)',
          weight: 1,
          dashArray: '3 6',
          interactive: false,
        })
      );
      if (isUpscaledMode) {
        for (let x = Math.ceil(xStart / 10) * 10; x <= xEnd; x += 10) {
          const hw = hullHalfWidth(level, x);
          if (hw < 1) continue;
          geometryLayer.addLayer(
            L.polyline([[CENTERLINE_Y - hw, x], [CENTERLINE_Y + hw, x]], {
              color: 'rgba(34, 211, 238, 0.07)',
              weight: 1,
              interactive: false,
            })
          );
        }
      }

      const labelX = xStart + (xEnd - xStart) * 0.72;
      const halfBeam = hullHalfWidth(level, labelX);
      const marks = [
        { text: 'Forward', at: [CENTERLINE_Y, xStart - 11] },
        { text: 'Aft', at: [CENTERLINE_Y, xEnd + 8] },
        { text: 'Port', at: [CENTERLINE_Y - halfBeam - 4, labelX] },
        { text: 'Starboard', at: [CENTERLINE_Y + halfBeam + 4, labelX] },
      ];
      for (const mark of marks) {
        geometryLayer.addLayer(
          L.marker(mark.at, {
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: 'map-orientation-label',
              html: `<span>${mark.text}</span>`,
              iconSize: [0, 0],
            }),
          })
        );
      }
    }

    const venues = (currentDeck.venues ?? [])
      .filter((venue) => venueMatchesFilter(venue, activeFilter))
      // Largest first, so venues nested inside others (e.g. the Martini Bar in
      // the Grand Plaza) sit on top and stay clickable.
      .sort((a, b) => area(b.bounds) - area(a.bounds));

    for (const venue of venues) {
      const [[x1, y1], [x2, y2]] = venue.bounds;
      const isSelected = selectedVenue?.id === venue.id;
      const cabin = isCabin(venue);

      const rect = L.rectangle([[y1, x1], [y2, x2]], {
        color: isSelected ? '#22d3ee' : venue.color,
        weight: isSelected ? 3 : cabin ? 0.6 : 1.4,
        opacity: cabin ? 0.75 : 0.95,
        fillColor: venue.color,
        fillOpacity: isSelected ? 0.75 : venue.hideLabel ? 0.22 : cabin ? 0.45 : 0.32,
        className: isUpscaledMode && !cabin ? 'upscaled-vector-polygon' : '',
        interactive: !venue.hideLabel,
      });

      if (!venue.hideLabel) {
        rect.on('click', () => onSelectVenue(venue));
        rect.bindTooltip(
          `<div class="map-tooltip-title">${escapeHtml(venue.name)}</div>
           <div class="map-tooltip-sub">${escapeHtml(venue.category)} · Deck ${level}</div>`,
          { sticky: true, direction: 'top', offset: [0, -8], className: 'leaflet-custom-tooltip' }
        );
      }

      geometryLayer.addLayer(rect);
      fitTargets.push(rect);
    }

    if (fitTargets.length > 0) {
      const bounds = L.featureGroup(fitTargets).getBounds();
      deckBoundsRef.current = bounds;
      if (fittedDeckRef.current !== level) {
        fittedDeckRef.current = level;
        requestAnimationFrame(() => fitToDeck(map, bounds));
      }
    }
  }, [currentDeck, selectedVenue, isUpscaledMode, activeFilter, onSelectVenue]);

  // Frame a selection that is off-screen or too small to see (e.g. a cabin
  // picked from search), leaving room for the inspector drawer.
  const selectedId = selectedVenue?.id;
  useEffect(() => {
    const map = leafletInstance.current;
    if (!map || !selectedVenue) return;
    if (!currentDeck?.venues.some((v) => v.id === selectedVenue.id)) return;

    const [[x1, y1], [x2, y2]] = selectedVenue.bounds;
    const target = L.latLngBounds([y1, x1], [y2, x2]);
    const rafId = requestAnimationFrame(() => {
      if (map !== leafletInstance.current) return;
      const size = map.getSize();
      const drawer = size.x > 900 ? DRAWER_WIDTH : 0;
      const sw = map.latLngToContainerPoint(target.getSouthWest());
      const ne = map.latLngToContainerPoint(target.getNorthEast());
      const tooSmall = Math.abs(ne.x - sw.x) < 24;
      const hidden = sw.x < 80 || ne.x > size.x - drawer - 40 || ne.y < 80 || sw.y > size.y - 60;
      if (!tooSmall && !hidden) return;
      map.flyToBounds(target, {
        paddingTopLeft: [120, 140],
        paddingBottomRight: [drawer + 120, 140],
        maxZoom: isCabin(selectedVenue) ? 3 : 2.5,
        duration: 0.6,
      });
    });
    return () => cancelAnimationFrame(rafId);
    // Only react to a new selection, not to every redraw of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, currentDeck]);

  // Labels: collision-aware pills in projected pixel space, recomputed on zoom.
  useEffect(() => {
    const map = leafletInstance.current;
    const labelLayer = labelLayerRef.current;
    if (!map || !labelLayer || !currentDeck) return;

    labelLayer.clearLayers();
    const zoom = map.getZoom();

    const prioritized = (currentDeck.venues ?? [])
      .filter((venue) => !venue.hideLabel && venueMatchesFilter(venue, activeFilter))
      .sort((a, b) => {
        const selA = selectedVenue?.id === a.id ? 1000 : 0;
        const selB = selectedVenue?.id === b.id ? 1000 : 0;
        return getLabelPriority(b) + selB + area(b.bounds) / 1000 - (getLabelPriority(a) + selA + area(a.bounds) / 1000);
      });

    const placed = [];
    for (const venue of prioritized) {
      const isSelected = selectedVenue?.id === venue.id;
      const cabin = isCabin(venue);
      const [[x1, y1], [x2, y2]] = venue.bounds;
      const p1 = map.project([y1, x1], zoom);
      const p2 = map.project([y2, x2], zoom);
      const pxWidth = Math.abs(p2.x - p1.x);
      const pxHeight = Math.abs(p2.y - p1.y);

      let text = venue.name;
      if (cabin) {
        // Cabin numbers only once the cabin itself is big enough to carry one.
        if (!isSelected && (pxWidth < 26 || pxHeight < 14)) continue;
        text = isSelected || pxWidth > venue.name.length * 6.5 ? venue.name : venue.label;
      } else if (!isSelected && pxWidth < 28 && getLabelPriority(venue) < 70) {
        continue;
      }

      const center = map.project(toLatLng(venue.center), zoom);
      const width = text.length * (cabin ? 6 : 6.6) + (cabin ? 10 : 26);
      const height = cabin ? 16 : 22;
      const box = {
        left: center.x - width / 2,
        right: center.x + width / 2,
        top: center.y - height / 2,
        bottom: center.y + height / 2,
      };
      const collides = placed.some(
        (p) => box.left < p.right && box.right > p.left && box.top < p.bottom && box.bottom > p.top
      );
      if (collides && !isSelected) continue;
      placed.push(box);

      const html = cabin && !isSelected
        ? `<div class="cabin-label">${escapeHtml(text)}</div>`
        : `<div class="custom-venue-label-pill${isSelected ? ' selected' : ''}">
             <span class="label-dot" style="background:${venue.color}"></span>
             <span class="label-text">${escapeHtml(text)}</span>
           </div>`;

      const marker = L.marker(toLatLng(venue.center), {
        icon: L.divIcon({ className: 'custom-venue-label-container', html, iconSize: [0, 0] }),
        keyboard: false,
        zIndexOffset: isSelected ? 1000 : 0,
      });
      marker.on('click', () => onSelectVenue(venue));
      labelLayer.addLayer(marker);
    }
  }, [currentDeck, selectedVenue, activeFilter, currentZoom, onSelectVenue]);

  // Wayfinding overlay: walk paths, lift and stair landings, and end markers.
  useEffect(() => {
    const routeGroup = routeLayerRef.current;
    if (!routeGroup || !currentDeck) return;
    routeGroup.clearLayers();

    const path = routePathForDeck(activeRoute, currentDeck.level);
    if (!path) return;

    for (const points of path.segments) {
      routeGroup.addLayer(
        L.polyline(points.map(toLatLng), {
          color: '#22d3ee',
          weight: 4,
          opacity: 0.95,
          lineJoin: 'round',
          className: 'leaflet-path-route',
          interactive: false,
        })
      );
    }

    const pin = (coords, className, glyph, title) =>
      L.marker(toLatLng(coords), {
        title,
        keyboard: false,
        zIndexOffset: 2000,
        icon: L.divIcon({
          className: 'route-pin-container',
          html: `<div class="route-pin ${className}">${glyph}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      });

    for (const landing of path.landings) {
      const isLift = landing.kind === 'elevator';
      routeGroup.addLayer(pin(landing.coords, 'elevator', isLift ? '⇅' : '⇞', isLift ? 'Elevators' : 'Stairs'));
    }
    if (path.start) routeGroup.addLayer(pin(path.start.coords, 'origin', 'A', activeRoute.origin.name));
    if (path.end) routeGroup.addLayer(pin(path.end.coords, 'destination', 'B', activeRoute.destination.name));
  }, [activeRoute, currentDeck]);

  const handleZoomIn = () => leafletInstance.current?.zoomIn();
  const handleZoomOut = () => leafletInstance.current?.zoomOut();
  const handleFit = () => fitToDeck(leafletInstance.current, deckBoundsRef.current, true);

  return (
    <div className="map-container">
      <div id="deck-map" ref={mapRef} role="application" aria-label={`Deck plan for ${currentDeck?.name ?? 'deck'}`} />

      <div className="map-toolbar">
        <div className="toolbar-group">
          <button className="tool-btn" onClick={handleZoomIn} title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={18} />
          </button>
          <button className="tool-btn" onClick={handleZoomOut} title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={18} />
          </button>
          <button className="tool-btn" onClick={handleFit} title="Fit whole deck" aria-label="Fit whole deck">
            <Maximize2 size={18} />
          </button>
        </div>

        <div className="toolbar-group">
          <button
            className={`tool-btn ${isUpscaledMode ? 'active' : ''}`}
            onClick={onToggleUpscale}
            title="Toggle blueprint style"
            aria-label="Toggle blueprint style"
            aria-pressed={isUpscaledMode}
          >
            <Sparkles size={18} />
          </button>
        </div>
      </div>

      <div className="map-legend" aria-label="Map legend">
        {LEGEND.map((item) => (
          <span key={item.label} className="legend-item">
            <span className="legend-swatch" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        <span className="legend-note">Approximate layout · not an official deck plan</span>
      </div>
    </div>
  );
}

function area([[x1, y1], [x2, y2]]) {
  return (x2 - x1) * (y2 - y1);
}
