<template>
  <div class="workflow-view">
    <div class="toolbar">
      <h2>工作流编排</h2>
      <div class="toolbar-actions">
        <input v-model="workflowName" name="workflowName" placeholder="工作流名称" />
        <button @click="openTemplatePicker">📋 工作流</button>
        <button class="primary" @click="saveWorkflow">保存工作流</button>
        <button class="primary" @click="executeWorkflow">执行工作流</button>
      </div>
    </div>

    <!-- 工作��模板弹窗 -->
    <div v-if="showTemplates" class="modal-overlay" @click="showTemplates = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>选择工作流</h3>
          <button class="close-btn" @click="showTemplates = false">×</button>
        </div>
        <div class="modal-body">
          <div class="template-grid">
            <div
              v-for="template in workflowLibrary"
              :key="template.id"
              class="template-card"
              @click="loadTemplate(template)"
            >
              <div class="template-icon">{{ template.icon }}</div>
              <div class="template-name">{{ template.name }}</div>
              <div class="template-source">{{ template.source === 'example' ? '示例工作流' : '我的工作流' }}</div>
              <div class="template-desc">{{ template.description }}</div>
              <button
                v-if="template.source === 'user' && template.workflowId"
                class="template-delete-btn"
                @click.stop="deleteUserWorkflow(template.workflowId)"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="workflow-container">
      <div class="node-palette">
        <div class="palette-search">
          <input v-model="searchQuery" name="paletteSearch" placeholder="搜索节点、插件、工作流" />
        </div>

        <div class="palette-categories">
          <div class="category">
            <div class="category-header">
              <span class="category-icon">🤖</span>
              <span class="category-title">大模型</span>
            </div>
            <div
              class="palette-node"
              draggable="true"
              @dragstart="onDragStart($event, { type: 'llm', label: '大模型', category: 'ai' })"
            >
              <span class="node-icon">🤖</span>
              <span>大模型</span>
            </div>
          </div>

          <div class="category">
            <div class="category-header">
              <span class="category-icon">📦</span>
              <span class="category-title">业务逻辑</span>
            </div>
            <div
              v-for="node in businessLogicNodes"
              :key="node.type"
              class="palette-node"
              :class="{ disabled: !isNodeSupported(node.type) }"
              :draggable="isNodeSupported(node.type)"
              @dragstart="onDragStart($event, node)"
            >
              <span class="node-icon">{{ node.icon }}</span>
              <span>{{ node.label }}</span>
              <span v-if="!isNodeSupported(node.type)" class="node-badge">开发中</span>
            </div>
          </div>

          <div class="category">
            <div class="category-header">
              <span class="category-icon">📥</span>
              <span class="category-title">输入&输出</span>
            </div>
            <div
              v-for="node in ioNodes"
              :key="node.type"
              class="palette-node"
              draggable="true"
              @dragstart="onDragStart($event, node)"
            >
              <span class="node-icon">{{ node.icon }}</span>
              <span>{{ node.label }}</span>
            </div>
          </div>

          <div class="category">
            <div class="category-header">
              <span class="category-icon">🗄️</span>
              <span class="category-title">数据库</span>
            </div>
            <div
              v-for="node in databaseNodes"
              :key="node.type"
              class="palette-node"
              :class="{ disabled: !isNodeSupported(node.type) }"
              :draggable="isNodeSupported(node.type)"
              @dragstart="onDragStart($event, node)"
            >
              <span class="node-icon">{{ node.icon }}</span>
              <span>{{ node.label }}</span>
              <span v-if="!isNodeSupported(node.type)" class="node-badge">开发中</span>
            </div>
          </div>

          <div class="category">
            <div class="category-header">
              <span class="category-icon">📚</span>
              <span class="category-title">知识库&数据</span>
            </div>
            <div
              v-for="node in knowledgeNodes"
              :key="node.type"
              class="palette-node"
              :class="{ disabled: !isNodeSupported(node.type) }"
              :draggable="isNodeSupported(node.type)"
              @dragstart="onDragStart($event, node)"
            >
              <span class="node-icon">{{ node.icon }}</span>
              <span>{{ node.label }}</span>
              <span v-if="!isNodeSupported(node.type)" class="node-badge">开发中</span>
            </div>
          </div>
        </div>
      </div>

      <div
        class="canvas"
        @drop="onDrop"
        @dragover.prevent
        @click="deselectAll"
      >
        <svg class="connections">
          <path
            v-for="edge in edges"
            :key="edge.id"
            :d="getEdgePath(edge)"
            stroke="#1890ff"
            stroke-width="2"
            fill="none"
            class="edge-path"
          />
          <!-- 临时拖拽线 -->
          <path
            v-if="draggingEdge"
            :d="getDraggingEdgePath()"
            stroke="#1890ff"
            stroke-width="2"
            stroke-dasharray="5,5"
            fill="none"
          />
        </svg>

        <div
          v-for="node in nodes"
          :key="node.id"
          class="node"
          :class="{ selected: selectedNode === node.id }"
          :style="{
            left: node.position.x + 'px',
            top: node.position.y + 'px'
          }"
          @mousedown="startDrag($event, node)"
          @click.stop="selectNode(node.id)"
        >
          <div class="node-header">
            <span class="node-icon-large">{{ getNodeIcon(node.type) }}</span>
            <span class="node-title">{{ node.label }}</span>
          </div>
          <div class="node-body">
            <div class="node-description">{{ getNodeDescription(node.type) }}</div>
            <button class="node-run-btn" @click.stop="executeNode(node.id)">▶ 运行</button>
            <div v-if="executionResults[node.id]" class="node-result">
              <div class="result-status">✓ 已执行</div>
            </div>
          </div>
          <div class="node-ports">
            <div
              class="port port-input"
              @mousedown.stop="startPortDrag($event, node.id, 'input')"
            ></div>
            <div
              class="port port-output"
              @mousedown.stop="startPortDrag($event, node.id, 'output')"
            ></div>
          </div>
        </div>
      </div>

      <div class="properties-panel" v-if="selectedNode">
        <div class="panel-header">
          <h3>{{ selectedNodeData.label }}</h3>
          <button class="close-btn" @click="selectedNode = null">×</button>
        </div>

        <div class="panel-content">
          <div v-if="selectedNodeData.type === 'llm'" class="config-section">
            <div class="tabs">
              <div class="tab active">单次</div>
              <div class="tab">批处理</div>
            </div>

            <div class="form-section">
              <label>模型</label>
              <select v-model="selectedNodeData.config.model">
                <option value="qwen-turbo">通义千问-Turbo</option>
                <option value="qwen-plus">通义千问-Plus</option>
                <option value="qwen-max">通义千问-Max</option>
                <option value="qwen-long">通义千问-Long</option>
              </select>
            </div>


            <div class="form-section">
              <label>技能</label>
              <button class="add-btn">+ 添加技能</button>
            </div>

            <div class="form-section">
              <label>输入</label>
              <div class="input-fields">
                <input
                  v-model="selectedNodeData.config.inputName"
                  placeholder="变量名"
                  class="field-name"
                />
                <select v-model="selectedNodeData.config.inputType" class="field-type">
                  <option value="str">str</option>
                  <option value="int">int</option>
                  <option value="bool">bool</option>
                </select>
                <input
                  v-model="selectedNodeData.config.inputValue"
                  placeholder="输入或引用参数值"
                  class="field-value"
                />
              </div>
            </div>

            <div class="form-section">
              <label>系统提示词</label>
              <textarea
                v-model="selectedNodeData.config.systemPrompt"
                placeholder="系统提示词，可以使用{{变量名}}、{{变量名.子变量名}}、{{变量名[数组索引]}}的方式引用输入参数中的变量"
                rows="4"
              ></textarea>
            </div>

            <div class="form-section">
              <label>用户提示词</label>
              <textarea
                v-model="selectedNodeData.config.userPrompt"
                placeholder="用户提示词，可以使用{{变量名}}、{{变量名.子变量名}}、{{变量名[数组索引]}}的方式引用输入参数中的变量"
                rows="4"
              ></textarea>
            </div>

            <div class="form-section">
              <label>输出</label>
              <div class="input-fields">
                <input
                  v-model="selectedNodeData.config.outputName"
                  placeholder="变量名"
                  class="field-name"
                />
                <select v-model="selectedNodeData.config.outputType" class="field-type">
                  <option value="str">str.String</option>
                  <option value="json">JSON</option>
                </select>
              </div>
            </div>

            <div class="form-section">
              <label>异常处理</label>
              <div class="exception-config">
                <div class="config-row">
                  <span>超时时间</span>
                  <input
                    v-model="selectedNodeData.config.timeout"
                    type="number"
                    placeholder="180"
                  />
                  <span>s</span>
                </div>
                <div class="config-row">
                  <span>重试次数</span>
                  <select v-model="selectedNodeData.config.retryCount">
                    <option value="0">不重试</option>
                    <option value="1">1次</option>
                    <option value="2">2次</option>
                    <option value="3">3次</option>
                  </select>
                </div>
                <div class="config-row">
                  <span>异常处理方式</span>
                  <select v-model="selectedNodeData.config.errorHandling">
                    <option value="interrupt">中断流程</option>
                    <option value="continue">继续执行</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="config-section">
            <div v-if="!isNodeSupported(selectedNodeData.type)" class="form-section">
              <label>节点状态</label>
              <div class="coming-soon-tip">该节点暂未接入执行引擎，当前用于占位设计。</div>
            </div>

            <!-- 知识库检索配置 -->
            <div v-if="selectedNodeData.type === 'kb-search'" class="form-section">
              <label>选择知识库</label>
              <select v-model="selectedNodeData.config.knowledgeBaseId">
                <option value="">全部知识库</option>
                <option v-for="kb in knowledgeBases" :key="kb.id" :value="kb.id">
                  {{ kb.title }}
                </option>
              </select>
            </div>

            <div v-if="selectedNodeData.type === 'kb-search'" class="form-section">
              <label>检索方式</label>
              <select v-model="selectedNodeData.config.searchType">
                <option value="semantic">语义检索</option>
                <option value="keyword">关键词检索</option>
                <option value="hybrid">混合检索</option>
              </select>
            </div>

            <div v-if="selectedNodeData.type === 'kb-search'" class="form-section">
              <label>查询文本</label>
              <input v-model="selectedNodeData.config.query" placeholder="输入查询内容或使用{{变量}}" />
            </div>

            <div v-if="selectedNodeData.type === 'kb-search'" class="form-section">
              <label>返回结果数</label>
              <input v-model="selectedNodeData.config.topK" type="number" placeholder="3" />
            </div>

            <div v-if="selectedNodeData.type === 'kb-search'" class="form-section">
              <label>文本输出字段</label>
              <input v-model="selectedNodeData.config.outputName" placeholder="kb_result" />
            </div>

            <div v-if="selectedNodeData.type === 'kb-search'" class="form-section">
              <label>列表输出字段</label>
              <input v-model="selectedNodeData.config.listOutputName" placeholder="kb_results" />
            </div>

            <!-- 知识库删除配置 -->
            <div v-if="selectedNodeData.type === 'kb-delete'" class="form-section">
              <label>指定删除知识库</label>
              <select v-model="selectedNodeData.config.knowledgeBaseId">
                <option value="">不指定（按查询删除）</option>
                <option v-for="kb in knowledgeBases" :key="kb.id" :value="kb.id">
                  {{ kb.title }}
                </option>
              </select>
            </div>

            <div v-if="selectedNodeData.type === 'kb-delete'" class="form-section">
              <label>删除查询文本（可选）</label>
              <input v-model="selectedNodeData.config.query" placeholder="输入关键词，删除匹配文档" />
            </div>

            <div v-if="selectedNodeData.type === 'kb-delete'" class="form-section">
              <label>最多删除匹配数</label>
              <input v-model="selectedNodeData.config.topK" type="number" placeholder="3" />
            </div>

            <div v-if="selectedNodeData.type === 'kb-delete'" class="form-section">
              <label>输出字段</label>
              <input v-model="selectedNodeData.config.outputName" placeholder="kb_delete_result" />
            </div>

            <!-- 代码节点配置 -->
            <div v-if="selectedNodeData.type === 'code'" class="form-section">
              <label>编程语言</label>
              <select v-model="selectedNodeData.config.language">
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
              </select>
            </div>

            <div v-if="selectedNodeData.type === 'code'" class="form-section">
              <label>代码</label>
              <textarea v-model="selectedNodeData.config.code" rows="10" placeholder="输入代码..." style="font-family: monospace;"></textarea>
            </div>

            <!-- 意图识别配置 -->
            <div v-if="selectedNodeData.type === 'intent'" class="form-section">
              <label>输入字段</label>
              <input v-model="selectedNodeData.config.inputField" placeholder="input" />
            </div>

            <div v-if="selectedNodeData.type === 'intent'" class="form-section">
              <label>问答意图关键词（逗号分隔）</label>
              <textarea v-model="selectedNodeData.config.qaKeywords" rows="3" placeholder="什么, 怎么, 为何, ？"></textarea>
            </div>

            <div v-if="selectedNodeData.type === 'intent'" class="form-section">
              <label>任务意图关键词（逗号分隔）</label>
              <textarea v-model="selectedNodeData.config.taskKeywords" rows="3" placeholder="创建, 执行, 处理"></textarea>
            </div>

            <div v-if="selectedNodeData.type === 'intent'" class="form-section">
              <label>输出字段</label>
              <input v-model="selectedNodeData.config.outputName" placeholder="intent" />
            </div>

            <!-- 批处理配置 -->
            <div v-if="selectedNodeData.type === 'batch'" class="form-section">
              <label>来源字段</label>
              <input v-model="selectedNodeData.config.sourceField" placeholder="input" />
            </div>

            <div v-if="selectedNodeData.type === 'batch'" class="form-section">
              <label>分隔符</label>
              <input v-model="selectedNodeData.config.separator" placeholder="\n 或 ," />
            </div>

            <div v-if="selectedNodeData.type === 'batch'" class="form-section">
              <label>处理模式</label>
              <select v-model="selectedNodeData.config.mode">
                <option value="count">统计数量</option>
                <option value="join">拼接文本</option>
                <option value="first">取第一项</option>
                <option value="foreach">逐项执行（批处理体）</option>
              </select>
            </div>

            <div v-if="selectedNodeData.type === 'batch' && selectedNodeData.config.mode === 'foreach'" class="form-section">
              <label>每项变量名</label>
              <input v-model="selectedNodeData.config.itemField" placeholder="batch_item" />
            </div>

            <div v-if="selectedNodeData.type === 'batch' && selectedNodeData.config.mode === 'foreach'" class="form-section">
              <label>检索查询模板</label>
              <input v-model="selectedNodeData.config.itemQuery" placeholder="{{batch_item}} 邮箱 年龄 性别 性格" />
            </div>

            <div v-if="selectedNodeData.type === 'batch' && selectedNodeData.config.mode === 'foreach'" class="form-section">
              <label>每项检索条数</label>
              <input v-model="selectedNodeData.config.itemTopK" type="number" placeholder="3" />
            </div>

            <div v-if="selectedNodeData.type === 'batch' && selectedNodeData.config.mode === 'foreach'" class="form-section">
              <label>每项系统提示词</label>
              <textarea v-model="selectedNodeData.config.itemSystemPrompt" rows="3" placeholder="你是企业通讯录助手。只基于知识库结果回答，不要编造。"></textarea>
            </div>

            <div v-if="selectedNodeData.type === 'batch' && selectedNodeData.config.mode === 'foreach'" class="form-section">
              <label>每项用户提示词</label>
              <textarea v-model="selectedNodeData.config.itemUserPrompt" rows="4" placeholder="姓名={{batch_item}}\n知识库={{kb_result}}\n仅输出知识库中存在的信息，缺失字段省略"></textarea>
            </div>

            <div v-if="selectedNodeData.type === 'batch' && selectedNodeData.config.mode === 'foreach'" class="form-section">
              <label>聚合方式</label>
              <select v-model="selectedNodeData.config.aggregateMode">
                <option value="list">列表(JSON)</option>
                <option value="join">拼接文本</option>
              </select>
            </div>

            <div v-if="selectedNodeData.type === 'batch' && selectedNodeData.config.mode === 'foreach'" class="form-section">
              <label>结果模板</label>
              <input v-model="selectedNodeData.config.resultTemplate" placeholder="{{batch_item}}｜{{answer}}" />
            </div>

            <div v-if="selectedNodeData.type === 'batch'" class="form-section">
              <label>输出字段</label>
              <input v-model="selectedNodeData.config.outputName" placeholder="batch_result" />
            </div>

            <!-- 条件选择器配置 -->
            <div v-if="selectedNodeData.type === 'selector'" class="form-section">
              <label>条件分支</label>
              <div class="selector-inline">
                <span class="selector-prefix">如果</span>
                <select v-model="selectedNodeData.config.leftField">
                  <option value="input">input</option>
                  <option value="intent">intent</option>
                  <option value="route">route</option>
                  <option value="task_count">task_count</option>
                  <option value="kb_result">kb_result</option>
                </select>
                <select v-model="selectedNodeData.config.operator">
                  <option value="contains">包含</option>
                  <option value="equals">等于</option>
                  <option value="not_equals">不等于</option>
                  <option value="greater_than">大于</option>
                  <option value="less_than">小于</option>
                </select>
                <input v-model="selectedNodeData.config.rightValue" placeholder="输入或引用参数值" />
              </div>
            </div>

            <div v-if="selectedNodeData.type === 'selector'" class="form-section">
              <label>则输出</label>
              <input v-model="selectedNodeData.config.trueValue" placeholder="pass" />
            </div>

            <div v-if="selectedNodeData.type === 'selector'" class="form-section">
              <label>否则</label>
              <input v-model="selectedNodeData.config.falseValue" placeholder="reject" />
            </div>

            <div v-if="selectedNodeData.type === 'selector'" class="form-section">
              <label>输出字段</label>
              <input v-model="selectedNodeData.config.outputName" placeholder="selector_result" />
            </div>

            <div v-if="selectedNodeData.type === 'selector'" class="form-section">
              <label>下游分支标签</label>
              <div
                v-for="edge in edges.filter(e => e.source === selectedNodeData.id)"
                :key="edge.id"
                class="branch-row"
              >
                <span class="branch-target">→ {{ getNodeLabel(edge.target) }}</span>
                <input v-model="edge.label" placeholder="例如：任务类 / 非任务类 / 否则" />
              </div>
              <div v-if="edges.filter(e => e.source === selectedNodeData.id).length === 0" class="branch-empty">
                请先从选择器连出至少一条下游分支
              </div>
            </div>

            <!-- 数据库查询配置 -->
            <div v-if="selectedNodeData.type === 'db-query'" class="form-section">
              <label>数据表</label>
              <input v-model="selectedNodeData.config.table" placeholder="表名" />
            </div>

            <div v-if="selectedNodeData.type === 'db-query'" class="form-section">
              <label>查询列</label>
              <input v-model="selectedNodeData.config.columns" placeholder="* 或 id,title" />
            </div>

            <div v-if="selectedNodeData.type === 'db-query'" class="form-section">
              <label>查询条件</label>
              <textarea v-model="selectedNodeData.config.where" rows="3" placeholder="WHERE 条件"></textarea>
            </div>

            <div v-if="selectedNodeData.type === 'db-query'" class="form-section">
              <label>排序</label>
              <input v-model="selectedNodeData.config.orderBy" placeholder="created_at DESC" />
            </div>

            <div v-if="selectedNodeData.type === 'db-query'" class="form-section">
              <label>返回条数</label>
              <input v-model="selectedNodeData.config.limit" type="number" placeholder="10" />
            </div>

            <div v-if="selectedNodeData.type === 'db-query'" class="form-section">
              <label>输出字段</label>
              <input v-model="selectedNodeData.config.outputName" placeholder="db_result" />
            </div>

            <!-- 通用配置 -->
            <div class="form-section">
              <label>节点标签</label>
              <input v-model="selectedNodeData.label" />
            </div>

            <div class="form-section">
              <label>节点描述</label>
              <textarea v-model="selectedNodeData.config.description" rows="3" placeholder="描述此节点的功能"></textarea>
            </div>

            <!-- 输入节点特殊配置 -->
            <div v-if="selectedNodeData.type === 'input'" class="form-section">
              <label>输入内容</label>
              <textarea
                v-model="selectedNodeData.config.inputContent"
                rows="6"
                placeholder="输入要处理的内容..."
                style="width: 100%; padding: 10px; border: 1px solid #e8e8e8; border-radius: 4px;"
              ></textarea>
              <button
                @click="saveInputContent"
                class="primary"
                style="margin-top: 10px; width: 100%;"
              >
                保存输入内容
              </button>
            </div>
          </div>
        </div>

        <div class="panel-footer">
          <button class="danger" @click="deleteNode">删除节点</button>
        </div>
      </div>
    </div>

    <!-- 输出面板 -->
    <div class="output-panel" :class="{ open: showOutputPanel }">
      <div class="output-header">
        <h3>执行结果</h3>
        <button class="close-btn" @click="showOutputPanel = false">×</button>
      </div>
      <div class="output-content">
        <div v-if="currentExecutionResult">
          <div class="result-section">
            <h4>执行状态</h4>
            <div class="status-badge success">✓ 执行成功</div>
          </div>
          <div class="result-section">
            <h4>输出结果</h4>
            <div class="result-text">{{ displayResultText }}</div>
          </div>
        </div>
        <div v-else class="empty-result">
          暂无执行结果
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import api from '../api'

