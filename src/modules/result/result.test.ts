import { describe, expect, it } from 'vitest';
import { failure, isFailure, isSuccess, success } from './result';

describe('Result — Success/Failure construction', () => {
  it('success() produces a discriminated success value', () => {
    const result = success(42);
    expect(result).toEqual({ success: true, value: 42 });
  });

  it('failure() produces a discriminated failure value', () => {
    const result = failure('oops');
    expect(result).toEqual({ success: false, error: 'oops' });
  });

  it('isSuccess/isFailure narrow correctly', () => {
    const ok = success(1);
    const bad = failure('e');

    expect(isSuccess(ok)).toBe(true);
    expect(isFailure(ok)).toBe(false);
    expect(isSuccess(bad)).toBe(false);
    expect(isFailure(bad)).toBe(true);
  });
});
