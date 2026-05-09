import { defineComponent, h } from "vue";
import { useProxyProps } from "./useProxyProps.js";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment } from "vue/jsx-runtime";

interface CodeNode {
  type: "element";
  tagName: string;
  properties: {
    className?: string | string[];
  };
  children: Array<{
    type: "text";
    value: string;
  }>;
}

interface PreNode {
  children: Array<CodeNode>;
  classList: DOMTokenList;
  className: string;
}

function jsx(type: any, props: Record<any, any>, key: any) {
  const { children } = props;
  delete props.children;
  if (arguments.length > 2) {
    props.key = key;
  }
  if (type === Fragment) {
    return h(type, props, children);
  } else if (typeof type !== "string") {
    return h(type, props);
  }
  return h(type, props, children);
}

// 代码块结构为pre > code
export default defineComponent({
  name: "CodeBlock",
  inheritAttrs: false,
  props: {
    node: {
      type: Object as () => PreNode,
      required: true,
    },
  },
  setup(props) {
    const proxyProps = useProxyProps();

    return () => {
      // 查找子元素中的 code 节点
      const codeNode = props.node.children.find(
        (child) =>
          child && typeof child === "object" && child.tagName === "code"
      ) as CodeNode | undefined;

      // 如果没有找到 code 节点，直接返回 pre 元素
      if (!codeNode) {
        return h("pre", { class: props.node.className });
      }
      // 通过代码块的属性上名为language-xxx的class提取当前代码块语言xxx
      let language: string | null = null;
      if (codeNode.properties?.className) {
        const classNames = Array.isArray(codeNode.properties.className)
          ? codeNode.properties.className
          : [codeNode.properties.className];
        const langClass = classNames.find(
          (cls) =>
            typeof cls === "string" &&
            (cls.startsWith("language-") || cls.startsWith("lang-"))
        );
        if (langClass) {
          language = langClass.replace(/^(language-|lang-)/, "");
        }
      }

      // 使用toJsxRuntime将codeNode转换为Vue vnode
      const highlightVnode = toJsxRuntime(codeNode, {
        Fragment,
        jsx: jsx,
        jsxs: jsx,
        passKeys: true,
        passNode: true,
      });
      
      // 将 highlightVnode 包装在 pre 元素中
      const wrappedVnode = h("pre", { class: props.node.className }, [
        highlightVnode,
      ]);
      // 如果有自定义的 codeBlockRenderer 使用自定义渲染
      const customRenderer = proxyProps.codeBlockRenderer;
      if (customRenderer) {
        // 外部自定义codeBlockRenderer组件可以接收到language、highlightVnode(代码块组件的vnode对象),这样复制按钮、语言标签、展开折叠等可以自定义实现
        return h(customRenderer, {
          language,
          highlightVnode: wrappedVnode,
        });
      }
      // 如果没有自定义的codeBlockRenderer，使用默认的代码块渲染
      return wrappedVnode;
    };
  },
});
