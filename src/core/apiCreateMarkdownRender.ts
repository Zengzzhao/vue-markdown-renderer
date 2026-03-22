import { Component, defineComponent, h, PropType, provide } from "vue";
import { unified, type Plugin } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkGfm from "remark-gfm";

import { remarkComponentCodeBlock } from "./plugin/remarkComponentCodeBlock.js";
import { remarkEchartCodeBlock } from "./plugin/remarkEchartCodeBlock.js";
import { remarkMermaidCodeBlock } from "./plugin/remarkMermaidCodeBlock.js";
import { rehypeTable } from "./plugin/rehypeTable.js";

import VueMarkdownRenderer from "./VueMarkdownRenderer.js";

interface RemarkRehypeOptions {
  allowDangerousHtml?: boolean;
  [key: string]: any;
}
export type ApiOptions = {
  componentsMap?: Record<string, Component>;
  codeBlock?: {
    renderer: Component;
  };
  mermaid?: {
    renderer: Component;
  };
  echart?: {
    renderer: Component;
    placeholder: Component;
  };
  table?: {
    renderer: Component;
  };
  rehypePlugins?: Plugin[]; // 自定义rehype插件
  remarkPlugins?: Plugin[]; // 自定义remark插件
  remarkRehypeOptions?: RemarkRehypeOptions; // 将markdown AST转换为html AST的额外配置
};

// 调用该函数，返回一个Vue组件
// 该函数先构建一个unifed处理器流水线，然后在返回一个VueMarkdownRendererWrapper组件，通过依赖注入将processor处理器注入
// VueMarkdownRendererWrapper的defineComponent自己并不直接渲染内容，而是渲染VueMarkdownRenderer
export function createMarkdownRenderer(options?: ApiOptions) {
  options = options || {};
  // unified()会创建一个处理器，之后.use(...)不断给处理器注册插件
  const processor = unified()
    // 进入到remark世界
    .use(remarkParse) // 把markdown文本解析为markdown AST
    .use(remarkGfm) // 支持github风格的markdown
    .use(remarkComponentCodeBlock) // 自定义插件，处理component-json代码块
    .use(remarkEchartCodeBlock) // 自定义插件，处理echarts代码块
    .use(remarkMermaidCodeBlock) // 自定义插件，处理mermaid代码块
    .use(options.remarkPlugins ?? []) // 接入用户传入的remark插件
    // 进入到rehype世界
    .use(remarkRehype, options.remarkRehypeOptions || {}) // 将markdown AST转换为html AST
    .use(rehypeTable) // 自定义rehype插件，处理表格
    .use(options.rehypePlugins ?? []); // 接入用户传入的rehype插件

  return defineComponent({
    name: "VueMarkdownRendererWrapper",
    props: {
      source: {
        type: String as PropType<string>,
        required: true,
      },
      theme: {
        type: String as PropType<"light" | "dark">,
        required: true,
      },
    },
    // 先执行依赖注入provide，然后创建VueMarkdownRenderer组件：<VueMarkdownRenderer :source="props.source" :theme="props.theme" />
    setup(props) {
      provide("markdown-renderer-options", options);
      provide("markdown-renderer-processor", processor);
      return () =>
        h(VueMarkdownRenderer, {
          source: props.source,
          theme: props.theme,
        });
    },
  });
}
