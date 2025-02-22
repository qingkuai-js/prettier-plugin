import type { SupportLanguage, Parser, Printer } from "prettier"

import { embed } from "./printer"
import { locEnd, locStart, parse } from "./parser"

export const languages: Partial<SupportLanguage>[] = [
    {
        name: "qingkuai",
        parsers: ["qingkuai"],
        extensions: [".qk"]
    }
]

export const parsers: Record<string, Parser> = {
    qingkuai: {
        parse,
        locEnd,
        locStart,
        astFormat: "qingkuai-ast"
    }
}

export const printers: Record<string, Printer> = {
    "qingkuai-ast": {
        embed,
        print: () => "",
        getVisitorKeys: () => ["children"]
    }
}
