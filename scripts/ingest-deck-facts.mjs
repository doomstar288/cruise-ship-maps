#!/usr/bin/env node
/**
 * Multi-Ship Deck Facts Ingestion & Manifest Generator.
 *
 * Ingests structured deck and cabin facts for any ship in `public/data/fleet-registry.json`,
 * validates them against the manifest schema, and generates `manifest.json`.
 *
 * Usage:
 *   node scripts/ingest-deck-facts.mjs --ship-id celebrity-xcel
 *   node scripts/ingest-deck-facts.mjs --ship-id celebrity-beyond --out path/to/manifest.json
 *   node scripts/ingest-deck-facts.mjs --ship-id celebrity-edge --dry-run
 *   node scripts/ingest-deck-facts.mjs --all
 *   node scripts/ingest-deck-facts.mjs --facts custom-facts.json --ship-id celebrity-ascent
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isValidImo } from '../src/utils/imo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_REGISTRY_PATH = resolve(REPO_ROOT, 'public/data/fleet-registry.json');
const DEFAULT_OUT_DIR = resolve(REPO_ROOT, 'src/data/ships');

// ------------------------------------------------------------- schema validation

const VALID_ZONES = new Set(['fwd', 'mid', 'aft']);
const VALID_SIDES = new Set(['port', 'starboard', 'center']);
const VALID_CONFIDENCES = new Set(['verified', 'zone', 'estimated']);

/**
 * Validates a manifest object against the specification schema.
 * @param {object} manifest
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['Manifest must be a non-null object'] };
  }

  // 1. shipId
  if (typeof manifest.shipId !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.shipId)) {
    errors.push(`Invalid shipId "${manifest.shipId}": must be a lowercase kebab-case string`);
  }

  // 2. name
  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) {
    errors.push('Manifest requires a non-empty string "name"');
  }

  // 3. cruiseLine
  if (typeof manifest.cruiseLine !== 'string' || manifest.cruiseLine.trim().length === 0) {
    errors.push('Manifest requires a non-empty string "cruiseLine"');
  }

  // 4. shipClass
  if (typeof manifest.shipClass !== 'string' || manifest.shipClass.trim().length === 0) {
    errors.push('Manifest requires a non-empty string "shipClass"');
  }

  // 5. imoNumber
  if (typeof manifest.imoNumber !== 'string' || !isValidImo(manifest.imoNumber)) {
    errors.push(
      `Invalid imoNumber "${manifest.imoNumber}": must be a valid 7-digit IMO number with correct check digit`
    );
  }

  // 6. deckRange
  const deckRange = manifest.deckRange;
  if (
    !deckRange ||
    typeof deckRange !== 'object' ||
    typeof deckRange.min !== 'number' ||
    typeof deckRange.max !== 'number' ||
    !Number.isInteger(deckRange.min) ||
    !Number.isInteger(deckRange.max) ||
    deckRange.min > deckRange.max ||
    deckRange.min < 0
  ) {
    errors.push(
      'Invalid deckRange: must be an object { min: integer, max: integer } where min <= max and min >= 0'
    );
  }

  const minDeck = deckRange?.min ?? 0;
  const maxDeck = deckRange?.max ?? 100;

  // 7. deckNames
  const deckNames = manifest.deckNames;
  if (!deckNames || typeof deckNames !== 'object' || Array.isArray(deckNames)) {
    errors.push('Invalid deckNames: must be an object mapping deck numbers to names');
  } else {
    const keys = Object.keys(deckNames);
    if (keys.length === 0) {
      errors.push('deckNames cannot be empty');
    }
    for (const key of keys) {
      const deckNum = Number(key);
      if (!Number.isInteger(deckNum) || deckNum < minDeck || deckNum > maxDeck) {
        errors.push(
          `deckNames key "${key}" is not an integer within deckRange [${minDeck}, ${maxDeck}]`
        );
      }
      if (typeof deckNames[key] !== 'string' || deckNames[key].trim().length === 0) {
        errors.push(`deckNames for deck ${key} must be a non-empty string`);
      }
    }
  }

  // 8. cabinRanges
  const cabinRanges = manifest.cabinRanges;
  if (!cabinRanges || typeof cabinRanges !== 'object' || Array.isArray(cabinRanges)) {
    errors.push(
      'Invalid cabinRanges: must be an object mapping deck numbers to { port, starboard } ranges'
    );
  } else {
    for (const [deckKey, sides] of Object.entries(cabinRanges)) {
      const deckNum = Number(deckKey);
      if (!Number.isInteger(deckNum) || deckNum < minDeck || deckNum > maxDeck) {
        errors.push(
          `cabinRanges key "${deckKey}" is not an integer within deckRange [${minDeck}, ${maxDeck}]`
        );
      }
      if (!sides || typeof sides !== 'object' || Array.isArray(sides)) {
        errors.push(`cabinRanges[${deckKey}] must be an object with "port" and "starboard" arrays`);
        continue;
      }
      for (const sideKey of ['port', 'starboard']) {
        const ranges = sides[sideKey];
        if (!Array.isArray(ranges)) {
          errors.push(`cabinRanges[${deckKey}].${sideKey} must be an array`);
          continue;
        }
        for (let i = 0; i < ranges.length; i += 1) {
          const entry = ranges[i];
          const prefix = `cabinRanges[${deckKey}].${sideKey}[${i}]`;
          if (!entry || typeof entry !== 'object') {
            errors.push(`${prefix} must be an object`);
            continue;
          }
          if (
            !Array.isArray(entry.x) ||
            entry.x.length !== 2 ||
            typeof entry.x[0] !== 'number' ||
            typeof entry.x[1] !== 'number' ||
            entry.x[0] >= entry.x[1]
          ) {
            errors.push(`${prefix}.x must be an array [xMin, xMax] where xMin < xMax`);
          }
          if (
            typeof entry.from !== 'number' ||
            typeof entry.to !== 'number' ||
            !Number.isInteger(entry.from) ||
            !Number.isInteger(entry.to) ||
            entry.from > entry.to ||
            entry.from < 0
          ) {
            errors.push(`${prefix} must have positive integer "from" and "to" with from <= to`);
          }
        }
      }
    }
  }

  // 9. venues
  const venues = manifest.venues;
  if (!Array.isArray(venues) || venues.length === 0) {
    errors.push('Invalid venues: must be a non-empty array of venue objects');
  } else {
    for (let i = 0; i < venues.length; i += 1) {
      const v = venues[i];
      const prefix = `venues[${i}] (${v?.name ?? 'unnamed'})`;
      if (!v || typeof v !== 'object') {
        errors.push(`${prefix} must be an object`);
        continue;
      }
      if (typeof v.name !== 'string' || v.name.trim().length === 0) {
        errors.push(`${prefix} requires a non-empty string "name"`);
      }
      if (
        typeof v.deck !== 'number' ||
        !Number.isInteger(v.deck) ||
        v.deck < minDeck ||
        v.deck > maxDeck
      ) {
        errors.push(
          `${prefix} deck (${v.deck}) must be an integer within deckRange [${minDeck}, ${maxDeck}]`
        );
      }
      if (typeof v.category !== 'string' || v.category.trim().length === 0) {
        errors.push(`${prefix} requires a non-empty string "category"`);
      }
      if (!v.zone || !VALID_ZONES.has(v.zone)) {
        errors.push(`${prefix} zone "${v.zone}" must be one of: ${[...VALID_ZONES].join(', ')}`);
      }
      if (v.side !== undefined && !VALID_SIDES.has(v.side)) {
        errors.push(`${prefix} side "${v.side}" must be one of: ${[...VALID_SIDES].join(', ')}`);
      }
      if (v.confidence !== undefined && !VALID_CONFIDENCES.has(v.confidence)) {
        errors.push(
          `${prefix} confidence "${v.confidence}" must be one of: ${[...VALID_CONFIDENCES].join(', ')}`
        );
      }
      if (v.spansDecks !== undefined) {
        if (!Array.isArray(v.spansDecks) || v.spansDecks.some((d) => !Number.isInteger(d))) {
          errors.push(`${prefix} spansDecks must be an array of deck integers`);
        }
      }
      if (v.aliases !== undefined) {
        if (!Array.isArray(v.aliases) || v.aliases.some((a) => typeof a !== 'string')) {
          errors.push(`${prefix} aliases must be an array of strings`);
        }
      }
    }
  }

  // 10. Optional dimensions
  if (
    manifest.lengthMeters !== undefined &&
    (typeof manifest.lengthMeters !== 'number' || manifest.lengthMeters <= 0)
  ) {
    errors.push('lengthMeters must be a positive number');
  }
  if (
    manifest.beamMeters !== undefined &&
    (typeof manifest.beamMeters !== 'number' || manifest.beamMeters <= 0)
  ) {
    errors.push('beamMeters must be a positive number');
  }
  if (
    manifest.grossTonnage !== undefined &&
    (typeof manifest.grossTonnage !== 'number' || manifest.grossTonnage <= 0)
  ) {
    errors.push('grossTonnage must be a positive number');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Asserts that a manifest is valid, throwing an Error with details if not.
 * @param {object} manifest
 * @returns {object} the validated manifest
 */
