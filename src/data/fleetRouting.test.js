import { describe, it, expect } from 'vitest';
import {
  getShipRouter,
  findCabinOfClass,
  getSampleRoutesForShip,
  routeOnShip,
} from './fleetRouting.js';
import { generateShip, AVAILABLE_SHIPS } from '../utils/shipGenerator.js';

describe('fleetRouting', () => {
  it('instantiates and caches a router for each available ship', () => {
    for (const ship of AVAILABLE_SHIPS) {
      const router = getShipRouter(ship.id);
      expect(router).toBeDefined();
      expect(typeof router.route).toBe('function');
      // Verify caching returns identical reference
      expect(getShipRouter(ship.id)).toBe(router);
    }
  });

  it('findCabinOfClass locates staterooms by level, class, and side', () => {
    const { decks } = generateShip('celebrity-xcel');
    const portCabin = findCabinOfClass(decks, 10, 'C2', 'Port');
    const starboardCabin = findCabinOfClass(decks, 10, 'C2', 'Starboard');

    expect(portCabin).toBeDefined();
    expect(starboardCabin).toBeDefined();
    expect(portCabin).not.toBe(starboardCabin);
  });

  it('generates valid sample routes with attached specs for every ship', () => {
    for (const ship of AVAILABLE_SHIPS) {
      const { decks } = generateShip(ship.id);
      const routes = getSampleRoutesForShip(ship.id, decks);

      expect(routes.length).toBeGreaterThanOrEqual(2);
      for (const route of routes) {
        expect(route.id).toContain(ship.id);
        expect(route.name).toContain('→');
        expect(route.distanceMeters).toBeGreaterThan(0);
        expect(route.estimatedMinutes).toBeGreaterThan(0);
        expect(route.steps.length).toBeGreaterThan(0);
        expect(route.spec).toBeDefined();
        expect(route.spec.from).toBeDefined();
        expect(route.spec.to).toBeDefined();
      }
    }
  });

  it('calculates step-free routes for ships avoiding stairs', () => {
    const { decks } = generateShip('celebrity-beyond');
    const standardRoutes = getSampleRoutesForShip('celebrity-beyond', decks, { stepFree: false });
    const stepFreeRoutes = getSampleRoutesForShip('celebrity-beyond', decks, { stepFree: true });

    expect(stepFreeRoutes.length).toBe(standardRoutes.length);
    for (const r of stepFreeRoutes) {
      expect(r.stepFree).toBe(true);
      // Step-free route should not instruct stairs
      for (const step of r.steps) {
        expect(step.toLowerCase()).not.toContain('take the stairs');
      }
    }
  });

  it('routeOnShip computes point-to-point wayfinding between any stateroom and venue', () => {
    const { decks } = generateShip('celebrity-apex');
    const spec = {
      id: 'apex-custom-route',
      from: { deck: 3 }, // nearest elevators
      to: { deck: 4, venueId: 'v4-theatre' },
    };

    const route = routeOnShip('celebrity-apex', decks, spec, { stepFree: true });
    expect(route).toBeDefined();
    expect(route.origin.deck).toBe(3);
    expect(route.destination.deck).toBe(4);
    expect(route.steps.length).toBeGreaterThan(0);
  });
});
