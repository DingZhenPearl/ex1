import * as vscode from 'vscode';
import * as path from 'path';
import { UserSession } from './userSession';

export class LoginView {
    private static panel: vscode.WebviewPanel | undefined;
    private static context: vscode.ExtensionContext;

    static initialize(context: vscode.ExtensionContext) {
        this.context = context;
    }

    static show() {
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            this.panel.reveal(columnToShowIn);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'programmingPracticeLogin',
            '编程练习 - 登录',
            columnToShowIn || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                ]
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'login':
                        await this.handleLogin(message.userType, message.email, message.password);
                        break;
                    case 'register':
                        await this.handleRegister(message.userType, message.email, message.password);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            null,
            this.context.subscriptions
        );
    }

    private static async handleLogin(userType: string, email: string, password: string) {
        try {
            const response = await fetch('http://localhost:3000/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user_type: userType, email, password })
            });

            const data = await response.json();

            if (data.success) {
                // 保存用户信息到用户会话
                UserSession.login(email, userType);

                vscode.window.showInformationMessage(`欢迎回来，${email}`);
                this.panel?.dispose();
            } else {
                this.panel?.webview.postMessage({ command: 'loginError', message: data.message || '登录失败' });
            }
        } catch (error) {
            console.error('登录错误:', error);
            this.panel?.webview.postMessage({ command: 'loginError', message: '服务器连接失败，请确保服务器已启动' });
        }
    }

    private static async handleRegister(userType: string, email: string, password: string) {
        try {
            const response = await fetch('http://localhost:3000/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user_type: userType, email, password })
            });

            const data = await response.json();

            if (data.success) {
                this.panel?.webview.postMessage({ command: 'registerSuccess', message: '注册成功，请登录' });
            } else {
                this.panel?.webview.postMessage({ command: 'registerError', message: data.message || '注册失败' });
            }
        } catch (error) {
            console.error('注册错误:', error);
            this.panel?.webview.postMessage({ command: 'registerError', message: '服务器连接失败，请确保服务器已启动' });
        }
    }

    private static getWebviewContent() {
        return `<!DOCTYPE html>
        <html lang="zh">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>登录/注册</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .container {
                    max-width: 500px;
                    margin: 0 auto;
                }
                h1 {
                    color: var(--vscode-editor-foreground);
                    text-align: center;
                    margin-bottom: 20px;
                }
                .form-container {
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    border-radius: 5px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    color: var(--vscode-editor-foreground);
                }
                input[type="email"],
                input[type="password"],
                select {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                }
                button {
                    width: 100%;
                    padding: 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 10px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .error-message {
                    color: var(--vscode-errorForeground);
                    margin-top: 10px;
                    padding: 10px;
                    display: none;
                }
                .toggle-container {
                    text-align: center;
                    margin-top: 20px;
                }
                .toggle-link {
                    color: var(--vscode-textLink-foreground);
                    cursor: pointer;
                }
                .toggle-link:hover {
                    text-decoration: underline;
                }
                #registerForm {
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>编程练习平台</h1>
                
                <div class="form-container">
                    <!-- 登录表单 -->
                    <form id="loginForm">
                        <h2>用户登录</h2>
                        <div class="form-group">
                            <label for="loginUserType">用户类型</label>
                            <select id="loginUserType" required>
                                <option value="teacher">教师</option>
                                <option value="student" selected>学生</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="loginEmail">邮箱</label>
                            <input type="email" id="loginEmail" placeholder="请输入邮箱" required>
                        </div>
                        <div class="form-group">
                            <label for="loginPassword">密码</label>
                            <input type="password" id="loginPassword" placeholder="请输入密码" required>
                        </div>
                        <div id="loginError" class="error-message"></div>
                        <button type="submit">登录</button>
                        
                        <div class="toggle-container">
                            <span class="toggle-link" id="showRegister">没有账号？立即注册</span>
                        </div>
                    </form>
                    
                    <!-- 注册表单 -->
                    <form id="registerForm">
                        <h2>用户注册</h2>
                        <div class="form-group">
                            <label for="registerUserType">用户类型</label>
                            <select id="registerUserType" required>
                                <option value="teacher">教师</option>
                                <option value="student" selected>学生</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="registerEmail">邮箱</label>
                            <input type="email" id="registerEmail" placeholder="请输入邮箱" required>
                        </div>
                        <div class="form-group">
                            <label for="registerPassword">密码</label>
                            <input type="password" id="registerPassword" placeholder="请输入密码" required>
                        </div>
                        <div class="form-group">
                            <label for="confirmPassword">确认密码</label>
                            <input type="password" id="confirmPassword" placeholder="请确认密码" required>
                        </div>
                        <div id="registerError" class="error-message"></div>
                        <button type="submit">注册</button>
                        
                        <div class="toggle-container">
                            <span class="toggle-link" id="showLogin">已有账号？立即登录</span>
                        </div>
                    </form>
                </div>
            </div>
            
            <script>
                (function() {
                    // 表单切换功能
                    document.getElementById('showRegister').addEventListener('click', function() {
                        document.getElementById('loginForm').style.display = 'none';
                        document.getElementById('registerForm').style.display = 'block';
                    });
                    
                    document.getElementById('showLogin').addEventListener('click', function() {
                        document.getElementById('registerForm').style.display = 'none';
                        document.getElementById('loginForm').style.display = 'block';
                    });
                    
                    // 登录表单提交
                    document.getElementById('loginForm').addEventListener('submit', function(e) {
                        e.preventDefault();
                        const userType = document.getElementById('loginUserType').value;
                        const email = document.getElementById('loginEmail').value;
                        const password = document.getElementById('loginPassword').value;
                        
                        const vscode = acquireVsCodeApi();
                        vscode.postMessage({
                            command: 'login',
                            userType,
                            email,
                            password
                        });
                    });
                    
                    // 注册表单提交
                    document.getElementById('registerForm').addEventListener('submit', function(e) {
                        e.preventDefault();
                        const userType = document.getElementById('registerUserType').value;
                        const email = document.getElementById('registerEmail').value;
                        const password = document.getElementById('registerPassword').value;
                        const confirmPassword = document.getElementById('confirmPassword').value;
                        
                        if (password !== confirmPassword) {
                            const errorElement = document.getElementById('registerError');
                            errorElement.textContent = '两次输入的密码不一致';
                            errorElement.style.display = 'block';
                            return;
                        }
                        
                        const vscode = acquireVsCodeApi();
                        vscode.postMessage({
                            command: 'register',
                            userType,
                            email,
                            password
                        });
                    });
                    
                    // 监听来自扩展的消息
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'loginError':
                                const loginError = document.getElementById('loginError');
                                loginError.textContent = message.message;
                                loginError.style.display = 'block';
                                break;
                            case 'registerError':
                                const registerError = document.getElementById('registerError');
                                registerError.textContent = message.message;
                                registerError.style.display = 'block';
                                break;
                            case 'registerSuccess':
                                document.getElementById('registerForm').style.display = 'none';
                                document.getElementById('loginForm').style.display = 'block';
                                vscode.window.showInformationMessage('注册成功，请登录');
                                break;
                        }
                    });
                })();
            </script>
        </body>
        </html>`;
    }
}