export function assertValidManifest(manifest) {
  const result = validateManifest(manifest);
  if (!result.valid) {
    throw new Error(`Manifest validation failed:\n  - ${result.errors.join('\n  - ')}`);
  }
  return manifest;
}

// ------------------------------------------------------------- fleet registry loader

/**
 * Loads the fleet registry from disk.
 * @param {string} [path]
 * @returns {Promise<object>}
 */
export async function loadFleetRegistryData(path = DEFAULT_REGISTRY_PATH) {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text);
}

/**
 * Finds a vessel in the fleet registry by ID, slug, or IMO.
 * @param {object} registry
 * @param {string} query
 * @returns {object|null}
 */
export function findVesselInRegistry(registry, query) {
  if (!registry?.ships || !query) return null;
  const q = String(query).trim().toLowerCase();
  const slug = q.replace(/[^a-z0-9]+/g, '-');

  // Exact IMO match
  const byImo = registry.ships.find((s) => s.imo === query.trim());
  if (byImo) return byImo;

  // Slug match (e.g. "celebrity-xcel" matches "Celebrity Xcel")
  const bySlug = registry.ships.find(
    (s) => s.name && s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug
  );
  if (bySlug) return bySlug;

  // Name substring match
  return registry.ships.find((s) => s.name && s.name.toLowerCase().includes(q)) ?? null;
}

