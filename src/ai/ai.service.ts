import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface SummarizeResult {
  summary: string;
  entities: {
    product?: string;
    quantity?: string;
    price?: string;
    terms?: string;
    port?: string;
    [key: string]: string | undefined;
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
    this.model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
  }

  /**
   * Tóm tắt một đoạn hội thoại dài thành bản tóm tắt ngắn gọn
   * và trích xuất các thông tin quan trọng (entities).
   */
  async summarizeConversation(
    transcript: string,
    sourceName?: string,
  ): Promise<SummarizeResult> {
    const systemPrompt = `You are a professional AI assistant for an Summarize. Your task is to read the conversation and:

1. **Summarize** the main content concisely, clearly, and professionally. If there are multiple topics, list each as a bullet point.
2. **Extract** transaction details if present (product, quantity, price, delivery terms, port, etc.).

Rules:
- NEVER reveal phone numbers, emails, or company/personal names of the senders in the summary.
- Only return information explicitly mentioned — do not invent or infer.
- **Language rule:** Detect the dominant language of the conversation and respond in that SAME language.

Return the result as JSON:
{
  "summary": "Concise summary...",
  "entities": {
    "product": "Product type if mentioned",
    "quantity": "Quantity if mentioned",
    "price": "Price if mentioned",
    "terms": "Trading terms if mentioned (FOB, CIF...)",
    "port": "Delivery port if mentioned"
  }
}

If no transaction information is present, return an empty object for entities: {}.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Source: ${sourceName || 'Unknown'}\n\nConversation:\n${transcript}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('AI returned empty response');
      }

      const parsed = JSON.parse(content) as SummarizeResult;
      this.logger.log(`AI summarized successfully (model: ${this.model})`);
      return parsed;
    } catch (error) {
      this.logger.error(`AI summarization failed: ${error}`);

      // Fallback: return placeholder if AI fails
      return {
        summary: `[AI Error] Unable to summarize. The conversation has ${transcript.split('\n').length} lines.`,
        entities: {},
      };
    }
  }
}
