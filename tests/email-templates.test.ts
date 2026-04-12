import { describe, it, expect } from 'vitest';
import {
  emailWrapper,
  detailRow,
  detailTable,
  heading,
  button,
  paragraph,
  divider,
} from '../src/notifications/email-templates.js';

describe('detailRow', () => {
  it('produces a <tr> with label and value', () => {
    const html = detailRow('Date', 'March 15');
    expect(html).toContain('<tr>');
    expect(html).toContain('</tr>');
    expect(html).toContain('Date');
    expect(html).toContain('March 15');
  });

  it('contains two <td> cells', () => {
    const html = detailRow('Key', 'Val');
    const tdCount = (html.match(/<td /g) || []).length;
    expect(tdCount).toBe(2);
  });
});

describe('detailTable', () => {
  it('wraps rows in a <table>', () => {
    const rows = [detailRow('A', '1'), detailRow('B', '2')];
    const html = detailTable(rows);
    expect(html).toContain('<table');
    expect(html).toContain('</table>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('A');
    expect(html).toContain('B');
  });

  it('handles empty rows array', () => {
    const html = detailTable([]);
    expect(html).toContain('<table');
    expect(html).toContain('<tbody></tbody>');
  });
});

describe('heading', () => {
  it('produces an <h2>', () => {
    const html = heading('Welcome');
    expect(html).toContain('<h2');
    expect(html).toContain('</h2>');
    expect(html).toContain('Welcome');
  });

  it('uses custom color', () => {
    const html = heading('Title', '#ff0000');
    expect(html).toContain('color:#ff0000');
  });

  it('uses default color', () => {
    const html = heading('Title');
    expect(html).toContain('color:#111827');
  });
});

describe('button', () => {
  it('produces an anchor tag with href', () => {
    const html = button('Click Me', 'https://example.com');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('Click Me');
    expect(html).toContain('</a>');
  });

  it('uses custom color', () => {
    const html = button('Go', 'https://x.com', '#ff0000');
    expect(html).toContain('background:#ff0000');
  });

  it('uses default color', () => {
    const html = button('Go', 'https://x.com');
    expect(html).toContain('background:#2563eb');
  });
});

describe('paragraph', () => {
  it('produces a <p> tag', () => {
    const html = paragraph('Hello world');
    expect(html).toContain('<p');
    expect(html).toContain('Hello world');
    expect(html).toContain('</p>');
  });
});

describe('divider', () => {
  it('produces an <hr>', () => {
    const html = divider();
    expect(html).toContain('<hr');
  });
});

describe('emailWrapper', () => {
  it('returns valid HTML with title and body', () => {
    const html = emailWrapper({
      title: 'Test Email',
      body: '<p>Body content</p>',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('<title>Test Email</title>');
    expect(html).toContain('Test Email'); // appears in header h1
    expect(html).toContain('<p>Body content</p>');
    expect(html).toContain('</html>');
  });

  it('uses default brand color', () => {
    const html = emailWrapper({ title: 'T', body: 'B' });
    expect(html).toContain('#2563eb');
  });

  it('uses custom brand color', () => {
    const html = emailWrapper({ title: 'T', body: 'B', brandColor: '#ff6600' });
    expect(html).toContain('#ff6600');
  });

  it('includes footer when provided', () => {
    const html = emailWrapper({ title: 'T', body: 'B', footer: '2026 CU2' });
    expect(html).toContain('2026 CU2');
  });

  it('omits footer div when not provided', () => {
    const html = emailWrapper({ title: 'T', body: 'B' });
    // Should not contain footer styling div
    expect(html).not.toContain('font-size:12px;color:#9ca3af');
  });

  it('uses custom background color', () => {
    const html = emailWrapper({ title: 'T', body: 'B', backgroundColor: '#000000' });
    expect(html).toContain('background:#000000');
  });
});
