import { describe, it, expect } from 'vitest';
import { parsePostingTicket } from '../../src/parsers/nvl/posting-ticket.parser.js';

describe('Posting Ticket Parser', () => {
  it('parses debit amount and header fields', () => {
    const text = `
12/10/25
PT NUMBER
256483
ACCOUNT
NUMBER
3101
DEBIT
CICEROS' MOVING & ST\t3101\t10.00
OTHER CHARGES
`;
    const result = parsePostingTicket(text);
    expect(result.errors).toHaveLength(0);
    expect(result.lines).toHaveLength(1);

    const line = result.lines[0];
    expect(line.ptNumber).toBe('256483');
    expect(line.accountNumber).toBe('3101');
    expect(line.debitAmount).toBe(10.00);
    expect(line.description).toContain('OTHER CHARGES');
    expect(line.date).toBe('2025-12-10');
  });

  it('supports comma-separated and negative amounts', () => {
    const text = `
01/15/26
PT NUMBER 999999
ACCOUNT NUMBER 3101
DEBIT
something here 1,234.56-
`;
    const result = parsePostingTicket(text);
    expect(result.lines[0].debitAmount).toBe(-1234.56);
  });
});
