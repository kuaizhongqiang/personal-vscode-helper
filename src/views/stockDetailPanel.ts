import * as vscode from 'vscode';
import { PoolStock } from './stockTree';
import { getHelperClient } from '../server/endpoints';

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
    // Try to fetch full detail from single stock API (通过 helper-server 代理)
    let detail: any = undefined;
    try {
      const client = getHelperClient();
      detail = await client.get<any>(`/api/stocks/detail/${stock.code}`);
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
      { enableScripts: true, retainContextWhenHidden: true },
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

    // #55: recentDaily K-line data (ascending by date, take last 5)
    const recentDaily = detail?.recentDaily;
    const recentItems = Array.isArray(recentDaily) ? recentDaily.slice(-5) : [];

    // #54: finalReport (anomalyScore + summary + roles)
    const finalReport = detail?.finalReport;

    // #58: technical signals from detail response
    const signals = detail?.signals;

    // ── Helper: format date string as MM-DD ──
    const fmtDate = (dateStr: string): string => {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}-${dd}`;
      }
      // Fallback: try splitting YYYY-MM-DD string
      const parts = dateStr.split(/[-/]/);
      if (parts.length >= 3) {
        return `${parts[1]}-${parts[2]}`;
      }
      return dateStr;
    };

    // ── Helper: format volume (>= 10M -> "xx.xM") ──
    const fmtVolume = (vol: number): string => {
      if (vol >= 10_000_000) {
        return (vol / 1_000_000).toFixed(1) + 'M';
      }
      return String(Math.round(vol));
    };

    // ── Helper: anomaly score color class ──
    const anomalyColorClass = (score: number): string => {
      if (score <= 2.0) return 'green';
      if (score <= 3.0) return 'blue';
      if (score <= 4.0) return 'orange';
      return 'red';
    };

    // ── Helper: anomaly score risk label ──
    const anomalyRiskLabel = (score: number): string => {
      if (score <= 2.0) return '低风险';
      if (score <= 3.0) return '正常';
      if (score <= 4.0) return '关注';
      return '高异常';
    };

    // ── Signal display-name mapping ──
    const signalLabels: Record<string, string> = {
      ma_cross: 'MA 交叉',
      maCross: 'MA 交叉',
      MaCross: 'MA 交叉',
      rsi: 'RSI',
      RSI: 'RSI',
      volume: '成交量',
      Volume: '成交量',
      macd: 'MACD',
      MACD: 'MACD',
    };

    const signalIcons: Record<string, string> = {
      ma_cross: '🔀',
      maCross: '🔀',
      MaCross: '🔀',
      rsi: '📊',
      RSI: '📊',
      volume: '📈',
      Volume: '📈',
      macd: '📉',
      MACD: '📉',
    };

    // ── Helper: render signals object to HTML rows ──
    const renderSignals = (sig: any): string => {
      if (!sig || typeof sig !== 'object') return '';
      const rows: string[] = [];
      for (const [key, value] of Object.entries(sig)) {
        // Skip action/action_label — already shown in header
        if (key === 'action' || key === 'action_label' || key === '__typename') continue;
        const label = signalLabels[key] ?? key;
        const icon = signalIcons[key] ?? '📌';
        if (value !== null && typeof value === 'object') {
          const parts: string[] = [];
          const v = value as Record<string, any>;
          if (v.value !== undefined) parts.push(String(v.value));
          if (v.signal) parts.push(v.signal);
          if (v.direction) parts.push(v.direction);
          if (v.label) parts.push(v.label);
          if (v.current_value !== undefined) parts.push(String(v.current_value));
          if (v.status) parts.push(v.status);
          rows.push(
            `<div class="signal-row"><span class="signal-label">${icon} ${label}</span><span class="signal-value">${parts.join(' | ') || '—'}</span></div>`,
          );
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          rows.push(
            `<div class="signal-row"><span class="signal-label">${icon} ${label}</span><span class="signal-value">${value}</span></div>`,
          );
        }
      }
      return rows.join('\n');
    };

    // #61: Chart.js data
    const hasChartData = recentItems.length >= 2;
    const chartDataJson = hasChartData ? JSON.stringify(recentItems.map((i: any) => ({
      date: i.date,
      open: i.open,
      high: i.high,
      low: i.low,
      close: i.close,
      volume: i.volume
    }))) : '[]';

    // ── Role emoji mapping for debate (#59) ──
    const roleEmojis: Record<string, string> = {
      '技术分析师': '📈',
      '基本面分析师': '📋',
      '舆情分析师': '📰',
      '风控官': '🛡️',
    };

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

  /* #54: Progress bar for anomaly score */
  .progress-bar { width: 100%; height: 12px; background: var(--vscode-editor-background); border-radius: 6px; overflow: hidden; margin: 8px 0; }
  .progress-bar .fill { height: 100%; border-radius: 6px; transition: width 0.3s; }
  .progress-bar .fill.green { background: #4caf50; }
  .progress-bar .fill.blue { background: #2196f3; }
  .progress-bar .fill.orange { background: #ff9800; }
  .progress-bar .fill.red { background: #f44336; }
  .score-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  .score-row .score-label { color: var(--vscode-descriptionForeground); }
  .score-row .score-value { font-weight: 600; }
  .score-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-left: 4px; }
  .score-tag.green { background: #4caf5033; color: #4caf50; }
  .score-tag.blue { background: #2196f333; color: #2196f3; }
  .score-tag.orange { background: #ff980033; color: #ff9800; }
  .score-tag.red { background: #f4433633; color: #f44336; }

  /* #55: Sub-table for K-line data */
  .sub-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
  .sub-table th { text-align: left; padding: 4px 6px; color: var(--vscode-descriptionForeground); font-weight: 500; border-bottom: 1px solid var(--vscode-widget-border); }
  .sub-table td { padding: 4px 6px; border-bottom: 1px solid var(--vscode-widget-border); }
  .sub-table tr:last-child td { border-bottom: none; }
  .sub-table .up { color: #ef5350; }
  .sub-table .down { color: #26a69a; }

  /* #58: Technical signal grid */
  .signal-grid { margin-top: 8px; }
  .signal-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; border-bottom: 1px solid var(--vscode-widget-border); }
  .signal-row:last-child { border-bottom: none; }
  .signal-label { color: var(--vscode-descriptionForeground); }
  .signal-value { font-weight: 500; }

  /* #59: Collapsible debate section */
  details { margin-top: 4px; }
  details summary { cursor: pointer; font-size: 13px; font-weight: 600; padding: 4px 0; color: var(--vscode-descriptionForeground); }
  details summary::-webkit-details-marker { color: var(--vscode-descriptionForeground); }
  .debate-item { padding: 8px; margin: 6px 0; background: var(--vscode-editor-background); border-radius: 6px; font-size: 12px; line-height: 1.5; }
  .debate-item .role { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .debate-item .content { color: var(--vscode-editor-foreground); white-space: pre-wrap; }
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

    ${recentItems.length > 0 ? `
    <div style="margin-top:10px;font-size:12px;font-weight:600;color:var(--vscode-descriptionForeground);">📅 最近5日行情</div>
    <table class="sub-table">
      <thead><tr><th>日期</th><th>开盘</th><th>最高</th><th>最低</th><th>收盘</th><th>成交量</th></tr></thead>
      <tbody>
        ${recentItems.map((item: any) => {
          const o = item.open;
          const c = item.close;
          const isUp = c >= o;
          const cls = isUp ? 'up' : 'down';
          return `<tr>
            <td>${fmtDate(item.date)}</td>
            <td class="${cls}">${o.toFixed(2)}</td>
            <td>${item.high.toFixed(2)}</td>
            <td>${item.low.toFixed(2)}</td>
            <td class="${cls}">${c.toFixed(2)}</td>
            <td>${fmtVolume(item.volume)}</td>
          </tr>`;
        }).join('\n')}
      </tbody>
    </table>
    ${hasChartData ? '<canvas id="priceChart" width="400" height="180" style="width:100%;height:180px;margin-top:12px;"></canvas>' : ''}
    ` : ''}
  </div>
  ` : ''}

  ${finalReport ? `
  <div class="card">
    <div class="section-title">⚠️ 异常评分</div>
    <div class="score-row">
      <span class="score-label">异常分数</span>
      <span class="score-value">${finalReport.anomalyScore?.toFixed(1) ?? '—'}${finalReport.anomalyScore !== null && finalReport.anomalyScore !== undefined ? ` <span class="score-tag ${anomalyColorClass(finalReport.anomalyScore)}">${anomalyRiskLabel(finalReport.anomalyScore)}</span>` : ''}</span>
    </div>
    ${finalReport.anomalyScore !== null && finalReport.anomalyScore !== undefined ? `
    <div class="progress-bar">
      <div class="fill ${anomalyColorClass(finalReport.anomalyScore)}" style="width: ${(Math.min(finalReport.anomalyScore, 5) / 5.0 * 100).toFixed(0)}%"></div>
    </div>
    ` : ''}
  </div>

  ${finalReport.summary ? `
  <div class="card">
    <div class="section-title">📋 最终综合报告</div>
    <div class="analysis">${finalReport.summary}</div>
  </div>
  ` : ''}

  ${Array.isArray(finalReport.roles) && finalReport.roles.length > 0 ? `
  <div class="card">
    <details>
      <summary>🗣️ 多角色辩论 (${finalReport.roles.length}条)</summary>
      ${finalReport.roles.map((r: any) => {
        const roleName = r.role || '—';
        const emoji = roleEmojis[roleName] ?? '🗣️';
        return `<div class="debate-item">
          <div class="role">${emoji} ${roleName} · 第${r.round ?? '?'}轮</div>
          <div class="content">${r.content ?? ''}</div>
        </div>`;
      }).join('\n')}
    </details>
  </div>
  ` : ''}
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

  ${signals ? `
  <div class="card">
    <div class="section-title">📶 技术信号</div>
    <div class="signal-grid">
      ${renderSignals(signals)}
    </div>
  </div>
  ` : ''}

  ${!hasDetail ? '<p class="note">💡 详细行情数据暂不可用（服务未返回）</p>' : ''}

  ${hasChartData ? `
<script>
(function() {
  const data = ${chartDataJson};
  if (!data || data.length < 2) return;

  const dates = data.map(function(d) {
    var parts = (d.date || '').split(/[-/]/);
    return parts.length >= 3 ? parts[1] + '-' + parts[2] : d.date;
  });

  var ctx = document.getElementById('priceChart');
  if (!ctx) return;

  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  script.onload = function() {
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: '收盘价',
          data: data.map(function(d) { return d.close; }),
          borderColor: '#ff9800',
          backgroundColor: 'rgba(255,152,0,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: 'y'
        }, {
          label: '成交量',
          data: data.map(function(d) { return d.volume; }),
          type: 'bar',
          backgroundColor: 'rgba(33,150,243,0.4)',
          yAxisID: 'y1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: false } },
        scales: {
          y: {
            position: 'left',
            grid: { color: 'rgba(128,128,128,0.1)' },
            ticks: { color: '#888', font: { size: 10 } }
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              color: '#888',
              font: { size: 10 },
              callback: function(v) { return v >= 10000000 ? (v/1000000).toFixed(1)+'M' : v; }
            }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#888', font: { size: 10 } }
          }
        }
      }
    });
  };
  document.head.appendChild(script);
})();
</script>
` : ''}
</body>
</html>`;
  }
}
