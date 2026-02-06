import type { SiteLocation } from '../types';

function safe(value: unknown): string {
  return (value ?? '').toString().trim();
}

function effectiveLabel(loc: SiteLocation, fallbackSiteCode?: string): string {
  const fromApi = safe((loc as any).effective_label);
  if (fromApi) return fromApi;

  const fromLabel = safe(loc.label);
  if (fromLabel) return fromLabel;

  const fallback = safe(fallbackSiteCode);
  if (fallback) return fallback;

  return 'Site';
}

// Section 4A display: field-based, fixed ordering, fixed separators.
export function formatLocationFields(loc: SiteLocation): string {
  const label = effectiveLabel(loc);
  const floor = safe(loc.floor);
  const suite = safe(loc.suite);
  const row = safe(loc.row);
  const rack = safe(loc.rack);

  return `Label: ${label} | Floor: ${floor} | Suite: ${suite} | Row: ${row} | Rack: ${rack}`;
}

// UI display format (lists, admin screens, etc):
//   <LocationLabel> — Label: <SiteAbbrev> | Floor: <Floor> | Suite: <Suite> | Row: <Row> | Rack: <Rack>
export function formatLocationDisplay(loc: SiteLocation, siteAbbrev: string): string {
  const siteCode = safe(siteAbbrev);
  const locationLabel = effectiveLabel(loc, siteCode);
  return `${locationLabel} — Label: ${siteCode} | Floor: ${safe(loc.floor)} | Suite: ${safe(loc.suite)} | Row: ${safe(loc.row)} | Rack: ${safe(loc.rack)}`;
}

// ZPL print format (cross-rack label output):
//   <LocationLabel>/<Floor>/<Suite>/<Row>/<Rack>
export function formatLocationPrint(loc: SiteLocation): string {
  return `${effectiveLabel(loc)}/${safe(loc.floor)}/${safe(loc.suite)}/${safe(loc.row)}/${safe(loc.rack)}`;
}

export function formatLocationWithPrefix(prefix: string, loc: SiteLocation): string {
  const prefixClean = safe(prefix) || 'Site';
  return `${prefixClean} — ${formatLocationFields(loc)}`;
}

export function locationHierarchyKeys(loc: SiteLocation): {
  label: string;
  floor: string;
  suite: string;
  row: string;
  rack: string;
} {
  return {
    label: effectiveLabel(loc),
    floor: safe(loc.floor) || 'Unspecified',
    suite: safe(loc.suite) || 'Unspecified',
    row: safe(loc.row) || 'Unspecified',
    rack: safe(loc.rack) || 'Unspecified',
  };
}
