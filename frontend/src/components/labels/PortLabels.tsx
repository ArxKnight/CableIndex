import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Download, Eye, AlertCircle } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { downloadBlobAsTextFile } from '../../lib/download';

interface PortLabelFormData {
  sid: string;
  fromPort: number;
  toPort: number;
}

interface PortLabelPreview {
  port: number;
  label: string;
}

export function PortLabels() {
  const [formData, setFormData] = useState<PortLabelFormData>({
    sid: '',
    fromPort: 1,
    toPort: 1,
  });
  const [preview, setPreview] = useState<PortLabelPreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof PortLabelFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
    setShowPreview(false);
  };

  const validateForm = (): string | null => {
    if (!formData.sid.trim()) {
      return 'SID is required';
    }

    if (formData.fromPort < 1) {
      return 'From port must be at least 1';
    }

    if (formData.toPort < 1) {
      return 'To port must be at least 1';
    }

    if (formData.fromPort > formData.toPort) {
      return 'From port must be less than or equal to to port';
    }

    if (formData.toPort - formData.fromPort > 100) {
      return 'Port range cannot exceed 100 ports';
    }

    // Check for invalid characters
    if (/[\^~]/.test(formData.sid)) {
      return 'SID cannot contain ^ or ~ characters';
    }

    return null;
  };

  const generatePreview = () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    const previewLabels: PortLabelPreview[] = [];
    for (let port = formData.fromPort; port <= formData.toPort; port++) {
      previewLabels.push({
        port,
        label: `${formData.sid}/${port}`
      });
    }

    setPreview(previewLabels);
    setShowPreview(true);
    setError(null);
  };

  const downloadZPL = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Create download link
      const blob = await apiClient.downloadFile('/labels/port-labels/zpl', {
        sid: formData.sid.trim(),
        fromPort: formData.fromPort,
        toPort: formData.toPort,
      });

      await downloadBlobAsTextFile(blob, 'Ports');

    } catch (error: any) {
      console.error('Error generating port labels:', error);
      if (error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError('Failed to generate port labels. Please try again.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const labelCount = formData.toPort - formData.fromPort + 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Port Label Generator</CardTitle>
          <CardDescription>
            Generate ZPL labels for switch or device ports. Labels will be formatted as [SID]/[PORT_NUMBER] with 3 labels per page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="max-w-xl mx-auto space-y-2">
              <Label htmlFor="sid">Switch/Device SID</Label>
              <Input
                id="sid"
                type="text"
                placeholder="e.g., SW01, RTR-01"
                value={formData.sid}
                onChange={(e) => handleInputChange('sid', e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="flex justify-center">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="fromPort">From Port</Label>
                  <Input
                    id="fromPort"
                    type="number"
                    min="1"
                    max="999"
                    value={formData.fromPort}
                    onChange={(e) => handleInputChange('fromPort', parseInt(e.target.value) || 1)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="toPort">To Port</Label>
                  <Input
                    id="toPort"
                    type="number"
                    min="1"
                    max="999"
                    value={formData.toPort}
                    onChange={(e) => handleInputChange('toPort', parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="text-sm text-muted-foreground">
              {labelCount > 0 && (
                <span>Will generate {labelCount} label{labelCount !== 1 ? 's' : ''}</span>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={generatePreview}
                disabled={!formData.sid.trim() || formData.fromPort > formData.toPort}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>

              <Button
                type="button"
                onClick={downloadZPL}
                disabled={isGenerating || !formData.sid.trim() || formData.fromPort > formData.toPort}
              >
                <Download className="h-4 w-4 mr-2" />
                {isGenerating ? 'Generating...' : 'Download ZPL'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showPreview && preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Label Preview</CardTitle>
            <CardDescription>
              Preview of {preview.length} port label{preview.length !== 1 ? 's' : ''} to be generated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-60 overflow-y-auto">
              {preview.map((item) => (
                <div
                  key={item.port}
                  className="p-2 border rounded text-center text-sm font-mono bg-muted"
                >
                  {item.label}
                </div>
              ))}
            </div>
            {preview.length > 20 && (
              <div className="text-sm text-muted-foreground mt-2">
                Showing first 20 labels. All {preview.length} labels will be included in the download.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PortLabels;