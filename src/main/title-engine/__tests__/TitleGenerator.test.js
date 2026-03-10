/**
 * TitleGenerator Tests
 * Verifies eBay.de title generation follows guidelines:
 * - Character limit: > 70 and < 80 (71-79 characters)
 * - Structure: [Cartridge Model] + [Category] + Kompatibel für + [Brand] + [Printer Model] + [Qty] + [Color]
 * - No forbidden characters: < > ! * @
 */
import { describe, it, expect } from 'vitest';
import TitleGenerator from '../TitleGenerator.js';
import TitleSanitizer from '../TitleSanitizer.js';

describe('TitleGenerator', () => {
  describe('Character Length Requirements', () => {
    it('should have MIN_LENGTH of 71', () => {
      expect(TitleGenerator.MIN_LENGTH).toBe(71);
    });

    it('should have MAX_LENGTH of 79', () => {
      expect(TitleGenerator.MAX_LENGTH).toBe(79);
    });
  });

  describe('Title Generation', () => {
    const testCases = [
      {
        input: '1x C332 46508712 Toner Schwarz kompatibel für OKI MC363',
        expectedMaxLength: 79,
        shouldContain: ['C332', 'Toner', 'OKI']
      },
      {
        input: 'TN-2420 Toner kompatibel für Brother MFC-L2710DW DCP-L2530DW',
        expectedMaxLength: 79,
        shouldContain: ['TN-2420', 'Toner', 'Brother']
      },
      {
        input: 'Toner TN-423 Kompatibel für Brother HL-L8260 HL-L8260CDW HL-L8360',
        expectedMaxLength: 79,
        shouldContain: ['TN-423', 'Toner', 'Brother']
      },
      {
        input: '87A CF287A Toner kompatibel für HP Laserjet Enterprise M506dh M506dn',
        expectedMaxLength: 79,
        shouldContain: ['CF287A', 'Toner', 'HP']
      }
    ];

    testCases.forEach(({ input, expectedMaxLength, shouldContain }) => {
      it(`should generate valid title for: "${input.substring(0, 50)}..."`, () => {
        const result = TitleGenerator.generate({ title: input }, new Set());

        expect(result.candidates).toBeDefined();
        expect(result.candidates.length).toBeGreaterThan(0);

        const title = result.candidates[0];

        // Check max length is enforced
        expect(title.length).toBeLessThanOrEqual(expectedMaxLength);

        // Check contains required keywords
        shouldContain.forEach(keyword => {
          expect(title.toUpperCase()).toContain(keyword.toUpperCase());
        });
      });
    });
  });

  describe('Title Structure', () => {
    it('should place cartridge model at the beginning', () => {
      const result = TitleGenerator.generate({
        title: 'Toner TN-2420 kompatibel für Brother MFC-L2710DW Schwarz'
      }, new Set());

      expect(result.candidates.length).toBeGreaterThan(0);
      const title = result.candidates[0];

      // Cartridge model should be near the start (within first 20 chars)
      const cartridgePos = title.toUpperCase().indexOf('TN-2420');
      expect(cartridgePos).toBeLessThan(20);
    });

    it('should include "Kompatibel Für" in compatible products', () => {
      const result = TitleGenerator.generate({
        title: 'TN-2420 Toner für Brother MFC-L2710DW'
      }, new Set());

      expect(result.candidates.length).toBeGreaterThan(0);
      const title = result.candidates[0];

      expect(title.toLowerCase()).toContain('kompatibel');
    });
  });

  describe('Forbidden Characters', () => {
    it('should not contain forbidden characters', () => {
      const result = TitleGenerator.generate({
        title: 'TN-2420 Toner! <Best> @Sale* für Brother MFC-L2710DW'
      }, new Set());

      expect(result.candidates.length).toBeGreaterThan(0);
      const title = result.candidates[0];

      expect(title).not.toMatch(/[<>!*@]/);
    });
  });
});

describe('TitleSanitizer', () => {
  describe('Forbidden Characters', () => {
    it('should remove < > ! * @ characters', () => {
      const input = 'Test <title> with! @forbidden* chars';
      const result = TitleSanitizer.sanitize(input);

      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('!');
      expect(result).not.toContain('@');
      expect(result).not.toContain('*');
    });
  });

  describe('Validation', () => {
    it('should flag titles with 70 or fewer characters', () => {
      const shortTitle = 'A'.repeat(70);
      const issues = TitleSanitizer.validate(shortTitle);

      expect(issues.some(i => i.includes('more than 70'))).toBe(true);
    });

    it('should flag titles with 80 or more characters', () => {
      const longTitle = 'A'.repeat(80);
      const issues = TitleSanitizer.validate(longTitle);

      expect(issues.some(i => i.includes('less than 80'))).toBe(true);
    });

    it('should accept titles between 71-79 characters', () => {
      const validTitle = 'A'.repeat(75);
      const issues = TitleSanitizer.validate(validTitle);

      const lengthIssues = issues.filter(i =>
        i.includes('70') || i.includes('80')
      );
      expect(lengthIssues.length).toBe(0);
    });
  });
});