// ------------------------------------------------------------- built-in facts for Edge-class ships

/**
 * Common shared venues across Edge-class ships.
 */
const COMMON_EDGE_VENUES = [
  // Deck 2
  {
    name: 'Medical Center',
    deck: 2,
    category: 'Guest Services',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Medical Clinic'],
  },
  {
    name: 'The Basement',
    deck: 2,
    category: 'Kids & Teens',
    side: 'port',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Teen Club'],
  },
  {
    name: 'Gangway & Security',
    deck: 2,
    category: 'Guest Services',
    side: 'port',
    zone: 'mid',
    confidence: 'estimated',
    aliases: ['Gangway', 'Security Screening'],
  },
  {
    name: 'Destination Gateway',
    deck: 2,
    category: 'Guest Services',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Tender Platform', 'Tender Boarding'],
  },
  {
    name: 'Magic Carpet (Tender Platform)',
    deck: 2,
    category: 'Magic Carpet',
    side: 'starboard',
    zone: 'mid',
    confidence: 'verified',
    spansDecks: [2, 5, 14, 16],
    aliases: ['Magic Carpet'],
  },

  // Deck 3
  {
    name: 'The Theatre',
    deck: 3,
    category: 'Entertainment',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    spansDecks: [3, 4, 5],
    aliases: ['The Theater', 'Theatre', 'Theater'],
  },
  {
    name: 'Grand Plaza',
    deck: 3,
    category: 'Entertainment',
    side: 'center',
    zone: 'mid',
    confidence: 'zone',
    spansDecks: [3, 4, 5],
    aliases: ['Grand Plaza', 'Grand Plaza Bar'],
  },
  {
    name: 'The Martini Bar',
    deck: 3,
    category: 'Bars & Lounges',
    side: 'center',
    zone: 'mid',
    confidence: 'estimated',
    aliases: ['Martini Bar'],
  },
  {
    name: 'Grand Plaza Café',
    deck: 3,
    category: 'Dining',
    side: 'center',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Grand Plaza Cafe'],
  },
  {
    name: 'Shore Excursions',
    deck: 3,
    category: 'Guest Services',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Shore Ex'],
  },
  {
    name: 'Guest Relations',
    deck: 3,
    category: 'Guest Services',
    side: 'port',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Guest Services', 'Reception'],
  },
  {
    name: 'Camp at Sea',
    deck: 3,
    category: 'Kids & Teens',
    side: 'port',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Kids Club'],
  },
  {
    name: 'Concierge Lounge',
    deck: 3,
    category: 'Bars & Lounges',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
  },
  {
    name: 'Normandie Restaurant',
    deck: 3,
    category: 'Fine Dining',
    side: 'port',
    zone: 'aft',
    confidence: 'verified',
    aliases: ['Normandie'],
  },
  {
    name: 'Tuscan Restaurant',
    deck: 3,
    category: 'Fine Dining',
    side: 'starboard',
    zone: 'aft',
    confidence: 'verified',
    aliases: ['Tuscan'],
  },

  // Deck 4
  {
    name: 'The Theatre (Middle Level)',
    deck: 4,
    category: 'Entertainment',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    spansDecks: [3, 4, 5],
    aliases: ['The Theatre'],
  },
  {
    name: 'Photo Gallery & Studio',
    deck: 4,
    category: 'Guest Services',
    side: 'starboard',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Photo Gallery'],
  },
  {
    name: 'Celebrity Shops',
    deck: 4,
    category: 'Shopping',
    side: 'port',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['The Shops'],
  },
  {
    name: 'Le Grand Bistro',
    deck: 4,
    category: 'Dining',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Le Grand Bistro', 'Le Petit Chef'],
  },
  {
    name: 'Grand Plaza (Middle Level)',
    deck: 4,
    category: 'Entertainment',
    side: 'center',
    zone: 'mid',
    confidence: 'zone',
    spansDecks: [3, 4, 5],
    aliases: ['Grand Plaza'],
  },
  {
    name: 'Café al Bacio',
    deck: 4,
    category: 'Bars & Lounges',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Cafe al Bacio', 'Il Bacio'],
  },
  {
    name: 'Casino',
    deck: 4,
    category: 'Entertainment',
    side: 'port',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['The Casino', 'Celebrity Casino'],
  },
  {
    name: 'The Club',
    deck: 4,
    category: 'Entertainment',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    spansDecks: [4, 5],
    aliases: ['The Club'],
  },
  {
    name: 'Cosmopolitan Restaurant',
    deck: 4,
    category: 'Fine Dining',
    side: 'port',
    zone: 'aft',
    confidence: 'zone',
    aliases: ['Cosmopolitan'],
  },
  {
    name: 'Cyprus Restaurant',
    deck: 4,
    category: 'Fine Dining',
    side: 'starboard',
    zone: 'aft',
    confidence: 'zone',
    aliases: ['Cyprus'],
  },

  // Deck 5
  {
    name: 'The Theatre (Upper Level)',
    deck: 5,
    category: 'Entertainment',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    spansDecks: [3, 4, 5],
    aliases: ['The Theatre'],
  },
  {
    name: 'Art Gallery',
    deck: 5,
    category: 'Entertainment',
    side: 'port',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Park West Gallery'],
  },
  {
    name: 'Celebrity Flagship Store',
    deck: 5,
    category: 'Shopping',
    side: 'starboard',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Flagship Store'],
  },
  {
    name: 'Blu',
    deck: 5,
    category: 'Fine Dining',
    side: 'port',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Blu Restaurant'],
  },
  {
    name: 'Fine Cut Steakhouse',
    deck: 5,
    category: 'Fine Dining',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Fine Cut'],
  },
  {
    name: 'Grand Plaza (Upper Level)',
    deck: 5,
    category: 'Entertainment',
    side: 'center',
    zone: 'mid',
    confidence: 'zone',
    spansDecks: [3, 4, 5],
    aliases: ['Grand Plaza'],
  },
  {
    name: 'Raw on 5',
    deck: 5,
    category: 'Fine Dining',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Raw on 5th', 'Sushi on 5'],
  },
  {
    name: 'World Class Bar',
    deck: 5,
    category: 'Bars & Lounges',
    side: 'port',
    zone: 'mid',
    confidence: 'zone',
  },
  {
    name: 'Magic Carpet (Deck 5 Dining)',
    deck: 5,
    category: 'Magic Carpet',
    side: 'starboard',
    zone: 'mid',
    confidence: 'verified',
    spansDecks: [2, 5, 14, 16],
    aliases: ['Magic Carpet'],
  },
  {
    name: 'The Attic at The Club',
    deck: 5,
    category: 'Entertainment',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    spansDecks: [4, 5],
    aliases: ['The Attic', 'The Club Upper'],
  },

  // Deck 11
  {
    name: 'Navigation Bridge',
    deck: 11,
    category: 'Guest Services',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['The Bridge', 'Bridge'],
  },

  // Deck 14
  {
    name: 'The Spa & SEA Thermal Suite',
    deck: 14,
    category: 'Spa & Wellness',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['The Spa', 'SEA Thermal Suite'],
  },
  {
    name: 'Solarium',
    deck: 14,
    category: 'Pools & Sun Deck',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Adults Pool', 'Solarium Pool'],
  },
  {
    name: 'Celebrity Pool Club',
    deck: 14,
    category: 'Pools & Sun Deck',
    side: 'center',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Main Pool', 'Pool Deck', 'Resort Deck'],
  },
  {
    name: 'Pool Club Cabanas',
    deck: 14,
    category: 'Pools & Sun Deck',
    side: 'port',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Cabanas'],
  },
  {
    name: 'Magic Carpet (Pool Deck)',
    deck: 14,
    category: 'Magic Carpet',
    side: 'starboard',
    zone: 'mid',
    confidence: 'verified',
    spansDecks: [2, 5, 14, 16],
    aliases: ['Magic Carpet', 'Magic Carpet Bar'],
  },
  {
    name: 'Mast Grill & Bar',
    deck: 14,
    category: 'Dining',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
    aliases: ['Mast Grill', 'Mast Bar'],
  },
  {
    name: 'Oceanview Café',
    deck: 14,
    category: 'Dining',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    aliases: ['Oceanview Cafe', 'OVC', 'Buffet'],
  },
  {
    name: 'Il Secondo Bacio',
    deck: 14,
    category: 'Bars & Lounges',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
  },
  {
    name: 'Oceanview Café Terrace',
    deck: 14,
    category: 'Dining',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    aliases: ['Oceanview Terrace'],
  },
  {
    name: 'Aft Sun Deck',
    deck: 14,
    category: 'Pools & Sun Deck',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
  },

  // Deck 15
  {
    name: 'The Retreat Lounge',
    deck: 15,
    category: 'Suites',
    side: 'port',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Retreat Lounge'],
  },
  {
    name: 'Fitness Center',
    deck: 15,
    category: 'Spa & Wellness',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Gym', 'Fitness Centre'],
  },
  {
    name: 'Rooftop Garden',
    deck: 15,
    category: 'Pools & Sun Deck',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    aliases: ['Rooftop Garden Grill'],
  },
  {
    name: 'Sunset Bar',
    deck: 15,
    category: 'Bars & Lounges',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    aliases: ['Sunset Bar'],
  },

  // Deck 16
  {
    name: 'Magic Carpet (Dinner on the Edge)',
    deck: 16,
    category: 'Magic Carpet',
    side: 'starboard',
    zone: 'mid',
    confidence: 'verified',
    spansDecks: [2, 5, 14, 16],
    aliases: ['Magic Carpet'],
  },
  {
    name: 'Mast Bar',
    deck: 16,
    category: 'Bars & Lounges',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
  },
];

