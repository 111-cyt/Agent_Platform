import axios from 'axios';
import https from 'https';

export class QwenService {
  private apiKey: string;
  private baseURL: string = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
  private timeoutMs: number;
  private maxRetries: number;
  private httpsAgent: https.Agent;

  constructor() {
    this.apiKey = process.env.QWEN_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('QWEN_API_KEY is not set in environment variables');
    }
    this.timeoutMs = Number(process.env.QWEN_TIMEOUT_MS || 45000);
    this.maxRetries = Number(process.env.QWEN_MAX_RETRIES || 2);
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 10
    });
  }

  private isRetryable(error: any): boolean {
    const msg = String(error?.message || '').toLowerCase();
    return (
      msg.includes('client network socket disconnected') ||
      msg.includes('before secure tls connection was established') ||
      msg.includes('etimedout') ||
      msg.includes('econnreset') ||
      msg.includes('socket hang up') ||
      msg.includes('timeout')
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async chat(messages: Array<{ role: string; content: string }>, model: string = 'qwen-turbo'): Promise<string> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          this.baseURL,
          {
            model: model,
            input: {
              messages: messages
            },
            parameters: {
              result_format: 'message'
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: this.timeoutMs,
            httpsAgent: this.httpsAgent
          }
        );

        if (response.data.output && response.data.output.choices && response.data.output.choices.length > 0) {
          return response.data.output.choices[0].message.content;
        }

        throw new Error('Invalid response from Qwen API');
      } catch (error: any) {
        lastError = error;
        const canRetry = attempt < this.maxRetries && this.isRetryable(error);
        console.error(`Qwen API error (attempt ${attempt + 1}/${this.maxRetries + 1}):`, error.response?.data || error.message);
        if (!canRetry) break;
        await this.delay(500 * Math.pow(2, attempt));
      }
    }

    throw new Error(`Qwen API call failed: ${lastError?.response?.data?.message || lastError?.message || 'Unknown error'}`);
  }

  async generateText(prompt: string, systemPrompt?: string, model: string = 'qwen-turbo'): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    return this.chat(messages, model);
  }
}