interface NodeType {
  type: string
  label: string
  icon: string
  category: string
}

interface Node {
  id: string
  type: string
  label: string
  position: { x: number; y: number }
  config: any
}

interface Edge {
  id: string
  source: string
  target: string
  label?: string
}

interface WorkflowSnapshot {
  name: string
  nodes: Node[]
  edges: Edge[]
}

interface ExampleTemplate {
  id: string
  name: string
  icon: string
  description: string
  workflow: WorkflowSnapshot
}

interface SavedWorkflow {
  id: string
  name: string
  description?: string
  nodes: Node[]
  edges: Edge[]
  created_at?: string
  updated_at?: string
}

interface WorkflowLibraryItem {
  id: string
  name: string
  icon: string
  description: string
  source: 'example' | 'user'
  workflow: WorkflowSnapshot
  workflowId?: string
}

const workflowName = ref('新工作流')
const workflowId = ref<string | null>(null)
const nodes = ref<Node[]>([])
const edges = ref<Edge[]>([])
const selectedNode = ref<string | null>(null)
const draggedNode = ref<Node | null>(null)
const dragOffset = ref({ x: 0, y: 0 })
const searchQuery = ref('')
const draggingEdge = ref<{ sourceId: string; sourcePort: string; x: number; y: number } | null>(null)
const executionResults = ref<Record<string, any>>({})
const showOutputPanel = ref(false)
const currentExecutionResult = ref<any>(null)
const showTemplates = ref(false)
const knowledgeBases = ref<any[]>([])
const userWorkflows = ref<SavedWorkflow[]>([])