/**
 * Eden venue records spanning decks 4, 5, and 6.
 * Present on Celebrity Edge, Apex, Beyond, and Ascent (replaced by The Bazaar on Xcel).
 */
const EDEN_VENUES = [
  {
    name: 'Eden Restaurant',
    deck: 4,
    category: 'Fine Dining',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    spansDecks: [4, 5, 6],
    aliases: ['Eden', 'Eden Restaurant'],
  },
  {
    name: 'Eden Bar',
    deck: 5,
    category: 'Bars & Lounges',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    spansDecks: [4, 5, 6],
    aliases: ['Eden', 'Eden Bar', 'Eden Lounge'],
  },
  {
    name: 'Eden (Upper Level)',
    deck: 6,
    category: 'Entertainment',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    spansDecks: [4, 5, 6],
    aliases: ['Eden', 'Eden Walkway'],
  },
];

/**
 * The Bazaar venue records spanning decks 4, 5, and 6.
 * Flagship feature unique to Celebrity Xcel.
 */
const XCEL_BAZAAR_VENUES = [
  {
    name: 'Mosaic at The Bazaar',
    deck: 4,
    category: 'Fine Dining',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    spansDecks: [4, 5, 6],
    aliases: ['Mosaic', 'The Bazaar'],
  },
  {
    name: 'Market at The Bazaar',
    deck: 5,
    category: 'Dining',
    side: 'port',
    zone: 'aft',
    confidence: 'zone',
    spansDecks: [4, 5, 6],
    aliases: ['Market', 'The Bazaar Market'],
  },
  {
    name: 'Spice Café',
    deck: 5,
    category: 'Dining',
    side: 'starboard',
    zone: 'aft',
    confidence: 'zone',
    spansDecks: [4, 5, 6],
    aliases: ['Spice Cafe', 'The Bazaar Spice Cafe'],
  },
  {
    name: 'The Bazaar (Upper Level)',
    deck: 6,
    category: 'Entertainment',
    side: 'center',
    zone: 'aft',
    confidence: 'zone',
    spansDecks: [4, 5, 6],
    aliases: ['The Bazaar'],
  },
];

