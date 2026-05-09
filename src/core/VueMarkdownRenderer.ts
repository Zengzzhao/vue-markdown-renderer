import {
  h,
  defineComponent,
  type PropType,
  computed,
  type Component,
  type DefineComponent,
} from "vue";
import { Fragment } from "vue/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkGfm, { Options as RemarkGfmOptions } from "remark-gfm";
import { unified, type Plugin } from "unified";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import rehypeKatex from "rehype-katex";
import rehypeExternalLinks from "rehype-external-links";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import {
  remarkComponentCodeBlock,
  ComponentCodeBlock,
} from "./plugin/remarkComponentCodeBlock.js";
import {
  remarkEchartCodeBlock,
  EchartCodeBlock,
} from "./plugin/remarkEchartCodeBlock.js";
import { provideProxyProps } from "./useProxyProps.js";
import CodeBlock from "./CodeBlock";
import rehypeRaw from "rehype-raw";
import { SegmentedParser } from "./segmenter.js";

interface RemarkRehypeOptions {
  [key: string]: any;
}

// type为元素类型，有Fragment、string类型标签名、组件的对象类型形式
// props为元素属性，有children、node
// key为动态生成的key属性
function jsx(type: any, props: Record<any, any>, key: any) {
  const { children } = props;
  delete props.children;
  if (arguments.length > 2) props.key = key;
  // Fragment
  if (type === Fragment) return h(type, props, children);
  // 组件
  if (typeof type !== "string") return h(type, props);
  // 普通string的标签
  return h(type, props, children);
}

const VueMarkdownRenderer = defineComponent({
  name: "VueMarkdownRenderer",
  props: {
    source: {
      type: String as PropType<string>,
      required: true,
    },
    theme: {
      type: String as PropType<"light" | "dark">,
      required: true,
    },
    componentsMap: {
      type: Object as PropType<Record<string, Component>>,
    },
    codeBlockRenderer: {
      type: Object as PropType<Component>,
    },
    echartRenderer: {
      type: Object as PropType<Component>,
    },
    echartRendererPlaceholder: {
      type: Object as PropType<Component>,
    },
    extraLangs: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    rehypePlugins: {
      type: Array as PropType<Plugin[]>,
      default: () => [],
    },
    remarkPlugins: {
      type: Array as PropType<Plugin[]>,
      default: () => [],
    },
    remarkRehypeOptions: {
      type: Object as PropType<RemarkRehypeOptions>,
      default: () => ({ allowDangerousHtml: true }),
    },
    remarkGfmOptions: {
      type: Object as PropType<RemarkGfmOptions>,
      default: () => ({}),
    },
    rehypeSanitizeSchema: {
      type: Object as PropType<Partial<Schema>>,
      default: () => ({}),
    },
  },
  errorCaptured(e) {
    console.error("VueMarkdownRenderer captured error", e);
  },
  setup(props) {
    provideProxyProps(props);

    const computedProcessor = computed(() => {
      const {
        rehypePlugins,
        remarkPlugins,
        remarkRehypeOptions,
        remarkGfmOptions,
        rehypeSanitizeSchema,
      } = props;
      return (
        unified()
          // 解析markdown为mdast插件
          .use(remarkParse)
          // 扩展markdown语法，支持GFM语法：表格、删除线~~、任务列表- [x]
          .use(remarkGfm, remarkGfmOptions)
          // 自定义插件，识别```component-json的代码块
          .use(remarkComponentCodeBlock)
          // 自定义插件，识别```echart的代码块
          .use(remarkEchartCodeBlock)
          // 识别$...$行内、$$...$$块公式的数学公式语法，生成inlineMath、math的mdast节点
          .use(remarkMath)
          // 使用者自定义传入的插件
          .use(remarkPlugins)
          // 将mdast转为hast，remarkRehypeOptions配置中allowDangerousHtml为true表示保留原始 HTML 节点，不直接丢弃
          .use(remarkRehype, remarkRehypeOptions)
          // 接卸hast中的raw节点（原始html字符串）
          .use(rehypeRaw)
          // 安全过滤，按照shema白名单过滤hast中的标签、属性，防止xss
          .use(rehypeSanitize, { ...defaultSchema, ...rehypeSanitizeSchema })
          // 找到inlineMath、math节点，调用KaTeX渲染html公式节点
          .use(rehypeKatex, {
            throwOnError: true,
            strict: false,
            errorColor: "inherit",
          })
          // 找到所有a节点，对外链加上target="_blank" 和 rel="nofollow"，防止新标签页被劫持
          .use(rehypeExternalLinks, { target: "_blank", rel: ["nofollow"] })
          // 找到<code>节点，用 highlight.js 做语法高亮，往 children 里注入带 class 的 <span> 节点
          // detect: true = 未标注语言时自动检测，aliases: { xml: 'vue' } = .vue 文件按 XML 高亮
          .use(rehypeHighlight, {
            detect: true,
            ignoreMissing: true,
            aliases: { xml: "vue" },
          })
          // 使用者自定义传入的插件
          .use(rehypePlugins)
      );
    });

    const parser = new SegmentedParser();

    const computedVNode = computed(() => {
      const children = parser.parse(props.source, computedProcessor.value);
      // 遍历hast，对每个节点使用注入的jsx/jsxs/Fragment创建vue、react框架需要的vnode
      return toJsxRuntime({ type: "root", children } as any, {
        // 标签名->自定义组件的映射
        // 遇到自定义标签ComponentCodeBlock用自己写的ComponentCodeBlock这个vue组件渲染
        // 遇到自定义标签EchartCodeBlock用自己写的EchartCodeBlock这个vue组件渲染
        // 遇到pre标签用自己写的CodeBlock这个vue组件渲染
        components: { ComponentCodeBlock, EchartCodeBlock, pre: CodeBlock },
        // 渲染无根节点的片段<>...</>
        Fragment,
        // react中jsx与jsxs有区分
        jsx,
        jsxs: jsx,
        // 为每个生成的节点添加key属性(标签名-在标签在同等层级所出现的次数)
        passKeys: true,
        // 将元素hast节点作为node的prop传给自定义属性，组件可以通过props.node拿到原始ast数据,这样就实现了将渲染控制权完全交给外部使用者
        passNode: true,
        elementAttributeNameCase: "html",
      });
    });
    return () => computedVNode.value;
  },
});

export default VueMarkdownRenderer as DefineComponent<{
  source: string;
  theme: "light" | "dark";
  componentsMap?: Record<string, Component>;
  codeBlockRenderer?: Component;
  echartRenderer?: Component;
  echartRendererPlaceholder?: Component;
  extraLangs?: string[];
  rehypePlugins?: Plugin[];
  remarkPlugins?: Plugin[];
  remarkRehypeOptions?: RemarkRehypeOptions;
  remarkGfmOptions?: RemarkGfmOptions;
  rehypeSanitizeSchema?: Partial<Schema>;
}>;
