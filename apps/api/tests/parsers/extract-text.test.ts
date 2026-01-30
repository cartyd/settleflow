import { describe, it, expect } from 'vitest';
import { extractText } from '../../src/parsers/nvl/extractText.js';

describe('extractText', () => {
  it('splits content into trimmed non-empty pages by form feed', async () => {
    const content = ' Page 1 \f\n\n\tPage 2\n\f\n\n';
    const pages = await extractText(content);
    expect(pages).toEqual(['Page 1', 'Page 2']);
  });

  it('returns single page when no separator', async () => {
    const content = 'Only one page of text';
    const pages = await extractText(content);
    expect(pages).toEqual(['Only one page of text']);
  });

  it('filters out empty pages', async () => {
    const content = '\f\n\f';
    const pages = await extractText(content);
    expect(pages).toEqual([]);
  });
});
