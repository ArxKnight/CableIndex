import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { clampInt } from './utils';
import { ZplOutput } from './ZplOutput';
import { PduPreview } from './ToolLabelPreview';

function generatePduZpl(pduSid: string, fromPort: number, toPort: number): string {
  const sid = pduSid.trim();
  if (!sid) return '';

  const from = clampInt(fromPort, 1, 999);
  const to = clampInt(toPort, 1, 999);
  if (from > to) return '';

  let out = '';
  for (let i = from; i <= to; i++) {
    const slot = (i - 1) % 3;
    if (i === from) {
      out += '^XA\n^MUm^LH8,19^FS\n';
    } else if (slot === 0) {
      out += '^XZ\n';
      out += '^XA\n^MUm^LH8,19^FS\n';
    }

    const xOffset = slot * 30;
    const portStr = String(i).padStart(2, '0');
    const labelText = `${sid}/${portStr}`;

    out += `^MUm^FO${xOffset},2\n^A0N,7,5\n^FB280,1,1,C\n^FD${labelText}\n^FS\n`;
  }

  if (out) out += '^XZ\n';
  return out;
}

export function PduTool() {
  const [pduSid, setPduSid] = useState('');
  const [fromPort, setFromPort] = useState(1);
  const [toPort, setToPort] = useState(48);

  const isRangeValid = fromPort >= 1 && toPort >= 1 && toPort >= fromPort;
  const disabled = !pduSid.trim() || !isRangeValid;

  const zpl = useMemo(() => generatePduZpl(pduSid, fromPort, toPort), [pduSid, fromPort, toPort]);
  const count = isRangeValid ? toPort - fromPort + 1 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>PDU Labels</CardTitle>
          <CardDescription>PDU labels (3 per page). Format: PDU_SID/PORT (zero-padded).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pduSid">PDU SID</Label>
            <Input id="pduSid" value={pduSid} onChange={(e) => setPduSid(e.target.value)} maxLength={12} placeholder="12345" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pduFrom">From Port</Label>
              <Input
                id="pduFrom"
                type="number"
                min={1}
                max={999}
                value={fromPort}
                onChange={(e) => setFromPort(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pduTo">To Port</Label>
              <Input
                id="pduTo"
                type="number"
                min={1}
                max={999}
                value={toPort}
                onChange={(e) => setToPort(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            {count > 0 ? `Will generate ${count} label${count !== 1 ? 's' : ''}` : 'Enter a valid range'}
          </div>
        </CardContent>
      </Card>

      <ZplOutput
        title="Preview / Download"
        description="Updates live as you type."
        zpl={zpl}
        prefix="PDU"
        disabled={disabled}
        preview={<PduPreview pduSid={pduSid} fromPort={fromPort} toPort={toPort} />}
      />
    </div>
  );
}

export default PduTool;
