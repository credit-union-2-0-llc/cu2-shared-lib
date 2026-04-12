import { describe, it, expect } from 'vitest';
import { parsePagination, paginatedResponse } from '../src/api/pagination.js';

describe('parsePagination', () => {
  it('returns defaults when no input', () => {
    const pg = parsePagination();
    expect(pg.page).toBe(1);
    expect(pg.limit).toBe(25);
    expect(pg.offset).toBe(0);
  });

  it('returns defaults for empty object', () => {
    const pg = parsePagination({});
    expect(pg).toEqual({ page: 1, limit: 25, offset: 0 });
  });

  describe('page-based pagination', () => {
    it('calculates offset from page', () => {
      const pg = parsePagination({ page: '3', limit: '10' });
      expect(pg.page).toBe(3);
      expect(pg.limit).toBe(10);
      expect(pg.offset).toBe(20);
    });

    it('page 1 has offset 0', () => {
      const pg = parsePagination({ page: 1, limit: 10 });
      expect(pg.offset).toBe(0);
    });

    it('clamps page to minimum of 1', () => {
      const pg = parsePagination({ page: '0' });
      expect(pg.page).toBe(1);
      expect(pg.offset).toBe(0);
    });

    it('page takes priority over offset when both are provided', () => {
      const pg = parsePagination({ page: '2', limit: '10', offset: '999' });
      expect(pg.page).toBe(2);
      expect(pg.offset).toBe(10); // (2-1)*10, not 999
    });
  });

  describe('offset-based pagination', () => {
    it('calculates page from offset', () => {
      const pg = parsePagination({ offset: '50', limit: '25' });
      expect(pg.offset).toBe(50);
      expect(pg.page).toBe(3); // floor(50/25)+1
      expect(pg.limit).toBe(25);
    });

    it('clamps offset to minimum of 0', () => {
      const pg = parsePagination({ offset: '-5' });
      expect(pg.offset).toBe(0);
    });
  });

  describe('limit clamping', () => {
    it('clamps limit to maxLimit (default 100)', () => {
      const pg = parsePagination({ limit: '500' });
      expect(pg.limit).toBe(100);
    });

    it('respects custom maxLimit', () => {
      const pg = parsePagination({ limit: '50' }, { maxLimit: 30 });
      expect(pg.limit).toBe(30);
    });

    it('clamps limit to minimum of 1', () => {
      const pg = parsePagination({ limit: '0' });
      expect(pg.limit).toBe(1);
    });

    it('uses custom defaultLimit', () => {
      const pg = parsePagination({}, { defaultLimit: 50 });
      expect(pg.limit).toBe(50);
    });
  });

  it('handles non-numeric strings gracefully', () => {
    const pg = parsePagination({ page: 'abc', limit: 'xyz' });
    expect(pg.page).toBe(1);
    expect(pg.limit).toBe(25);
  });
});

describe('paginatedResponse', () => {
  it('calculates totalPages, hasNext, hasPrev', () => {
    const items = ['a', 'b', 'c'];
    const result = paginatedResponse(items, 87, { page: 3, limit: 10, offset: 20 });

    expect(result.items).toEqual(['a', 'b', 'c']);
    expect(result.pagination).toEqual({
      page: 3,
      limit: 10,
      total: 87,
      totalPages: 9,  // ceil(87/10)
      hasNext: true,   // 3 < 9
      hasPrev: true,   // 3 > 1
    });
  });

  it('first page has no hasPrev', () => {
    const result = paginatedResponse([], 50, { page: 1, limit: 10, offset: 0 });
    expect(result.pagination.hasPrev).toBe(false);
    expect(result.pagination.hasNext).toBe(true);
  });

  it('last page has no hasNext', () => {
    const result = paginatedResponse([], 50, { page: 5, limit: 10, offset: 40 });
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(true);
  });

  it('single page has neither hasNext nor hasPrev', () => {
    const result = paginatedResponse(['x'], 1, { page: 1, limit: 25, offset: 0 });
    expect(result.pagination.totalPages).toBe(1);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(false);
  });

  it('handles zero total', () => {
    const result = paginatedResponse([], 0, { page: 1, limit: 25, offset: 0 });
    expect(result.pagination.totalPages).toBe(0);
    expect(result.pagination.hasNext).toBe(false);
    expect(result.pagination.hasPrev).toBe(false);
  });
});
