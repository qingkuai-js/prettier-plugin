import type { AstPath, Doc, Options, ParserOptions } from "prettier"
import type { EmbedReturnValue, EmbedTextToDocFunc, PrintFunc, TemplateNode } from "../types"

import {
    lastElem,
    isEmptyString,
    isNodeInTopScope,
    getLastDescendant,
    isDanlingSpaceNode,
    forceNextEmptyLine,
    isTextOrCommentNode,
    hasLeadingLineBreak,
    hasTrailingLineBreak,
    isPrettierIgnoreNode,
    replaceWithLiteralLine,
    preferHardlineAsLeadingSpace
} from "../util"
import { doc } from "prettier"
import { hasNonEmbedNode, usingTypescript } from "../parser"
import { templateEmbeddedLangTag } from "../regular"
import { INLINE_TAGS, TABLE_TAGS_DISPLAY } from "../constants"
import { util as qingkuaiCompilerUtil, util } from "qingkuai/compiler"

const { hardline, line, fill, join, indent, softline, group, breakParent, ifBreak } = doc.builders

export function embed(path: AstPath, _options: Options): EmbedReturnValue {
    const node: TemplateNode = path.getNode()

    // the options paramater satisfies ParserOptions type
    const options = _options as ParserOptions

    return async (textToDoc, print) => {
        if (!node.parent) {
            return [printChildren(path, print), hardline]
        }

        if (
            node.tag === "style" ||
            node.tag === "script" ||
            templateEmbeddedLangTag.test(node.tag)
        ) {
            let parser: Options["parser"]
            switch (node.tag) {
                case "style":
                case "lang-css":
                    parser = "css"
                    break
                case "script":
                case "lang-js":
                    parser = "acorn"
                    break
                case "lang-ts":
                    parser = "babel-ts"
                    break
                case "lang-scss":
                    parser = "scss"
                    break
                case "lang-less":
                    parser = "less"
                    break
                default:
                    parser = "css"
            }

            const noContent = !node.content.trim().length
            const formatedDoc = await textToDoc(node.content, { parser })
            return [
                printOpeningTagPrefix(node),
                group(await printOpeningTag(node, options, textToDoc)),
                indent([noContent ? "" : hardline, formatedDoc]),
                noContent ? "" : hardline,
                printClosingTag(node, options),
                printClosingTagSuffix(node)
            ]
        }

        if (isEmptyString(node.tag)) {
            return await printContentOfTextNode(node, textToDoc, options)
        }

        if (node.tag === "!") {
            const originalText = options.originalText.slice(...node.range)
            return [
                printOpeningTagPrefix(node),
                replaceWithLiteralLine(originalText),
                printClosingTagSuffix(node)
            ]
        }

        return await printElement(path, options, print, textToDoc)
    }
}

async function printElement(
    path: AstPath,
    options: ParserOptions,
    print: PrintFunc,
    textToDoc: EmbedTextToDocFunc
) {
    const node: TemplateNode = path.getNode()

    if (isPrettierIgnoreNode(node)) {
        let [start, end] = node.range

        if (node.prev && needsToBorrowNextOpeningTagStartMarker(node.prev)) {
            start += 1
        }
        if (node.next && needsToBorrowPrevClosingTagEndMarker(node.next)) {
            end -= printClosingTagEndMarker(node).length
        }

        const originalText = options.originalText.slice(start, end)
        const preservedText = replaceWithLiteralLine(originalText)
        return [printOpeningTagPrefix(node), preservedText, printClosingTagSuffix(node)]
    }

    const printTag = async (doc: Doc) => {
        const openingTag = await printOpeningTag(node, options, textToDoc)
        return group([group(openingTag), doc, printClosingTag(node, options)])
    }

    const printLineAfterChildren = () => {
        const needsToBorrow = node.next
            ? needsToBorrowPrevClosingTagEndMarker(node.next)
            : needsToBorrowLastChildClosingTagEndMarker(node.parent)
        if (needsToBorrow) {
            if (node.lastChild?.hasTrailingSpace && node.lastChild.trailingSpaceSensitive) {
                return " "
            }
            return ""
        }
        if (node.lastChild?.hasTrailingSpace && node.lastChild.trailingSpaceSensitive) {
            return line
        }
        if (
            node.lastChild?.tag === "!" &&
            new RegExp(`\\n[\\t ]{${options.tabWidth * (path.ancestors.length - 1)}}$`, "u").test(
                node.lastChild.content
            )
        ) {
            return ""
        }
        return softline
    }

    if (!node.children.length) {
        return await printTag(isDanlingSpaceNode(node) && INLINE_TAGS.has(node.tag) ? line : "")
    }

    const firstChild = node.children[0]
    return await printTag([
        forceBreakContent(node) ? breakParent : "",
        indent([
            firstChild.hasLeadingSpace && firstChild.leadingSpaceSensitive ? line : softline,
            printChildren(path, print)
        ]),
        printLineAfterChildren()
    ])
}

