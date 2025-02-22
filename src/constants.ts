export const TABLE_TAGS_DISPLAY = [
    {
        tag: "table",
        display: "table"
    },
    {
        tag: "tr",
        display: "table-row"
    },
    {
        tag: "td",
        display: "table-cell"
    },
    {
        tag: "th",
        display: "table-cell"
    },
    {
        tag: "caption",
        display: "table-caption"
    },
    {
        tag: "col",
        display: "table-column"
    },
    {
        tag: "colgroup",
        display: "table-column-group"
    },
    {
        tag: "tbody",
        display: "table-row-group"
    },
    {
        tag: "thead",
        display: "table-header-group"
    },
    {
        tag: "tfoot",
        display: "table-footer-group"
    }
]

export const INLINE_TAGS = new Set<string | undefined | null>([
    "a",
    "span",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "mark",
    "small",
    "abbr",
    "cite",
    "code",
    "kbd",
    "var",
    "samp",
    "time",
    "sub",
    "sup",
    "q",
    "bdo",
    "bdi",
    "br",
    "wbr",
    "img",
    "input",
    "button",
    "label",
    "select",
    "textarea",
    "output"
])

export const INLINE_BLOCK_TAGS = new Set<string | undefined | null>([
    "input",
    "select",
    "textarea",
    "button",
    "label",
    "option",
    "optgroup",
    "meter",
    "progress",
    "object",
    "video",
    "audio"
])

export const PRESERVE_TAGS = new Set(["!", "pre", "textarea"])

export const HARDLINE_TAGS = new Set(["script", "select", "!"])
