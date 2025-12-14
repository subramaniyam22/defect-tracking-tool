import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AzureOpenAI } from 'openai';
import { AIProvider, AIRecommendation, DefectContext } from '../interfaces/ai-provider.interface';

@Injectable()
export class AzureOpenAIProvider implements AIProvider {
  private client: AzureOpenAI | null = null;
  private deploymentName: string | null = null;

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>('AZURE_OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('AZURE_OPENAI_API_KEY');
    const deploymentName = this.configService.get<string>('AZURE_OPENAI_DEPLOYMENT_NAME');

    if (endpoint && apiKey && deploymentName) {
      this.client = new AzureOpenAI({
        endpoint,
        apiKey,
        apiVersion: '2024-02-15-preview',
      });
      this.deploymentName = deploymentName;
    }
  }

  async getRecommendations(context: DefectContext): Promise<AIRecommendation> {
    if (!this.client || !this.deploymentName) {
      throw new Error('Azure OpenAI not configured. Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT_NAME');
    }

    const prompt = this.buildPrompt(context);

    try {
      const response = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          {
            role: 'system',
            content: 'You are an expert software quality assurance analyst. Analyze defect information and provide structured recommendations in JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from Azure OpenAI');
      }

      // Parse JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const result = JSON.parse(jsonStr);

      return this.validateAndFormat(result);
    } catch (error: any) {
      throw new Error(`Azure OpenAI error: ${error.message}`);
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
confidence: Number between 0-100 indicating confidence in the analysis`;

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
}