async function printAttribute(
    node: TemplateNode,
    options: ParserOptions,
    textToDoc: EmbedTextToDocFunc
) {
    if (!node.attributes.length) {
        return node.isSelfClosing ? " " : ""
    }

    const printedAttribute: Doc[] = []

    for (const attr of node.attributes) {
        if (attr.quote === "none") {
            printedAttribute.push(attr.key.raw)
            continue
        }

        let value: Doc = attr.value.raw
        let quote = options.singleQuote ? "'" : '"'

        if (/[!@#&]/.test(attr.key.raw[0])) {
            if (attr.key.raw === "#for") {
                value = await printForDirective(textToDoc, value, options)
            } else {
                value = await printInterpolation(textToDoc, value, options)
            }
        } else {
            if (attr.value.raw.includes(quote)) {
                quote = options.originalText[attr.value.loc.start.index - 1]
            }
            value = [quote, replaceWithLiteralLine(value), quote]
        }

        printedAttribute.push(group([attr.key.raw, "=", value]))
    }

    const forceNotToBreak =
        node.tag === "script" &&
        node.attributes.length === 1 &&
        node.attributes[0].key.raw === "src"
    const gap = options.singleAttributePerLine && node.attributes[1] ? hardline : line
    const parts: Doc[] = [indent([forceNotToBreak ? " " : line, join(gap, printedAttribute)])]

    if (
        forceNotToBreak ||
        options.bracketSameLine ||
        needsToBorrowParentOpeningTagEndMarker(node.children[0]) ||
        (node.isSelfClosing && needsToBorrowLastChildClosingTagEndMarker(node.parent))
    ) {
        return parts.concat(node.isSelfClosing ? " " : "")
    }

    return parts.concat(node.isSelfClosing ? line : softline)
}

function printChildren(path: AstPath, print: PrintFunc) {
    const node = path.getNode()
    if (forceBreakChildren(node)) {
        return [
            breakParent,

            ...path.map((childPath: AstPath) => {
                const child: TemplateNode = childPath.getNode()!
                const betweenLine = child.prev ? printBetweenLine(child) : ""
                return [
                    betweenLine
                        ? [betweenLine, forceNextEmptyLine(child.prev) ? hardline : ""]
                        : "",
                    print(childPath)
                ]
            }, "children")
        ]
    }

    const groupIds = node.children.map(() => Symbol())

    return path.map((childPath: AstPath, childIndex) => {
        const child: TemplateNode = childPath.getNode()

        if (isTextOrCommentNode(child)) {
            if (isTextOrCommentNode(child.prev)) {
                const prevBetweenLine = printBetweenLine(child)
                if (prevBetweenLine) {
                    if (forceNextEmptyLine(child.prev)) {
                        return [hardline, hardline, print(childPath)]
                    }
                    return [prevBetweenLine, print(childPath)]
                }
            }
            return print(childPath)
        }

        let [isEmbedStyle, isEmbedScript] = [false, false]
        child.isEmbedded && (isEmbedStyle = !(isEmbedScript = /-[jt]s$/.test(child.tag)))

        const prevParts: Doc = []
        const nextParts: Doc = []
        const leadingParts: Doc = []
        const trailingParts: Doc = []
        const prevBetweenLine = child.prev ? printBetweenLine(child) : ""
        const nextBetweenLine = child.next ? printBetweenLine(child.next) : ""

        if (prevBetweenLine) {
            if (forceNextEmptyLine(child.prev) || isEmbedStyle) {
                prevParts.push(hardline, hardline)
            } else if (prevBetweenLine === hardline) {
                prevParts.push(hardline)
            } else if (isTextOrCommentNode(child.prev)) {
                leadingParts.push(prevBetweenLine)
            } else {
                leadingParts.push(
                    ifBreak("", softline, {
                        groupId: groupIds[childIndex - 1]
                    })
                )
            }
        }

        if (nextBetweenLine) {
            if (forceNextEmptyLine(child)) {
                if (isTextOrCommentNode(child.next)) {
                    nextParts.push(hardline, hardline)
                }
            } else if (nextBetweenLine === hardline) {
                if (isEmbedScript && hasNonEmbedNode) {
                    nextParts.push(hardline)
                }
                if (isTextOrCommentNode(child.next)) {
                    nextParts.push(hardline)
                }
            } else {
                trailingParts.push(nextBetweenLine)
            }
        }

        return [
            ...prevParts,
            group([
                ...leadingParts,
                group([print(childPath), ...trailingParts], {
                    id: groupIds[childIndex]
                })
            ]),
            ...nextParts
        ]
    }, "children")
}

async function printContentOfTextNode(
    node: TemplateNode,
    textToDoc: EmbedTextToDocFunc,
    options: ParserOptions
) {
    const docs: Doc[] = [printOpeningTagPrefix(node)]

    const mergeWhitespace = (str: string) => {
        return join(line, str.replace(/\s+/g, " ").split(" "))
    }

    for (let content = node.content[node.next ? "trimStart" : "trim"](); content.length; ) {
        const startBracketIndex = content.indexOf("{")
        if (startBracketIndex === -1) {
            docs.push(mergeWhitespace(content))
            break
        } else {
            docs.push(mergeWhitespace(content.slice(0, startBracketIndex)))
        }

        const endBracketIndex = qingkuaiCompilerUtil.findEndBracket(content, startBracketIndex + 1)
        const interpolationText = content.slice(startBracketIndex + 1, endBracketIndex)
        docs.push(await printInterpolation(textToDoc, interpolationText, options))
        content = content.slice(endBracketIndex + 1)
    }

    return fill([...docs, printClosingTagSuffix(node)])
}

async function printInterpolation(
    textToDoc: EmbedTextToDocFunc,
    text: string,
    options: ParserOptions
) {
    let formatedDoc: Doc
    let interpolationDoc: Doc

    if (!text) {
        interpolationDoc = text
    } else {
        interpolationDoc = await textToDoc(text, getInterpolationFormatOptions())
    }

    if (options.spaceAroundInterpolation && interpolationDoc) {
        formatedDoc = ifBreak(
            [indent([line, interpolationDoc]), line],
            [" ", interpolationDoc, " "]
        )
    } else {
        formatedDoc = ifBreak([indent([softline, interpolationDoc]), softline], interpolationDoc)
    }

    return group(["{", formatedDoc, "}"])
}

async function printForDirective(
    textToDoc: EmbedTextToDocFunc,
    text: string,
    options: ParserOptions
) {
    const textToDocOptions = getInterpolationFormatOptions()
    const ofKeywordIndex = qingkuaiCompilerUtil.findOutOfSC(text, " of ")
    if (ofKeywordIndex === -1) {
        return printInterpolation(textToDoc, text, options)
    }

    const contextDoc = await textToDoc(text.slice(0, ofKeywordIndex), {
        __isQingkuaiForDirective: true,
        ...textToDocOptions
    })
    const interpolationDoc = [
        contextDoc,
        " of",
        line,
        await textToDoc(text.slice(ofKeywordIndex + 4), textToDocOptions)
    ]

    let formatedInterpolationDoc: Doc
    if (options.spaceAroundInterpolation) {
        formatedInterpolationDoc = ifBreak(
            [indent([line, interpolationDoc]), line],
            [" ", interpolationDoc, " "]
        )
    } else {
        formatedInterpolationDoc = ifBreak(
            [indent([softline, interpolationDoc]), softline],
            interpolationDoc
        )
    }

    return group(["{", formatedInterpolationDoc, "}"])
}

function printBetweenLine(node: TemplateNode) {
    const [prevNode, nextNode] = [node.prev!, node]

    // prettier-ignore
    if (
        (needsToBorrowPrevClosingTagEndMarker(nextNode) && prevNode.isSelfClosing) ||
        (
            needsToBorrowNextOpeningTagStartMarker(prevNode) &&
            (nextNode.isSelfClosing || nextNode.children.length || nextNode.attributes.length)
        )
    ) {
        return ""
    }

    // prettier-ignore
    if (
        !nextNode.leadingSpaceSensitive ||
        preferHardlineAsLeadingSpace(nextNode) ||
        (
            prevNode.lastChild &&
            prevNode.lastChild.lastChild &&
            needsToBorrowPrevClosingTagEndMarker(nextNode) &&
            needsToBorrowParentClosingTagStartMarker(prevNode.lastChild) &&
            needsToBorrowParentClosingTagStartMarker(prevNode.lastChild.lastChild)
        )
    ){
        return hardline
    }

    return nextNode.hasLeadingSpace ? line : softline
}

function forceBreakContent(node: TemplateNode) {
    if (forceBreakChildren(node)) {
        return true
    }

    if (!node.children.length) {
        return false
    }

    if (
        ["body", "script", "style"].includes(node.tag) ||
        node.children.some(child => {
            return child.children.some(child => !isEmptyString(child.tag))
        })
    ) {
        return true
    }

    return (
        node.children[0] === node.lastChild &&
        !isEmptyString(node.children[0].tag) &&
        hasLeadingLineBreak(node.children[0]) &&
        (!node.lastChild.trailingSpaceSensitive || hasTrailingLineBreak(node.lastChild))
    )
}

function forceBreakChildren(node: TemplateNode) {
    if (!node.children.length) {
        return false
    }

    if (["html", "head", "ul", "ol", "select"].includes(node.tag)) {
        return true
    }

    return TABLE_TAGS_DISPLAY.some(item => {
        return item.tag === node.tag && item.display !== "table-cell"
    })
}

function printClosingTagSuffix(node: TemplateNode) {
    if (needsToBorrowParentClosingTagStartMarker(node)) {
        return `</${node.parent!.tag}`
    }
    if (needsToBorrowNextOpeningTagStartMarker(node)) {
        return `<${node.next!.tag}`
    }
    return ""
}

function printOpeningTagPrefix(node: TemplateNode) {
    if (needsToBorrowPrevClosingTagEndMarker(node)) {
        return printClosingTagEndMarker(node.prev!)
    }
    if (needsToBorrowParentOpeningTagEndMarker(node)) {
        return ">"
    }
    return ""
}

function printClosingTagEndMarker(node: TemplateNode) {
    return node.isSelfClosing ? "/>" : ">"
}

function printClosingTagPrefix(node: TemplateNode) {
    if (!needsToBorrowLastChildClosingTagEndMarker(node)) {
        return ""
    }
    return printClosingTagEndMarker(lastElem(node.children)!)
}

async function printOpeningTag(
    node: TemplateNode,
    options: ParserOptions,
    textToDoc: EmbedTextToDocFunc
) {
    return [
        printOpeningTagStart(node, options),
        await printAttribute(node, options, textToDoc),
        node.isSelfClosing ? "" : printOpeningTagEnd(node)
    ]
}

function printClosingTag(node: TemplateNode, options: ParserOptions): Doc[] {
    // prettier-ignore
    return [
        node.isSelfClosing ? "" : printClosingTagStart(node, options),
        printClosingTagEnd(node)
    ]
}

function printClosingTagStart(node: TemplateNode, options: ParserOptions) {
    if (needsToBorrowParentClosingTagStartMarker(lastElem(node.children))) {
        return ""
    }
    return [printClosingTagPrefix(node), `</${getPreferedTag(node, options)}`]
}

function printClosingTagEnd(node: TemplateNode) {
    if (
        (node.next && needsToBorrowPrevClosingTagEndMarker(node.next)) ||
        (!node.next && needsToBorrowLastChildClosingTagEndMarker(node.parent))
    ) {
        return ""
    }
    return [printClosingTagEndMarker(node), printClosingTagSuffix(node)]
}

function printOpeningTagStart(node: TemplateNode, options: ParserOptions) {
    if (!node.prev || !needsToBorrowNextOpeningTagStartMarker(node.prev)) {
        return [printOpeningTagPrefix(node), `<${getPreferedTag(node, options)}`]
    }
    return ""
}

function printOpeningTagEnd(node: TemplateNode) {
    return needsToBorrowParentOpeningTagEndMarker(node.children[0]) ? "" : ">"
}

function getInterpolationFormatOptions() {
    return {
        __embeddedInHtml: true,
        __isInHtmlAttribute: true,
        parser: usingTypescript ? "qingkuai-ts-expression" : "qingkuai-js-expression"
    }
}

function getPreferedTag(node: TemplateNode, options: ParserOptions) {
    if (
        !node.componentTag ||
        util.isEmbededLanguageTag(node.tag) ||
        options.componentTagFormatPreference === "none"
    ) {
        return node.tag
    }

    const useKebab = options.componentTagFormatPreference === "kebab"
    return useKebab ? util.camel2Kebab(node.tag, false) : node.componentTag
}

function needsToBorrowNextOpeningTagStartMarker(node: TemplateNode | undefined | null) {
    if (!node || isTextOrCommentNode(node.next)) {
        return false
    }

    return !!(
        node.next &&
        !node.hasTrailingSpace &&
        isTextOrCommentNode(node) &&
        node.trailingSpaceSensitive &&
        !isTextOrCommentNode(node.next)
    )
}

function needsToBorrowParentOpeningTagEndMarker(node: TemplateNode | undefined | null) {
    return !!(
        node &&
        !node.prev &&
        !node.hasLeadingSpace &&
        !isNodeInTopScope(node) &&
        node.leadingSpaceSensitive
    )
}

function needsToBorrowParentClosingTagStartMarker(node: TemplateNode | undefined | null) {
    return !!(
        node &&
        !node.next &&
        !node.hasTrailingSpace &&
        !isNodeInTopScope(node) &&
        node.trailingSpaceSensitive &&
        isTextOrCommentNode(getLastDescendant(node))
    )
}

function needsToBorrowLastChildClosingTagEndMarker(node: TemplateNode | undefined | null) {
    if (!node || isTextOrCommentNode(node.lastChild)) {
        return false
    }

    return !!(
        !isPrettierIgnoreNode(node) &&
        node.lastChild?.trailingSpaceSensitive &&
        !node.lastChild.hasTrailingSpace &&
        !isTextOrCommentNode(getLastDescendant(node))
    )
}

function needsToBorrowPrevClosingTagEndMarker(node: TemplateNode | undefined | null) {
    if (!node || isTextOrCommentNode(node.prev)) {
        return false
    }
    return !!(node.prev && node.leadingSpaceSensitive && !node.hasLeadingSpace)
}