/**
 * Retreat Upper Decks for Beyond, Ascent, Xcel (stretches to Deck 17).
 */
const STRETCHED_RETREAT_VENUES = [
  {
    name: 'Retreat Lower Sundeck',
    deck: 16,
    category: 'Suites',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
  },
  {
    name: 'Luminae at The Retreat',
    deck: 16,
    category: 'Fine Dining',
    side: 'port',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Luminae'],
  },
  {
    name: 'Glass-Walled Hot Tubs',
    deck: 16,
    category: 'Pools & Sun Deck',
    side: 'starboard',
    zone: 'mid',
    confidence: 'zone',
  },
  {
    name: 'The Retreat Sundeck',
    deck: 17,
    category: 'Suites',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Retreat Sundeck'],
  },
  {
    name: 'The Retreat Bar',
    deck: 17,
    category: 'Bars & Lounges',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Retreat Bar'],
  },
];

/**
 * Retreat Decks for Edge & Apex (14 guest decks, max Deck 16).
 */
const ORIGINAL_RETREAT_VENUES = [
  {
    name: 'Luminae',
    deck: 12,
    category: 'Fine Dining',
    side: 'port',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Luminae Restaurant'],
  },
  {
    name: 'The Retreat Sundeck',
    deck: 16,
    category: 'Suites',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
    aliases: ['Retreat Sundeck'],
  },
  {
    name: 'The Retreat Pool',
    deck: 16,
    category: 'Pools & Sun Deck',
    side: 'center',
    zone: 'fwd',
    confidence: 'zone',
  },
];

/**
 * Deck names for 15-guest-deck stretched ships (Beyond, Ascent, Xcel: Decks 2–12, 14–17).
 */
const STRETCHED_DECK_NAMES = {
  2: 'Destination Gateway & Medical',
  3: 'Grand Plaza & Guest Services',
  4: 'Casino & Dining',
  5: 'Grand Plaza, Dining & Magic Carpet',
  6: 'Staterooms & Lounges',
  7: 'Staterooms',
  8: 'Staterooms',
  9: 'Staterooms',
  10: 'Staterooms',
  11: 'Bridge, Suites & Concierge',
  12: 'Iconic Suites & Suite Class',
  14: 'Pool Deck, Spa & Oceanview Café',
  15: 'The Retreat, Rooftop Garden & Sunset Bar',
  16: 'Luminae & Retreat Sundeck',
  17: 'The Retreat Sundeck',
};

/**
 * Deck names for 14-guest-deck ships (Edge & Apex: Decks 2–12, 14–16).
 */
