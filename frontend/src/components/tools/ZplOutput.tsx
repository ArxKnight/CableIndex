import { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Download, Eye, Copy } from 'lucide-react';
import { downloadTextAsFile, makeDownloadFilename } from '../../lib/download';

interface ZplOutputProps {
  title?: string;
  description?: string;
  zpl: string;
  prefix: string;
  disabled?: boolean;
  preview?: React.ReactNode;
}

export function ZplOutput({ title = 'Output', description, zpl, prefix, disabled, preview }: ZplOutputProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const filename = useMemo(() => makeDownloadFilename(prefix), [prefix]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(zpl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            onClick={() => downloadTextAsFile(zpl, prefix)}
            disabled={disabled || !zpl.trim()}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Label/s .txt
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={disabled || !zpl.trim()}
            onClick={() => setOpen(true)}
          >
            <Eye className="h-4 w-4 mr-2" />
            View ZPL
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{filename}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={handleCopy}>
                    <Copy className="h-4 w-4 mr-2" />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <Textarea value={zpl} readOnly className="font-mono min-h-[50vh]" />
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground mb-2">Label Preview</div>
          {preview || <div className="text-sm text-muted-foreground">(no preview yet)</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default ZplOutput;
