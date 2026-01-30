import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { makeTimestamp } from './utils';
import { ZplOutput } from './ZplOutput';

function generateInRackZpl(fromSid: string, toSid: string): string {
  if (!fromSid.trim() || !toSid.trim()) return '';
  return `^XA\n^MUm\n^FOC,1\n^A0N,4,4\n^FB200,2,1,C\n^FD${fromSid.trim()} - ${toSid.trim()}\n^FS\n^XZ\n`;
}

export function InRackTool() {
  const [fromSid, setFromSid] = useState('');
  const [toSid, setToSid] = useState('');

  const zpl = useMemo(() => generateInRackZpl(fromSid, toSid), [fromSid, toSid]);
  const disabled = !fromSid.trim() || !toSid.trim();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>IN-RACK Cable Labels</CardTitle>
          <CardDescription>Generates a single label for an in-rack cable (From SID → To SID).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from-sid">From SID</Label>
            <Input id="from-sid" value={fromSid} onChange={(e) => setFromSid(e.target.value)} maxLength={12} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to-sid">To SID</Label>
            <Input id="to-sid" value={toSid} onChange={(e) => setToSid(e.target.value)} maxLength={12} />
          </div>
        </CardContent>
      </Card>

      <ZplOutput
        title="Preview / Download"
        description="Updates live as you type."
        zpl={zpl}
        filename={`inrack_${makeTimestamp()}.zpl`}
        disabled={disabled}
      />
    </div>
  );
}

export default InRackTool;
