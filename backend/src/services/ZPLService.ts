import { Label, Site } from '../types/index.js';

export interface CableLabelData {
  site: string;
  referenceNumber: string;
  source: string;
  destination: string;
}

export interface PortLabelData {
  sid: string;
  fromPort: number;
  toPort: number;
}

export interface PDULabelData {
  pduSid: string;
  fromPort: number;
  toPort: number;
}

export interface ZPLValidationResult {
  isValid: boolean;
  errors: string[];
}

export class ZPLService {
  private safe(value: unknown): string {
    return (value ?? '').toString().trim();
  }

  private formatLocationPrint(location: {
    label?: string | null;
    floor?: string | null;
    suite?: string | null;
    row?: string | null;
    rack?: string | null;
  }): string {
    const label = this.safe(location.label);
    const floor = this.safe(location.floor);
    const suite = this.safe(location.suite);
    const row = this.safe(location.row);
    const rack = this.safe(location.rack);
    return `${label}/${floor}/${suite}/${row}/${rack}`;
  }

  /**
   * Generate ZPL code for a cable label
   * Format: #[REF]\& [SOURCE]\& [DESTINATION] (printed twice per label)
   */
  generateCableLabel(data: CableLabelData): string {
    const { referenceNumber, source, destination } = data;
    
    // Validate input data
    this.validateCableLabelData(data);
    
    const payload = `#${referenceNumber}\\& ${source}\\& ${destination}`;

    const lines: string[] = [
      '^XA',
      '^MUm^LH8,19^FS',
      '^MUm^FO1,1',
      '^A0N,3,3',
      '^FB292,3,1,C',
      `^FD${payload}`,
      '^FS',
      '^MUm^FO31,1',
      '^A0N,3,3',
      '^FB292,3,1,C',
      `^FD${payload}`,
      '^FS',
      '^XZ',
    ];

    return lines.join('\n');
  }

  /**
   * Generate ZPL code for port labels (3 per page)
   * Format: [SID]/[PORT_NUMBER]
   */
  generatePortLabels(data: PortLabelData): string {
    const { sid, fromPort, toPort } = data;
    
    // Validate input data
    this.validatePortLabelData(data);
    
    let zplCode = '';
    let currentPort = fromPort;
    
    while (currentPort <= toPort) {
      // Start new page
      zplCode += '^XA\n^MUm^LH8,19^FS\n';
      
      // Generate up to 3 labels per page
      for (let labelIndex = 0; labelIndex < 3 && currentPort <= toPort; labelIndex++) {
        const yOffset = labelIndex * 100; // Vertical spacing between labels
        const labelText = `${sid}/${currentPort}`;
        
        zplCode += `^MUm^FO0,${2 + yOffset}
^A0N,7,5
^FB280,1,1,C
^FD${labelText}^FS
`;
        currentPort++;
      }
      
      zplCode += '^XZ\n';
    }
    
    return zplCode.trim();
  }

  /**
   * Generate ZPL code for PDU labels
   * Format: [PDU_SID]/[PORT_NUMBER]
   */
  generatePDULabels(data: PDULabelData): string {
    const { pduSid, fromPort, toPort } = data;
    
    // Validate input data
    this.validatePDULabelData(data);
    
    // PDU labels use the same format as port labels
    return this.generatePortLabels({
      sid: pduSid,
      fromPort,
      toPort
    });
  }

  /**
   * Generate ZPL code from existing label data
   */
  generateFromLabel(label: Label, site: Site): string {
    const referenceNumber = (String(label.ref_string || '').trim() || (Number.isFinite(label.ref_number) ? String(label.ref_number).padStart(4, '0') : '') || 'UNKNOWN');

    const source = label.source_location
      ? this.formatLocationPrint(label.source_location)
      : (label.source || 'Unknown');

    const destination = label.destination_location
      ? this.formatLocationPrint(label.destination_location)
      : (label.destination || 'Unknown');
    
    return this.generateCableLabel({
      site: site.code,
      referenceNumber: referenceNumber || 'UNKNOWN',
      source,
      destination
    });
  }

  /**
   * Generate bulk ZPL for multiple labels
   */
  generateBulkLabels(labels: Label[], sites: Site[]): string {
    const siteMap = new Map(sites.map(site => [site.id, site]));
    const blocks: string[] = [];

    for (const label of labels) {
      const site = siteMap.get(label.site_id);
      if (!site) continue;
      blocks.push(this.generateFromLabel(label, site));
    }

    return blocks.join('\n').trim();
  }

