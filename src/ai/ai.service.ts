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
    const systemPrompt = `Bạn là trợ lý AI chuyên nghiệp cho một Oil Broker. Nhiệm vụ của bạn là đọc đoạn hội thoại và:

1. **Tóm tắt** nội dung chính một cách ngắn gọn, rõ ràng, chuyên nghiệp. Nếu có nhiều chủ đề, liệt kê từng mục bằng gạch đầu dòng.
2. **Trích xuất** các thông tin giao dịch nếu có (sản phẩm, số lượng, giá cả, điều kiện giao hàng, cảng...).

Quy tắc:
- TUYỆT ĐỐI không để lộ số điện thoại, email, hay tên công ty/cá nhân của người gửi trong bản tóm tắt.
- Chỉ trả về thông tin đã được nhắc đến, không bịa thêm.
- Trả lời bằng tiếng Việt hoặc tiếng Anh tùy theo ngôn ngữ chủ đạo của đoạn chat.

Trả về kết quả dưới dạng JSON:
{
  "summary": "Bản tóm tắt ngắn gọn...",
  "entities": {
    "product": "Loại sản phẩm nếu có",
    "quantity": "Số lượng nếu có",
    "price": "Giá cả nếu có",
    "terms": "Điều kiện giao dịch nếu có (FOB, CIF...)",
    "port": "Cảng giao hàng nếu có"
  }
}

Nếu không có thông tin giao dịch, entities trả về object rỗng {}.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Nguồn: ${sourceName || 'Unknown'}\n\nĐoạn hội thoại:\n${transcript}`,
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

      // Fallback: Trả về placeholder nếu AI lỗi
      return {
        summary: `[AI Error] Không thể tóm tắt. Đoạn chat gồm ${transcript.split('\n').length} dòng.`,
        entities: {},
      };
    }
  }
}
