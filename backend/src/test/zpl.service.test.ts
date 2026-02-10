import { describe, it, expect, beforeEach } from 'vitest';
import ZPLService, { CableLabelData, PortLabelData, PDULabelData } from '../services/ZPLService.js';
import { Label, Site } from '../types/index.js';

describe('ZPLService', () => {
  let zplService: ZPLService;

  beforeEach(() => {
    zplService = new ZPLService();
  });

  describe('generateCableLabel', () => {
    it('should generate valid ZPL for cable label', () => {
      const data: CableLabelData = {
        site: 'DC1',
        referenceNumber: '001',
        source: 'Server-01',
        destination: 'Switch-01'
      };

      const zpl = zplService.generateCableLabel(data);

      const expected = [
        '^XA',
        '^MUm^LH8,19^FS',
        '^MUm^FO1,1',
        '^A0N,3,3',
        '^FB292,3,1,C',
        '^FD#001\\&Server-01\\&Switch-01',
        '^FS',
        '^MUm^FO31,1',
        '^A0N,3,3',
        '^FB292,3,1,C',
        '^FD#001\\&Server-01\\&Switch-01',
        '^FS',
        '^XZ',
      ].join('\n');

      expect(zpl).toBe(expected);

      // Ensure ^FS is on its own line (never appended to ^FD).
      expect(zpl).not.toMatch(/\^FD[^\n]*\^FS/);
      expect(zpl.match(/\^FD[^\n]*\n\^FS/g) || []).toHaveLength(2);
    });

    it('should throw error for missing site', () => {
      const data: CableLabelData = {
        site: '',
        referenceNumber: '001',
        source: 'Server-01',
        destination: 'Switch-01'
      };

      expect(() => zplService.generateCableLabel(data)).toThrow('Site abbreviation is required');
    });

    it('should throw error for missing reference number', () => {
      const data: CableLabelData = {
        site: 'DC1',
        referenceNumber: '',
        source: 'Server-01',
        destination: 'Switch-01'
      };

      expect(() => zplService.generateCableLabel(data)).toThrow('Reference number is required');
    });

    it('should throw error for missing source', () => {
      const data: CableLabelData = {
        site: 'DC1',
        referenceNumber: '001',
        source: '',
        destination: 'Switch-01'
      };

      expect(() => zplService.generateCableLabel(data)).toThrow('Source is required');
    });

    it('should throw error for missing destination', () => {
      const data: CableLabelData = {
        site: 'DC1',
        referenceNumber: '001',
        source: 'Server-01',
        destination: ''
      };

      expect(() => zplService.generateCableLabel(data)).toThrow('Destination is required');
    });

    it('should throw error for invalid characters', () => {
      const data: CableLabelData = {
        site: 'DC^1',
        referenceNumber: '001',
        source: 'Server-01',
        destination: 'Switch-01'
      };

      expect(() => zplService.generateCableLabel(data)).toThrow('Label data cannot contain ^ or ~ characters');
    });
  });

  describe('generatePortLabels', () => {
    it('should generate valid ZPL for port labels', () => {
      const data: PortLabelData = {
        sid: 'SW01',
        fromPort: 1,
        toPort: 3
      };

      const zpl = zplService.generatePortLabels(data);

      expect(zpl).toContain('^XA');
      expect(zpl).toContain('^XZ');
      expect(zpl).toContain('SW01/1');
      expect(zpl).toContain('SW01/2');
      expect(zpl).toContain('SW01/3');
    });

    it('should generate multiple pages for many ports', () => {
      const data: PortLabelData = {
        sid: 'SW01',
        fromPort: 1,
        toPort: 5
      };

      const zpl = zplService.generatePortLabels(data);
      const pageCount = (zpl.match(/\^XA/g) || []).length;

      expect(pageCount).toBe(2); // 3 labels per page, so 5 labels = 2 pages
    });

    it('should throw error for missing SID', () => {
      const data: PortLabelData = {
        sid: '',
        fromPort: 1,
        toPort: 3
      };

      expect(() => zplService.generatePortLabels(data)).toThrow('SID is required');
    });

    it('should throw error for invalid port range', () => {
      const data: PortLabelData = {
        sid: 'SW01',
        fromPort: 5,
        toPort: 3
      };

      expect(() => zplService.generatePortLabels(data)).toThrow('From port must be less than or equal to to port');
    });

    it('should throw error for too many ports', () => {
      const data: PortLabelData = {
        sid: 'SW01',
        fromPort: 1,
        toPort: 102
      };

      expect(() => zplService.generatePortLabels(data)).toThrow('Port range cannot exceed 100 ports');
    });

    it('should throw error for invalid characters in SID', () => {
      const data: PortLabelData = {
        sid: 'SW^01',
        fromPort: 1,
        toPort: 3
      };

      expect(() => zplService.generatePortLabels(data)).toThrow('SID cannot contain ^ or ~ characters');
    });
  });

  describe('generatePDULabels', () => {
    it('should generate valid ZPL for PDU labels', () => {
      const data: PDULabelData = {
        pduSid: 'PDU-A1',
        fromPort: 1,
        toPort: 3
      };

      const zpl = zplService.generatePDULabels(data);

      expect(zpl).toContain('^XA');
      expect(zpl).toContain('^XZ');
      expect(zpl).toContain('PDU-A1/1');
      expect(zpl).toContain('PDU-A1/2');
      expect(zpl).toContain('PDU-A1/3');
    });

    it('should throw error for missing PDU SID', () => {
      const data: PDULabelData = {
        pduSid: '',
        fromPort: 1,
        toPort: 3
      };

      expect(() => zplService.generatePDULabels(data)).toThrow('PDU SID is required');
    });

    it('should throw error for too many PDU ports', () => {
      const data: PDULabelData = {
        pduSid: 'PDU-A1',
        fromPort: 1,
        toPort: 50
      };

      expect(() => zplService.generatePDULabels(data)).toThrow('PDU port range cannot exceed 48 ports');
    });

    it('should throw error for invalid characters in PDU SID', () => {
      const data: PDULabelData = {
        pduSid: 'PDU~A1',
        fromPort: 1,
        toPort: 3
      };

      expect(() => zplService.generatePDULabels(data)).toThrow('PDU SID cannot contain ^ or ~ characters');
    });
  });

  describe('generateFromLabel', () => {
    it('should generate ZPL from existing label and site', () => {
      const label = {
        id: 1,
        ref_string: '001',
        source: 'Server-01',
        destination: 'Switch-01',
        site_id: 1,
        notes: undefined,
        zpl_content: undefined,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      } as any;

      const site = {
        id: 1,
        name: 'DC1',
        code: 'DC1',
        location: 'Data Center 1',
        description: 'Main data center',
        created_by: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      } as any;

      const zpl = zplService.generateFromLabel(label, site);

      expect(zpl).toContain('^XA');
      expect(zpl).toContain('^XZ');
      expect(zpl).toContain('#001\\&Server-01\\&Switch-01');
    });

    it('should format DATACENTRE and DOMESTIC locations as compact paths (mixed templates)', () => {
      const label = {
        id: 1,
        ref_string: '0007',
        site_id: 1,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        source_location: {
          id: 10,
          site_id: 1,
          template_type: 'DATACENTRE',
          label: null,
          floor: '2',
          suite: '1',
          row: 'A',
          rack: '1',
          area: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        },
        destination_location: {
          id: 11,
          site_id: 1,
          template_type: 'DOMESTIC',
          label: null,
          floor: '0',
          suite: null,
          row: null,
          rack: null,
          area: '  Garage   Bench  ',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      } as any;

      const site = {
        id: 1,
        code: 'IVY',
        name: 'IVY',
        created_by: 1,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      } as any;

      const zpl = zplService.generateFromLabel(label, site);
      expect(zpl).toContain('#0007\\&IVY/2/1/A/1\\&IVY/0/Garage Bench');
    });
  });

  describe('generateBulkLabels', () => {
    it('should generate bulk ZPL for multiple labels', () => {
      const labels = [
        {
          id: 1,
          ref_string: '001',
          source: 'Server-01',
          destination: 'Switch-01',
          site_id: 1,
          notes: undefined,
          zpl_content: undefined,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 2,
          ref_string: '002',
          source: 'Server-02',
          destination: 'Switch-01',
          site_id: 1,
          notes: undefined,
          zpl_content: undefined,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ] as any;

      const sites = [
        {
          id: 1,
          name: 'DC1',
          code: 'DC1',
          location: 'Data Center 1',
          description: 'Main data center',
          created_by: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ] as any;

      const zpl = zplService.generateBulkLabels(labels, sites);

      expect(zpl).toContain('#001\\&Server-01\\&Switch-01');
      expect(zpl).toContain('#002\\&Server-02\\&Switch-01');
      
      // Should contain multiple ZPL blocks
      const zplBlocks = zpl.split('^XZ').filter(block => block.trim().length > 0);
      expect(zplBlocks.length).toBe(2);
    });

    it('should handle empty labels array', () => {
      const zpl = zplService.generateBulkLabels([], []);
      expect(zpl).toBe('');
    });
  });

  describe('validateZPL', () => {
    it('should validate correct ZPL format', () => {
      const validZpl = `^XA
^MUm^LH8,19^FS
^MUm^FO0,2
^A0N,7,5
^FB280,1,1,C
^FDTest Label^FS
^XZ`;

      const result = zplService.validateZPL(validZpl);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing ^XA', () => {
      const invalidZpl = `^MUm^LH8,19^FS
^FDTest Label^FS
^XZ`;

      const result = zplService.validateZPL(invalidZpl);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ZPL code must start with ^XA');
    });

    it('should detect missing ^XZ', () => {
      const invalidZpl = `^XA
^MUm^LH8,19^FS
^FDTest Label^FS`;

      const result = zplService.validateZPL(invalidZpl);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ZPL code must end with ^XZ');
    });

    it('should detect missing required commands', () => {
      const invalidZpl = `^XA
^MUm^LH8,19^FS
^XZ`;

      const result = zplService.validateZPL(invalidZpl);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ZPL code must contain ^FD command');
    });

    it('should detect unbalanced ^FD and ^FS commands', () => {
      const invalidZpl = `^XA
^FDTest Label^FS
^FDAnother Label
^XZ`;

      const result = zplService.validateZPL(invalidZpl);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unbalanced ^FD and ^FS commands');
    });
  });

  describe('formatZPL', () => {
    it('should format ZPL code for readability', () => {
      const unformattedZpl = '^XA^MUm^LH8,19^FS^FDTest^FS^XZ';
      const formatted = zplService.formatZPL(unformattedZpl);

      expect(formatted).toContain('^XA\n');
      expect(formatted).toContain('^FS\n');
      expect(formatted).toContain('\n^XZ');
    });

    it('should remove excessive newlines', () => {
      const messyZpl = '^XA\n\n\n^FDTest^FS\n\n^XZ';
      const formatted = zplService.formatZPL(messyZpl);

      expect(formatted).not.toContain('\n\n');
    });
  });
});