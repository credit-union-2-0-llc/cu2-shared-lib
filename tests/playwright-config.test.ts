import { describe, it, expect } from 'vitest';
import {
  createPlaywrightConfig,
  MINIMAL_MATRIX,
  STANDARD_MATRIX,
  FULL_MATRIX,
  CHROMIUM,
  EDGE,
} from '../src/testing/index.js';

describe('createPlaywrightConfig', () => {
  it('applies STANDARD_MATRIX by default with baseURL wired through', () => {
    const cfg = createPlaywrightConfig({ baseUrl: 'https://app.test' });
    expect(cfg.use).toMatchObject({ baseURL: 'https://app.test' });
    expect(cfg.projects).toHaveLength(STANDARD_MATRIX.length);
    const names = cfg.projects!.map((p) => p.name);
    expect(names).toEqual(['chromium', 'firefox', 'webkit', 'mobile-ios']);
  });

  it('MINIMAL_MATRIX produces only chromium + iOS mobile', () => {
    const cfg = createPlaywrightConfig({
      baseUrl: 'https://app.test',
      matrix: MINIMAL_MATRIX,
    });
    expect(cfg.projects!.map((p) => p.name)).toEqual(['chromium', 'mobile-ios']);
  });

  it('FULL_MATRIX includes edge with msedge channel', () => {
    const cfg = createPlaywrightConfig({
      baseUrl: 'https://app.test',
      matrix: FULL_MATRIX,
    });
    const edge = cfg.projects!.find((p) => p.name === 'edge');
    expect(edge).toBeDefined();
    expect((edge!.use as { channel?: string }).channel).toBe('msedge');
  });

  it('setupFile adds setup project and wires dependency on every matrix project', () => {
    const cfg = createPlaywrightConfig({
      baseUrl: 'https://app.test',
      matrix: [CHROMIUM],
      setupFile: /auth\.setup\.ts/,
    });
    expect(cfg.projects).toHaveLength(2);
    expect(cfg.projects![0].name).toBe('setup');
    expect(cfg.projects![1].name).toBe('chromium');
    expect(cfg.projects![1].dependencies).toContain('setup');
  });

  it('no setupFile → no dependency wiring', () => {
    const cfg = createPlaywrightConfig({
      baseUrl: 'https://app.test',
      matrix: [CHROMIUM],
    });
    expect(cfg.projects![0].dependencies).toBeUndefined();
  });

  it('apiUrl is surfaced in config metadata', () => {
    const cfg = createPlaywrightConfig({
      baseUrl: 'https://app.test',
      apiUrl: 'https://api.test',
    });
    expect(cfg.metadata).toEqual({ apiUrl: 'https://api.test' });
  });

  it('extend merges over base config (timeout override)', () => {
    const cfg = createPlaywrightConfig({
      baseUrl: 'https://app.test',
      extend: { timeout: 120_000, workers: 4 },
    });
    expect(cfg.timeout).toBe(120_000);
    expect(cfg.workers).toBe(4);
    expect(cfg.use).toMatchObject({ baseURL: 'https://app.test' });
  });

  it('edge channel preserved when passed through setupFile + dependencies', () => {
    const cfg = createPlaywrightConfig({
      baseUrl: 'https://app.test',
      matrix: [EDGE],
      setupFile: /auth\.setup\.ts/,
    });
    const edge = cfg.projects!.find((p) => p.name === 'edge')!;
    expect((edge.use as { channel?: string }).channel).toBe('msedge');
    expect(edge.dependencies).toEqual(['setup']);
  });
});
