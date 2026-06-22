import * as vscode from 'vscode';

/* ─── M7-1: 项目仪表盘 ─── */

let dashboardItem: vscode.StatusBarItem | null = null;

export function createDashboardItem(): vscode.StatusBarItem {
  if (!dashboardItem) {
    dashboardItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      90,
    );
    dashboardItem.command = 'personal-vscode-helper.openDashboard';
    dashboardItem.show();
  }
  return dashboardItem;
}

export async function updateDashboard(): Promise<void> {
  const item = createDashboardItem();
  try {
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt || !gitExt.isActive) {
      item.text = '$(git-branch) --';
      item.tooltip = 'Git 扩展未激活';
      return;
    }
    const gitApi = gitExt.exports.getAPI(1);
    const repo = gitApi.repositories[0];
    if (!repo) {
      item.text = '$(git-branch) 无仓库';
      item.tooltip = '未检测到 Git 仓库';
      return;
    }

    const branch = repo.state.HEAD?.name || repo.state.HEAD?.commit || 'detached';
    const changes = repo.state.workingTreeChanges.length;
    item.text = `$(git-branch) ${branch} Δ${changes}`;

    // Hover: recent commits
    const commits = await repo.log({ maxEntries: 3 });
    const tooltip = commits.map((c: { authorName: string; message: string; authorDate: Date }) =>
      `${c.authorName}  ${c.message}  ${new Date(c.authorDate).toLocaleDateString()}`
    ).join('\n');
    item.tooltip = tooltip || '暂无提交记录';
    item.backgroundColor = changes > 0
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  } catch {
    item.text = '$(git-branch) --';
    item.tooltip = '无法获取 Git 状态';
  }
}

/* ─── M7-2: 工作计时统计 ─── */

interface TimeRecord {
  date: string;
  project: string;
  duration: number; // seconds
}

const THROTTLE_MS = 10_000;
const SAVE_INTERVAL = 60_000;
const IDLE_TIMEOUT = 5 * 60_000; // 5 min idle = pause

let lastActivity = 0;
let sessionStart = Date.now();
let activeProject = '';
let timerItem: vscode.StatusBarItem | null = null;

const TIMER_KEY = 'personal-helper.timeRecords';

function loadRecords(context: vscode.ExtensionContext): TimeRecord[] {
  return context.globalState.get<TimeRecord[]>(TIMER_KEY, []);
}

function saveRecords(context: vscode.ExtensionContext, records: TimeRecord[]): void {
  context.globalState.update(TIMER_KEY, records);
}

export function initTimer(context: vscode.ExtensionContext): void {
  timerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
  timerItem.command = 'personal-vscode-helper.showTimerStats';
  timerItem.show();

  // Track active project
  if (vscode.workspace.workspaceFolders?.length) {
    activeProject = vscode.workspace.workspaceFolders[0].uri.fsPath;
  }

  // Listen to editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      checkProjectChange();
    }),
  );

  // Listen to selection changes (throttled)
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      const now = Date.now();
      if (now - lastActivity < THROTTLE_MS) return;
      lastActivity = now;
      updateDuration(context);
    }),
  );

  // Periodic save
  setInterval(() => {
    updateDuration(context);
  }, SAVE_INTERVAL);

  // Initial display
  updateTimerDisplay(context);
}

function checkProjectChange(): void {
  if (vscode.workspace.workspaceFolders?.length) {
    const newProject = vscode.workspace.workspaceFolders[0].uri.fsPath;
    if (newProject !== activeProject) {
      // Save current session and reset
      activeProject = newProject;
      sessionStart = Date.now();
    }
  }
}

function updateDuration(context: vscode.ExtensionContext): void {
  const now = Date.now();
  // Check idle
  if (now - lastActivity > IDLE_TIMEOUT) {
    sessionStart = now; // Reset if idle too long
    return;
  }

  const elapsed = Math.floor((now - sessionStart) / 1000);
  if (elapsed < 30) return; // Don't record tiny sessions

  const today = new Date().toISOString().slice(0, 10);
  const records = loadRecords(context);
  const existing = records.find(r => r.date === today && r.project === activeProject);

  if (existing) {
    // Only update if elapsed is greater than what we had
    const currentDuration = Math.floor((now - Date.now() + sessionStart) / 1000);
    existing.duration = Math.max(existing.duration, currentDuration);
  } else {
    records.push({
      date: today,
      project: activeProject,
      duration: Math.floor((now - sessionStart) / 1000),
    });
  }
  saveRecords(context, records);
  updateTimerDisplay(context);
}

function updateTimerDisplay(context: vscode.ExtensionContext): void {
  const today = new Date().toISOString().slice(0, 10);
  const records = loadRecords(context);
  const todayTotal = records
    .filter(r => r.date === today)
    .reduce((sum, r) => sum + r.duration, 0);

  const hours = Math.floor(todayTotal / 3600);
  const mins = Math.floor((todayTotal % 3600) / 60);
  timerItem!.text = `$(watch) 今天 ${hours}h${mins}m`;

  // Tooltip: breakdown by project
  const todayByProject = records.filter(r => r.date === today);
  timerItem!.tooltip = todayByProject
    .map(r => {
      const h = Math.floor(r.duration / 3600);
      const m = Math.floor((r.duration % 3600) / 60);
      return `${r.project.split(/[/\\]/).pop()}: ${h}h${m}m`;
    })
    .join('\n') || '暂无计时数据';
}

export function showTimerStats(context: vscode.ExtensionContext): void {
  const records = loadRecords(context);
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter(r => r.date === today);

  if (todayRecords.length === 0) {
    vscode.window.showInformationMessage('今天还没有计时数据');
    return;
  }

  const total = todayRecords.reduce((s, r) => s + r.duration, 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const detail = todayRecords.map(r => {
    const rh = Math.floor(r.duration / 3600);
    const rm = Math.floor((r.duration % 3600) / 60);
    return `${r.project.split(/[/\\]/).pop()}: ${rh}h${rm}m`;
  }).join('\n');

  vscode.window.showInformationMessage(`⏱ 今日编码 ${h}h${m}m\n${detail}`, { modal: true });
}
