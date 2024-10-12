import * as rollup from "rollup"
import dts from "rollup-plugin-dts"
import esbuild from "rollup-plugin-esbuild"

export default rollup.defineConfig(commentLineArgs => {
    const isWatchMode = commentLineArgs.watch

    const ret = [
        {
            external: ["prettier"],
            input: {
                "index": "./src/index.ts",
            },
            output: {
                dir: "dist",
                format: "es",
                chunkFileNames: "chunks/[name].js"
            },
            plugins: [
                esbuild({
                    target: "esNext"
                })
            ]
        }
    ]

    if (!isWatchMode) {
        ret.push({
            input: {
                "index": "./dist/types/index.d.ts",
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
