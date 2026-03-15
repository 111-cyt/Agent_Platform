import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './database.service';
import { QwenService } from './qwen.service';
import { KnowledgeService } from './knowledge.service';

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config: any;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at?: string;
  updated_at?: string;
}

export class WorkflowEngine {
  private db: DatabaseService;
  private qwenService: QwenService;
  private knowledgeService: KnowledgeService;

  constructor() {
    this.db = DatabaseService.getInstance();
    this.qwenService = new QwenService();
    this.knowledgeService = new KnowledgeService();
  }

  // Create a new workflow
  async createWorkflow(workflow: Omit<Workflow, 'id' | 'created_at' | 'updated_at'>): Promise<Workflow> {
    const id = uuidv4();
    const sql = `INSERT INTO workflows (id, name, description, nodes, edges) VALUES (?, ?, ?, ?, ?)`;

    await this.db.execute(sql, [
      id,
      workflow.name,
      workflow.description || '',
      JSON.stringify(workflow.nodes),
      JSON.stringify(workflow.edges)
    ]);

    return this.getWorkflow(id);
  }

  // Get workflow by ID
  async getWorkflow(id: string): Promise<Workflow> {
    const sql = `SELECT * FROM workflows WHERE id = ?`;
    const rows = await this.db.query(sql, [id]);

    if (!rows || rows.length === 0) {
      throw new Error('Workflow not found');
    }

    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      nodes: typeof row.nodes === 'string' ? JSON.parse(row.nodes) : row.nodes,
      edges: typeof row.edges === 'string' ? JSON.parse(row.edges) : row.edges,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // Get all workflows
  async getAllWorkflows(): Promise<Workflow[]> {
    const sql = `SELECT * FROM workflows ORDER BY created_at DESC`;
    const rows = await this.db.query(sql);

    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      nodes: typeof row.nodes === 'string' ? JSON.parse(row.nodes) : row.nodes,
      edges: typeof row.edges === 'string' ? JSON.parse(row.edges) : row.edges,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  // Update workflow
  async updateWorkflow(id: string, workflow: Partial<Workflow>): Promise<Workflow> {
    const sql = `UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ? WHERE id = ?`;

    const existing = await this.getWorkflow(id);

    await this.db.execute(sql, [
      workflow.name || existing.name,
      workflow.description || existing.description,
      JSON.stringify(workflow.nodes || existing.nodes),
      JSON.stringify(workflow.edges || existing.edges),
      id
    ]);

    return this.getWorkflow(id);
  }

  // Delete workflow
  async deleteWorkflow(id: string): Promise<void> {
    const sql = `DELETE FROM workflows WHERE id = ?`;
    await this.db.execute(sql, [id]);
  }

  // Execute workflow
  async executeWorkflow(workflowId: string, input: any, sessionId?: string): Promise<any> {
    const workflow = await this.getWorkflow(workflowId);
    const executionId = uuidv4();

    // Build execution graph
    const nodeMap = new Map<string, WorkflowNode>();
    workflow.nodes.forEach(node => nodeMap.set(node.id, node));

    const edgeMap = new Map<string, WorkflowEdge[]>();
    workflow.edges.forEach(edge => {
      if (!edgeMap.has(edge.source)) {
        edgeMap.set(edge.source, []);
      }
      edgeMap.get(edge.source)!.push(edge);
    });

    // Find input node
    const inputNode = workflow.nodes.find(n => n.type === 'input');
    if (!inputNode) {
      throw new Error('No input node found');
    }

    // Execute nodes in topological order
    const results = new Map<string, any>();
    const visited = new Set<string>();

    const executeNode = async (nodeId: string, context: any): Promise<any> => {
      if (visited.has(nodeId)) {
        return results.get(nodeId);
      }

      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) {
        throw new Error(`Node ${nodeId} not found`);
      }

      // Log execution start
      await this.logExecution(workflowId, sessionId, nodeId, 'running', context, null, null);

      try {
        let result;
        switch (node.type) {
          case 'input':
            // Extract the actual input value
            result = context.message || context.input || context;
            break;
          case 'llm':
            result = await this.executeLLM(node, context);
            break;
          case 'kb-search':
            result = await this.executeKBSearch(node, context);
            break;
          case 'kb-delete':
            result = await this.executeKBDelete(node, context);
            break;
          case 'intent':
            result = await this.executeIntent(node, context);
            break;
          case 'batch':
            result = await this.executeBatch(node, context);
            break;
          case 'selector':
            result = await this.executeSelector(node, context);
            break;
          case 'code':
            result = await this.executeCode(node, context);
            break;
          case 'db-query':
            result = await this.executeDbQuery(node, context);
            break;
          case 'output':
            result = context;
            break;
          default:
            result = context;
        }

        results.set(nodeId, result);

        // Log execution success
        await this.logExecution(workflowId, sessionId, nodeId, 'success', context, result, null);

        // Execute next nodes
        const outgoingEdges = edgeMap.get(nodeId) || [];
        const nextNodeIds = node.type === 'selector'
          ? this.selectBranchTargets(node, result, outgoingEdges)
          : outgoingEdges.map(edge => edge.target);

        for (const nextNodeId of nextNodeIds) {
          await executeNode(nextNodeId, result);
        }

        return result;
      } catch (error: any) {
        // Log execution error
        await this.logExecution(workflowId, sessionId, nodeId, 'error', context, null, error.message);
        throw error;
      }
    };

    // Start execution from input node
    await executeNode(inputNode.id, input);

    // Return all node results along with the final output
    const outputNode = workflow.nodes.find(n => n.type === 'output');
    const finalResult = outputNode && results.has(outputNode.id)
      ? results.get(outputNode.id)
      : Array.from(results.values()).pop();

    // Convert results Map to object for easier access
    const nodeResults: Record<string, any> = {};
    results.forEach((value, key) => {
      nodeResults[key] = value;
    });

    return {
      result: finalResult,
      nodeResults: nodeResults
    };
  }

  private async executeLLM(node: WorkflowNode, context: any): Promise<any> {
    const config = node.config || {};
    const model = config.model || 'qwen-turbo';
    const systemPrompt = config.systemPrompt || '';
    const userPrompt = config.userPrompt || '';

    // Replace variables in prompts with context values
    const replacedUserPrompt = this.replaceVariables(userPrompt, context);
    const replacedSystemPrompt = this.replaceVariables(systemPrompt, context);

    // Call Qwen API
    const result = await this.qwenService.generateText(replacedUserPrompt, replacedSystemPrompt, model);

    // Return result with output name from config
    const outputName = config.outputName || 'answer';
    if (typeof context === 'string') {
      return { input: context, [outputName]: result };
    }
    return { ...context, [outputName]: result };
  }

  private async executeKBSearch(node: WorkflowNode, context: any): Promise<any> {
    const config = node.config || {};
    const queryTemplate = (config.query || '{{input}}').trim();
    let query = this.replaceVariables(queryTemplate, context).trim();
    if (!query) {
      if (typeof context === 'string') {
        query = context.trim();
      } else {
        query = String(context?.input || context?.message || '').trim();
      }
    }
    const topK = config.topK || 3;
    const knowledgeBaseId = config.knowledgeBaseId;
    const outputName = config.outputName || 'kb_result';
    const listOutputName = config.listOutputName || 'kb_results';

    // Search knowledge base
    const results = await this.knowledgeService.searchKnowledge(query, topK, knowledgeBaseId);

    // Format results as text
    const formattedResults = results.map((r: any, i: number) =>
      `[${i + 1}] ${r.chunk}`
    ).join('\n\n');

    // Return context as object with kb_result
    if (typeof context === 'string') {
      return { input: context, [outputName]: formattedResults, [listOutputName]: results };
    }
    return { ...context, [outputName]: formattedResults, [listOutputName]: results };
  }

  private async executeKBDelete(node: WorkflowNode, context: any): Promise<any> {
    const config = node.config || {};
    const knowledgeBaseId = String(config.knowledgeBaseId || '').trim();
    const queryTemplate = String(config.query || '').trim();
    const topKConfig = Number(config.topK || 3);
    const topK = Number.isFinite(topKConfig) ? Math.max(1, Math.min(20, Math.floor(topKConfig))) : 3;
    const outputName = config.outputName || 'kb_delete_result';

    const contextObject = typeof context === 'string' ? { input: context } : (context || {});
    const deletedIds = new Set<string>();

    if (knowledgeBaseId) {
      await this.knowledgeService.deleteKnowledge(knowledgeBaseId);
      deletedIds.add(knowledgeBaseId);
    }

    let query = this.replaceVariables(queryTemplate, contextObject).trim();
    if (!query && typeof context === 'string') {
      query = context.trim();
    }

    if (query) {
      const matches = await this.knowledgeService.searchKnowledge(query, topK);
      const uniqueIds = Array.from(new Set(matches.map((item: any) => item.id).filter(Boolean)));
      for (const id of uniqueIds) {
        if (!deletedIds.has(id)) {
          await this.knowledgeService.deleteKnowledge(id);
          deletedIds.add(id);
        }
      }
    }

    return {
      ...contextObject,
      [outputName]: {
        deletedCount: deletedIds.size,
        deletedIds: Array.from(deletedIds)
      }
    };
  }

  private async executeIntent(node: WorkflowNode, context: any): Promise<any> {
    const config = node.config || {};
    const inputField = config.inputField || 'input';
    const outputName = config.outputName || 'intent';
    const defaultRules = [
      { name: 'qa', keywords: ['什么', '多少', '怎么', '为何', '为什么', '?', '？'] },
      { name: 'greeting', keywords: ['你好', 'hi', 'hello', '早上好'] },
      { name: 'task', keywords: ['创建', '生成', '执行', '处理', '查询'] }
    ];

    const parseKeywords = (value: any): string[] => String(value || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const uiRules = [
      { name: 'qa', keywords: parseKeywords(config.qaKeywords) },
      { name: 'task', keywords: parseKeywords(config.taskKeywords) },
      { name: 'greeting', keywords: parseKeywords(config.greetingKeywords) }
    ].filter(rule => rule.keywords.length > 0);

    const rules = Array.isArray(config.rules) && config.rules.length > 0
      ? config.rules
      : (uiRules.length > 0 ? uiRules : defaultRules);
    const contextObject = typeof context === 'string' ? { input: context } : (context || {});
    const rawText = String(contextObject[inputField] ?? contextObject.input ?? contextObject.message ?? '').trim();
    const text = rawText.toLowerCase();

    let matchedIntent = 'unknown';
    let confidence = 0;

    for (const rule of rules) {
      const keywords = Array.isArray(rule?.keywords) ? rule.keywords : [];
      const hitCount = keywords.filter((word: any) => text.includes(String(word).toLowerCase())).length;
      if (hitCount > 0) {
        const score = hitCount / Math.max(1, keywords.length);
        if (score > confidence) {
          confidence = score;
          matchedIntent = String(rule?.name || 'unknown');
        }
      }
    }

    return {
      ...contextObject,
      [outputName]: matchedIntent,
      intent_confidence: Number(confidence.toFixed(2))
    };
  }

  private async executeBatch(node: WorkflowNode, context: any): Promise<any> {
    const config = node.config || {};
    const sourceField = config.sourceField || 'input';
    const separator = String(config.separator || '\n');
    const outputName = config.outputName || 'batch_result';
    const mode = config.mode || 'count';

    const contextObject = typeof context === 'string' ? { input: context } : (context || {});
    const sourceValue = contextObject[sourceField] ?? contextObject.input ?? '';

    let items: any[] = [];
    if (Array.isArray(sourceValue)) {
      items = sourceValue;
    } else if (typeof sourceValue === 'string') {
      items = sourceValue.split(separator).map(s => s.trim()).filter(Boolean);
    } else if (sourceValue !== null && sourceValue !== undefined) {
      items = [sourceValue];
    }

    if (mode === 'foreach') {
      const itemField = String(config.itemField || 'batch_item').trim() || 'batch_item';
      const indexField = String(config.indexField || 'batch_index').trim() || 'batch_index';
      const itemResultField = String(config.itemResultField || 'item_result').trim() || 'item_result';
      const runKBSearch = String(config.runKBSearch ?? 'true').toLowerCase() !== 'false';
      const runLLM = String(config.runLLM ?? 'true').toLowerCase() !== 'false';
      const queryTemplate = String(config.itemQuery || `{{${itemField}}}`).trim();
      const itemTopKConfig = Number(config.itemTopK || 3);
      const itemTopK = Number.isFinite(itemTopKConfig) ? Math.max(1, Math.min(20, Math.floor(itemTopKConfig))) : 3;
      const itemKnowledgeBaseId = String(config.itemKnowledgeBaseId || '').trim();
      const itemKbOutputName = String(config.itemKbOutputName || 'kb_result').trim() || 'kb_result';
      const itemKbListOutputName = String(config.itemKbListOutputName || 'kb_results').trim() || 'kb_results';
      const itemModel = String(config.itemModel || 'qwen-turbo').trim() || 'qwen-turbo';
      const itemSystemPrompt = String(config.itemSystemPrompt || '').trim();
      const itemUserPrompt = String(config.itemUserPrompt || `请输出${itemField}的邮箱、年龄、性别、性格`).trim();
      const itemLLMOutputName = String(config.itemLLMOutputName || 'answer').trim() || 'answer';
      const aggregateMode = String(config.aggregateMode || 'list').trim();
      const resultTemplate = String(config.resultTemplate || '').trim();
      const parallel = String(config.parallel ?? 'true').toLowerCase() !== 'false';
      const concurrencyConfig = Number(config.concurrency || 5);
      const concurrency = Number.isFinite(concurrencyConfig)
        ? Math.max(1, Math.min(20, Math.floor(concurrencyConfig)))
        : 5;

      const runItem = async (item: any, index: number): Promise<any> => {
        let itemContext: any = {
          ...contextObject,
          original_input: contextObject.input,
          input: item,
          [itemField]: item,
          [indexField]: index
        };

        if (runKBSearch) {
          itemContext = await this.executeKBSearch(
            {
              ...node,
              config: {
                query: queryTemplate,
                topK: itemTopK,
                knowledgeBaseId: itemKnowledgeBaseId,
                outputName: itemKbOutputName,
                listOutputName: itemKbListOutputName
              }
            },
            itemContext
          );
        }

        if (runLLM) {
          itemContext = await this.executeLLM(
            {
              ...node,
              config: {
                model: itemModel,
                systemPrompt: itemSystemPrompt,
                userPrompt: itemUserPrompt,
                outputName: itemLLMOutputName
              }
            },
            itemContext
          );
        }

        const finalItemResult = resultTemplate
          ? this.replaceVariables(resultTemplate, itemContext)
          : (itemContext[itemLLMOutputName] ?? itemContext[itemKbOutputName] ?? item);

        return {
          item,
          index,
          [itemResultField]: finalItemResult,
          item_context: itemContext
        };
      };

      let itemResults: any[] = [];
      if (!parallel || items.length <= 1 || concurrency <= 1) {
        for (let index = 0; index < items.length; index++) {
          itemResults.push(await runItem(items[index], index));
        }
      } else {
        let cursor = 0;
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
          while (true) {
            const index = cursor++;
            if (index >= items.length) break;
            const item = items[index];
            itemResults.push(await runItem(item, index));
          }
        });
        await Promise.all(workers);
        itemResults.sort((a, b) => Number(a.index) - Number(b.index));
      }

      const batchResult = aggregateMode === 'join'
        ? itemResults.map((entry: any) => String(entry[itemResultField] ?? '')).join('\n')
        : itemResults;

      return {
        ...contextObject,
        batch_items: items,
        batch_item_count: items.length,
        batch_mode: 'foreach',
        [outputName]: batchResult
      };
    }

    let batchResult: any;
    if (mode === 'join') {
      batchResult = items.join(' | ');
    } else if (mode === 'first') {
      batchResult = items[0] ?? null;
    } else {
      batchResult = items.length;
    }

    return {
      ...contextObject,
      batch_items: items,
      [outputName]: batchResult
    };
  }

