import { describe, it, expect } from 'vitest';
import { parseAdvance } from '../../src/parsers/nvl/advance.parser.js';

describe('Advance Parser', () => {
  it('parses COMDATA advance with table amount', () => {
    const text = `
FOR DATA ENTRY USE
G/L #   AMOUNT
2032-01  1,033.00

TRIP NUMBER
1854
ACCOUNT NUMBER
03101
DRIVER--> BIDETTI, DONNY
DATE--> 120525
COMDATA
`;

    const result = parseAdvance(text);
    expect(result.errors).toHaveLength(0);
    expect(result.lines).toHaveLength(1);

    const line = result.lines[0];
    expect(line.tripNumber).toBe('1854');
    expect(line.accountNumber).toBe('3101');
    expect(line.driverName).toContain('BIDETTI');
    expect(line.advanceAmount).toBe(1033.00);
    expect(line.description).toBe('COMDATA');
    expect(line.date).toBe('2025-12-05');
  });

  it('handles TOTAL CHARGE fallback', () => {
    const text = `
TOTAL
 CHARGE
357059 COD ... 1003.00     30.00   1033.00
TRIP NUMBER 1854
ACCOUNT NUMBER 03101
DATE 120525
`;
    const result = parseAdvance(text);
    expect(result.lines[0].advanceAmount).toBe(1033.00);
  });
});
