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
    },
    componentTagFormatPreference: {
        type: "choice",
        default: "camel",
        category: "format",
        choices: [
            {
                value: "camel",
                description: "prefer camel tag format, likes: <MyComponent></MyComponent>"
            },
            {
                value: "kebab",
                description: "prefer kebab tag format, likes: <my-component></my-component>"
            }
        ],
        description: "your prefered fomat of component tag in the qingkuai template"
    },
    componentAttributeFormatPreference: {
        type: "choice",
        default: "camel",
        category: "format",
        choices: [
            {
                value: "camel",
                description:
                    "prefer camel attribute format, likes: <MyComponent MyCustomAttribute></MyComponent>"
            },
            {
                value: "kebab",
                description:
                    "prefer kebab attribute format, likes: <my-component my-custom-attribute></my-component>"
            }
        ],
        description: "your prefered fomat of component attribute in the qingkuai template"
    }
}
