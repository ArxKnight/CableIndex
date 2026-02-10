import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import {
  buildCableReportDocxBuffer,
  formatCableRef,
  formatPrintedDateDDMonYYYY_HHMM,
  formatStructuredLocation,
} from '../utils/cableReportDocx.js';

function getDocxDocumentXml(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new Error('Missing word/document.xml in docx');
  return entry.getData().toString('utf8');
}

describe('cableReportDocx', () => {
  it('formats cable refs correctly (including >= 10000)', () => {
    expect(formatCableRef(49)).toBe('#0049');
    expect(formatCableRef(9999)).toBe('#9999');
    expect(formatCableRef(10000)).toBe('#10000');
    expect(formatCableRef(484744)).toBe('#484744');
  });

  it('formats structured locations in the required shape', () => {
    expect(
      formatStructuredLocation({
        label: 'IVY',
        floor: '2',
        suite: '1',
        row: 'A',
        rack: '1',
      })
    ).toBe('Label: IVY | Floor: 2 | Suite: 1 | Row: A | Rack: 1');

    expect(formatStructuredLocation(null)).toBe('—');
  });

  it('generates a docx with the formatted report template', async () => {
    const createdAt = new Date('2026-02-09T19:45:33Z');

    const buffer = await buildCableReportDocxBuffer({
      siteName: 'Ivy Office',
      siteCode: 'IVY',
      createdAt,
      locations: [
        { name: 'Loft', label: 'IVY', floor: '2', suite: '1', row: 'A', rack: '1' },
        { name: 'Garage', label: 'IVY', floor: '0', suite: '1', row: 'A', rack: '1' },
      ],
      cableTypes: [{ name: 'CAT6 Copper' }, { name: 'OM4 Fiber' }],
      runs: [
        {
          ref_number: 49,
          type: 'cable',
          source: { label: 'Loft', floor: '2', suite: '1', row: 'A', rack: '1' },
          destination: { label: 'Garage', floor: '0', suite: '1', row: 'A', rack: '1' },
          cable_type_name: 'CAT6 Copper',
          created_at: createdAt,
          created_by_display: 'Alex Engineer',
        },
        {
          ref_number: 10000,
          type: 'cable',
          source: null,
          destination: null,
          cable_type_name: null,
          created_at: createdAt,
          created_by_display: 'alex@example.com',
        },
      ],
    });

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 2).toString('utf8')).toBe('PK'); // docx is a zip

    const xml = getDocxDocumentXml(buffer);

    expect(xml).toContain('CableIndex – Site Cable Report');

    expect(xml).toContain('Site Name');
    expect(xml).toContain('Ivy Office');
    expect(xml).toContain('Site Abbreviation');
    expect(xml).toContain('IVY');
    expect(xml).toContain('Report Generated on');
    expect(xml).toContain(formatPrintedDateDDMonYYYY_HHMM(createdAt));

    expect(xml).toContain('Overview');
    expect(xml).toContain('Known Locations');
    expect(xml).toContain('Cable Types Used');
    expect(xml).toContain('Cable Runs');

    expect(xml).toContain('Locations configured on site:');
    expect(xml).toContain('All labels currently recorded for this site:');

    // Known locations table headers
    expect(xml).toContain('Location Name');
    expect(xml).toContain('Label');
    expect(xml).toContain('Floor');
    expect(xml).toContain('Suite');
    expect(xml).toContain('Row');
    expect(xml).toContain('Rack');

    expect(xml).toContain('Cable Ref');
    expect(xml).toContain('Cable Source');
    expect(xml).toContain('Cable Destination');
    expect(xml).toContain('Cable Type');
    expect(xml).toContain('Created (Date/Time — User)');

    expect(xml).toContain('#0049');
    expect(xml).toContain('#10000');

    expect(xml).toContain('Loft');
    expect(xml).toContain('Garage');

    // For missing cable type and missing locations, the report uses an em dash
    expect(xml).toContain('—');

    // Created-by format is "DD Mon YYYY, HH:MM — <name>"
    expect(xml).toContain(`${formatPrintedDateDDMonYYYY_HHMM(createdAt)} — Alex Engineer`);

    // Run locations use structured location format
    expect(xml).toContain('Label: Loft | Floor: 2 | Suite: 1 | Row: A | Rack: 1');
    expect(xml).toContain('Label: Garage | Floor: 0 | Suite: 1 | Row: A | Rack: 1');
  });

  it('shows empty-state messages when sections have no data', async () => {
    const createdAt = new Date('2026-02-09T00:00:00Z');

    const buffer = await buildCableReportDocxBuffer({
      siteName: 'Empty Site',
      siteCode: 'EMP',
      createdAt,
      locations: [],
      cableTypes: [],
      runs: [],
    });

    const xml = getDocxDocumentXml(buffer);

    expect(xml).toContain('No locations configured.');
    expect(xml).toContain('No cable types configured.');
    expect(xml).toContain('No cable runs configured.');
  });

  it('falls back to site abbreviation when run location label is blank', async () => {
    const createdAt = new Date('2026-02-09T00:00:00Z');

    const buffer = await buildCableReportDocxBuffer({
      siteName: 'Fallback Site',
      siteCode: 'IVY',
      createdAt,
      locations: [],
      cableTypes: [],
      runs: [
        {
          ref_number: 1,
          type: 'cable',
          source: { label: '', floor: '2', suite: '1', row: 'A', rack: '1' },
          destination: { label: 'Loft', floor: '0', suite: '1', row: 'A', rack: '1' },
          cable_type_name: null,
          created_at: createdAt,
          created_by_display: 'Alex',
        },
      ],
    });

    const xml = getDocxDocumentXml(buffer);
    expect(xml).toContain('Label: IVY | Floor: 2 | Suite: 1 | Row: A | Rack: 1');
  });
});
