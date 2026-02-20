import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Barcode, CalendarDays, Type, Server, ArrowLeftRight, Wrench, Tag, Zap, QrCode } from 'lucide-react';
import { DayWipeTool, InRackTool, PortsTool, PduTool, QrGenTool, RacksTool, SidTool, TextTool } from '../components/tools';

type ToolId = 'sid' | 'daywipe' | 'text' | 'racks' | 'inrack' | 'port' | 'pdu' | 'qr';

const TOOL_IDS: ToolId[] = ['sid', 'daywipe', 'text', 'racks', 'inrack', 'port', 'pdu', 'qr'];

function normalizeToolId(raw: string): ToolId {
  const lowered = raw.toLowerCase();
  return (TOOL_IDS as readonly string[]).includes(lowered) ? (lowered as ToolId) : 'sid';
}

export function ToolsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTool = useMemo<ToolId>(() => {
    return normalizeToolId(searchParams.get('tool') || '');
  }, [searchParams]);

  const setTool = (tool: ToolId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tool', tool);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="h-7 w-7" />
          Tools
        </h1>
        <p className="text-muted-foreground mt-2">Label generators and helpers. Previews update live as you type.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Toolbox</CardTitle>
          <CardDescription>Select a tool tab.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTool} onValueChange={(v) => setTool(v as ToolId)}>
            <TabsList className="w-full flex flex-wrap justify-start gap-1 h-auto">
              <TabsTrigger value="sid" className="gap-2"><Barcode className="h-4 w-4" />SID</TabsTrigger>
              <TabsTrigger value="daywipe" className="gap-2"><CalendarDays className="h-4 w-4" />30DAY</TabsTrigger>
              <TabsTrigger value="text" className="gap-2"><Type className="h-4 w-4" />TEXT</TabsTrigger>
              <TabsTrigger value="racks" className="gap-2"><Server className="h-4 w-4" />RACKS</TabsTrigger>
              <TabsTrigger value="inrack" className="gap-2"><ArrowLeftRight className="h-4 w-4" />IN-RACK</TabsTrigger>
              <TabsTrigger value="port" className="gap-2"><Tag className="h-4 w-4" />PORTS</TabsTrigger>
              <TabsTrigger value="pdu" className="gap-2"><Zap className="h-4 w-4" />PDU</TabsTrigger>
              <TabsTrigger value="qr" className="gap-2"><QrCode className="h-4 w-4" />QR GEN</TabsTrigger>
            </TabsList>

            <TabsContent value="sid"><SidTool /></TabsContent>
            <TabsContent value="daywipe"><DayWipeTool /></TabsContent>
            <TabsContent value="text"><TextTool /></TabsContent>
            <TabsContent value="racks"><RacksTool /></TabsContent>
            <TabsContent value="inrack"><InRackTool /></TabsContent>
            <TabsContent value="port"><PortsTool /></TabsContent>
            <TabsContent value="pdu"><PduTool /></TabsContent>
            <TabsContent value="qr"><QrGenTool /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default ToolsPage;
