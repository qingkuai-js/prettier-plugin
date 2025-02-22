import * as prettier from "prettier"

const source = `
    <lang-css>.div{display:inline; margin: 0px 4px;}</lang-css>
    <lang-js>function test(){console.log("AAA"); return 10}</lang-js>
    <div> console {()=>{console.log("AAA"); return 10;}}... <span> log </span> </div>
`

// <a href="" class=""><pre></pre></a>
// <a><div></div>... </a>
// <a>...<div></div></a>
// <a>...<div></div>... </a> ...<div></div>
// <script !class={a+b>10?arr.slice(a+b):arr} id="my-script">const a = 10</script>
// <script !class={()=>{console.log("AAA"); return 10;}} id="my-script">const a = 10</script>

console.log(
    await prettier.format(source, {
        semi: false,
        tabWidth: 4,
        printWidth: 40,
        singleAttributePerLine: true,
        // parser: "htmll",
        // plugins:["/Users/lianggaoqiang/Desktop/study/prettier/src/language-html/index.js"]
        parser: "qingkuai",
        plugins: ["/Users/lianggaoqiang/Desktop/QingKuai/prettier-plugin/dist/index.js"]
    })
)
