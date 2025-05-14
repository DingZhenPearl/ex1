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
                        // 确保API端点包含chat/completions路径
                        const endpoint = apiEndpoint.endsWith('/') ? `${apiEndpoint}chat/completions` : `${apiEndpoint}/chat/completions`;

                        const response = await fetch(endpoint, {
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

                // 修改：将错误级别降低为警告级别
                let severity: vscode.DiagnosticSeverity;
                switch (issue.severity?.toLowerCase()) {
                    case 'error':
                        // 将错误改为警告级别，以不中断调试
                        severity = vscode.DiagnosticSeverity.Warning;
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
                diagnostic.source = '🤖 AI代码分析 (仅警告)';

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

                // 使用整个文件作为上下文，而不仅仅是问题行周围的代码
                const entireFileContent = document.getText();
                const lineNumber = diagnostic.range.start.line;

                // 创建带有问题行标记的完整文件内容
                let markedFileContent = '';
                for (let i = 0; i < document.lineCount; i++) {
                    const line = document.lineAt(i).text;
                    if (i === lineNumber) {
                        markedFileContent += `→ ${line}\n`; // 标记问题行
                    } else {
                        markedFileContent += `  ${line}\n`;
                    }
                }

                // 改进提示词，明确指示只需要返回修改部分的代码
                const prompt = `我需要修复以下C++代码中的问题。问题描述是: "${diagnostic.message}"。建议修复方法是: "${suggestionText}"。

我正在提供整个文件的内容，问题行用→标记。请分析整个文件上下文，包括所有函数、类定义和依赖关系，然后提供针对标记行的修复代码。

\`\`\`cpp
${markedFileContent}
\`\`\`

请提供修复后的代码片段，确保语法正确且完整，与整个文件的其余部分保持一致。`;

                try {
                    // 延迟以尊重API速率限制
                    const now = Date.now();
                    const minInterval = vscode.workspace.getConfiguration('programmingPractice').get('aiApiMinIntervalMs', 2000);
                    if (now - this.lastRequestTime < minInterval) {
                        await new Promise(resolve => setTimeout(resolve, minInterval - (now - this.lastRequestTime)));
                    }

                    // 记录请求时间
                    this.lastRequestTime = Date.now();

                    // 确保API端点包含chat/completions路径
                    const endpoint = apiEndpoint.endsWith('/') ? `${apiEndpoint}chat/completions` : `${apiEndpoint}/chat/completions`;

                    // 调用API获取修复建议
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: vscode.workspace.getConfiguration('programmingPractice').get('aiModelName', 'lite'),
                            messages: [
                                {
                                    "role": "system",
                                    "content": "你是一个C++代码修复专家。请根据整个文件的上下文提供精确的修复代码。确保修复与周围代码风格一致，并保持代码的整体结构和语义。"
                                },
                                { "role": "user", "content": prompt }
                            ],
                            temperature: 0.1,
                            max_tokens: 4000 // 增加token限制以处理更大的文件和更复杂的修复
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
                    }

                    const data = await response.json();
                    const fixSuggestion = data.choices[0].message.content;

                    // 提取代码片段并进行验证
                    let fixedCode = '';
                    const codeMatch = fixSuggestion.match(/```(?:cpp)?\s*([\s\S]*?)\s*```/);

                    if (codeMatch) {
                        // 从代码块中提取
                        fixedCode = codeMatch[1].trim();
                    } else {
                        // 如果没有代码块标记，尝试提取整个响应
                        fixedCode = fixSuggestion.trim();
                    }

                    // 增加代码验证和修复逻辑
                    fixedCode = this.validateAndFixCode(fixedCode);

                    // 创建一个新的Webview来显示修复建议，增加代码预览的高度
                    const panel = vscode.window.createWebviewPanel(
                        'aiCodeFix',
                        'AI代码修复建议',
                        vscode.ViewColumn.Beside,
                        { enableScripts: true }
                    );

                    panel.webview.html = this.getFixSuggestionHtml(diagnostic.message, suggestionText, fixedCode);

                    // 处理webview消息
                    panel.webview.onDidReceiveMessage(async message => {
                        if (message.command === 'copyCode') {
                            // 复制代码到剪贴板
                            await vscode.env.clipboard.writeText(message.code);
                            vscode.window.showInformationMessage('已复制修复代码到剪贴板');
                        } else if (message.command === 'close') {
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
                    max-height: 100vh;
                    overflow-y: hidden;
                    display: flex;
                    flex-direction: column;
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
                .fixed-code-container {
                    flex: 1;
                    overflow-y: auto;
                    margin-bottom: 15px;
                }
                .editor-container {
                    height: 300px;
                    margin-bottom: 15px;
                }
                #codeEditor {
                    height: 100%;
                    width: 100%;
                    border: 1px solid var(--vscode-input-border);
                    font-family: 'Consolas', 'Courier New', monospace;
                    padding: 8px;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .button-container {
                    display: flex;
                    justify-content: space-between;
                    gap: 10px;
                    margin-top: auto;
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
                .info-text {
                    font-style: italic;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 10px;
                }
                .line-number {
                    background-color: var(--vscode-editorLineNumber-foreground);
                    color: var(--vscode-editor-background);
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 0.8em;
                    margin-left: 5px;
                }
            </style>
        </head>
        <body>
            <div class="title">代码问题:</div>
            <div class="problem">${problemMessage}</div>

            <div class="title">建议修复:</div>
            <div class="suggestion">${suggestion}</div>

            <div class="info-text">请手动复制下面的修复代码并在编辑器中应用:</div>

            <div class="title">AI生成的修复代码:</div>
            <div class="editor-container">
                <textarea id="codeEditor" spellcheck="false">${fixedCode}</textarea>
            </div>

            <div class="button-container">
                <button id="closeButton">关闭</button>
                <button id="copyButton">复制代码</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                // 允许用户编辑生成的代码
                const editor = document.getElementById('codeEditor');

                // 复制按钮点击事件
                document.getElementById('copyButton').addEventListener('click', () => {
                    const code = editor.value;
                    vscode.postMessage({
                        command: 'copyCode',
                        code: code
                    });
                });

                // 关闭按钮点击事件
                document.getElementById('closeButton').addEventListener('click', () => {
                    vscode.postMessage({ command: 'close' });
                });

                // 自动调整文本区域大小以适应内容
                function adjustTextareaHeight() {
                    editor.style.height = 'auto';
                    editor.style.height = Math.min(400, editor.scrollHeight) + 'px';
                }

                // 初始调整和输入时调整
                adjustTextareaHeight();
                editor.addEventListener('input', adjustTextareaHeight);
            </script>
        </body>
        </html>`;
    }

    /**
     * 验证并修复代码片段中的常见问题
     */
    private validateAndFixCode(code: string): string {
        if (!code) {
            return code;
        }

        // 修复常见的不完整代码问题
        let fixedCode = code;

        // 1. 修复不完整的include语句
        const incompleteInclude = fixedCode.match(/#include\s*$/m);
        if (incompleteInclude) {
            fixedCode = fixedCode.replace(/#include\s*$/m, '#include <iostream>');
        }

        // 2. 修复不完整的cout语句
        fixedCode = fixedCode.replace(/cout\s*<<\s*["'](.+?)["']\s*<$/gm, 'cout << "$1" << endl;');

        // 3. 检查是否有不匹配的括号
        const openBraces = (fixedCode.match(/{/g) || []).length;
        const closeBraces = (fixedCode.match(/}/g) || []).length;

        if (openBraces > closeBraces) {
            // 添加缺少的右花括号
            for (let i = 0; i < openBraces - closeBraces; i++) {
                fixedCode += '\n}';
            }
        }

        // 4. 检查语句末尾的分号
        const lines = fixedCode.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // 如果行以字母、数字、右括号、引号或右中括号结束，但没有分号，添加分号
            if (line &&
                !line.endsWith(';') &&
                !line.endsWith('{') &&
                !line.endsWith('}') &&
                !line.endsWith(':') &&
                !line.match(/^\s*#/) && // 不是预处理指令
                !line.match(/^\s*\/\//) && // 不是注释
                line.match(/[a-zA-Z0-9"'\])]$/)) {
                lines[i] = lines[i] + ';';
            }
        }
        fixedCode = lines.join('\n');

        // 5. 确保main函数有返回语句
        if (fixedCode.includes('int main(') && !fixedCode.includes('return 0;')) {
            // 查找最后一个右花括号的位置
            const lastBraceIndex = fixedCode.lastIndexOf('}');
            if (lastBraceIndex > 0) {
                fixedCode = fixedCode.slice(0, lastBraceIndex) + '\n    return 0;\n' + fixedCode.slice(lastBraceIndex);
            }
        }

        return fixedCode;
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

                // 使用整个文件作为上下文
                const entireFileContent = document.getText();
                const lineNumber = diagnostic.range.start.line;

                // 创建带有问题行标记的完整文件内容
                let markedFileContent = '';
                for (let i = 0; i < document.lineCount; i++) {
                    const line = document.lineAt(i).text;
                    if (i === lineNumber) {
                        markedFileContent += `→ ${line}\n`; // 标记问题行
                    } else {
                        markedFileContent += `  ${line}\n`;
                    }
                }

                const prompt = `请详细解释以下C++代码中的问题并提供多种解决方案。问题描述是: "${diagnostic.message}"。

我正在提供整个文件的源代码，问题行用→标记。请分析整个文件上下文来更全面地理解问题。

代码:
\`\`\`cpp
${markedFileContent}
\`\`\`

请提供:
1. 问题的详细分析和为什么会引起这个错误
2. 此问题如何影响整个程序的运行
3. 至少两种不同的修复方案，并解释每种方案的优缺点
4. 可能的最佳实践和相关C++知识点`;

                try {
                    // 延迟以尊重API速率限制
                    const now = Date.now();
                    const minInterval = vscode.workspace.getConfiguration('programmingPractice').get('aiApiMinIntervalMs', 2000);
                    if (now - this.lastRequestTime < minInterval) {
                        await new Promise(resolve => setTimeout(resolve, minInterval - (now - this.lastRequestTime)));
                    }

                    // 记录请求时间
                    this.lastRequestTime = Date.now();

                    // 确保API端点包含chat/completions路径
                    const endpoint = apiEndpoint.endsWith('/') ? `${apiEndpoint}chat/completions` : `${apiEndpoint}/chat/completions`;

                    // 调用API获取帮助内容
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: vscode.workspace.getConfiguration('programmingPractice').get('aiModelName', 'lite'),
                            messages: [
                                { "role": "system", "content": "你是一个熟练的C++编程教师，你的任务是基于完整源代码文件帮助解释代码问题并提供多种解决方案。" },
                                { "role": "user", "content": prompt }
                            ],
                            temperature: 0.3,
                            max_tokens: 4000 // 增加token限制以处理更大的文件和更详细的解释
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

    /**
     * 调用AI API的通用方法
     * 这个方法抽象出了API调用的通用逻辑，便于其他组件复用
     */
    public async callAIApi(prompt: string, systemRole: string, temperature: number = 0.3, maxTokens: number = 2000): Promise<string> {
        const apiKey = vscode.workspace.getConfiguration('programmingPractice').get('aiApiKey', '');
        if (!apiKey) {
            vscode.window.showWarningMessage('未配置AI API密钥，无法进行AI分析', '打开设置').then(selection => {
                if (selection === '打开设置') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'programmingPractice.aiApiKey');
                }
            });
            throw new Error('未配置AI API密钥');
        }

        const apiEndpoint = vscode.workspace.getConfiguration('programmingPractice').get('aiApiEndpoint', '');

        // 检查API调用频率限制
        const now = Date.now();
        const minInterval = vscode.workspace.getConfiguration('programmingPractice').get('aiApiMinIntervalMs', 2000);

        if (now - this.lastRequestTime < minInterval) {
            // 需要等待以满足频率限制
            const delay = minInterval - (now - this.lastRequestTime);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // 记录请求时间
        this.lastRequestTime = Date.now();

        // 添加重试逻辑
        let retries = 3;
        let lastError: Error | null = null;

        while (retries > 0) {
            try {
                // 确保API端点包含chat/completions路径
                const endpoint = apiEndpoint.endsWith('/') ? `${apiEndpoint}chat/completions` : `${apiEndpoint}/chat/completions`;

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: vscode.workspace.getConfiguration('programmingPractice').get('aiModelName', 'lite'),
                        messages: [
                            { "role": "system", "content": systemRole },
                            { "role": "user", "content": prompt }
                        ],
                        temperature: temperature,
                        max_tokens: maxTokens
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API调用失败: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const data = await response.json();
                return data.choices[0].message.content;
            } catch (error) {
                retries--;
                lastError = error instanceof Error ? error : new Error(String(error));

                if (retries === 0) {
                    throw lastError;
                }
                console.log(`API调用失败，将在2秒后重试，剩余重试次数: ${retries}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // 如果所有重试都失败
        throw new Error('API调用失败，已达到最大重试次数');
    }

    /**
     * 为指定问题生成解决方案
     * @param problemId 问题ID
     * @param problemDescription 问题描述
     * @returns 生成的解决方案代码
     */
    public async generateSolution(problemId: string, problemDescription: string): Promise<string | undefined> {
        try {
            // 显示进度通知
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "AI正在生成解答...",
                cancellable: false
            }, async () => {
                // 获取问题的代码模板或默认模板
                const codeTemplate = await this.getProblemTemplate(problemId);

                // 构建更详细的提示
                const prompt = `请为以下C++编程题目生成完整的解答代码：

问题ID: ${problemId}

问题描述:
${problemDescription}

请提供一个完整的、可以正确通过测试的解决方案，并确保代码包含必要的注释来解释关键步骤。
生成的代码必须是完整的C++程序，包含所有必要的头文件、主函数和辅助函数。

${codeTemplate ? `以下是代码模板，请基于此完成解答：
\`\`\`cpp
${codeTemplate}
\`\`\`` : ''}

请生成完整的代码解答：`;

                try {
                    // 使用通用AI API调用函数获取解答，增加令牌限制
                    const solution = await this.callAIApi(
                        prompt,
                        "你是一个C++编程助手。你的任务是为编程题目生成完整、可编译、可以通过所有测试用例的正确解决方案。请生成完整的程序，包含所有必要的头文件和实现。",
                        0.2,
                        4000  // 增加令牌限制，允许生成更长的代码
                    );

                    // 改进代码提取逻辑
                    let extractedCode: string;
                    const codeBlockMatch = solution.match(/```(?:cpp|c\+\+)?\s*([\s\S]*?)\s*```/);

                    if (codeBlockMatch) {
                        // 从代码块中提取
                        extractedCode = codeBlockMatch[1].trim();
                    } else {
                        // 如果没有代码块标记，尝试识别代码部分
                        const lines = solution.split('\n');
                        const codeLines = lines.filter(line =>
                            !line.startsWith('#') && // 不是Markdown标题
                            !line.match(/^[A-Za-z][\w\s]+:/) && // 不是标签行
                            !line.match(/^(\d+\.|\*|\-)\s/) // 不是列表项
                        );
                        extractedCode = codeLines.join('\n').trim();
                    }

                    // 验证提取的代码是否看起来像有效的C++代码
                    if (!this.looksLikeCppCode(extractedCode)) {
                        console.log('生成的内容不像有效的C++代码，尝试重新提取');
                        // 如果不像有效代码，尝试一个简单的启发式方法：找到第一个#include和最后一个}之间的所有内容
                        const includeIndex = solution.indexOf('#include');
                        if (includeIndex >= 0) {
                            const lastBraceIndex = solution.lastIndexOf('}');
                            if (lastBraceIndex > includeIndex) {
                                extractedCode = solution.substring(includeIndex, lastBraceIndex + 1).trim();
                            }
                        }
                    }

                    // 如果代码仍然为空或太短，返回整个响应
                    if (!extractedCode || extractedCode.length < 50) {
                        return solution.trim();
                    }

                    return extractedCode;
                } catch (error) {
                    vscode.window.showErrorMessage(`生成解答失败: ${error instanceof Error ? error.message : String(error)}`);
                    return undefined;
                }
            });
        } catch (error) {
            console.error('生成解答时出错:', error);
            vscode.window.showErrorMessage(`生成解答时出错: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * 检查文本是否看起来像有效的C++代码
     */
    private looksLikeCppCode(text: string): boolean {
        // 检查是否包含常见的C++代码模式
        const hasInclude = /#include\s*</.test(text);
        const hasMainFunction = /\bint\s+main\s*\(/.test(text);
        const hasTypicalSyntax = /\b(if|for|while|return|void|int|string|vector)\b/.test(text);
        const hasCurlyBraces = /{/.test(text) && /}/.test(text);

        // 至少满足部分条件
        return (hasInclude || hasMainFunction) && hasTypicalSyntax && hasCurlyBraces;
    }

    /**
     * 获取指定问题ID的代码模板
     */
    private async getProblemTemplate(problemId: string): Promise<string | undefined> {
        // 为常见题目提供模板
        const templates: Record<string, string> = {
            '1': `#include <iostream>
#include <vector>
#include <nlohmann/json.hpp>
using namespace std;
using json = nlohmann::json;

int main() {
    // 读取输入数组和目标值
    vector<int> nums;
    int num, target;

    // 读取所有输入数字，直到EOF
    while (cin >> num) {
        nums.push_back(num);
    }

    // 最后一个数字是目标和
    if (!nums.empty()) {
        target = nums.back();
        nums.pop_back();  // 从数组中移除目标和
    }

    // TODO: 在这里实现你的解决方案
    // 要求：找到两个数的和等于target，返回它们的下标

    // 输出结果
    json result = json::array({0, 1});  // 替换成实际找到的下标
    cout << result << endl;

    return 0;
}`,
            '2': `#include <iostream>
#include <string>
using namespace std;

int main() {
    int x;
    cin >> x;

    // TODO: 在这里实现你的解决方案
    // 要求：判断x是否为回文数

    // 输出结果
    cout << "true" << endl;  // 或 cout << "false" << endl;

    return 0;
}`,
        };

        return templates[problemId];
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
            // 检查是否是AI分析生成的诊断信息 - 更新为匹配新的诊断源标识
            if (diagnostic.source === '🤖 AI代码分析 (仅警告)' || diagnostic.source === '🤖 AI代码分析') {
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
