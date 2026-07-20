import { describe, expect, it } from 'vitest';
import { deepClone } from './deepClone';

describe('deepClone', () => {
  it('produces a deeply-equal but distinct object, including nested structures', () => {
    const original = { a: 1, nested: { b: 2, list: [1, 2, { c: 3 }] } };
    const clone = deepClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.nested).not.toBe(original.nested);
    expect(clone.nested.list).not.toBe(original.nested.list);
  });

  it('is unaffected by later mutation of the original, and vice versa', () => {
    const original = { nested: { value: 1 } };
    const clone = deepClone(original);

    original.nested.value = 999;
    expect(clone.nested.value).toBe(1);

    clone.nested.value = 42;
    expect(original.nested.value).toBe(999);
  });
});