const ORIGINAL_DECK_NAMES = {
  2: 'Destination Gateway & Medical',
  3: 'Grand Plaza & Guest Services',
  4: 'Casino & Dining',
  5: 'Grand Plaza, Dining & Magic Carpet',
  6: 'Staterooms & Eden',
  7: 'Staterooms',
  8: 'Staterooms',
  9: 'Staterooms',
  10: 'Staterooms',
  11: 'Bridge, Suites & Concierge',
  12: 'Iconic Suites & Suite Class',
  14: 'Pool Deck, Spa & Oceanview Café',
  15: 'The Retreat, Rooftop Garden & Sunset Bar',
  16: 'The Retreat Sundeck',
};

/**
 * Cabin ranges for stretched 327m Edge-class hull (Beyond, Ascent, Xcel).
 */
const STRETCHED_CABIN_RANGES = {
  3: {
    port: [{ x: [96, 150], from: 3101, to: 3159 }],
    starboard: [{ x: [96, 150], from: 3100, to: 3158 }],
  },
  6: {
    port: [{ x: [20, 278.6], from: 6101, to: 6327 }],
    starboard: [{ x: [20, 278.6], from: 6100, to: 6300 }],
  },
  7: {
    port: [{ x: [20, 326.6], from: 7101, to: 7357 }],
    starboard: [{ x: [20, 326.6], from: 7100, to: 7336 }],
  },
  8: {
    port: [{ x: [20, 326.6], from: 8101, to: 8357 }],
    starboard: [{ x: [20, 326.6], from: 8100, to: 8336 }],
  },
  9: {
    port: [{ x: [20, 326.6], from: 9101, to: 9351 }],
    starboard: [{ x: [20, 326.6], from: 9100, to: 9332 }],
  },
  10: {
    port: [{ x: [20, 326.6], from: 10101, to: 10349 }],
    starboard: [{ x: [20, 326.6], from: 10100, to: 10330 }],
  },
  11: {
    port: [{ x: [44, 326.6], from: 11101, to: 11309 }],
    starboard: [{ x: [44, 326.6], from: 11100, to: 11290 }],
  },
  12: {
    port: [{ x: [26, 326.6], from: 12101, to: 12309 }],
    starboard: [{ x: [26, 326.6], from: 12100, to: 12290 }],
  },
  15: {
    port: [{ x: [42, 80], from: 15101, to: 15103 }],
    starboard: [{ x: [42, 80], from: 15100, to: 15102 }],
  },
};

/**
 * Cabin ranges for original 306m Edge-class hull (Edge & Apex).
 */
const ORIGINAL_CABIN_RANGES = {
  3: {
    port: [{ x: [96, 150], from: 3101, to: 3159 }],
    starboard: [{ x: [96, 150], from: 3100, to: 3158 }],
  },
  6: {
    port: [{ x: [20, 260], from: 6101, to: 6299 }],
    starboard: [{ x: [20, 260], from: 6100, to: 6278 }],
  },
  7: {
    port: [{ x: [20, 305.6], from: 7101, to: 7321 }],
    starboard: [{ x: [20, 305.6], from: 7100, to: 7304 }],
  },
  8: {
    port: [{ x: [20, 305.6], from: 8101, to: 8321 }],
    starboard: [{ x: [20, 305.6], from: 8100, to: 8304 }],
  },
  9: {
    port: [{ x: [20, 305.6], from: 9101, to: 9317 }],
    starboard: [{ x: [20, 305.6], from: 9100, to: 9300 }],
  },
  10: {
    port: [{ x: [20, 305.6], from: 10101, to: 10315 }],
    starboard: [{ x: [20, 305.6], from: 10100, to: 10298 }],
  },
  11: {
    port: [{ x: [44, 305.6], from: 11101, to: 11277 }],
    starboard: [{ x: [44, 305.6], from: 11100, to: 11260 }],
  },
  12: {
    port: [{ x: [26, 305.6], from: 12101, to: 12277 }],
    starboard: [{ x: [26, 305.6], from: 12100, to: 12260 }],
  },
};

/**
 * Built-in facts registry for the 5 Edge-class ships.
 */
