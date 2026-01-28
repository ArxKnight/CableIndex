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
  /**
   * Generate ZPL code for a cable label
   * Format: Reference on first line, Source > Destination on second line
   */
  generateCableLabel(data: CableLabelData): string {
    const { referenceNumber, source, destination } = data;
    
    // Validate input data
    this.validateCableLabelData(data);
    
    // Generate ZPL code with reference on top line, source > destination below
    const zpl = `^XA
^MUm^LH8,19^FS
^MUm^FO0,2
^A0N,7,5
^FB280,1,1,C
^FD#${referenceNumber}^FS
^MUm^FO0,12
^A0N,7,5
^FB280,1,1,C
^FD${source} > ${destination}^FS
^XZ`;
    
    return zpl;
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
    const refNum = label.reference_number || label.ref_string || '';
    const referenceNumber = refNum.includes('-') ? refNum.split('-')[1] || refNum : refNum;
    
    return this.generateCableLabel({
      site: site.name,
      referenceNumber: referenceNumber || 'UNKNOWN',
      source: label.source || 'Unknown',
      destination: label.destination || 'Unknown'
    });
  }

  /**
   * Generate bulk ZPL for multiple labels
   */
  generateBulkLabels(labels: Label[], sites: Site[]): string {
    const siteMap = new Map(sites.map(site => [site.id, site]));
    let bulkZpl = '';
    
    for (const label of labels) {
      const site = siteMap.get(label.site_id);
      if (site) {
        bulkZpl += this.generateFromLabel(label, site) + '\n\n';
      }
    }
    
    return bulkZpl.trim();
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
    
    // Check for balanced ^FD and ^FS commands
    const fdCount = (zplCode.match(/\^FD/g) || []).length;
    const fsCount = (zplCode.match(/\^FS/g) || []).length;
    
    if (fdCount !== fsCount) {
      errors.push('Unbalanced ^FD and ^FS commands');
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
      throw new Error('Site name is required');
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