const displayResultText = computed(() => {
  const data = currentExecutionResult.value
  if (!data) return ''

  const target = data.result ?? data

  if (typeof target === 'string') return target
  if (target?.answer) return String(target.answer)
  if (target?.output) return String(target.output)
  if (target?.result && typeof target.result === 'string') return target.result

  return '执行完成，但没有可显示的文本结果'
})

// 工作流模板
const exampleWorkflowTemplates: ExampleTemplate[] = [
  {
    id: 'selector-batch-template',
    name: '条件分流与知识库检索',
    icon: '🔀',
    description: '有关键词才检索知识库，无关键词走否则分支',
    workflow: {
      name: '条件分流知识库工作流',
      nodes: [
        {
          id: 'node-input-sb',
          type: 'input',
          label: '输入',
          position: { x: 80, y: 240 },
          config: {
            inputContent: '请查询个人信息中的邮箱',
            description: '包含关键词时触发知识库检索'
          }
        },
        {
          id: 'node-selector-sb',
          type: 'selector',
          label: '选择器',
          position: { x: 320, y: 240 },
          config: {
            leftField: 'input',
            operator: 'contains',
            rightValue: '个人信息',
            trueValue: '查知识库',
            falseValue: '不查知识库',
            outputName: 'route',
            description: '命中关键词则走知识库分支，否则走默认分支'
          }
        },
        {
          id: 'node-kb-search-sb',
          type: 'kb-search',
          label: '知识库检索',
          position: { x: 560, y: 100 },
          config: {
            query: '{{input}}',
            topK: 3,
            outputName: 'kb_result',
            listOutputName: 'kb_results',
            description: '仅在命中关键词时执行检索'
          }
        },
        {
          id: 'node-llm-sb',
          type: 'llm',
          label: '大模型',
          position: { x: 800, y: 240 },
          config: {
            model: 'qwen-turbo',
            systemPrompt: '你是分流分析助手。请简洁输出，不要扩展解释。',
            userPrompt: '路由={{route}}\n用户输入={{input}}\n知识库结果={{kb_result}}',
            outputName: 'answer',
            description: '输出分流结果与（可选）知识库结果'
          }
        },
        {
          id: 'node-output-sb',
          type: 'output',
          label: '输出',
          position: { x: 1040, y: 240 },
          config: { description: '输出最终分析结果' }
        }
      ],
      edges: [
        { id: 'edge-sb-1', source: 'node-input-sb', target: 'node-selector-sb' },
        { id: 'edge-sb-2', source: 'node-selector-sb', target: 'node-kb-search-sb', label: '查知识库' },
        { id: 'edge-sb-2-else', source: 'node-selector-sb', target: 'node-llm-sb', label: '否则' },
        { id: 'edge-sb-3', source: 'node-kb-search-sb', target: 'node-llm-sb' },
        { id: 'edge-sb-4', source: 'node-llm-sb', target: 'node-output-sb' }
      ]
    }
  },
  {
    id: 'person-email-batch-template',
    name: '单人/多人邮箱画像（含选择器）',
    icon: '📦',
    description: '保留选择器分流：单人走普通检索，多人走foreach批处理体',
    workflow: {
      name: '单人多人邮箱画像分流工作流',
      nodes: [
        {
          id: 'node-input-pe',
          type: 'input',
          label: '输入',
          position: { x: 80, y: 260 },
          config: {
            inputContent: '查询张三、李四和王五的邮箱，并给出年龄、性别、性格画像',
            description: '输入待查询的自然语言问题'
          }
        },
        {
          id: 'node-code-pe',
          type: 'code',
          label: '姓名提取',
          position: { x: 300, y: 260 },
          config: {
            language: 'javascript',
            code: "const text = String(input || '').trim();\nconst candidates = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];\nconst noise = new Set(['查询', '请查', '请问', '邮箱', '以及', '并且', '并给出', '给出', '年龄', '性别', '性格', '画像', '信息', '的']);\nconst names = candidates.filter((item) => !noise.has(item));\nconst unique = [...new Set(names)];\nreturn unique.join('\\n');",
            outputName: 'name_list',
            description: '把输入中的姓名抽取并转成换行列表'
          }
        },
        {
          id: 'node-batch-count-pe',
          type: 'batch',
          label: '人数统计',
          position: { x: 520, y: 260 },
          config: {
            sourceField: 'name_list',
            separator: '\n',
            mode: 'count',
            outputName: 'person_count',
            description: '用于选择器判断单人/多人分支'
          }
        },
        {
          id: 'node-selector-pe',
          type: 'selector',
          label: '单人/多人分流',
          position: { x: 740, y: 260 },
          config: {
            leftField: 'person_count',
            operator: 'greater_than',
            rightValue: '1',
            trueValue: '多人',
            falseValue: '单人',
            outputName: 'route',
            description: '必须使用选择器：人数>1走多人，否则单人'
          }
        },
        {
          id: 'node-kb-search-single-pe',
          type: 'kb-search',
          label: '单人检索',
          position: { x: 980, y: 120 },
          config: {
            query: '{{input}} 邮箱 年龄 性别 性格',
            topK: 5,
            outputName: 'kb_result',
            listOutputName: 'kb_results',
            description: '单人场景下按原问题检索'
          }
        },
        {
          id: 'node-llm-single-pe',
          type: 'llm',
          label: '单人回答',
          position: { x: 1220, y: 120 },
          config: {
            model: 'qwen-turbo',
            systemPrompt: '你是企业通讯录助手。只基于知识库结果回答，不要编造。',
            userPrompt: '用户问题：{{input}}\n路由：{{route}}\n知识库结果：{{kb_result}}\n\n请仅输出知识库中真实存在的信息（如邮箱、年龄、性别、性格）。缺失字段直接省略，不要写“未找到”或推测内容。',
            outputName: 'answer',
            description: '单人场景直接输出结果'
          }
        },
        {
          id: 'node-batch-pe',
          type: 'batch',
          label: '批处理体执行',
          position: { x: 980, y: 400 },
          config: {
            sourceField: 'name_list',
            separator: '\n',
            mode: 'foreach',
            outputName: 'batch_profiles',
            itemField: 'batch_item',
            indexField: 'batch_index',
            itemResultField: 'profile',
            runKBSearch: true,
            itemQuery: '{{batch_item}} 邮箱 年龄 性别 性格',
            itemTopK: 3,
            runLLM: true,
            itemModel: 'qwen-turbo',
            itemSystemPrompt: '你是企业通讯录助手。只基于知识库结果回答，不要编造。',
            itemUserPrompt: '姓名={{batch_item}}\n知识库结果={{kb_result}}\n请仅输出知识库里确实存在的信息；缺失字段直接省略，不要写“未找到”。',
            itemLLMOutputName: 'answer',
            aggregateMode: 'join',
            resultTemplate: '{{batch_item}}｜{{answer}}',
            parallel: true,
            concurrency: 5,
            description: '对姓名列表逐项执行：检索+LLM，再聚合'
          }
        },
        {
          id: 'node-llm-final-pe',
          type: 'llm',
          label: '多人回答',
          position: { x: 1220, y: 400 },
          config: {
            model: 'qwen-turbo',
            systemPrompt: '你是企业通讯录助手。保持结构化输出，不要编造。',
            userPrompt: '用户问题：{{input}}\n\n批处理结果：\n{{batch_profiles}}\n\n请按每人一行整理。只保留有值的字段，空字段不要输出，不要写“未找到”。',
            outputName: 'answer',
            description: '多人场景整理批处理结果'
          }
        },
        {
          id: 'node-output-pe',
          type: 'output',
          label: '输出',
          position: { x: 1460, y: 260 },
          config: { description: '输出最终结果' }
        }
      ],
      edges: [
        { id: 'edge-pe-1', source: 'node-input-pe', target: 'node-code-pe' },
        { id: 'edge-pe-2', source: 'node-code-pe', target: 'node-batch-count-pe' },
        { id: 'edge-pe-3', source: 'node-batch-count-pe', target: 'node-selector-pe' },
        { id: 'edge-pe-4-single', source: 'node-selector-pe', target: 'node-kb-search-single-pe', label: '单人' },
        { id: 'edge-pe-4-multi', source: 'node-selector-pe', target: 'node-batch-pe', label: '多人' },
        { id: 'edge-pe-5-single', source: 'node-kb-search-single-pe', target: 'node-llm-single-pe' },
        { id: 'edge-pe-5-multi', source: 'node-batch-pe', target: 'node-llm-final-pe' },
        { id: 'edge-pe-6-single', source: 'node-llm-single-pe', target: 'node-output-pe' },
        { id: 'edge-pe-6-multi', source: 'node-llm-final-pe', target: 'node-output-pe' }
      ]
    }
  },
  {
    id: 'blank',
    name: '空白工作流',
    icon: '📄',
    description: '从头开始创建工作流',
    workflow: {
      name: '新工作流',
      nodes: [],
      edges: []
    }
  }
]