export const EDGE_CLASS_FACTS = {
  'celebrity-xcel': {
    shipId: 'celebrity-xcel',
    name: 'Celebrity Xcel',
    imoNumber: '9884136',
    cruiseLine: 'Celebrity Cruises',
    shipClass: 'Edge-class cruise ship',
    lengthMeters: 327,
    beamMeters: 39.5,
    grossTonnage: 141420,
    inServiceYear: 2025,
    totalDecks: 16,
    guestDecks: 15,
    deckRange: { min: 2, max: 17 },
    deckNames: {
      ...STRETCHED_DECK_NAMES,
      4: 'Casino, Dining & The Bazaar',
      6: 'Staterooms & The Bazaar',
    },
    cabinRanges: STRETCHED_CABIN_RANGES,
    venues: [
      ...COMMON_EDGE_VENUES,
      {
        name: 'Craft Social',
        deck: 4,
        category: 'Bars & Lounges',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['Craft Social Bar'],
      },
      {
        name: 'Le Voyage by Daniel Boulud',
        deck: 4,
        category: 'Fine Dining',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['Le Voyage'],
      },
      {
        name: 'The Annex',
        deck: 5,
        category: 'Entertainment',
        side: 'starboard',
        zone: 'fwd',
        confidence: 'zone',
        aliases: ['Annex'],
      },
      {
        name: 'Bora',
        deck: 15,
        category: 'Dining',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['Bora Restaurant'],
      },
      ...XCEL_BAZAAR_VENUES,
      ...STRETCHED_RETREAT_VENUES,
    ],
  },

  'celebrity-ascent': {
    shipId: 'celebrity-ascent',
    name: 'Celebrity Ascent',
    imoNumber: '9838400',
    cruiseLine: 'Celebrity Cruises',
    shipClass: 'Edge-class cruise ship',
    lengthMeters: 327,
    beamMeters: 39.5,
    grossTonnage: 141420,
    inServiceYear: 2023,
    totalDecks: 16,
    guestDecks: 15,
    deckRange: { min: 2, max: 17 },
    deckNames: STRETCHED_DECK_NAMES,
    cabinRanges: STRETCHED_CABIN_RANGES,
    venues: [
      ...COMMON_EDGE_VENUES,
      {
        name: 'Craft Social',
        deck: 4,
        category: 'Bars & Lounges',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['Craft Social Bar'],
      },
      {
        name: 'Le Voyage by Daniel Boulud',
        deck: 4,
        category: 'Fine Dining',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['Le Voyage'],
      },
      {
        name: 'The Annex',
        deck: 5,
        category: 'Entertainment',
        side: 'starboard',
        zone: 'fwd',
        confidence: 'zone',
        aliases: ['Annex'],
      },
      ...EDEN_VENUES,
      ...STRETCHED_RETREAT_VENUES,
    ],
  },

  'celebrity-beyond': {
    shipId: 'celebrity-beyond',
    name: 'Celebrity Beyond',
    imoNumber: '9838395',
    cruiseLine: 'Celebrity Cruises',
    shipClass: 'Edge-class cruise ship',
    lengthMeters: 327,
    beamMeters: 39.5,
    grossTonnage: 141420,
    inServiceYear: 2022,
    totalDecks: 16,
    guestDecks: 15,
    deckRange: { min: 2, max: 17 },
    deckNames: STRETCHED_DECK_NAMES,
    cabinRanges: STRETCHED_CABIN_RANGES,
    venues: [
      ...COMMON_EDGE_VENUES,
      {
        name: 'Craft Social',
        deck: 4,
        category: 'Bars & Lounges',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['Craft Social Bar'],
      },
      {
        name: 'Le Voyage by Daniel Boulud',
        deck: 4,
        category: 'Fine Dining',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['Le Voyage'],
      },
      ...EDEN_VENUES,
      ...STRETCHED_RETREAT_VENUES,
    ],
  },

  'celebrity-apex': {
    shipId: 'celebrity-apex',
    name: 'Celebrity Apex',
    imoNumber: '9838383',
    cruiseLine: 'Celebrity Cruises',
    shipClass: 'Edge-class cruise ship',
    lengthMeters: 306,
    beamMeters: 39,
    grossTonnage: 130818,
    inServiceYear: 2020,
    totalDecks: 15,
    guestDecks: 14,
    deckRange: { min: 2, max: 16 },
    deckNames: ORIGINAL_DECK_NAMES,
    cabinRanges: ORIGINAL_CABIN_RANGES,
    venues: [
      ...COMMON_EDGE_VENUES,
      {
        name: 'Craft Social',
        deck: 4,
        category: 'Bars & Lounges',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['Craft Social Bar'],
      },
      ...EDEN_VENUES,
      ...ORIGINAL_RETREAT_VENUES,
    ],
  },

  'celebrity-edge': {
    shipId: 'celebrity-edge',
    name: 'Celebrity Edge',
    imoNumber: '9812705',
    cruiseLine: 'Celebrity Cruises',
    shipClass: 'Edge-class cruise ship',
    lengthMeters: 306,
    beamMeters: 39,
    grossTonnage: 130818,
    inServiceYear: 2018,
    totalDecks: 15,
    guestDecks: 14,
    deckRange: { min: 2, max: 16 },
    deckNames: ORIGINAL_DECK_NAMES,
    cabinRanges: ORIGINAL_CABIN_RANGES,
    venues: [
      ...COMMON_EDGE_VENUES,
      {
        name: 'Casino Bar',
        deck: 4,
        category: 'Bars & Lounges',
        side: 'port',
        zone: 'mid',
        confidence: 'zone',
        aliases: ['The Casino Bar'],
      },
      ...EDEN_VENUES,
      ...ORIGINAL_RETREAT_VENUES,
    ],
  },
};

// ------------------------------------------------------------- manifest ingestion & generation

