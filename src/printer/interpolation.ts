import type { PrintFunc } from "../types"
import type { AstPath, ParserOptions } from "prettier"

import estree from "prettier/plugins/estree"

import { doc } from "prettier"
import { PATTERN_KEYWORD_DIRECTIVE } from "../constants"

const { join, line } = doc.builders

export const estreePrinter = (estree as any).printers.estree

export function printJsInterpolation(path: AstPath, options: ParserOptions, print: PrintFunc) {
    const node = path.getNode()

    if ((options as any)[PATTERN_KEYWORD_DIRECTIVE] && node.type === "ArrayExpression") {
        return join([",", line], path.map(print, "elements"))
    }

    return estreePrinter.print(path, options, print)
}