const workflowLibrary = computed<WorkflowLibraryItem[]>(() => {
  const exampleItems = exampleWorkflowTemplates.map(template => ({
    ...template,
    source: 'example' as const
  }))

  const userItems = userWorkflows.value.map(workflow => ({
    id: `user-${workflow.id}`,
    name: workflow.name,
    icon: '🧑‍💻',
    description: workflow.description || `用户创建 · ${workflow.nodes?.length || 0} 个节点`,
    source: 'user' as const,
    workflow: {
      name: workflow.name,
      nodes: workflow.nodes || [],
      edges: workflow.edges || []
    },
    workflowId: workflow.id
  }))

  return [...exampleItems, ...userItems]
})

// 业务逻辑节点
const businessLogicNodes: NodeType[] = [
  { type: 'code', label: '代码', icon: '💻', category: 'logic' },
  { type: 'intent', label: '意图识别', icon: '🎯', category: 'logic' },
  { type: 'batch', label: '批处理', icon: '📦', category: 'logic' },
  { type: 'selector', label: '选择器', icon: '🔀', category: 'logic' }
]

// 输入输出节点
const ioNodes: NodeType[] = [
  { type: 'input', label: '输入', icon: '📥', category: 'io' },
  { type: 'output', label: '输出', icon: '📤', category: 'io' }
]

