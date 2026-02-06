import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { splitLines } from './utils';
import { ZplOutput } from './ZplOutput';
import { TextPreview } from './ToolLabelPreview';

function generateTextZpl(lines: string[], fontSize: number): string {
  let out = '';
  for (const line of [...lines].reverse()) {
    if (!line.trim()) continue;
    const zpl = `^XA\n^MUm\n^FOC,2\n^A0N,${fontSize},${fontSize}\n^FB600,0,1,C\n^FD${line}\n^XZ`;
    out += `${zpl}\n`;
  }
  return out.trim() + (out.trim() ? '\n' : '');
}

export function TextTool() {
  const [textList, setTextList] = useState('');
  const [fontSize, setFontSize] = useState<'3' | '4' | '6'>('4');

  const lines = useMemo(() => splitLines(textList), [textList]);
  const size = fontSize === '3' ? 3 : fontSize === '6' ? 6 : 4;
  const zpl = useMemo(() => generateTextZpl(lines, size), [lines, size]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>TEXT Labels</CardTitle>
          <CardDescription>Enter text (one per line). No formatting is applied.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Font Size</Label>
            <Select value={fontSize} onValueChange={(v) => setFontSize(v as '3' | '4' | '6')}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Small</SelectItem>
                <SelectItem value="4">Normal</SelectItem>
                <SelectItem value="6">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="text-lines">Lines</Label>
            <Textarea
              id="text-lines"
              value={textList}
              onChange={(e) => setTextList(e.target.value)}
              rows={10}
              placeholder="Hello World"
              className="font-mono"
            />
            <div className="text-xs text-muted-foreground">Count: {lines.length}</div>
          </div>
        </CardContent>
      </Card>

      <ZplOutput
        title="Preview / Download"
        description="Updates live as you type."
        zpl={zpl}
        prefix="Text"
        disabled={lines.length === 0}
        preview={<TextPreview lines={lines} />}
      />
    </div>
  );
}

export default TextTool;
