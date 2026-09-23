import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchCommandPalette from './SearchCommandPalette.jsx';
import { generateShip, AVAILABLE_SHIPS } from '../utils/shipGenerator.js';

describe('SearchCommandPalette', () => {
  const xcel = generateShip('celebrity-xcel');
  let mockClose;
  let mockOpen;
  let mockSelectShip;
  let mockSelectVenue;
  let mockRouteToVenue;
  let mockGoToDeck;

  beforeEach(() => {
    mockClose = vi.fn();
    mockOpen = vi.fn();
    mockSelectShip = vi.fn();
    mockSelectVenue = vi.fn();
    mockRouteToVenue = vi.fn();
    mockGoToDeck = vi.fn();
    localStorage.clear();
  });

  const renderPalette = (props = {}) => {
    return render(
      <SearchCommandPalette
        isOpen={true}
        onClose={mockClose}
        onOpen={mockOpen}
        currentShip={xcel.metadata}
        shipDecks={xcel.decks}
        availableShips={AVAILABLE_SHIPS}
        onSelectShip={mockSelectShip}
        onSelectVenue={mockSelectVenue}
        onRouteToVenue={mockRouteToVenue}
        onGoToDeck={mockGoToDeck}
        {...props}
      />
    );
  };

  it('renders modal dialog when isOpen is true with proper ARIA attributes', () => {
    renderPalette();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Search ship venues and cabins');
    expect(screen.getByPlaceholderText(/Cabin number/i)).toBeDefined();
  });

  it('does not render when isOpen is false', () => {
    const { container } = renderPalette({ isOpen: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders Smart Cabin Decoder Preview Card for numeric query 8124', () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/Cabin number/i);
    fireEvent.change(input, { target: { value: '8124' } });

    // Verify Telemetry title & badges
    expect(screen.getByText(/Cabin 8124 Telemetry/i)).toBeDefined();
    expect(screen.getAllByText(/Deck 8/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Starboard Side/i)).toBeDefined();
    expect(screen.getByText(/Forward/i)).toBeDefined();
    expect(screen.getByText(/Veranda/i)).toBeDefined();

    // Verify Quick Actions
    const showBtn = screen.getByRole('button', { name: /Show on Map/i });
    expect(showBtn).toBeDefined();
    fireEvent.click(showBtn);

    expect(mockGoToDeck).toHaveBeenCalledWith(8);
    expect(mockSelectVenue).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('triggers Route To Here quick action for cabin query', () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/Cabin number/i);
    fireEvent.change(input, { target: { value: '10101' } });

    expect(screen.getByText(/Port Side/i)).toBeDefined();

    const routeBtn = screen.getByRole('button', { name: /Route To Here/i });
    fireEvent.click(routeBtn);

    expect(mockRouteToVenue).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('renders Cross-Ship availability card for "Lawn Club"', () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/Cabin number/i);
    fireEvent.change(input, { target: { value: 'Lawn Club' } });

    expect(screen.getByText(/The Lawn Club/i)).toBeDefined();
    expect(screen.getByText(/Solstice Class \(5 ships\)/i)).toBeDefined();
  });

  it('renders Cross-Ship 1-click switch button for "Eden" on Celebrity Xcel', () => {
    renderPalette();
    const input = screen.getByPlaceholderText(/Cabin number/i);
    fireEvent.change(input, { target: { value: 'Eden' } });

    const switchBtn = screen.getByRole('button', { name: /Switch to Celebrity Beyond/i });
    expect(switchBtn).toBeDefined();

    fireEvent.click(switchBtn);
    expect(mockSelectShip).toHaveBeenCalledWith('celebrity-beyond');
    expect(mockClose).toHaveBeenCalled();
  });

  it('filters results by category tab', () => {
    renderPalette();
    const diningTab = screen.getByRole('tab', { name: /^Dining$/i });
    fireEvent.click(diningTab);
    expect(diningTab.classList.contains('active')).toBe(true);

    const input = screen.getByPlaceholderText(/Cabin number/i);
    fireEvent.change(input, { target: { value: 'Luminae' } });

    expect(screen.getByText('Luminae at The Retreat')).toBeDefined();
  });

  it('manages recent searches and clear history', () => {
    localStorage.setItem('cm_recent_searches', JSON.stringify(['8124', 'Sunset Bar']));
    renderPalette();

    expect(screen.getByText('8124')).toBeDefined();
    expect(screen.getByText('Sunset Bar')).toBeDefined();

    const clearBtn = screen.getByRole('button', { name: /Clear recent searches/i });
    fireEvent.click(clearBtn);

    expect(screen.queryByText('Sunset Bar')).toBeNull();
  });

  it('closes dialog on Escape key and backdrop click', () => {
    const { container } = renderPalette();
    const backdrop = container.querySelector('.command-palette-backdrop');

    fireEvent.click(backdrop);
    expect(mockClose).toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it('hands the cabin\'s own deck to the route callback, not the deck on screen', () => {
    // A cabin the guest searches for while looking at some other deck: the
    // callback payload has to carry Deck 10, or App falls back to what is shown.
    const deck10 = xcel.decks.find((d) => d.level === 10);
    const cabin = deck10.venues.find((v) => v.cabinClass);
    renderPalette();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: String(cabin.label) } });
    fireEvent.click(screen.getByRole('button', { name: /Route To Here/i }));

    const [venueArg] = mockRouteToVenue.mock.calls[0];
    expect(venueArg.deck?.level).toBe(10);
  });
});
