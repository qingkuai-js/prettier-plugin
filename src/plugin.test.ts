import type { ParserOptions } from "prettier"

import { resolve } from "path"
import * as prettier from "prettier"
import { formatSourceCode } from "./util"
import { describe, it, expect, test } from "vitest"

const outPath = resolve(import.meta.dirname, "../dist/index.js")

async function format(source: string, options: Partial<ParserOptions> = {}) {
    return await prettier.format(source, {
        ...options,
        tabWidth: 4,
        printWidth: 100,
        parser: "qingkuai",
        plugins: ["/Users/lianggaoqiang/Desktop/QingKuai/prettier-plugin/dist/index.js"]
    })
}

describe("text node", () => {
    test("whether a newline is not inserted between text node and inline element in the top level", async () => {
        expect(await format("...<a>...</a>")).toBe("...<a>...</a>")
        expect(await format("<b> ...  </b>  ...")).toBe("<b> ... </b> ...")
        expect(await format(" ... <u>  ...  </u>")).toBe("... <u> ... </u>")
    })

    test("whether a newline is inserted between text node and block element in the top level", async () => {
        const source = "...<div>...</div>"
        const expected = formatSourceCode(`
            ...
            <div>...</div>
        `)
        expect(await format(source)).toBe(expected)
    })
})
