import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { AICodeAnalyzer } from './aiCodeAnalyzer';

/**
 * AI代码补全提供程序
 */
export class AICodeCompletionProvider implements vscode.CompletionItemProvider {
    private lastRequestTime: number = 0;
    private completionCache: Map<string, vscode.CompletionItem[]> = new Map();
    private aiAnalyzer: AICodeAnalyzer;
    
    constructor() {
        this.aiAnalyzer = AICodeAnalyzer.getInstance();
    }

    /**
     * 提供代码补全项
     */
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.CompletionItem[] | undefined> {
        // 检查是否启用AI补全
        if (!this.isCompletionEnabled()) {
            return undefined;
        }
        
        // 获取当前行和触发字符前的文本
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        
        // 检查是否适合触发补全
        if (!this.shouldTriggerCompletion(linePrefix)) {
            return undefined;
        }
        
        try {
            // 计算上下文哈希值，用于缓存
            const contextHash = this.getContextHash(document, position);
            
            // 检查缓存
            if (this.completionCache.has(contextHash)) {
                return this.completionCache.get(contextHash);
            }
            
            // 检查API调用频率限制
            const now = Date.now();
            const minInterval = vscode.workspace.getConfiguration('programmingPractice')
                .get('aiApiMinIntervalMs', 2000);
            
            if (now - this.lastRequestTime < minInterval) {
                // 需要等待以满足频率限制
                const delay = minInterval - (now - this.lastRequestTime);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // 记录请求时间
            this.lastRequestTime = Date.now();
            
            // 获取补全建议
            const completionItems = await this.getCompletionSuggestions(document, position);
            
            // 缓存结果
            this.completionCache.set(contextHash, completionItems);
            
            return completionItems;
        } catch (error) {
            console.error('获取AI补全建议失败:', error);
            return undefined;
        }
    }
    
    /**
     * 是否应该触发补全
     */
    private shouldTriggerCompletion(linePrefix: string): boolean {
        // 减少过于频繁的补全触发: 
        // 只有当用户停止输入一会儿或者按下了Tab键时才应该触发补全
        
        // 如果行为空或者只有空格，不触发
        if (!linePrefix.trim()) {
            return false;
        }
        
        // 如果正在输入注释，不触发
        if (linePrefix.trim().startsWith('//')) {
            return false;
        }
        
        // 至少需要有一定数量的字符
        if (linePrefix.trim().length < 3) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 获取上下文哈希值
     */
    private getContextHash(document: vscode.TextDocument, position: vscode.Position): string {
        // 获取光标前后的少量代码作为上下文
        const startLine = Math.max(0, position.line - 5);
        const endLine = Math.min(document.lineCount - 1, position.line + 5);
        
        let contextText = '';
        for (let i = startLine; i <= endLine; i++) {
            if (i === position.line) {
                // 只包含当前光标之前的文本
                contextText += document.lineAt(i).text.substring(0, position.character) + '|CURSOR|';
            } else {
                contextText += document.lineAt(i).text;
            }
            contextText += '\n';
        }
        
        // 返回一个简单的哈希
        return `${document.uri.toString()}-${position.line}-${position.character}-${this.simpleHash(contextText)}`;
    }
    
    /**
     * 简单的哈希函数
     */
    private simpleHash(text: string): string {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0; // 转换为32位整数
        }
        return hash.toString(16);
    }

    /**
     * 获取代码补全建议
     */
    private async getCompletionSuggestions(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        // 获取上下文代码
        const startLine = Math.max(0, position.line - 10);
        const endLine = Math.min(document.lineCount - 1, position.line);
        
        let contextCode = '';
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i).text;
            if (i === position.line) {
                // 只取光标之前的文本
                contextCode += line.substring(0, position.character);
            } else {
                contextCode += line + '\n';
            }
        }