  private async executeSelector(node: WorkflowNode, context: any): Promise<any> {
    const config = node.config || {};
    const conditionTemplate = String(config.condition || '').trim();
    const leftField = String(config.leftField || '').trim();
    const operator = String(config.operator || '').trim();
    const rightTemplate = String(config.rightValue ?? '').trim();
    const outputName = config.outputName || 'selector_result';
    const trueValue = config.trueValue ?? 'true';
    const falseValue = config.falseValue ?? 'false';

    const contextObject = typeof context === 'string' ? { input: context } : (context || {});

    let passed = false;
    const hasStructuredCondition = leftField.length > 0 && operator.length > 0;

    if (hasStructuredCondition) {
      const leftValue = contextObject[leftField];
      const rightResolved = this.replaceVariables(rightTemplate, contextObject);
      const rightValue = rightResolved;

      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const hasNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

      switch (operator) {
        case 'equals':
          passed = String(leftValue ?? '') === String(rightValue ?? '');
          break;
        case 'not_equals':
          passed = String(leftValue ?? '') !== String(rightValue ?? '');
          break;
        case 'contains':
          passed = String(leftValue ?? '').includes(String(rightValue ?? ''));
          break;
        case 'greater_than':
          passed = hasNumeric ? leftNumber > rightNumber : false;
          break;
        case 'less_than':
          passed = hasNumeric ? leftNumber < rightNumber : false;
          break;
        default:
          passed = false;
      }
    } else if (conditionTemplate) {
      const condition = this.replaceVariables(conditionTemplate, contextObject);
      try {
        passed = Boolean(
          new Function('context', `
            with (context || {}) {
              return (${condition});
            }
          `)(contextObject)
        );
      } catch {
        passed = false;
      }
    }

    return {
      ...contextObject,
      [outputName]: passed ? trueValue : falseValue,
      selector_passed: passed
    };
  }

