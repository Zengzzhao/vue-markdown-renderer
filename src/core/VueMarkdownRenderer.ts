import { h, defineComponent, type PropType, computed, inject } from "vue";
import { VFile } from "vfile";
import { type Processor } from "unified";
import { ShikiProvider } from "./highlight/ShikiProvider.js";
import { provideProxyProps } from "./useProxyProps.js";
import { generateVueNode } from "./jsx.js";

export default defineComponent({
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
  },
  errorCaptured(e) {
    console.error("VueMarkdownRenderer captured error", e);
  },
  setup(props) {
    // 接收上层传入的processor处理器
    const processor = inject("markdown-renderer-processor") as Processor<
      any,
      any,
      any
    >;
    provideProxyProps(props);

    
    const createFile = (md: string) => {
      const file = new VFile();
      file.value = md;
      return file;
    };
    const computedVNode = computed(() => {
      // VFile是unified生态中的文件对象，将markdown变为VFile给处理流程提供一个统一上下文
      const file = createFile(props.source);
      // processor.parse(file)把markdown文本解析为markdown AST
      // processor.runSync(..., file)执行上层注册号的remark、rehype插件链，得到处理好的语法树
      // generateVueNode(...)把语法树转成 Vue 的 VNode
      return generateVueNode(processor.runSync(processor.parse(file), file));
    });

    return () =>
      h(ShikiProvider, null, {
        default: () => computedVNode.value,
      });
  },
});
