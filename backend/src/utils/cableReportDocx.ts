import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  NumberFormat,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  HeadingLevel,
  ShadingType,
  VerticalAlign,
} from 'docx';

export type CableReportLocation = {
  name: string; // e.g. "Loft" / "Garage" (effective label)
  label: string; // site abbreviation label; may be empty
  template_type?: 'DATACENTRE' | 'DOMESTIC' | string;
  floor: string;
  area?: string;
  suite?: string;
  row?: string;
  rack?: string;
};

export type CableReportRunLocation = {
  // IMPORTANT:
  // This `label` should be the *location label/name* you want printed (e.g. "Loft", "Garage"),
  // NOT the site code (IVY).
  label: string;
  template_type?: 'DATACENTRE' | 'DOMESTIC' | string;
  floor: string;
  area?: string;
  suite?: string;
  row?: string;
  rack?: string;
};

export type CableReportRun = {
  ref_number: number;
  source: CableReportRunLocation | null;
  destination: CableReportRunLocation | null;
  cable_type_name: string | null;
  description: string | null;
  created_at: Date;
  created_by_display: string;
};

export type CableReportData = {
  siteName: string;
  siteCode: string;
  siteLocation?: string | null;
  siteDescription?: string | null;
  createdAt: Date;
  locations: CableReportLocation[];
  cableTypes: { name: string }[];
  runs: CableReportRun[];
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatDateTimeDDMMYYYY_HHMM(date: Date): string {
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yyyy = String(date.getFullYear());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export function formatPrintedDateDDMonYYYY_HHMM(date: Date): string {
  const dd = pad2(date.getDate());
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
  const mon = months[date.getMonth()] ?? 'Jan';
  const yyyy = String(date.getFullYear());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `${dd} ${mon} ${yyyy}, ${hh}:${mi}`;
}

export function formatTimestampYYYYMMDD_HHMMSS(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

// NEVER show "#10000+"
export function formatCableRef(refNumber: number): string {
  if (!Number.isFinite(refNumber)) return '—';
  const n = Math.max(0, Math.trunc(refNumber));
  if (n < 10000) return `#${String(n).padStart(4, '0')}`;
  return `#${String(n)}`;
}

// Structured format required:
// "Label: Loft | Floor: 2 | Suite: 1 | Row: A | Rack: 1"
export function formatStructuredLocation(loc: CableReportRunLocation | null, fallbackLabel?: string): string {
  if (!loc) return '—';
  const fallback = String(fallbackLabel ?? '').trim();
  const label = String(loc.label ?? '').trim() || fallback || '—';

  const template = String(loc.template_type ?? '').trim().toUpperCase();
  const floor = String(loc.floor ?? '').trim();

  if (template === 'DOMESTIC' || (loc.area != null && String(loc.area).trim() !== '')) {
    const area = String(loc.area ?? '').trim();
    return `Label: ${label} | Floor: ${floor} | Area: ${area}`;
  }

  const suite = String(loc.suite ?? '').trim();
  const row = String(loc.row ?? '').trim();
  const rack = String(loc.rack ?? '').trim();
  return `Label: ${label} | Floor: ${floor} | Suite: ${suite} | Row: ${row} | Rack: ${rack}`;
}

/** -------------------------
 *  Styling helpers (greys, Word-ish)
 *  ------------------------- */

const COLORS = {
  textMuted: '6B7280',
  border: 'D1D5DB',
  headerFill: 'F3F4F6',
  zebraFill: 'FAFAFA',
};

function paraSpacer(after = 120): Paragraph {
  return new Paragraph({ children: [], spacing: { after } });
}

function reportTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text, bold: true, size: 44 })],
  });
}

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28 })],
  });
}

function p(text: string, opts?: { muted?: boolean; after?: number }): Paragraph {
  const runOptions: { text: string; color?: string } = { text };
  if (opts?.muted) runOptions.color = COLORS.textMuted;

  return new Paragraph({
    spacing: { after: opts?.after ?? 120 },
    children: [
      new TextRun(runOptions),
    ],
  });
}

function tableBorders() {
  return {
    top: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border },
    left: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border },
    right: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border },
    insideVertical: { style: BorderStyle.SINGLE, size: 6, color: COLORS.border },
  };
}

function headerCell(text: string, widthPct?: number): TableCell {
  const options: any = {
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLORS.headerFill },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true })],
      }),
    ],
  };

  if (widthPct) {
    options.width = { size: widthPct, type: WidthType.PERCENTAGE };
  }

  return new TableCell(options);
}

function bodyCell(text: string, zebra = false, widthPct?: number): TableCell {
  const options: any = {
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text })] })],
  };

  if (zebra) {
    options.shading = { type: ShadingType.CLEAR, color: 'auto', fill: COLORS.zebraFill };
  }

  if (widthPct) {
    options.width = { size: widthPct, type: WidthType.PERCENTAGE };
  }

  return new TableCell(options);
}

function bodyCellParagraphs(paragraphs: Paragraph[], zebra = false, widthPct?: number): TableCell {
  const options: any = {
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: paragraphs,
  };

  if (zebra) {
    options.shading = { type: ShadingType.CLEAR, color: 'auto', fill: COLORS.zebraFill };
  }

  if (widthPct) {
    options.width = { size: widthPct, type: WidthType.PERCENTAGE };
  }

  return new TableCell(options);
}