        try {
            // 显示状态消息
            const statusMessage = vscode.window.setStatusBarMessage('$(loading~spin) AI代码补全中...');
            
            // 使用AI分析器的接口调用API
            const apiKey = vscode.workspace.getConfiguration('programmingPractice')
                .get('aiApiKey', '');
            const apiEndpoint = vscode.workspace.getConfiguration('programmingPractice')
                .get('aiApiEndpoint', '');
            
            const prompt = `我正在编写C++代码。请为下面的代码提供3-5个可能的补全建议，每个建议不超过一行代码。只返回代码补全部分，不要包含解释，不要添加提示文本。
代码上下文:
\`\`\`cpp
${contextCode}
\`\`\`

可能的补全（每个补全一行，最多5行）:`;
            
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: vscode.workspace.getConfiguration('programmingPractice')
                        .get('aiModelName', 'lite'),
                    messages: [
                        { 
                            "role": "system", 
                            "content": "你是一个C++代码补全助手。请仅返回可能的代码补全内容，不要包含解释，也不要添加任何额外文本。每个补全不超过一行代码。" 
                        },
                        { "role": "user", "content": prompt }
                    ],
                    temperature: 0.2,
                    max_tokens: 300
                })
            });
            
            // 清除状态消息
            statusMessage.dispose();
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            const completionText = data.choices[0].message.content;
            
            // 解析补全建议
            return this.parseCompletionSuggestions(completionText, document.languageId);
        } catch (error) {
            console.error('获取AI补全建议请求失败:', error);
            return [];
        }
    }

    /**
     * 解析AI返回的补全建议
     */
    private parseCompletionSuggestions(
        completionText: string, 
        languageId: string
    ): vscode.CompletionItem[] {
        const completionItems: vscode.CompletionItem[] = [];
        const suggestions = completionText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('```') && !line.toLowerCase().includes('completion'));
        
        suggestions.forEach((suggestion, index) => {
            if (index < 5) { // 最多5个建议
                const completionItem = new vscode.CompletionItem(
                    suggestion,
                    vscode.CompletionItemKind.Snippet
                );
                
                // 设置排序
                completionItem.sortText = `00${index}`;
                
                // 设置标签和详情
                completionItem.detail = '🤖 AI建议';
                completionItem.documentation = new vscode.MarkdownString('由AI生成的代码补全建议');
                
                // 设置图标、标签等
                completionItem.label = {
                    label: suggestion,
                    description: 'AI补全',
                    detail: this.getDetailByLanguage(languageId)
                };
                
                // 添加到结果列表
                completionItems.push(completionItem);
            }
        });
        
        return completionItems;
    }
    
    /**
     * 根据语言获取详细信息
     */
    private getDetailByLanguage(languageId: string): string {
        switch(languageId) {
            case 'cpp':
                return 'C++';
            case 'c':
                return 'C';
            default:
                return '';
        }
    }
    
    /**
     * 检查是否启用了AI补全
     */
    private isCompletionEnabled(): boolean {
        return vscode.workspace.getConfiguration('programmingPractice')
            .get('enableAICodeCompletion', true);
    }
}

/**
 * AI代码补全提供程序（Tab触发版）
 */
export class AITabCompletionProvider {
    private static instance: AITabCompletionProvider;
    private disposables: vscode.Disposable[] = [];
    private isTabPressed: boolean = false;
    private lastCompletionPosition: vscode.Position | null = null;
    private aiAnalyzer: AICodeAnalyzer;
    private tabCompletionDecorations: vscode.TextEditorDecorationType | undefined;
    private suggestedCompletion: { text: string, range: vscode.Range } | undefined;

    private constructor() {
        this.aiAnalyzer = AICodeAnalyzer.getInstance();
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): AITabCompletionProvider {
        if (!AITabCompletionProvider.instance) {
            AITabCompletionProvider.instance = new AITabCompletionProvider();
        }
        return AITabCompletionProvider.instance;
    }

