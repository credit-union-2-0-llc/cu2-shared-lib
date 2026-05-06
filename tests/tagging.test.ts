/**
 * v1.1.0 — tagging subpath tests
 * cu2-billing W2-01 Task 2 (RED phase tests 1–4)
 */
import { describe, it, expect } from 'vitest';
import {
  buildAzureResourceTags,
  assertRequiredTags,
} from '../src/tagging/index.js';

describe('buildAzureResourceTags', () => {
  it('Test 1: returns exactly 3 keys when cost-center omitted', () => {
    const result = buildAzureResourceTags({
      'cu-tenant-id': '00000000-0000-0000-0000-000000000001',
      'app-code': 'cu2-billing',
      environment: 'production',
    });
    expect(Object.keys(result).sort()).toEqual([
      'app-code',
      'cu-tenant-id',
      'environment',
    ]);
  });

  it('Test 2: returns 4 keys when cost-center provided', () => {
    const result = buildAzureResourceTags({
      'cu-tenant-id': '00000000-0000-0000-0000-000000000001',
      'app-code': 'cu2-billing',
      'cost-center': 'finance',
      environment: 'production',
    });
    expect(Object.keys(result).sort()).toEqual([
      'app-code',
      'cost-center',
      'cu-tenant-id',
      'environment',
    ]);
  });
});

describe('assertRequiredTags', () => {
  it('Test 3: throws with message containing cu-tenant-id when empty', () => {
    expect(() => assertRequiredTags({} as Record<string, string>)).toThrow(
      /cu-tenant-id/,
    );
  });

  it('Test 4: accepts literal "shared" as cu-tenant-id', () => {
    expect(() =>
      assertRequiredTags({
        'cu-tenant-id': 'shared',
        'app-code': 'cu2-billing',
        environment: 'production',
      }),
    ).not.toThrow();
  });
});
