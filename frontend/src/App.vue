<template>
  <div id="app">
    <nav class="navbar">
      <div class="nav-brand">Agent Platform</div>
      <div class="nav-links">
        <router-link to="/">工作流</router-link>
        <router-link to="/knowledge">知识库</router-link>
      </div>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.navbar {
  background: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  padding: 0 20px;
  display: flex;
  align-items: center;
  height: 60px;
}

.nav-brand {
  font-size: 20px;
  font-weight: bold;
  color: #1890ff;
  margin-right: 40px;
}

.nav-links {
  display: flex;
  gap: 30px;
}

.nav-links a {
  text-decoration: none;
  color: #666;
  font-size: 16px;
  transition: color 0.3s;
}

.nav-links a:hover,
.nav-links a.router-link-active {
  color: #1890ff;
}

.main-content {
  height: calc(100vh - 60px);
  overflow: auto;
}
</style>
