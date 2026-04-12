import { describe, it, expect, vi } from 'vitest';
import { createCsvImporter } from '../src/api/csv-import.js';

interface TestRow {
  name: string;
  year: number;
}

function makeImporter(processFn?: (rows: TestRow[]) => Promise<void>) {
  const process = processFn ?? vi.fn(async () => {});
  return {
    importer: createCsvImporter<TestRow>({
      validate: (row, _rowNum) => {
        const errors: string[] = [];
        if (!row.name) errors.push('name is required');
        if (row.year < 2000 || row.year > 2099) errors.push('year must be 2000-2099');
        return errors;
      },
      process,
    }),
    process,
  };
}

describe('createCsvImporter', () => {
  it('all valid rows: imported = total, no errors', async () => {
    const { importer, process } = makeImporter();
    const rows: TestRow[] = [
      { name: 'Alpha', year: 2025 },
      { name: 'Beta', year: 2026 },
      { name: 'Gamma', year: 2024 },
    ];

    const result = await importer.import(rows);
    expect(result.imported).toBe(3);
    expect(result.total).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toEqual(rows);
    expect(process).toHaveBeenCalledWith(rows);
  });

  it('some invalid rows: partial success with row-level errors', async () => {
    const { importer } = makeImporter();
    const rows: TestRow[] = [
      { name: 'Good', year: 2025 },
      { name: '', year: 2025 },         // invalid: no name
      { name: 'Also Good', year: 2026 },
      { name: 'Bad Year', year: 1999 },  // invalid: year out of range
    ];

    const result = await importer.import(rows);
    expect(result.imported).toBe(2);
    expect(result.total).toBe(4);
    expect(result.errors).toEqual([
      { row: 2, message: 'name is required' },
      { row: 4, message: 'year must be 2000-2099' },
    ]);
    expect(result.validRows).toEqual([
      { name: 'Good', year: 2025 },
      { name: 'Also Good', year: 2026 },
    ]);
  });

  it('all invalid rows: imported 0, all errors present', async () => {
    const { importer } = makeImporter();
    const rows: TestRow[] = [
      { name: '', year: 1999 },
      { name: '', year: 3000 },
    ];

    const result = await importer.import(rows);
    expect(result.imported).toBe(0);
    expect(result.total).toBe(2);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.validRows).toEqual([]);
  });

  it('process() not called when all rows are invalid', async () => {
    const process = vi.fn(async () => {});
    const { importer } = makeImporter(process);
    const rows: TestRow[] = [
      { name: '', year: 2025 },
    ];

    await importer.import(rows);
    expect(process).not.toHaveBeenCalled();
  });

  it('handles empty input', async () => {
    const { importer, process } = makeImporter();
    const result = await importer.import([]);
    expect(result.imported).toBe(0);
    expect(result.total).toBe(0);
    expect(result.errors).toEqual([]);
    expect(process).not.toHaveBeenCalled();
  });

  it('a single row can produce multiple errors', async () => {
    const { importer } = makeImporter();
    const rows: TestRow[] = [
      { name: '', year: 1999 }, // both name and year invalid
    ];

    const result = await importer.import(rows);
    expect(result.errors).toEqual([
      { row: 1, message: 'name is required' },
      { row: 1, message: 'year must be 2000-2099' },
    ]);
  });
});
