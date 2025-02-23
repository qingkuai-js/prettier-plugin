import type { ParserOptions } from "prettier"

import { resolve } from "path"
import * as prettier from "prettier"
import { formatSourceCode } from "./util"
import { describe, it, expect, test } from "vitest"

const outPath = resolve(import.meta.dirname, "../dist/index.js")

async function format(source: string, options: Partial<ParserOptions> = {}) {
    return await prettier.format(source, {
        tabWidth: 4,
        printWidth: 100,
        parser: "qingkuai",
        plugins: [outPath],
        ...options
    })
}

test("top level nodes", async () => {
    expect(await format("...<a>...</a>")).toBe("...<a>...</a>")
    expect(await format("<b> ...  </b>  ...")).toBe("<b> ... </b> ...")
    expect(await format(" ... <u>  ...  </u>")).toBe("... <u> ... </u>")

    expect(await format("...<div>...</div>")).toBe(
        formatSourceCode(`
            ...
            <div>...</div>
        `)
    )
})

test("borrowing of tag marker", async () => {
    // needs to borrow parent opening tag end marker
    // needs to borrow closing tag end marker of last child element
    expect(await format("<a>...<div></div></a>")).toBe(
        formatSourceCode(`
            <a
                >...
                <div></div
            ></a>
        `)
    )
    expect(await format("<u><b>...<div></div></b></u>")).toBe(
        formatSourceCode(`
            <u
                ><b
                    >...
                    <div></div></b
            ></u>
        `)
    )

    // needs to borrow parent closing tag start marker
    expect(
        await format(
            formatSourceCode(`
                <a>
                    <div></div>...</a>
            `)
        )
    ).toBe(
        formatSourceCode(`
        <a>
            <div></div>
            ...</a
        >
    `)
    )

    // needs to borrow opening tag start marker of next element
    expect(await format("...<a><div><span></span></div></a>")).toBe(
        formatSourceCode(`
            ...<a
                ><div><span></span></div
            ></a>
        `)
    )

    // needs to borrow closing tag end marker of previous element
    expect(await format("<i><p><span></span></p></i>...")).toBe(
        formatSourceCode(`
            <i
                ><p><span></span></p></i
            >...
        `)
    )
})

test("the order and line break of embed langauge block node", async () => {
    expect(
        await format(`
            <!-- a comment -->
            <lang-css>.container{display:block;}</lang-css>
            <div> <span> <a> ... </a> </span> </div>
            <lang-js> function test(){ console.log("AAA"); return 10; }</lang-js>
        `)
    ).toBe(
        formatSourceCode(`
            <lang-js>
                function test() {
                    console.log("AAA");
                    return 10;
                }
            </lang-js>

            <!-- a comment -->
            <div>
                <span> <a> ... </a> </span>
            </div>

            <lang-css>
                .container {
                    display: block;
                }
            </lang-css>
        `)
    )

    expect(await format("<lang-css></lang-css><lang-js></lang-js>")).toBe(
        formatSourceCode(`
            <lang-js></lang-js>

            <lang-css></lang-css>
        `)
    )
})

test("the attribute line wrap", async () => {
    expect(await format(`<div id="..." class="..."></div>`)).toBe(
        formatSourceCode(`
            <div id="..." class="..."></div>
        `)
    )

    expect(
        await format(`<div id="..." class="..."></div>`, {
            singleAttributePerLine: true
        })
    ).toBe(
        formatSourceCode(`
            <div
                id="..."
                class="..."
            ></div>
        `)
    )

    expect(
        await format(
            formatSourceCode(`
                <div>
                    <p class=" xxx" data-custom="">...
                </p></div>
            `),
            {
                singleAttributePerLine: true
            }
        )
    ).toBe(
        formatSourceCode(`
            <div>
                <p
                    class=" xxx"
                    data-custom=""
                >
                    ...
                </p>
            </div>
        `)
    )

    expect(
        await format(
            formatSourceCode(`
                <p id="xxx" class="box">
                <span custom-data="..........">...</span></p>
            `),
            {
                printWidth: 23
            }
        )
    ).toBe(
        formatSourceCode(`
            <p
                id="xxx"
                class="box"
            >
                <span
                    custom-data=".........."
                    >...</span
                >
            </p>
        `)
    )
})

test("the attribute line wrap with setting bracketSameLine option", async () => {
    expect(
        await format(`<div id="..." class="...">...</div>`, {
            bracketSameLine: true,
            singleAttributePerLine: true
        })
    ).toBe(
        formatSourceCode(`
            <div
                id="..."
                class="...">
                ...
            </div>
        `)
    )

    expect(
        await format(
            formatSourceCode(`
                <div>
                    <p class=" xxx" data-custom="">...
                </p></div>
            `),
            {
                bracketSameLine: true,
                singleAttributePerLine: true
            }
        )
    ).toBe(
        formatSourceCode(`
            <div>
                <p
                    class=" xxx"
                    data-custom="">
                    ...
                </p>
            </div>
        `)
    )
})

test("interpolation in attribute(dynamic attribute, directive, event)", async () => {
    expect(await format("<p #for={ (item, index) of 3 }></p>")).toBe(
        "<p #for={item, index of 3}></p>"
    )

    expect(await format("<div !class={arr   .slice(  a)}></div>")).toBe(
        "<div !class={arr.slice(a)}></div>"
    )

    expect(await format("<div #for={  item, index of arr. length>10?3:arr.length}></div>")).toBe(
        "<div #for={item, index of arr.length > 10 ? 3 : arr.length}></div>"
    )

    expect(await format(`<div @click={()=>{console.log("AAA"); return 10}}></div>`)).toBe(
        formatSourceCode(`
            <div
                @click={
                    () => {
                        console.log('AAA');
                        return 10;
                    }
                }
            ></div>
        `)
    )

    expect(
        await format(`<span !class={arr} @click={handleClick}> {content} </span>`, {
            singleAttributePerLine: true,
            spaceAroundInterpolation: true
        })
    ).toBe(
        formatSourceCode(`
            <span
                !class={ arr }
                @click={ handleClick }
            >
                { content }
            </span>
        `)
    )
})

it("shoule insert whitespace before self-closing tag closing tag end marker", async () => {
    expect(await format("<br>")).toBe("<br />")
    expect(await format("<br/>")).toBe("<br />")

    expect(
        await format(`<img class="..." src="https://example.com">`, {
            singleAttributePerLine: true
        })
    ).toBe(
        formatSourceCode(`
            <img
                class="..."
                src="https://example.com"
            />
        `)
    )
})
