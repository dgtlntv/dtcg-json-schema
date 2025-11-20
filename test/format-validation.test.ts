/**
 * Format Schema Validation Tests
 *
 * These tests validate that the DTCG format JSON schemas correctly accept valid
 * design token files and reject invalid ones.
 *
 * Test Organization:
 * - Tests are organized by token type (colors, dimensions, etc.)
 * - Each test validates against the format.json schema
 * - Tests run both with and without preprocessors where applicable
 * - Valid fixtures should pass validation
 * - Invalid fixtures should fail validation
 */

import assert from "node:assert"
import { describe, it } from "node:test"
import {
    createAssertionMessage,
    createTestCases,
    runValidationTest,
    SKIP_RAW_VALIDATION,
    type TestCase,
} from "./utils/test-helpers"

const SCHEMA_TYPE = "format" as const

/**
 * Create test suites for a category of fixtures
 * @param category The fixture category name
 * @param testCases Array of test cases to run
 * @param validity Whether these are valid or invalid fixtures
 * @param usePreprocessing Whether to apply preprocessors before validation
 */
function createTestSuiteForCategory(
    category: string,
    testCases: TestCase[],
    validity: "valid" | "invalid",
    usePreprocessing: boolean
): void {
    const suffix = usePreprocessing ? "" : " (raw)"
    const suiteName = `${category} - ${validity} fixtures${suffix}`

    describe(suiteName, () => {
        for (const testCase of testCases) {
            it(testCase.name, () => {
                const { valid, errors } = runValidationTest(
                    testCase,
                    usePreprocessing,
                    SCHEMA_TYPE
                )
                const message = createAssertionMessage(
                    testCase,
                    !usePreprocessing,
                    errors
                )
                assert.strictEqual(valid, testCase.shouldPass, message)
            })
        }
    })
}

// ============================================================================
// Test Suite Organization
// ============================================================================

/**
 * Create all test suites for a given validity type and preprocessing mode
 */
function createTestSuitesForValidity(
    validity: "valid" | "invalid",
    usePreprocessing: boolean
): void {
    const testCases = createTestCases(SCHEMA_TYPE, validity)

    for (const [category, cases] of testCases) {
        let filteredCases = cases

        // For raw validation of invalid fixtures, skip tests that require preprocessing
        if (!usePreprocessing && validity === "invalid") {
            filteredCases = cases.filter(
                (tc) => !SKIP_RAW_VALIDATION.has(tc.name)
            )
        }

        // Only create suite if there are test cases to run
        if (filteredCases.length > 0) {
            createTestSuiteForCategory(
                category,
                filteredCases,
                validity,
                usePreprocessing
            )
        }
    }
}

// ============================================================================
// Valid Format Fixtures Tests - With Preprocessing
// ============================================================================

describe("Valid Format Fixtures - Schema Validation (with preprocessing)", () => {
    createTestSuitesForValidity("valid", true)
})

// ============================================================================
// Valid Format Fixtures Tests - Raw (No Preprocessing)
// ============================================================================

describe("Valid Format Fixtures - Raw Schema Validation (no preprocessing)", () => {
    createTestSuitesForValidity("valid", false)
})

// ============================================================================
// Invalid Format Fixtures Tests - With Preprocessing
// ============================================================================

describe("Invalid Format Fixtures - Schema Validation (with preprocessing)", () => {
    createTestSuitesForValidity("invalid", true)
})

// ============================================================================
// Invalid Format Fixtures Tests - Raw (No Preprocessing)
// ============================================================================

describe("Invalid Format Fixtures - Raw Schema Validation (no preprocessing)", () => {
    createTestSuitesForValidity("invalid", false)
})
