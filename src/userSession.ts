import * as vscode from 'vscode';
import fetch from 'node-fetch';

// 会话变化事件类型
type SessionChangeListener = () => void;

// 用户详细信息接口
export interface UserProfile {
    email: string;
    student_id?: string;
    class_name?: string;
    major?: string;
    name?: string;
    created_at?: string;
    updated_at?: string;
}

export class UserSession {
    private static context: vscode.ExtensionContext;
    private static sessionChangeListeners: SessionChangeListener[] = [];
    
    static initialize(context: vscode.ExtensionContext) {
        this.context = context;
    }
    
    static login(email: string, userType: string): void {
        this.context.globalState.update('userEmail', email);
        this.context.globalState.update('userType', userType);
        this.context.globalState.update('isLoggedIn', true);
        
        // 登录成功后获取详细的个人信息
        this.fetchUserProfile(email);
        
        // 触发会话变化事件
        this.notifySessionChanged();
    }
    
    static logout(): void {
        this.context.globalState.update('userEmail', undefined);
        this.context.globalState.update('userType', undefined);
        this.context.globalState.update('isLoggedIn', false);
        this.context.globalState.update('userProfile', undefined);
        
        // 触发会话变化事件
        this.notifySessionChanged();
    }
    
    static isLoggedIn(): boolean {
        return this.context.globalState.get('isLoggedIn') === true;
    }
    
    static getUserEmail(): string | undefined {
        return this.context.globalState.get('userEmail');
    }
    
    static getUserType(): string | undefined {
        return this.context.globalState.get('userType');
    }
    
    // 获取用户详细个人信息
    static getUserProfile(): UserProfile | undefined {
        return this.context.globalState.get('userProfile');
    }
    
    // 设置用户详细个人信息
    static setUserProfile(profile: UserProfile): void {
        this.context.globalState.update('userProfile', profile);
        this.notifySessionChanged();
    }
    
    // 从后端获取用户个人信息
    static async fetchUserProfile(email: string): Promise<void> {
        try {
            console.log('正在获取用户个人信息...');
            const serverUrl = vscode.workspace.getConfiguration('programmingPractice').get('serverUrl') || 'http://182.92.85.220:3000';
            const response = await fetch(`${serverUrl}/api/profile/${email}`);
            
            if (!response.ok) {
                throw new Error(`获取个人信息失败: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.profile) {
                this.setUserProfile(data.profile);
                console.log('成功获取用户个人信息:', data.profile);
            } else {
                console.log('获取个人信息返回错误:', data.message);
            }
        } catch (error) {
            console.error('获取个人信息出错:', error);
            vscode.window.showErrorMessage(`无法获取个人信息: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    // 添加会话变化监听器
    static onSessionChanged(listener: SessionChangeListener) {
        this.sessionChangeListeners.push(listener);
    }
    
    // 移除会话变化监听器
    static removeSessionChangeListener(listener: SessionChangeListener) {
        const index = this.sessionChangeListeners.indexOf(listener);
        if (index !== -1) {
            this.sessionChangeListeners.splice(index, 1);
        }
    }
    
    // 通知所有监听器
    private static notifySessionChanged() {
        for (const listener of this.sessionChangeListeners) {
            listener();
        }
    }
}