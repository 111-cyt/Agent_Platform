import { createRouter, createWebHistory } from 'vue-router'
import WorkflowView from '../views/WorkflowView.vue'
import KnowledgeView from '../views/KnowledgeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'workflow',
      component: WorkflowView
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: KnowledgeView
    }
  ]
})

export default router
