import { describe, it, expect } from 'vitest';
import { extractAuthorId } from './authorId.js';

describe('extractAuthorId', () => {
  it('extrae el ID de una URL .es con parámetros extra', () => {
    expect(extractAuthorId('https://scholar.google.es/citations?user=Jqb-LMgAAAAJ&hl=es')).toBe(
      'Jqb-LMgAAAAJ'
    );
  });

  it('extrae el ID de una URL .com con oi=ao', () => {
    expect(
      extractAuthorId('https://scholar.google.com/citations?user=bF8vZlQAAAAJ&hl=es&oi=ao')
    ).toBe('bF8vZlQAAAAJ');
  });

  it('rechaza una URL sin parámetro user', () => {
    expect(() => extractAuthorId('https://scholar.google.es/citations?hl=es')).toThrow();
  });

  it('rechaza una URL que no es de Scholar', () => {
    expect(() => extractAuthorId('https://example.com/?user=123')).toThrow();
  });

  it('rechaza un ID con formato inesperado', () => {
    expect(() => extractAuthorId('https://scholar.google.es/citations?user=abc')).toThrow();
  });
});
