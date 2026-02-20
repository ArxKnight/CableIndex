import { useEffect, useMemo, useState } from 'react';
import * as QRCode from 'qrcode';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Download } from 'lucide-react';
import { splitLines } from './utils';
import { downloadBlobAsNamedFile, makeTimestampLocal } from '../../lib/download';

type PaperSize = 'a4' | '4x6';

type Layout = {
  label: string;
  pageWidthPx: number;
  pageHeightPx: number;
  marginPx: number;
};

const LAYOUTS: Record<PaperSize, Layout> = {
  a4: {
    label: 'A4',
    // 150 DPI A4 (8.27" x 11.69")
    pageWidthPx: 1240,
    pageHeightPx: 1754,
    marginPx: 48,
  },
  '4x6': {
    label: '4×6',
    // 150 DPI 4"x6"
    pageWidthPx: 600,
    pageHeightPx: 900,
    marginPx: 28,
  },
};

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => r.blob());
}

async function generateQrSheetPng(payload: string, paper: PaperSize): Promise<string> {
  const layout = LAYOUTS[paper];

  const canvas = document.createElement('canvas');
  canvas.width = layout.pageWidthPx;
  canvas.height = layout.pageHeightPx;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const contentW = layout.pageWidthPx - layout.marginPx * 2;
  const contentH = layout.pageHeightPx - layout.marginPx * 2;

  const qrSize = Math.floor(Math.min(contentW, contentH));
  const qrX = Math.floor(layout.marginPx + (contentW - qrSize) / 2);
  const qrY = Math.floor(layout.marginPx + (contentH - qrSize) / 2);

  const qrDataUrl = await QRCode.toDataURL(payload, {
    margin: 1,
    width: qrSize,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load QR image'));
    image.src = qrDataUrl;
  });

  ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

  return canvas.toDataURL('image/png');
}

export function QrGenTool() {
  const [stockIdList, setStockIdList] = useState('');
  const [paper, setPaper] = useState<PaperSize>('a4');
  const [pngDataUrl, setPngDataUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const ids = useMemo(() => splitLines(stockIdList), [stockIdList]);
  const payload = useMemo(() => ids.join('\n'), [ids]);
  const layout = LAYOUTS[paper];

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!ids.length) {
        setPngDataUrl('');
        return;
      }

      setBusy(true);
      try {
        const url = await generateQrSheetPng(payload, paper);
        if (!cancelled) setPngDataUrl(url);
      } catch {
        if (!cancelled) setPngDataUrl('');
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [ids, payload, paper]);

  const downloadPng = async () => {
    if (!pngDataUrl) return;
    const filename = `QRGen_${layout.label}_${makeTimestampLocal()}.png`;
    const blob = await dataUrlToBlob(pngDataUrl);
    downloadBlobAsNamedFile(blob, filename);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>QR Gen</CardTitle>
          <CardDescription>Enter Stock IDs (one per line). Generates a single QR code containing the full newline-separated list.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Paper</Label>
            <Select value={paper} onValueChange={(v) => setPaper(v as PaperSize)}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="4x6">4×6</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">One QR per page</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qr-ids">Stock IDs</Label>
            <Textarea
              id="qr-ids"
              value={stockIdList}
              onChange={(e) => setStockIdList(e.target.value)}
              rows={10}
              placeholder="0001"
              className="font-mono"
            />
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Count: {ids.length}</span>
              <span>Encoded: {payload.length} chars</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview / Download</CardTitle>
          <CardDescription>Updates live as you type.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" onClick={downloadPng} disabled={!pngDataUrl || busy}>
              <Download className="h-4 w-4 mr-2" />
              Download .png
            </Button>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground mb-2">Label Preview</div>
            {!ids.length && <div className="text-sm text-muted-foreground">(enter at least one Stock ID)</div>}
            {ids.length > 0 && busy && <div className="text-sm text-muted-foreground">Generating…</div>}
            {pngDataUrl && (
              <div className="space-y-2">
                <img src={pngDataUrl} alt="QR sheet preview" className="w-full h-auto rounded-sm border" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default QrGenTool;
