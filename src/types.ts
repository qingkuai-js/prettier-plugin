import type { AstPath, Doc, Options, Printer } from "prettier"
import type { TemplateNode as QingKuaiTemplateNode } from "qingkuai/compiler"

export type PrintFunc = (path: AstPath) => Doc

export type TemplateNode = {
    children: TemplateNode[]
    parent: TemplateNode | null
    display: string
    hasLeadingSpace: boolean
    hasTrailingSpace: boolean
    leadingSpaceSensitive: boolean
    trailingSpaceSensitive: boolean
    prev: TemplateNode | undefined
    next: TemplateNode | undefined
    oriPrev: TemplateNode | undefined
    oriNext: TemplateNode | undefined
    lastChild: TemplateNode | undefined
} & Omit<QingKuaiTemplateNode, "children" | "parent" | "prev" | "next">

export type EmbedReturnValue = ReturnType<Printer["embed"] & Function>
export type EmbedTextToDocFunc = (text: string, options: Options) => Promise<Doc>

export type FixedArray<T, L extends number, R extends T[] = []> = R["length"] extends L
    ? R
    : FixedArray<T, L, [...R, T]>
