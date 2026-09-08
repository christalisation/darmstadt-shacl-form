#!/usr/bin/env node
// Standalone RML mapping verification — deliberately NOT part of Storybook.
//
// For each entry in test-defs/rml.ts, this script:
//   1. Executes the reconstructed `generated-mapping.ttl` (authored through
//      the project's own RML form UI, using the w3id.org/rml/ namespace that
//      matches the pinned rml/core-authoring.ttl + rml/io.ttl shapes) with
//      RMLMapper, exactly as done manually for the thesis's Chapter 6
//      evaluation.
//   2. Parses both the materialised output and the upstream test case's
//      expected output.nq into RDF/JS quads.
//   3. Compares them with graph isomorphism (rdf-isomorphic), NOT string or
//      N-Quads-line equality, since two valid executions can differ in
//      blank-node labelling or triple order while representing the same
//      graph.
//   4. Writes a pass/fail + diff summary to verification-results/rml.json.
//
// Storybook only ever displays the `verification` field already recorded on
// the test-def; it does not compute it. Re-run this script and update that
// field by hand after inspecting the results file whenever a mapping or
// upstream expected output changes.
//
// Usage: node scripts/verify-rml.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { Parser as N3Parser } from 'n3'
import { isomorphic } from 'rdf-isomorphic'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const RMLMAPPER_VERSION = '8.0.0'
const RMLMAPPER_JAR = join(ROOT, '.tools', `rmlmapper-${RMLMAPPER_VERSION}.jar`)
const RMLMAPPER_URL = `https://github.com/RMLio/rmlmapper-java/releases/download/v${RMLMAPPER_VERSION}/rmlmapper-${RMLMAPPER_VERSION}-r378-all.jar`
const JAVA_BIN = process.env.JAVA_BIN || 'java'

const RESULTS_DIR = join(ROOT, 'verification-results')
const RESULTS_FILE = join(RESULTS_DIR, 'rml.json')

function ensureRmlMapper() {
    if (existsSync(RMLMAPPER_JAR)) {
        return
    }
    console.log(`RMLMapper ${RMLMAPPER_VERSION} jar not found at ${RMLMAPPER_JAR}, downloading...`)
    mkdirSync(dirname(RMLMAPPER_JAR), { recursive: true })
    execFileSync('curl', ['-sL', '-o', RMLMAPPER_JAR, RMLMAPPER_URL], { stdio: 'inherit' })
}

async function loadRmlTestDefs() {
    const bundlePath = join(tmpdir(), `rml-testdefs-${Date.now()}.mjs`)
    execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
        join(ROOT, 'test-defs/rml.ts'),
        '--bundle',
        '--format=esm',
        '--platform=node',
        `--outfile=${bundlePath}`,
    ])
    const mod = await import(`file://${bundlePath}`)
    return mod.rmlTestDefs
}

function parseQuads(text, format) {
    const parser = new N3Parser({ format })
    return parser.parse(text)
}

function runRmlMapper(mappingFile, outFile) {
    const cwd = dirname(mappingFile)
    let stderr = ''
    try {
        execFileSync(JAVA_BIN, [
            '-jar', RMLMAPPER_JAR,
            '-m', mappingFile,
            '-o', outFile,
            '-s', 'nquads',
        ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
        stderr = (error.stderr || '').toString()
        throw Object.assign(new Error(`RMLMapper failed: ${stderr || error.message}`), { stderr })
    }
    const text = readFileSync(outFile, 'utf-8')
    return { text, outFile }
}

async function verifyOne(def) {
    const mappingFile = resolve(ROOT, def.mappingFile)
    const expectedOutputFile = resolve(ROOT, def.expectedOutputFile)
    const actualOutputFile = join(RESULTS_DIR, `${def.id}-actual-output.nq`)

    const record = {
        id: def.id,
        tool: `RMLMapper ${RMLMAPPER_VERSION}`,
        mappingFile: def.mappingFile,
        comparedAgainst: def.expectedOutputFile,
        actualOutputFile: `verification-results/${def.id}-actual-output.nq`,
        ranAt: new Date().toISOString(),
    }

    let actual
    try {
        mkdirSync(RESULTS_DIR, { recursive: true })
        actual = runRmlMapper(mappingFile, actualOutputFile)
    } catch (error) {
        return { ...record, result: 'fail', reason: 'execution-error', error: error.message }
    }

    const expectedText = readFileSync(expectedOutputFile, 'utf-8')

    let actualQuads
    let expectedQuads
    try {
        actualQuads = parseQuads(actual.text, 'N-Quads')
        expectedQuads = parseQuads(expectedText, 'N-Quads')
    } catch (error) {
        return { ...record, result: 'fail', reason: 'parse-error', error: error.message }
    }

    const isIsomorphic = isomorphic(actualQuads, expectedQuads)

    return {
        ...record,
        actualQuadCount: actualQuads.length,
        expectedQuadCount: expectedQuads.length,
        isomorphic: isIsomorphic,
        result: isIsomorphic ? 'pass' : 'fail',
        reason: isIsomorphic ? undefined : 'not-isomorphic',
    }
}

async function main() {
    ensureRmlMapper()
    const defs = await loadRmlTestDefs()
    const results = []
    for (const def of defs) {
        console.log(`Verifying ${def.id}...`)
        const result = await verifyOne(def)
        results.push(result)
        console.log(`  -> ${result.result}${result.reason ? ` (${result.reason})` : ''}`)
    }

    mkdirSync(RESULTS_DIR, { recursive: true })
    writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 4) + '\n')

    console.log()
    console.log('id | result | actual quads | expected quads')
    for (const r of results) {
        console.log(`${r.id} | ${r.result} | ${r.actualQuadCount ?? '-'} | ${r.expectedQuadCount ?? '-'}`)
    }
    console.log()
    console.log(`Results written to ${RESULTS_FILE}`)

    if (results.some(r => r.result !== 'pass')) {
        process.exitCode = 1
    }
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
