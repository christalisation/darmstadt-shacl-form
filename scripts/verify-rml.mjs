#!/usr/bin/env node
// Usage: node scripts/verify-rml.mjs

// RML mapping verification script. 
// It compares the output of the RMLMapper tool against expected outputs for each mapping definition in evaluation/test-defs/rml.ts.
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
    // Download the pinned RMLMapper version on first use.
    console.log(`RMLMapper ${RMLMAPPER_VERSION} jar not found at ${RMLMAPPER_JAR}, downloading...`)
    mkdirSync(dirname(RMLMAPPER_JAR), { recursive: true })
    execFileSync('curl', ['-sL', '-o', RMLMAPPER_JAR, RMLMAPPER_URL], { stdio: 'inherit' })
}

async function loadRmlTestDefs() {
    const bundlePath = join(tmpdir(), `rml-testdefs-${Date.now()}.mjs`)
    // Bundle the TypeScript definitions so this standalone Node script can load them.
    execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
        join(ROOT, 'evaluation/test-defs/rml.ts'), // where the RML tests are defined
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
    // Run the mapping from its fixture directory so relative input paths resolve.
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

    // Execute the generated mapping, then parse the actual and expected outputs as RDF/JS quads.
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

    // Compare graph meaning rather than serialized line order or blank-node labels.
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

    // Storybook displays the separately maintained verification field; this file records each fresh run.
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
