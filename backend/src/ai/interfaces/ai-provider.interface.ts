export interface AIRecommendation {
  root_cause_hypotheses: string[];
  remediation_steps: string[];
  prevention_checklist: string[];
  confidence: number; // 0-100
  note?: string; // Optional note (e.g., when AI service is unavailable)
}

export interface DefectContext {
  title: string;
  description: string;
  status: string;
  priority: number;
  project?: string;
  comments?: Array<{ content: string; user: string; createdAt: string }>;
  attachments?: Array<{ filename: string }>;
  qcValues?: Record<string, any>;
}

export interface AIProvider {
  getRecommendations(context: DefectContext): Promise<AIRecommendation>;
}

