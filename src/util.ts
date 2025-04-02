import type { TemplateNode } from "./types"
import type { ParserOptions } from "prettier"

import { doc } from "prettier"
import { LinesAndColumns } from "lines-and-columns"
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

// 抛出带有正确的code frame的错误（嵌入语言中的错误位置是基于嵌入语言内容的）
export function throwEmbedLanguageError(
    error: any,
    content: string,
    options: ParserOptions,
    startSourceIndex: number
): never {
    if (isUndefined(error.loc)) {
        throw error
    }

    let locMessage = ""
    const lac = new LinesAndColumns(content)
    const errorIndex = lac.indexForLocation({
        line: error.loc.start.line - 1,
        column: error.loc.start.column - 1
    })!
    const realErrIndex = startSourceIndex + errorIndex
    const slac = options.sourcePositions as LinesAndColumns
    const errorLocation = slac.locationForIndex(realErrIndex)!
    if (error.cause?.message) {
        const messageWithoutLoc = error.cause?.message.replace(
            /^<css input>:\d+:\d+: | \(\d+:\d+\)$/,
            ""
        )
        locMessage = messageWithoutLoc + ` (${errorLocation.line + 1}:${errorLocation.column + 1})`
    }

    const realErrorLocation = {
        start: {
            line: errorLocation.line + 1,
            column: errorLocation.column + 1
        }
    }
    if (!isUndefined(error.cause.pos)) {
        error.cause.pos = realErrIndex
    }
    if (!isUndefined(error.cause.loc)) {
        error.cause.loc = realErrorLocation
    }

    const codeFrame = codeFrameColumns(options.originalText, realErrorLocation, {
        highlightCode: true
    })
    throw new SyntaxError(`${locMessage}\n${codeFrame}`, {
        cause: error.cause
    })
}
