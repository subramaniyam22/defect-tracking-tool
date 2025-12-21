import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AIProvider, AIRecommendation, DefectContext } from '../interfaces/ai-provider.interface';

@Injectable()
export class LocalLLMProvider implements AIProvider {
  private baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL') || 'http://localhost:11434';
  }

  async getRecommendations(context: DefectContext): Promise<AIRecommendation> {
    const model = this.configService.get<string>('OLLAMA_MODEL') || 'llama2';

    const prompt = this.buildPrompt(context);

    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        },
      });

      const content = response.data.response;
      if (!content) {
        throw new Error('No response from Ollama');
      }

      // Parse JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const result = JSON.parse(jsonStr);

      return this.validateAndFormat(result);
    } catch (error: any) {
      // Return fallback recommendations when AI service is unavailable
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return this.getFallbackRecommendations(context);
      }
      // For other errors, also return fallback
      console.error('AI provider error:', error.message);
      return this.getFallbackRecommendations(context);
    }
  }

  private buildPrompt(context: DefectContext): string {
    let prompt = `Analyze the following defect and provide recommendations in JSON format:

Title: ${context.title}
Description: ${context.description}
Status: ${context.status}
Priority: ${context.priority}`;

    if (context.project) {
      prompt += `\nProject: ${context.project}`;
    }

    if (context.comments && context.comments.length > 0) {
      prompt += `\n\nComments:`;
      context.comments.forEach((comment, idx) => {
        prompt += `\n${idx + 1}. [${comment.user}] ${comment.content}`;
      });
    }

    if (context.qcValues && Object.keys(context.qcValues).length > 0) {
      prompt += `\n\nQC Parameters:`;
      Object.entries(context.qcValues).forEach(([key, value]) => {
        prompt += `\n- ${key}: ${value}`;
      });
    }

    prompt += `\n\nProvide a JSON response with the following structure:
{
  "root_cause_hypotheses": ["hypothesis1", "hypothesis2", ...],
  "remediation_steps": ["step1", "step2", ...],
  "prevention_checklist": ["item1", "item2", ...],
  "confidence": 85
}

root_cause_hypotheses: Array of 3-5 potential root causes
remediation_steps: Array of 5-8 actionable steps to fix the issue
prevention_checklist: Array of 5-8 items to prevent similar issues
confidence: Number between 0-100 indicating confidence in the analysis

Respond only with valid JSON, no additional text.`;

    return prompt;
  }

  private validateAndFormat(data: any): AIRecommendation {
    return {
      root_cause_hypotheses: Array.isArray(data.root_cause_hypotheses)
        ? data.root_cause_hypotheses
        : [],
      remediation_steps: Array.isArray(data.remediation_steps)
        ? data.remediation_steps
        : [],
      prevention_checklist: Array.isArray(data.prevention_checklist)
        ? data.prevention_checklist
        : [],
      confidence: typeof data.confidence === 'number'
        ? Math.max(0, Math.min(100, data.confidence))
        : 50,
    };
  }

  private getFallbackRecommendations(context: DefectContext): AIRecommendation {
    // Provide generic recommendations based on priority
    // Priority label available for future use in recommendations
    // const priorityMap: Record<number, string> = {
    //   1: 'Critical',
    //   2: 'High',
    //   3: 'Medium',
    //   4: 'Low',
    // };
    // const priorityLabel = priorityMap[context.priority] || 'Medium';

    return {
      root_cause_hypotheses: [
        `Review the ${context.title} implementation for potential issues`,
        'Check recent code changes that may have introduced this defect',
        'Verify configuration settings related to this functionality',
      ],
      remediation_steps: [
        `Investigate the reported issue: "${context.description}"`,
        'Reproduce the defect in a test environment',
        'Review related code and documentation',
        'Implement and test the fix',
        'Request peer review before deployment',
      ],
      prevention_checklist: [
        'Add unit tests covering this scenario',
        'Update documentation if needed',
        'Consider adding automated regression tests',
        'Review similar components for the same issue',
      ],
      confidence: 30,
      note: 'AI service unavailable - showing generic recommendations. Configure Ollama or Azure OpenAI for intelligent analysis.',
    };
  }
}

