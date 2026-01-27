
import { PortLabels } from '../components/labels';

export function PortLabelsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Port Labels</h1>
        <p className="text-muted-foreground mt-2">
          Generate ZPL labels for switch and device ports with automatic numbering.
        </p>
      </div>
      
      <PortLabels />
    </div>
  );
}

export default PortLabelsPage;