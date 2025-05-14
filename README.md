# 数据结构与算法导论 - 实时编程调试反馈学习系统 (IDE 插件端)

本项目是一款创新的 IDE 集成实时编程调试反馈学习系统，专为《数据结构与算法导论》课程设计。该系统深度融合大模型人工智能技术，为学生提供全面的编程学习支持平台。

## 项目概述

本项目由两个主要部分组成：

1. **IDE 插件部分（当前文件夹）**：基于 VS Code 的扩展，提供编程练习和实时代码分析功能
2. **Web 应用部分（vuetest 文件夹）**：基于 Vue.js 的网页应用，提供学生和教师的学习管理系统

### 核心功能

1. **IDE 插件设计与开发**：基于 VS Code 的插件，提供实时代码审查、错误提示、代码优化建议等功能
2. **大模型人工智能接口集成**：集成讯飞星火大模型 API 和本地模型，为学生提供精确的问题解答和调试指导
3. **渐进式智能编程辅导**：通过智能审题、代码分析、关键点拨、详细指导和指导代码的五步策略，引导学生主动参与学习
4. **智能错误诊断与调试辅助**：分析学生编程中的错误模式，提供针对性的调试建议和解决方案

## 技术栈

- TypeScript
- VS Code Extension API
- Node.js
- OpenAI API (讯飞星火大模型)
- Ollama (本地模型支持)

## 安装与设置

### 前提条件

- Node.js 14+
- VS Code 1.60+
- G++ 编译器（用于 C++代码验证）

### 开发环境设置

1. **克隆项目**

```bash
git clone <repository-url>
cd ex1
```

2. **安装依赖**

```bash
npm install
```

3. **编译插件**

```bash
npm run compile
```

4. **启动调试**

- 在 VS Code 中按下 F5 启动调试会话
- 这将打开一个新的 VS Code 窗口，其中加载了该扩展

### 打包插件

```bash
npm run package
```

这将创建一个.vsix 文件，可以手动安装到 VS Code 中。

## 插件功能

### 用户认证

- 支持学生和教师账户登录
- 与 Web 端共享用户会话

### 题目列表

- 显示可用的编程练习题目
- 按难度和类型分类

### 代码编辑

- 集成代码编辑器
- 实时语法检查和错误提示

### AI 代码分析

- 实时分析代码质量和潜在问题
- 提供智能修复建议

### 渐进式学习辅导

- 智能审题：帮助理解问题要求
- 代码分析：提供解题思路和框架
- 关键点拨：给出解题关键提示
- 详细指导：提供系统化解题指导
- 指导代码：提供带注释的示例代码

### 数据收集

- 记录学生编程行为和表现
- 与 Web 端同步学习数据

## 配置选项

插件提供以下配置选项：

- `programmingPractice.serverUrl`: 服务器地址，用于获取题目和提交代码
- `programmingPractice.compilerPath`: C++编译器路径
- `programmingPractice.compilerArgs`: 编译器参数
- `programmingPractice.enableAIAnalysis`: 启用/禁用 AI 代码分析
- `programmingPractice.enableAICodeCompletion`: 启用/禁用 AI 代码补全
- `programmingPractice.aiApiKey`: AI API 密钥
- `programmingPractice.aiApiEndpoint`: AI API 端点
- `programmingPractice.aiModelName`: AI 模型名称

## 项目结构

```
ex1/
├── .vscode/             # VS Code配置
├── src/                 # 源代码
│   ├── aiCodeAnalyzer.ts       # AI代码分析器
│   ├── aiCodeCompletion.ts     # AI代码补全
│   ├── codingDataCollector.ts  # 编程数据收集器
│   ├── cppAnalyzer.ts          # C++代码分析器
│   ├── extension.ts            # 扩展入口点
│   ├── loginView.ts            # 登录视图
│   ├── problemProvider.ts      # 题目提供者
│   ├── progressiveLearningGuide.ts # 渐进式学习辅导
│   ├── solutionValidator.ts    # 解决方案验证器
│   └── userSession.ts          # 用户会话管理
├── package.json         # 项目配置
└── tsconfig.json        # TypeScript配置
```

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

[MIT License](LICENSE)
