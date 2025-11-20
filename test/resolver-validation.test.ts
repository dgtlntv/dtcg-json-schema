/**
 * Resolver Schema Validation Tests
 *
 * These tests validate that the DTCG resolver JSON schemas correctly accept valid
 * resolver documents and reject invalid ones.
 *
 * Test Organization:
 * - Tests are organized by resolver features (sets, modifiers, resolutionOrder, etc.)
 * - Each test validates against the resolver.json schema
 * - Valid fixtures should pass validation
 * - Invalid fixtures should fail validation
 *
 * Note: Unlike format validation, resolver validation does not use preprocessors
 * as the resolver spec defines a different processing model based on inputs.
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

const SCHEMA_TYPE = "resolver" as const

/**
 * Create test suites for a category of fixtures
 * @param category The fixture category name
 * @param testCases Array of test cases to run
 * @param validity Whether these are valid or invalid fixtures
 */
function createTestSuiteForCategory(
    category: string,
    testCases: TestCase[],
    validity: "valid" | "invalid"
): void {
    const suiteName = `${category} - ${validity} fixtures`

    describe(suiteName, () => {
        for (const testCase of testCases) {
            it(testCase.name, () => {
                const { valid, errors } = runValidationTest(
                    testCase,
                    false, // No preprocessing for resolver
                    SCHEMA_TYPE
                )
                const message = createAssertionMessage(
                    testCase,
                    true, // Always raw validation
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
 * Create all test suites for a given validity type
 */
function createTestSuitesForValidity(validity: "valid" | "invalid"): void {
    const testCases = createTestCases(SCHEMA_TYPE, validity)

    for (const [category, cases] of testCases) {
        let filteredCases = cases

        // For invalid fixtures, skip tests that require preprocessing/runtime checks
        if (validity === "invalid") {
            filteredCases = cases.filter(
                (tc) => !SKIP_RAW_VALIDATION.has(tc.name)
            )
        }

        // Only create suite if there are test cases to run
        if (filteredCases.length > 0) {
            createTestSuiteForCategory(category, filteredCases, validity)
        }
    }
}

// ============================================================================
// Valid Resolver Fixtures Tests
// ============================================================================

describe("Valid Resolver Fixtures - Schema Validation", () => {
    createTestSuitesForValidity("valid")
})

// ============================================================================
// Invalid Resolver Fixtures Tests
// ============================================================================

describe("Invalid Resolver Fixtures - Schema Validation", () => {
    createTestSuitesForValidity("invalid")
})

// ============================================================================
// Invalid Resolver Fixtures Tests - With Preprocessing
// ============================================================================

describe("Invalid Resolver Fixtures - Schema Validation (with preprocessing)", () => {
    const testCases = createTestCases(SCHEMA_TYPE, "invalid")

    // Only run tests for fixtures that require preprocessing
    const preprocessingCases =
        testCases
            .get("invalid")
            ?.filter(
                (tc) =>
                    tc.name === "circular-reference-in-sets" ||
                    tc.name === "duplicate-names-in-resolution-order"
            ) || []

    if (preprocessingCases.length > 0) {
        describe("invalid - invalid fixtures (preprocessing)", () => {
            for (const testCase of preprocessingCases) {
                it(testCase.name, () => {
                    const { valid, errors } = runValidationTest(
                        testCase,
                        true, // Use preprocessing
                        SCHEMA_TYPE
                    )
                    const message = createAssertionMessage(
                        testCase,
                        false, // Not raw validation
                        errors
                    )
                    assert.strictEqual(valid, testCase.shouldPass, message)
                })
            }
        })
    }
})
