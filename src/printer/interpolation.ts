import type { PrintFunc } from "../types"
import type { AstPath, ParserOptions } from "prettier"

import { doc } from "prettier"
import estree from "prettier/plugins/estree"

const { join, line } = doc.builders

export const estreePrinter = (estree as any).printers.estree

export function printJsInterpolation(path: AstPath, options: ParserOptions, print: PrintFunc) {
    const node = path.getNode()

    if (options.__isQingkuaiForDirective && node.type === "JsExpressionRoot") {
        const expressionNode = node.node
        if (expressionNode.type === "SequenceExpression") {
            return join([",", line], path.map(print, "node", "expressions"))
        }

        if (
            expressionNode.type === "BinaryExpression" &&
            expressionNode.operator === "in" &&
            expressionNode.left.type === "SequenceExpression"
        ) {
            return [
                join([",", line], path.map(print, "node", "left", "expressions")),
                " in ",
                path.call(print, "node", "right")
            ]
        }
    }

    return estreePrinter.print(path, options, print)
}
