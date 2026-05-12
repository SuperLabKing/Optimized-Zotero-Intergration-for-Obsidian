# Optimized Zotero Integration for Obsidian

> **基于 [mgmeyers/obsidian-zotero-integration](https://github.com/mgmeyers/obsidian-zotero-integration)（v3.2.1）优化改进。**

## 与原版插件的区别

原版 Zotero Integration 插件（v3.2.1）已经停更两年。在使用过程中，当执行 **Paper Import** 或更新笔记时，Nunjucks 模板引擎会采用**全量覆写**策略，将整个 Markdown 文件（包括 YAML Frontmatter）重新生成，导致用户手动添加的自定义属性（如 `实验批次`、`核心质粒` 等）被抹除。

### v1.0.0 优化内容

**核心改进：YAML Frontmatter 属性合并（Merge）**

当插件更新一篇已存在的笔记时，行为变为：

1. 提取 Obsidian 中**现有笔记的 Frontmatter**
2. 提取 Nunjucks 模板引擎**新渲染的 Frontmatter**
3. 进行**深度合并**：
   - ✅ 保留用户在 Obsidian 中手动添加的自定义属性
   - ✅ 对于同名字段（作者、标签、影响因子等），使用新渲染值覆盖
   - ✅ 保留原有属性的排列顺序
4. 将合并后的 YAML 与正文重新组合，写入文件

**新增文件：**
- `src/bbt/frontmatter.ts` — YAML Frontmatter 解析与合并工具模块

**修改文件：**
- `src/bbt/export.ts` — 在 `exportToMarkdown` 函数中，更新已存在文件时调用 `mergeFrontmatterContent` 进行属性合并后再写入

## 安装与使用

### 方式一：直接安装（推荐）

1. 下载本仓库的 [最新 Release](https://github.com/SuperLabKing/Optimized-Zotero-Intergration-for-Obsidian/releases)
2. 将解压后的文件夹放入 Obsidian vault 的 `.obsidian/plugins/` 目录
3. 在 Obsidian 设置中**禁用**原有的 "Zotero Integration" 插件
4. **启用** "Optimized Zotero Integration" 插件
5. 如需迁移原有配置，将原插件的 `data.json` 复制到新插件目录

### 方式二：从源码构建

```bash
git clone git@github.com:SuperLabKing/Optimized-Zotero-Intergration-for-Obsidian.git
cd Optimized-Zotero-Intergration-for-Obsidian
npm install
npm run build
```

构建产物 `main.js` 会生成在项目根目录。

## 技术细节

### 合并策略

```
旧文件 Frontmatter          新模板 Frontmatter         合并结果
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ title: 论文标题  │       │ title: 论文标题  │       │ title: 论文标题  │  ← 模板值
│ author: 张三    │       │ author: Zhang   │       │ author: Zhang   │  ← 模板值覆盖
│ 实验批次: A组   │       │ tags: [ai, ml]  │       │ 实验批次: A组   │  ← 用户字段保留
│ 核心质粒: pET28 │       │ year: 2024      │       │ 核心质粒: pET28 │  ← 用户字段保留
└─────────────────┘       └─────────────────┘       │ tags: [ai, ml]  │  ← 模板值
                                                     │ year: 2024      │  ← 模板值
                                                     └─────────────────┘
```

### 实现细节

- 不依赖任何第三方 YAML 解析库，使用正则表达式进行轻量级解析
- 按顶级键（无缩进的 `key: value`）为单位进行合并
- 保留原始 YAML 格式（缩进、引号等）不做修改
- 仅对已存在的笔记执行合并，新创建的笔记直接使用模板渲染结果

## 致谢

本插件完全基于 [mgmeyers/obsidian-zotero-integration](https://github.com/mgmeyers/obsidian-zotero-integration) 开发，感谢原作者 mgmeyers 的优秀工作。

## License

MIT（继承自原项目）
