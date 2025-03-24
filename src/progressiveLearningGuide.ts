import * as vscode from 'vscode';
import { AICodeAnalyzer } from './aiCodeAnalyzer';

/**
 * 渐进式学习辅导类型
 */
export enum GuideStepType {
    ProblemAnalysis = 'problem-analysis',    // 智能审题
    CodeStructure = 'code-structure',        // 代码分析
    KeyHints = 'key-hints',                  // 关键点拨
    DetailedGuidance = 'detailed-guidance',  // 详细指导
    GuidedCode = 'guided-code'               // 指导代码
}

/**
 * 学习进度状态
 */
export interface LearningProgress {
    problemId: string;
    unlockedSteps: GuideStepType[];
    currentStep?: GuideStepType;
}

/**
 * 渐进式智能编程辅导服务
 */
export class ProgressiveLearningGuide {
    private static instance: ProgressiveLearningGuide;
    private aiAnalyzer: AICodeAnalyzer;
    private learningProgressMap: Map<string, LearningProgress> = new Map();
    // 添加缓存Map来存储每个问题ID和步骤类型对应的内容
    private contentCache: Map<string, Map<GuideStepType, string>> = new Map();
    
    private constructor() {
        this.aiAnalyzer = AICodeAnalyzer.getInstance();
    }
    
    /**
     * 获取单例实例
     */
    public static getInstance(): ProgressiveLearningGuide {
        if (!ProgressiveLearningGuide.instance) {
            ProgressiveLearningGuide.instance = new ProgressiveLearningGuide();
        }
        return ProgressiveLearningGuide.instance;
    }
    
    /**
     * 获取问题的学习进度
     */
    public getLearningProgress(problemId: string): LearningProgress {
        if (!this.learningProgressMap.has(problemId)) {
            // 初始只解锁智能审题
            this.learningProgressMap.set(problemId, {
                problemId,
                unlockedSteps: [GuideStepType.ProblemAnalysis],
                currentStep: GuideStepType.ProblemAnalysis
            });
        }
        return this.learningProgressMap.get(problemId)!;
    }
    
    /**
     * 解锁下一步学习阶段
     */
    public unlockNextStep(problemId: string): GuideStepType | undefined {
        const progress = this.getLearningProgress(problemId);
        const allSteps = [
            GuideStepType.ProblemAnalysis,
            GuideStepType.CodeStructure,
            GuideStepType.KeyHints,
            GuideStepType.DetailedGuidance,
            GuideStepType.GuidedCode
        ];
        
        // 找到当前未解锁的下一个步骤
        for (const step of allSteps) {
            if (!progress.unlockedSteps.includes(step)) {
                progress.unlockedSteps.push(step);
                progress.currentStep = step;
                return step;
            }
        }
        
        return undefined; // 所有步骤都已解锁
    }
    
    /**
     * 设置当前学习步骤
     */
    public setCurrentStep(problemId: string, step: GuideStepType): boolean {
        const progress = this.getLearningProgress(problemId);
        if (progress.unlockedSteps.includes(step)) {
            progress.currentStep = step;
            return true;
        }
        return false;
    }
    