function infoTable(
  siteName: string,
  siteCode: string,
  reportCreatedOn: string,
  siteLocation?: string | null,
  siteDescription?: string | null
): Table {
  const description = String(siteDescription ?? '').trim();
  const location = String(siteLocation ?? '').trim();

  const rows: TableRow[] = [];
  const addRow = (label: string, value: string, zebra: boolean) => {
    rows.push(
      new TableRow({
        children: [
          bodyCell(label, zebra, 35),
          bodyCell(value, zebra, 65),
        ],
      })
    );
  };

  // Keep a stable, readable layout:
  //   Site Name
  //   Site Abbreviation
  //   Site Location (optional)
  //   Site Description (optional)
  //   Report Generated on
  const entries: Array<{ label: string; value: string }> = [
    { label: 'Site Name', value: siteName },
    { label: 'Site Abbreviation', value: siteCode },
  ];

  if (location) entries.push({ label: 'Site Location', value: location });
  if (description) entries.push({ label: 'Site Description', value: description });
  entries.push({ label: 'Report Generated on', value: reportCreatedOn });

  for (const [i, entry] of entries.entries()) {
    const zebra = i % 2 === 1;
    addRow(entry.label, entry.value, zebra);
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(),
    rows,
  });
}

function knownLocationsTable(siteCode: string, locations: CableReportLocation[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell('Location Name', 22),
      headerCell('Label', 18),
      headerCell('Floor', 10),
      headerCell('Area', 10),
      headerCell('Suite', 10),
      headerCell('Row', 10),
      headerCell('Rack', 10),
      headerCell('Structured Display', 10),
    ],
  });

  const rows = locations.map((l, i) => {
    const zebra = i % 2 === 1;

    const locationName = String(l.name ?? '').trim() || '—';
    // If label empty, default label = siteCode (per your requirement)
    const label = String(l.label ?? '').trim() || siteCode;

    const structured = formatStructuredLocation(
      {
        label: locationName,
        floor: String(l.floor ?? ''),
        ...(l.template_type != null ? { template_type: String(l.template_type) } : {}),
        ...(l.area != null ? { area: String(l.area) } : {}),
        ...(l.suite != null ? { suite: String(l.suite) } : {}),
        ...(l.row != null ? { row: String(l.row) } : {}),
        ...(l.rack != null ? { rack: String(l.rack) } : {}),
      },
      siteCode
    );

    return new TableRow({
      children: [
        bodyCell(locationName, zebra, 22),
        bodyCell(label, zebra, 18),
        bodyCell(String(l.floor ?? ''), zebra, 10),
        bodyCell(String(l.area ?? ''), zebra, 10),
        bodyCell(String(l.suite ?? ''), zebra, 10),
        bodyCell(String(l.row ?? ''), zebra, 10),
        bodyCell(String(l.rack ?? ''), zebra, 10),
        bodyCell(structured, zebra, 10),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(),
    rows: [header, ...rows],
  });
}

function cableRunsTable(siteCode: string, runs: CableReportRun[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell('Cable Ref', 10),
      headerCell('Cable Source', 23),
      headerCell('Cable Destination', 23),
      headerCell('Cable Type', 12),
      headerCell('Cable Description', 16),
      headerCell('Created (Date/Time — User)', 16),
    ],
  });

  const rows = runs.map((r, i) => {
    const zebra = i % 2 === 1;
    const createdBy = `${formatPrintedDateDDMonYYYY_HHMM(r.created_at)} — ${r.created_by_display}`;

    return new TableRow({
      children: [
        bodyCell(formatCableRef(r.ref_number), zebra, 10),
        bodyCell(formatStructuredLocation(r.source, siteCode), zebra, 23),
        bodyCell(formatStructuredLocation(r.destination, siteCode), zebra, 23),
        bodyCell((r.cable_type_name ?? '').trim() || '—', zebra, 12),
        bodyCell((r.description ?? '').trim() || '—', zebra, 16),
        bodyCell(createdBy, zebra, 16),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders(),
    rows: [header, ...rows],
  });
}

function bulletList(items: string[]): Paragraph[] {
  return items.map(
    (text) =>
      new Paragraph({
        text,
        bullet: { level: 0 },
        spacing: { after: 60 },
      })
  );
}

export async function buildCableReportDocxBuffer(data: CableReportData): Promise<Buffer> {
  const createdOn = formatPrintedDateDDMonYYYY_HHMM(data.createdAt);

  const cableTypeLines = data.cableTypes
    .map((ct) => String(ct.name ?? '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22, // 11pt
          },
          paragraph: {
            spacing: { line: 276 }, // ~1.15 line spacing
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5"
            pageNumbers: {
              start: 1,
              formatType: NumberFormat.DECIMAL,
            },
          },
        },
        children: [
          reportTitle('InfraDB – Site Cable Report'),

          infoTable(data.siteName, data.siteCode, createdOn, data.siteLocation, data.siteDescription),

          h1('Overview'),
          p(
            'This document contains a print overview of locations and cable runs for this site.',
            { after: 160 }
          ),

          h1('Known Locations'),
          p('Locations configured on site:', { muted: true, after: 120 }),
          data.locations.length ? knownLocationsTable(data.siteCode, data.locations) : p('No locations configured.'),

          h1('Cable Types Used'),
          p('All labels currently recorded for this site:', { muted: true, after: 120 }),
          ...(cableTypeLines.length ? bulletList(cableTypeLines) : [p('No cable types configured.')]),

          h1('Cable Runs'),
          p('All cable runs currently recorded for this site:', { muted: true, after: 120 }),
          data.runs.length ? cableRunsTable(data.siteCode, data.runs) : p('No cable runs configured.'),

          paraSpacer(240),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240 },
            children: [
              new TextRun({
                text: `Generated by InfraDB • Report Generated on ${createdOn}`,
                color: COLORS.textMuted,
                size: 18,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
