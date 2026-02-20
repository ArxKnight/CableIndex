import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatFutureDateDDMMYY, splitLines } from './utils';
import { ZplOutput } from './ZplOutput';
import { DayWipePreview } from './ToolLabelPreview';

function generateDayWipeZpl(sids: string[], days: number): string {
  const dateStr = formatFutureDateDDMMYY(days);
  let out = '';

  for (const sid of [...sids].reverse()) {
    if (!sid.trim()) continue;
    const line = `${sid} Wipe ${dateStr} \\& ${sid} Wipe ${dateStr}`;
    const zpl = `^XA\n^MUm\n^FOC,C\n^A0N,5,5\n^FB600,2,0,C\n^FD${line}\n^XZ`;
    out += `${zpl}\n`;
  }

  return out.trim() + (out.trim() ? '\n' : '');
}

export function DayWipeTool() {
  const [sidList, setSidList] = useState('');
  const [days, setDays] = useState<'30' | '14'>('30');

  const sids = useMemo(() => splitLines(sidList), [sidList]);
  const daysNum = days === '14' ? 14 : 30;
  const dateStr = useMemo(() => formatFutureDateDDMMYY(daysNum), [daysNum]);
  const zpl = useMemo(() => generateDayWipeZpl(sids, daysNum), [sids, daysNum]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>30DAY / 14DAY Labels</CardTitle>
          <CardDescription>Enter SIDs (one per line). Generates wipe-by-date labels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={days} onValueChange={(v) => setDays(v as '30' | '14')}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30DAY</SelectItem>
                <SelectItem value="14">14DAY</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">Current calculated date: {dateStr}</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="day-sids">SIDs</Label>
            <Textarea
              id="day-sids"
              value={sidList}
              onChange={(e) => setSidList(e.target.value)}
              rows={10}
              placeholder="12345"
              className="font-mono"
            />
          </div>

          <div className="text-sm text-muted-foreground flex items-center justify-between">
            <span>2 disks' worth per label</span>
            <span>Count: {sids.length}</span>
          </div>
        </CardContent>
      </Card>

      <ZplOutput
        title="Preview / Download"
        description="Updates live as you type."
        zpl={zpl}
        prefix="30Day"
        disabled={sids.length === 0}
        preview={<DayWipePreview sid={sidList} dateStr={dateStr} />}
      />
    </div>
  );
}

export default DayWipeTool;
