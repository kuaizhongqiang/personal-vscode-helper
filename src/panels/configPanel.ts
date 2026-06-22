import * as vscode from 'vscode';
import { getConfig, refreshClients, getHelperClient, getStockClient } from '../server/endpoints';

/**
 * 配置面板 WebView Panel
 */
export class ConfigPanel {
  public static currentPanel: ConfigPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent();
    this._panel.webview.onDidReceiveMessage(
      msg => this._handleMessage(msg),
      null,
      this._disposables,
    );
    // Send initial config
    this._postConfig();
  }

  static createOrShow(context: vscode.ExtensionContext): void {
    if (ConfigPanel.currentPanel) {
      ConfigPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      ConfigPanel.currentPanel._postConfig();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'helperConfig',
      '插件配置',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    ConfigPanel.currentPanel = new ConfigPanel(panel, context);
  }

  private dispose(): void {
    ConfigPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
  }

  private _postConfig(): void {
    const config = getConfig();
    this._panel.webview.postMessage({ type: 'config', data: config });
  }

  private async _handleMessage(msg: any): Promise<void> {
    switch (msg.type) {
      case 'saveConfig':
        await this._saveConfig(msg.key, msg.value);
        break;
      case 'testConnection':
        await this._testConnection(msg.service);
        break;
    }
  }

  private async _saveConfig(key: string, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('personal-vscode-helper');
    await config.update(key, value, vscode.ConfigurationTarget.Global);
    refreshClients();
  }

  private async _testConnection(service: string): Promise<void> {
    let ok: boolean;
    if (service === 'helper') {
      ok = await getHelperClient().healthCheck();
    } else {
      ok = await getStockClient().healthCheck();
    }
    this._panel.webview.postMessage({
      type: 'connectionStatus',
      service,
      status: ok ? 'ok' : 'error',
      message: ok ? '连接正常' : '连接失败',
    });
  }

  private _getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>插件配置</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 18px; margin: 0 0 16px; }
  h3 { font-size: 14px; margin: 0 0 12px; display: flex; align-items: center; gap: 6px; }
  .section { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .field { margin-bottom: 12px; }
  .field label { display: block; font-size: 12px; margin-bottom: 4px; color: var(--vscode-descriptionForeground); }
  .field input { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 13px; }
  .field input:focus { outline: none; border-color: var(--vscode-focusBorder); }
  .status-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .status-dot.ok { background: #4caf50; }
  .status-dot.error { background: #f44336; }
  .status-dot.idle { background: #9e9e9e; }
  .status-text { font-size: 13px; }
  button { padding: 6px 14px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; cursor: pointer; font-size: 13px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:active { opacity: 0.9; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .section-icon { font-size: 18px; }
  .note { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
</style>
</head>
<body>
<h2>⚙️ 插件配置</h2>

<div class="section">
  <h3><span class="section-icon">📦</span> 助手服务（记事本 + Todo）</h3>
  <div class="field">
    <label>服务器地址</label>
    <input id="helperUrl" type="text" />
  </div>
  <div class="field">
    <label>API Token</label>
    <input id="helperToken" type="password" />
  </div>
  <div class="status-row">
    <span id="helperStatusDot" class="status-dot idle"></span>
    <span id="helperStatusText" class="status-text">未检测</span>
    <span style="flex:1"></span>
    <button id="helperTestBtn">测试连接</button>
  </div>
</div>

<div class="section">
  <h3><span class="section-icon">📊</span> 股票服务</h3>
  <div class="field">
    <label>服务器地址</label>
    <input id="stockUrl" type="text" />
  </div>
  <div class="field">
    <label>API Token</label>
    <input id="stockToken" type="password" />
  </div>
  <div class="field">
    <label>刷新间隔（秒）</label>
    <input id="stockInterval" type="number" min="30" max="3600" />
  </div>
  <div class="status-row">
    <span id="stockStatusDot" class="status-dot idle"></span>
    <span id="stockStatusText" class="status-text">未检测</span>
    <span style="flex:1"></span>
    <button id="stockTestBtn">测试连接</button>
  </div>
</div>

<p class="note">💡 修改配置后自动保存，无需手动确认。</p>

<script>
(function() {
  const vscode = acquireVsCodeApi();

  /* ─── 元素引用 ─── */
  const $ = id => document.getElementById(id);
  const helperUrl = $('helperUrl');
  const helperToken = $('helperToken');
  const stockUrl = $('stockUrl');
  const stockToken = $('stockToken');
  const stockInterval = $('stockInterval');
  const helperTestBtn = $('helperTestBtn');
  const stockTestBtn = $('stockTestBtn');
  const helperStatusDot = $('helperStatusDot');
  const helperStatusText = $('helperStatusText');
  const stockStatusDot = $('stockStatusDot');
  const stockStatusText = $('stockStatusText');

  let debounceTimer;

  /* ─── 自动保存 ─── */
  function autoSave(key, value) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      vscode.postMessage({ type: 'saveConfig', key, value });
    }, 500);
  }

  helperUrl.addEventListener('input', e => autoSave('helperServerUrl', e.target.value));
  helperToken.addEventListener('input', e => autoSave('helperApiToken', e.target.value));
  stockUrl.addEventListener('input', e => autoSave('stockServerUrl', e.target.value));
  stockToken.addEventListener('input', e => autoSave('stockApiToken', e.target.value));
  stockInterval.addEventListener('input', e => autoSave('stockRefreshInterval', parseInt(e.target.value) || 300));

  /* ─── 测试连接 ─── */
  helperTestBtn.addEventListener('click', () => {
    helperStatusDot.className = 'status-dot idle';
    helperStatusText.textContent = '检测中...';
    helperTestBtn.disabled = true;
    vscode.postMessage({ type: 'testConnection', service: 'helper' });
  });

  stockTestBtn.addEventListener('click', () => {
    stockStatusDot.className = 'status-dot idle';
    stockStatusText.textContent = '检测中...';
    stockTestBtn.disabled = true;
    vscode.postMessage({ type: 'testConnection', service: 'stock' });
  });

  /* ─── 接收初始配置 ─── */
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'config':
        helperUrl.value = msg.data.helperServerUrl || '';
        helperToken.value = msg.data.helperApiToken || '';
        stockUrl.value = msg.data.stockServerUrl || '';
        stockToken.value = msg.data.stockApiToken || '';
        stockInterval.value = msg.data.stockRefreshInterval || 300;
        break;
      case 'connectionStatus':
        if (msg.service === 'helper') {
          helperStatusDot.className = 'status-dot ' + msg.status;
          helperStatusText.textContent = msg.message;
          helperTestBtn.disabled = false;
        } else {
          stockStatusDot.className = 'status-dot ' + msg.status;
          stockStatusText.textContent = msg.message;
          stockTestBtn.disabled = false;
        }
        break;
    }
  });
})();
</script>
</body>
</html>`;
  }
}
