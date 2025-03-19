import * as vscode from 'vscode';
import fetch from 'node-fetch';

/**
 * AI代码分析器 - 调用AI大模型API进行代码分析
 */
export class AICodeAnalyzer {
    private static instance: AICodeAnalyzer;
    private analysisTimeout: NodeJS.Timeout | undefined;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private lastRequestTime: number = 0;
    private requestQueue: {document: vscode.TextDocument, resolve: (value: vscode.Diagnostic[]) => void}[] = [];
    private processingRequest: boolean = false;

    private constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('ai-code-analysis');
    }

    /**
     * 获取AICodeAnalyzer实例
     */
    public static getInstance(): AICodeAnalyzer {
        if (!AICodeAnalyzer.instance) {
            AICodeAnalyzer.instance = new AICodeAnalyzer();
        }
        return AICodeAnalyzer.instance;
    }

    /**
     * 初始化AI代码分析器
     */
    public initialize(context: vscode.ExtensionContext) {
        // 注册状态栏项
        this.initializeStatusBar(context);
        
        // 注册文档变更事件
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(this.onDocumentChanged.bind(this)),
            vscode.window.onDidChangeActiveTextEditor(this.onActiveEditorChanged.bind(this)),
            vscode.languages.registerCodeActionsProvider(['cpp', 'c'], new AICodeActionProvider(), {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor]
            })
        );

        // 初始化当前打开的编辑器
        if (vscode.window.activeTextEditor) {
            this.scheduleAnalysis(vscode.window.activeTextEditor.document);
        }

        // 注册命令
        context.subscriptions.push(
            vscode.commands.registerCommand('programmingPractice.aiAnalyzeCode', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    await this.analyzeDocument(editor.document, true);
                    vscode.window.showInformationMessage('已完成AI代码分析');
                }
            })
        );

        console.log('AI代码分析器已初始化');
    }

    /**
     * 初始化状态栏
     */
    private initializeStatusBar(context: vscode.ExtensionContext) {
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = "$(sparkle) AI分析";
        statusBarItem.tooltip = "AI代码分析正在运行中";
        statusBarItem.command = "programmingPractice.aiAnalyzeCode";
        statusBarItem.show();

        context.subscriptions.push(statusBarItem);
    }

    /**
     * 文档变更事件处理
     */
    private onDocumentChanged(event: vscode.TextDocumentChangeEvent) {
        if (this.isSupportedLanguage(event.document.languageId)) {
            this.scheduleAnalysis(event.document);
        }
    }

    /**
     * 活动编辑器变更事件处理
     */
    private onActiveEditorChanged(editor: vscode.TextEditor | undefined) {
        if (editor && this.isSupportedLanguage(editor.document.languageId)) {
            this.scheduleAnalysis(editor.document);
        }
    }

    /**
     * 判断是否为支持的语言
     */
    private isSupportedLanguage(languageId: string): boolean {
        // 目前支持C++和C语言
        return languageId === 'cpp' || languageId === 'c';
    }

    /**
     * 使用防抖机制安排分析任务
     */
    private scheduleAnalysis(document: vscode.TextDocument) {
        // 清除现有的待处理分析
        if (this.analysisTimeout) {
            clearTimeout(this.analysisTimeout);
        }
        
        // 检查配置的延迟时间 - 默认为1500ms以避免过于频繁的API调用
        const delay = vscode.workspace.getConfiguration('programmingPractice').get('aiAnalysisDelayMs', 1500);
        
        // 安排新的分析任务
        this.analysisTimeout = setTimeout(async () => {
            await this.analyzeDocument(document);
        }, delay);
    }

    /**
     * 分析文档
     */
    public async analyzeDocument(document: vscode.TextDocument, forceAnalyze: boolean = false): Promise<vscode.Diagnostic[]> {
        // 检查AI分析是否启用
        if (!this.isAIAnalysisEnabled() && !forceAnalyze) {
            this.diagnosticCollection.delete(document.uri);
            return [];
        }

        // 检查文件大小限制
        const maxFileSizeKB = vscode.workspace.getConfiguration('programmingPractice').get('aiMaxFileSizeKB', 100);
        const fileSizeKB = document.getText().length / 1024;
        if (fileSizeKB > maxFileSizeKB && !forceAnalyze) {
            console.log(`文件大小(${fileSizeKB.toFixed(2)}KB)超过限制(${maxFileSizeKB}KB)，跳过AI分析`);
            return [];
        }

        try {
            return await new Promise<vscode.Diagnostic[]>((resolve) => {
                this.requestQueue.push({ document, resolve });
                this.processQueue();
            });
        } catch (error) {
            console.error('AI代码分析失败:', error);
            vscode.window.showErrorMessage(`AI代码分析失败: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * 处理请求队列
     */
    private async processQueue() {
        if (this.processingRequest || this.requestQueue.length === 0) {
            return;
        }

        this.processingRequest = true;

        // 检查API调用频率限制
        const now = Date.now();
        const minInterval = vscode.workspace.getConfiguration('programmingPractice').get('aiApiMinIntervalMs', 2000);
        
        if (now - this.lastRequestTime < minInterval) {
            // 需要等待以满足频率限制
            const delay = minInterval - (now - this.lastRequestTime);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        const request = this.requestQueue.shift()!;
        
        try {
            // 记录请求时间
            this.lastRequestTime = Date.now();
            
            // 执行AI分析
            const diagnostics = await this.callAIModelForAnalysis(request.document);
            
            // 更新诊断信息
            this.diagnosticCollection.set(request.document.uri, diagnostics);
            
            // 解析Promise
            request.resolve(diagnostics);
        } catch (error) {
            console.error('AI分析请求处理出错:', error);
            request.resolve([]);
        } finally {
            this.processingRequest = false;
            // 继续处理队列中的下一个请求
            this.processQueue();
        }
    }

    /**
     * 调用AI大模型API进行代码分析
     */
    private async callAIModelForAnalysis(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
        const apiKey = vscode.workspace.getConfiguration('programmingPractice').get('aiApiKey', 'ipzotlGevNqQsafvWSXi:cooExiNRkHtQtHkkIqNk');
        if (!apiKey) {
            vscode.window.showWarningMessage('未配置AI API密钥，无法进行代码分析', '打开设置').then(selection => {
                if (selection === '打开设置') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'programmingPractice.aiApiKey');
                }
            });
            return [];
        }

        const apiEndpoint = vscode.workspace.getConfiguration('programmingPractice').get('aiApiEndpoint', 'https://spark-api-open.xf-yun.com/v1/chat/completions');
        const code = document.getText();
        const language = document.languageId;

        try {
            // 显示进度条
            const diagnostics = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: "AI代码分析中...",
                cancellable: false
            }, async () => {
                // 准备API请求
                const prompt = this.buildAnalysisPrompt(code, language);
                
                // 添加重试逻辑
                let retries = 3;
                while (retries > 0) {
                    try {
                        const response = await fetch(apiEndpoint, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${apiKey}`
                            },
                            body: JSON.stringify({
                                model: vscode.workspace.getConfiguration('programmingPractice').get('aiModelName', 'lite'),
                                messages: [
                                    { "role": "system", "content": "你是一个专业的代码分析工具，需要在代码中发现问题并提供改进建议。请提供明确的代码行号、问题描述、严重性等级（error、warning、info）以及修复建议。" },
                                    { "role": "user", "content": prompt }
                                ],
                                temperature: 0.3,
                                max_tokens: 2000
                            })
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            console.log(`API错误(${response.status}): ${errorText}`);
                            if (response.status === 404) {
                                throw new Error(`API端点不存在，请检查URL配置: ${apiEndpoint}`);
                            }
                            throw new Error(`API调用失败: ${response.status} ${response.statusText} - ${errorText}`);
                        }

                        const data = await response.json();
                        const analysisResult = data.choices[0].message.content;
                        
                        // 解析AI返回结果为诊断信息
                        return this.parseAnalysisResult(analysisResult, document);
                    } catch (error) {
                        retries--;
                        if (retries === 0) {
                            throw error;
                        }
                        console.log(`API调用失败，将在2秒后重试，剩余重试次数: ${retries}`);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
                
                // 确保始终返回一个诊断数组，即使所有重试都失败
                return [] as vscode.Diagnostic[];
            }) || []; // 确保如果withProgress返回undefined，我们返回一个空数组

            return diagnostics;
        } catch (error) {
            console.error('调用AI API出错:', error);
            vscode.window.showErrorMessage(`AI分析API调用失败: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * 构建分析提示
     */
    private buildAnalysisPrompt(code: string, language: string): string {
        return `请分析以下${language.toUpperCase()}代码，找出潜在的问题和优化机会。请特别注意：
1. 语法错误
2. 逻辑问题
3. 最佳实践违规
4. 可能的性能问题
5. 安全隐患
6. 可读性和维护性改进

针对每个问题，请提供以下信息：
- 行号
- 问题描述
- 严重性级别（error、warning、info）
- 具体的修复建议

请以JSON格式响应，示例：
[
  {
    "line": 5,
    "message": "未检查指针是否为空",
    "severity": "warning",
    "code": "NPE",
    "suggestion": "在解引用指针前添加空值检查"
  }
]

代码:
\`\`\`${language}
${code}
\`\`\``;
    }

    /**
     * 解析AI分析结果为诊断信息
     */
    private parseAnalysisResult(result: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        
        try {
            // 尝试从结果中提取JSON
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.warn('无法从AI响应中提取JSON数据');
                return [];
            }
            
            const issuesJson = JSON.parse(jsonMatch[0]);
            
            for (const issue of issuesJson) {
                // 确保行号是基于0的索引
                const lineNumber = Math.max(0, (issue.line || 1) - 1);
                const lineText = document.lineAt(Math.min(lineNumber, document.lineCount - 1)).text;
                
                // 创建诊断范围 - 使用整行或特定部分
                let range: vscode.Range;
                if (issue.column && issue.endColumn) {
                    range = new vscode.Range(
                        lineNumber, issue.column - 1,
                        lineNumber, issue.endColumn
                    );
                } else {
                    range = new vscode.Range(
                        lineNumber, 0,
                        lineNumber, lineText.length
                    );
                }
                
                // 确定诊断严重性
                let severity: vscode.DiagnosticSeverity;
                switch (issue.severity?.toLowerCase()) {
                    case 'error':
                        severity = vscode.DiagnosticSeverity.Error;
                        break;
                    case 'warning':
                        severity = vscode.DiagnosticSeverity.Warning;
                        break;
                    case 'info':
                    case 'information':
                        severity = vscode.DiagnosticSeverity.Information;
                        break;
                    case 'hint':
                        severity = vscode.DiagnosticSeverity.Hint;
                        break;
                    default:
                        severity = vscode.DiagnosticSeverity.Information;
                }
                
                // 创建诊断信息
                const diagnostic = new vscode.Diagnostic(
                    range,
                    issue.message,
                    severity
                );
                
                // 添加代码和源
                diagnostic.code = issue.code || 'AI.Analysis';
                diagnostic.source = '🤖 AI代码分析';
                
                // 添加建议作为相关信息
                if (issue.suggestion) {
                    diagnostic.relatedInformation = [
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(document.uri, range),
                            `建议: ${issue.suggestion}`
                        )
                    ];
                }
                
                diagnostics.push(diagnostic);
            }
        } catch (error) {
            console.error('解析AI分析结果失败:', error, '原始结果:', result);
            vscode.window.showErrorMessage('解析AI分析结果失败，请查看日志获取详细信息');
        }
        
        return diagnostics;
    }

    /**
     * 检查是否启用了AI分析功能
     */
    private isAIAnalysisEnabled(): boolean {
        return vscode.workspace.getConfiguration('programmingPractice').get('enableAIAnalysis', true);
    }

    /**
     * 释放资源
     */
    public dispose() {
        if (this.analysisTimeout) {
            clearTimeout(this.analysisTimeout);
        }
        this.diagnosticCollection.dispose();
    }

    /**
     * 应用AI建议修复代码
     */
    public async applyAISuggestion(document: vscode.TextDocument, diagnostic: vscode.Diagnostic, suggestion: string): Promise<void> {
        try {
            // 提取建议内容
            const suggestionText = suggestion.startsWith('建议:') ? suggestion.substring(3).trim() : suggestion.trim();
            
            // 使用AI来生成具体的修复代码
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "生成代码修复方案...",
                cancellable: false
            }, async () => {
                const apiKey = vscode.workspace.getConfiguration('programmingPractice').get('aiApiKey', '');
                const apiEndpoint = vscode.workspace.getConfiguration('programmingPractice').get('aiApiEndpoint', '');
                
                // 准备上下文代码
                const lineNumber = diagnostic.range.start.line;
                const startLine = Math.max(0, lineNumber - 5);
                const endLine = Math.min(document.lineCount - 1, lineNumber + 5);
                
                let contextCode = '';
                for (let i = startLine; i <= endLine; i++) {
                    const line = document.lineAt(i).text;
                    if (i === lineNumber) {
                        contextCode += `→ ${line}\n`; // 标记问题行
                    } else {
                        contextCode += `  ${line}\n`;
                    }
                }
                
                const prompt = `我需要修复以下C++代码中的问题。问题描述是: "${diagnostic.message}"。建议修复方法是: "${suggestionText}"。
请提供具体的修复代码，只返回修改后的代码段，不需要解释。问题行用→标记。

\`\`\`cpp
${contextCode}
\`\`\`

请提供修复后的代码段:`;
                
                try {
                    // 延迟以尊重API速率限制
                    const now = Date.now();
                    const minInterval = vscode.workspace.getConfiguration('programmingPractice').get('aiApiMinIntervalMs', 2000);
                    if (now - this.lastRequestTime < minInterval) {
                        await new Promise(resolve => setTimeout(resolve, minInterval - (now - this.lastRequestTime)));
                    }
                    
                    // 记录请求时间
                    this.lastRequestTime = Date.now();
                    
                    // 调用API获取修复建议
                    const response = await fetch(apiEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: vscode.workspace.getConfiguration('programmingPractice').get('aiModelName', 'lite'),
                            messages: [
                                { "role": "system", "content": "你是一个C++代码修复助手。根据问题描述提供具体的修复代码。" },
                                { "role": "user", "content": prompt }
                            ],
                            temperature: 0.1,
                            max_tokens: 1000
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
                    }

                    const data = await response.json();
                    const fixSuggestion = data.choices[0].message.content;
                    
                    // 提取代码片段
                    const codeMatch = fixSuggestion.match(/```(?:cpp)?\s*([\s\S]*?)\s*```/);
                    const fixedCode = codeMatch ? codeMatch[1].trim() : fixSuggestion.trim();
                    
                    // 创建一个新的Webview来显示修复建议
                    const panel = vscode.window.createWebviewPanel(
                        'aiCodeFix',
                        'AI代码修复建议',
                        vscode.ViewColumn.Beside,
                        { enableScripts: true }
                    );
                    
                    panel.webview.html = this.getFixSuggestionHtml(diagnostic.message, suggestionText, fixedCode);
                    
                    // 处理应用修复的消息
                    panel.webview.onDidReceiveMessage(async message => {
                        if (message.command === 'applyFix') {
                            // 应用修复
                            const edit = new vscode.WorkspaceEdit();
                            const problemLine = diagnostic.range.start.line;
                            
                            // 将修复后的代码插入到问题行
                            edit.replace(document.uri, diagnostic.range, message.fixedCode);
                            
                            await vscode.workspace.applyEdit(edit);
                            vscode.window.showInformationMessage('已应用AI修复');
                            panel.dispose();
                        }
                    });
                    
                } catch (error) {
                    vscode.window.showErrorMessage(`获取AI修复建议失败: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`应用AI建议时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 获取更多关于问题的AI帮助
     */
    public async getAdditionalHelp(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): Promise<void> {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "获取AI详细解释...",
                cancellable: false
            }, async () => {
                const apiKey = vscode.workspace.getConfiguration('programmingPractice').get('aiApiKey', '');
                const apiEndpoint = vscode.workspace.getConfiguration('programmingPractice').get('aiApiEndpoint', '');
                
                // 准备上下文代码
                const lineNumber = diagnostic.range.start.line;
                const startLine = Math.max(0, lineNumber - 10);
                const endLine = Math.min(document.lineCount - 1, lineNumber + 10);
                
                let contextCode = '';
                for (let i = startLine; i <= endLine; i++) {
                    const line = document.lineAt(i).text;
                    if (i === lineNumber) {
                        contextCode += `→ ${line}\n`; // 标记问题行
                    } else {
                        contextCode += `  ${line}\n`;
                    }
                }
                
                const prompt = `请详细解释以下C++代码中的问题并提供多种解决方案。问题描述是: "${diagnostic.message}"。
                
代码上下文:
\`\`\`cpp
${contextCode}
\`\`\`

请提供:
1. 问题的详细分析和为什么会引起这个错误
2. 至少两种不同的修复方案，并解释每种方案的优缺点
3. 可能的最佳实践和相关C++知识点`;
                
                try {
                    // 延迟以尊重API速率限制
                    const now = Date.now();
                    const minInterval = vscode.workspace.getConfiguration('programmingPractice').get('aiApiMinIntervalMs', 2000);
                    if (now - this.lastRequestTime < minInterval) {
                        await new Promise(resolve => setTimeout(resolve, minInterval - (now - this.lastRequestTime)));
                    }
                    
                    // 记录请求时间
                    this.lastRequestTime = Date.now();
                    
                    // 调用API获取帮助内容
                    const response = await fetch(apiEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: vscode.workspace.getConfiguration('programmingPractice').get('aiModelName', 'lite'),
                            messages: [
                                { "role": "system", "content": "你是一个熟练的C++编程教师，你的任务是帮助解释代码问题并提供多种解决方案。" },
                                { "role": "user", "content": prompt }
                            ],
                            temperature: 0.3,
                            max_tokens: 2000
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
                    }

                    const data = await response.json();
                    const helpContent = data.choices[0].message.content;
                    
                    // 创建一个新的Webview来显示详细帮助
                    const panel = vscode.window.createWebviewPanel(
                        'aiCodeHelp',
                        'AI代码问题详解',
                        vscode.ViewColumn.Beside,
                        { 
                            enableScripts: true,
                            enableCommandUris: true
                        }
                    );
                    
                    panel.webview.html = this.getAdditionalHelpHtml(diagnostic.message, helpContent);
                    
                } catch (error) {
                    vscode.window.showErrorMessage(`获取AI帮助失败: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`获取AI帮助时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 获取AI修复建议HTML
     */
    private getFixSuggestionHtml(problemMessage: string, suggestion: string, fixedCode: string): string {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
            <style>
                body {
                    padding: 20px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    line-height: 1.6;
                }
                .problem {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    padding: 10px;
                    margin-bottom: 15px;
                    border-radius: 5px;
                }
                .suggestion {
                    background-color: var(--vscode-inputValidation-infoBackground);
                    border: 1px solid var(--vscode-inputValidation-infoBorder);
                    padding: 10px;
                    margin-bottom: 15px;
                    border-radius: 5px;
                }
                .fixed-code {
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    border: 1px solid var(--vscode-input-border);
                    padding: 10px;
                    white-space: pre;
                    overflow-x: auto;
                    font-family: 'Consolas', 'Courier New', monospace;
                    margin-bottom: 20px;
                    border-radius: 5px;
                }
                .button-container {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 12px;
                    cursor: pointer;
                    border-radius: 3px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .title {
                    font-size: 1.2em;
                    font-weight: bold;
                    margin-bottom: 5px;
                    color: var(--vscode-editor-foreground);
                }
            </style>
        </head>
        <body>
            <div class="title">代码问题:</div>
            <div class="problem">${problemMessage}</div>
            
            <div class="title">建议修复:</div>
            <div class="suggestion">${suggestion}</div>
            
            <div class="title">AI生成的修复代码:</div>
            <pre class="fixed-code" id="fixedCode">${fixedCode}</pre>
            
            <div class="button-container">
                <button id="applyButton">应用修复</button>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('applyButton').addEventListener('click', () => {
                    const fixedCode = document.getElementById('fixedCode').textContent;
                    vscode.postMessage({
                        command: 'applyFix',
                        fixedCode: fixedCode
                    });
                });
            </script>
        </body>
        </html>`;
    }

    /**
     * 获取AI额外帮助HTML
     */
    private getAdditionalHelpHtml(problemMessage: string, helpContent: string): string {
        // 将Markdown格式的帮助内容转换为HTML
        const formattedContent = helpContent
            .replace(/```(\w*)([\s\S]*?)```/g, '<pre class="code-block">$2</pre>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/^(#+)\s+(.*?)$/gm, (_, level, text) => {
                const headingLevel = Math.min(level.length + 2, 6); // h3 to h6
                return `<h${headingLevel}>${text}</h${headingLevel}>`;
            });

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
            <style>
                body {
                    padding: 20px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    line-height: 1.6;
                }
                .problem {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    padding: 10px;
                    margin-bottom: 20px;
                    border-radius: 5px;
                }
                .help-content {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-input-border);
                    padding: 20px;
                    margin-top: 20px;
                    border-radius: 5px;
                    overflow-x: auto;
                }
                .code-block {
                    background-color: var(--vscode-textCodeBlock-background);
                    color: var(--vscode-textCodeBlock-foreground);
                    padding: 8px;
                    margin: 10px 0;
                    white-space: pre;
                    overflow-x: auto;
                    font-family: 'Consolas', 'Courier New', monospace;
                    border-radius: 3px;
                }
                .title {
                    font-size: 1.5em;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: var(--vscode-editor-foreground);
                    border-bottom: 1px solid var(--vscode-input-border);
                    padding-bottom: 5px;
                }
                h3, h4, h5, h6 {
                    color: var(--vscode-editorLightBulb-foreground);
                    margin-top: 20px;
                    margin-bottom: 10px;
                }
                strong {
                    color: var(--vscode-symbolIcon-classForeground);
                }
            </style>
        </head>
        <body>
            <div class="title">AI代码问题详解</div>
            
            <div class="problem">
                <strong>问题:</strong> ${problemMessage}
            </div>
            
            <div class="help-content">
                ${formattedContent}
            </div>
        </body>
        </html>`;
    }
}

/**
 * 快速修复提供者 - 为AI代码分析提供的问题提供修复建议
 */
class AICodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] | undefined {
        const actions: vscode.CodeAction[] = [];
        
        // 为每个AI分析产生的诊断信息提供代码操作
        for (const diagnostic of context.diagnostics) {
            // 检查是否是AI分析生成的诊断信息
            if (diagnostic.source === '🤖 AI代码分析') {
                // 如果有相关信息包含建议，则提供快速修复
                if (diagnostic.relatedInformation && diagnostic.relatedInformation.length > 0) {
                    const suggestion = diagnostic.relatedInformation[0].message;
                    if (suggestion.startsWith('建议:')) {
                        // 创建代码操作
                        const action = new vscode.CodeAction(
                            '🤖 ' + suggestion.substring(3).trim(),
                            vscode.CodeActionKind.QuickFix
                        );
                        action.diagnostics = [diagnostic];
                        
                        // 添加执行命令
                        action.command = {
                            command: 'programmingPractice.requestAIFix',
                            title: '应用AI建议',
                            arguments: [document, diagnostic, suggestion]
                        };
                        
                        actions.push(action);
                    }
                }
                
                // 添加一个操作来请求更多帮助
                const helpAction = new vscode.CodeAction(
                    '获取更多帮助这个问题',
                    vscode.CodeActionKind.QuickFix
                );
                helpAction.diagnostics = [diagnostic];
                helpAction.command = {
                    command: 'programmingPractice.requestAIHelp',
                    title: '获取更多帮助',
                    arguments: [document, diagnostic]
                };
                
                actions.push(helpAction);
            }
        }
        
        return actions;
    }
}
