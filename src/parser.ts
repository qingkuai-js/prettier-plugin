import type { ParserOptions } from "prettier"
import type { FixedArray, TemplateNode } from "./types"

import {
    isNull,
    lastElem,
    isEmptyString,
    isNodeInTopScope,
    isPrettierIgnoreNode,
    isScriptOrStyleNode,
    isNodeRegardedInline
} from "./util"
import { displayCommentRE } from "./regular"
import { parseTemplate } from "qingkuai/compiler"
import { LinesAndColumns } from "lines-and-columns"
import { INLINE_BLOCK_TAGS, INLINE_TAGS } from "./constants"

export let sourcePositions: LinesAndColumns
export let [usingTypescript, hasNonEmbedNode] = [false, false]

export function parse(text: string, options: ParserOptions) {
    const defaultPosition = {
        line: -1,
        column: -1,
        index: -1
    }
    const chunks: FixedArray<TemplateNode[], 3> = [[], [], []]
    options.sourcePositions = new LinesAndColumns(text)

    const ret: TemplateNode = {
        parent: null,
        prev: void 0,
        next: void 0,
        oriPrev: void 0,
        oriNext: void 0,
        tag: "",
        display: "",
        content: "",
        children: [],
        attributes: [],
        componentTag: "",
        isEmbedded: false,
        lastChild: undefined,
        preWhiteSpace: false,
        isSelfClosing: false,
        range: [0, text.length],
        hasLeadingSpace: false,
        hasTrailingSpace: false,
        leadingSpaceSensitive: false,
        trailingSpaceSensitive: false,
        startTagEndPos: defaultPosition,
        endTagStartPos: defaultPosition,
        loc: { start: defaultPosition, end: defaultPosition }
    }

    // 排序顶级节点：嵌入脚本块 > 普通节点 > 嵌入样式块
    try {
        parseTemplate(text).forEach((node: any) => {
            if (!node.isEmbedded) {
                chunks[1].push(node)
                return
            }

            if (node.tag !== "lang-js" && node.tag !== "lang-ts") {
                chunks[2].push(node)
                return
            }

            chunks[0].push(node)
            usingTypescript = node.tag === "lang-ts"
        })
    } catch (error: any) {
        // prettier生成错误code frame时需要的列信息为1-based
        if (error.loc) {
            error.loc.end.index++
            error.loc.end.column++
            error.loc.start.index++
            error.loc.start.column++
        }
        throw error
    }

    const nodes = chunks.flat()
    ret.children = nodes
    ret.lastChild = lastElem(nodes)
    hasNonEmbedNode = chunks[1].length > 0

    // 重新调整顶级节点的prev和next属性
    nodes.forEach((node, index) => {
        node.oriPrev = node.prev
        node.oriNext = node.next
        node.prev = nodes[index - 1]
        node.next = nodes[index + 1]
    })

    // 为qingkuai编译器解析的模板AST添加必要属性
    ;(function morph(arr: TemplateNode[]) {
        arr.forEach(node => {
            if (isNull(node.parent)) {
                node.parent = ret
            } else {
                node.oriPrev = node.prev
                node.oriNext = node.next
            }
            preprocess(node, options)
            node.children.forEach(child => {
                preprocess(child, options)
            })
            morph(node.children)
        })
    })(nodes)

    return attachSpaceSensitive(ret), ret
}

export function locEnd(node: TemplateNode) {
    return node.loc.end.index
}

export function locStart(node: TemplateNode) {
    return node.loc.start.index
}

export function preprocess(node: TemplateNode, options: ParserOptions) {
    node.lastChild = lastElem(node.children)
    node.hasLeadingSpace = node.hasTrailingSpace = false

    // attach display property
    if (INLINE_TAGS.has(node.tag)) {
        node.display = "inline"
    }
    if (node.prev && node.prev.tag === "!") {
        node.display = displayCommentRE.exec(node.prev.content)?.[1] || ""
    }
    if (!node.display) {
        switch (options.htmlWhitespaceSensitivity) {
            case "strict":
                node.display = "inline"
                break
            case "ignore":
                node.display = "block"
                break
            default:
                if (!isEmptyString(node.tag)) {
                    node.display = INLINE_BLOCK_TAGS.has(node.tag) ? "inline-block" : "block"
                }
        }
    }

    if (isEmptyString(node.tag)) {
        const withLeadingSpace = /^\s/.test(node.content)
        const withTrailingSpace = /\s$/.test(node.content)
        if (withLeadingSpace) {
            node.hasLeadingSpace = true
            node.prev && (node.prev.hasTrailingSpace = true)
        }
        if (withTrailingSpace) {
            node.hasTrailingSpace = true
            node.next && (node.next.hasLeadingSpace = true)
        }
    } else {
        if (node.prev) {
            node.hasLeadingSpace = node.range[0] !== node.prev.range[1]
        }
        if (node.next) {
            node.hasTrailingSpace = node.range[1] !== node.next.range[0]
        }
        if (node === node.parent?.children[0]) {
            node.hasLeadingSpace = node.range[0] !== node.parent.startTagEndPos.index
        }
        if (node === lastElem(node.parent?.children || [])) {
            node.hasTrailingSpace = node.range[1] !== node.parent?.endTagStartPos.index
        }
    }
}

// attach ladingSpaceSensitive and trailingSpaceSensitive properties
function attachSpaceSensitive(node: TemplateNode) {
    node.children.forEach(child => {
        child.leadingSpaceSensitive = isSpaceSensitive(child, "head")
        child.trailingSpaceSensitive = isSpaceSensitive(child, "tail")
    })

    node.children.forEach((child, index) => {
        if (index !== 0) {
            child.leadingSpaceSensitive &&= !!child.prev?.trailingSpaceSensitive
        }
        if (child !== child.parent?.lastChild) {
            child.trailingSpaceSensitive &&= !!child.next?.leadingSpaceSensitive
        }
    })

    // 后代递归处理
    node.children.forEach(attachSpaceSensitive)

    function isSpaceSensitive(node: TemplateNode, type: "head" | "tail") {
        const sibling = node[type === "head" ? "prev" : "next"]

        if (node.parent && node.parent.display === "none") {
            return false
        }

        if (node.parent && isPrettierIgnoreNode(node.parent)) {
            return true
        }

        if (sibling && !isNodeRegardedInline(sibling)) {
            return false
        }

        // prettier-ignore
        if (
            !sibling &&
            (
                isNodeInTopScope(node) ||
                isScriptOrStyleNode(node) ||
                ( node.parent && isPrettierIgnoreNode(node)) ||
                (!isNodeRegardedInline(node.parent) && !INLINE_BLOCK_TAGS.has(node.parent?.tag))
            )
        ) {
            return false
        }

        return true
    }
}
