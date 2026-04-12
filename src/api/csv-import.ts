/**
 * CSV import validator with row-level error tracking.
 *
 * Validates rows individually and returns both successfully imported items
 * and per-row errors. Never bulk-fails — partial success is the default.
 *
 * Extracted from: scienceworks-platform/apps/api/src/budget/budget.service.ts
 *
 * Usage:
 *   import { createCsvImporter } from '@cu2/shared-lib/api/csv-import';
 *
 *   const importer = createCsvImporter<BudgetRow>({
 *     validate: (row, rowNumber) => {
 *       const errors: string[] = [];
 *       if (!row.program_code) errors.push('program_code is required');
 *       if (row.year < 2020 || row.year > 2099) errors.push('year must be 2020-2099');
 *       if (row.month < 1 || row.month > 12) errors.push('month must be 1-12');
 *       return errors;
 *     },
 *     process: async (validRows) => {
 *       await db.budgetTarget.createMany({ data: validRows });
 *     },
 *   });
 *
 *   const result = await importer.import(parsedCsvRows);
 *   // → { imported: 47, errors: [{ row: 3, message: 'year must be 2020-2099' }, ...], total: 50 }
 */

// ---------- Types ----------

export interface CsvImportError {
  /** 1-based row number. */
  row: number;
  /** Validation error message. */
  message: string;
}

export interface CsvImportResult<T> {
  /** Number of successfully imported rows. */
  imported: number;
  /** Total rows in the input. */
  total: number;
  /** Per-row validation errors. */
  errors: CsvImportError[];
  /** The valid rows that were processed (useful for returning to caller). */
  validRows: T[];
}

export interface CsvImporterOptions<T> {
  /**
   * Validate a single row. Return an array of error messages (empty = valid).
   * rowNumber is 1-based.
   */
  validate: (row: T, rowNumber: number) => string[];
  /**
   * Process all valid rows at once (e.g., bulk insert).
   * Called only if there's at least one valid row.
   */
  process: (validRows: T[]) => Promise<void>;
}

export interface CsvImporter<T> {
  import(rows: T[]): Promise<CsvImportResult<T>>;
}

// ---------- Factory ----------

export function createCsvImporter<T>(options: CsvImporterOptions<T>): CsvImporter<T> {
  return {
    async import(rows: T[]): Promise<CsvImportResult<T>> {
      const errors: CsvImportError[] = [];
      const validRows: T[] = [];

      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 1;
        const rowErrors = options.validate(rows[i], rowNumber);
        if (rowErrors.length > 0) {
          for (const message of rowErrors) {
            errors.push({ row: rowNumber, message });
          }
        } else {
          validRows.push(rows[i]);
        }
      }

      if (validRows.length > 0) {
        await options.process(validRows);
      }

      return {
        imported: validRows.length,
        total: rows.length,
        errors,
        validRows,
      };
    },
  };
}
