import { Fragment } from "vue/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { ComponentCodeBlockRenderer } from "./plugin/remarkComponentCodeBlock.js";
import { EchartCodeBlockRenderer } from "./plugin/remarkEchartCodeBlock.js";
import { MermaidRenderer } from "./plugin/remarkMermaidCodeBlock.js";
import { ShikiStreamCodeBlock } from "./highlight/ShikiStreamCodeBlock.js";
import { segmentTextWrappers } from "./segmentText";
import { TableRenderer } from "./plugin/rehypeTable.js";
import { h } from "vue";

export function generateVueNode(tree: any) {
  // 使用hast-util-to-jsx-runtime提供的toJsxRuntime遍历AST,将节点转换为JSX runtime的调用，然后交给下面自定义的jsx()函数，而非React
  const vueVnode = toJsxRuntime(tree, {
    // components是一个映射表，key为AST中的标签名、组件名，value为最终要使用哪个vue组件渲染
    components: {
      ...segmentTextWrappers, // 自定义的文本映射
      pre: ShikiStreamCodeBlock, // 将pre节点不按照默认html渲染，而是ShikiStreamCodeBlock
      // remark/rehype 插件造出来的特殊节点名使用自定义组件映射
      ComponentCodeBlockRenderer,
      EchartCodeBlockRenderer,
      MermaidRenderer,
      TableRenderer,
    },
    Fragment,
    // 生成的jsx runtime调用，真正调用下面自定义的jsx函数
    jsx: jsx, // 单子节点时
    jsxs: jsx, // 多子节点时
    passKeys: true, // 将key传入自定义jsx函数中
    passNode: true, // 将原始的AST节点对象传给组件props
  });
  return vueVnode;
}

// 将jsx runtime的调用转换为vue的h函数调用
function jsx(type: any, props: Record<any, any>, key: any) {
  const { children } = props;
  delete props.children;
  if (arguments.length > 2) {
    props.key = key;
  }
  // 如果是<></>的Fragment标签
  if (type === Fragment) {
    return h(type, props, children);
  } 
  // 如果不是原生html标签，是组件
  else if (typeof type !== "string") {
    // 对ShikiStreamCodeBlock特殊优化
    if (type === ShikiStreamCodeBlock) {
      // 使用json字符串作为prop的目的是防止ShikiStreamCodeBlock组件不必要的re-render
      const nodeJSON = JSON.stringify(props.node);
      delete props.node;
      return h(type, { ...props, nodeJSON });
    }
    // 普通组件 
    return h(type, props);
  }
  // 原生html标签
  return h(type, props, children);
}
