import * as vscode from 'vscode';

/**
 * API配置视图
 * 提供UI界面配置AI API密钥和基座URL
 */
export class ApiConfigView {
    private context: vscode.ExtensionContext;
    private panel: vscode.WebviewPanel | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * 显示配置面板
     */
    public show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // 创建Webview面板
        this.panel = vscode.window.createWebviewPanel(
            'apiConfig',
            'AI API 配置',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        // 设置面板内容
        this.panel.webview.html = this.getWebviewContent();

        // 处理面板关闭事件
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);

        // 处理Webview消息
        this.panel.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'saveConfig':
                    await this.saveConfig(message.apiType, message.apiKey, message.apiEndpoint, message.modelName);
                    break;
                case 'testConnection':
                    await this.testConnection(message.apiType, message.apiKey, message.apiEndpoint, message.modelName);
                    break;
                case 'requestCurrentConfig':
                    await this.sendCurrentConfig();
                    break;
                case 'resetToDefault':
                    await this.resetToDefault();
                    break;
            }
        });
    }

    /**
     * 获取Webview内容
     */
    private getWebviewContent(): string {
        // 获取当前配置
        const config = vscode.workspace.getConfiguration('programmingPractice');
        const apiKey = config.get<string>('aiApiKey') || '';
        const apiEndpoint = config.get<string>('aiApiEndpoint') || '';
        const modelName = config.get<string>('aiModelName') || 'Qwen/Qwen2.5-Coder-7B-Instruct';

        // 根据apiKey判断API类型
        const apiType = apiKey && apiKey === 'ollama' ? 'ollama' : 'custom';

        return `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI API 配置</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    max-width: 800px;
                    margin: 0 auto;
                }
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .header h1 {
                    margin: 0;
                    font-size: 1.5em;
                    color: var(--vscode-foreground);
                }
                .header-icon {
                    font-size: 24px;
                    margin-right: 10px;
                }
                .form-group {
                    margin-bottom: 20px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                    color: var(--vscode-foreground);
                }
                input[type="text"], select {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 3px;
                    font-family: var(--vscode-font-family);
                }
                .hint {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 5px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 12px;
                    margin-right: 10px;
                    cursor: pointer;
                    border-radius: 3px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .button-container {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 20px;
                }
                .message {
                    padding: 10px;
                    margin-top: 10px;
                    border-radius: 3px;
                    display: none;
                }
                .success {
                    background-color: var(--vscode-testing-passed-background);
                    color: var(--vscode-testing-passed-foreground);
                    border: 1px solid var(--vscode-testing-passed-border);
                }
                .error {
                    background-color: var(--vscode-testing-error-background);
                    color: var(--vscode-testing-error-foreground);
                    border: 1px solid var(--vscode-testing-error-border);
                }
                .loading {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    border-top-color: var(--vscode-button-foreground);
                    animation: spin 1s linear infinite;
                    margin-right: 5px;
                    vertical-align: middle;
                }
                @keyframes spin {
                    to {transform: rotate(360deg);}
                }
                .section-title {
                    margin-top: 20px;
                    margin-bottom: 10px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-editorLightBulb-foreground);
                }
                .note {
                    padding: 10px;
                    border-radius: 3px;
                    background-color: var(--vscode-editorInfo-background);
                    color: var(--vscode-editorInfo-foreground);
                    border: 1px solid var(--vscode-editorInfo-border);
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-icon">🔌</div>
                    <h1>AI API 配置</h1>
                </div>

                <div class="note">
                    <strong>注意:</strong> 本配置用于设置AI服务连接。默认提供免费API服务，如需更改，请填写相应配置。
                </div>

                <div class="section-title">AI 连接设置</div>

                <div class="form-group">
                    <label for="apiType">API 类型</label>
                    <select id="apiType">
                        <option value="custom" ${apiType === 'custom' ? 'selected' : ''}>自定义API</option>
                        <option value="ollama" ${apiType === 'ollama' ? 'selected' : ''}>本地Ollama</option>
                    </select>
                    <div class="hint">选择API类型，本地Ollama使用本地部署的模型</div>
                </div>

                <div id="customApiSettings" style="${apiType === 'custom' ? '' : 'display: none;'}">
                    <div class="form-group">
                        <label for="apiKey">API 密钥 (API Key)</label>
                        <input type="text" id="apiKey" value="${this.escapeHtml(apiKey)}" placeholder="输入API密钥...">
                        <div class="hint">AI大模型的访问密钥，默认使用免费密钥</div>
                    </div>

                    <div class="form-group">
                        <label for="apiEndpoint">API 终端点 (API Endpoint)</label>
                        <input type="text" id="apiEndpoint" value="${this.escapeHtml(apiEndpoint)}" placeholder="https://api.example.com/v1/chat/completions">
                        <div class="hint">API服务器地址，默认为智谱AI服务器</div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="modelName">模型名称 (Model Name)</label>
                    <input type="text" id="modelName" value="${this.escapeHtml(modelName)}" placeholder="Qwen/Qwen2.5-Coder-7B-Instruct">
                    <div class="hint" id="modelNameHint">${apiType === 'ollama' ? '本地Ollama模型名称，默认使用qwen3:8b' : '模型标识名称，默认使用Qwen2.5-Coder-7B模型'}</div>
                </div>

                <div id="message" class="message"></div>

                <div class="button-container">
                    <div>
                        <button id="testButton">测试连接</button>
                        <button id="resetButton">重置为默认值</button>
                    </div>
                    <div>
                        <button id="saveButton">保存配置</button>
                    </div>
                </div>
            </div>

            <script>
                // 获取DOM元素
                const apiTypeSelect = document.getElementById('apiType');
                const customApiSettings = document.getElementById('customApiSettings');
                const apiKeyInput = document.getElementById('apiKey');
                const apiEndpointInput = document.getElementById('apiEndpoint');
                const modelNameInput = document.getElementById('modelName');
                const modelNameHint = document.getElementById('modelNameHint');
                const saveButton = document.getElementById('saveButton');
                const testButton = document.getElementById('testButton');
                const resetButton = document.getElementById('resetButton');
                const messageDiv = document.getElementById('message');

                // 处理API类型切换
                apiTypeSelect.addEventListener('change', () => {
                    const isCustom = apiTypeSelect.value === 'custom';
                    customApiSettings.style.display = isCustom ? 'block' : 'none';

                    // 更新模型名称提示
                    if (apiTypeSelect.value === 'ollama') {
                        modelNameHint.textContent = '本地Ollama模型名称，默认使用qwen3:8b';
                        if (!modelNameInput.value || modelNameInput.value === 'Qwen/Qwen2.5-Coder-7B-Instruct') {
                            modelNameInput.value = 'qwen3:8b';
                        }
                        // 设置默认的Ollama API密钥和端点
                        if (!isCustom) {
                            apiKeyInput.value = 'ollama';
                            apiEndpointInput.value = 'http://localhost:11434/v1/';
                        }
                    } else {
                        modelNameHint.textContent = '模型标识名称，默认使用Qwen2.5-Coder-7B模型';
                        if (modelNameInput.value === 'qwen3:8b') {
                            modelNameInput.value = 'Qwen/Qwen2.5-Coder-7B-Instruct';
                        }
                    }
                });

                // 与VSCode通信的对象
                const vscode = acquireVsCodeApi();

                // 加载时请求当前配置
                document.addEventListener('DOMContentLoaded', () => {
                    vscode.postMessage({
                        command: 'requestCurrentConfig'
                    });
                });

                // 保存配置
                saveButton.addEventListener('click', () => {
                    setMessage('正在保存...', 'info');

                    // 如果选择了ollama，确保设置了正确的API密钥和端点
                    if (apiTypeSelect.value === 'ollama') {
                        apiKeyInput.value = 'ollama';
                        apiEndpointInput.value = 'http://localhost:11434/v1/';
                    }

                    vscode.postMessage({
                        command: 'saveConfig',
                        apiType: apiTypeSelect.value,
                        apiKey: apiKeyInput.value.trim(),
                        apiEndpoint: apiEndpointInput.value.trim(),
                        modelName: modelNameInput.value.trim()
                    });
                });

                // 测试连接
                testButton.addEventListener('click', () => {
                    // 显示测试中状态
                    testButton.disabled = true;
                    testButton.innerHTML = '<span class="loading"></span> 测试中...';
                    setMessage('正在测试连接...', 'info');

                    // 如果选择了ollama，确保设置了正确的API密钥和端点
                    if (apiTypeSelect.value === 'ollama') {
                        apiKeyInput.value = 'ollama';
                        apiEndpointInput.value = 'http://localhost:11434/v1/';
                    }

                    vscode.postMessage({
                        command: 'testConnection',
                        apiType: apiTypeSelect.value,
                        apiKey: apiKeyInput.value.trim(),
                        apiEndpoint: apiEndpointInput.value.trim(),
                        modelName: modelNameInput.value.trim()
                    });
                });

                // 重置为默认值
                resetButton.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'resetToDefault'
                    });
                });

                // 显示消息
                function setMessage(text, type) {
                    messageDiv.textContent = text;
                    messageDiv.style.display = 'block';
                    messageDiv.className = 'message ' + type;
                }

                // 接收来自VSCode的消息
                window.addEventListener('message', event => {
                    const message = event.data;

                    switch (message.command) {
                        case 'configSaved':
                            setMessage('配置已成功保存', 'success');
                            break;

                        case 'testResult':
                            // 恢复测试按钮状态
                            testButton.disabled = false;
                            testButton.textContent = '测试连接';

                            if (message.success) {
                                setMessage('连接测试成功！', 'success');
                            } else {
                                setMessage('连接测试失败: ' + message.error, 'error');
                            }
                            break;

                        case 'currentConfig':
                            apiTypeSelect.value = message.apiType || 'custom';
                            apiKeyInput.value = message.apiKey || '';
                            apiEndpointInput.value = message.apiEndpoint || '';
                            modelNameInput.value = message.modelName || '';

                            // 根据API类型更新UI
                            const isCustom = apiTypeSelect.value === 'custom';
                            customApiSettings.style.display = isCustom ? 'block' : 'none';

                            // 更新模型名称提示
                            if (apiTypeSelect.value === 'ollama') {
                                modelNameHint.textContent = '本地Ollama模型名称，默认使用qwen3:8b';
                            } else {
                                modelNameHint.textContent = '模型标识名称，默认使用Qwen2.5-Coder-7B模型';
                            }
                            break;

                        case 'resetComplete':
                            apiTypeSelect.value = message.apiType || 'custom';
                            apiKeyInput.value = message.apiKey || '';
                            apiEndpointInput.value = message.apiEndpoint || '';
                            modelNameInput.value = message.modelName || '';

                            // 根据API类型更新UI
                            const isCustomAfterReset = apiTypeSelect.value === 'custom';
                            customApiSettings.style.display = isCustomAfterReset ? 'block' : 'none';

                            // 更新模型名称提示
                            if (apiTypeSelect.value === 'ollama') {
                                modelNameHint.textContent = '本地Ollama模型名称，默认使用qwen3:8b';
                            } else {
                                modelNameHint.textContent = '模型标识名称，默认使用Qwen2.5-Coder-7B模型';
                            }

                            setMessage('已重置为默认配置', 'success');
                            break;
                    }
                });
            </script>
        </body>
        </html>
        `;
    }

    /**
     * 转义HTML特殊字符
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * 发送当前配置到Webview
     */
    private async sendCurrentConfig() {
        if (!this.panel) return;

        const config = vscode.workspace.getConfiguration('programmingPractice');
        const apiKey = config.get('aiApiKey') || '';
        const apiEndpoint = config.get('aiApiEndpoint') || '';
        const modelName = config.get('aiModelName') || 'Qwen/Qwen2.5-Coder-7B-Instruct';

        // 根据apiKey判断API类型
        const apiType = apiKey && apiKey === 'ollama' ? 'ollama' : 'custom';

        this.panel.webview.postMessage({
            command: 'currentConfig',
            apiType,
            apiKey,
            apiEndpoint,
            modelName
        });
    }

    /**
     * 保存配置
     */
    private async saveConfig(apiType: string, apiKey: string, apiEndpoint: string, modelName: string) {
        try {
            const config = vscode.workspace.getConfiguration('programmingPractice');

            // 使用apiKey来存储API类型信息
            // 如果是ollama类型，则设置apiKey为'ollama'
            if (apiType === 'ollama') {
                await config.update('aiApiKey', 'ollama', vscode.ConfigurationTarget.Global);
                await config.update('aiApiEndpoint', 'http://localhost:11434/v1/', vscode.ConfigurationTarget.Global);
                if (modelName === 'Qwen/Qwen2.5-Coder-7B-Instruct') {
                    await config.update('aiModelName', 'qwen3:8b', vscode.ConfigurationTarget.Global);
                } else {
                    await config.update('aiModelName', modelName, vscode.ConfigurationTarget.Global);
                }
            } else {
                // 自定义API
                await config.update('aiApiKey', apiKey, vscode.ConfigurationTarget.Global);
                await config.update('aiApiEndpoint', apiEndpoint, vscode.ConfigurationTarget.Global);
                await config.update('aiModelName', modelName, vscode.ConfigurationTarget.Global);
            }

            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'configSaved'
                });
            }

            vscode.window.showInformationMessage('AI API 配置已保存');
        } catch (error) {
            vscode.window.showErrorMessage(`保存配置失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 重置为默认配置
     */
    private async resetToDefault() {
        try {
            const config = vscode.workspace.getConfiguration('programmingPractice');

            // 默认值
            const defaultApiKey = 'sk-jvemhtlzzpiaawbmveoqgzohziojbngggfrtvhtxxszyxzzy';
            const defaultEndpoint = 'https://api.siliconflow.cn/v1/chat/completions';
            const defaultModel = 'Qwen/Qwen2.5-Coder-7B-Instruct';

            await config.update('aiApiKey', defaultApiKey, vscode.ConfigurationTarget.Global);
            await config.update('aiApiEndpoint', defaultEndpoint, vscode.ConfigurationTarget.Global);
            await config.update('aiModelName', defaultModel, vscode.ConfigurationTarget.Global);

            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'resetComplete',
                    apiType: 'custom', // 默认为自定义API
                    apiKey: defaultApiKey,
                    apiEndpoint: defaultEndpoint,
                    modelName: defaultModel
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`重置配置失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 测试API连接
     */
    private async testConnection(apiType: string, apiKey: string, apiEndpoint: string, modelName: string) {
        if (!this.panel) return;

        try {
            // 导入fetch
            const fetch = require('node-fetch');

            // 如果是ollama类型，确保使用正确的配置
            if (apiType === 'ollama') {
                apiKey = 'ollama';
                apiEndpoint = 'http://localhost:11434/v1/';
                if (!modelName || modelName === 'Qwen/Qwen2.5-Coder-7B-Instruct') {
                    modelName = 'qwen3:8b';
                }
            }

            // 尝试连接API
            const endpoint = apiEndpoint.endsWith('/') ? `${apiEndpoint}chat/completions` : `${apiEndpoint}/chat/completions`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { "role": "system", "content": "你是一个测试助手。" },
                        { "role": "user", "content": "请回复'连接成功'，不要添加其他任何内容。" }
                    ],
                    temperature: 0.1,
                    max_tokens: 20
                }),
                // 设置5秒超时
                timeout: 5000
            });

            if (!response.ok) {
                const responseText = await response.text();
                throw new Error(`API返回错误: ${response.status} ${response.statusText} - ${responseText}`);
            }

            const data = await response.json();

            // 发送成功消息
            this.panel.webview.postMessage({
                command: 'testResult',
                success: true
            });
        } catch (error) {
            // 发送失败消息
            this.panel.webview.postMessage({
                command: 'testResult',
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