    /**
     * 获取渐进式学习指导内容
     */
    public async getGuidanceContent(
        problemId: string, 
        problemDescription: string,
        step: GuideStepType,
        forceRefresh: boolean = false
    ): Promise<string> {
        try {
            // 检查缓存是否存在
            const cachedContent = this.getCachedContent(problemId, step);
            if (cachedContent && !forceRefresh) {
                console.log(`使用缓存内容: 问题${problemId}, 步骤${step}`);
                return cachedContent;
            }
            
            // 不同步骤使用不同的提示词
            const prompt = this.buildPromptForStep(problemDescription, step);
            
            // 设置不同步骤的系统角色描述
            const systemRole = this.getSystemRoleForStep(step);
            
            // 调用AI API获取指导内容
            const content = await this.aiAnalyzer.callAIApi(
                prompt,
                systemRole,
                0.3,
                vscode.workspace.getConfiguration('programmingPractice').get('progressiveLearningMaxTokens', 3000)
            );
            
            // 缓存获取的内容
            this.setCachedContent(problemId, step, content);
            
            return content;
        } catch (error) {
            console.error(`获取${step}指导内容失败:`, error);
            return `获取学习指导失败: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
    
    /**
     * 获取缓存的内容
     */
    private getCachedContent(problemId: string, step: GuideStepType): string | undefined {
        const problemCache = this.contentCache.get(problemId);
        if (problemCache) {
            return problemCache.get(step);
        }
        return undefined;
    }
    
    /**
     * 设置缓存内容
     */
    private setCachedContent(problemId: string, step: GuideStepType, content: string): void {
        if (!this.contentCache.has(problemId)) {
            this.contentCache.set(problemId, new Map<GuideStepType, string>());
        }
        this.contentCache.get(problemId)!.set(step, content);
    }
    
    /**
     * 清除指定问题的缓存内容
     */
    public clearCache(problemId: string): void {
        this.contentCache.delete(problemId);
    }
    
    /**
     * 清除指定问题的特定步骤缓存
     */
    public clearStepCache(problemId: string, step: GuideStepType): void {
        const problemCache = this.contentCache.get(problemId);
        if (problemCache) {
            problemCache.delete(step);
        }
    }
    
    /**
     * 为不同步骤构建提示词
     */
    private buildPromptForStep(problemDescription: string, step: GuideStepType): string {
        switch (step) {
            case GuideStepType.ProblemAnalysis:
                return `我需要理解这道C++编程题目。请帮我深入分析题目要求，明确输入输出，并解释可能的解题思路，请使用C++语言的视角进行分析。
                
题目描述:
${problemDescription}

请提供以下内容:
1. 题目理解：题目实际要求我们做什么
2. 输入/输出分析：C++中的输入数据格式、约束和预期输出格式
3. 问题背后的核心概念和可能的C++算法思想
4. 分析样例，解释为什么示例输入得到相应输出
5. 边界情况思考：需要注意哪些边界情况和特殊输入
6. C++特有的考虑点：如内存管理、STL使用等`;
                
            case GuideStepType.CodeStructure:
                return `我正在学习如何使用C++解决这个编程问题，现在需要了解C++解决方案的整体结构和框架。请不要给我完整代码，只需提供C++解决方案的基本框架和结构。
                
题目描述:
${problemDescription}

请提供以下内容:
1. 解决此问题所需的基本C++数据结构（如STL容器等）
2. C++解决方案的整体框架和主要函数骨架
3. 各部分功能的简要说明
4. 可能的时间和空间复杂度分析
5. 需要包含的C++头文件`;
                
            case GuideStepType.KeyHints:
                return `我正在尝试使用C++解决这个编程问题，但需要一些关键点的提示而不是完整解答。请给我一些C++编程相关的思考方向和关键提示。
                
题目描述:
${problemDescription}

请提供以下内容:
1. 解决此问题的3-5个C++实现相关的关键提示点
2. 使用C++可能遇到的常见错误或陷队
3. 算法中的关键步骤或C++ STL使用的提示
4. 不要提供完整的代码实现，只给出C++实现关键部分的思路`;
                
            case GuideStepType.DetailedGuidance:
                return `我需要更详细的指导来用C++解决这个编程问题。请提供详细的C++解题思路和算法步骤。
                
题目描述:
${problemDescription}

请提供以下内容:
1. 详细的C++解题思路和算法步骤
2. C++主要函数和组件的设计思路
3. 关键代码部分的C++伪代码或描述
4. 如何使用C++处理边界情况和异常
5. 不同C++解法的对比（如有）
6. 优化建议和C++ STL的合理使用`;
                
            case GuideStepType.GuidedCode:
                return `请为这个编程问题提供有详细注释的C++指导代码。我需要完整且可运行的C++代码，但更重要的是详细解释每个关键步骤和思路。

题目描述:
${problemDescription}

请使用C++编写解决方案，并提供以下内容:
1. 完整的C++解决方案代码，包含所有必要的头文件
2. 每个关键步骤都有详细注释
3. C++算法思想和关键操作的解释
4. 时间和空间复杂度分析
5. C++特有功能的使用说明（如STL容器、智能指针等）`;
                
            default:
                return `请使用C++分析这个编程问题并提供解题思路。
                
题目描述:
${problemDescription}`;
        }
    }
    
    /**
     * 为不同步骤获取系统角色描述
     */
    private getSystemRoleForStep(step: GuideStepType): string {
        switch (step) {
            case GuideStepType.ProblemAnalysis:
                return "你是一位专业的C++算法教师，擅长帮助学生理解和分析C++编程问题。你的目标是引导学生深入理解问题，而不是直接提供解答。请始终使用C++语言的视角进行分析。";
                
            case GuideStepType.CodeStructure:
                return "你是一位C++编程设计专家，擅长帮助学生规划C++解决方案的整体结构。你的目标是提供C++解决方案的框架，而不是具体实现细节。请始终使用C++编程范式和实践。";
                
            case GuideStepType.KeyHints:
                return "你是一位C++编程教练，善于提供C++编程相关的关键性提示以帮助学生突破思维瓶颈。你的回答应该点到为止，引导学生思考C++实现方案而非直接给出解答。";
                
            case GuideStepType.DetailedGuidance:
                return "你是一位C++编程导师，善于提供详细且系统的C++算法指导。你的回答要有条理地讲解C++解题思路和关键步骤，但仍鼓励学生自己实现代码。请确保所有建议都符合C++编程实践。";
                
            case GuideStepType.GuidedCode:
                return "你是一位C++编程实践指导者，善于提供有详细注释的C++实例代码。你的C++代码注释应清晰解释每个关键步骤的思路和目的，帮助学生理解C++实现细节。请确保代码符合C++最佳实践和风格指南。";
                
            default:
                return "你是一位C++编程教育专家，擅长通过渐进式指导帮助学生学习C++编程和解决问题。所有回答应关注C++编程语言的特性和最佳实践。";
        }
    }
}
