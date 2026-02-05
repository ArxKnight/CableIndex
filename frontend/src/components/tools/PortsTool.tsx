import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { clampInt } from './utils';
import { ZplOutput } from './ZplOutput';
import { PortsPreview } from './ToolLabelPreview';

const BANKS = ['Bank1', 'Bank2', 'Bank3', 'Bank4'] as const;
const PREFIXES = ['PORT', 'Gi1', 'Gi2', 'Te1', 'Eth', 'Et', 'Fa1'] as const;

function computeFontSize(hostname: string, bankPrefix: string): { font: string; warning: boolean } {
  const firstLineLength = (hostname.trim() + ' ' + bankPrefix).trim().length;
  if (firstLineLength <= 13) return { font: '4,3', warning: false };
  if (firstLineLength <= 21) return { font: '3,2', warning: false };
  return { font: '2,1', warning: firstLineLength > 22 };
}

function generatePortZpl(opts: {
  hostname: string;
  useBankPrefix: boolean;
  bank: string;
  prefix: string;
  fromPort: number;
  toPort: number;
}): string {
  const hostname = opts.hostname.trim();
  if (!hostname) return '';

  const fromPort = clampInt(opts.fromPort, 1, 999);
  const toPort = clampInt(opts.toPort, 1, 999);
  if (fromPort > toPort) return '';

  const bankPrefix = opts.useBankPrefix ? `${opts.bank} ` : '';
  const { font } = computeFontSize(hostname, bankPrefix);

  let out = '';
  for (let i = fromPort; i <= toPort; i++) {
    const slot = (i - 1) % 3;
    if (i === fromPort) {
      out += '^XA\n^MUm^LH8,19^FS\n';
    } else if (slot === 0) {
      out += '^XZ\n';
      out += '^XA\n^MUm^LH8,19^FS\n';
    }

    const xOffset = slot * 30 + 1;
    const portStr = String(i).padStart(2, '0');
    const labelText = `${hostname}\\& ${bankPrefix}${opts.prefix.toUpperCase()} ${portStr}`;

    out += `^MUm^FO${xOffset},1\n^A0N,${font}\n^FB280,2,1,C\n^FD${labelText}\n^FS\n`;
  }

  if (out) out += '^XZ\n';
  return out;
}

export function PortsTool() {
  const [hostname, setHostname] = useState('');
  const [useBankPrefix, setUseBankPrefix] = useState(false);
  const [bank, setBank] = useState<(typeof BANKS)[number]>('Bank1');
  const [prefix, setPrefix] = useState<(typeof PREFIXES)[number]>('PORT');
  const [fromPort, setFromPort] = useState(1);
  const [toPort, setToPort] = useState(48);

  const bankPrefix = useBankPrefix ? `${bank} ` : '';
  const { warning } = computeFontSize(hostname, bankPrefix);

  const isRangeValid = fromPort >= 1 && toPort >= 1 && toPort >= fromPort;
  const disabled = !hostname.trim() || !isRangeValid;

  const zpl = useMemo(
    () =>
      generatePortZpl({
        hostname,
        useBankPrefix,
        bank,
        prefix,
        fromPort,
        toPort,
      }),
    [hostname, useBankPrefix, bank, prefix, fromPort, toPort]
  );

  const count = isRangeValid ? toPort - fromPort + 1 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Port Labels</CardTitle>
          <CardDescription>
            Legacy-style port labels (3 per page). First line: hostname. Second line: bank/prefix + port.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hostname">Hostname</Label>
            <Input id="hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="MAN5-SW370" />
            {warning && (
              <Alert variant="destructive">
                <AlertDescription>
                  Hostname + bank prefix is long (&gt; 22 chars). It will print with a very small font.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="useBank" checked={useBankPrefix} onCheckedChange={(v) => setUseBankPrefix(Boolean(v))} />
            <Label htmlFor="useBank">Use Bank Prefix</Label>
          </div>

          {useBankPrefix && (
            <div className="space-y-2">
              <Label>Bank Prefix</Label>
              <Select value={bank} onValueChange={(v) => setBank(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Label Prefix</Label>
            <Select value={prefix} onValueChange={(v) => setPrefix(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {PREFIXES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fromPort">From Port</Label>
              <Input
                id="fromPort"
                type="number"
                min={1}
                max={999}
                value={fromPort}
                onChange={(e) => setFromPort(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="toPort">To Port</Label>
              <Input
                id="toPort"
                type="number"
                min={1}
                max={999}
                value={toPort}
                onChange={(e) => setToPort(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          <div className="text-sm text-muted-foreground flex items-center justify-between">
            <span>{count > 0 ? `Will generate ${count} label${count !== 1 ? 's' : ''}` : 'Enter a valid range'}</span>
            {warning && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm" disabled={disabled}>
                    Proceed Anyway
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Warning: Long Hostname</AlertDialogTitle>
                    <AlertDialogDescription>
                      This hostname will be printed in a very small font. If that’s acceptable, you can proceed and download.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button type="button" onClick={() => { /* no-op: output is always available */ }}>
                        OK
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>

      <ZplOutput
        title="Preview / Download"
        description="Updates live as you type."
        zpl={zpl}
        prefix="Ports"
        disabled={disabled}
        preview={
          <PortsPreview
            hostname={hostname}
            bankPrefix={useBankPrefix ? bank : ''}
            prefix={prefix}
            fromPort={fromPort}
            toPort={toPort}
          />
        }
      />
    </div>
  );
}

export default PortsTool;
