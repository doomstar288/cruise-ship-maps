// Celebrity Xcel routing: the published pack's graph and the preset routes.

// Only `routing` is bundled; Vite tree-shakes the rest of the pack JSON.
import plan from '../../public/v1/ships/celebrity-xcel/plan.json' with { type: 'json' };
const { routing } = plan;
import { createRouter } from '../utils/shipRouter.js';
import { buildRoute } from '../utils/wayfinding.js';
import { CELEBRITY_XCEL_DECKS } from './celebrityXcelData.js';

export const CELEBRITY_XCEL_ROUTER = createRouter(routing);

const deckVenues = (level) => CELEBRITY_XCEL_DECKS.find((d) => d.level === level).venues;

/** First cabin of a class on a deck, so preset routes track the generated numbering. */
const firstCabin = (level, cabinClass, side) =>
  deckVenues(level).find((v) => v.cabinClass === cabinClass && (!side || v.side === side)).id;

export const SAMPLE_ROUTE_SPECS = [
  {
    id: 'route-1',
    from: { deck: 10, venueId: firstCabin(10, 'C2', 'Starboard') },
    to: { deck: 5, venueId: 'v5-magic-carpet' },
  },
  {
    id: 'route-2',
    from: { deck: 12, venueId: firstCabin(12, 'IC', 'Port') },
    to: { deck: 15, venueId: 'v15-sunset-bar' },
  },
  {
    id: 'route-3',
    from: { deck: 3, venueId: firstCabin(3, 'O2', 'Port') },
    to: { deck: 4, venueId: 'v4-theatre' },
  },
];

/** A route over the Xcel graph; throws when an end isn't routable. */
export const routeFor = (spec, options) =>
  buildRoute(CELEBRITY_XCEL_DECKS, CELEBRITY_XCEL_ROUTER, spec, options);
