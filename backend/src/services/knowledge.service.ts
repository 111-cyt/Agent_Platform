import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './database.service';

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  file_name?: string;
  chunks: number;
  created_at?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  chunk: string;
  score: number;
}

export class KnowledgeService {
  private db: DatabaseService;
  private readonly CHUNK_SIZE = 500; // characters per chunk
  private readonly CHUNK_OVERLAP = 50; // overlap between chunks
  private readonly ENABLE_VECTOR_SEARCH = (process.env.ENABLE_VECTOR_SEARCH || 'true').toLowerCase() === 'true';

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  // Add knowledge item
  async addKnowledge(title: string, content: string, fileName?: string): Promise<KnowledgeItem> {
    const id = uuidv4();
    const chunks = this.chunkText(content);

    const sql = `INSERT INTO knowledge_base (id, title, content, file_name, chunks) VALUES (?, ?, ?, ?, ?)`;
    await this.db.execute(sql, [
      id,
      title,
      content,
      fileName || null,
      chunks.length
    ]);

    this.rebuildVectorIndex().catch((error) => {
      console.warn('Background vector reindex skipped after addKnowledge:', error);
    });

    return this.getKnowledge(id);
  }

  // Get knowledge by ID
  async getKnowledge(id: string): Promise<KnowledgeItem> {
    const sql = `SELECT * FROM knowledge_base WHERE id = ?`;
    const rows = await this.db.query(sql, [id]);

    if (!rows || rows.length === 0) {
      throw new Error('Knowledge item not found');
    }

    const row = rows[0];
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      file_name: row.file_name,
      chunks: row.chunks,
      created_at: row.created_at
    };
  }

  // Get all knowledge items
  async getAllKnowledge(): Promise<KnowledgeItem[]> {
    const sql = `SELECT * FROM knowledge_base ORDER BY created_at DESC`;
    const rows = await this.db.query(sql);

    return rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      file_name: row.file_name,
      chunks: row.chunks,
      created_at: row.created_at
    }));
  }

  // Delete knowledge
  async deleteKnowledge(id: string): Promise<void> {
    const sql = `DELETE FROM knowledge_base WHERE id = ?`;
    await this.db.execute(sql, [id]);
    this.rebuildVectorIndex().catch((error) => {
      console.warn('Background vector reindex skipped after deleteKnowledge:', error);
    });
  }

  // Search knowledge using vector search first, fallback to keyword matching
  async search(query: string, topK: number = 5, knowledgeBaseId?: string): Promise<SearchResult[]> {
    if (!query || !query.trim()) {
      return [];
    }

    const keywordResults = await this.searchByKeyword(query, topK, knowledgeBaseId);
    if (!this.ENABLE_VECTOR_SEARCH || keywordResults.length >= Math.min(topK, 1)) {
      return keywordResults.slice(0, topK);
    }

    try {
      const semanticResults = await this.searchByCosine(query, topK, knowledgeBaseId);
      if (semanticResults.length > 0) {
        const merged = [...keywordResults];
        const seen = new Set(merged.map(r => `${r.id}::${r.chunk}`));
        for (const item of semanticResults) {
          const key = `${item.id}::${item.chunk}`;
          if (!seen.has(key)) {
            merged.push(item);
            seen.add(key);
          }
          if (merged.length >= topK) break;
        }
        return merged.slice(0, topK);
      }
    } catch (error) {
      console.warn('Cosine search failed, fallback to keyword search:', error);
    }

    return keywordResults.slice(0, topK);
  }

  private async searchByKeyword(query: string, topK: number = 5, knowledgeBaseId?: string): Promise<SearchResult[]> {
    let allKnowledge = await this.getAllKnowledge();

    // Filter by knowledge base ID if provided
    if (knowledgeBaseId) {
      allKnowledge = allKnowledge.filter(item => item.id === knowledgeBaseId);
    }

    const results: SearchResult[] = [];

    // Simple keyword-based search with scoring
    for (const item of allKnowledge) {
      const chunks = this.chunkText(item.content);
      for (const chunk of chunks) {
        const score = this.calculateRelevanceScore(query, chunk);
        if (score > 0) {
          results.push({
            id: item.id,
            title: item.title,
            chunk,
            score
          });
        }
      }
    }

    // Sort by score and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private async searchByCosine(query: string, topK: number = 5, knowledgeBaseId?: string): Promise<SearchResult[]> {
    let allKnowledge = await this.getAllKnowledge();

    if (knowledgeBaseId) {
      allKnowledge = allKnowledge.filter(item => item.id === knowledgeBaseId);
    }

    const queryVector = this.buildTfVector(query);
    const results: SearchResult[] = [];

    for (const item of allKnowledge) {
      const chunks = this.chunkText(item.content);
      for (const chunk of chunks) {
        const chunkVector = this.buildTfVector(chunk);
        const score = this.cosineSimilarity(queryVector, chunkVector);
        if (score > 0) {
          results.push({
            id: item.id,
            title: item.title,
            chunk,
            score
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async rebuildVectorIndex(): Promise<void> {
    return Promise.resolve();
  }

  private tokenizeForCosine(text: string): string[] {
    const normalized = (text || '').toLowerCase();
    const words = normalized.match(/[a-z0-9]+/g) || [];
    const chineseChars = normalized.match(/[\u4e00-\u9fa5]/g) || [];
    return [...words, ...chineseChars];
  }

  private buildTfVector(text: string): Map<string, number> {
    const tokens = this.tokenizeForCosine(text);
    const vector = new Map<string, number>();

    for (const token of tokens) {
      vector.set(token, (vector.get(token) || 0) + 1);
    }

    return vector;
  }

  private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    if (a.size === 0 || b.size === 0) {
      return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const value of a.values()) {
      normA += value * value;
    }

    for (const value of b.values()) {
      normB += value * value;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
    for (const [token, value] of smaller.entries()) {
      const other = larger.get(token);
      if (other) {
        dot += value * other;
      }
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Chunk text into smaller pieces
  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.CHUNK_SIZE, text.length);
      const chunk = text.substring(start, end);
      chunks.push(chunk.trim());
      start += this.CHUNK_SIZE - this.CHUNK_OVERLAP;
    }

    return chunks.filter(c => c.length > 0);
  }

  // Calculate relevance score (improved for Chinese text)
  private calculateRelevanceScore(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    let score = 0;

    // Direct substring match (works well for Chinese)
    if (textLower.includes(queryLower)) {
      score += 10;
    }

    // Split query into terms (by whitespace for English, by character for Chinese)
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 0);

    for (const term of queryTerms) {
      // For Chinese characters or short terms, match directly
      if (term.length >= 1) {
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = textLower.match(regex);
        if (matches) {
          score += matches.length * (term.length >= 2 ? 2 : 1);
        }
      }
    }

    // Also try matching individual characters for Chinese
    if (/[\u4e00-\u9fa5]/.test(query)) {
      const chars = query.split('').filter(c => /[\u4e00-\u9fa5]/.test(c));
      for (const char of chars) {
        if (textLower.includes(char)) {
          score += 0.5;
        }
      }
    }

    return score;
  }

  // Build RAG context from search results
  buildRAGContext(results: SearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    let context = '相关知识库内容：\n\n';
    results.forEach((result, index) => {
      context += `[${index + 1}] ${result.title}\n${result.chunk}\n\n`;
    });

    return context;
  }

  // Alias for search method (for workflow compatibility)
  async searchKnowledge(query: string, topK: number = 5, knowledgeBaseId?: string): Promise<SearchResult[]> {
    return this.search(query, topK, knowledgeBaseId);
  }
}
