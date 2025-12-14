import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AIProvider, DefectContext } from './interfaces/ai-provider.interface';
import { AzureOpenAIProvider } from './providers/azure-openai.provider';
import { LocalLLMProvider } from './providers/local-llm.provider';

@Injectable()
export class AIService {
  private provider: AIProvider;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private azureOpenAIProvider: AzureOpenAIProvider,
    private localLLMProvider: LocalLLMProvider,
  ) {
    // Determine which provider to use based on configuration
    const aiProvider = this.configService.get<string>('AI_PROVIDER', 'ollama').toLowerCase();
    
    if (aiProvider === 'azure' || aiProvider === 'azure-openai') {
      this.provider = this.azureOpenAIProvider;
    } else {
      this.provider = this.localLLMProvider;
    }
  }

  async getRecommendations(defectId: string): Promise<any> {
    // Fetch defect with all related data
    const defect = await this.prisma.defect.findUnique({
      where: { id: defectId },
      include: {
        pmc: {
          select: {
            name: true,
          },
        },
        comments: {
          include: {
            user: {
              select: {
                username: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        attachments: {
          select: {
            filename: true,
          },
        },
        qcValues: {
          include: {
            parameter: {
              select: {
                parameterKey: true,
                parameterLabel: true,
              },
            },
          },
        },
      },
    });

    if (!defect) {
      throw new BadRequestException(`Defect with ID ${defectId} not found`);
    }

    // Build context
    const context: DefectContext = {
      title: defect.title,
      description: defect.description,
      status: defect.status,
      priority: defect.priority,
      project: defect.pmcName || defect.pmc?.name || 'Unknown PMC',
      comments: defect.comments.map((c) => ({
        content: c.content,
        user: c.user.username,
        createdAt: c.createdAt.toISOString(),
      })),
      attachments: defect.attachments.map((a) => ({
        filename: a.filename,
      })),
      qcValues: defect.qcValues.reduce((acc, qv) => {
        acc[qv.parameter.parameterKey] = qv.value;
        return acc;
      }, {} as Record<string, any>),
    };

    // Get recommendations from provider
    return await this.provider.getRecommendations(context);
  }
}