/**
 * Ingests deck facts for a ship, merges with fleet-registry metadata, and validates the result.
 * @param {object} options
 * @param {string} options.shipId
 * @param {object} [options.fleetRegistry]
 * @param {object} [options.facts]
 * @returns {object} validated manifest
 */
export function ingestDeckFacts({ shipId, fleetRegistry, facts }) {
  const seedFacts = facts ?? EDGE_CLASS_FACTS[shipId];
  if (!seedFacts) {
    throw new Error(
      `No facts provided or known for shipId "${shipId}". Provide a facts object or file via --facts.`
    );
  }

  // Cross-check with fleet registry
  const registryShip = fleetRegistry ? findVesselInRegistry(fleetRegistry, shipId) : null;

  const manifest = {
    shipId: seedFacts.shipId ?? shipId,
    name: seedFacts.name ?? registryShip?.name,
    cruiseLine: seedFacts.cruiseLine ?? registryShip?.operator ?? 'Celebrity Cruises',
    shipClass: seedFacts.shipClass ?? registryShip?.shipClass ?? 'Edge-class cruise ship',
    imoNumber: seedFacts.imoNumber ?? registryShip?.imo,
    lengthMeters: seedFacts.lengthMeters ?? registryShip?.lengthMeters,
    beamMeters: seedFacts.beamMeters ?? registryShip?.beamMeters,
    grossTonnage: seedFacts.grossTonnage ?? registryShip?.grossTonnage,
    inServiceYear: seedFacts.inServiceYear ?? registryShip?.inServiceYear,
    totalDecks: seedFacts.totalDecks,
    guestDecks: seedFacts.guestDecks,
    deckRange: seedFacts.deckRange,
    deckNames: seedFacts.deckNames,
    cabinRanges: seedFacts.cabinRanges,
    venues: seedFacts.venues,
  };

  // If fleet registry had an IMO, verify match
  if (registryShip?.imo && manifest.imoNumber && registryShip.imo !== manifest.imoNumber) {
    throw new Error(
      `IMO mismatch for "${manifest.name}": registry has ${registryShip.imo}, but facts provide ${manifest.imoNumber}`
    );
  }

  return assertValidManifest(manifest);
}

// ------------------------------------------------------------- CLI execution

/**
 * Parses CLI arguments.
 * @param {string[]} argv
 * @returns {object}
 */
export function parseArgs(argv) {
  const args = {
    shipId: null,
    factsPath: null,
    outPath: null,
    registryPath: DEFAULT_REGISTRY_PATH,
    dryRun: false,
    all: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ship-id') {
      args.shipId = argv[++i];
    } else if (arg === '--facts') {
      args.factsPath = resolve(process.cwd(), argv[++i]);
    } else if (arg === '--out') {
      args.outPath = resolve(process.cwd(), argv[++i]);
    } else if (arg === '--registry') {
      args.registryPath = resolve(process.cwd(), argv[++i]);
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--all') {
      args.all = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  return args;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/ingest-deck-facts.mjs --ship-id <id> [options]
  node scripts/ingest-deck-facts.mjs --all [options]

Options:
  --ship-id <id>     Target ship ID (e.g. celebrity-xcel, celebrity-edge)
  --facts <path>     Path to custom structured facts JSON file
  --out <path>       Target output file path or directory (default: src/data/ships/<shipId>/manifest.json)
  --registry <path>  Path to fleet registry (default: public/data/fleet-registry.json)
  --dry-run          Validate schema and summarize without writing to disk
  --all              Generate/validate manifests for all 5 Edge-class ships
  --help, -h         Show this message
`);
}

async function writeManifestFile(manifest, outPath, dryRun) {
  const resolvedOut = outPath.endsWith('.json')
    ? outPath
    : resolve(outPath, `${manifest.shipId}/manifest.json`);

  const summary =
    `${manifest.name} (${manifest.shipId}): ${manifest.guestDecks} guest decks, ` +
    `${manifest.venues.length} venues, IMO ${manifest.imoNumber}, ${manifest.lengthMeters}m`;

  if (dryRun) {
    console.log(`[dry-run] VALID: ${summary} → ${resolvedOut}`);
    return;
  }

  await mkdir(dirname(resolvedOut), { recursive: true });
  await writeFile(resolvedOut, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[write] OK: ${summary} → ${resolvedOut}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.shipId && !args.all)) {
    printUsage();
    if (!args.help) process.exitCode = 1;
    return;
  }

  const registry = await loadFleetRegistryData(args.registryPath);

  let customFacts = null;
  if (args.factsPath) {
    const factsText = await readFile(args.factsPath, 'utf8');
    customFacts = JSON.parse(factsText);
  }

  const shipIds = args.all ? Object.keys(EDGE_CLASS_FACTS) : [args.shipId];

  for (const shipId of shipIds) {
    const facts = args.shipId === shipId && customFacts ? customFacts : undefined;
    const manifest = ingestDeckFacts({ shipId, fleetRegistry: registry, facts });
    const outPath = args.outPath || resolve(DEFAULT_OUT_DIR, `${shipId}/manifest.json`);
    await writeManifestFile(manifest, outPath, args.dryRun);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}
