import * as vscode from 'vscode';
import { ApiClient } from './client';

let _helperClient: ApiClient | null = null;
let _stockClient: ApiClient | null = null;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('personal-vscode-helper');
  return {
    helperServerUrl: cfg.get<string>('helperServerUrl', 'http://localhost:3000'),
    helperApiToken: cfg.get<string>('helperApiToken', ''),
    stockServerUrl: cfg.get<string>('stockServerUrl', 'https://your-server.com'),
    stockApiToken: cfg.get<string>('stockApiToken', ''),
    stockRefreshInterval: cfg.get<number>('stockRefreshInterval', 300),
  };
}

/** 获取助手服务 Client（记事本 + Todo） */
export function getHelperClient(): ApiClient {
  if (!_helperClient) {
    const config = getConfig();
    _helperClient = new ApiClient(config.helperServerUrl, config.helperApiToken);
  }
  return _helperClient;
}

/** 获取股票服务 Client */
export function getStockClient(): ApiClient {
  if (!_stockClient) {
    const config = getConfig();
    _stockClient = new ApiClient(config.stockServerUrl, config.stockApiToken);
  }
  return _stockClient;
}

/** 刷新所有 Client 配置（配置变更后调用） */
export function refreshClients(): void {
  const config = getConfig();
  if (_helperClient) {
    _helperClient.setBaseUrl(config.helperServerUrl);
    _helperClient.setToken(config.helperApiToken);
  } else {
    _helperClient = new ApiClient(config.helperServerUrl, config.helperApiToken);
  }
  if (_stockClient) {
    _stockClient.setBaseUrl(config.stockServerUrl);
    _stockClient.setToken(config.stockApiToken);
  } else {
    _stockClient = new ApiClient(config.stockServerUrl, config.stockApiToken);
  }
}

export { getConfig };
export type AppConfig = ReturnType<typeof getConfig>;
