/**
 * Azure Blob Storage — upload, download, delete, SAS URL generation.
 * Falls back to local filesystem when no connection string is configured (dev).
 *
 * Extracted from: TIGMFL/azureBlob.ts, BusinessLoanReview/blob-storage.ts, misty-9000/blob_storage.py
 *
 * Usage:
 *   import { createBlobClient } from '@cu2/shared-lib/azure/blob-storage';
 *
 *   const blobs = createBlobClient({
 *     connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
 *     container: 'documents',
 *   });
 *
 *   const { blobPath } = await blobs.upload(buffer, 'report.pdf', 'application/pdf', 'tenant-123');
 *   const url = await blobs.generateSasUrl(blobPath, 60);
 *   const data = await blobs.download(blobPath);
 *   await blobs.delete(blobPath);
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';

export interface BlobClientOptions {
  /** Azure Storage connection string. Omit for local filesystem fallback. */
  connectionString?: string;
  /** Container name (default: 'documents') */
  container?: string;
  /** Local fallback directory (default: './uploads') */
  localDir?: string;
  /** Logger */
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export interface UploadResult {
  blobPath: string;
  blobUrl: string;
  sizeBytes: number;
}

export interface BlobClient {
  /** Upload a buffer. Returns the blob path and URL. */
  upload: (
    buffer: Buffer,
    filename: string,
    contentType: string,
    tenantPrefix: string,
    category?: string,
  ) => Promise<UploadResult>;
  /** Download a blob to a Buffer. Returns null if not found. */
  download: (blobPath: string) => Promise<Buffer | null>;
  /** Delete a blob. Returns true if deleted. */
  delete: (blobPath: string) => Promise<boolean>;
  /** Check if a blob exists. */
  exists: (blobPath: string) => Promise<boolean>;
  /** Generate a time-limited read-only SAS URL. Only works in Azure mode. */
  generateSasUrl: (blobPath: string, expiryMinutes?: number) => Promise<string>;
  /** Whether this client is using Azure (true) or local filesystem (false). */
  isAzure: () => boolean;
}

