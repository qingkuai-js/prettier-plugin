import type { ParserOptions } from "prettier"

import { resolve } from "path"
import * as prettier from "prettier"
import { it, expect, test } from "vitest"

const outPath = resolve(import.meta.dirname, "../dist/index.js")

async function format(source: string, options: Partial<ParserOptions> = {}) {
    const ret = await prettier.format(source, {
        tabWidth: 4,
        printWidth: 100,
        parser: "qingkuai",
        plugins: [outPath],
        ...options
    })
    return ret.slice(0, -1)
}

// 由于使用模板字符串(反引号)书写源码时会保留所有空格，这导致在想要书写带有缩进的代码字符串时，
// 字符串内的索引会收到源码文件中缩进层级的影响，或者只能在模板内使用正确的缩进等级，但如果此等级
// 与源码文件中当前位置等级不一致时会导致阅读体验不好
//
// 此方法接受代码文本，并移除第一行的所有前导空格字符，后续其他行会移除与第一行等量的前导空格字符
// 注意：此方法识别代码使用缩进量量的方法为首行空格字符数量（只有一个换行符的行不会被认为是首行）
function formatSourceCode(code: string) {
    code = code.replace(/^\r?\n*|\r?\n*$/g, "").trimEnd()
    return code.replace(
        new RegExp(`(?:^|\\r?\\n) {${/ *(?=[^ ])/.exec(code)![0].length}}`, "g"),
        matched => {
            return matched.startsWith("\n") ? "\n" : ""
        }
    )
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
            <!-- a comment -->
            <lang-js>
                function test() {
                    console.log("AAA");
                    return 10;
                }
            </lang-js>

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

test("the format result of preserve tags", async () => {
    expect(
        await format(
            formatSourceCode(`
                <pre>
                    <div></div></pre>
            `)
        )
    ).toBe(
        formatSourceCode(`
        <pre>
            <div></div></pre>    
    `)
    )

    expect(
        await format(
            formatSourceCode(`
                <textarea
                    value='xxx'
                    >
                    <div></div></textarea>
            `)
        )
    ).toBe(
        formatSourceCode(`
        <textarea value="xxx">
            <div></div></textarea>    
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
    expect(await format("<p #for={ xxx }></p>")).toBe("<p #for={xxx}></p>")

    expect(
        await format("<span !value='a' @click=''></span>", {
            spaceAroundInterpolation: true
        })
    ).toBe("<span !value={ a } @click={}></span>")

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
                        console.log("AAA");
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

test("prefered component tag format", async () => {
    expect(await format("<my-component></my-component>")).toBe("<MyComponent></MyComponent>")

    expect(
        await format("<my-component></my-component>", {
            componentTagFormatPreference: "kebab"
        })
    ).toBe("<my-component></my-component>")

    // just first character is lower case, dont format
    expect(
        await format("<Test></Test>", {
            componentTagFormatPreference: "kebab"
        })
    ).toBe("<Test></Test>")
})

test("prefered component attribute format", async () => {
    expect(await format("<Test my-custom-attribute/>")).toBe("<Test myCustomAttribute />")

    expect(await format("<div my-custom-attribute></div>")).toBe("<div my-custom-attribute></div>")

    expect(
        await format("<Test my-custom-attribute/>", {
            componentAttributeFormatPreference: "camel"
        })
    ).toBe("<Test myCustomAttribute />")

    expect(
        await format("<Test myCustomAttribute/>", {
            componentAttributeFormatPreference: "kebab"
        })
    ).toBe("<Test my-custom-attribute />")
})
