export type DownloadPrefix =
  | 'SID'
  | '30Day'
  | 'Text'
  | 'Racks'
  | 'In-rack'
  | 'Ports'
  | 'PDU'
  | 'Cross-Racks';

export function makeTimestampLocal(): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

export function makeDownloadFilename(prefix: string, timestamp = makeTimestampLocal()): string {
  return `${prefix}_${timestamp}.txt`;
}

export function downloadTextAsFile(content: string, prefix: string): void {
  const filename = makeDownloadFilename(prefix);
  downloadTextAsNamedFile(content, filename);
}

export async function downloadBlobAsTextFile(blob: Blob, prefix: string): Promise<void> {
  const content = await blob.text();
  downloadTextAsFile(content, prefix);
}

export function downloadTextAsNamedFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export function downloadBlobAsNamedFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export async function downloadBlobAsNamedTextFile(blob: Blob, filename: string): Promise<void> {
  const content = await blob.text();
  downloadTextAsNamedFile(content, filename);
}