    /**
     * 初始化Tab补全
     */
    public initialize(context: vscode.ExtensionContext) {
        // 注册Tab键处理程序
        this.registerTabHandler(context);

        // 监听编辑器变化
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && this.isTabCompletionVisible()) {
                    this.hideTabCompletion();
                }
            })
        );
        
        // 监听文本变化
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (this.isTabCompletionVisible()) {
                    this.hideTabCompletion();
                }
            })
        );
    }

    /**
     * 注册Tab键处理器
     */
    private registerTabHandler(context: vscode.ExtensionContext) {
        // 注册Tab键命令
        context.subscriptions.push(
            vscode.commands.registerCommand('programmingPractice.tabCompletion', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;

                // 如果当前已显示Tab补全建议，接受此建议
                if (this.isTabCompletionVisible() && this.suggestedCompletion) {
                    this.acceptCompletion(editor);
                    return;
                }

                // 检查是否启用了Tab补全
                if (!this.isTabCompletionEnabled()) {
                    // 向编辑器发送普通Tab键
                    await vscode.commands.executeCommand('tab');
                    return;
                }

                // 处理Tab补全
                this.handleTabCompletion(editor);
            })
        );
        
        // 修改键绑定方式，避免干扰正常输入
        // 不要直接拦截type命令，这会影响所有输入
        /* 
        context.subscriptions.push(
            vscode.commands.registerTextEditorCommand('type', async (textEditor, edit, args) => {
                // 这里的代码会干扰正常输入
                const char = args.text;
                if (char === '\t') {
                    this.isTabPressed = true;
                    await vscode.commands.executeCommand('programmingPractice.tabCompletion');
                    this.isTabPressed = false;
                } else if (this.isTabCompletionVisible()) {
                    // 如果用户按其他键，隐藏补全
                    this.hideTabCompletion();
                }
            })
        );
        */
        
        // 添加事件监听器来监听键盘事件
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (this.isTabCompletionVisible() && 
                    event.contentChanges.length > 0 &&
                    event.contentChanges[0].text !== '\t') {
                    // 如果用户输入了非Tab键，隐藏补全
                    this.hideTabCompletion();
                }
            })
        );
    }

    /**
     * 处理Tab键补全
     */
    private async handleTabCompletion(editor: vscode.TextEditor) {
        // 获取当前行和光标位置
        const position = editor.selection.active;
        const document = editor.document;
        const languageId = document.languageId;
        
        // 检查是否支持的语言
        if (languageId !== 'cpp' && languageId !== 'c') {
            // 向编辑器发送普通Tab键
            await vscode.commands.executeCommand('tab');
            return;
        }
        
        // 获取当前行文本
        const line = document.lineAt(position.line);
        const linePrefix = line.text.substring(0, position.character);
        
        // 如果前缀太短或在注释中，使用普通Tab键
        if (linePrefix.trim().length < 3 || linePrefix.trim().startsWith('//')) {
            await vscode.commands.executeCommand('tab');
            return;
        }
        
        try {
            // 显示状态消息
            const statusMessage = vscode.window.setStatusBarMessage('$(loading~spin) 获取AI代码补全...');
            
            // 获取补全建议
            const suggestion = await this.getTabCompletion(document, position);
            statusMessage.dispose();
            
            if (suggestion) {
                // 显示补全建议
                this.showTabCompletion(editor, position, suggestion);
                
                // 注册一个一次性的命令，让用户直接按Enter接受补全
                const disposable = vscode.commands.registerCommand('programmingPractice.acceptCompletion', () => {
                    this.acceptCompletion(editor);
                    disposable.dispose();
                });
                
                // 自动在5秒后处理掉这个命令
                setTimeout(() => {
                    disposable.dispose();
                }, 5000);
                
            } else {
                // 如果没有建议，执行普通Tab操作
                await vscode.commands.executeCommand('tab');
            }
        } catch (error) {
            console.error('Tab补全出错:', error);
            // 出错时执行普通Tab操作
            await vscode.commands.executeCommand('tab');
        }
    }

    /**
     * 获取Tab补全建议
     */
    private async getTabCompletion(
        document: vscode.TextDocument, 
        position: vscode.Position
    ): Promise<string | undefined> {
        try {
            // 准备上下文代码
            const startLine = Math.max(0, position.line - 8);
            const endLine = position.line;
            
            let contextCode = '';
            for (let i = startLine; i <= endLine; i++) {
                const line = document.lineAt(i).text;
                if (i === position.line) {
                    // 只包含光标前的文本
                    contextCode += line.substring(0, position.character);
                } else {
                    contextCode += line + '\n';
                }
            }

            // 调用AI API获取补全
            const apiKey = vscode.workspace.getConfiguration('programmingPractice')
                .get('aiApiKey', '');
            const apiEndpoint = vscode.workspace.getConfiguration('programmingPractice')
                .get('aiApiEndpoint', '');
            
            const prompt = `请为下面的C++代码提供一个自然的补全。只返回最可能的补全内容，不要包含解释或注释，不要包括开头的缩进，不要重复已有的代码。以下是当前代码上下文：
\`\`\`cpp
${contextCode}
\`\`\`

补全:`;

            // 使用现有的callAIApi方法而不是直接调用API
            const aiAnalyzer = AICodeAnalyzer.getInstance();
            try {
                const completionText = await aiAnalyzer.callAIApi(
                    prompt,
                    "你是一个C++代码补全助手。只提供单行代码的自然补全，不要包含解释或任何其他文本。",
                    0.1,
                    100
                );
                
                // 处理返回结果
                const cleanedCompletion = completionText
                    .replace(/^```[\s\S]*?```$/gm, '') // 移除代码块标记
                    .replace(/^补全:/i, '') // 移除可能的"补全:"前缀
                    .trim();
                
                // 如果补全为空或无意义，返回undefined
                if (!cleanedCompletion || cleanedCompletion.length < 2) {
                    return undefined;
                }
                
                // 对补全内容进行智能处理
                const lineIndent = document.lineAt(position.line).text
                    .substring(0, document.lineAt(position.line).firstNonWhitespaceCharacterIndex);
                    
                // 检查是否需要添加缩进
                let finalCompletion = cleanedCompletion;
                if (cleanedCompletion.includes('\n')) {
                    // 多行补全，需要为每一行添加正确的缩进
                    finalCompletion = cleanedCompletion
                        .split('\n')
                        .map((line, index) => index > 0 ? lineIndent + line : line)
                        .join('\n');
                }
                
                return finalCompletion;
            } catch (error) {
                console.log('AI API调用失败:', error);
                return undefined;
            }
        } catch (error) {
            console.error('获取Tab补全失败:', error);
            return undefined;
        }
    }

    /**
     * 显示Tab补全建议
     */
    private showTabCompletion(
        editor: vscode.TextEditor,
        position: vscode.Position,
        suggestion: string
    ) {
        // 先隐藏现有的补全
        this.hideTabCompletion();
        
        // 创建装饰类型
        this.tabCompletionDecorations = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: suggestion,
                color: new vscode.ThemeColor('editorGhostText.foreground'),
                fontStyle: 'italic'
            },
            backgroundColor: new vscode.ThemeColor('editor.hoverHighlightBackground')
        });
        
        // 应用装饰
        const range = new vscode.Range(position, position);
        editor.setDecorations(this.tabCompletionDecorations, [{ range }]);
        
        // 存储建议以便接受
        this.suggestedCompletion = {
            text: suggestion,
            range: range
        };
        
        this.lastCompletionPosition = position;
        
        // 添加状态栏提示
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = "📝 按Tab接受AI建议";
        statusBarItem.tooltip = "再次按Tab键接受AI代码补全建议";
        statusBarItem.show();
        
        // 5秒后自动隐藏状态栏和补全
        setTimeout(() => {
            statusBarItem.dispose();
            if (this.isTabCompletionVisible()) {
                this.hideTabCompletion();
            }
        }, 5000);
    }

    /**
     * 隐藏Tab补全建议
     */
    private hideTabCompletion() {
        if (this.tabCompletionDecorations) {
            // 通过设置空数组来移除装饰
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.setDecorations(this.tabCompletionDecorations, []);
            }
            
            // 清理资源
            this.tabCompletionDecorations.dispose();
            this.tabCompletionDecorations = undefined;
            this.suggestedCompletion = undefined;
            this.lastCompletionPosition = null;
        }
    }

    /**
     * 接受Tab补全建议
     */
    private acceptCompletion(editor: vscode.TextEditor) {
        if (!this.suggestedCompletion) return;
        
        const suggestion = this.suggestedCompletion.text;
        
        // 检查是否为多行补全
        if (suggestion.includes('\n')) {
            // 多行补全需要格式化处理
            editor.edit(editBuilder => {
                editBuilder.insert(this.suggestedCompletion!.range.start, suggestion);
            }).then(() => {
                this.hideTabCompletion();
                
                // 自动格式化刚插入的代码
                vscode.commands.executeCommand('editor.action.formatSelection');
            });
        } else {
            // 单行补全直接插入
            editor.edit(editBuilder => {
                editBuilder.insert(this.suggestedCompletion!.range.start, suggestion);
            }).then(() => {
                this.hideTabCompletion();
            });
        }
    }

    /**
     * 检查Tab补全是否可见
     */
    private isTabCompletionVisible(): boolean {
        return this.tabCompletionDecorations !== undefined;
    }

    /**
     * 检查是否启用Tab补全
     */
    private isTabCompletionEnabled(): boolean {
        return vscode.workspace.getConfiguration('programmingPractice')
            .get('enableTabCompletion', true);
    }

    /**
     * 释放资源
     */
    public dispose() {
        this.hideTabCompletion();
        this.disposables.forEach(d => d.dispose());
    }

    /**
     * 处理缓存管理以提高性能
     */
    private completionCache = new Map<string, string>();
    private readonly MAX_CACHE_SIZE = 50;
    
    /**
     * 添加到缓存
     */
    private addToCache(key: string, completion: string): void {
        // 如果缓存已满，移除最早的条目
        if (this.completionCache.size >= this.MAX_CACHE_SIZE) {
            const firstKey = this.completionCache.keys().next().value;
            if (firstKey !== undefined) {
                this.completionCache.delete(firstKey);
            }
        }
        
        this.completionCache.set(key, completion);
    }
    
    /**
     * 从缓存获取
     */
    private getFromCache(key: string): string | undefined {
        return this.completionCache.get(key);
    }
    
    /**
     * 计算缓存键
     */
    private getCacheKey(document: vscode.TextDocument, position: vscode.Position): string {
        // 使用上下文代码作为缓存键
        const startLine = Math.max(0, position.line - 3);
        const contextLines = [];
        
        for (let i = startLine; i <= position.line; i++) {
            if (i === position.line) {
                contextLines.push(document.lineAt(i).text.substring(0, position.character));
            } else {
                contextLines.push(document.lineAt(i).text);
            }
        }
        
        return contextLines.join('\n');
    }
}

