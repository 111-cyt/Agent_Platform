import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { DatabaseService } from './database.service';
import { KnowledgeService, SearchResult } from './knowledge.service';

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: SearchResult[];
  created_at?: string;
}

export interface ChatSession {
  id: string;
  workflow_id?: string;
  created_at?: string;
}

export class AgentService {
  private db: DatabaseService;
  private knowledgeService: KnowledgeService;
  private llmApiUrl: string;
  private llmApiKey: string;
  private llmModel: string;

  constructor() {
    this.db = DatabaseService.getInstance();
    this.knowledgeService = new KnowledgeService();
    this.llmApiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
    this.llmApiKey = process.env.LLM_API_KEY || '';
    this.llmModel = process.env.LLM_MODEL || 'gpt-3.5-turbo';
  }

  // Create a new chat session
  async createSession(workflowId?: string): Promise<ChatSession> {
    const id = uuidv4();
    const sql = `INSERT INTO chat_sessions (id, workflow_id) VALUES (?, ?)`;
    await this.db.execute(sql, [id, workflowId || null]);

    return {
      id,
      workflow_id: workflowId
    };
  }

  // Get session by ID
  async getSession(id: string): Promise<ChatSession> {
    const sql = `SELECT * FROM chat_sessions WHERE id = ?`;
    const rows = await this.db.query(sql, [id]);
    const row = rows?.[0];

    if (!row) {
      throw new Error('Session not found');
    }

    return {
      id: row.id,
      workflow_id: row.workflow_id,
      created_at: row.created_at
    };
  }

  // Get session history
  async getSessionHistory(sessionId: string): Promise<ChatMessage[]> {
    const sql = `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC`;
    const rows = await this.db.query(sql, [sessionId]);

    return (rows as any[]).map((row: any) => ({
      id: row.id,
      session_id: row.session_id,
      role: row.role,
      content: row.content,
      sources: row.sources
        ? (typeof row.sources === 'string' ? JSON.parse(row.sources) : row.sources)
        : undefined,
      created_at: row.created_at
    }));
  }

  // Save message
  async saveMessage(message: Omit<ChatMessage, 'id' | 'created_at'>): Promise<ChatMessage> {
    const id = uuidv4();
    const sql = `INSERT INTO chat_messages (id, session_id, role, content, sources) VALUES (?, ?, ?, ?, ?)`;

    await this.db.execute(sql, [
      id,
      message.session_id,
      message.role,
      message.content,
      message.sources ? JSON.stringify(message.sources) : null
    ]);

    const rows = await this.db.query(`SELECT * FROM chat_messages WHERE id = ?`, [id]);
    const row = rows?.[0];
    if (!row) {
      throw new Error('Failed to load saved message');
    }
    return {
      id: row.id,
      session_id: row.session_id,
      role: row.role,
      content: row.content,
      sources: row.sources
        ? (typeof row.sources === 'string' ? JSON.parse(row.sources) : row.sources)
        : undefined,
      created_at: row.created_at
    };
  }

  // Chat with RAG
  async chat(sessionId: string, userMessage: string, useRAG: boolean = true): Promise<ChatMessage> {
    // Save user message
    await this.saveMessage({
      session_id: sessionId,
      role: 'user',
      content: userMessage
    });

    // Get session history
    const history = await this.getSessionHistory(sessionId);

    // Search knowledge base if RAG is enabled
    let ragContext = '';
    let sources: SearchResult[] = [];

    if (useRAG) {
      sources = await this.knowledgeService.search(userMessage, 3);
      ragContext = this.knowledgeService.buildRAGContext(sources);
    }

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(ragContext);

    // Prepare messages for LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    // Call LLM
    const assistantResponse = await this.callLLM(messages);

    // Save assistant message
    const assistantMessage = await this.saveMessage({
      session_id: sessionId,
      role: 'assistant',
      content: assistantResponse,
      sources: sources.length > 0 ? sources : undefined
    });

    return assistantMessage;
  }

  // Build system prompt
  private buildSystemPrompt(ragContext: string): string {
    let prompt = `你是一个智能助手，负责回答用户的问题。请遵循以下规则：
1. 提供准确、有帮助的回答
2. 如果不确定答案，请诚实地说明
3. 保持友好和专业的语气`;

    if (ragContext) {
      prompt += `\n\n你可以参考以下知识库内容来回答问题：\n\n${ragContext}\n\n请基于上述知识库内容回答用户的问题。如果知识库中没有相关信息，请说明这一点。`;
    }

    return prompt;
  }

  // Call LLM API
  private async callLLM(messages: any[]): Promise<string> {
    try {
      const response = await axios.post(
        this.llmApiUrl,
        {
          model: this.llmModel,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.llmApiKey}`
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('LLM API error:', error.response?.data || error.message);
      throw new Error('Failed to get response from LLM');
    }
  }

  // Get all sessions
  async getAllSessions(): Promise<ChatSession[]> {
    const sql = `SELECT * FROM chat_sessions ORDER BY created_at DESC`;
    const rows = await this.db.query(sql);

    return (rows as any[]).map((row: any) => ({
      id: row.id,
      workflow_id: row.workflow_id,
      created_at: row.created_at
    }));
  }

  // Delete session
  async deleteSession(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM chat_messages WHERE session_id = ?`, [id]);
    await this.db.execute(`DELETE FROM chat_sessions WHERE id = ?`, [id]);
  }
}
