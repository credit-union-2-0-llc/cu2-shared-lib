import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, chmodSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Regression tests for the local-filesystem-mode error handling in
// azure/blob-storage.ts: download()/delete() used to catch-all and report
// every filesystem error (permissions, EISDIR, etc.) identically to
// "file not found" (null / false). Only ENOENT should map to that; anything
// else must propagate so a real IO/permission problem is not silently
// misreported as an absent file.

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'blob-storage-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createBlobClient — local filesystem mode', () => {
  it('download() returns null for a genuinely missing file (ENOENT)', async () => {
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ localDir: dir });
    const result = await blobs.download('does/not/exist.txt');
    expect(result).toBeNull();
  });

  it('download() propagates a non-ENOENT filesystem error instead of returning null', async () => {
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ localDir: dir });
    // Point "download" at a directory, not a file: readFileSync throws
    // EISDIR, which must NOT be reported as "not found."
    const subdir = join(dir, 'a-directory');
    mkdirSync(subdir);
    await expect(blobs.download('a-directory')).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('delete() returns false for a genuinely missing file (ENOENT)', async () => {
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ localDir: dir });
    const result = await blobs.delete('does/not/exist.txt');
    expect(result).toBe(false);
  });

  it('delete() propagates a non-ENOENT filesystem error instead of returning false', async () => {
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ localDir: dir });
    const subdir = join(dir, 'locked-dir');
    mkdirSync(subdir);
    const file = join(subdir, 'f.txt');
    writeFileSync(file, 'x');
    chmodSync(subdir, 0o000);
    try {
      await expect(blobs.delete('locked-dir/f.txt')).rejects.toMatchObject({ code: 'EACCES' });
    } finally {
      chmodSync(subdir, 0o755); // restore so afterEach cleanup can remove it
    }
  });
});

// Azure-mode tests mock the dynamic `import('@azure/storage-blob')` inside
// getContainerClient(). @azure/storage-blob is not installed (it isn't even
// declared as a peer dependency of this package), but vi.mock intercepts the
// bare specifier before Node's resolver runs, so this works without it.

describe('createBlobClient — Azure mode', () => {
  afterEach(() => {
    vi.doUnmock('@azure/storage-blob');
    vi.resetModules();
  });

  it('download() returns null on a genuine 404 (BlobNotFound)', async () => {
    const notFoundErr = Object.assign(new Error('The specified blob does not exist.'), {
      statusCode: 404,
      code: 'BlobNotFound',
    });
    vi.doMock('@azure/storage-blob', () => ({
      BlobServiceClient: {
        fromConnectionString: () => ({
          getContainerClient: () => ({
            getBlockBlobClient: () => ({
              downloadToBuffer: () => Promise.reject(notFoundErr),
            }),
          }),
        }),
      },
    }));
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ connectionString: 'UseDevelopmentStorage=true' });
    const result = await blobs.download('missing.txt');
    expect(result).toBeNull();
  });

  it('download() rethrows a non-404 error (e.g. auth failure) instead of returning null', async () => {
    const authErr = Object.assign(new Error('Server failed to authenticate the request.'), {
      statusCode: 403,
      code: 'AuthenticationFailed',
    });
    vi.doMock('@azure/storage-blob', () => ({
      BlobServiceClient: {
        fromConnectionString: () => ({
          getContainerClient: () => ({
            getBlockBlobClient: () => ({
              downloadToBuffer: () => Promise.reject(authErr),
            }),
          }),
        }),
      },
    }));
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ connectionString: 'UseDevelopmentStorage=true' });
    await expect(blobs.download('secret.txt')).rejects.toMatchObject({ code: 'AuthenticationFailed' });
  });

  it('delete() returns the SDK-reported `succeeded` flag rather than always true', async () => {
    vi.doMock('@azure/storage-blob', () => ({
      BlobServiceClient: {
        fromConnectionString: () => ({
          getContainerClient: () => ({
            getBlockBlobClient: () => ({
              // deleteIfExists() never throws for a missing blob — it
              // resolves with succeeded: false.
              deleteIfExists: () => Promise.resolve({ succeeded: false }),
            }),
          }),
        }),
      },
    }));
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ connectionString: 'UseDevelopmentStorage=true' });
    const result = await blobs.delete('already-gone.txt');
    expect(result).toBe(false);
  });

  it('delete() rethrows when deleteIfExists() itself fails (auth/network)', async () => {
    const networkErr = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
    vi.doMock('@azure/storage-blob', () => ({
      BlobServiceClient: {
        fromConnectionString: () => ({
          getContainerClient: () => ({
            getBlockBlobClient: () => ({
              deleteIfExists: () => Promise.reject(networkErr),
            }),
          }),
        }),
      },
    }));
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ connectionString: 'UseDevelopmentStorage=true' });
    await expect(blobs.delete('x.txt')).rejects.toMatchObject({ code: 'ECONNRESET' });
  });

  it('exists() rethrows when the SDK call fails instead of reporting false', async () => {
    const throttleErr = Object.assign(new Error('Server busy'), { statusCode: 503 });
    vi.doMock('@azure/storage-blob', () => ({
      BlobServiceClient: {
        fromConnectionString: () => ({
          getContainerClient: () => ({
            getBlockBlobClient: () => ({
              exists: () => Promise.reject(throttleErr),
            }),
          }),
        }),
      },
    }));
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ connectionString: 'UseDevelopmentStorage=true' });
    await expect(blobs.exists('x.txt')).rejects.toMatchObject({ statusCode: 503 });
  });

  it('exists() returns the SDK boolean on the happy path', async () => {
    vi.doMock('@azure/storage-blob', () => ({
      BlobServiceClient: {
        fromConnectionString: () => ({
          getContainerClient: () => ({
            getBlockBlobClient: () => ({
              exists: () => Promise.resolve(true),
            }),
          }),
        }),
      },
    }));
    const { createBlobClient } = await import('../src/azure/blob-storage.js');
    const blobs = createBlobClient({ connectionString: 'UseDevelopmentStorage=true' });
    await expect(blobs.exists('x.txt')).resolves.toBe(true);
  });
});
