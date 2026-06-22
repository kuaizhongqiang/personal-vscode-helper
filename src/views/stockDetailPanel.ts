import * as vscode from 'vscode';
import { PoolStock } from './stockTree';
import { getStockClient } from '../server/endpoints';

/**
 * 股票详情 WebView Panel
 */
export class StockDetailPanel {
  public static currentPanel: StockDetailPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, stock: PoolStock, detail?: any) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtml(stock, detail);
  }

  static async createOrShow(stock: PoolStock): Promise<void> {
    // Try to fetch full detail from single stock API
    let detail: any = undefined;
    try {
      const client = getStockClient();
      detail = await client.get<any>(`/api/v1/stocks/${stock.code}/quote`);
    } catch {
      // Detail fetch is optional — use what we have
    }

    const title = `${stock.code}  ${stock.name}`;

    if (StockDetailPanel.currentPanel) {
      StockDetailPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      StockDetailPanel.currentPanel._panel.title = title;
      StockDetailPanel.currentPanel._panel.webview.html =
        StockDetailPanel.currentPanel._getHtml(stock, detail);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'stockDetail',
      title,
      vscode.ViewColumn.One,
      { enableScripts: false, retainContextWhenHidden: true },
    );
    StockDetailPanel.currentPanel = new StockDetailPanel(panel, stock, detail);
  }

  private dispose(): void {
    StockDetailPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
  }

  private _getHtml(stock: PoolStock, detail?: any): string {
    const s = (v: any, fallback = '—') =>
      v !== null && v !== undefined ? v : fallback;

    const price = s(stock.current_price?.toFixed(2));
    const change = stock.change_pct !== null
      ? (stock.change_pct >= 0 ? '+' : '') + stock.change_pct.toFixed(2) + '%'
      : '—';
    const analysis = s(stock.analysis_summary, '等待分析');
    const action = s(stock.action_label, '—');
    const buy = stock.ideal_buy !== null ? stock.ideal_buy.toFixed(2) : '—';
    const stop = stock.stop_loss !== null ? stock.stop_loss.toFixed(2) : '—';
    const profit = stock.take_profit !== null ? stock.take_profit.toFixed(2) : '—';

    // Detailed fields from single-stock API
    const preClose = detail?.pre_close?.toFixed(2) ?? '—';
    const open = detail?.open?.toFixed(2) ?? '—';
    const high = detail?.high?.toFixed(2) ?? '—';
    const low = detail?.low?.toFixed(2) ?? '—';
    const volumeRatio = s(detail?.volume_ratio?.toFixed(1));
    const turnover = s(detail?.turnover_rate?.toFixed(2));
    const pe = s(detail?.pe_ratio?.toFixed(1));
    const pb = s(detail?.pb_ratio?.toFixed(1));
    const updateTime = s(detail?.update_time);
    const hasDetail = detail !== undefined;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${stock.code} ${stock.name}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
  h2 { font-size: 18px; margin: 0 0 4px; }
  .code { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 16px; }
  .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .row .label { color: var(--vscode-descriptionForeground); }
  .row .value { font-weight: 500; }
  .price { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  .change { font-size: 14px; margin-bottom: 8px; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .section-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--vscode-descriptionForeground); }
  .analysis { font-size: 13px; line-height: 1.6; margin-top: 4px; }
  .strategy-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; }
  .strategy-item { text-align: center; padding: 8px; background: var(--vscode-editor-background); border-radius: 6px; }
  .strategy-item .label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .strategy-item .value { font-size: 14px; font-weight: 600; }
  .note { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 8px; }
</style>
</head>
<body>
  <h2>${stock.name}</h2>
  <div class="code">${stock.code}</div>

  <div class="card">
    <div class="price">${price}</div>
    <div class="change">${change}</div>
    ${action !== '—' ? `<span class="tag">${action}</span>` : ''}
  </div>

  ${hasDetail ? `
  <div class="card">
    <div class="section-title">📊 行情数据</div>
    <div class="row"><span class="label">昨收</span><span class="value">${preClose}</span></div>
    <div class="row"><span class="label">开盘</span><span class="value">${open}</span></div>
    <div class="row"><span class="label">最高</span><span class="value">${high}</span></div>
    <div class="row"><span class="label">最低</span><span class="value">${low}</span></div>
    <div class="row"><span class="label">量比</span><span class="value">${volumeRatio}</span></div>
    <div class="row"><span class="label">换手率</span><span class="value">${turnover}%</span></div>
    <div class="row"><span class="label">市盈率</span><span class="value">${pe}</span></div>
    <div class="row"><span class="label">市净率</span><span class="value">${pb}</span></div>
    ${updateTime !== '—' ? `<div class="row"><span class="label">行情时间</span><span class="value">${updateTime}</span></div>` : ''}
  </div>
  ` : ''}

  <div class="card">
    <div class="section-title">📝 分析摘要</div>
    <div class="analysis">${analysis}</div>
  </div>

  <div class="card">
    <div class="section-title">🎯 策略价位</div>
    <div class="strategy-grid">
      <div class="strategy-item">
        <div class="label">买入</div>
        <div class="value">${buy}</div>
      </div>
      <div class="strategy-item">
        <div class="label">止损</div>
        <div class="value">${stop}</div>
      </div>
      <div class="strategy-item">
        <div class="label">止盈</div>
        <div class="value">${profit}</div>
      </div>
    </div>
  </div>

  ${!hasDetail ? '<p class="note">💡 详细行情数据暂不可用（服务未返回）</p>' : ''}
</body>
</html>`;
  }
}