// 数据库节点
const databaseNodes: NodeType[] = [
  { type: 'db-query', label: '查询数据', icon: '🔍', category: 'database' },
  { type: 'db-delete', label: '删除数据', icon: '🗑️', category: 'database' }
]

// 知识库节点
const knowledgeNodes: NodeType[] = [
  { type: 'kb-search', label: '知识库检索', icon: '🔎', category: 'knowledge' },
  { type: 'kb-delete', label: '知识库删除', icon: '🗑️', category: 'knowledge' }
]

const selectedNodeData = computed(() => {
  const node = nodes.value.find(n => n.id === selectedNode.value)
  if (!node) return { id: '', label: '', config: {}, type: '' }

  // 确保 config 是对象
  if (typeof node.config === 'string') {
    try {
      node.config = JSON.parse(node.config)
    } catch {
      node.config = {
        model: 'qwen-turbo',
        systemPrompt: '你是一个有帮助的AI助手。',
        userPrompt: '{{input}}',
        outputName: 'answer'
      }
    }
  }

  return node
})

function getNodeIcon(type: string): string {
  const allNodes = [...businessLogicNodes, ...ioNodes, ...databaseNodes, ...knowledgeNodes]
  const node = allNodes.find(n => n.type === type)
  return node?.icon || '📦'
}

function getNodeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    llm: '调用大语言模型，使用变量和提示词生成回复',
    code: '执行自定义代码逻辑',
    intent: '识别用户输入的意图',
    batch: '批量处理多个数据项',
    selector: '根据条件选择不同的执行路径',
    input: '接收外部输入数据',
    output: '输出处理结果',
    'db-query': '从数据库查询数据',
    'db-delete': '从数据库删除数据',
    'kb-search': '从知识库检索相关内容',
    'kb-delete': '从知识库删除内容'
  }
  return descriptions[type] || '节点描述'
}

function getNodeLabel(nodeId: string): string {
  return nodes.value.find(n => n.id === nodeId)?.label || nodeId
}

function isNodeSupported(type: string): boolean {
  return ['llm', 'input', 'output', 'kb-search', 'kb-delete', 'code', 'db-query', 'intent', 'batch', 'selector'].includes(type)
}

function onDragStart(event: DragEvent, nodeType: NodeType) {
  if (!isNodeSupported(nodeType.type)) {
    event.preventDefault()
    return
  }

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('nodeType', JSON.stringify(nodeType))
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const nodeTypeData = event.dataTransfer?.getData('nodeType')
  if (nodeTypeData) {
    const nodeType = JSON.parse(nodeTypeData)
    const canvas = event.currentTarget as HTMLElement
    const rect = canvas.getBoundingClientRect()

    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: nodeType.type,
      label: nodeType.label,
      position: {
        x: event.clientX - rect.left - 100,
        y: event.clientY - rect.top - 60
      },
      config: nodeType.type === 'llm' ? {
        model: 'qwen-turbo',
        systemPrompt: '你是一个有帮助的AI助手。',
        userPrompt: '{{input}}',
        outputName: 'answer'
      } : nodeType.type === 'intent' ? {
        inputField: 'input',
        outputName: 'intent',
        qaKeywords: '什么, 怎么, 为何, ？',
        taskKeywords: '创建, 执行, 处理'
      } : nodeType.type === 'batch' ? {
        sourceField: 'input',
        separator: '\n',
        mode: 'count',
        outputName: 'batch_result'
      } : nodeType.type === 'selector' ? {
        leftField: 'input',
        operator: 'contains',
        rightValue: '任务',
        trueValue: 'pass',
        falseValue: 'reject',
        outputName: 'selector_result'
      } : nodeType.type === 'code' ? {
        language: 'javascript',
        code: 'return input;',
        outputName: 'code_result'
      } : nodeType.type === 'db-query' ? {
        table: 'knowledge_base',
        columns: '*',
        where: '',
        orderBy: 'created_at DESC',
        limit: 10,
        outputName: 'db_result'
      } : nodeType.type === 'kb-search' ? {
        query: '{{input}}',
        topK: 3,
        outputName: 'kb_result',
        listOutputName: 'kb_results'
      } : nodeType.type === 'kb-delete' ? {
        knowledgeBaseId: '',
        query: '',
        topK: 3,
        outputName: 'kb_delete_result'
      } : {}
    }
    nodes.value.push(newNode)
  }
}