export function createBlobClient(opts: BlobClientOptions = {}): BlobClient {
  const log = opts.logger ?? console;
  const containerName = opts.container ?? 'documents';
  const localDir = opts.localDir ?? './uploads';
  const useAzure = !!opts.connectionString;

  // Lazy-loaded Azure clients
  let containerClient: unknown = null;
  let blobServiceClient: unknown = null;

  async function getContainerClient() {
    if (containerClient) return containerClient;
    const { BlobServiceClient } = await import('@azure/storage-blob');
    blobServiceClient = BlobServiceClient.fromConnectionString(opts.connectionString!);
    containerClient = (blobServiceClient as { getContainerClient: (name: string) => unknown }).getContainerClient(containerName);
    return containerClient;
  }

  // ─── Upload ────────────────────────────────────────────────────────

  async function upload(
    buffer: Buffer,
    filename: string,
    contentType: string,
    tenantPrefix: string,
    category = 'general',
  ): Promise<UploadResult> {
    const blobName = `${tenantPrefix}/${category}/${randomUUID()}-${filename}`;

    if (!useAzure) {
      const localPath = join(localDir, blobName);
      mkdirSync(dirname(localPath), { recursive: true });
      writeFileSync(localPath, buffer);
      log.info('Local file saved', { path: localPath, bytes: buffer.length });
      return { blobPath: blobName, blobUrl: localPath, sizeBytes: buffer.length };
    }

    const container = await getContainerClient() as {
      getBlockBlobClient: (name: string) => {
        url: string;
        uploadData: (data: Buffer, opts: unknown) => Promise<void>;
      };
    };
    const blockBlob = container.getBlockBlobClient(blobName);
    await blockBlob.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    log.info('Blob uploaded', { blobName, contentType, bytes: buffer.length });
    return { blobPath: blobName, blobUrl: blockBlob.url, sizeBytes: buffer.length };
  }

  // ─── Download ──────────────────────────────────────────────────────

  async function download(blobPath: string): Promise<Buffer | null> {
    if (!useAzure) {
      const localPath = join(localDir, blobPath);
      try {
        return readFileSync(localPath);
      } catch (err) {
        // Only a missing file matches the documented "returns null if not
        // found" contract. Anything else (EACCES, EISDIR, EMFILE, ...) is a
        // real problem that was previously indistinguishable from "not
        // found" — that masked permission/IO errors as empty results.
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
        throw err;
      }
    }

    try {
      const container = await getContainerClient() as {
        getBlockBlobClient: (name: string) => {
          downloadToBuffer: () => Promise<Buffer>;
        };
      };
      return await container.getBlockBlobClient(blobPath).downloadToBuffer();
    } catch (err) {
      // downloadToBuffer() has no not-found-safe variant (unlike exists()/
      // deleteIfExists() below, which the SDK guarantees never throw for a
      // missing blob) — it throws a RestError for a genuine 404 too. This
      // used to catch-all and return null, which silently turned auth
      // failures, network errors, and throttling into a false "not found."
      // @azure/storage-blob's RestError stably exposes statusCode (and
      // code, e.g. 'BlobNotFound'/'ContainerNotFound') for this exact
      // purpose — only that case matches the documented "returns null if
      // not found" contract; everything else is a real failure the caller
      // must see.
      const azErr = err as { statusCode?: number; code?: string };
      const isNotFound = azErr?.statusCode === 404
        || azErr?.code === 'BlobNotFound'
        || azErr?.code === 'ContainerNotFound';
      if (isNotFound) return null;
      log.warn('Blob download failed', { blobPath, error: String(err) });
      throw err;
    }
  }

  // ─── Delete ────────────────────────────────────────────────────────

  async function deleteFn(blobPath: string): Promise<boolean> {
    if (!useAzure) {
      const localPath = join(localDir, blobPath);
      try {
        unlinkSync(localPath);
        return true;
      } catch (err) {
        // Same ENOENT-only carve-out as download(): a missing file is a
        // legitimate "nothing to delete" (false). EACCES/EPERM/EBUSY etc.
        // are real failures that were previously reported identically to
        // "wasn't there."
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
        throw err;
      }
    }

    try {
      const container = await getContainerClient() as {
        getBlockBlobClient: (name: string) => {
          deleteIfExists: () => Promise<{ succeeded: boolean }>;
        };
      };
      // deleteIfExists() is the SDK's own not-found-safe variant: it never
      // throws for a missing blob, it returns { succeeded: false }. This
      // used to be discarded and unconditionally reported as `true` — so
      // deleting an already-gone blob silently claimed success. Any
      // exception reaching this catch is therefore a genuine failure
      // (auth/network/etc.), never a legitimate "not found," and must
      // propagate rather than collapse to `false`.
      const result = await container.getBlockBlobClient(blobPath).deleteIfExists();
      log.info('Blob deleted', { blobPath, succeeded: result.succeeded });
      return result.succeeded;
    } catch (err) {
      log.warn('Blob delete failed', { blobPath, error: String(err) });
      throw err;
    }
  }

  // ─── Exists ────────────────────────────────────────────────────────

  async function exists(blobPath: string): Promise<boolean> {
    if (!useAzure) {
      return existsSync(join(localDir, blobPath));
    }

    // exists() is also a not-found-safe SDK method (internally does a HEAD
    // and swallows only the 404 case) — like deleteIfExists() above, any
    // exception that reaches us here is a genuine failure, not "doesn't
    // exist," and used to be silently collapsed to `false`.
    const container = await getContainerClient() as {
      getBlockBlobClient: (name: string) => {
        exists: () => Promise<boolean>;
      };
    };
    return container.getBlockBlobClient(blobPath).exists();
  }

  // ─── SAS URL ───────────────────────────────────────────────────────

  async function generateSasUrl(blobPath: string, expiryMinutes = 60): Promise<string> {
    if (!useAzure) {
      throw new Error('SAS URLs are not available in local filesystem mode');
    }

    const connStr = opts.connectionString!;
    const accountNameMatch = connStr.match(/AccountName=([^;]+)/);
    const accountKeyMatch = connStr.match(/AccountKey=([^;]+)/);
    if (!accountNameMatch || !accountKeyMatch) {
      throw new Error('Cannot parse Azure Storage credentials for SAS generation');
    }

    const {
      StorageSharedKeyCredential,
      generateBlobSASQueryParameters,
      BlobSASPermissions,
    } = await import('@azure/storage-blob');

    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountNameMatch[1],
      accountKeyMatch[1],
    );

    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiryMinutes);

    const sasParams = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      sharedKeyCredential,
    );

    const container = await getContainerClient() as {
      getBlockBlobClient: (name: string) => { url: string };
    };
    return `${container.getBlockBlobClient(blobPath).url}?${sasParams.toString()}`;
  }

  return {
    upload,
    download,
    delete: deleteFn,
    exists,
    generateSasUrl,
    isAzure: () => useAzure,
  };
}
