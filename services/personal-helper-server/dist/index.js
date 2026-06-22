import express from 'express';
import healthRouter from './routes/health.js';
import notesRouter from './routes/notes.js';
import todosRouter from './routes/todos.js';
import stocksRouter from './routes/stocks.js';
/* ─── Auth ─── */
function getToken() {
    const envToken = process.env.API_TOKEN;
    if (envToken)
        return envToken;
    // Auto-generate if not set
    const gen = 'helper-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    console.log(`🔑 API_TOKEN 未设置，已自动生成: ${gen}`);
    console.log(`   请在 VSCode 插件配置中设置此 Token`);
    return gen;
}
const API_TOKEN = getToken();
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== API_TOKEN) {
        res.status(401).json({ error: 'Unauthorized', detail: '需要有效的 API Token (Authorization: Bearer <token>)' });
        return;
    }
    next();
}
export function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/health', healthRouter);
    app.use('/api/notes', authMiddleware, notesRouter);
    app.use('/api/todos', authMiddleware, todosRouter);
    app.use('/api/stocks', authMiddleware, stocksRouter);
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
        console.log(`   📈 股票数据:   http://localhost:${PORT}/api/stocks/overview`);
    });
}
