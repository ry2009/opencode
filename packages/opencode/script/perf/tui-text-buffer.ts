#!/usr/bin/env bun

import { TextBuffer, TextBufferView, type WidthMethod } from "@opentui/core"

type WrapMode = "none" | "char" | "word"

const DEFAULT_LINES = [1000, 5000, 10_000, 20_000]

const args = new Map(
  process.argv.slice(2).flatMap((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/)
    if (!match) return []
    return [[match[1], match[2]] as const]
  }),
)

const width = clampInt(parseInt(args.get("width") ?? "120", 10), 20, 400)
const height = clampInt(parseInt(args.get("height") ?? "40", 10), 10, 200)
const iterations = clampInt(parseInt(args.get("iterations") ?? "10", 10), 1, 100)
const wrapMode = parseWrapMode(args.get("wrap") ?? "word")
const widthMethod = parseWidthMethod(args.get("widthMethod") ?? "wcwidth")
const lines = parseLineList(args.get("lines")) ?? DEFAULT_LINES

const buffer = TextBuffer.create(widthMethod)
const view = TextBufferView.create(buffer)

view.setViewportSize(width, height)
view.setWrapWidth(width)
view.setWrapMode(wrapMode)

console.log(`# opentui text-buffer-view perf`)
console.log(`# width=${width} height=${height} wrap=${wrapMode} iterations=${iterations} widthMethod=${widthMethod}`)
console.log(`lines\tchars\tavg_ms\tp50_ms\tp95_ms`)

for (const lineCount of lines) {
  const content = makeContent(lineCount, width)
  buffer.setText(content)
  view.measureForDimensions(width, height)

  const samples = Array.from({ length: iterations }, () => {
    const start = Bun.nanoseconds()
    view.measureForDimensions(width, height)
    const end = Bun.nanoseconds()
    return Number(end - start) / 1e6
  })

  const summary = summarize(samples)
  console.log(
    `${lineCount}\t${content.length}\t${formatMs(summary.avg)}\t${formatMs(summary.p50)}\t${formatMs(summary.p95)}`,
  )
}

view.destroy()
buffer.destroy()

function parseLineList(raw?: string) {
  if (!raw) return
  const items = raw
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((x) => Number.isFinite(x))
    .filter((x) => x > 0)
  if (!items.length) return
  return items
}

function parseWrapMode(raw: string): WrapMode {
  if (raw === "none") return "none"
  if (raw === "char") return "char"
  return "word"
}

function parseWidthMethod(raw: string): WidthMethod {
  if (raw === "unicode") return "unicode"
  return "wcwidth"
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

function makeContent(lines: number, width: number) {
  const short = (i: number) => `- item ${i.toString().padStart(6, "0")}: ${"x".repeat(Math.max(8, width - 24))}`
  const long = (i: number) =>
    `- item ${i.toString().padStart(6, "0")}: ${"x".repeat(Math.max(width * 3, 200))} (wrap wrap wrap)`

  return Array.from({ length: lines }, (_, i) => (i % 20 === 0 ? long(i) : short(i))).join("\n")
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const avg = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
  const p50 = percentile(sorted, 0.5)
  const p95 = percentile(sorted, 0.95)
  return { avg, p50, p95 }
}

function percentile(sorted: number[], p: number) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[idx] ?? 0
}

function formatMs(ms: number) {
  return ms.toFixed(2)
}

