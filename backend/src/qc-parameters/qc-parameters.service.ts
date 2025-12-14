import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { QCPhase } from '@prisma/client';

interface ExcelRow {
  parameter_key: string;
  parameter_label: string;
  data_type: string;
  enum_values?: string;
  required: boolean;
  default_value?: string;
}

@Injectable()
export class QCParametersService {
  constructor(private prisma: PrismaService) {}

  private mapSheetNameToPhase(sheetName: string): QCPhase {
    const mapping: Record<string, QCPhase> = {
      'Pre-Live': QCPhase.PreLive,
      'Post-Live': QCPhase.PostLive,
      'Staging': QCPhase.Staging,
    };
    return mapping[sheetName] || QCPhase.Staging;
  }

  private validateRow(row: any, rowNumber: number): ExcelRow {
    const errors: string[] = [];

    if (!row.parameter_key || typeof row.parameter_key !== 'string') {
      errors.push(`Row ${rowNumber}: parameter_key is required and must be a string`);
    }
    if (!row.parameter_label || typeof row.parameter_label !== 'string') {
      errors.push(`Row ${rowNumber}: parameter_label is required and must be a string`);
    }
    if (!row.data_type || typeof row.data_type !== 'string') {
      errors.push(`Row ${rowNumber}: data_type is required and must be a string`);
    }
    if (!['string', 'number', 'boolean', 'enum', 'date'].includes(row.data_type)) {
      errors.push(
        `Row ${rowNumber}: data_type must be one of: string, number, boolean, enum, date`,
      );
    }
    if (row.data_type === 'enum' && !row.enum_values) {
      errors.push(`Row ${rowNumber}: enum_values is required when data_type is enum`);
    }
    if (row.required !== undefined && typeof row.required !== 'boolean') {
      // Try to parse string values
      const requiredStr = String(row.required).toLowerCase();
      if (!['true', 'false', 'yes', 'no', '1', '0', ''].includes(requiredStr)) {
        errors.push(`Row ${rowNumber}: required must be a boolean value`);
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }

    // Normalize required field
    let required = false;
    if (typeof row.required === 'boolean') {
      required = row.required;
    } else {
      const requiredStr = String(row.required).toLowerCase();
      required = ['true', 'yes', '1'].includes(requiredStr);
    }

    return {
      parameter_key: String(row.parameter_key).trim(),
      parameter_label: String(row.parameter_label).trim(),
      data_type: String(row.data_type).trim().toLowerCase(),
      enum_values: row.enum_values ? String(row.enum_values).trim() : undefined,
      required,
      default_value: row.default_value ? String(row.default_value).trim() : undefined,
    };
  }

  async uploadExcel(file: Express.Multer.File) {
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(file.buffer as any);

    const expectedSheets = ['Staging', 'Pre-Live', 'Post-Live'];
    const sheetNames = workbook.worksheets.map((ws) => ws.name);

    // Validate sheets exist
    for (const expectedSheet of expectedSheets) {
      if (!sheetNames.includes(expectedSheet)) {
        throw new BadRequestException(`Missing required sheet: ${expectedSheet}`);
      }
    }

    const results: Record<string, { created: number; updated: number }> = {};
    let globalVersion = 1;

    // Get the latest version
    const latestParam = await this.prisma.qCParameter.findFirst({
      orderBy: { version: 'desc' },
    });
    if (latestParam) {
      globalVersion = latestParam.version + 1;
    }

    // Process each sheet
    for (const sheetName of expectedSheets) {
      const worksheet = workbook.getWorksheet(sheetName);
      if (!worksheet) continue;

      const phase = this.mapSheetNameToPhase(sheetName);
      let created = 0;
      let updated = 0;

      // Get header row
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        headers[colNumber] = cell.value?.toString().toLowerCase().trim() || '';
      });

      // Validate headers
      const requiredHeaders = [
        'parameter_key',
        'parameter_label',
        'data_type',
        'enum_values',
        'required',
        'default_value',
      ];
      const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
      if (missingHeaders.length > 0) {
        throw new BadRequestException(
          `Sheet "${sheetName}" missing required columns: ${missingHeaders.join(', ')}`,
        );
      }

      // Process data rows (skip header)
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        if (!row.hasValues) continue;

        // Build row object from headers
        const rowData: any = {};
        headers.forEach((header, index) => {
          const cell = row.getCell(index + 1);
          rowData[header] = cell.value;
        });

        // Skip empty rows
        if (!rowData.parameter_key) continue;

        // Validate row
        const validatedRow = this.validateRow(rowData, rowNumber);

        // Check if parameter exists
        const existing = await this.prisma.qCParameter.findFirst({
          where: {
            parameterKey: validatedRow.parameter_key,
            phase: phase,
          },
          orderBy: { version: 'desc' },
        });

        if (existing) {
          // Update existing parameter (create new version)
          await this.prisma.qCParameter.create({
            data: {
              parameterKey: validatedRow.parameter_key,
              parameterLabel: validatedRow.parameter_label,
              dataType: validatedRow.data_type,
              enumValues: validatedRow.enum_values || null,
              required: validatedRow.required,
              defaultValue: validatedRow.default_value || null,
              phase: phase,
              version: globalVersion,
            },
          });
          updated++;
        } else {
          // Create new parameter
          await this.prisma.qCParameter.create({
            data: {
              parameterKey: validatedRow.parameter_key,
              parameterLabel: validatedRow.parameter_label,
              dataType: validatedRow.data_type,
              enumValues: validatedRow.enum_values || null,
              required: validatedRow.required,
              defaultValue: validatedRow.default_value || null,
              phase: phase,
              version: globalVersion,
            },
          });
          created++;
        }
      }