  private selectBranchTargets(node: WorkflowNode, result: any, outgoingEdges: WorkflowEdge[]): string[] {
    if (!outgoingEdges || outgoingEdges.length === 0) {
      return [];
    }

    const config = node.config || {};
    const outputName = config.outputName || 'selector_result';
    const trueValue = String(config.trueValue ?? 'true');
    const falseValue = String(config.falseValue ?? 'false');
    const branchValue = String(result?.[outputName] ?? '').trim();

    const normalize = (value: string) => value.trim().toLowerCase();
    const matched = outgoingEdges.filter(edge => normalize(String(edge.label || '')) === normalize(branchValue));

    if (matched.length > 0) {
      return matched.map(edge => edge.target);
    }

    const elseEdges = outgoingEdges.filter(edge => {
      const label = normalize(String(edge.label || ''));
      return label === 'else' || label === '否则' || label === 'default';
    });

    if (elseEdges.length > 0) {
      return elseEdges.map(edge => edge.target);
    }

    const unlabeledEdges = outgoingEdges.filter(edge => !String(edge.label || '').trim());
    if (unlabeledEdges.length > 0) {
      if (branchValue === trueValue) {
        return [unlabeledEdges[0].target];
      }
      if (branchValue === falseValue && unlabeledEdges.length > 1) {
        return [unlabeledEdges[1].target];
      }
      return [unlabeledEdges[0].target];
    }

    return [];
  }

