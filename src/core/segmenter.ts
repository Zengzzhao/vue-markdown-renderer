import { VFile } from "vfile";
import type { Processor } from "unified";

/**
 * Split markdown source into top-level block segments at blank-line boundaries,
 * while correctly skipping blank lines that appear inside:
 *   - fenced code blocks  (``` / ~~~)
 *   - display math blocks ($$…$$)
 *   - HTML blocks         (<tag>…</tag> or <!-- … -->)
 *
 * Every completed segment (all but the last) is returned with a trailing "\n\n"
 * so that it parses correctly in isolation.
 * 按照顶层空行切成多个片段，同时忽略代码块、数学块、html块内的空行
 */
export function splitIntoSegments(source: string): string[] {
  const lines = source.split("\n");
  const segments: string[] = []; // 所有片段

  let fenceMarker: string | null = null; // 代码块的开始标记,```或~~~
  let inMathBlock = false; // 是否在数学块内
  let htmlBlockTag: string | null = null; // 当前未闭合的html块标签名
  let inHtmlComment = false; // 是否在<!-- -->注释内
  let currentLines: string[] = []; // 当前的段落行
  let pendingBlanks = 0; // 遇到空行时先挂起计数,不立即切段

  for (const line of lines) {
    const trimmed = line.trim();
    const inBlock =
      fenceMarker !== null ||
      inMathBlock ||
      htmlBlockTag !== null ||
      inHtmlComment;

    // 遇到空行
    // 如果在块内空行属于块的一部分,追加到当前正在收集的段落行
    // 如果不在块内空行是段落分隔符,累加pendingBlanks不立即切段,先挂起
    if (trimmed === "") {
      inBlock ? currentLines.push(line) : pendingBlanks++;
      continue;
    }

    // 遇到非空行且有挂起的空行，说明前面有完整段落+空行
    if (pendingBlanks > 0) {
      if (currentLines.length > 0) {
        segments.push(currentLines.join("\n") + "\n\n");
        currentLines = [];
      }
      pendingBlanks = 0;
    }

    currentLines.push(line);

    // 是否在某个块内
    // 在代码块内
    if (fenceMarker !== null) {
      // 检测是否退出代码块
      const m = trimmed.match(/^(`{3,}|~{3,})/);
      if (
        m &&
        m[1][0] === fenceMarker[0] &&
        m[1].length >= fenceMarker.length &&
        trimmed.slice(m[1].length).trim() === ""
      ) {
        fenceMarker = null;
      }
    }
    // 在数学块内
    else if (inMathBlock) {
      if (trimmed === "$$") inMathBlock = false;
    }
    // 在HTML注释内
    else if (inHtmlComment) {
      if (trimmed.includes("-->")) inHtmlComment = false;
    }
    // 在HTML块内
    else if (htmlBlockTag !== null) {
      if (new RegExp(`<\\/${htmlBlockTag}\\s*>`, "i").test(trimmed))
        htmlBlockTag = null;
    }

    // 在块外
    else {
      // 通过```或~~~开头,检测是否进入新代码块
      const fenceOpen = trimmed.match(/^(`{3,}|~{3,})/);
      if (fenceOpen) {
        fenceMarker = fenceOpen[1];
      }
      // 通过行首的$$检测是否进入数学块
      else if (trimmed === "$$") {
        inMathBlock = true;
      }
      // 通过行首的<!--检测是否进入HTML注释块
      else if (trimmed.startsWith("<!--")) {
        if (!trimmed.includes("-->")) inHtmlComment = true;
      }
      // 检测是否进入HTML块
      // 自闭和标签<br />不进入块状态
      // 同和闭合<div>text</div>不进入块状态
      // 跨行html块<div class='x'>进入块状态
      else {
        // 匹配开启标签
        const m = trimmed.match(/^<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?\s*>/);
        // 有开启标签，且不是自结束
        if (m && !trimmed.match(/^<[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\s*\/>/)) {
          const tag = m[1].toLowerCase(); // 获取标签名div
          // 排除同行闭合的情况
          if (
            !new RegExp(`<\\/${tag}\\s*>`, "i").test(trimmed.slice(m[0].length))
          ) {
            htmlBlockTag = tag;
          }
        }
      }
    }
  }

  if (currentLines.length > 0) {
    segments.push(currentLines.join("\n"));
  }

  return segments;
}

/**
 * Wraps a unified Processor with segment-level caching.
 * Completed (non-last) segments are parsed once and cached by text content.
 * The last segment is always re-parsed (streaming-friendly).
 * Cache is automatically invalidated when the processor instance changes.
 */
export class SegmentedParser {
  private processor: Processor<any, any, any, any, any> | null = null;
  private cache = new Map<string, any[]>();

  parse(source: string, processor: Processor<any, any, any, any, any>): any[] {
    if (this.processor !== processor) {
      this.processor = processor;
      this.cache.clear();
    }

    // 按照顶层空行将markdown切成多个片段
    const segments = splitIntoSegments(source);
    const allChildren: any[] = [];
    const activeKeys = new Set<string>(); // 本次解析用到的markdown字符串
    // 遍历每个片段
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      // 如果不是最后一个片段,且没有缓存过,则解析并缓存
      if (i < segments.length - 1) {
        if (!this.cache.has(seg)) {
          this.cache.set(seg, this.parseSegment(seg, processor));
        }
        allChildren.push(...this.cache.get(seg)!);
        activeKeys.add(seg);
      }
      // 如果是最后一个片段,则直接解析(不缓存)
      else {
        allChildren.push(...this.parseSegment(seg, processor));
      }
    }

    // 清理之前轮次对话解析时缓存的内容
    for (const key of this.cache.keys()) {
      if (!activeKeys.has(key)) this.cache.delete(key);
    }

    return allChildren;
  }

  // 解析单个片段为hast树节点
  private parseSegment(
    source: string,
    processor: Processor<any, any, any, any, any>
  ): any[] {
    if (!source.trim()) return [];

    // processor.parse(file)将文本解析为语法树，file——要解析的文件；通常 string 或 VFile ；任何值都可以作为 new VFile(x) 中的 x
    // processor.runSync(tree[, file])在语法树上运行转换器
    const file = new VFile();
    file.value = source;
    const tree = processor.runSync(processor.parse(file), file) as any;

    // 或者直接const tree = processor.runSync(processor.parse(source)) as any;
    return tree.children ?? [];

    // 一个hast节点
    //{
    //     "type": "element",
    //     "tagName": "h1",
    //     "properties": {},
    //     "children": [
    //         {
    //             "type": "text",
    //             "value": "xxxxx",
    //             "position": {
    //                 "start": {
    //                     "line": 1,
    //                     "column": 3,
    //                     "offset": 2
    //                 },
    //                 "end": {
    //                     "line": 1,
    //                     "column": 22,
    //                     "offset": 21
    //                 }
    //             }
    //         }
    //     ],
    //     "position": {
    //         "start": {
    //             "line": 1,
    //             "column": 1,
    //             "offset": 0
    //         },
    //         "end": {
    //             "line": 1,
    //             "column": 22,
    //             "offset": 21
    //         }
    //     }
    // }
  }
}
