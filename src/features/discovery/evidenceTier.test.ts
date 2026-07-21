import { describe, expect, it } from 'vitest';
import { classifyEvidence } from './evidenceTier';

describe('classifyEvidence — deterministic evidence-strength classification (M25)', () => {
  it('classifies a score of exactly 0 as no evidence at all', () => {
    expect(classifyEvidence(0)).toBe('none');
  });

  it('classifies a score just above 0 as weak evidence', () => {
    expect(classifyEvidence(0.01)).toBe('weak');
  });

  it('classifies a score just below the weak/some boundary as weak evidence', () => {
    expect(classifyEvidence(19.99)).toBe('weak');
  });

  it('classifies a score at the weak/some boundary (20) as some evidence — the boundary is inclusive', () => {
    expect(classifyEvidence(20)).toBe('some');
  });

  it('classifies a score just below the some/strong boundary as some evidence', () => {
    expect(classifyEvidence(49.99)).toBe('some');
  });

  it('classifies a score at the some/strong boundary (50) as strong evidence — the boundary is inclusive', () => {
    expect(classifyEvidence(50)).toBe('strong');
  });

  it('classifies the maximum possible score (100) as strong evidence', () => {
    expect(classifyEvidence(100)).toBe('strong');
  });

  it('is deterministic — the same score always produces the same tier', () => {
    expect(classifyEvidence(37)).toBe(classifyEvidence(37));
  });
});
