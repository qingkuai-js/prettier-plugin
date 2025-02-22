import type { AstPath, Doc, Options, ParserOptions } from "prettier"
import type { EmbedReturnValue, EmbedTextToDocFunc, PrintFunc, TemplateNode } from "./types"

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
} from "./util"
import { doc } from "prettier"
import { usingTypescript } from "./parser"
import { INLINE_TAGS, TABLE_TAGS_DISPLAY } from "./constants"
import { util as qingkuaiCompilerUtil } from "qingkuai/compiler"
import { templateEmbeddedLangTag } from "./regular"

const { hardline, line, fill, join, indent, softline, group, breakParent, ifBreak } = doc.builders

// export function print(path: AstPath, options: ParserOptions, print: PrintFunc) {
//     const node: TemplateNode = path.getNode()

//     if (!node.parent) {
//         return printChildren(path, print)
//     }

//     if (isEmptyString(node.tag)) {
//         return fill([printOpeningTagPrefix(node), node.content.trim(), printClosingTagSuffix(node)])
//     }

//     if (node.tag === "!") {
//         const originalText = options.originalText.slice(...node.range)
//         return [
//             printOpeningTagPrefix(node),
//             replaceWithLiteralLine(originalText),
//             printClosingTagSuffix(node)
//         ]
//     }

//     return printElement(path, options, print)
// }

export function embed(path: AstPath, _options: Options): EmbedReturnValue {
    const node: TemplateNode = path.getNode()

    // the options paramater satisfies ParserOptions type
    const options = _options as ParserOptions

    return async (textToDoc, print) => {
        if (!node.parent) {
            return printChildren(path, print)
        }

        if (isEmptyString(node.tag)) {
            return await printContentOfTextNode(node, textToDoc)
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
            }

            const noContent = !node.content.trim().length
            const formatedDoc = await textToDoc(node.content, { parser })
            return [
                printOpeningTagPrefix(node),
                group(await printOpeningTag(node, options, textToDoc)),
                indent([noContent ? "" : hardline, formatedDoc]),
                noContent ? "" : hardline,
                printClosingTag(node),
                printClosingTagSuffix(node)
            ]
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
        return group([group(openingTag), doc, printClosingTag(node)])
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

async function printContentOfTextNode(node: TemplateNode, textToDoc: EmbedTextToDocFunc) {
    const docs: Doc[] = [printOpeningTagPrefix(node)]

    const mergeWhitespace = (str: string) => {
        return join(line, str.replace(/\s+/g, " ").split(" "))
    }

    for (let content = node.content.trim(); content.length; ) {
        const startBracketIndex = content.indexOf("{")
        if (startBracketIndex === -1) {
            docs.push(mergeWhitespace(content))
            break
        } else {
            docs.push(mergeWhitespace(content.slice(0, startBracketIndex)))
        }

        const endBracketIndex = qingkuaiCompilerUtil.findEndBracket(content, startBracketIndex + 1)
        docs.push(
            await printInterpolation(
                textToDoc,
                content.slice(startBracketIndex + 1, endBracketIndex)
            )
        )
        content = content.slice(endBracketIndex + 1)
    }

    return fill([...docs, printClosingTagSuffix(node)])
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

function printClosingTag(node: TemplateNode): Doc[] {
    // prettier-ignore
    return [
        node.isSelfClosing ? "" : printClosingTagStart(node),
        printClosingTagEnd(node)
    ]
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
        printOpeningTagStart(node),
        await printAttribute(node, options, textToDoc),
        node.isSelfClosing ? "" : printOpeningTagEnd(node)
    ]
}

function printClosingTagStart(node: TemplateNode) {
    if (needsToBorrowParentClosingTagStartMarker(lastElem(node.children))) {
        return ""
    }
    return [printClosingTagPrefix(node), `</${node.tag}`]
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

function printOpeningTagStart(node: TemplateNode) {
    if (!node.prev || !needsToBorrowNextOpeningTagStartMarker(node.prev)) {
        return [printOpeningTagPrefix(node), `<${node.tag}`]
    }
    return ""
}

function printOpeningTagEnd(node: TemplateNode) {
    return needsToBorrowParentOpeningTagEndMarker(node.children[0]) ? "" : ">"
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
            return attr.key.raw
        }

        let value: Doc = attr.value.raw
        let quote = options.singleQuote ? "'" : '"'

        if (attr.quote === "curly") {
            value = await printInterpolation(textToDoc, value)
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
                if (isEmbedScript || isTextOrCommentNode(child.next)) {
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

async function printInterpolation(textToDoc: EmbedTextToDocFunc, text: string) {
    const formatedDoc = await textToDoc(text, {
        parser: usingTypescript ? "__ts_expression" : "__js_expression"
    })
    return group(["{", ifBreak([indent([softline, formatedDoc]), softline], formatedDoc), "}"])
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

function needsToBorrowNextOpeningTagStartMarker(node: TemplateNode | undefined | null) {
    return !!(
        node &&
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
    if (!node) {
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
    return !!(node && node.prev && node.leadingSpaceSensitive && !node.hasLeadingSpace)
}
