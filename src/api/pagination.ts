/**
 * Pagination utilities for APIs.
 *
 * Supports both offset-based and page-based pagination with consistent
 * response metadata.
 *
 * Extracted from: broflo/apps/api/src/orders/dto/list-orders.dto.ts,
 *                 scienceworks-platform/apps/api/src/budget/ledger.service.ts
 *
 * Usage:
 *   import {
 *     parsePagination, paginatedResponse,
 *   } from '@cu2/shared-lib/api/pagination';
 *
 *   // Parse from Express query params
 *   const pg = parsePagination(req.query);
 *   // → { page: 1, limit: 25, offset: 0 }
 *
 *   // From explicit params
 *   const pg2 = parsePagination({ page: '3', limit: '10' });
 *   // → { page: 3, limit: 10, offset: 20 }
 *
 *   // Build response with metadata
 *   const result = paginatedResponse(items, total, pg);
 *   // → { items: [...], pagination: { page: 3, limit: 10, total: 87, totalPages: 9, hasNext: true, hasPrev: true } }
 */

// ---------- Types ----------

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface PaginationInput {
  page?: string | number;
  limit?: string | number;
  offset?: string | number;
}

export interface PaginationDefaults {
  /** Default page size. Default: 25 */
  defaultLimit?: number;
  /** Maximum allowed page size. Default: 100 */
  maxLimit?: number;
}

// ---------- Helpers ----------

function safeInt(value: string | number | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse pagination from query params or an object.
 * Supports page-based (page + limit) and offset-based (offset + limit).
 * Page-based takes priority if both page and offset are provided.
 */
export function parsePagination(
  input: PaginationInput = {},
  defaults: PaginationDefaults = {},
): PaginationParams {
  const defaultLimit = defaults.defaultLimit ?? 25;
  const maxLimit = defaults.maxLimit ?? 100;

  const limit = Math.min(Math.max(safeInt(input.limit, defaultLimit), 1), maxLimit);

  // If page is provided, use page-based
  if (input.page !== undefined && input.page !== '') {
    const page = Math.max(safeInt(input.page, 1), 1);
    return { page, limit, offset: (page - 1) * limit };
  }

  // Otherwise use offset-based
  const offset = Math.max(safeInt(input.offset, 0), 0);
  const page = Math.floor(offset / limit) + 1;
  return { page, limit, offset };
}

/**
 * Build a paginated response with metadata.
 */
export function paginatedResponse<T>(
  items: T[],
  total: number,
  params: PaginationParams,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit);
  return {
    items,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}
