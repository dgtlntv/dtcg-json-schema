/**
 * Shared test utilities for JSON Schema validation and fixture loading
 */

import addFormats from "ajv-formats"
import Ajv from "ajv"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { resolveReferences } from "./preprocessors/referenceResolver"
import { validateResolverSemantics } from "./preprocessors/resolverValidator"
import { processTypeInheritance } from "./preprocessors/typeInheritance"
import type { DesignTokenObject } from "./preprocessors/types"

// ============================================================================
// Constants
// ============================================================================

const SCHEMA_DIR = join(import.meta.dirname, "..", "..", "schemas")
const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures")

const SCHEMA_FILES = {
    // Format schemas
    tokenType: "format/tokenType.json",
    token: "format/token.json",
    group: "format/group.json",
    groupOrToken: "format/groupOrToken.json",
    format: "format/format.json",
    // Resolver schemas
    resolver: "resolver/resolver.json",
    set: "resolver/set.json",
    modifier: "resolver/modifier.json",
    resolutionOrder: "resolver/resolutionOrder.json",
} as const

const AJV_CONFIG = {
    strict: false,
    allErrors: true,
    verbose: true,
} as const

// ============================================================================
// Types
// ============================================================================

/**
 * Test case configuration
 */
export interface TestCase {
    /** Fixture file path relative to fixtures directory */
    path: string
    /** Human-readable name */
    name: string
    /** Category/subdirectory */
    category: string
    /** Whether validation should pass */
    shouldPass: boolean
}

export interface ValidationResult {
    valid: boolean
    errors: string[]
}

export interface PreprocessorOptions {
    resolveReferences?: boolean
    inheritTypes?: boolean
}

export interface SchemaContext {
    ajv: Ajv
    formatSchema: object
    resolverSchema?: object
}

export type SchemaType = "format" | "resolver"

// ============================================================================
// Fixture Loading
// ============================================================================

/**
 * Load a fixture file from the test/fixtures directory
 */
export function loadFixture(
    category: string,
    filename: string
): DesignTokenObject {
    const fixturePath = join(FIXTURES_DIR, category, filename)
    const content = readFileSync(fixturePath, "utf-8")
    return JSON.parse(content)
}

/**
 * Get all fixture files from a directory recursively
 */
export function getFixtureFiles(
    baseDir: string,
    category: string
): Array<{ path: string; name: string; category: string }> {
    const files: Array<{ path: string; name: string; category: string }> = []
    const rootPath = join(baseDir, category)

    const traverse = (dir: string, relativePath = ""): void => {
        const entries = readdirSync(dir)

        for (const entry of entries) {
            const fullPath = join(dir, entry)
            const isDirectory = statSync(fullPath).isDirectory()

            if (isDirectory) {
                const newRelativePath = relativePath
                    ? `${relativePath}/${entry}`
                    : entry
                traverse(fullPath, newRelativePath)
            } else if (entry.endsWith(".json")) {
                const categoryPath = relativePath
                    ? `${category}/${relativePath}`
                    : category
                files.push({
                    path: join(categoryPath, entry),
                    name: entry.replace(".json", ""),
                    category: categoryPath,
                })
            }
        }
    }

    traverse(rootPath)
    return files
}

// ============================================================================
// Schema Loading and Validation
// ============================================================================

/**
 * Load a JSON schema file from disk
 */
function loadSchemaFile(relativePath: string): object {
    const schemaPath = join(SCHEMA_DIR, relativePath)
    const content = readFileSync(schemaPath, "utf-8")
    return JSON.parse(content)
}

/**
 * Load all value schemas from the values directory
 */
function loadValueSchemas(ajv: Ajv): void {
    const valuesDir = join(SCHEMA_DIR, "format", "values")
    const schemaFiles = readdirSync(valuesDir).filter((file) =>
        file.endsWith(".json")
    )

    for (const schemaFile of schemaFiles) {
        const schema = loadSchemaFile(`format/values/${schemaFile}`)
        ajv.addSchema(schema)
    }
}

/**
 * Create an AJV instance configured for DTCG schema validation
 */
export function createValidator(): Ajv {
    const ajv = new Ajv(AJV_CONFIG)
    addFormats(ajv)
    return ajv
}

/**
 * Load all referenced schemas into the validator
 */
