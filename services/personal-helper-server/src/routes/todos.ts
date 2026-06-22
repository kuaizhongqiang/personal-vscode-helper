import { Router, Request, Response } from 'express';
import { load, save, genId, TodoItem } from '../store.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  let todos = load().todos;
  if (req.query.group && req.query.group !== '全部') {
    todos = todos.filter(t => t.group === req.query.group);
  }
  if (req.query.done !== undefined) {
    todos = todos.filter(t => t.done === (req.query.done === 'true'));
  }
  res.json(todos);
});

router.get('/groups', (_req: Request, res: Response) => {
  res.json(load().groups);
});

router.post('/', (req: Request, res: Response) => {
  const { content, group } = req.body;
  if (!content || !group) {
    res.status(400).json({ error: '缺少必填字段 content 或 group' });
    return;
  }
  const data = load();
  if (!data.groups.includes(group)) data.groups.push(group);
  const now = new Date().toISOString();
  const todo: TodoItem = { id: genId(), content, group, done: false, created_at: now, done_at: null };
  data.todos.unshift(todo);
  save(data);
  res.status(201).json(todo);
});

router.patch('/:id', (req: Request, res: Response) => {
  const data = load();
  const idx = data.todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: '待办不存在' }); return; }
  const now = new Date().toISOString();
  if (req.body.done !== undefined) {
    data.todos[idx].done = req.body.done;
    data.todos[idx].done_at = req.body.done ? now : null;
  }
  if (req.body.content !== undefined) data.todos[idx].content = req.body.content;
  if (req.body.group !== undefined) data.todos[idx].group = req.body.group;
  save(data);
  res.json(data.todos[idx]);
});

router.delete('/:id', (req: Request, res: Response) => {
  const data = load();
  const idx = data.todos.findIndex(t => t.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: '待办不存在' }); return; }
  data.todos.splice(idx, 1);
  save(data);
  res.status(204).send();
});

export default router;
