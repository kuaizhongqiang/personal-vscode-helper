import * as vscode from 'vscode';
import { getHelperClient } from '../server/endpoints';

export class FiPMStatusBar {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 70);
    this.item.command = 'personal-vscode-helper.showFiPMStatus';
    this.item.show();
  }

  start(): void {
    this.update();
    this.timer = setInterval(() => this.update(), 60000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.item.dispose();
  }

  private async update(): Promise<void> {
    try {
      const client = getHelperClient();
      const data = await client.get<any>('/api/stocks/status');

      // Successful response
      const stocksCount = data?.data?.stocksTracked ?? data?.stocksTracked ?? '?';
      const llmOk = data?.data?.llmConnected ?? data?.llmConnected ?? false;
      const version = data?.data?.version ?? data?.version ?? '';
      const dbSize = data?.data?.dbSize ?? data?.dbSize ?? '';
      const lastUpdate = data?.data?.lastDataUpdate ?? data?.lastDataUpdate ?? '';
      const uptime = data?.data?.uptime ?? data?.uptime ?? 0;

      this.item.text = `$(circle-filled) Fi-PM ${stocksCount}只`;
      this.item.tooltip = [
        `版本: ${version}`,
        `数据库: ${dbSize}`,
        `追踪股票: ${stocksCount}`,
        `最新数据: ${lastUpdate}`,
        `LLM: ${llmOk ? '✅ 已连接' : '⚠️ 离线'}`,
        `运行时间: ${formatUptime(uptime)}`,
      ].join('\n');

      if (!llmOk) {
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        this.item.backgroundColor = undefined;
      }
    } catch {
      // Failed to reach helper-server → Fi-PM status unknown
      this.item.text = '$(circle-slash) Fi-PM 离线';
      this.item.tooltip = 'Fi-Pool-Manager 服务不可达';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
  }
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}