  private async executeCode(node: WorkflowNode, context: any): Promise<any> {
    const config = node.config || {};
    const code = String(config.code || '').trim();
    const outputName = config.outputName || 'code_result';

    if (!code) {
      throw new Error('Code node requires code content');
    }

    const contextObject = typeof context === 'string' ? { input: context } : (context || {});
    const safeResult = new Function('context', `
      const { input, kb_result, answer } = context || {};
      ${code}
    `)(contextObject);

    if (typeof context === 'string') {
      return { input: context, [outputName]: safeResult };
    }

    return { ...contextObject, [outputName]: safeResult };
  }

  private async executeDbQuery(node: WorkflowNode, context: any): Promise<any> {
    const config = node.config || {};
    const outputName = config.outputName || 'db_result';
    const columns = String(config.columns || '*').trim() || '*';
    const table = String(config.table || '').trim();
    const whereTemplate = String(config.where || '').trim();
    const orderBy = String(config.orderBy || '').trim();
    const limitConfig = Number(config.limit || 10);
    const limit = Number.isFinite(limitConfig) ? Math.max(1, Math.min(100, Math.floor(limitConfig))) : 10;

    if (!table) {
      throw new Error('db-query node requires table');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      throw new Error('Invalid table name in db-query node');
    }

    if (columns !== '*' && !/^[a-zA-Z0-9_,\s]+$/.test(columns)) {
      throw new Error('Invalid columns in db-query node');
    }

    let whereClause = this.replaceVariables(whereTemplate, context).trim();
    if (whereClause) {
      const normalized = whereClause.toLowerCase();
      if (normalized.includes(';') || normalized.includes('--') || normalized.includes('/*')) {
        throw new Error('Unsafe where clause in db-query node');
      }
      if (!normalized.startsWith('where ')) {
        whereClause = `WHERE ${whereClause}`;
      }
    }

    let orderClause = '';
    if (orderBy) {
      if (!/^[a-zA-Z0-9_\s,]+$/.test(orderBy)) {
        throw new Error('Invalid orderBy in db-query node');
      }
      orderClause = ` ORDER BY ${orderBy}`;
    }

    const sql = `SELECT ${columns} FROM ${table} ${whereClause}${orderClause} LIMIT ${limit}`;
    const rows = await this.db.query(sql);

    const contextObject = typeof context === 'string' ? { input: context } : (context || {});
    return { ...contextObject, [outputName]: rows };
  }

  private replaceVariables(template: string, context: any): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      // If context is a string and key is 'input', return the context itself
      if (typeof context === 'string' && key === 'input') {
        return context;
      }
      // Otherwise look up the key in the context object
      return context[key] !== undefined ? String(context[key]) : match;
    });
  }

  private async logExecution(
    workflowId: string,
    sessionId: string | undefined,
    nodeId: string,
    status: string,
    input: any,
    output: any,
    error: any
  ): Promise<void> {
    const sql = `INSERT INTO execution_logs (id, workflow_id, session_id, node_id, status, input_data, output_data, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await this.db.execute(sql, [
      uuidv4(),
      workflowId,
      sessionId || null,
      nodeId,
      status,
      JSON.stringify(input),
      JSON.stringify(output),
      error
    ]);
  }

  // Get execution logs
  async getExecutionLogs(workflowId: string, limit: number = 50): Promise<any[]> {
    const sql = `SELECT * FROM execution_logs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ?`;
    return await this.db.query(sql, [workflowId, limit]);
  }
}
