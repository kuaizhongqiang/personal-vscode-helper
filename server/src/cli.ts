#!/usr/bin/env node
import { Command } from 'commander';
import { load, save, genId, Note, TodoItem } from './store.js';

const program = new Command();

/* ─── root ─── */
program.name('phelper').description('个人助手服务 CLI').version('0.1.0');

/* ─── note ─── */
const noteCmd = program.command('note').description('管理笔记');

noteCmd
  .command('create')
  .description('创建笔记')
  .argument('<title>', '笔记标题')
  .argument('<content>', '笔记内容')
  .action((title: string, content: string) => {
    const data = load();
    const now = new Date().toISOString();
    const note: Note = {
      id: genId(), title, content,
      created_at: now, updated_at: now,
    };
    data.notes.unshift(note);
    save(data);
    console.log(`✅ 笔记已创建: ${note.id}`);
    console.log(JSON.stringify(note, null, 2));
  });

noteCmd
  .command('list')
  .description('列出所有笔记')
  .action(() => {
    const data = load();
    if (data.notes.length === 0) {
      console.log('(暂无笔记)');
      return;
    }
    for (const n of data.notes) {
      console.log(`[${n.id.slice(0, 8)}] ${n.title}  ${new Date(n.updated_at).toLocaleString()}`);
    }
  });

noteCmd
  .command('read')
  .description('查看笔记详情')
  .argument('<id>', '笔记 ID')
  .action((id: string) => {
    const data = load();
    const note = data.notes.find(n => n.id === id);
    if (!note) { console.error('❌ 笔记不存在'); process.exit(1); }
    console.log(JSON.stringify(note, null, 2));
  });

noteCmd
  .command('update')
  .description('更新笔记')
  .argument('<id>', '笔记 ID')
  .option('--title <title>', '新标题')
  .option('--content <content>', '新内容')
  .action((id: string, options: { title?: string; content?: string }) => {
    const data = load();
    const idx = data.notes.findIndex(n => n.id === id);
    if (idx === -1) { console.error('❌ 笔记不存在'); process.exit(1); }
    if (options.title !== undefined) data.notes[idx].title = options.title;
    if (options.content !== undefined) data.notes[idx].content = options.content;
    data.notes[idx].updated_at = new Date().toISOString();
    save(data);
    console.log(`✅ 笔记已更新: ${id}`);
    console.log(JSON.stringify(data.notes[idx], null, 2));
  });

noteCmd
  .command('delete')
  .description('删除笔记')
  .argument('<id>', '笔记 ID')
  .action((id: string) => {
    const data = load();
    const idx = data.notes.findIndex(n => n.id === id);
    if (idx === -1) { console.error('❌ 笔记不存在'); process.exit(1); }
    data.notes.splice(idx, 1);
    save(data);
    console.log(`✅ 笔记已删除: ${id}`);
  });

noteCmd
  .command('search')
  .description('搜索笔记标题和内容')
  .argument('<keyword>', '关键词')
  .action((keyword: string) => {
    const data = load();
    const kw = keyword.toLowerCase();
    const results = data.notes.filter(n =>
      n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw)
    );
    if (results.length === 0) {
      console.log('(无匹配笔记)');
      return;
    }
    for (const n of results) {
      console.log(`[${n.id.slice(0, 8)}] ${n.title}  ${new Date(n.updated_at).toLocaleString()}`);
    }
  });

/* ─── todo ─── */
const todoCmd = program.command('todo').description('管理待办');

todoCmd
  .command('create')
  .description('创建待办')
  .argument('<group>', '分组')
  .argument('<content>', '待办内容')
  .action((group: string, content: string) => {
    const data = load();
    if (!data.groups.includes(group)) data.groups.push(group);
    const now = new Date().toISOString();
    const todo: TodoItem = {
      id: genId(), content, group,
      done: false, created_at: now, done_at: null,
    };
    data.todos.unshift(todo);
    save(data);
    console.log(`✅ 待办已创建: ${todo.id}`);
    console.log(JSON.stringify(todo, null, 2));
  });

todoCmd
  .command('list')
  .description('列出待办')
  .option('--group <group>', '按分组筛选')
  .action((options: { group?: string }) => {
    const data = load();
    let todos = data.todos;
    if (options.group) {
      todos = todos.filter(t => t.group === options.group);
    }
    if (todos.length === 0) {
      console.log('(暂无待办)');
      return;
    }
    for (const t of todos) {
      const status = t.done ? '☑' : '☐';
      console.log(`${status} [${t.group}] ${t.content}  ${t.id.slice(0, 8)}`);
    }
  });

todoCmd
  .command('check')
  .description('标记完成')
  .argument('<id>', '待办 ID')
  .action((id: string) => {
    const data = load();
    const todo = data.todos.find(t => t.id === id);
    if (!todo) { console.error('❌ 待办不存在'); process.exit(1); }
    todo.done = true;
    todo.done_at = new Date().toISOString();
    save(data);
    console.log(`✅ 已标记完成: ${id}`);
  });

todoCmd
  .command('uncheck')
  .description('标记未完成')
  .argument('<id>', '待办 ID')
  .action((id: string) => {
    const data = load();
    const todo = data.todos.find(t => t.id === id);
    if (!todo) { console.error('❌ 待办不存在'); process.exit(1); }
    todo.done = false;
    todo.done_at = null;
    save(data);
    console.log(`✅ 已标记未完成: ${id}`);
  });

todoCmd
  .command('delete')
  .description('删除待办')
  .argument('<id>', '待办 ID')
  .action((id: string) => {
    const data = load();
    const idx = data.todos.findIndex(t => t.id === id);
    if (idx === -1) { console.error('❌ 待办不存在'); process.exit(1); }
    data.todos.splice(idx, 1);
    save(data);
    console.log(`✅ 待办已删除: ${id}`);
  });

todoCmd
  .command('list-groups')
  .description('列出所有分组')
  .action(() => {
    const data = load();
    for (const g of data.groups) {
      console.log(`  - ${g}`);
    }
  });

/* ─── parse ─── */
program.parse(process.argv);
