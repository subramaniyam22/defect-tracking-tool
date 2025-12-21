import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import {
  ImportSourceType,
  ImportResult,
  WIS_QC_COLUMNS,
  PM_FEEDBACK_COLUMNS,
  STAGING_COLUMNS,
} from './dto/import-defects.dto';
import { TrainingDataSource } from '@prisma/client';

interface ParsedRow {
  sourceType: TrainingDataSource;
  date?: Date;
  pmcName?: string;
  locationName?: string;
  pageName?: string;
  defectType?: string;
  feedbackText: string;
  category?: string;
  subCategory?: string;
  rawData: Record<string, any>;
  usTeamMember?: string;
  inTeamMember?: string;
  pmName?: string;
  qcName?: string;
  fixedBy?: string;
  buildPhase?: string;
  reviewStage?: string;
  status?: string;
  priority?: string;
  trainingNeeded: boolean;
  scopeType?: string;
  screenshotUrl?: string;
}

// Defect category keywords for text analysis
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Photo & Image Issues': ['photo', 'image', 'picture', 'gallery', 'hero', 'stock', 'alt text', 'alt-text', 'dimensions', 'aspect', 'cropped', 'blurred', 'missing image'],
  'Copy & Content Issues': ['copy', 'text', 'content', 'lorem ipsum', 'typo', 'spelling', 'grammar', 'placeholder', 'wrong text', 'outdated'],
  'Link & URL Issues': ['link', 'url', 'href', 'redirect', 'broken link', '404', 'navigation', 'anchor', 'external link', 'internal link'],
  'Layout & Design Issues': ['layout', 'spacing', 'alignment', 'margin', 'padding', 'responsive', 'mobile', 'desktop', 'css', 'style', 'font', 'color'],
  'Form & Functionality Issues': ['form', 'submit', 'button', 'input', 'validation', 'error message', 'functionality', 'not working', 'broken'],
  'SEO & Metadata Issues': ['seo', 'meta', 'title tag', 'description', 'h1', 'heading', 'schema', 'sitemap', 'robots'],
  'Clone & Template Issues': ['clone', 'template', 'wireframe', 'not updated', 'from clone', 'old location', 'previous'],
  'Accessibility Issues': ['accessibility', 'wcag', 'aria', 'screen reader', 'keyboard', 'contrast', 'accessible'],
  'Data & Information Issues': ['wrong data', 'incorrect', 'outdated information', 'address', 'phone', 'email', 'hours', 'pricing'],
  'Performance Issues': ['slow', 'loading', 'performance', 'optimize', 'speed', 'lag'],
};

@Injectable()
export class DefectImportService {
  private readonly logger = new Logger(DefectImportService.name);

  constructor(private prisma: PrismaService) {}

