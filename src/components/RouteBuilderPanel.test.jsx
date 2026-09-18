import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RouteBuilderPanel from './RouteBuilderPanel.jsx';
import { generateShip } from '../utils/shipGenerator.js';
import { routeOnShip } from '../data/fleetRouting.js';

const { decks } = generateShip('celebrity-xcel');
const deck5 = decks.find((d) => d.level === 5);

const renderPanel = (activeRoute) =>
  render(
    <RouteBuilderPanel
      decks={decks}
      currentDeck={deck5}
      activeRoute={activeRoute}
      routeSpec={activeRoute?.spec ?? null}
      onBuildRoute={vi.fn()}
      onClearRoute={vi.fn()}
      stepFree={false}
      onToggleStepFree={vi.fn()}
      onGoToDeck={vi.fn()}
    />
  );

describe('RouteBuilderPanel route summary', () => {
  it('counts the lift/stair hops rather than stringifying the hop list', () => {
    const route = routeOnShip(
      'celebrity-xcel',
      decks,
      { id: 't', from: { deck: 5 }, to: { deck: 10, venueId: 'c10-10101' } },
      {}
    );
    // buildRoute reports deckChanges as a list of {mode, fromDeck, toDeck}.
    expect(Array.isArray(route.deckChanges)).toBe(true);
    expect(route.deckChanges.length).toBe(1);

    renderPanel(route);

    expect(screen.getByText('1 Deck Change')).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });

  it('calls a route that stays on one deck a single-deck route', () => {
    const sameDeck = routeOnShip(
      'celebrity-xcel',
      decks,
      { id: 't', from: { deck: 5 }, to: { deck: 5, venueId: 'v5-grand-plaza' } },
      {}
    );
    renderPanel(sameDeck);

    expect(screen.getByText('Single Deck')).toBeInTheDocument();
  });
});
