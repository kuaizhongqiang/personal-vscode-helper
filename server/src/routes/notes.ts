import { Router, Request, Response } from 'express';
import { load, save, genId, Note } from '../store.js';

const router = Router();

/* GET /api/notes */
router.get('/', (_req: Request, res: Response) => {
  const data = load();
  res.json(data.notes);
});

/* GET /api/notes/:id */
router.get('/:id', (req: Request, res: Response) => {
  const data = load();
  const note = data.notes.find(n => n.id === req.params.id);
  if (!note) {
    res.status(404).json({ error: '笔记不存在' });
    return;
  }
  res.json(note);
});

/* POST /api/notes */
router.post('/', (req: Request, res: Response) => {
  const { title, content } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: '缺少必填字段 title 或 content' });
    return;
  }
  const data = load();
  const now = new Date().toISOString();
  const note: Note = {
    id: genId(),
    title,
    content,
    created_at: now,
    updated_at: now,
  };
  data.notes.unshift(note);
  save(data);
  res.status(201).json(note);
});

/* PUT /api/notes/:id */
router.put('/:id', (req: Request, res: Response) => {
  const { title, content } = req.body;
  const data = load();
  const idx = data.notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: '笔记不存在' });
    return;
  }
  if (title !== undefined) data.notes[idx].title = title;
  if (content !== undefined) data.notes[idx].content = content;
  data.notes[idx].updated_at = new Date().toISOString();
  save(data);
  res.json(data.notes[idx]);
});

/* DELETE /api/notes/:id */
router.delete('/:id', (req: Request, res: Response) => {
  const data = load();
  const idx = data.notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: '笔记不存在' });
    return;
  }
  data.notes.splice(idx, 1);
  save(data);
  res.status(204).send();
});

export default router;
