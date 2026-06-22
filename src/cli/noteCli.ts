import * as vscode from 'vscode';
import { NoteStore } from '../store/noteStore';

let outputChannel: vscode.OutputChannel;

function getOutput(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('个人工作台 - 笔记');
  }
  return outputChannel;
}

export function registerNoteCommands(context: vscode.ExtensionContext): void {
  const store = NoteStore.getInstance();

  // personal-vscode-helper.note.list
  context.subscriptions.push(
    vscode.commands.registerCommand('personal-vscode-helper.note.list', async () => {
      const notes = store.list();
      const out = getOutput();
      out.clear();
      if (notes.length === 0) {
        out.appendLine('(暂无笔记)');
      } else {
        for (const n of notes) {
          out.appendLine(`[${n.id.slice(0, 8)}] ${n.title}  ${new Date(n.updatedAt).toLocaleString()}`);
        }
      }
      out.show();
      return notes;
    }),
  );

  // personal-vscode-helper.note.create
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.note.create',
      async (args?: { title?: string; content?: string }) => {
        // Agent 路径：有参直接创建
        if (args?.title !== undefined && args?.content !== undefined) {
          const note = store.create(args.title, args.content);
          vscode.window.showInformationMessage(`笔记已创建: ${note.id.slice(0, 8)}`);
          return note;
        }

        // 用户路径：弹窗引导
        const title = await vscode.window.showInputBox({
          prompt: '笔记标题',
          placeHolder: '输入笔记标题',
          ignoreFocusOut: true,
        });
        if (!title) return;

        const content = await vscode.window.showInputBox({
          prompt: '笔记内容',
          placeHolder: '输入笔记内容',
          ignoreFocusOut: true,
        });
        if (!content) return;

        const note = store.create(title, content);
        vscode.window.showInformationMessage(`笔记已创建: ${note.id.slice(0, 8)}`);
        return note;
      },
    ),
  );

  // personal-vscode-helper.note.get
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.note.get',
      async (args?: { id?: string }) => {
        // Agent 路径
        if (args?.id) {
          const note = store.get(args.id);
          if (!note) {
            throw new Error(`笔记不存在: ${args.id}`);
          }
          // 在新文档中打开
          const doc = await vscode.workspace.openTextDocument({
            content: `# ${note.title}\n\n${note.content}\n\n---\n创建: ${new Date(note.createdAt).toLocaleString()}\n修改: ${new Date(note.updatedAt).toLocaleString()}`,
            language: 'markdown',
          });
          await vscode.window.showTextDocument(doc);
          return note;
        }

        // 用户路径：QuickPick 选择
        const notes = store.list();
        if (notes.length === 0) {
          vscode.window.showInformationMessage('暂无笔记');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          notes.map(n => ({
            label: n.title,
            description: `${n.id.slice(0, 8)} — ${new Date(n.updatedAt).toLocaleString()}`,
            id: n.id,
          })),
          { placeHolder: '选择要查看的笔记' },
        );
        if (!picked) return;

        const note = store.get(picked.id);
        if (note) {
          const doc = await vscode.workspace.openTextDocument({
            content: `# ${note.title}\n\n${note.content}\n\n---\n创建: ${new Date(note.createdAt).toLocaleString()}\n修改: ${new Date(note.updatedAt).toLocaleString()}`,
            language: 'markdown',
          });
          await vscode.window.showTextDocument(doc);
          return note;
        }
      },
    ),
  );

  // personal-vscode-helper.note.update
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.note.update',
      async (args?: { id?: string; title?: string; content?: string }) => {
        // Agent 路径
        if (args?.id) {
          const existing = store.get(args.id);
          if (!existing) throw new Error(`笔记不存在: ${args.id}`);
          const title = args.title ?? existing.title;
          const content = args.content ?? existing.content;
          const updated = store.update(args.id, title, content);
          vscode.window.showInformationMessage(`笔记已更新: ${args.id.slice(0, 8)}`);
          return updated;
        }

        // 用户路径
        const notes = store.list();
        if (notes.length === 0) {
          vscode.window.showInformationMessage('暂无笔记');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          notes.map(n => ({ label: n.title, description: n.id.slice(0, 8), id: n.id })),
          { placeHolder: '选择要更新的笔记' },
        );
        if (!picked) return;

        const existing = store.get(picked.id);
        if (!existing) return;

        const title = await vscode.window.showInputBox({
          prompt: '新标题',
          value: existing.title,
          ignoreFocusOut: true,
        });
        if (title === undefined) return;

        const content = await vscode.window.showInputBox({
          prompt: '新内容',
          value: existing.content,
          ignoreFocusOut: true,
        });
        if (content === undefined) return;

        const updated = store.update(picked.id, title, content);
        vscode.window.showInformationMessage('笔记已更新');
        return updated;
      },
    ),
  );

  // personal-vscode-helper.note.delete
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.note.delete',
      async (args?: { id?: string }) => {
        // Agent 路径
        if (args?.id) {
          store.delete(args.id);
          vscode.window.showInformationMessage(`笔记已删除: ${args.id.slice(0, 8)}`);
          return { deleted: true, id: args.id };
        }

        // 用户路径
        const notes = store.list();
        if (notes.length === 0) {
          vscode.window.showInformationMessage('暂无笔记');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          notes.map(n => ({ label: n.title, description: n.id.slice(0, 8), id: n.id })),
          { placeHolder: '选择要删除的笔记' },
        );
        if (!picked) return;

        const confirm = await vscode.window.showWarningMessage(
          `确定删除「${picked.label}」吗？`,
          { modal: true },
          '删除',
        );
        if (confirm !== '删除') return;

        store.delete(picked.id);
        vscode.window.showInformationMessage('笔记已删除');
        return { deleted: true, id: picked.id };
      },
    ),
  );

  // personal-vscode-helper.note.search
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.note.search',
      async (args?: { keyword?: string }) => {
        let keyword = args?.keyword;

        // 用户路径：无 keyword 时弹输入框
        if (!keyword) {
          keyword = await vscode.window.showInputBox({
            prompt: '搜索关键词',
            placeHolder: '输入关键词搜索笔记标题和内容',
            ignoreFocusOut: true,
          });
          if (!keyword) return;
        }

        const results = store.search(keyword);
        const out = getOutput();
        out.clear();
        if (results.length === 0) {
          out.appendLine(`(无匹配结果: ${keyword})`);
        } else {
          out.appendLine(`搜索 "${keyword}" 结果 (${results.length}):`);
          out.appendLine('');
          for (const n of results) {
            out.appendLine(`[${n.id.slice(0, 8)}] ${n.title}  ${new Date(n.updatedAt).toLocaleString()}`);
          }
        }
        out.show();
        return results;
      },
    ),
  );
}
