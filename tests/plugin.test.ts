import type { ParserOptions } from "prettier"

import * as prettier from "prettier"

import { resolve } from "path"
import { it, expect, test } from "vitest"
import { util as qingkuaiUtils } from "qingkuai/compiler"

const outPath = resolve(import.meta.dirname, "../dist/index.js")

async function format(source: string, options: Partial<ParserOptions> = {}) {
    const ret = await prettier.format(source, {
        tabWidth: 4,
        printWidth: 100,
        parser: "qingkuai",
        plugins: [outPath],
        ...options
    })
    return ret
}

function formatSourceCode(source: string) {
    return qingkuaiUtils.formatSourceCode(source) + "\n"
}

test("Top level nodes", async () => {
    expect(await format("...<a>...</a>")).toBe("...<a>...</a>\n")
    expect(await format("<b> ...  </b>  ...")).toBe("<b> ... </b> ...\n")
    expect(await format(" ... <u>  ...  </u>")).toBe("... <u> ... </u>\n")

    expect(await format("...<div>...</div>")).toBe(
        formatSourceCode(`
            ...
            <div>...</div>
        `)
    )
})

test("Borrowing of tag marker", async () => {
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

test("The order and line break of embed langauge block node", async () => {
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

    expect(await format("<div></div><lang-js></lang-js><lang-css></lang-css>")).toBe(
        formatSourceCode(`
            <lang-js></lang-js>

            <div></div>

            <lang-css></lang-css>
        `)
    )
})

test("The attribute line wrap", async () => {
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

test("The format result of preserve tags", async () => {
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

test("The attribute line wrap with setting bracketSameLine option", async () => {
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

test("Interpolation in attribute(dynamic attribute, directive, event)", async () => {
    expect(await format("<p #for={ xxx }></p>")).toBe("<p #for={xxx}></p>\n")

    expect(
        await format("<span !value='a' @click=''></span>", {
            spaceAroundInterpolation: true
        })
    ).toBe("<span !value={ a } @click={}></span>\n")

    expect(await format("<div !class={arr   .slice(  a)}></div>")).toBe(
        "<div !class={arr.slice(a)}></div>\n"
    )

    expect(await format("<div #for={  item, index of arr. length>10?3:arr.length}></div>")).toBe(
        "<div #for={item, index of arr.length > 10 ? 3 : arr.length}></div>\n"
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

it("Should insert whitespace before self-closing tag closing tag end marker", async () => {
    expect(await format("<br>")).toBe("<br />\n")
    expect(await format("<br/>")).toBe("<br />\n")

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

test("Prefered component tag format", async () => {
    expect(await format("<my-component></my-component>")).toBe("<MyComponent></MyComponent>\n")

    expect(
        await format("<my-component></my-component>", {
            componentTagFormatPreference: "kebab"
        })
    ).toBe("<my-component></my-component>\n")

    // just first character is lower case, dont format
    expect(
        await format("<Test></Test>", {
            componentTagFormatPreference: "kebab"
        })
    ).toBe("<Test></Test>\n")
})

test("Component tag generic argument format", async () => {
    expect(
        await format(
            formatSourceCode(`
                <lang-ts></lang-ts>
                <Comp<T,U>></Comp>
            `)
        )
    ).toBe(
        formatSourceCode(`
            <lang-ts></lang-ts>

            <Comp<T, U>></Comp>
        `)
    )

    expect(
        await format(
            formatSourceCode(`
                <lang-ts></lang-ts>
                <my-component<string>></my-component>
            `)
        )
    ).toBe(
        formatSourceCode(`
            <lang-ts></lang-ts>

            <MyComponent<string>></MyComponent>
        `)
    )

    expect(
        await format(
            formatSourceCode(`
                <lang-ts></lang-ts>
                <my-component<T,U>></my-component>
            `),
            {
                componentTagFormatPreference: "kebab"
            }
        )
    ).toBe(
        formatSourceCode(`
            <lang-ts></lang-ts>

            <my-component<T, U>></my-component>
        `)
    )

    expect(
        await format(
            formatSourceCode(`
                <lang-ts></lang-ts>
                <Comp<{a:number,b:string[]}> x="1"></Comp>
            `),
            {
                printWidth: 30
            }
        )
    ).toBe(
        formatSourceCode(`
            <lang-ts></lang-ts>

            <Comp<
                    {
                        a: number;
                        b: string[];
                    }
                >
                x="1"
            ></Comp>
        `)
    )

    expect(
        await format(
            formatSourceCode(`
                <lang-ts></lang-ts>
                <Comp<{
                a: string; b: number}> />
            `)
        )
    ).toBe(
        formatSourceCode(`
            <lang-ts></lang-ts>

            <Comp<
                    {
                        a: string;
                        b: number;
                    }
                >
            />
        `)
    )
})

test("Prefered component attribute format", async () => {
    expect(await format("<Test my-custom-attribute/>")).toBe("<Test myCustomAttribute />\n")

    expect(await format("<div my-custom-attribute></div>")).toBe(
        "<div my-custom-attribute></div>\n"
    )

    expect(
        await format("<Test my-custom-attribute/>", {
            componentAttributeFormatPreference: "camel"
        })
    ).toBe("<Test myCustomAttribute />\n")

    expect(
        await format("<Test myCustomAttribute/>", {
            componentAttributeFormatPreference: "kebab"
        })
    ).toBe("<Test my-custom-attribute />\n")
})

test("Context pattern for directive value ends with comma", async () => {
    expect(await format(`<input #for={item, of 3}   >`)).toBe("<input #for={item of 3} />\n")

    expect(await format(`<input #for={item, index,  of 3}   >`)).toBe(
        "<input #for={item, index of 3} />\n"
    )
    expect(await format(`<input #slot={context from  ""}   >`)).toBe(
        `<input #slot={context from ""} />\n`
    )
})

test("The embedded style tags that has `src` attribute and has no content should be formatted as self-closing tags", async () => {
    expect(await format(`<lang-css src="./test"></lang-css>`)).toBe(`<lang-css src="./test" />\n`)
    expect(await format(`<lang-scss src="./test">\n\n  \n</lang-scss>`)).toBe(
        `<lang-scss src="./test" />\n`
    )
})
