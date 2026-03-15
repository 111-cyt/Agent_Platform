import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000
})

// Workflow API
export const workflowAPI = {
  getAll: () => api.get('/workflow'),
  getById: (id: string) => api.get(`/workflow/${id}`),
  create: (data: any) => api.post('/workflow', data),
  update: (id: string, data: any) => api.put(`/workflow/${id}`, data),
  delete: (id: string) => api.delete(`/workflow/${id}`),
  execute: (id: string, input: any, sessionId?: string) =>
    api.post(`/workflow/${id}/execute`, { input, sessionId }),
  getLogs: (id: string, limit?: number) =>
    api.get(`/workflow/${id}/logs`, { params: { limit } })
}

// Knowledge API
export const knowledgeAPI = {
  getAll: () => api.get('/knowledge'),
  getById: (id: string) => api.get(`/knowledge/${id}`),
  create: (title: string, content: string) =>
    api.post('/knowledge', { title, content }),
  upload: (file: File, title?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    return api.post('/knowledge/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  delete: (id: string) => api.delete(`/knowledge/${id}`),
  search: (query: string, topK?: number) =>
    api.post('/knowledge/search', { query, topK })
}

// Agent API
export const agentAPI = {
  getSessions: () => api.get('/agent/sessions'),
  createSession: (workflowId?: string) =>
    api.post('/agent/sessions', { workflowId }),
  getSession: (id: string) => api.get(`/agent/sessions/${id}`),
  deleteSession: (id: string) => api.delete(`/agent/sessions/${id}`),
  getMessages: (sessionId: string) =>
    api.get(`/agent/sessions/${sessionId}/messages`),
  chat: (sessionId: string, message: string, useRAG: boolean = true) =>
    api.post('/agent/chat', { sessionId, message, useRAG })
}

export { api }
export default api