      results[sheetName] = { created, updated };
    }

    return {
      version: globalVersion,
      counts: results,
      totalCreated: Object.values(results).reduce((sum, r) => sum + r.created, 0),
      totalUpdated: Object.values(results).reduce((sum, r) => sum + r.updated, 0),
    };
  }

  async getParametersByPhase(phase: QCPhase) {
    // Get latest version parameters for the phase
    const allParams = await this.prisma.qCParameter.findMany({
      where: { phase },
      orderBy: { version: 'desc' },
    });

    // Get unique parameters (latest version only)
    const latestVersion = allParams[0]?.version || 0;
    const uniqueParams = new Map<string, typeof allParams[0]>();

    for (const param of allParams) {
      if (param.version === latestVersion) {
        if (!uniqueParams.has(param.parameterKey)) {
          uniqueParams.set(param.parameterKey, param);
        }
      }
    }

    return Array.from(uniqueParams.values());
  }

  async getDefectQCValues(defectId: string) {
    return this.prisma.defectQCValue.findMany({
      where: { defectId },
      include: {
        parameter: true,
      },
    });
  }

  async saveDefectQCValues(defectId: string, values: Record<string, any>) {
    // Get all parameters for the defect's phase (we'll need to get phase from defect)
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
    });

    if (!defect) {
      throw new BadRequestException('Defect not found');
    }

    // Map status to phase
    let phase: QCPhase = QCPhase.Staging;
    if (defect.status === 'IN_PROGRESS') {
      phase = QCPhase.PreLive;
    } else if (defect.status === 'RESOLVED' || defect.status === 'CLOSED') {
      phase = QCPhase.PostLive;
    } else if (defect.status === 'OPEN' || defect.status === 'REOPENED') {
      phase = QCPhase.Staging;
    }

    const parameters = await this.getParametersByPhase(phase);

    // Upsert values
    const operations = Object.entries(values).map(([parameterKey, value]) => {
      const parameter = parameters.find((p) => p.parameterKey === parameterKey);
      if (!parameter) return null;

      return this.prisma.defectQCValue.upsert({
        where: {
          defectId_parameterId: {
            defectId,
            parameterId: parameter.id,
          },
        },
        update: {
          value: typeof value === 'string' ? value : JSON.stringify(value),
        },
        create: {
          defectId,
          parameterId: parameter.id,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        },
      });
    });

    await Promise.all(operations.filter((op) => op !== null));

    return this.getDefectQCValues(defectId);
  }
}