export function loadSchemas(
    ajv: Ajv,
    schemaType: SchemaType = "format"
): SchemaContext {
    if (schemaType === "format") {
        // Load core format schemas in dependency order
        const coreSchemas = [
            SCHEMA_FILES.tokenType,
            SCHEMA_FILES.token,
            SCHEMA_FILES.group,
            SCHEMA_FILES.groupOrToken,
        ]

        for (const schemaPath of coreSchemas) {
            const schema = loadSchemaFile(schemaPath)
            ajv.addSchema(schema)
        }

        // Load all value type schemas
        loadValueSchemas(ajv)

        // Load and return main format schema
        const formatSchema = loadSchemaFile(SCHEMA_FILES.format)

        return { ajv, formatSchema }
    } else {
        // Load resolver schemas in dependency order
        const resolverSchemas = [
            SCHEMA_FILES.set,
            SCHEMA_FILES.modifier,
            SCHEMA_FILES.resolutionOrder,
        ]

        for (const schemaPath of resolverSchemas) {
            const schema = loadSchemaFile(schemaPath)
            ajv.addSchema(schema)
        }

        // Also load format schema as it's referenced by resolver
        const coreSchemas = [
            SCHEMA_FILES.tokenType,
            SCHEMA_FILES.token,
            SCHEMA_FILES.group,
            SCHEMA_FILES.groupOrToken,
            SCHEMA_FILES.format,
        ]

        for (const schemaPath of coreSchemas) {
            const schema = loadSchemaFile(schemaPath)
            ajv.addSchema(schema)
        }

        // Load all value type schemas
        loadValueSchemas(ajv)

        // Load and return main resolver schema
        const resolverSchema = loadSchemaFile(SCHEMA_FILES.resolver)

        return { ajv, formatSchema: resolverSchema, resolverSchema }
    }
}

/**
 * Cached schema contexts to avoid reloading schemas for each test
 */
const cachedSchemaContexts: Map<SchemaType, SchemaContext> = new Map()

/**
 * Get or create a cached schema context
 */
export function getSchemaContext(
    schemaType: SchemaType = "format"
): SchemaContext {
    if (!cachedSchemaContexts.has(schemaType)) {
        const ajv = createValidator()
        const context = loadSchemas(ajv, schemaType)
        cachedSchemaContexts.set(schemaType, context)
    }
    return cachedSchemaContexts.get(schemaType)!
}

/**
 * Format AJV validation errors into human-readable messages
 */
function formatValidationErrors(errors: Array<any>): string[] {
    return errors.map((error) => {
        const path = error.instancePath || "(root)"
        const message = error.message || "validation error"
        return `${path}: ${message}`
    })
}

/**
 * Validate a design token object against the schema
 */
export function validateAgainstSchema(
    data: DesignTokenObject,
    ajv: Ajv,
    schema: object
): ValidationResult {
    const validate = ajv.compile(schema)
    const valid = validate(data)

    const errors =
        valid || !validate.errors
            ? []
            : formatValidationErrors(validate.errors)

    return { valid, errors }
}

// ============================================================================
// Preprocessing
// ============================================================================

const DEFAULT_PREPROCESSOR_OPTIONS: PreprocessorOptions = {
    resolveReferences: true,
    inheritTypes: true,
}

/**
 * Apply preprocessors to a design token object
 * Clones the data to avoid mutations
 */
export function applyPreprocessors(
    data: DesignTokenObject,
    options: PreprocessorOptions = DEFAULT_PREPROCESSOR_OPTIONS,
    schemaType: SchemaType = "format"
): DesignTokenObject {
    let result = structuredClone(data)

    // For resolver schema, run semantic validation
    if (schemaType === "resolver") {
        return validateResolverSemantics(result)
    }

    // 1. Resolve references (includes $extends, aliases, and $ref)
    if (options.resolveReferences) {
        result = resolveReferences(result)
    }

    // 2. Apply type inheritance last
    if (options.inheritTypes) {
        result = processTypeInheritance(result)
    }

    return result
}

// ============================================================================
// Test Case Generation
// ============================================================================

/**
 * Fixtures that require preprocessing to detect errors
 * These fixtures pass raw schema validation but fail when preprocessed
 */
export const SKIP_RAW_VALIDATION = new Set([
    // Reference resolution errors that need preprocessing
    "circular-reference-chain",
    "reference-nonexistent",
    "reference-to-wrong-subvalue",
    "reference-type-mismatch",
    "reference-with-spaces",
    "self-reference",
    // Extends errors that need preprocessing
    "circular-extends",
    "extends-nonexistent",
    "extends-token",
    // Type inheritance errors that need preprocessing
    "token-missing-type",
    // Composite reference errors that need preprocessing to resolve
    "composite-ref-to-number-for-dimension",
    "composite-ref-to-partial-color",
    "composite-ref-wrong-subvalue-type",
    "gradient-ref-to-non-gradient-stop",
    "stroke-dashArray-ref-wrong-type",
    // JSON Pointer resolution errors that need preprocessing
    "json-pointer-circular-with-ref",
    "json-pointer-missing-value",
    "json-pointer-array-as-string",
    "json-pointer-double-slash",
    "json-pointer-empty-path",
    "json-pointer-incomplete-dimension",
    "json-pointer-negative-array-index",
    "json-pointer-nonexistent",
    "json-pointer-to-description",
    "json-pointer-to-group",
    "json-pointer-to-metadata",
    "json-pointer-trailing-slash",
    "json-pointer-type-mismatch",
    "json-pointer-wrong-array-index",
    "json-pointer-wrong-property",
    "json-pointer-wrong-separator",
    // Resolver errors that cannot be caught by schema validation
    "circular-reference-in-sets",
    "duplicate-names-in-resolution-order",
])

