import type { SiteLocation } from '../types';

function safe(value: unknown): string {
  return (value ?? '').toString().trim();
}

// Section 4A display: field-based, fixed ordering, fixed separators.
export function formatLocationFields(loc: SiteLocation): string {
  const label = safe(loc.label);
  const floor = safe(loc.floor);
  const suite = safe(loc.suite);
  const row = safe(loc.row);
  const rack = safe(loc.rack);

  return `Label: ${label} | Floor: ${floor} | Suite: ${suite} | Row: ${row} | Rack: ${rack}`;
}

// UI display format (lists, admin screens, etc):
//   <LocationLabel> — Label: <SiteAbbrev> | Floor: <Floor> | Suite: <Suite> | Row: <Row> | Rack: <Rack>
export function formatLocationDisplay(loc: SiteLocation, siteAbbrev: string): string {
  const locationLabel = safe(loc.label);
  const siteCode = safe(siteAbbrev);
  return `${locationLabel} — Label: ${siteCode} | Floor: ${safe(loc.floor)} | Suite: ${safe(loc.suite)} | Row: ${safe(loc.row)} | Rack: ${safe(loc.rack)}`;
}

// ZPL print format (cross-rack label output):
//   <LocationLabel>/<Floor>/<Suite>/<Row>/<Rack>
export function formatLocationPrint(loc: SiteLocation): string {
  return `${safe(loc.label)}/${safe(loc.floor)}/${safe(loc.suite)}/${safe(loc.row)}/${safe(loc.rack)}`;
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
    label: safe(loc.label) || 'Unlabeled',
    floor: safe(loc.floor) || 'Unspecified',
    suite: safe(loc.suite) || 'Unspecified',
    row: safe(loc.row) || 'Unspecified',
    rack: safe(loc.rack) || 'Unspecified',
  };
}
