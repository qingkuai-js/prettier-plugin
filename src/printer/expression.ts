import type { PrintFunc } from "../types"
import type { AstPath, ParserOptions } from "prettier"

import estree from "prettier/plugins/estree"

import { doc } from "prettier"
import { isUndefined } from "../util"
import { COMPONENT_GENERIC, PATTERN_KEYWORD_DIRECTIVE } from "../constants"

const { join, line } = doc.builders

export const estreePrinter = (estree as any).printers.estree

export function printJsInterpolation(path: AstPath, options: ParserOptions, print: PrintFunc) {
    const node = path.getNode()
    const optionsAny = options as any

    if (optionsAny[COMPONENT_GENERIC] && node.type === "TSAsExpression") {
        const hasTypeArguments = !isUndefined(node.typeAnnotation.typeArguments)
        const typeArgsPropName = hasTypeArguments ? "typeArguments" : "typeParameters"
        return join([",", line], path.map(print, "typeAnnotation", typeArgsPropName, "params"))
    }

    if (optionsAny[PATTERN_KEYWORD_DIRECTIVE] && node.type === "ArrayExpression") {
        return join([",", line], path.map(print, "elements"))
    }

    return estreePrinter.print(path, options, print)
}
