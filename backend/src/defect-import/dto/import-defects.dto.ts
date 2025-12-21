import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ImportSourceType {
  WIS_QC = 'WIS_QC',
  PM_FEEDBACK = 'PM_FEEDBACK',
  STAGING = 'STAGING',
  AUTO_DETECT = 'AUTO_DETECT',
}

export class ImportDefectsDto {
  @IsEnum(ImportSourceType)
  @IsOptional()
  sourceType?: ImportSourceType = ImportSourceType.AUTO_DETECT;

  @IsString()
  @IsOptional()
  sheetName?: string;
}

export interface ImportResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  warnings: string[];
  patternSummary: {
    newPatterns: number;
    updatedPatterns: number;
    topPatterns: Array<{
      name: string;
      count: number;
      category: string;
    }>;
  };
  sourceBreakdown: Record<string, number>;
}

// Column mappings for each source type
export const WIS_QC_COLUMNS = {
  date: ['date'],
  usTeamMember: ['us team member', 'us_team_member', 'us member'],
  inTeamMember: ['in team member', 'in_team_member', 'in member'],
  build: ['build'],
  subCategory: ['sub category', 'subcategory', 'sub_category'],
  clientProject: ['client/project', 'client_project', 'client', 'project'],
  location: ['location'],
  page: ['page'],
  defectType: ['defect', 'defect type', 'defect_type'],
  feedback: ['feedback', 'feedbacks'],
  trainingNeeded: ['training needed', 'training_needed'],
  indiaNotes: ['india notes', 'india_notes'],
  qcCategory: ['qc category (india)', 'qc_category', 'qc category'],
  scope: ['scope'],
  wisName: ['wis name for qc erros', 'wis_name', 'wis name'],
};

export const PM_FEEDBACK_COLUMNS = {
  date: ['date'],
  pmName: ['pm name', 'pm_name', 'pm'],
  qcWisName: ['qc/wis name', 'qc_wis_name', 'qc name', 'wis name'],
  pmc: ['pmc'],
  location: ['location'],
  notes: ['notes'],
  screenshot: ['screen shot', 'screenshot', 'screen_shot'],
  timelineDelay: ['project timeline delay details (if applicable)', 'timeline_delay', 'delay details'],
  managementCategory: ['management category', 'management_category'],
};

export const STAGING_COLUMNS = {
  testDate: ['test date', 'test_date', 'date', 'test'],
  buildPhase: ['build phase', 'build_phase', 'phase', 'build'],
  reviewStage: ['review stage found', 'review_stage', 'review stage', 'stage found', 'review'],
  page: ['page (name)', 'page_name', 'page', 'page name'],
  status: ['status (11/11 open)', 'status', 'open'],
  type: ['type', 'defect type', 'issue type'],
  respForFix: ['resp. for fix', 'resp_for_fix', 'responsible', 'resp for fix', 'responsibility'],
  fixedBy: ['fixed by', 'fixed_by', 'fixed'],
  description: ['item description', 'item_description', 'description', 'item', 'issue', 'defect', 'notes'],
  screenshot: ['screenshot (optional)', 'screenshot', 'screen shot', 'ss', 'image'],
  foundBy: ['found by', 'found_by', 'found', 'identified by', 'reporter'],
  additionalNotes: ['additional notes or link to ticket', 'additional_notes', 'notes', 'additional', 'link to ticket'],
  qcReview: ['qc review', 'qc_review', 'review', 'qc'],
  locationId: ['location id', 'location_id', 'loc id'],
  history: ['history', 'change history'],
  clientName: ['client name', 'client_name', 'client', 'pmc', 'property'],
  locationName: ['location name', 'location_name', 'location', 'property name', 'site'],
  locationLink: ['location link', 'location_link', 'link', 'url', 'site link'],
};

