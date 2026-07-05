import { describe, it, expect } from 'vitest';
import { expectedPassword, checkPassword, localDateKey } from './password';

describe('daily password', () => {
  const day = new Date(2026, 5, 25); // 25 Jun 2026 (month is 0-based)

  it('formats as bridge + local YYYY-MM-DD', () => {
    expect(localDateKey(day)).toBe('2026-06-25');
    expect(expectedPassword(day)).toBe('bridge2026-06-25');
  });

  it('zero-pads single-digit month and day', () => {
    expect(expectedPassword(new Date(2027, 0, 3))).toBe('bridge2027-01-03');
  });

  it('accepts the correct password for the day (trim-tolerant)', () => {
    expect(checkPassword('bridge2026-06-25', day)).toBe(true);
    expect(checkPassword('  bridge2026-06-25  ', day)).toBe(true);
  });

  it("rejects another day's password and the bare keyword", () => {
    expect(checkPassword('bridge2026-06-24', day)).toBe(false);
    expect(checkPassword('bridge', day)).toBe(false);
    expect(checkPassword('', day)).toBe(false);
  });
});
