import { describe, it, expect } from 'vitest';
import {
  decodeCabinNumber,
  findCabinInDecks,
  findFleetAmenity,
  CABIN_CATEGORIES,
} from './cabinDecoder.js';
import { generateShip } from './shipGenerator.js';

describe('cabinDecoder', () => {
  describe('decodeCabinNumber - Edge Class cabin numbers', () => {
    it('decodes standard Edge stateroom 8124 (Deck 8, Starboard, Forward, Veranda)', () => {
      const result = decodeCabinNumber('8124');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(8);
      expect(result.side).toBe('Starboard'); // 8124 is even
      expect(result.zone).toBe('Forward'); // 124 < 180
      expect(result.cabinNumber).toBe('8124');
      expect(result.fullId).toBe('c8-8124');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.VERANDA);
    });

    it('decodes Edge stateroom 10101 (Deck 10, Port, Forward, Concierge)', () => {
      const result = decodeCabinNumber('10101');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(10);
      expect(result.side).toBe('Port'); // 10101 is odd
      expect(result.zone).toBe('Forward'); // 101 < 180
      expect(result.cabinNumber).toBe('10101');
      expect(result.fullId).toBe('c10-10101');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.CONCIERGE);
    });

    it('decodes prefixed format c10-10100 (Deck 10, Starboard, Forward)', () => {
      const result = decodeCabinNumber('c10-10100');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(10);
      expect(result.side).toBe('Starboard');
      expect(result.zone).toBe('Forward');
      expect(result.cabinNumber).toBe('10100');
      expect(result.fullId).toBe('c10-10100');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.CONCIERGE);
    });

    it('decodes Edge high suite 15102 (Deck 15, Starboard, Suite)', () => {
      const result = decodeCabinNumber('15102');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(15);
      expect(result.side).toBe('Starboard');
      expect(result.zone).toBe('Forward');
      expect(result.fullId).toBe('c15-15102');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.SUITE);
    });

    it('decodes Edge aft stateroom 9350 (Deck 9, Starboard, Aft)', () => {
      const result = decodeCabinNumber('9350');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(9);
      expect(result.side).toBe('Starboard');
      expect(result.zone).toBe('Aft'); // 350 >= 280
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.CONCIERGE);
    });

    it('decodes Edge midship stateroom 6240 (Deck 6, Starboard, Midship)', () => {
      const result = decodeCabinNumber('6240');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(6);
      expect(result.side).toBe('Starboard');
      expect(result.zone).toBe('Midship'); // 180 <= 240 < 280
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.VERANDA);
    });
  });

  describe('decodeCabinNumber - Solstice Class cabin numbers', () => {
    it('decodes Solstice midship stateroom 7206 (Deck 7, Starboard, Midship, Veranda)', () => {
      const result = decodeCabinNumber('7206');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(7);
      expect(result.side).toBe('Starboard');
      expect(result.zone).toBe('Midship'); // 206 between 180 and 279
      expect(result.cabinNumber).toBe('7206');
      expect(result.fullId).toBe('c7-7206');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.VERANDA);
    });

    it('decodes Solstice lower hull cabin 2150 (Deck 2, Starboard, Ocean View)', () => {
      const result = decodeCabinNumber('2150');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(2);
      expect(result.side).toBe('Starboard');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.OCEAN_VIEW);
    });

    it('decodes Solstice oceanview stateroom 3105 (Deck 3, Port, Forward, Ocean View)', () => {
      const result = decodeCabinNumber('3105');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(3);
      expect(result.side).toBe('Port');
      expect(result.zone).toBe('Forward');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.OCEAN_VIEW);
    });

    it('decodes Solstice aft concierge stateroom 9285 (Deck 9, Port, Aft)', () => {
      const result = decodeCabinNumber('9285');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(9);
      expect(result.side).toBe('Port');
      expect(result.zone).toBe('Aft'); // 285 >= 280
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.CONCIERGE);
    });

    it('decodes Solstice AquaClass stateroom 11200 (Deck 11, Starboard, Midship, AquaClass)', () => {
      const result = decodeCabinNumber('11200');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(11);
      expect(result.side).toBe('Starboard');
      expect(result.zone).toBe('Midship');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.AQUA_CLASS);
    });
  });

  describe('decodeCabinNumber - Millennium Class cabin numbers', () => {
    it('decodes Millennium forward veranda 6135 (Deck 6, Port, Forward)', () => {
      const result = decodeCabinNumber('6135');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(6);
      expect(result.side).toBe('Port');
      expect(result.zone).toBe('Forward');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.VERANDA);
    });

    it('decodes Millennium midship stateroom 7180 (Deck 7, Starboard, Midship)', () => {
      const result = decodeCabinNumber('7180');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(7);
      expect(result.side).toBe('Starboard');
      expect(result.zone).toBe('Midship');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.VERANDA);
    });

    it('decodes Millennium stateroom 8045 (Deck 8, Port, Forward)', () => {
      const result = decodeCabinNumber('8045');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(8);
      expect(result.side).toBe('Port');
      expect(result.zone).toBe('Forward');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.VERANDA);
    });

    it('decodes Millennium concierge stateroom 9080 (Deck 9, Starboard, Forward)', () => {
      const result = decodeCabinNumber('9080');
      expect(result.isValid).toBe(true);
      expect(result.deckLevel).toBe(9);
      expect(result.side).toBe('Starboard');
      expect(result.zone).toBe('Forward');
      expect(result.suggestedCategory).toBe(CABIN_CATEGORIES.CONCIERGE);
    });
  });

  describe('decodeCabinNumber - Input variations & sanitization', () => {
    it('handles numeric input type', () => {
      const result = decodeCabinNumber(8124);
      expect(result.isValid).toBe(true);
      expect(result.cabinNumber).toBe('8124');
      expect(result.deckLevel).toBe(8);
    });

    it('handles leading and trailing whitespace', () => {
      const result = decodeCabinNumber('   8124   ');
      expect(result.isValid).toBe(true);
      expect(result.cabinNumber).toBe('8124');
    });

    it('handles hash prefix #7206', () => {
      const result = decodeCabinNumber('#7206');
      expect(result.isValid).toBe(true);
      expect(result.cabinNumber).toBe('7206');
      expect(result.deckLevel).toBe(7);
    });

    it('handles natural speech like "Cabin 8124" and "Stateroom 7206"', () => {
      const r1 = decodeCabinNumber('Cabin 8124');
      expect(r1.isValid).toBe(true);
      expect(r1.cabinNumber).toBe('8124');

      const r2 = decodeCabinNumber('Stateroom 7206');
      expect(r2.isValid).toBe(true);
      expect(r2.cabinNumber).toBe('7206');
    });

    it('handles letter suffix such as 8124A', () => {
      const result = decodeCabinNumber('8124A');
      expect(result.isValid).toBe(true);
      expect(result.cabinNumber).toBe('8124A');
      expect(result.side).toBe('Starboard');
      expect(result.fullId).toBe('c8-8124A');
    });

    it('honors category keywords in query string', () => {
      const rInside = decodeCabinNumber('8124 inside');
      expect(rInside.suggestedCategory).toBe(CABIN_CATEGORIES.INSIDE);

      const rSuite = decodeCabinNumber('8124 suite');
      expect(rSuite.suggestedCategory).toBe(CABIN_CATEGORIES.SUITE);

      const rAqua = decodeCabinNumber('10101 aqua');
      expect(rAqua.suggestedCategory).toBe(CABIN_CATEGORIES.AQUA_CLASS);
    });
  });

  describe('decodeCabinNumber - Invalid inputs', () => {
    it('returns isValid: false for null, undefined, and empty string', () => {
      expect(decodeCabinNumber(null).isValid).toBe(false);
      expect(decodeCabinNumber(undefined).isValid).toBe(false);
      expect(decodeCabinNumber('').isValid).toBe(false);
      expect(decodeCabinNumber('   ').isValid).toBe(false);
    });

    it('returns isValid: false for non-cabin alphabetic query', () => {
      expect(decodeCabinNumber('Sunset Bar').isValid).toBe(false);
      expect(decodeCabinNumber('Oceanview').isValid).toBe(false);
      expect(decodeCabinNumber('The Grand Plaza').isValid).toBe(false);
    });

    it('returns isValid: false for too short or too long numbers', () => {
      expect(decodeCabinNumber('12').isValid).toBe(false); // only 2 digits
      expect(decodeCabinNumber('999999').isValid).toBe(false); // 6 digits
    });

    it('returns isValid: false for impossible deck levels', () => {
      expect(decodeCabinNumber('99100').isValid).toBe(false); // Deck 99
      expect(decodeCabinNumber('35100', { totalDecks: 17 }).isValid).toBe(false);
    });
  });

  describe('findCabinInDecks', () => {
    const xcel = generateShip('celebrity-xcel');

    it('finds exact matching stateroom in Celebrity Xcel deck vector data', () => {
      const match = findCabinInDecks(xcel.decks, '8124');
      expect(match.decoded.isValid).toBe(true);
      expect(match.deck).toBeDefined();
      expect(match.deck.level).toBe(8);
      expect(match.isExactMatch).toBe(true);
      expect(match.venue).toBeDefined();
      expect(match.venue.id).toBe('c8-8124');
      expect(match.venue.name).toContain('8124');
    });

    it('finds stateroom on Deck 3 in Celebrity Xcel', () => {
      const match = findCabinInDecks(xcel.decks, '3101');
      expect(match.decoded.isValid).toBe(true);
      expect(match.deck.level).toBe(3);
      expect(match.isExactMatch).toBe(true);
      expect(match.venue.id).toBe('c3-3101');
      expect(match.venue.side).toBe('Port');
    });

    it('synthesizes decoded preview venue when cabin is not in active vector data', () => {
      // 8999 does not exist on Deck 8
      const match = findCabinInDecks(xcel.decks, '8999');
      expect(match.decoded.isValid).toBe(true);
      expect(match.deck.level).toBe(8);
      expect(match.isExactMatch).toBe(false);
      expect(match.venue).toBeDefined();
      expect(match.venue.isSimulatedPreview).toBe(true);
      expect(match.venue.id).toBe('c8-8999');
      expect(match.venue.side).toBe('Port'); // 8999 is odd
    });

    it('handles non-existent decks and invalid queries gracefully', () => {
      const invalidQuery = findCabinInDecks(xcel.decks, 'Martini Bar');
      expect(invalidQuery.isExactMatch).toBe(false);
      expect(invalidQuery.venue).toBeNull();
      expect(invalidQuery.decoded.isValid).toBe(false);

      const nullDecks = findCabinInDecks(null, '8124');
      expect(nullDecks.venue).toBeNull();
    });
  });

  describe('findFleetAmenity - Signature Fleet Venues & Cross-Ship Availability', () => {
    it('detects The Lawn Club as exclusive to Solstice Class (5 ships)', () => {
      const amenity = findFleetAmenity('Lawn Club', 'celebrity-xcel');
      expect(amenity).not.toBeNull();
      expect(amenity.name).toBe('The Lawn Club');
      expect(amenity.shipClass).toBe('Solstice Class');
      expect(amenity.shipCount).toBe(5);
      expect(amenity.isOnCurrentShip).toBe(false);
    });

    it('detects Magic Carpet as present on Celebrity Xcel (Edge Series)', () => {
      const amenity = findFleetAmenity('Magic Carpet', 'celebrity-xcel');
      expect(amenity).not.toBeNull();
      expect(amenity.isOnCurrentShip).toBe(true);
      expect(amenity.shipClass).toBe('Edge Series');
      expect(amenity.shipCount).toBe(5);
    });

    it('detects Eden as absent on Celebrity Xcel and offers switch to Edge sisters', () => {
      const amenity = findFleetAmenity('Eden', 'celebrity-xcel');
      expect(amenity).not.toBeNull();
      expect(amenity.isOnCurrentShip).toBe(false);
      expect(amenity.switchTargetShipId).toBe('celebrity-beyond');
      expect(amenity.customNote).toContain('The Bazaar');
    });

    it('detects Le Voyage availability', () => {
      const onXcel = findFleetAmenity('Le Voyage', 'celebrity-xcel');
      expect(onXcel.isOnCurrentShip).toBe(true);

      const onEdge = findFleetAmenity('Le Voyage', 'celebrity-edge');
      expect(onEdge.isOnCurrentShip).toBe(false);
      expect(onEdge.switchTargetShipId).toBe('celebrity-beyond');
    });

    it('detects fleetwide staples Sunset Bar and Martini Bar', () => {
      const sunset = findFleetAmenity('Sunset Bar', 'celebrity-xcel');
      expect(sunset.isOnCurrentShip).toBe(true);
      expect(sunset.shipCount).toBe(14);

      const martini = findFleetAmenity('Martini Bar', 'celebrity-xcel');
      expect(martini.isOnCurrentShip).toBe(true);
    });
  });
});
