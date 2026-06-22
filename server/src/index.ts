import express from 'express';
import healthRouter from './routes/health.js';
import notesRouter from './routes/notes.js';
import todosRouter from './routes/todos.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/notes', notesRouter);
app.use('/api/todos', todosRouter);

// Start
app.listen(PORT, () => {
  console.log(`✅ personal-helper-server 已启动 :${PORT}`);
  console.log(`   📝 笔记 API:   http://localhost:${PORT}/api/notes`);
  console.log(`   ✅ Todo  API:  http://localhost:${PORT}/api/todos`);
  console.log(`   ❤️  健康检查:  http://localhost:${PORT}/api/health`);
});
