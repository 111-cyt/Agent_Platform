import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export class DatabaseService {
  private static instance: DatabaseService;
  private dataSource: DataSource | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  private normalizeSqlForPostgres(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => {
      index += 1;
      return `$${index}`;
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.dataSource?.isInitialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
        this.dataSource = new DataSource({
          type: 'postgres',
          host: process.env.DB_HOST || '127.0.0.1',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'workflow_platform',
          synchronize: false
        });

        await this.dataSource.initialize();
        await this.dataSource.query('SELECT 1');
        console.log('✅ PostgreSQL connected (TypeORM DataSource)');

        await this.createTables();
        await this.insertSampleWorkflow();
      } catch (error) {
        console.error('❌ Database connection error:', error);
        if (this.dataSource?.isInitialized) {
          await this.dataSource.destroy();
        }
        this.dataSource = null;
        throw error;
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async reconnectIfNeeded(): Promise<void> {
    try {
      if (this.dataSource?.isInitialized) {
        await this.dataSource.destroy();
      }
    } catch {
    } finally {
      this.dataSource = null;
    }
    await this.initialize();
  }

  private async createTables(): Promise<void> {
    if (!this.dataSource?.isInitialized) return;

    const tables = [
      `CREATE TABLE IF NOT EXISTS workflows (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        nodes JSONB NOT NULL,
        edges JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS knowledge_base (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        file_name VARCHAR(255),
        chunks INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS chat_sessions (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL DEFAULT '',
        workflow_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(255) PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        role VARCHAR(16) CHECK (role IN ('user', 'assistant')) NOT NULL,
        content TEXT NOT NULL,
        sources JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS execution_logs (
        id VARCHAR(255) PRIMARY KEY,
        workflow_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(255),
        node_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        input_data JSONB,
        output_data JSONB,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      )`
    ];

    for (const sql of tables) {
      try {
        await this.dataSource.query(sql);
      } catch (error) {
        console.error('Table creation error:', error);
      }
    }

    console.log('✅ Database tables created');
  }

  private async insertSampleWorkflow(): Promise<void> {
    if (!this.dataSource?.isInitialized) return;

    try {
      const rows = await this.dataSource.query(
        this.normalizeSqlForPostgres('SELECT id FROM workflows WHERE id = ?'),
        ['sample-workflow-1']
      );
      if ((rows as any[]).length > 0) {
        console.log('✅ Sample workflow already exists');
        return;
      }

      const sampleWorkflow = {
        id: 'sample-workflow-1',
        name: '智能问答工作流示例',
        description: '演示如何使用知识库检索和大模型生成回答',
        nodes: JSON.stringify([
          {
            id: 'node-input',
            type: 'input',
            label: '输入',
            position: { x: 100, y: 200 },
            config: { description: '接收用户问题' }
          },
          {
            id: 'node-kb-search',
            type: 'kb-search',
            label: '知识库检索',
            position: { x: 350, y: 200 },
            config: {
              searchType: 'semantic',
              query: '{{input}}',
              topK: 3,
              description: '从知识库中检索相关内容'
            }
          },
          {
            id: 'node-llm',
            type: 'llm',
            label: '大模型',
            position: { x: 600, y: 200 },
            config: {
              model: 'qwen-turbo',
              inputName: 'context',
              inputType: 'str',
              inputValue: '{{kb_result}}',
              systemPrompt: '你是一个智能助手，请根据提供的知识库内容回答用户问题。',
              userPrompt: '知识库内容：{{context}}\\n\\n用户问题：{{input}}',
              outputName: 'answer',
              outputType: 'str',
              timeout: 180,
              retryCount: '1',
              errorHandling: 'interrupt',
              description: '使用大模型生成回答'
            }
          },
          {
            id: 'node-output',
            type: 'output',
            label: '输出',
            position: { x: 850, y: 200 },
            config: { description: '返回最终答案' }
          }
        ]),
        edges: JSON.stringify([
          { id: 'edge-1', source: 'node-input', target: 'node-kb-search' },
          { id: 'edge-2', source: 'node-kb-search', target: 'node-llm' },
          { id: 'edge-3', source: 'node-llm', target: 'node-output' }
        ])
      };

      await this.dataSource.query(
        this.normalizeSqlForPostgres('INSERT INTO workflows (id, name, description, nodes, edges) VALUES (?, ?, ?, ?, ?)'),
        [
          sampleWorkflow.id,
          sampleWorkflow.name,
          sampleWorkflow.description,
          sampleWorkflow.nodes,
          sampleWorkflow.edges
        ]
      );

      console.log('✅ Sample workflow inserted');
    } catch (error) {
      console.error('Sample workflow insertion error:', error);
    }
  }

  public async query(sql: string, params: any[] = []): Promise<any> {
    if (!this.dataSource?.isInitialized) {
      await this.initialize();
    }
    if (!this.dataSource?.isInitialized) throw new Error('Database not initialized');

    try {
      return await this.dataSource.query(this.normalizeSqlForPostgres(sql), params);
    } catch {
      await this.reconnectIfNeeded();
      if (!this.dataSource?.isInitialized) throw new Error('Database not initialized');
      return await this.dataSource.query(this.normalizeSqlForPostgres(sql), params);
    }
  }

  public async execute(sql: string, params: any[] = []): Promise<any> {
    return this.query(sql, params);
  }
}
