import * as vscode from 'vscode';
import { PlasticViewProvider } from './views/plasticViewProvider';
import { SvnViewProvider } from './views/svnViewProvider';
import { NoteStore } from './store/noteStore';
import { TodoStore } from './store/todoStore';
import { StockDataProvider } from './views/stockTree';
import { StockPoller } from './views/stockPoller';
import { SyncManager } from './server/sync';
import { registerCommands, setStockPoller, setSyncManager } from './commands';
import { updateDashboard, initTimer } from './views/statusBarItems';
import { registerContextMenuCommands } from './views/contextMenu';
import { initHighlighter } from './views/todoHighlighter';
import { initCommandCollection } from './views/commandCollection';

let stockPoller: StockPoller | null = null;

/**
 * 插件激活入口
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('插件 "personal-vscode-helper" 已激活！');

	// 初始化本地 Store
	NoteStore.getInstance(context);
	TodoStore.getInstance(context);

	// VCS 视图
	const plasticProvider = new PlasticViewProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('plasticView', plasticProvider),
	);
	const svnProvider = new SvnViewProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('svnView', svnProvider),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.plastic.refresh', () => plasticProvider.refresh()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.plastic.commit', () => plasticProvider.commit()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.plastic.update', () => plasticProvider.update()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.svn.refresh', () => svnProvider.refresh()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.svn.commit', () => svnProvider.commit()),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('vcs-manager.svn.update', () => svnProvider.update()),
	);

	// 股票 TreeView
	const stockProvider = new StockDataProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('stockView', stockProvider),
	);

	// M7-1: 项目仪表盘
	updateDashboard();
	setInterval(() => updateDashboard(), 60000);

	// M7-2: 工作计时
	initTimer(context);

	// M7-4: 右键菜单
	registerContextMenuCommands(context);

	// M7-5: 终端命令收藏
	initCommandCollection(context);

	// M7-6: TODO 高亮
	initHighlighter(context);

	// 集中注册所有命令（面板 + CLI + 同步）
	registerCommands(context);

	// 股票轮询
	stockPoller = new StockPoller(stockProvider);
	stockPoller.start();
	setStockPoller(stockPoller);

	// 服务端同步
	const syncManager = new SyncManager();
	setSyncManager(syncManager);
	setTimeout(() => syncManager.syncAll(), 3000);

	// 兼容旧命令
	context.subscriptions.push(
		vscode.commands.registerCommand('personal-vscode-helper.helloWorld', () => {
			vscode.window.showInformationMessage('🎉 你好，我的第一个 VSCode 插件！');
		}),
	);
}

export function deactivate() {
	if (stockPoller) {
		stockPoller.stop();
	}
}
