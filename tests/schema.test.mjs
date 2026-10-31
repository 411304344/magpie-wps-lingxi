// 工具 schema 压平的单测：上游只吃朴素 JSON Schema，组合关键字会让整条请求挂掉。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { _internal } from '../index.mjs'

const { sanitizeSchema, filterTools } = _internal

test('anyOf 取第一个非 null 分支', () => {
  assert.deepEqual(
    sanitizeSchema({ anyOf: [{ type: 'string' }, { type: 'null' }] }),
    { type: 'string' },
  )
})

test('oneOf 只保留第一支', () => {
  assert.deepEqual(
    sanitizeSchema({ oneOf: [{ type: 'string', description: 'a' }, { type: 'number' }] }),
    { type: 'string', description: 'a' },
  )
})

test('节点自身的键胜过分支', () => {
  assert.deepEqual(
    sanitizeSchema({ anyOf: [{ type: 'string', description: 'branch' }], description: 'own' }),
    { type: 'string', description: 'own' },
  )
})

test('allOf 合并', () => {
  assert.deepEqual(
    sanitizeSchema({ allOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { required: ['a'] }] }),
    { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
  )
})

test('type 数组压成单值', () => {
  assert.deepEqual(sanitizeSchema({ type: ['string', 'null'] }), { type: 'string' })
  assert.deepEqual(sanitizeSchema({ type: ['null'] }), { type: 'string' })
})

test('const 变 enum，not/defs 丢弃', () => {
  assert.deepEqual(sanitizeSchema({ const: 'abc' }), { enum: ['abc'], type: 'string' })
  assert.deepEqual(sanitizeSchema({ type: 'string', not: { const: 'x' } }), { type: 'string' })
})

test('$ref 从 $defs 解析', () => {
  const root = { $defs: { name: { type: 'string' } }, properties: { p: { $ref: '#/$defs/name' } } }
  assert.deepEqual(sanitizeSchema(root), { properties: { p: { type: 'string' } }, type: 'object' })
})

test('递归 $ref 不会无限展开', () => {
  const root = { $defs: { node: { type: 'object', properties: { next: { $ref: '#/$defs/node' } } } }, $ref: '#/$defs/node' }
  const out = sanitizeSchema(root)
  assert.equal(out.type, 'object')
  assert.deepEqual(out.properties.next, { type: 'string' })
})

test('嵌套结构整体压平', () => {
  const out = sanitizeSchema({
    type: 'object',
    properties: {
      items: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
      mixed: { type: ['number', 'null'] },
    },
  })
  assert.deepEqual(out, {
    type: 'object',
    properties: { items: { type: 'array', items: { type: 'string' } }, mixed: { type: 'number' } },
  })
})

test('缺 type 的节点补出可用类型', () => {
  assert.equal(sanitizeSchema({}).type, 'string')
  assert.deepEqual(sanitizeSchema({ enum: [3] }), { enum: [3], type: 'number' })
  assert.deepEqual(sanitizeSchema({ properties: { a: { type: 'string' } } }), { properties: { a: { type: 'string' } }, type: 'object' })
  assert.deepEqual(sanitizeSchema({ items: { type: 'string' } }), { items: { type: 'string' }, type: 'array' })
})

test('非对象原样返回', () => {
  assert.equal(sanitizeSchema('x'), 'x')
  assert.equal(sanitizeSchema(null), null)
})

test('filterTools 会压平参数 schema 并丢掉非 function 项', () => {
  const { tools, dropped } = filterTools([
    { type: 'function', function: { name: 'ok', parameters: { type: ['string', 'null'] } } },
    { type: 'function', function: { name: '  ' } },
    { type: 'image' },
  ])
  assert.equal(dropped, 2)
  assert.deepEqual(tools, [{ type: 'function', function: { name: 'ok', parameters: { type: 'string' } } }])
})
