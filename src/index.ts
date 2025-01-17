import fs from 'node:fs'
import path from 'node:path'
import { compile, Element } from 'stylis'

export interface ParsedInput {
  className: string
  tag: string
  data: Record<string, string[] | boolean>
}

const enumDataAttributeRegex =
  /\[data-(?<attribute>[a-z-]+)='(?<value>[^']*)'\]/g
const booleanDataAttributeRegex = /\[data-(?<attribute>[a-z-]+)(?=\])/g

function visit(nodes: Element[], arr: { type: string; props: string[] }[]) {
  for (const node of nodes) {
    if (['@scope', 'rule'].includes(node.type) && Array.isArray(node.props)) {
      arr.push({ type: node.type, props: node.props })
    }

    if (Array.isArray(node.children)) {
      visit(node.children, arr)
    }
  }
}

export function parseInput(input: string): ParsedInput {
  const result: ParsedInput = { className: '', tag: '', data: {} }

  const arr: { type: string; props: string[] }[] = []
  visit(compile(input), arr)

  arr.forEach((node) => {
    if (node.type === '@scope') {
      const prop = node.props[0]
      if (prop === undefined) {
        return
      }
      result.className = prop.replace('(.', '').replace(')', '')
      return
    }

    if (node.type === 'rule') {
      const prop = node.props[0]
      if (prop === undefined) {
        return
      }

      // Parse tag
      if (prop.endsWith(':scope')) {
        result.tag = prop.replace(':scope', '')
      }

      // Parse enum data attributes
      for (const match of prop.matchAll(enumDataAttributeRegex)) {
        const attribute = match.groups?.['attribute']
        const value = match.groups?.['value'] ?? ''

        if (attribute === undefined) {
          continue
        }

        result.data[attribute] ||= []

        const attr = result.data[attribute]
        if (Array.isArray(attr) && !attr.includes(value)) {
          attr.push(value)
        }
      }

      // Parse boolean data attributes
      for (const match of prop.matchAll(booleanDataAttributeRegex)) {
        const attribute = match.groups?.['attribute']
        if (attribute === undefined) {
          continue
        }

        result.data[attribute] ||= true
      }
    }
  })

  return result
}

function renderProps(parsedInput: ParsedInput): string {
  return Object.keys(parsedInput.data)
    .map((attribute) => {
      const values = parsedInput.data[attribute]
      if (Array.isArray(values)) {
        return `${attribute}?: ${values
          .map((value) => `'${value}'`)
          .join(' | ')}`
      }

      return `  ${attribute}?: boolean`
    })
    .join('\n')
}

export function render(name: string, parsedInput: ParsedInput): string {
  return `// Generated by MistCSS, do not modify
import './${name}.mist.css'

type Props = {
  children?: React.ReactNode
  ${renderProps(parsedInput)}
} & JSX.IntrinsicElements['${parsedInput.tag}']

export function ${name}({ children, ${Object.keys(parsedInput.data).join(
    ', ',
  )}, ...props }: Props) {
  return (
    <${parsedInput.tag} {...props} className="${parsedInput.className}" ${Object.keys(
      parsedInput.data,
    )
      .map((key) => `data-${key}={${key}}`)
      .join(' ')}>
      {children}
    </${parsedInput.tag}>
  )
}
`
}

export function createFile(filename: string) {
  let data = fs.readFileSync(filename, 'utf8')
  const parsedInput = parseInput(data)

  const name = path.basename(filename, '.mist.css')
  data = render(name, parsedInput)

  fs.writeFileSync(`${filename}.tsx`, data)
}
