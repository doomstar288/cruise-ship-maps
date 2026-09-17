// Celebrity Xcel deck dataset — fifth ship of Celebrity Cruises' Edge Series.

import { generateAllDecks } from './celebrityXcelFullDeckGenerator.js';

export const CELEBRITY_XCEL_METADATA = {
  id: "celebrity-xcel",
  name: "Celebrity Xcel",
  cruiseLine: "Celebrity Cruises",
  parentCorporation: "Royal Caribbean Group",
  shipClass: "Edge Series (Fifth Ship)",
  // Corrected from 9938430, which fails the IMO check-digit test (see
  // src/utils/imo.js) and therefore was never a valid IMO number.
  // Source: Wikidata Q137168318 (CC0), cross-checked via scripts/seed-fleet.mjs.
  imoNumber: "9884136",
  grossTonnage: 140600,
  lengthMeters: 327,
  beamMeters: 39,
  maxPassengers: 3276,
  crewCapacity: 1400,
  maidenVoyageYear: 2025,
  // 16 decks in all; the 15 guest decks are numbered 2–12 and 14–17.
  totalDecks: 16,
  guestDecks: 15,
  deckRange: { min: 2, max: 17 },
  iconicFeature: "Magic Carpet (Moving Cantilevered Platform)"
};

export const CELEBRITY_XCEL_DECKS = generateAllDecks();
