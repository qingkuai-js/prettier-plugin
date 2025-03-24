import type { TemplateNode } from "./types"
import type { ParserOptions } from "prettier"
import type { LinesAndColumns } from "lines-and-columns"

import { doc } from "prettier"
import { codeFrameColumns } from "@babel/code-frame"
import { HARDLINE_TAGS, INLINE_TAGS, PRESERVE_TAGS } from "./constants"

export function isNull(v: any): v is null {
    return v === null
}

export function isArray(v: any): v is any[] {
    return Array.isArray(v)
}

export function isString(v: any): v is string {
    return typeof v === "string"
}

export function isEmptyString(v: any): v is "" {
    return v === ""
}

export function isUndefined(v: any): v is undefined {
    return v === undefined
}

export function lastElem<T>(arr: T[]): T | undefined {
    return arr[arr.length - 1]
}

// 将字符串中的换行符替换为doc.builders.literalline
export function replaceWithLiteralLine(str: string) {
    const { join, literalline } = doc.builders
    return join(literalline, str.split("\n"))
}

export function isNodeInTopScope(node: TemplateNode) {
    return isNull(node.parent?.parent)
}

export function isTextOrCommentNode(node: TemplateNode | undefined) {
    return node && (isEmptyString(node.tag) || node.tag === "!")
}

export function isScriptOrStyleNode(node: TemplateNode | undefined) {
    return node && (node.tag === "script" || node.tag === "style")
}

// 获取节点的最后一个后代节点
export function getLastDescendant(node: TemplateNode): TemplateNode {
    return node.lastChild ? getLastDescendant(node.lastChild) : node
}

// 抛出带有正确的code frame的错误（嵌入语言中的错误位置是基于嵌入语言内容的）
export function throwEmbedLanguageError(
    error: any,
    options: ParserOptions,
    startSourceIndex: number
): never {
    if (isUndefined(error.cause.pos)) {
        throw error
    }

    const messageWithoutLoc = error.cause.message.replace(/\(\d+:\d+\)$/, "")
    const sourcePositions = options.sourcePositions as LinesAndColumns
    const realErrorPos = startSourceIndex + error.cause.pos
    const s = sourcePositions.locationForIndex(realErrorPos)!
    const locMessage = `(${s.line + 1}:${s.column + 1})`
    const errorLoc = {
        start: {
            line: s.line + 1,
            column: s.column + 1
        }
    }
    const messageTip = codeFrameColumns(options.originalText, errorLoc, {
        highlightCode: true
    })
    if (!isUndefined(error.cause.pos)) {
        error.cause.pos = realErrorPos
    }
    if (!isUndefined(error.cause.loc)) {
        error.cause.loc = errorLoc
    }
    throw new SyntaxError(`${messageWithoutLoc}${locMessage}\n${messageTip}`, {
        cause: error.cause
    })
}

// 判断节点是否只有一个只有空白字符的文本节点
export function isDanlingSpaceNode(node: TemplateNode) {
    if (node.isSelfClosing || node.children.length > 1) {
        return false
    }
    if (!node.children.length) {
        return node.startTagEndPos.index !== node.endTagStartPos.index
    }
    return isEmptyString(node.children[0].tag) && !node.children[0].content.trim()
}

export function isPrettierIgnoreNode(node: TemplateNode) {
    if (PRESERVE_TAGS.has(node.tag) || node.preWhiteSpace) {
        return true
    }
    return node.prev?.tag === "!" && node.prev.content.trim() === "prettier-ignore"
}

export function preferHardlineAsLeadingSpace(node: TemplateNode) {
    return (
        HARDLINE_TAGS.has(node.tag) ||
        (node.prev && preferHardlineAsTrailingSpace(node.prev)) ||
        hasSurroundingLineBreak(node)
    )
}

export function isNodeRegardedInline(node: TemplateNode | undefined | null) {
    return node && (isEmptyString(node.tag) || INLINE_TAGS.has(node.tag))
}

export function forceNextEmptyLine(node: TemplateNode | undefined) {
    return node && node.oriNext && node.loc.end.line + 1 < node.oriNext.loc.start.line
}

export function preferHardlineAsTrailingSpace(node: TemplateNode) {
    return HARDLINE_TAGS.has(node.tag) || node.tag === "br" || hasSurroundingLineBreak(node)
}

export function hasSurroundingLineBreak(node: TemplateNode) {
    return hasTrailingLineBreak(node) && hasLeadingLineBreak(node)
}

export function hasTrailingLineBreak(node: TemplateNode) {
    if (!node.hasTrailingSpace) {
        return false
    }
    if (node.oriNext) {
        return node.oriNext.loc.start.line > node.loc.end.line
    }
    return !isNodeInTopScope(node) && node.parent!.endTagStartPos.line > node.loc.end.line
}

export function hasLeadingLineBreak(node: TemplateNode) {
    if (!node.hasLeadingSpace) {
        return false
    }
    if (node.oriPrev) {
        return node.oriPrev.loc.end.line < node.loc.start.line
    }
    return !isNodeInTopScope(node) && node.parent!.startTagEndPos.line < node.loc.start.line
}

// 由于使用模板字符串(反引号)书写源码时会保留所有空格，这导致在想要书写带有缩进的代码字符串时，
// 字符串内的索引会收到源码文件中缩进层级的影响，或者只能在模板内使用正确的缩进等级，但如果此等级
// 与源码文件中当前位置等级不一致时会导致阅读体验不好
//
// 此方法接受代码文本，并移除第一行的所有前导空格字符，后续其他行会移除与第一行等量的前导空格字符
// 注意：此方法识别代码使用缩进量量的方法为首行空格字符数量（只有一个换行符的行不会被认为是首行）
export function formatSourceCode(code: string) {
    code = code.replace(/^\r?\n*|\r?\n*$/g, "").trimEnd()
    return code.replace(
        new RegExp(`(?:^|\\r?\\n) {${/ *(?=[^ ])/.exec(code)![0].length}}`, "g"),
        matched => {
            return matched.startsWith("\n") ? "\n" : ""
        }
    )
}
