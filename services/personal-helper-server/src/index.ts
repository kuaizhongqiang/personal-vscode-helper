import express from 'express';
import healthRouter from './routes/health.js';
import notesRouter from './routes/notes.js';
import todosRouter from './routes/todos.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/health', healthRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/todos', todosRouter);
  return app;
}

// Only start when executed directly (not when imported by CLI)
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('src/index.ts');
if (isDirectRun) {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`✅ personal-helper-server 已启动 :${PORT}`);
    console.log(`   📝 笔记 API:   http://localhost:${PORT}/api/notes`);
    console.log(`   ✅ Todo  API:  http://localhost:${PORT}/api/todos`);
    console.log(`   ❤️  健康检查:  http://localhost:${PORT}/api/health`);
  });
}
