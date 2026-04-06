import type { AstPath, Doc, Options, ParserOptions } from "prettier"
import type { EmbedReturnValue, EmbedTextToDocFunc, PrintFunc, TemplateNode } from "../types"

import {
    lastElem,
    isEmptyString,
    getRangeByLoc,
    isNodeInTopScope,
    getLastDescendant,
    isDanlingSpaceNode,
    forceNextEmptyLine,
    isTextOrCommentNode,
    hasLeadingLineBreak,
    hasTrailingLineBreak,
    isPrettierIgnoreNode,
    replaceWithLiteralLine,
    throwEmbedLanguageError,
    preferHardlineAsLeadingSpace
} from "../util"
import { doc } from "prettier"
import { templateEmbeddedLangTag } from "../regular"
import { hasNonEmbedNode, usingTypescript } from "../parser"
import {
    COMPONENT_GENERIC,
    INLINE_TAGS,
    PATTERN_KEYWORD_DIRECTIVE,
    TABLE_TAGS_DISPLAY
} from "../constants"
import { parseDirectiveValue, TemplateAttribute, util as qingkuaiUtils } from "qingkuai/compiler"

const { hardline, line, fill, join, indent, softline, group, breakParent, ifBreak } = doc.builders

export function embed(path: AstPath, _options: Options): EmbedReturnValue {
    if (typeof process !== "undefined" && !process.env.PRETTIER_DEBUG) {
        process.env.PRETTIER_DEBUG = "1"
    }
    if (typeof self !== "undefined" && !(self as any).PRETTIER_DEBUG) {
        ;(self as any).PRETTIER_DEBUG = "1"
    }

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
            const source = node.children[0]?.rawContent ?? ""
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

            try {
                const noContent = !source.trim().length
                const formatedDoc = await textToDoc(source, {
                    ...options,
                    parser
                })
                return [
                    printStartTagPrefix(node),
                    group(await printStartTag(node, options, textToDoc)),
                    indent([noContent ? "" : hardline, formatedDoc]),
                    noContent ? "" : hardline,
                    printEndTag(node, options),
                    printEndTagSuffix(node)
                ]
            } catch (error: any) {
                throwEmbedLanguageError(error, source, options, node.startTagEndPos.index)
            }
        }

        if (isEmptyString(node.tag)) {
            return await printContentOfTextNode(node, options, textToDoc)
        }

        if (node.tag === "!") {
            const originalText = options.originalText.slice(...getRangeByLoc(node.loc))
            return [
                printStartTagPrefix(node),
                replaceWithLiteralLine(originalText),
                printEndTagSuffix(node)
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

    const printTag = async (doc: Doc) => {
        const openingTag = await printStartTag(node, options, textToDoc)
        return group([group(openingTag), doc, printEndTag(node, options)])
    }

    if (isPrettierIgnoreNode(node)) {
        let [start, end] = [node.startTagEndPos.index, node.endTagStartPos.index]
        if (node.prev && needsToBorrowNextStartTagOpeningMarker(node.prev)) {
            start += 1
        }
        if (node.next && needsToBorrowPrevEndTagClosingMarker(node.next)) {
            end -= printEndTagClosingMarker(node).length
        }
        return printTag(replaceWithLiteralLine(options.originalText.slice(start, end)))
    }

    const printLineAfterChildren = () => {
        const needsToBorrow = node.next
            ? needsToBorrowPrevEndTagClosingMarker(node.next)
            : needsToBorrowLastChildEndTagClosingMarker(node.parent)
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
                node.lastChild.rawContent
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
        return node.isSelfClosing ? line : ""
    }

    const printedAttribute: Doc[] = []

    for (const attr of node.attributes) {
        let attrName = attr.name.raw
        if (node.componentTag) {
            if (options.componentAttributeFormatPreference === "kebab") {
                attrName = qingkuaiUtils.camel2Kebab(attrName)
            } else {
                attrName = qingkuaiUtils.kebab2Camel(attrName)
            }
        }

        if (attr.valueEnclosure === "none") {
            printedAttribute.push(attrName)
            continue
        }

        let value: Doc = attr.value.raw
        let quote = options.singleQuote ? "'" : '"'

        if (/[!@#&]/.test(attr.name.raw[0])) {
            const startSourceIndex = attr.value.loc.start.index
            if (attr.name.raw === "#for" || attr.name.raw === "#slot") {
                value = await printPatternKeywordDirective(attr, options, textToDoc)
            } else {
                value = await printInterpolation(value, options, startSourceIndex, textToDoc)
            }
        } else {
            if (attr.value.raw.includes(quote)) {
                quote = options.originalText[attr.value.loc.start.index - 1]
            }
            value = [quote, replaceWithLiteralLine(value), quote]
        }

        printedAttribute.push(group([attrName, "=", value]))
    }

    const forceNotToBreak =
        node.tag === "script" &&
        node.attributes.length === 1 &&
        node.attributes[0].name.raw === "src"
    const gap = options.singleAttributePerLine && node.attributes[1] ? hardline : line
    const parts: Doc[] = [indent([forceNotToBreak ? " " : line, join(gap, printedAttribute)])]

    if (
        forceNotToBreak ||
        options.bracketSameLine ||
        needsToBorrowParentStartTagClosingMarker(node.children[0]) ||
        (node.isSelfClosing && needsToBorrowLastChildEndTagClosingMarker(node.parent))
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
    options: ParserOptions,
    textToDoc: EmbedTextToDocFunc
) {
    const docs: Doc[] = [printStartTagPrefix(node)]
    for (let i = 0; i < node.content.length; i++) {
        const contentPart = node.content[i]
        if (contentPart.isInterpolated) {
            docs.push(
                await printInterpolation(
                    contentPart.value,
                    options,
                    node.loc.start.index,
                    textToDoc
                )
            )
            continue
        }

        let partValue = contentPart.value
        if (/\s/.test(partValue[0])) {
            docs.push(softline)
        }
        if (i === 0) {
            partValue = partValue.trimStart()
        }
        if (i === node.content.length - 1 && !node.next) {
            partValue = partValue.trimEnd()
        }
        docs.push(partValue.replace(/\s+/g, " "))
    }
    return fill([...docs, printEndTagSuffix(node)])
}

async function printInterpolation(
    text: string,
    options: ParserOptions,
    startSourceIndex: number,
    textToDoc: EmbedTextToDocFunc
) {
    let doc: Doc
    let formatedDoc: Doc

    if (!text) {
        doc = text
    } else {
        try {
            doc = await textToDoc(text, getExpressionFormatOptions(options))
        } catch (error: any) {
            throwEmbedLanguageError(error, text, options, startSourceIndex)
        }
    }

    if (!options.spaceAroundInterpolation || !doc) {
        formatedDoc = ifBreak([indent([softline, doc]), softline], doc)
    } else {
        formatedDoc = ifBreak([indent([line, doc]), line], [" ", doc, " "])
    }

    return group(["{", formatedDoc, "}"])
}

async function printPatternKeywordDirective(
    directive: TemplateAttribute,
    options: ParserOptions,
    textToDoc: EmbedTextToDocFunc
) {
    const rawValue = directive.value.raw
    const valueStartIndex = directive.value.loc.start.index
    const textToDocOptions = getExpressionFormatOptions(options)
    try {
        const parseRes = parseDirectiveValue(directive)!
        const keyword = directive.name.raw === "#for" ? "of" : "from"
        if (parseRes.keywordIndex === -1) {
            return printInterpolation(rawValue, options, valueStartIndex, textToDoc)
        }

        const contextDoc = await textToDoc(`[${rawValue.slice(0, parseRes.keywordIndex)}]`, {
            ...textToDocOptions,
            [PATTERN_KEYWORD_DIRECTIVE]: true
        })
        const interpolationDoc = [
            contextDoc,
            ` ${keyword} `,
            await textToDoc(parseRes.base, textToDocOptions)
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
    } catch (err) {
        throwEmbedLanguageError(err, rawValue, options, valueStartIndex + 1)
    }
}

async function printComponentGenerics(
    node: TemplateNode,
    options: ParserOptions,
    textToDoc: EmbedTextToDocFunc
) {
    if (!node.componentTag || !node.typeArgument) {
        return ""
    }

    const source = `_ as T<${node.typeArgument.raw}>`
    const textToDocOptions = getExpressionFormatOptions(options)
    try {
        const genericDoc = await textToDoc(source, {
            ...textToDocOptions,
            [COMPONENT_GENERIC]: true
        })
        return group(["<", indent([indent([softline, genericDoc]), softline, ">"])])
    } catch (err) {
        throwEmbedLanguageError(err, source, options, node.typeArgument.loc.start.index - 7)
    }
}

function printBetweenLine(node: TemplateNode) {
    const prevNode = node.prev!

    // prettier-ignore
    if (
        (needsToBorrowPrevEndTagClosingMarker(node) && prevNode.isSelfClosing) ||
        (
            needsToBorrowNextStartTagOpeningMarker(prevNode) &&
            (node.isSelfClosing || node.children.length || node.attributes.length)
        )
    ) {
        return ""
    }

    // prettier-ignore
    if (
        !node.leadingSpaceSensitive ||
        preferHardlineAsLeadingSpace(node) ||
        (
            prevNode.lastChild &&
            prevNode.lastChild.lastChild &&
            needsToBorrowPrevEndTagClosingMarker(node) &&
            needsToBorrowParentEndTagOpeningMarker(prevNode.lastChild) &&
            needsToBorrowParentEndTagOpeningMarker(prevNode.lastChild.lastChild)
        )
    ){
        return hardline
    }

    return node.hasLeadingSpace ? line : softline
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

function printEndTagSuffix(node: TemplateNode) {
    if (needsToBorrowParentEndTagOpeningMarker(node)) {
        return `</${node.parent!.tag}`
    }
    if (needsToBorrowNextStartTagOpeningMarker(node)) {
        return `<${node.next!.tag}`
    }
    return ""
}

function printStartTagPrefix(node: TemplateNode) {
    if (needsToBorrowPrevEndTagClosingMarker(node)) {
        return printEndTagClosingMarker(node.prev!)
    }
    if (needsToBorrowParentStartTagClosingMarker(node)) {
        return ">"
    }
    return ""
}

function printEndTagClosingMarker(node: TemplateNode) {
    return node.isSelfClosing ? "/>" : ">"
}

function printEndTagPrefix(node: TemplateNode) {
    if (!needsToBorrowLastChildEndTagClosingMarker(node)) {
        return ""
    }
    return printEndTagClosingMarker(lastElem(node.children)!)
}

async function printStartTag(
    node: TemplateNode,
    options: ParserOptions,
    textToDoc: EmbedTextToDocFunc
) {
    return [
        await printStartTagOpening(node, options, textToDoc),
        await printAttribute(node, options, textToDoc),
        node.isSelfClosing ? "" : printStartTagClosing(node)
    ]
}

function getPreferedTag(node: TemplateNode, options: ParserOptions) {
    if (!node.componentTag) {
        return node.tag
    }
    return options.componentTagFormatPreference === "kebab"
        ? qingkuaiUtils.camel2Kebab(node.tag, false)
        : qingkuaiUtils.kebab2Camel(node.componentTag)
}

function printEndTag(node: TemplateNode, options: ParserOptions): Doc[] {
    // prettier-ignore
    return [
        node.isSelfClosing ? "" : printEndTagOpening(node, options),
        printEndTagClosing(node)
    ]
}

function printEndTagOpening(node: TemplateNode, options: ParserOptions) {
    if (needsToBorrowParentEndTagOpeningMarker(lastElem(node.children))) {
        return ""
    }
    return [printEndTagPrefix(node), `</${getPreferedTag(node, options)}`]
}

function printEndTagClosing(node: TemplateNode) {
    if (
        (node.next && needsToBorrowPrevEndTagClosingMarker(node.next)) ||
        (!node.next && needsToBorrowLastChildEndTagClosingMarker(node.parent))
    ) {
        return ""
    }
    return [printEndTagClosingMarker(node), printEndTagSuffix(node)]
}

async function printStartTagOpening(
    node: TemplateNode,
    options: ParserOptions,
    textToDoc: EmbedTextToDocFunc
) {
    if (!node.prev || !needsToBorrowNextStartTagOpeningMarker(node.prev)) {
        return [
            printStartTagPrefix(node),
            `<${getPreferedTag(node, options)}`,
            await printComponentGenerics(node, options, textToDoc)
        ]
    }
    return ""
}

function printStartTagClosing(node: TemplateNode) {
    return needsToBorrowParentStartTagClosingMarker(node.children[0]) ? "" : ">"
}

function getExpressionFormatOptions(options: Options) {
    return {
        ...options,
        parser: usingTypescript ? "qingkuai-ts-expression" : "qingkuai-js-expression"
    }
}

function needsToBorrowNextStartTagOpeningMarker(node: TemplateNode | undefined | null) {
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

function needsToBorrowParentStartTagClosingMarker(node: TemplateNode | undefined | null) {
    return !!(
        node &&
        !node.prev &&
        !node.hasLeadingSpace &&
        !isNodeInTopScope(node) &&
        node.leadingSpaceSensitive
    )
}

function needsToBorrowParentEndTagOpeningMarker(node: TemplateNode | undefined | null) {
    return !!(
        node &&
        !node.next &&
        !node.hasTrailingSpace &&
        !isNodeInTopScope(node) &&
        node.trailingSpaceSensitive &&
        isTextOrCommentNode(getLastDescendant(node))
    )
}

function needsToBorrowLastChildEndTagClosingMarker(node: TemplateNode | undefined | null) {
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

function needsToBorrowPrevEndTagClosingMarker(node: TemplateNode | undefined | null) {
    if (!node || isTextOrCommentNode(node.prev)) {
        return false
    }
    return !!(node.prev && node.leadingSpaceSensitive && !node.hasLeadingSpace)
}
