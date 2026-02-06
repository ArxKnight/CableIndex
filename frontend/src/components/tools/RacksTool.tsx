import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { splitLines } from './utils';
import { ZplOutput } from './ZplOutput';
import { RackPreview } from './ToolLabelPreview';

function rackShortName(full: string): string {
  const parts = full.split('ROW');
  const after = parts[1] ?? full;
  return after.replace(/\//g, '').replace('R', '');
}

function generateRackZpl(racks: string[]): string {
  let out = '';
  for (const rack of [...racks].reverse()) {
    if (!rack.trim()) continue;
    const short = rackShortName(rack.trim());
    const zpl = `^XA\n^MUM\n^LH25,0\n^FO10,0\n^A0B,7,5\n^FB100,1,1,C\n^FD${short}\n^FS\n^MUm\n^FO20,0\n^BXN,6,200\n^FD${rack.trim()}\n^FS\n^XZ`;
    out += `${zpl}\n`;
  }
  return out.trim() + (out.trim() ? '\n' : '');
}

export function RacksTool() {
  const [rackList, setRackList] = useState('');
  const racks = useMemo(() => splitLines(rackList), [rackList]);
  const firstRack = useMemo(() => racks.find((r) => r.trim()) || '', [racks]);
  const zpl = useMemo(() => generateRackZpl(racks), [racks]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>RACK Labels</CardTitle>
          <CardDescription>Enter rack names (one per line). Template: IVY#/FL#/S#/ROW#/R#</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rack-lines">Rack Names</Label>
            <Textarea
              id="rack-lines"
              value={rackList}
              onChange={(e) => setRackList(e.target.value)}
              rows={10}
              placeholder="IVY/FL1/S1/ROW2/R12"
              className="font-mono"
            />
            <div className="text-xs text-muted-foreground">Count: {racks.length}</div>
          </div>
        </CardContent>
      </Card>

      <ZplOutput
        title="Preview / Download"
        description="Updates live as you type."
        zpl={zpl}
        prefix="Racks"
        disabled={racks.length === 0}
        preview={<RackPreview rack={firstRack} />}
      />
    </div>
  );
}

export default RacksTool;
