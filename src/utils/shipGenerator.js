/**
 * Ship Generator & Manifest Loader.
 *
 * Dynamically loads ship manifests and dispatches to parametric ship class
 * generators (EdgeClass, SolsticeClass, MillenniumClass) to produce deck data,
 * metadata, and aliases.
 */

// Edge Series
import xcelManifest from '../data/ships/celebrity-xcel/manifest.json' with { type: 'json' };
import ascentManifest from '../data/ships/celebrity-ascent/manifest.json' with { type: 'json' };
import beyondManifest from '../data/ships/celebrity-beyond/manifest.json' with { type: 'json' };
import apexManifest from '../data/ships/celebrity-apex/manifest.json' with { type: 'json' };
import edgeManifest from '../data/ships/celebrity-edge/manifest.json' with { type: 'json' };

// Solstice Class
import solsticeManifest from '../data/ships/celebrity-solstice/manifest.json' with { type: 'json' };
import equinoxManifest from '../data/ships/celebrity-equinox/manifest.json' with { type: 'json' };
import eclipseManifest from '../data/ships/celebrity-eclipse/manifest.json' with { type: 'json' };
import silhouetteManifest from '../data/ships/celebrity-silhouette/manifest.json' with { type: 'json' };
import reflectionManifest from '../data/ships/celebrity-reflection/manifest.json' with { type: 'json' };

// Millennium Class
import millenniumManifest from '../data/ships/celebrity-millennium/manifest.json' with { type: 'json' };
import infinityManifest from '../data/ships/celebrity-infinity/manifest.json' with { type: 'json' };
import summitManifest from '../data/ships/celebrity-summit/manifest.json' with { type: 'json' };
import constellationManifest from '../data/ships/celebrity-constellation/manifest.json' with { type: 'json' };

import { CELEBRITY_XCEL_METADATA } from '../data/celebrityXcelData.js';
import { generateEdgeClassDecks } from '../data/classes/edgeClass.js';
import { generateSolsticeClassDecks } from '../data/classes/solsticeClass.js';
import { generateMillenniumClassDecks } from '../data/classes/millenniumClass.js';

export const FLEET_MANIFESTS = {
  // Edge Series
  'celebrity-xcel': xcelManifest,
  'celebrity-ascent': ascentManifest,
  'celebrity-beyond': beyondManifest,
  'celebrity-apex': apexManifest,
  'celebrity-edge': edgeManifest,

  // Solstice Class
  'celebrity-solstice': solsticeManifest,
  'celebrity-equinox': equinoxManifest,
  'celebrity-eclipse': eclipseManifest,
  'celebrity-silhouette': silhouetteManifest,
  'celebrity-reflection': reflectionManifest,

  // Millennium Class
  'celebrity-millennium': millenniumManifest,
  'celebrity-infinity': infinityManifest,
  'celebrity-summit': summitManifest,
  'celebrity-constellation': constellationManifest,
};

export const AVAILABLE_SHIPS = [
  // Edge Series
  { id: 'celebrity-xcel', name: 'Celebrity Xcel', shipClass: 'Edge Series', lengthMeters: 327, guestDecks: 15 },
  { id: 'celebrity-ascent', name: 'Celebrity Ascent', shipClass: 'Edge Series', lengthMeters: 327, guestDecks: 15 },
  { id: 'celebrity-beyond', name: 'Celebrity Beyond', shipClass: 'Edge Series', lengthMeters: 327, guestDecks: 15 },
  { id: 'celebrity-apex', name: 'Celebrity Apex', shipClass: 'Edge Series', lengthMeters: 306, guestDecks: 14 },
  { id: 'celebrity-edge', name: 'Celebrity Edge', shipClass: 'Edge Series', lengthMeters: 306, guestDecks: 14 },

  // Solstice Class
  { id: 'celebrity-solstice', name: 'Celebrity Solstice', shipClass: 'Solstice Class', lengthMeters: 317.2, guestDecks: 14 },
  { id: 'celebrity-equinox', name: 'Celebrity Equinox', shipClass: 'Solstice Class', lengthMeters: 317.2, guestDecks: 14 },
  { id: 'celebrity-eclipse', name: 'Celebrity Eclipse', shipClass: 'Solstice Class', lengthMeters: 317.2, guestDecks: 14 },
  { id: 'celebrity-silhouette', name: 'Celebrity Silhouette', shipClass: 'Solstice Class', lengthMeters: 315, guestDecks: 14 },
  { id: 'celebrity-reflection', name: 'Celebrity Reflection', shipClass: 'Solstice Class', lengthMeters: 319, guestDecks: 14 },

  // Millennium Class
  { id: 'celebrity-millennium', name: 'Celebrity Millennium', shipClass: 'Millennium Class', lengthMeters: 294, guestDecks: 11 },
  { id: 'celebrity-infinity', name: 'Celebrity Infinity', shipClass: 'Millennium Class', lengthMeters: 294, guestDecks: 11 },
  { id: 'celebrity-summit', name: 'Celebrity Summit', shipClass: 'Millennium Class', lengthMeters: 294, guestDecks: 11 },
  { id: 'celebrity-constellation', name: 'Celebrity Constellation', shipClass: 'Millennium Class', lengthMeters: 294, guestDecks: 11 },
];

