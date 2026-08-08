// Celebrity Xcel Geospatial Deck Data & Open API Dataset (All 17 Decks)
// Flagship Edge-Class Vessel - Celebrity Cruises (Royal Caribbean Group)

import { generateAll17Decks } from './celebrityXcelFullDeckGenerator';

export const CELEBRITY_XCEL_METADATA = {
  id: "celebrity-xcel",
  name: "Celebrity Xcel",
  cruiseLine: "Celebrity Cruises",
  parentCorporation: "Royal Caribbean Group",
  shipClass: "Edge Class (Fifth Vessel)",
  imoNumber: "9938430",
  grossTonnage: 140600,
  lengthMeters: 327,
  beamMeters: 39,
  maxPassengers: 3260,
  crewCapacity: 1400,
  maidenVoyageYear: 2025,
  totalDecks: 17,
  deckRange: { min: 1, max: 17 },
  iconicFeature: "Magic Carpet (Moving Cantilevered Platform)"
};

export const CELEBRITY_XCEL_DECKS = generateAll17Decks();

export const SAMPLE_WAYFINDING_ROUTES = [
  {
    id: "route-1",
    name: "Stateroom 10101 to Magic Carpet (Deck 5)",
    origin: { deck: 10, name: "Stateroom 10101", coords: [167, 77] },
    destination: { deck: 5, name: "Magic Carpet Platform", coords: [175, 101] },
    distanceMeters: 85,
    estimatedMinutes: 3,
    steps: [
      "Exit Stateroom 10101 into Corridor",
      "Walk 20m Midship to Elevator Bank B",
      "Take Elevator down from Deck 10 to Deck 5",
      "Step out on Deck 5 Starboard and walk 10m to Magic Carpet Entrance"
    ]
  },
  {
    id: "route-2",
    name: "Iconic Suite 12101 to Sunset Bar (Deck 15)",
    origin: { deck: 12, name: "Iconic Suite 12101", coords: [35, 31] },
    destination: { deck: 15, name: "Sunset Bar", coords: [292, 50] },
    distanceMeters: 220,
    estimatedMinutes: 6,
    steps: [
      "Exit Iconic Suite 12101 into Forward Suite Lobby",
      "Take Forward Elevator Bank A up from Deck 12 to Deck 15",
      "Walk Aft past Fitness Center and Rooftop Garden to Sunset Bar Terrace"
    ]
  },
  {
    id: "route-3",
    name: "Stateroom 3101 to The Theatre (Deck 4)",
    origin: { deck: 3, name: "Stateroom 3101", coords: [46, 25] },
    destination: { deck: 4, name: "The Theatre at Xcel", coords: [50, 50] },
    distanceMeters: 45,
    estimatedMinutes: 2,
    steps: [
      "Walk Forward from Stateroom 3101 to Forward Elevator Bank A",
      "Take Elevator or Stairs up to Deck 4",
      "Enter Main Foyer of The Theatre at Xcel"
    ]
  }
];
