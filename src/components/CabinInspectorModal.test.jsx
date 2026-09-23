import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CabinInspectorModal from './CabinInspectorModal.jsx';
import { generateShip } from '../utils/shipGenerator.js';
import { ACCURACY_SOURCES } from '../utils/multiSourceDataConsensus.js';

const { decks } = generateShip('celebrity-xcel');

/** A cabin with both a square footage and a veranda, plus the deck it sits on. */
function cabinOnDeck(level) {
  const deck = decks.find((d) => d.level === level);
  const venue = deck.venues.find((v) => v.cabinClass && v.sqft && v.verandaSqft);
  return { venue: { ...venue, deck }, deck };
}

const renderInspector = ({ venue, deck }) =>
  render(
    <CabinInspectorModal
      venue={venue}
      deck={deck}
      onClose={vi.fn()}
      onStartWayfinding={vi.fn()}
      onRouteFromHere={vi.fn()}
    />
  );

describe('CabinInspectorModal', () => {
  it('shows the consensus score and source count from the consensus engine', () => {
    const { venue, deck } = cabinOnDeck(10);
    renderInspector({ venue, deck });

    // calculateSourceConsensus reports a score and a count; both have to reach
    // the UI as numbers rather than as blanks from mistyped field names.
    expect(screen.getByText(/Multi-Source Verified: \d+%/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`\\d+/${ACCURACY_SOURCES.length} sources`))
    ).toBeInTheDocument();
    expect(screen.queryByText(/Multi-Source Verified:\s*$/)).not.toBeInTheDocument();
  });

  it('interpolates the veranda square footage instead of printing the expression', () => {
    const { venue, deck } = cabinOnDeck(10);
    renderInspector({ venue, deck });

    expect(screen.getByText(new RegExp(`\\+${venue.verandaSqft} sq ft veranda`))).toBeInTheDocument();
    expect(screen.queryByText(/\{venue\.verandaSqft\}/)).not.toBeInTheDocument();
  });

  it('headlines the deck it was handed, so it cannot contradict its own description', () => {
    const { venue, deck } = cabinOnDeck(10);
    renderInspector({ venue, deck });

    // The strap line under the title is the deck the guest reads first; it has
    // to agree with the "…on Deck 10" sentence in the body.
    const strapline = screen.getByRole('heading', { name: venue.name }).nextSibling;
    expect(strapline).toHaveTextContent(/^Deck 10 ·/);
    expect(strapline).not.toHaveTextContent(/Deck 5\b/);
  });
});