/**
 * 智能代码补全服务
 * 结合IDE的自动补全和AI补全，提供更智能的体验
 */
export class SmartCodeCompletionService {
    private static instance: SmartCodeCompletionService;
    private disposables: vscode.Disposable[] = [];
    private tabCompletionProvider: AITabCompletionProvider;
    private completionProvider: AICodeCompletionProvider;
    
    private constructor() {
        this.tabCompletionProvider = AITabCompletionProvider.getInstance();
        this.completionProvider = new AICodeCompletionProvider();
    }
    
    /**
     * 获取单例实例
     */
    public static getInstance(): SmartCodeCompletionService {
        if (!SmartCodeCompletionService.instance) {
            SmartCodeCompletionService.instance = new SmartCodeCompletionService();
        }
        return SmartCodeCompletionService.instance;
    }
    
    /**
     * 初始化智能补全服务
     */
    public initialize(context: vscode.ExtensionContext): void {
        // 仅在设置启用时注册Tab补全
        if (this.isTabCompletionEnabled()) {
            this.tabCompletionProvider.initialize(context);
        }
        
        // 仅在设置启用时注册常规补全
        if (this.isCompletionEnabled()) {
            context.subscriptions.push(
                vscode.languages.registerCompletionItemProvider(
                    ['cpp', 'c'], 
                    this.completionProvider,
                    '.', ':', '>', '(', '[' // 触发字符
                )
            );
        }
        
        // 注册状态栏项
        this.initializeStatusBar(context);
        
        // 监听配置变更
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('programmingPractice.enableAICodeCompletion') ||
                    e.affectsConfiguration('programmingPractice.enableTabCompletion')) {
                    this.updateStatusBar();
                }
            })
        );
    }
    
    private statusBarItem: vscode.StatusBarItem | undefined;
    
    /**
     * 初始化状态栏
     */
    private initializeStatusBar(context: vscode.ExtensionContext): void {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        this.statusBarItem.command = 'programmingPractice.toggleAICodeCompletion';
        this.updateStatusBar();
        this.statusBarItem.show();
        
        context.subscriptions.push(this.statusBarItem);
    }
    
    /**
     * 更新状态栏显示
     */
    private updateStatusBar(): void {
        if (!this.statusBarItem) return;
        
        const completionEnabled = vscode.workspace.getConfiguration('programmingPractice').get('enableAICodeCompletion', true);
        const tabEnabled = vscode.workspace.getConfiguration('programmingPractice').get('enableTabCompletion', true);
        
        if (completionEnabled) {
            this.statusBarItem.text = `$(sparkle) AI补全${tabEnabled ? '+Tab' : ''}`;
            this.statusBarItem.tooltip = `AI代码补全已启用${tabEnabled ? '，Tab补全已启用' : '，Tab补全已禁用'}`;
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = `$(sparkle) AI补全已禁用`;
            this.statusBarItem.tooltip = "点击启用AI代码补全";
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    }
    
    /**
     * 释放资源
     */
    public dispose(): void {
        this.tabCompletionProvider.dispose();
        this.disposables.forEach(d => d.dispose());
    }
    
    /**
     * 检查是否启用了Tab补全
     */
    private isTabCompletionEnabled(): boolean {
        return vscode.workspace.getConfiguration('programmingPractice')
            .get('enableTabCompletion', false); // 默认为false，避免干扰
    }
    
    /**
     * 检查是否启用了AI补全
     */
    private isCompletionEnabled(): boolean {
        return vscode.workspace.getConfiguration('programmingPractice')
            .get('enableAICodeCompletion', false); // 默认为false，避免干扰
    }
}
