import * as prettier from "prettier"

const sourceCode = `
    const a =    10;
    const b    = 20;
    console.log ( a + b,)
`
const options: prettier.Options = {
    parser: "babel",
    semi: false,
    tabWidth: 4,
    printWidth: 100,
    arrowParens: "avoid",
    trailingComma: "none"
}

const result = await prettier.format(sourceCode, options)
console.log(`The formatted code is as below:`)
console.log("=".repeat(100), "\n")
console.log(result)