/**
 * Get all fixture categories from a validity directory
 * For resolver fixtures (which are flat), returns a single category
 * For format fixtures (which have subdirectories), returns subdirectory names
 */
function getFixtureCategories(
    schemaType: SchemaType,
    validity: "valid" | "invalid"
): string[] {
    const fixturesDir = join(FIXTURES_DIR, schemaType, validity)
    const entries = readdirSync(fixturesDir)

    // Check if there are subdirectories
    const subdirs = entries.filter((entry) => {
        const stat = statSync(join(fixturesDir, entry))
        return stat.isDirectory()
    })

    // If there are subdirectories, return them (format fixtures)
    // If not, return a single category representing the validity dir itself (resolver fixtures)
    return subdirs.length > 0 ? subdirs : [validity]
}

/**
 * Create test cases from fixture files
 */
export function createTestCases(
    schemaType: SchemaType,
    validity: "valid" | "invalid"
): Map<string, TestCase[]> {
    const fixturesDir = join(FIXTURES_DIR, schemaType, validity)
    const categories = getFixtureCategories(schemaType, validity)
    const testCasesByCategory = new Map<string, TestCase[]>()

    for (const category of categories) {
        // For resolver fixtures (flat structure), category is the validity name
        // so we need to get files directly from the validity directory
        const categoryPath = category === validity ? "" : category
        const searchDir = categoryPath
            ? join(fixturesDir, categoryPath)
            : fixturesDir

        // If it's a flat structure (resolver), get JSON files directly
        if (category === validity) {
            const files = readdirSync(searchDir)
                .filter((file) => file.endsWith(".json"))
                .map((file) => ({
                    path: `${validity}/${file}`,
                    name: file.replace(".json", ""),
                    category: validity,
                }))

            const testCases: TestCase[] = files.map((fixture) => ({
                path: fixture.path,
                name: fixture.name,
                category: `${schemaType}/${validity}`,
                shouldPass: validity === "valid",
            }))

            testCasesByCategory.set(validity, testCases)
        } else {
            // Otherwise use the original nested structure (format)
            const fixtures = getFixtureFiles(fixturesDir, category)
            const testCases: TestCase[] = fixtures.map((fixture) => ({
                path: fixture.path,
                name: fixture.name,
                category: `${schemaType}/${validity}/${fixture.category}`,
                shouldPass: validity === "valid",
            }))

            testCasesByCategory.set(category, testCases)
        }
    }

    return testCasesByCategory
}

// ============================================================================
// Test Execution Helpers
// ============================================================================

/**
 * Extract filename from test case path
 */
export function getFixtureFilename(testCase: TestCase): string {
    return testCase.path.split("/").pop()!
}

/**
 * Create an assertion error message for validation results
 */
export function createAssertionMessage(
    testCase: TestCase,
    isRaw: boolean,
    errors: string[]
): string {
    const mode = isRaw ? "raw validation" : "validation"
    const shouldPass = testCase.shouldPass

    if (shouldPass) {
        return `Expected ${mode} to pass for ${
            testCase.name
        }.\nErrors:\n${errors.join("\n")}`
    }
    return `Expected ${mode} to fail for ${testCase.name}, but it passed`
}

/**
 * Run a single validation test case
 * @param testCase The test case to run
 * @param usePreprocessing Whether to apply preprocessors before validation
 * @param schemaType The type of schema to validate against ('format' or 'resolver')
 * @returns Validation result with valid flag and any errors
 */
export function runValidationTest(
    testCase: TestCase,
    usePreprocessing: boolean,
    schemaType: SchemaType = "format"
): ValidationResult {
    const { ajv, formatSchema } = getSchemaContext(schemaType)
    const filename = getFixtureFilename(testCase)
    let data = loadFixture(testCase.category, filename)

    // Apply preprocessors if requested
    if (usePreprocessing) {
        try {
            // Apply preprocessors (they may throw for invalid fixtures)
            data = applyPreprocessors(
                data,
                DEFAULT_PREPROCESSOR_OPTIONS,
                schemaType
            )
        } catch (error) {
            // If preprocessing fails for invalid fixtures, this is expected
            if (!testCase.shouldPass) {
                return { valid: false, errors: [] }
            }
            // For valid fixtures, preprocessing should not throw
            throw error
        }
    }

    // Validate against schema
    return validateAgainstSchema(data, ajv, formatSchema)
}