  async importExcel(
    file: Express.Multer.File,
    sourceType: ImportSourceType = ImportSourceType.AUTO_DETECT,
  ): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);

    const result: ImportResult = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      warnings: [],
      patternSummary: {
        newPatterns: 0,
        updatedPatterns: 0,
        topPatterns: [],
      },
      sourceBreakdown: {},
    };

    this.logger.log(`Processing workbook with ${workbook.worksheets.length} sheets`);

    // Process each sheet
    for (const worksheet of workbook.worksheets) {
      const sheetName = worksheet.name;
      this.logger.log(`Processing sheet: "${sheetName}" with ${worksheet.rowCount} rows`);

      // Log headers for debugging
      const headers = this.getHeaders(worksheet);
      this.logger.log(`Headers found: ${headers.join(', ')}`);

      // Detect source type if auto-detect
      let detectedType: TrainingDataSource | null;
      if (sourceType === ImportSourceType.AUTO_DETECT) {
        detectedType = this.detectSourceType(worksheet, sheetName);
        this.logger.log(`Auto-detected type for "${sheetName}": ${detectedType}`);
      } else {
        detectedType = this.mapImportSourceToTraining(sourceType);
      }

      if (!detectedType) {
        result.warnings.push(`Could not detect source type for sheet: ${sheetName}. Headers: ${headers.slice(0, 5).join(', ')}...`);
        continue;
      }

      // Parse rows based on detected type
      const parsedRows = this.parseWorksheet(worksheet, detectedType);
      this.logger.log(`Parsed ${parsedRows.length} rows from "${sheetName}"`);

      // Store parsed data
      for (const row of parsedRows) {
        try {
          await this.storeTrainingData(row);
          result.successful++;
          result.sourceBreakdown[detectedType] =
            (result.sourceBreakdown[detectedType] || 0) + 1;
        } catch (error) {
          result.failed++;
          if (result.warnings.length < 10) {
            result.warnings.push(`Failed to import row: ${error.message}`);
          }
        }
        result.totalProcessed++;
      }
    }

    // Analyze patterns after import
    await this.analyzeAndUpdatePatterns();

    // Get pattern summary
    const patterns = await this.prisma.defectPattern.findMany({
      orderBy: { occurrenceCount: 'desc' },
      take: 5,
    });

    result.patternSummary.topPatterns = patterns.map((p) => ({
      name: p.patternName,
      count: p.occurrenceCount,
      category: p.commonCategories[0] || 'General',
    }));

    return result;
  }

  private detectSourceType(worksheet: ExcelJS.Worksheet, sheetName: string): TrainingDataSource | null {
    const normalizedName = sheetName.toLowerCase().trim();

    // Check sheet name first - be more flexible
    if (normalizedName.includes('wis') || normalizedName.includes('qc feedback') || normalizedName === 'wic qc feedback') {
      return TrainingDataSource.WIS_QC;
    }
    if (normalizedName.includes('pm') && normalizedName.includes('feedback')) {
      return TrainingDataSource.PM_FEEDBACK;
    }
    if (normalizedName.includes('staging') || normalizedName.includes('internal') || normalizedName.includes('review')) {
      return TrainingDataSource.STAGING;
    }

    // Check headers to detect type
    const headers = this.getHeaders(worksheet);
    const headerStr = headers.map((h) => h.toLowerCase()).join(' ');

    // WIS QC specific headers
    if (
      headerStr.includes('us team member') ||
      headerStr.includes('in team member') ||
      headerStr.includes('wis name') ||
      headerStr.includes('qc category')
    ) {
      return TrainingDataSource.WIS_QC;
    }

    // PM Feedback specific headers
    if (
      headerStr.includes('pm name') ||
      headerStr.includes('management category') ||
      headerStr.includes('timeline delay') ||
      headerStr.includes('screen shot')
    ) {
      return TrainingDataSource.PM_FEEDBACK;
    }

    // Staging specific headers - expanded detection
    if (
      headerStr.includes('build phase') ||
      headerStr.includes('review stage') ||
      headerStr.includes('resp') ||
      headerStr.includes('fixed by') ||
      headerStr.includes('item description') ||
      headerStr.includes('test date') ||
      headerStr.includes('location name') ||
      headerStr.includes('client name') ||
      headerStr.includes('qc review')
    ) {
      return TrainingDataSource.STAGING;
    }

    // If we still can't detect, try to infer from content
    return null;
  }

  private mapImportSourceToTraining(source: ImportSourceType): TrainingDataSource | null {
    const mapping: Record<ImportSourceType, TrainingDataSource | null> = {
      [ImportSourceType.WIS_QC]: TrainingDataSource.WIS_QC,
      [ImportSourceType.PM_FEEDBACK]: TrainingDataSource.PM_FEEDBACK,
      [ImportSourceType.STAGING]: TrainingDataSource.STAGING,
      [ImportSourceType.AUTO_DETECT]: null,
    };
    return mapping[source];
  }

  private getHeaders(worksheet: ExcelJS.Worksheet): string[] {
    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(cell.value?.toString() || '');
    });
    return headers;
  }

  private findColumnIndex(headers: string[], possibleNames: string[]): number {
    for (const name of possibleNames) {
      const index = headers.findIndex(
        (h) => h.toLowerCase().trim().includes(name.toLowerCase()) ||
               name.toLowerCase().includes(h.toLowerCase().trim())
      );
      if (index !== -1) return index;
    }
    // Try partial match
    for (const name of possibleNames) {
      const index = headers.findIndex((h) => {
        const hLower = h.toLowerCase().trim();
        const nLower = name.toLowerCase();
        return hLower.split(/\s+/).some(word => nLower.includes(word) && word.length > 3);
      });
      if (index !== -1) return index;
    }
    return -1;
  }

  private getCellValue(row: ExcelJS.Row, index: number): any {
    if (index === -1) return undefined;
    const cell = row.getCell(index + 1);
    const value = cell.value;
    
    // Handle rich text
    if (value && typeof value === 'object' && 'richText' in value) {
      return (value as any).richText.map((rt: any) => rt.text).join('');
    }
    
    return value;
  }

  private parseWorksheet(
    worksheet: ExcelJS.Worksheet,
    sourceType: TrainingDataSource,
  ): ParsedRow[] {
    const headers = this.getHeaders(worksheet);
    const rows: ParsedRow[] = [];

    this.logger.log(`Parsing ${sourceType} worksheet with headers: ${headers.join(', ')}`);

    // Build column index map based on source type
    let columnMapping: Record<string, string[]>;
    switch (sourceType) {
      case TrainingDataSource.WIS_QC:
        columnMapping = WIS_QC_COLUMNS;
        break;
      case TrainingDataSource.PM_FEEDBACK:
        columnMapping = PM_FEEDBACK_COLUMNS;
        break;
      case TrainingDataSource.STAGING:
        columnMapping = STAGING_COLUMNS;
        break;
    }

    const columnIndices: Record<string, number> = {};
    for (const [key, possibleNames] of Object.entries(columnMapping)) {
      columnIndices[key] = this.findColumnIndex(headers, possibleNames);
    }

    this.logger.log(`Column indices for ${sourceType}: ${JSON.stringify(columnIndices)}`);

    // Process each data row
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      if (!row.hasValues) continue;

      const rawData: Record<string, any> = {};
      headers.forEach((header, index) => {
        const value = this.getCellValue(row, index);
        if (value !== undefined && value !== null && value !== '') {
          rawData[header] = value;
        }
      });

      // Skip if row is essentially empty
      if (Object.keys(rawData).length < 2) continue;

      const parsedRow = this.parseRowByType(row, columnIndices, sourceType, rawData, headers);

      if (parsedRow) {
        // Try to find feedback text from any column if primary is empty
        if (!parsedRow.feedbackText || parsedRow.feedbackText.trim() === '') {
          parsedRow.feedbackText = this.findFeedbackText(rawData);
        }
        
        if (parsedRow.feedbackText && parsedRow.feedbackText.trim() !== '') {
          rows.push(parsedRow);
        }
      }
    }

    return rows;
  }

  private findFeedbackText(rawData: Record<string, any>): string {
    // Look for feedback in common column names
    const feedbackKeys = ['feedback', 'notes', 'description', 'item description', 'comment', 'issue', 'defect'];
    for (const key of Object.keys(rawData)) {
      if (feedbackKeys.some(fk => key.toLowerCase().includes(fk))) {
        const value = rawData[key];
        if (value && String(value).trim().length > 5) {
          return String(value);
        }
      }
    }
    // Return the longest text field
    let longest = '';
    for (const value of Object.values(rawData)) {
      const str = String(value || '');
      if (str.length > longest.length && str.length > 10) {
        longest = str;
      }
    }
    return longest;
  }

  private parseRowByType(
    row: ExcelJS.Row,
    indices: Record<string, number>,
    sourceType: TrainingDataSource,
    rawData: Record<string, any>,
    _headers: string[],
  ): ParsedRow | null {
    switch (sourceType) {
      case TrainingDataSource.WIS_QC:
        return this.parseWisQcRow(row, indices, rawData);
      case TrainingDataSource.PM_FEEDBACK:
        return this.parsePmFeedbackRow(row, indices, rawData);
      case TrainingDataSource.STAGING:
        return this.parseStagingRow(row, indices, rawData);
    }
  }

  private parseDate(value: any): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      // Try various date formats
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;
      // Try DD-MM-YYYY format
      const parts = value.split(/[-\/]/);
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (!isNaN(date.getTime())) return date;
      }
    }
    if (typeof value === 'number') {
      // Excel serial date
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + value * 86400000);
    }
    return undefined;
  }

  private parseBoolean(value: any): boolean {
    if (!value) return false;
    const strValue = String(value).toLowerCase().trim();
    return ['yes', 'true', '1', 'y'].includes(strValue);
  }

  private parseWisQcRow(
    row: ExcelJS.Row,
    indices: Record<string, number>,
    rawData: Record<string, any>,
  ): ParsedRow {
    const feedback = this.getCellValue(row, indices.feedback);
    const defectType = this.getCellValue(row, indices.defectType);

    return {
      sourceType: TrainingDataSource.WIS_QC,
      date: this.parseDate(this.getCellValue(row, indices.date)),
      pmcName: String(this.getCellValue(row, indices.clientProject) || ''),
      locationName: String(this.getCellValue(row, indices.location) || ''),
      pageName: String(this.getCellValue(row, indices.page) || ''),
      defectType: String(defectType || ''),
      feedbackText: String(feedback || ''),
      category: String(this.getCellValue(row, indices.qcCategory) || ''),
      subCategory: String(this.getCellValue(row, indices.subCategory) || ''),
      rawData,
      usTeamMember: String(this.getCellValue(row, indices.usTeamMember) || ''),
      inTeamMember: String(this.getCellValue(row, indices.inTeamMember) || ''),
      buildPhase: String(this.getCellValue(row, indices.build) || ''),
      trainingNeeded: this.parseBoolean(this.getCellValue(row, indices.trainingNeeded)),
      scopeType: String(this.getCellValue(row, indices.scope) || ''),
      qcName: String(this.getCellValue(row, indices.wisName) || ''),
    };
  }

  private parsePmFeedbackRow(
    row: ExcelJS.Row,
    indices: Record<string, number>,
    rawData: Record<string, any>,
  ): ParsedRow {
    const notes = this.getCellValue(row, indices.notes);
    const managementCategory = this.getCellValue(row, indices.managementCategory);

    return {
      sourceType: TrainingDataSource.PM_FEEDBACK,
      date: this.parseDate(this.getCellValue(row, indices.date)),
      pmcName: String(this.getCellValue(row, indices.pmc) || ''),
      locationName: String(this.getCellValue(row, indices.location) || ''),
      feedbackText: String(notes || ''),
      category: String(managementCategory || ''),
      rawData,
      pmName: String(this.getCellValue(row, indices.pmName) || ''),
      qcName: String(this.getCellValue(row, indices.qcWisName) || ''),
      screenshotUrl: String(this.getCellValue(row, indices.screenshot) || ''),
      trainingNeeded: false,
    };
  }

  private parseStagingRow(
    row: ExcelJS.Row,
    indices: Record<string, number>,
    rawData: Record<string, any>,
  ): ParsedRow {
    // Try multiple possible description columns
    let description = this.getCellValue(row, indices.description);
    if (!description) {
      // Look for description in raw data
      for (const key of Object.keys(rawData)) {
        if (key.toLowerCase().includes('description') || key.toLowerCase().includes('item')) {
          description = rawData[key];
          break;
        }
      }
    }

    const type = this.getCellValue(row, indices.type);
    
    // Try to get client name from various columns
    let clientName = this.getCellValue(row, indices.clientName);
    if (!clientName) {
      clientName = rawData['Client Name'] || rawData['client'] || rawData['Client'];
    }

    let locationName = this.getCellValue(row, indices.locationName);
    if (!locationName) {
      locationName = rawData['Location Name'] || rawData['location'] || rawData['Location'];
    }

    return {
      sourceType: TrainingDataSource.STAGING,
      date: this.parseDate(this.getCellValue(row, indices.testDate)),
      pmcName: String(clientName || ''),
      locationName: String(locationName || ''),
      pageName: String(this.getCellValue(row, indices.page) || ''),
      defectType: String(type || ''),
      feedbackText: String(description || ''),
      category: String(this.getCellValue(row, indices.reviewStage) || ''),
      rawData,
      buildPhase: String(this.getCellValue(row, indices.buildPhase) || ''),
      reviewStage: String(this.getCellValue(row, indices.reviewStage) || ''),
      status: String(this.getCellValue(row, indices.status) || ''),
      fixedBy: String(this.getCellValue(row, indices.fixedBy) || ''),
      qcName: String(this.getCellValue(row, indices.foundBy) || ''),
      screenshotUrl: String(this.getCellValue(row, indices.screenshot) || ''),
      trainingNeeded: false,
    };
  }

  private async storeTrainingData(row: ParsedRow): Promise<void> {
    // Extract keywords from feedback text
    const keywords = this.extractKeywords(row.feedbackText);
    
    // Auto-categorize if no category
    let category = row.category;
    if (!category || category.trim() === '' || category === 'undefined') {
      category = this.autoCategorize(row.feedbackText);
    }

    await this.prisma.defectTrainingData.create({
      data: {
        sourceType: row.sourceType,
        date: row.date,
        pmcName: row.pmcName || null,
        locationName: row.locationName || null,
        pageName: row.pageName || null,
        defectType: row.defectType || null,
        feedbackText: row.feedbackText,
        category: category || null,
        subCategory: row.subCategory || null,
        rawData: row.rawData,
        usTeamMember: row.usTeamMember || null,
        inTeamMember: row.inTeamMember || null,
        pmName: row.pmName || null,
        qcName: row.qcName || null,
        fixedBy: row.fixedBy || null,
        buildPhase: row.buildPhase || null,
        reviewStage: row.reviewStage || null,
        status: row.status || null,
        priority: row.priority || null,
        trainingNeeded: row.trainingNeeded,
        scopeType: row.scopeType || null,
        screenshotUrl: row.screenshotUrl || null,
        keywords,
      },
    });
  }

  private autoCategorize(text: string): string {
    if (!text) return 'Uncategorized';
    
    const textLower = text.toLowerCase();
    let bestMatch = 'Uncategorized';
    let maxScore = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const keyword of keywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          score += keyword.split(' ').length; // Multi-word matches score higher
        }
      }
      if (score > maxScore) {
        maxScore = score;
        bestMatch = category;
      }
    }

    return bestMatch;
  }

  private extractKeywords(text: string): string[] {
    if (!text) return [];

    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'this', 'that',
      'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our',
      'you', 'your', 'not', 'no', 'all', 'any', 'some', 'see', 'also', 'please',
      'make', 'sure', 'check', 'should', 'needs', 'need', 'update', 'updated',
      'page', 'site', 'website', 'location', 'client', 'there', 'here',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));

    const wordCounts: Record<string, number> = {};
    words.forEach((word) => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });

    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);
  }

  async analyzeAndUpdatePatterns(): Promise<void> {
    this.logger.log('Analyzing patterns from training data...');

    const trainingData = await this.prisma.defectTrainingData.findMany({
      where: { processedAt: null },
    });

    if (trainingData.length === 0) {
      this.logger.log('No unprocessed training data found');
      return;
    }

    // First, re-categorize uncategorized items
    for (const data of trainingData) {
      if (!data.category || data.category === 'Uncategorized' || data.category.trim() === '') {
        const newCategory = this.autoCategorize(data.feedbackText);
        if (newCategory !== 'Uncategorized') {
          await this.prisma.defectTrainingData.update({
            where: { id: data.id },
            data: { category: newCategory },
          });
          data.category = newCategory;
        }
      }
    }

    // Group by category
    const categoryGroups: Record<string, typeof trainingData> = {};
    trainingData.forEach((data) => {
      const key = data.category || 'Uncategorized';
      if (!categoryGroups[key]) {
        categoryGroups[key] = [];
      }
      categoryGroups[key].push(data);
    });

    // Create or update patterns
    for (const [category, items] of Object.entries(categoryGroups)) {
      if (items.length < 1) continue;

      const pmcs = [...new Set(items.map((i) => i.pmcName).filter((p): p is string => !!p && p.trim() !== ''))];
      const defectTypes = [...new Set(items.map((i) => i.defectType).filter((d): d is string => !!d && d.trim() !== ''))];
      const sourceTypes = [...new Set(items.map((i) => i.sourceType))];
      
      // Collect all keywords and feedback samples
      const allKeywords = items.flatMap((i) => i.keywords || []);
      const feedbackSamples = items.slice(0, 20).map((i) => i.feedbackText);

      const keywordCounts: Record<string, number> = {};
      allKeywords.forEach((kw) => {
        keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
      });
      const topKeywords = Object.entries(keywordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([word]) => word);

      // Generate context-aware insights from actual defect text
      const insights = this.generateContextualInsights(category, feedbackSamples, topKeywords, items);

      const existingPattern = await this.prisma.defectPattern.findFirst({
        where: { patternName: category },
      });

      if (existingPattern) {
        await this.prisma.defectPattern.update({
          where: { id: existingPattern.id },
          data: {
            occurrenceCount: existingPattern.occurrenceCount + items.length,
            sourceTypes: [...new Set([...existingPattern.sourceTypes, ...sourceTypes])],
            commonPMCs: [...new Set([...existingPattern.commonPMCs.filter((p): p is string => !!p), ...pmcs])].slice(0, 15),
            commonDefectTypes: [...new Set([...existingPattern.commonDefectTypes.filter((d): d is string => !!d), ...defectTypes])].slice(0, 15),
            commonKeywords: [...new Set([...existingPattern.commonKeywords, ...topKeywords])].slice(0, 25),
            rootCauses: insights.rootCauses,
            preventionTips: insights.preventionTips,
            resolutionSteps: insights.resolutionSteps,
          },
        });

        await this.prisma.defectTrainingData.updateMany({
          where: { id: { in: items.map((i) => i.id) } },
          data: { patternId: existingPattern.id, processedAt: new Date() },
        });
      } else {
        const newPattern = await this.prisma.defectPattern.create({
          data: {
            patternName: category,
            description: this.generatePatternDescription(category, items, topKeywords),
            sourceTypes,
            occurrenceCount: items.length,
            commonCategories: [category],
            commonDefectTypes: defectTypes.slice(0, 15),
            commonPMCs: pmcs.slice(0, 15),
            commonKeywords: topKeywords,
            rootCauses: insights.rootCauses,
            preventionTips: insights.preventionTips,
            resolutionSteps: insights.resolutionSteps,
          },
        });

        await this.prisma.defectTrainingData.updateMany({
          where: { id: { in: items.map((i) => i.id) } },
          data: { patternId: newPattern.id, processedAt: new Date() },
        });
      }
    }

    this.logger.log(`Processed ${trainingData.length} training records into patterns`);
  }

  private generatePatternDescription(category: string, items: any[], keywords: string[]): string {
    const sources = [...new Set(items.map(i => i.sourceType))].join(', ');
    const pmcs = [...new Set(items.map(i => i.pmcName).filter(Boolean))].slice(0, 3);
    
    let desc = `Pattern "${category}" identified from ${items.length} defects across ${sources}.`;
    if (pmcs.length > 0) {
      desc += ` Common PMCs: ${pmcs.join(', ')}.`;
    }
    if (keywords.length > 0) {
      desc += ` Key terms: ${keywords.slice(0, 5).join(', ')}.`;
    }
    return desc;
  }

  private generateContextualInsights(
    category: string,
    feedbackSamples: string[],
    _keywords: string[],
    items: any[],
  ): { rootCauses: string[]; preventionTips: string[]; resolutionSteps: string[] } {
    const insights = {
      rootCauses: [] as string[],
      preventionTips: [] as string[],
      resolutionSteps: [] as string[],
    };

    const categoryLower = category.toLowerCase();
    const allText = feedbackSamples.join(' ').toLowerCase();

    // Analyze actual content patterns
    const hasCloneIssue = allText.includes('clone') || allText.includes('template') || allText.includes('old location');
    const hasImageIssue = allText.includes('photo') || allText.includes('image') || allText.includes('hero') || allText.includes('gallery');
    const hasLinkIssue = allText.includes('link') || allText.includes('url') || allText.includes('href') || allText.includes('redirect');
    const hasCopyIssue = allText.includes('copy') || allText.includes('text') || allText.includes('lorem') || allText.includes('content');
    const hasNotUpdated = allText.includes('not updated') || allText.includes('still') || allText.includes('should be') || allText.includes('incorrect');
    const hasMissing = allText.includes('missing') || allText.includes('not found') || allText.includes('blank') || allText.includes('empty');

    // Generate specific root causes based on actual defect content
    if (hasCloneIssue) {
      insights.rootCauses.push(`Content not properly updated from clone/template source - found in ${Math.round(feedbackSamples.filter(f => f.toLowerCase().includes('clone')).length / feedbackSamples.length * 100)}% of defects`);
    }
    if (hasNotUpdated) {
      insights.rootCauses.push(`Information not updated during location setup - ${feedbackSamples.filter(f => f.toLowerCase().includes('not updated') || f.toLowerCase().includes('still')).length} instances found`);
    }
    if (hasMissing) {
      insights.rootCauses.push(`Required elements missing from implementation - common in ${category} defects`);
    }

    // Photo/Image specific
    if (categoryLower.includes('photo') || hasImageIssue) {
      const photoDefects = feedbackSamples.filter(f => f.toLowerCase().includes('photo') || f.toLowerCase().includes('image'));
      insights.rootCauses.push(`Image issues affecting ${photoDefects.length} defects - photos not matching current location or template requirements`);
      insights.preventionTips.push('Create image checklist: verify hero images, gallery photos, and alt text for each location before handoff');
      insights.preventionTips.push('Cross-reference all images against live site assets or client-provided photos');
      insights.resolutionSteps.push('Audit all image placements on affected pages using browser developer tools');
      insights.resolutionSteps.push('Replace incorrect images with approved assets and verify dimensions match template');
    }

    // Link specific
    if (categoryLower.includes('link') || hasLinkIssue) {
      insights.rootCauses.push('Links inherited from clone not updated to new location URLs');
      insights.preventionTips.push('Run automated link checker before QC handoff to catch broken/incorrect links');
      insights.preventionTips.push('Maintain URL mapping document for each location showing old vs new links');
      insights.resolutionSteps.push('Use site crawler to identify all links pointing to incorrect destinations');
      insights.resolutionSteps.push('Update href attributes and verify redirect chains are correct');
    }

    // Copy/Content specific
    if (categoryLower.includes('copy') || hasCopyIssue) {
      insights.rootCauses.push('Content not migrated or updated from source materials');
      insights.preventionTips.push('Use content diff tool to compare current copy against approved source');
      insights.preventionTips.push('Create text content checklist covering all editable areas on site');
      insights.resolutionSteps.push('Identify all text areas requiring updates using search function');
      insights.resolutionSteps.push('Update content and verify formatting matches design specifications');
    }

    // Uncategorized - analyze for common patterns
    if (categoryLower === 'uncategorized') {
      // Analyze the actual feedback to find patterns
      const commonPhrases = this.findCommonPhrases(feedbackSamples);
      insights.rootCauses.push(`Varied defects requiring individual review - ${items.length} items with diverse issues`);
      if (commonPhrases.length > 0) {
        insights.rootCauses.push(`Common themes detected: ${commonPhrases.slice(0, 3).join(', ')}`);
      }
      insights.preventionTips.push('Review uncategorized defects to identify new pattern categories');
      insights.preventionTips.push('Enhance categorization keywords based on these defect descriptions');
    }

    // Add sample-based insights
    const sampleCount = Math.min(3, feedbackSamples.length);
    if (sampleCount > 0 && insights.resolutionSteps.length < 2) {
      insights.resolutionSteps.push(`Review ${sampleCount} sample defects for this pattern to understand scope`);
    }

    // Ensure minimum insights
    if (insights.rootCauses.length === 0) {
      insights.rootCauses.push(`${items.length} defects identified in "${category}" - requires process review`);
      insights.rootCauses.push('Inconsistent implementation standards across team members');
    }
    if (insights.preventionTips.length === 0) {
      insights.preventionTips.push(`Add "${category}" to QC checklist with specific validation criteria`);
      insights.preventionTips.push('Implement peer review checkpoint for this defect category');
    }
    if (insights.resolutionSteps.length === 0) {
      insights.resolutionSteps.push('Document defect with screenshots showing current vs expected state');
      insights.resolutionSteps.push('Apply fix and verify across all affected pages/locations');
    }

    return insights;
  }

  private findCommonPhrases(texts: string[]): string[] {
    const phraseCounts: Record<string, number> = {};
    const commonPhrases = ['not updated', 'should be', 'incorrect', 'missing', 'wrong', 'need to', 'please update', 'from clone', 'still showing'];
    
    for (const text of texts) {
      const textLower = text.toLowerCase();
      for (const phrase of commonPhrases) {
        if (textLower.includes(phrase)) {
          phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
        }
      }
    }

    return Object.entries(phraseCounts)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([phrase]) => phrase);
  }

  async getTrainingDataStats() {
    const totalCount = await this.prisma.defectTrainingData.count();
    const bySource = await this.prisma.defectTrainingData.groupBy({
      by: ['sourceType'],
      _count: true,
    });
    const byCategory = await this.prisma.defectTrainingData.groupBy({
      by: ['category'],
      _count: true,
      orderBy: { _count: { category: 'desc' } },
      take: 15,
    });
    const patterns = await this.prisma.defectPattern.findMany({
      orderBy: { occurrenceCount: 'desc' },
      take: 15,
      include: {
        trainingData: {
          take: 5,
          select: {
            feedbackText: true,
            pmcName: true,
            sourceType: true,
          },
        },
      },
    });

    return {
      totalRecords: totalCount,
      bySource: bySource.reduce(
        (acc, item) => ({ ...acc, [item.sourceType]: item._count }),
        {} as Record<string, number>,
      ),
      topCategories: byCategory.map((c) => ({
        category: c.category || 'Uncategorized',
        count: c._count,
      })),
      patterns: patterns.map((p) => ({
        id: p.id,
        name: p.patternName,
        occurrences: p.occurrenceCount,
        sourceTypes: p.sourceTypes,
        rootCauses: p.rootCauses,
        preventionTips: p.preventionTips,
        resolutionSteps: p.resolutionSteps,
        sampleDefects: p.trainingData.slice(0, 3).map(d => ({
          text: d.feedbackText.substring(0, 150) + (d.feedbackText.length > 150 ? '...' : ''),
          pmc: d.pmcName,
          source: d.sourceType,
        })),
      })),
    };
  }

  async getPatternInsights(patternId: string) {
    return this.prisma.defectPattern.findUnique({
      where: { id: patternId },
      include: {
        trainingData: {
          take: 20,
          orderBy: { date: 'desc' },
        },
      },
    });
  }

  async clearAllTrainingData(): Promise<{ deleted: { trainingData: number; patterns: number } }> {
    const trainingDataCount = await this.prisma.defectTrainingData.count();
    const patternsCount = await this.prisma.defectPattern.count();

    // Delete in correct order due to foreign key constraints
    await this.prisma.defectTrainingData.deleteMany({});
    await this.prisma.defectPattern.deleteMany({});

    this.logger.log(`Cleared ${trainingDataCount} training records and ${patternsCount} patterns`);

    return {
      deleted: {
        trainingData: trainingDataCount,
        patterns: patternsCount,
      },
    };
  }

  async getSuggestionsFromPatterns(_userId?: string): Promise<string[]> {
    const patterns = await this.prisma.defectPattern.findMany({
      where: { isActive: true },
      orderBy: { occurrenceCount: 'desc' },
      take: 10,
      include: {
        trainingData: {
          take: 3,
          select: { feedbackText: true, pmcName: true },
        },
      },
    });

    const suggestions: string[] = [];

    // Top pattern insights with specific examples
    for (const pattern of patterns.slice(0, 5)) {
      if (pattern.preventionTips.length > 0) {
        const example = pattern.trainingData[0];
        let suggestion = `📊 [${pattern.patternName}] ${pattern.preventionTips[0]}`;
        suggestion += ` (${pattern.occurrenceCount} occurrences`;
        if (example?.pmcName) {
          suggestion += `, e.g., at ${example.pmcName}`;
        }
        suggestion += ')';
        suggestions.push(suggestion);
      }
    }

    // Source-specific suggestions
    const sourceStats = await this.prisma.defectTrainingData.groupBy({
      by: ['sourceType'],
      _count: true,
      orderBy: { _count: { sourceType: 'desc' } },
    });

    const totalDefects = sourceStats.reduce((sum, s) => sum + s._count, 0);
    for (const stat of sourceStats) {
      const percentage = Math.round((stat._count / totalDefects) * 100);
      if (percentage > 30) {
        suggestions.push(
          `⚠️ ${percentage}% of defects come from ${stat.sourceType.replace('_', ' ')} - focus quality efforts on this phase`
        );
      }
    }

    // Training needs
    const trainingNeededCount = await this.prisma.defectTrainingData.count({
      where: { trainingNeeded: true },
    });

    if (trainingNeededCount > 3) {
      suggestions.push(
        `📚 ${trainingNeededCount} defects marked as requiring training - schedule focused sessions on recurring issues`
      );
    }

    // Recent trend analysis
    const recentDefects = await this.prisma.defectTrainingData.groupBy({
      by: ['category'],
      where: {
        date: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        category: { not: null },
      },
      _count: true,
      orderBy: { _count: { category: 'desc' } },
      take: 3,
    });

    if (recentDefects.length > 0 && recentDefects[0]._count >= 3) {
      suggestions.push(
        `🔥 "${recentDefects[0].category}" is trending with ${recentDefects[0]._count} defects in the last 2 weeks`
      );
    }

    return suggestions;
  }
}
