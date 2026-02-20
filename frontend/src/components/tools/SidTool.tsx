import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { splitLines } from './utils';
import { ZplOutput } from './ZplOutput';
import { SidPreview } from './ToolLabelPreview';

function generateSidZpl(sids: string[]): string {
  let out = '';
  for (const sid of [...sids].reverse()) {
    if (!sid.trim()) continue;

    const zpl = `^XA\n^MUm^LH27,1^FS\n^MUm^FO3,1\n^A0N,9,9\n^FB336,1,1,C\n^FD${sid}\n^FS\n^MUm^FO35,0\n^BXN,9,200\n^FD${sid}\n^FS\n^XZ`;
    out += `${zpl}\n${zpl}\n`;
  }
  return out.trim() + (out.trim() ? '\n' : '');
}

export function SidTool() {
  const [sidList, setSidList] = useState('');

  const sids = useMemo(() => splitLines(sidList), [sidList]);
  const zpl = useMemo(() => generateSidZpl(sids), [sids]);
  const searchFriendly = useMemo(() => sids.join(', '), [sids]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>SID Labels</CardTitle>
          <CardDescription>Enter SIDs (one per line). Generates two labels per SID with a DataMatrix.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sid-sids">SIDs</Label>
            <Textarea
              id="sid-sids"
              value={sidList}
              onChange={(e) => setSidList(e.target.value)}
              rows={10}
              placeholder="12345"
              className="font-mono"
            />
          </div>

          <div className="text-sm text-muted-foreground flex items-center justify-between">
            <span>Two labels per SID with DataMatrix</span>
            <span>Count: {sids.length}</span>
          </div>

          <div className="rounded-md border p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Search friendly</div>
            <div className="text-sm break-words">{searchFriendly || '—'}</div>
          </div>
        </CardContent>
      </Card>

      <ZplOutput
        title="Preview / Download"
        description="Updates live as you type."
        zpl={zpl}
        prefix="SID"
        disabled={sids.length === 0}
        preview={<SidPreview sid={sidList} />}
      />
    </div>
  );
}

export default SidTool;
