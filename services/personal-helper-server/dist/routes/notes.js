import { Router } from 'express';
import { load, save, genId } from '../store.js';
const router = Router();
router.get('/', (_req, res) => {
    res.json(load().notes);
});
router.get('/:id', (req, res) => {
    const data = load();
    const note = data.notes.find(n => n.id === req.params.id);
    if (!note) {
        res.status(404).json({ error: '笔记不存在' });
        return;
    }
    res.json(note);
});
router.post('/', (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) {
        res.status(400).json({ error: '缺少必填字段 title 或 content' });
        return;
    }
    const data = load();
    const now = new Date().toISOString();
    const note = { id: genId(), title, content, created_at: now, updated_at: now };
    data.notes.unshift(note);
    save(data);
    res.status(201).json(note);
});
router.put('/:id', (req, res) => {
    const { title, content } = req.body;
    const data = load();
    const idx = data.notes.findIndex(n => n.id === req.params.id);
    if (idx === -1) {
        res.status(404).json({ error: '笔记不存在' });
        return;
    }
    if (title !== undefined)
        data.notes[idx].title = title;
    if (content !== undefined)
        data.notes[idx].content = content;
    data.notes[idx].updated_at = new Date().toISOString();
    save(data);
    res.json(data.notes[idx]);
});
router.delete('/:id', (req, res) => {
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
