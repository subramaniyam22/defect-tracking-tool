import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { AzureOpenAIProvider } from './providers/azure-openai.provider';
import { LocalLLMProvider } from './providers/local-llm.provider';
import { AISuggestionsService } from './ai-suggestions.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AIController],
  providers: [AIService, AzureOpenAIProvider, LocalLLMProvider, AISuggestionsService],
  exports: [AIService, AISuggestionsService],
})
export class AIModule {}