/**
 * Derives short aliases for a ship from its marketed name and cruise line.
 * E.g., "Celebrity Xcel" -> ["Xcel"]
 */
export function aliasesFor(shipName, cruiseLine) {
  const aliases = new Set();
  const linePrefix = String(cruiseLine ?? '').split(/\s+/)[0];
  if (linePrefix && shipName.toLowerCase().startsWith(`${linePrefix.toLowerCase()} `)) {
    aliases.add(shipName.slice(linePrefix.length + 1));
  }
  aliases.delete(shipName);
  return [...aliases];
}

/**
 * Loads a ship manifest from memory cache or src/data/ships/<shipId>/manifest.json.
 *
 * @param {string} shipId Unique ship identifier (e.g. 'celebrity-solstice')
 * @returns {object} Parsed ship manifest object
 */
export function loadShipManifest(shipId) {
  if (!shipId || typeof shipId !== 'string') {
    throw new Error(`loadShipManifest: invalid shipId "${shipId}"`);
  }
  if (FLEET_MANIFESTS[shipId]) {
    return FLEET_MANIFESTS[shipId];
  }
  throw new Error(`Failed to load manifest for ship "${shipId}": ship not registered in fleet.`);
}

/**
 * Generates a complete ship dataset from its shipId.
 *
 * @param {string} shipId Unique ship identifier (e.g. 'celebrity-solstice')
 * @returns {{ metadata: object, decks: Array<object>, aliases: Array<string> }}
 */
export function generateShip(shipId) {
  const manifest = loadShipManifest(shipId);

  // Dispatch to ship class generator
  let decks;
  const shipClass = String(manifest.shipClass || '').toLowerCase();
  if (shipClass.includes('edge')) {
    decks = generateEdgeClassDecks(manifest);
  } else if (shipClass.includes('solstice')) {
    decks = generateSolsticeClassDecks(manifest);
  } else if (shipClass.includes('millennium')) {
    decks = generateMillenniumClassDecks(manifest);
  } else {
    throw new Error(`Unsupported ship class "${manifest.shipClass}" for ship "${shipId}"`);
  }

  let metadata;
  if (manifest.shipId === 'celebrity-xcel') {
    metadata = CELEBRITY_XCEL_METADATA;
  } else {
    metadata = {
      id: manifest.shipId,
      name: manifest.name,
      cruiseLine: manifest.cruiseLine,
      parentCorporation: 'Royal Caribbean Group',
      shipClass: manifest.shipClass,
      imoNumber: manifest.imoNumber,
      grossTonnage: manifest.grossTonnage,
      lengthMeters: manifest.lengthMeters,
      beamMeters: manifest.beamMeters ?? (shipClass.includes('solstice') ? 36.9 : shipClass.includes('millennium') ? 32.2 : 39),
      totalDecks: manifest.totalDecks,
      guestDecks: manifest.guestDecks,
      deckRange: manifest.deckRange,
    };
  }

  const aliases = aliasesFor(metadata.name, metadata.cruiseLine);

  return { metadata, decks, aliases };
}
