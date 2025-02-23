import type { SupportLanguage, Parser, Printer, SupportOption } from "prettier"

import babel from "prettier/plugins/babel"
import { embed } from "./printer/sourcefile"
import { locEnd, locStart, parse } from "./parser"
import { estreePrinter, printJsInterpolation } from "./printer/interpolation"

export const languages: Partial<SupportLanguage>[] = [
    {
        name: "qingkuai",
        parsers: ["qingkuai"],
        extensions: [".qk"]
    },
    {
        name: "qingkuai-js-expression",
        parsers: ["__js_expression"]
    },
    {
        name: "qingkuai-ts-expression",
        parsers: ["__ts_expression"]
    }
]

export const parsers: Record<string, Parser> = {
    qingkuai: {
        parse,
        locEnd,
        locStart,
        astFormat: "qingkuai-ast"
    },
    "qingkuai-js-expression": {
        ...babel.parsers.__js_expression,
        astFormat: "qingkuai-interpolation-ast"
    },
    "qingkuai-ts-expression": {
        ...babel.parsers.__ts_expression,
        astFormat: "qingkuai-interpolation-ast"
    }
}

export const printers: Record<string, Printer> = {
    "qingkuai-ast": {
        embed,
        print: () => "",
        getVisitorKeys: () => ["children"]
    },
    "qingkuai-interpolation-ast": {
        ...estreePrinter,
        print: printJsInterpolation
    }
}

export const options: Record<string, SupportOption> = {
    spaceAroundInterpolation: {
        type: "boolean",
        default: false,
        category: "format",
        description: "insert spaces at both ends of interpolation block"
    }
}
