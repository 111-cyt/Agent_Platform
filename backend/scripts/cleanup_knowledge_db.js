const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'coze_platform',
    connectionTimeoutMillis: 10000,
  });
  await client.connect();

  try {
    const res = await client.query('SELECT id, title, created_at FROM knowledge_base ORDER BY created_at DESC');
    const items = Array.isArray(res.rows) ? res.rows : [];

    if (items.length === 0) {
      const summary = { message: '知识库已为空', kept: null, deletedCount: 0, remainingCount: 0 };
      fs.writeFileSync(path.resolve(__dirname, '../data/cleanup_summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
      console.log(JSON.stringify(summary));
      return;
    }

    const personal = items.filter((item) => item.title === '个人信息');
    const keep = personal.length > 0 ? personal[0] : items[0];

    const idsToDelete = items.filter((item) => item.id !== keep.id).map((item) => item.id);

    if (idsToDelete.length > 0) {
      const placeholders = idsToDelete.map((_, i) => `$${i + 1}`).join(',');
      await client.query(`DELETE FROM knowledge_base WHERE id IN (${placeholders})`, idsToDelete);
    }

    const remainingRes = await client.query('SELECT id, title, created_at FROM knowledge_base ORDER BY created_at DESC');

    const summary = {
      kept: keep,
      deletedCount: idsToDelete.length,
      remainingCount: Array.isArray(remainingRes.rows) ? remainingRes.rows.length : 0,
      remaining: remainingRes.rows,
    };

    fs.mkdirSync(path.resolve(__dirname, '../data'), { recursive: true });
    fs.writeFileSync(path.resolve(__dirname, '../data/cleanup_summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    console.log(JSON.stringify(summary));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const summary = { error: String(error && error.message ? error.message : error) };
  fs.mkdirSync(path.resolve(__dirname, '../data'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '../data/cleanup_summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.error(summary.error);
  process.exit(1);
});
