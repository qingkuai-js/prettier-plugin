# prettier-plugin-qingkuai

[![CI](https://github.com/qingkuai-js/prettier-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/qingkuai-js/prettier-plugin/actions/workflows/ci.yml)

A [Prettier](https://prettier.io/) plugin for formatting [QingKuai](https://github.com/qingkuai-js) (`.qk`) template files.

## Features

- Formats QingKuai (`.qk`) template markup with consistent indentation and line breaks.
- Handles inline and block element wrapping rules based on CSS display semantics.
- Re-indents and formats embedded JS/TS expressions inside interpolation blocks.
- Keeps `<script>` and `<style>` block contents untouched.
- Supports Prettier's `<!-- prettier-ignore -->` comments.

## Install

```bash
npm install --save-dev prettier prettier-plugin-qingkuai
```

Or with pnpm:

```bash
pnpm add -D prettier prettier-plugin-qingkuai
```

## Usage

Add the plugin to your Prettier configuration:

```json
{
    "plugins": ["prettier-plugin-qingkuai"]
}
```

Then run Prettier as usual:

```bash
npx prettier --write "**/*.qk"
```

## Options

| Option                               | Type                 | Default   | Description                                                                                         |
| ------------------------------------ | -------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `spaceAroundInterpolation`           | `boolean`            | `false`   | Insert spaces at both ends of interpolation blocks.                                                 |
| `componentTagFormatPreference`       | `"camel" \| "kebab"` | `"camel"` | Preferred component tag format: `<MyComponent>` (camel) or `<my-component>` (kebab).                |
| `componentAttributeFormatPreference` | `"camel" \| "kebab"` | `"camel"` | Preferred component attribute format: `MyCustomAttribute` (camel) or `my-custom-attribute` (kebab). |

## Development

```bash
# Build the plugin
pnpm build

# Run tests
pnpm test
```

## License

MIT
