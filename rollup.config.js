import * as rollup from "rollup"
import dts from "rollup-plugin-dts"
import esbuild from "rollup-plugin-esbuild"

export default rollup.defineConfig(() => {
    const needBuildTypes = process.env.BUILD_TYPES === "1"

    const ret = [
        {
            external: [
                "prettier",
                "qingkuai/compiler",
                "@babel/code-frame",
                "lines-and-columns",
                "prettier/plugins/babel",
                "prettier/plugins/estree"
            ],
            input: { index: "./src/index.ts" },
            output: {
                dir: "dist",
                format: "es",
                sourcemap: true,
                chunkFileNames: "chunks/[name].js"
            },
            plugins: [esbuild()]
        }
    ]

    if (needBuildTypes) {
        ret.push({
            input: {
                index: "./dist/types/src/index.d.ts"
            },
            output: {
                dir: "dist",
                format: "es",
                chunkFileNames: "chunks/type.d.ts"
            },
            plugins: [dts()]
        })
    }

    return ret
})
