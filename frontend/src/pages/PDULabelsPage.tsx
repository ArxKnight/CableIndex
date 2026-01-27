
import { PDULabels } from '../components/labels';

export function PDULabelsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">PDU Labels</h1>
        <p className="text-muted-foreground mt-2">
          Generate ZPL labels for Power Distribution Unit (PDU) outlets with automatic numbering.
        </p>
      </div>
      
      <PDULabels />
    </div>
  );
}

export default PDULabelsPage;