  /**
   * Validate ZPL code format and structure
   */
  validateZPL(zplCode: string): ZPLValidationResult {
    const errors: string[] = [];
    
    // Check if ZPL starts with ^XA and ends with ^XZ
    if (!zplCode.trim().startsWith('^XA')) {
      errors.push('ZPL code must start with ^XA');
    }
    
    if (!zplCode.trim().endsWith('^XZ')) {
      errors.push('ZPL code must end with ^XZ');
    }
    
    // Check for basic ZPL commands
    const requiredCommands = ['^FD', '^FS'];
    for (const command of requiredCommands) {
      if (!zplCode.includes(command)) {
        errors.push(`ZPL code must contain ${command} command`);
      }
    }

    // Check that every ^FD has a terminating ^FS after it.
    // Note: many templates include additional ^FS (e.g., after ^LH), so we
    // cannot require a strict 1:1 count of ^FD and ^FS.
    const fdMatches = [...zplCode.matchAll(/\^FD/g)];
    for (const match of fdMatches) {
      const startIndex = match.index ?? -1;
      if (startIndex < 0) continue;
      const remainder = zplCode.slice(startIndex);
      if (!remainder.includes('^FS')) {
        errors.push('Unbalanced ^FD and ^FS commands');
        break;
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Format ZPL code for better readability
   */
  formatZPL(zplCode: string): string {
    return zplCode
      .replace(/\^XA/g, '^XA\n')
      .replace(/\^XZ/g, '\n^XZ')
      .replace(/\^FS/g, '^FS\n')
      .replace(/\n\n+/g, '\n')
      .trim();
  }

  /**
   * Validate cable label data
   */
  private validateCableLabelData(data: CableLabelData): void {
    const { site, referenceNumber, source, destination } = data;
    
    if (!site || !site.trim()) {
      throw new Error('Site abbreviation is required');
    }
    
    if (!referenceNumber || !referenceNumber.trim()) {
      throw new Error('Reference number is required');
    }
    
    if (!source || !source.trim()) {
      throw new Error('Source is required');
    }
    
    if (!destination || !destination.trim()) {
      throw new Error('Destination is required');
    }
    
    // Check for invalid characters that might break ZPL
    const invalidChars = /[\^~]/;
    if (invalidChars.test(site) || invalidChars.test(referenceNumber) || 
        invalidChars.test(source) || invalidChars.test(destination)) {
      throw new Error('Label data cannot contain ^ or ~ characters');
    }
  }

  /**
   * Validate port label data
   */
  private validatePortLabelData(data: PortLabelData): void {
    const { sid, fromPort, toPort } = data;
    
    if (!sid || !sid.trim()) {
      throw new Error('SID is required');
    }
    
    if (!Number.isInteger(fromPort) || fromPort < 1) {
      throw new Error('From port must be a positive integer');
    }
    
    if (!Number.isInteger(toPort) || toPort < 1) {
      throw new Error('To port must be a positive integer');
    }
    
    if (fromPort > toPort) {
      throw new Error('From port must be less than or equal to to port');
    }
    
    if (toPort - fromPort > 100) {
      throw new Error('Port range cannot exceed 100 ports');
    }
    
    // Check for invalid characters
    const invalidChars = /[\^~]/;
    if (invalidChars.test(sid)) {
      throw new Error('SID cannot contain ^ or ~ characters');
    }
  }

  /**
   * Validate PDU label data
   */
  private validatePDULabelData(data: PDULabelData): void {
    const { pduSid, fromPort, toPort } = data;
    
    if (!pduSid || !pduSid.trim()) {
      throw new Error('PDU SID is required');
    }
    
    if (!Number.isInteger(fromPort) || fromPort < 1) {
      throw new Error('From port must be a positive integer');
    }
    
    if (!Number.isInteger(toPort) || toPort < 1) {
      throw new Error('To port must be a positive integer');
    }
    
    if (fromPort > toPort) {
      throw new Error('From port must be less than or equal to to port');
    }
    
    if (toPort - fromPort > 48) {
      throw new Error('PDU port range cannot exceed 48 ports');
    }
    
    // Check for invalid characters
    const invalidChars = /[\^~]/;
    if (invalidChars.test(pduSid)) {
      throw new Error('PDU SID cannot contain ^ or ~ characters');
    }
  }
}

export default ZPLService;