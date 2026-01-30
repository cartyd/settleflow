import { describe, it, expect } from 'vitest';
import { parseDriverName } from '../../../src/parsers/utils/name-parser.js';

describe('name-parser', () => {
  it('parses comma-separated Last, First', () => {
    expect(parseDriverName('SMITH, JOHN')).toEqual({ firstName: 'JOHN', lastName: 'SMITH' });
  });

  it('parses space-separated First Last', () => {
    expect(parseDriverName('Jane Doe')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });

  it('handles single name and blanks', () => {
    expect(parseDriverName('SMITH')).toEqual({ lastName: 'SMITH' });
    expect(parseDriverName('   ')).toEqual({});
  });
});