function startDrag(event: MouseEvent, node: Node) {
  if ((event.target as HTMLElement).closest('.node-btn')) return
  if ((event.target as HTMLElement).closest('.port')) return

  draggedNode.value = node
  const nodeEl = event.currentTarget as HTMLElement
  const rect = nodeEl.getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }

  const onMouseMove = (e: MouseEvent) => {
    if (draggedNode.value) {
      const canvas = document.querySelector('.canvas') as HTMLElement
      const canvasRect = canvas.getBoundingClientRect()
      draggedNode.value.position = {
        x: e.clientX - canvasRect.left - dragOffset.value.x,
        y: e.clientY - canvasRect.top - dragOffset.value.y
      }
    }
  }

  const onMouseUp = () => {
    draggedNode.value = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function selectNode(nodeId: string) {
  selectedNode.value = nodeId
}

function configureNode(nodeId: string) {
  selectedNode.value = nodeId
}

// 开始从端口拖拽连线
function startPortDrag(event: MouseEvent, nodeId: string, portType: 'input' | 'output') {
  event.stopPropagation()

  if (portType === 'output') {
    const canvas = document.querySelector('.canvas') as HTMLElement
    const canvasRect = canvas.getBoundingClientRect()

    draggingEdge.value = {
      sourceId: nodeId,
      sourcePort: 'output',
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top
    }

    const onMouseMove = (e: MouseEvent) => {
      if (draggingEdge.value) {
        draggingEdge.value.x = e.clientX - canvasRect.left
        draggingEdge.value.y = e.clientY - canvasRect.top
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      if (draggingEdge.value) {
        // 检查是否释放在某个节点的输入端口上
        const targetElement = document.elementFromPoint(e.clientX, e.clientY)
        if (targetElement?.classList.contains('port-input')) {
          const targetNode = targetElement.closest('.node')
          if (targetNode) {
            const targetId = nodes.value.find(n =>
              targetNode.querySelector('.node-title')?.textContent === n.label
            )?.id

            if (targetId && targetId !== draggingEdge.value.sourceId) {
              // 创建连接
              const newEdge: Edge = {
                id: `edge-${Date.now()}`,
                source: draggingEdge.value.sourceId,
                target: targetId
              }
              edges.value.push(newEdge)
            }
          }
        }
        draggingEdge.value = null
      }

      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }
}

// 获取拖拽中的连线路径
function getDraggingEdgePath(): string {
  if (!draggingEdge.value) return ''

  const source = getNodeCenter(draggingEdge.value.sourceId)
  const target = { x: draggingEdge.value.x, y: draggingEdge.value.y }

  const dx = target.x - source.x
  const offset = Math.abs(dx) * 0.5

  const cp1x = source.x + offset
  const cp1y = source.y
  const cp2x = target.x - offset
  const cp2y = target.y

  return `M ${source.x} ${source.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${target.x} ${target.y}`
}

function deselectAll() {
  if (!(event?.target as HTMLElement)?.closest('.properties-panel')) {
    selectedNode.value = null
  }
}

function getNodeCenter(nodeId: string) {
  const node = nodes.value.find(n => n.id === nodeId)
  if (node) {
    return {
      x: node.position.x + 100,
      y: node.position.y + 60
    }
  }
  return { x: 0, y: 0 }
}

// 生成贝塞尔曲线路径
function getEdgePath(edge: Edge): string {
  const source = getNodeCenter(edge.source)
  const target = getNodeCenter(edge.target)

  const dx = target.x - source.x
  const dy = target.y - source.y

  // 控制点偏移量
  const offset = Math.abs(dx) * 0.5

  // 贝塞尔曲线控制点
  const cp1x = source.x + offset
  const cp1y = source.y
  const cp2x = target.x - offset
  const cp2y = target.y

  return `M ${source.x} ${source.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${target.x} ${target.y}`
}

function deleteNode() {
  if (selectedNode.value) {
    nodes.value = nodes.value.filter(n => n.id !== selectedNode.value)
    edges.value = edges.value.filter(
      e => e.source !== selectedNode.value && e.target !== selectedNode.value
    )
    selectedNode.value = null
  }
}

function saveInputContent() {
  alert('输入内容已保存！')
}

async function saveWorkflow() {
  try {
    const workflow = {
      name: workflowName.value,
      nodes: nodes.value,
      edges: edges.value
    }

    if (workflowId.value) {
      // 更新现有工作流
      await api.put(`/workflow/${workflowId.value}`, workflow)
      await loadUserWorkflows()
      alert('工作流已更新')
    } else {
      // 创建新工作流
      const response = await api.post('/workflow', workflow)
      workflowId.value = response.data.id
      await loadUserWorkflows()
      alert('工作流已保存')
    }
  } catch (error) {
    alert('保存失败：' + error)
  }
}

async function executeWorkflow() {
  try {
    // 先保存工作流
    const workflow = {
      name: workflowName.value,
      nodes: nodes.value,
      edges: edges.value
    }

    // 如果没有节点，提示用户
    if (nodes.value.length === 0) {
      alert('请先添加节点到工作流')
      return
    }

    // 查找输入节点并获取输入内容
    const inputNode = nodes.value.find(n => n.type === 'input')
    if (!inputNode) {
      alert('工作流中没有输入节点')
      return
    }

    const inputContent = inputNode.config?.inputContent
    if (!inputContent || !inputContent.trim()) {
      alert('请在输入节点中配置输入内容')
      return
    }

    // 保存或更新工作流
    if (workflowId.value) {
      await api.put(`/workflow/${workflowId.value}`, workflow)
    } else {
      const saveResponse = await api.post('/workflow', workflow)
      workflowId.value = saveResponse.data.id
    }

    // 执行工作流
    const response = await api.post(`/workflow/${workflowId.value}/execute`, {
      input: { message: inputContent }
    })

    // 显示结果在输出面板
    currentExecutionResult.value = {
      type: 'workflow',
      result: response.data.result,
      nodeResults: response.data.nodeResults
    }

    // 保存所有节点的执行结果
    if (response.data.nodeResults) {
      executionResults.value = response.data.nodeResults
    }

    showOutputPanel.value = true
  } catch (error: any) {
    alert('执行失败：' + (error.response?.data?.error || error.message))
  }
}

async function executeNode(nodeId: string) {
  try {
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) return

    // 查找输入节点并获取输入内容
    const inputNode = nodes.value.find(n => n.type === 'input')
    if (!inputNode) {
      alert('工作流中没有输入节点')
      return
    }

    const inputContent = inputNode.config?.inputContent
    if (!inputContent || !inputContent.trim()) {
      alert('请在输入节点中配置输入内容')
      return
    }

    // 先保存当前工作流
    const workflow = {
      name: workflowName.value,
      nodes: nodes.value,
      edges: edges.value
    }

    if (nodes.value.length === 0) {
      alert('请先添加节点到工作流')
      return
    }

    // 保存或更新工作流
    if (workflowId.value) {
      await api.put(`/workflow/${workflowId.value}`, workflow)
    } else {
      const saveResponse = await api.post('/workflow', workflow)
      workflowId.value = saveResponse.data.id
    }

    // 执行完整工作流
    const response = await api.post(`/workflow/${workflowId.value}/execute`, {
      input: { message: inputContent }
    })

    // 提取该节点的执行结果
    const nodeResult = response.data.nodeResults?.[nodeId]

    // 保存所有节点的执行结果
    if (response.data.nodeResults) {
      executionResults.value = response.data.nodeResults
    }

    currentExecutionResult.value = {
      type: 'node',
      nodeId: nodeId,
      nodeLabel: node.label,
      result: nodeResult || response.data.result
    }
    showOutputPanel.value = true
  } catch (error: any) {
    alert('节点执行失败：' + (error.response?.data?.error || error.message))
  }
}

async function loadUserWorkflows() {
  try {
    const response = await api.get('/workflow')
    userWorkflows.value = Array.isArray(response.data) ? response.data : []
  } catch (error) {
    console.error('加载用户工作流失败：', error)
  }
}

async function openTemplatePicker() {
  await loadUserWorkflows()
  showTemplates.value = true
}

function loadTemplate(template: WorkflowLibraryItem) {
  workflowName.value = template.workflow.name
  nodes.value = JSON.parse(JSON.stringify(template.workflow.nodes || []))
  edges.value = JSON.parse(JSON.stringify(template.workflow.edges || []))
  workflowId.value = template.source === 'user' ? (template.workflowId || null) : null
  showTemplates.value = false
  alert(template.source === 'user' ? '我的工作流已加载！' : '示例模板已加载！')
}

async function deleteUserWorkflow(id: string) {
  const confirmed = window.confirm('确认删除这个工作流吗？删除后不可恢复。')
  if (!confirmed) return

  try {
    await api.delete(`/workflow/${id}`)

    if (workflowId.value === id) {
      workflowId.value = null
    }

    await loadUserWorkflows()
    alert('工作流已删除')
  } catch (error: any) {
    alert('删除失败：' + (error.response?.data?.error || error.message))
  }
}

async function loadKnowledgeBases() {
  try {
    const response = await api.get('/knowledge')
    knowledgeBases.value = response.data
  } catch (error) {
    console.error('加载知识库失败：', error)
  }
}

// 组件挂载时加载知识库列表
import { onMounted } from 'vue'
onMounted(() => {
  loadKnowledgeBases()
  loadUserWorkflows()
})
</script>

<style scoped>
.workflow-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.toolbar {
  background: white;
  padding: 15px 20px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar h2 {
  margin: 0;
  font-size: 18px;
}

.toolbar-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.toolbar-actions input {
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
}

button {
  padding: 8px 16px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

button.primary {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
}

button.danger {
  background: #ff4d4f;
  color: white;
  border-color: #ff4d4f;
  width: 100%;
  margin-top: 20px;
}

button:hover {
  opacity: 0.8;
}

.workflow-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.node-palette {
  width: 280px;
  background: white;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.palette-search {
  padding: 15px;
  border-bottom: 1px solid #f0f0f0;
}

.palette-search input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
}

.palette-categories {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}

.category {
  margin-bottom: 15px;
}

.category-header {
  padding: 8px 15px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #666;
  background: #fafafa;
}

.category-icon {
  font-size: 16px;
}

.category-title {
  flex: 1;
}

.palette-node {
  padding: 10px 15px;
  margin: 4px 10px;
  background: white;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  cursor: move;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  transition: all 0.2s;
}

.palette-node:hover {
  border-color: #1890ff;
  background: #f0f7ff;
  transform: translateX(2px);
}

.palette-node.disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background: #fafafa;
  transform: none;
}

.palette-node.disabled:hover {
  border-color: #e8e8e8;
  background: #fafafa;
}

.node-badge {
  margin-left: auto;
  font-size: 11px;
  color: #999;
}

.node-icon {
  font-size: 18px;
}

.canvas {
  flex: 1;
  position: relative;
  background: #fafafa;
  background-image:
    linear-gradient(#e8e8e8 1px, transparent 1px),
    linear-gradient(90deg, #e8e8e8 1px, transparent 1px);
  background-size: 20px 20px;
  overflow: hidden;
}

.connections {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.edge-path {
  cursor: pointer;
  pointer-events: stroke;
  transition: stroke-width 0.2s;
}

.edge-path:hover {
  stroke-width: 3;
  stroke: #40a9ff;
}

.node {
  position: absolute;
  width: 200px;
  background: white;
  border: 2px solid #d9d9d9;
  border-radius: 8px;
  cursor: move;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  z-index: 2;
  transition: all 0.2s;
}

.node:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.node.selected {
  border-color: #1890ff;
  box-shadow: 0 0 0 3px rgba(24,144,255,0.2);
}

.node-header {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
  border-radius: 6px 6px 0 0;
}

.node-icon-large {
  font-size: 24px;
}

.node-title {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.node-body {
  padding: 12px;
}

.node-description {
  font-size: 12px;
  color: #666;
  line-height: 1.5;
}

.node-footer {
  padding: 8px 12px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 8px;
}

.node-btn {
  flex: 1;
  padding: 6px 12px;
  font-size: 12px;
  background: #fafafa;
  border: 1px solid #e8e8e8;
}

.node-btn:hover {
  background: #f0f7ff;
  border-color: #1890ff;
  color: #1890ff;
}

.node-ports {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
}

.port {
  position: absolute;
  width: 12px;
  height: 12px;
  background: white;
  border: 2px solid #1890ff;
  border-radius: 50%;
  pointer-events: all;
  cursor: crosshair;
  transition: all 0.2s;
}

.port:hover {
  width: 16px;
  height: 16px;
  background: #1890ff;
}

.port-input {
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.port-output {
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
}

.properties-panel {
  width: 380px;
  background: white;
  border-left: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 15px 20px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafafa;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.close-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 4px;
  font-size: 20px;
  line-height: 1;
  color: #999;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.panel-footer {
  padding: 15px 20px;
  border-top: 1px solid #e8e8e8;
}

/* 输出面板样式 */
.output-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 0;
  background: white;
  border-top: 2px solid #1890ff;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  transition: height 0.3s ease;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.output-panel.open {
  height: 400px;
}

.output-header {
  padding: 15px 20px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafafa;
}

.output-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.output-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.result-section {
  margin-bottom: 20px;
}

.result-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #666;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.success {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

.result-text {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.empty-result {
  text-align: center;
  color: #999;
  padding: 40px;
}

/* 节点运行按钮样式 */
.node-run-btn {
  width: 100%;
  margin-top: 8px;
  padding: 6px 12px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.3s;
}

.node-run-btn:hover {
  background: #40a9ff;
}

.node-result {
  margin-top: 8px;
  padding: 6px;
  background: #f6ffed;
  border-radius: 4px;
}

.result-status {
  font-size: 11px;
  color: #52c41a;
  text-align: center;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.tabs {
  display: flex;
  gap: 2px;
  background: #f0f0f0;
  padding: 2px;
  border-radius: 6px;
}

.tab {
  flex: 1;
  padding: 8px;
  text-align: center;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.tab.active {
  background: white;
  color: #1890ff;
  font-weight: 500;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-section label {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.form-section input,
.form-section select,
.form-section textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
  font-family: inherit;
}

.form-section textarea {
  resize: vertical;
  line-height: 1.6;
}

.selector-inline {
  display: flex;
  gap: 8px;
  align-items: center;
}

.selector-prefix {
  color: #666;
  min-width: 24px;
}

.selector-inline select {
  width: 140px;
}

.selector-inline input {
  flex: 1;
}

.branch-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.branch-target {
  min-width: 140px;
  font-size: 12px;
  color: #666;
}

.branch-empty {
  font-size: 12px;
  color: #999;
}

.coming-soon-tip {
  padding: 10px 12px;
  border: 1px dashed #d9d9d9;
  border-radius: 4px;
  color: #666;
  background: #fafafa;
  font-size: 12px;
}

.add-btn {
  padding: 6px 12px;
  font-size: 12px;
  color: #1890ff;
  border-color: #1890ff;
  background: white;
}

.input-fields {
  display: flex;
  gap: 8px;
}

.field-name {
  flex: 1;
}

.field-type {
  width: 100px;
}

.field-value {
  flex: 2;
}

.exception-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.config-row span:first-child {
  min-width: 80px;
  color: #666;
}

.config-row input,
.config-row select {
  flex: 1;
}
/* 模板弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.template-card {
  padding: 20px;
  border: 2px solid #e8e8e8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
}

.template-card:hover {
  border-color: #1890ff;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.15);
  transform: translateY(-2px);
}

.template-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.template-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.template-source {
  font-size: 12px;
  color: #1890ff;
  margin-bottom: 8px;
}

.template-desc {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  margin-bottom: 10px;
}

.template-delete-btn {
  padding: 6px 12px;
  border: 1px solid #ff4d4f;
  border-radius: 4px;
  background: #fff;
  color: #ff4d4f;
  font-size: 12px;
}

.template-delete-btn:hover {
  background: #fff2f0;
}
</style>
