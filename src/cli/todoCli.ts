import * as vscode from 'vscode';
import { TodoStore } from '../store/todoStore';

let outputChannel: vscode.OutputChannel;

function getOutput(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('个人工作台 - Todo');
  }
  return outputChannel;
}

export function registerTodoCommands(context: vscode.ExtensionContext): void {
  const store = TodoStore.getInstance();

  // personal-vscode-helper.todo.list
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.todo.list',
      async (args?: { group?: string }) => {
        const group = args?.group;
        const todos = store.list(group);
        const out = getOutput();
        out.clear();
        if (todos.length === 0) {
          out.appendLine('(暂无待办)');
        } else {
          // Group by
          const grouped: Record<string, typeof todos> = {};
          for (const t of todos) {
            if (!grouped[t.group]) grouped[t.group] = [];
            grouped[t.group].push(t);
          }
          for (const [g, items] of Object.entries(grouped)) {
            out.appendLine(`── ${g} ──`);
            for (const t of items) {
              const status = t.done ? '☑' : '☐';
              out.appendLine(`  ${status} ${t.content}  [${t.id.slice(0, 8)}]`);
            }
            out.appendLine('');
          }
          out.appendLine(`共 ${todos.length} 项`);
        }
        out.show();
        return todos;
      },
    ),
  );

  // personal-vscode-helper.todo.create
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.todo.create',
      async (args?: { content?: string; group?: string }) => {
        // Agent 路径
        if (args?.content && args?.group) {
          const todo = store.create(args.content, args.group);
          vscode.window.showInformationMessage(`待办已创建: ${todo.id.slice(0, 8)}`);
          return todo;
        }

        // 用户路径
        const groups = store.listGroups();
        const groupPicked = await vscode.window.showQuickPick(
          [...groups, '+ 新建分组'],
          { placeHolder: '选择分组' },
        );
        if (!groupPicked) return;

        let group = groupPicked;
        if (groupPicked === '+ 新建分组') {
          const name = await vscode.window.showInputBox({
            prompt: '新分组名称',
            placeHolder: '输入分组名称',
            ignoreFocusOut: true,
          });
          if (!name) return;
          store.createGroup(name);
          group = name;
        }

        const content = await vscode.window.showInputBox({
          prompt: '待办内容',
          placeHolder: '输入待办内容',
          ignoreFocusOut: true,
        });
        if (!content) return;

        const todo = store.create(content!, group);
        vscode.window.showInformationMessage('待办已创建');
        return todo;
      },
    ),
  );

  // personal-vscode-helper.todo.check
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.todo.check',
      async (args?: { id?: string }) => {
        // Agent 路径
        if (args?.id) {
          const todo = store.check(args.id);
          vscode.window.showInformationMessage(`已标记完成: ${args.id.slice(0, 8)}`);
          return todo;
        }

        // 用户路径
        const todos = store.list().filter(t => !t.done);
        if (todos.length === 0) {
          vscode.window.showInformationMessage('没有未完成的待办');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          todos.map(t => ({
            label: `☐ [${t.group}] ${t.content}`,
            id: t.id,
          })),
          { placeHolder: '选择要标记完成的待办' },
        );
        if (!picked) return;
        store.check(picked.id);
        vscode.window.showInformationMessage('已标记完成');
        return { checked: true, id: picked.id };
      },
    ),
  );

  // personal-vscode-helper.todo.uncheck
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.todo.uncheck',
      async (args?: { id?: string }) => {
        // Agent 路径
        if (args?.id) {
          const todo = store.uncheck(args.id);
          vscode.window.showInformationMessage(`已标记未完成: ${args.id.slice(0, 8)}`);
          return todo;
        }

        // 用户路径
        const todos = store.list().filter(t => t.done);
        if (todos.length === 0) {
          vscode.window.showInformationMessage('没有已完成的待办');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          todos.map(t => ({
            label: `☑ [${t.group}] ${t.content}`,
            id: t.id,
          })),
          { placeHolder: '选择要取消完成的待办' },
        );
        if (!picked) return;
        store.uncheck(picked.id);
        vscode.window.showInformationMessage('已标记未完成');
        return { unchecked: true, id: picked.id };
      },
    ),
  );

  // personal-vscode-helper.todo.delete
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.todo.delete',
      async (args?: { id?: string }) => {
        // Agent 路径
        if (args?.id) {
          store.delete(args.id);
          vscode.window.showInformationMessage(`待办已删除: ${args.id.slice(0, 8)}`);
          return { deleted: true, id: args.id };
        }

        // 用户路径
        const todos = store.list();
        if (todos.length === 0) {
          vscode.window.showInformationMessage('暂无待办');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          todos.map(t => ({
            label: `${t.done ? '☑' : '☐'} [${t.group}] ${t.content}`,
            id: t.id,
          })),
          { placeHolder: '选择要删除的待办' },
        );
        if (!picked) return;

        const confirm = await vscode.window.showWarningMessage(
          `确定删除这条待办吗？`,
          { modal: true },
          '删除',
        );
        if (confirm !== '删除') return;

        store.delete(picked.id);
        vscode.window.showInformationMessage('待办已删除');
        return { deleted: true, id: picked.id };
      },
    ),
  );

  // personal-vscode-helper.todo.listGroups
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.todo.listGroups',
      async () => {
        const groups = store.listGroups();
        const out = getOutput();
        out.clear();
        for (const g of groups) {
          const count = store.list(g).length;
          out.appendLine(`  ${g} (${count})`);
        }
        out.show();
        return groups;
      },
    ),
  );

  // personal-vscode-helper.todo.clearCompleted
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'personal-vscode-helper.todo.clearCompleted',
      async () => {
        const count = store.clearCompleted();
        vscode.window.showInformationMessage(`已清理 ${count} 条完成的待办`);
        return { cleared: count };
      },
    ),
  );
}
