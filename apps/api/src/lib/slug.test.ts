import { describe, expect, it } from 'vitest';
import { slugify } from './slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Intro to React')).toBe('intro-to-react');
  });

  it('drops punctuation and accents', () => {
    expect(slugify('  Café: SQL & Data!! ')).toBe('cafe-sql-data');
  });

  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('course');
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(79)} bbb`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});
