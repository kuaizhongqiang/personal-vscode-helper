# 服务端通讯层开发计划

## Goal

封装统一的 HTTP Client，管理三个后端服务的请求、认证、重试和错误处理。所有网络请求集中管理，各模块无需关心底层细节。

---

## HTTP Client 设计

### `server/client.ts`

```typescript
class ApiClient {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string);

    // 基础方法
    async get<T>(path: string): Promise<T>;
    async post<T>(path: string, body: unknown): Promise<T>;
    async put<T>(path: string, body: unknown): Promise<T>;
    async patch<T>(path: string, body: unknown): Promise<T>;
    async delete(path: string): Promise<void>;

    // 便捷方法
    async healthCheck(): Promise<boolean>;
}
```

### 实例化

```typescript
// 两个 client：助手服务 + 股票服务
const helperClient = new ApiClient(
    config.helperServerUrl,      // http://localhost:3000
    config.helperApiToken
);
// note 和 todo 共享 helperClient，各自访问 /api/notes 和 /api/todos

const stockClient = new ApiClient(
    config.stockServerUrl,
    config.stockApiToken
);
```

---

## 认证方式

- 记事本 / Todo 服务：`Authorization: Bearer <token>`（如果 token 不为空则带）
- 股票服务：`Authorization: Bearer <token>`（必须）

> 本地开发时 token 为空则不带认证头。

---

## 错误处理

### 统一错误类型

```typescript
class ApiError extends Error {
    statusCode: number;
    body: unknown;
}

class NetworkError extends Error {
    // fetch 异常
}

class AuthError extends ApiError {
    // 401
}
```

### 各状态码处理

| 状态码 | 处理 |
|--------|------|
| 200/201/204 | 正常返回 |
| 400 | 抛出 `ApiError`，提示参数错误 |
| 401 | 抛出 `AuthError`，UI 提示 Token 无效 |
| 404 | 抛出 `ApiError`，提示资源不存在 |
| 500 | 抛出 `ApiError`，提示服务器错误 |
| 无响应 | 抛出 `NetworkError`，提示网络不通 |

---

## 请求重试

```typescript
// 网络错误自动重试 2 次，间隔 1s
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

// 仅对 GET 请求重试（幂等）
// POST/PUT/DELETE 不重试，避免重复操作
```

---

## 健康检查

### 用途

- 配置页测试连接
- 状态栏实时显示服务在线/离线
- 插件激活时静默检查

### 实现

```typescript
async healthCheck(): Promise<boolean> {
    try {
        const res = await fetch(`${this.baseUrl}/api/health`, { timeout: 5000 });
        return res.ok;
    } catch {
        return false;
    }
}
```

---

## 实现步骤

1. 创建 `src/server/client.ts`，实现 `ApiClient` 类
2. 创建 `src/server/endpoints.ts`，从配置中读取 URL
3. 实现错误类型定义 `src/server/errors.ts`
4. 实现重试逻辑
5. 实现健康检查方法
6. 各业务模块导入对应 client 实例使用

---

## 验收标准

- [ ] 两个 client 都能正常发起 GET/POST/PUT/DELETE（helper + stock）
- [ ] Token 正确携带在请求头中
- [ ] 401 时抛出 `AuthError`
- [ ] 网络不通时抛出 `NetworkError` 并自动重试 GET 请求
- [ ] 健康检查方法返回布尔值
