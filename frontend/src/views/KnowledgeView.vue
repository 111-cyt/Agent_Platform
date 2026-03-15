<template>
  <div class="knowledge-view">
    <div class="toolbar">
      <h2>知识库管理</h2>
      <div class="toolbar-actions">
        <button class="primary" @click="showUploadDialog = true">
          上传文档
        </button>
        <button @click="loadKnowledge">刷新列表</button>
      </div>
    </div>

    <div class="content">
      <div class="knowledge-list">
        <div class="list-header">
          <h3>文档列表</h3>
          <span class="count">共 {{ knowledgeItems.length }} 个文档</span>
        </div>

        <div class="list-items">
          <div
            v-for="item in knowledgeItems"
            :key="item.id"
            class="knowledge-item"
            :class="{ selected: selectedItem === item.id }"
            @click="selectItem(item.id)"
          >
            <div class="item-icon">📄</div>
            <div class="item-info">
              <div class="item-title">{{ item.title }}</div>
              <div class="item-meta">
                {{ item.chunks }} 个片段 · {{ formatDate(item.createdAt) }}
              </div>
            </div>
            <button
              class="delete-btn"
              @click.stop="deleteKnowledge(item.id)"
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <div class="knowledge-detail" v-if="selectedItem">
        <h3>文档详情</h3>
        <div class="detail-content">
          <div class="detail-field">
            <label>标题:</label>
            <div>{{ selectedItemData.title }}</div>
          </div>
          <div class="detail-field">
            <label>内容:</label>
            <div class="content-preview">{{ selectedItemData.content }}</div>
          </div>
          <div class="detail-field">
            <label>片段数:</label>
            <div>{{ selectedItemData.chunks }}</div>
          </div>
          <div class="detail-field">
            <label>创建时间:</label>
            <div>{{ formatDate(selectedItemData.createdAt) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showUploadDialog" class="dialog-overlay" @click="showUploadDialog = false">
      <div class="dialog" @click.stop>
        <h3>上传文档</h3>
        <div class="form-group">
          <label>文档标题:</label>
          <input v-model="uploadForm.title" placeholder="请输入文档标题" />
        </div>
        <div class="form-group">
          <label>文档内容:</label>
          <textarea
            v-model="uploadForm.content"
            rows="10"
            placeholder="请输入或粘贴文档内容"
          ></textarea>
        </div>
        <div class="form-group">
          <label>或上传文件:</label>
          <input type="file" @change="handleFileUpload" accept=".txt,.md" />
        </div>
        <div class="dialog-actions">
          <button @click="showUploadDialog = false">取消</button>
          <button class="primary" @click="uploadKnowledge">上传</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'

interface KnowledgeItem {
  id: string
  title: string
  content: string
  chunks: number
  createdAt: string
}

const knowledgeItems = ref<KnowledgeItem[]>([])
const selectedItem = ref<string | null>(null)
const showUploadDialog = ref(false)
const selectedFile = ref<File | null>(null)
const uploadForm = ref({
  title: '',
  content: ''
})

const selectedItemData = computed(() => {
  return knowledgeItems.value.find(item => item.id === selectedItem.value) || {
    title: '',
    content: '',
    chunks: 0,
    createdAt: ''
  }
})

function selectItem(id: string) {
  selectedItem.value = id
}

function formatDate(dateString: string) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN')
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    selectedFile.value = file
    const reader = new FileReader()
    reader.onload = (e) => {
      uploadForm.value.content = e.target?.result as string
      if (!uploadForm.value.title) {
        uploadForm.value.title = file.name
      }
    }
    reader.readAsText(file)
  }
}

async function uploadKnowledge() {
  try {
    if (selectedFile.value) {
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      if (uploadForm.value.title) {
        formData.append('title', uploadForm.value.title)
      }
      await api.post('/knowledge/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    } else {
      if (!uploadForm.value.title || !uploadForm.value.content) {
        alert('请填写标题和内容，或选择文件上传')
        return
      }
      await api.post('/knowledge', uploadForm.value)
    }

    alert('上传成功！')
    showUploadDialog.value = false
    uploadForm.value = { title: '', content: '' }
    selectedFile.value = null
    await loadKnowledge()
  } catch (error: any) {
    alert('上传失败：' + (error.response?.data?.error || error.message || '未知错误'))
  }
}

async function loadKnowledge() {
  try {
    const response = await api.get('/knowledge')
    knowledgeItems.value = response.data
  } catch (error) {
    console.error('加载失败：', error)
  }
}

async function deleteKnowledge(id: string) {
  if (!confirm('确定要删除这个文档吗？')) return

  try {
    await api.delete(`/knowledge/${id}`)
    alert('删除成功！')
    if (selectedItem.value === id) {
      selectedItem.value = null
    }
    await loadKnowledge()
  } catch (error) {
    alert('删除失败：' + error)
  }
}

onMounted(() => {
  loadKnowledge()
})
</script>

<style scoped>
.knowledge-view {
  height: 100%;
  display: flex;
  flex-direction: column;
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
}

button {
  padding: 8px 16px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
}

button.primary {
  background: #1890ff;
  color: white;
  border-color: #1890ff;
}

button:hover {
  opacity: 0.8;
}

.content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.knowledge-list {
  width: 350px;
  background: white;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
}

.list-header {
  padding: 20px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.list-header h3 {
  margin: 0;
  font-size: 16px;
}

.count {
  font-size: 13px;
  color: #999;
}

.list-items {
  flex: 1;
  overflow-y: auto;
}

.knowledge-item {
  padding: 15px 20px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background 0.2s;
}

.knowledge-item:hover {
  background: #fafafa;
}

.knowledge-item.selected {
  background: #e6f7ff;
  border-left: 3px solid #1890ff;
}

.item-icon {
  font-size: 24px;
}

.item-info {
  flex: 1;
}

.item-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.item-meta {
  font-size: 12px;
  color: #999;
}

.delete-btn {
  padding: 4px 12px;
  font-size: 12px;
  color: #ff4d4f;
  border-color: #ff4d4f;
}

.knowledge-detail {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: #fafafa;
}

.knowledge-detail h3 {
  margin: 0 0 20px 0;
  font-size: 16px;
}

.detail-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
}

.detail-field {
  margin-bottom: 20px;
}

.detail-field label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  font-weight: 500;
}

.detail-field > div {
  font-size: 14px;
  color: #333;
}

.content-preview {
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  line-height: 1.6;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 500px;
  max-width: 90%;
}

.dialog h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  color: #666;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-group input[type="file"] {
  padding: 4px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}
</style>
