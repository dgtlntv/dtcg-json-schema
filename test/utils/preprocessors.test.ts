/**
 * Tests for design token preprocessors
 *
 * These tests verify that the preprocessors correctly handle:
 * - Reference resolution (curly brace and JSON Pointer)
 * - Type inheritance from parent groups
 * - Combined preprocessing (references then type inheritance)
 */

import assert from "node:assert"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { resolveReferences } from "./preprocessors/referenceResolver"
import { processTypeInheritance } from "./preprocessors/typeInheritance"
import type { DesignTokenObject } from "./preprocessors/types"

/**
 * Load a fixture file from the test/fixtures directory
 */
function loadFixture(category: string, filename: string): DesignTokenObject {
    const fixturePath = join(
        import.meta.dirname,
        "..",
        "fixtures",
        "format", // Add format subdirectory
        category,
        filename
    )
    const content = readFileSync(fixturePath, "utf-8")
    return JSON.parse(content)
}

describe("Reference Resolver", () => {
    it("resolves curly brace references", () => {
        const input = loadFixture("valid/references", "curly-brace-alias.json")
        const output = resolveReferences(input)

        // Check that reference was resolved
        assert.deepStrictEqual(
            (output.semantic as any).primary.$value,
            {
                colorSpace: "srgb",
                components: [0, 0.4, 0.8],
                hex: "#0066cc",
            },
            "Curly brace reference should be resolved to the actual color value"
        )

        // Check that type was preserved
        assert.strictEqual(
            (output.semantic as any).primary.$type,
            "color",
            "Type should be preserved on the referencing token"
        )
    })

    it("resolves JSON Pointer references", () => {
        const input = loadFixture(
            "valid/references",
            "json-pointer-basic.json"
        )
        const output = resolveReferences(input)

        // Check that reference was resolved
        assert.deepStrictEqual(
            (output.semantic as any).primary.$value,
            {
                colorSpace: "srgb",
                components: [0, 0.4, 0.8],
                hex: "#0066cc",
            },
            "JSON Pointer reference should be resolved to the actual color value"
        )

        // Check that $ref was removed
        assert.strictEqual(
            (output.semantic as any).primary.$ref,
            undefined,
            "$ref property should be removed after resolution"
        )
    })

    it("resolves chained references", () => {
        const input = loadFixture("valid/references", "chained-reference.json")
        const output = resolveReferences(input)

        // Check that both references were resolved
        assert.deepStrictEqual(
            (output.aliases as any).brand.$value,
            {
                colorSpace: "srgb",
                components: [0, 0.4, 0.8],
            },
            "Chained reference should be resolved to the final value"
        )
    })

    it("resolves references in composite token values", () => {
        const input = loadFixture(
            "valid/references",
            "composite-with-refs.json"
        )
        const output = resolveReferences(input)

        // Check that nested references were resolved
        const shadowValue = (output.shadows as any).default.$value
        assert.deepStrictEqual(
            shadowValue.color,
            {
                colorSpace: "srgb",
                components: [0, 0, 0],
                alpha: 0.2,
            },
            "Color reference in composite should be resolved"
        )
        assert.deepStrictEqual(
            shadowValue.offsetX,
            {
                value: 4,
                unit: "px",
            },
            "Dimension reference for offsetX should be resolved"
        )
        assert.deepStrictEqual(
            shadowValue.offsetY,
            {
                value: 4,
                unit: "px",
            },
            "Dimension reference for offsetY should be resolved"
        )
    })

    it("resolves property-level JSON Pointer references", () => {
        const input = loadFixture(
            "valid/references",
            "typography-property-refs.json"
        )
        const output = resolveReferences(input)

        // Check that property references were resolved
        assert.deepStrictEqual(
            (output["extracted-font-family"] as any).$value,
            ["Helvetica Neue", "Arial", "sans-serif"],
            "Font family should be extracted from typography token"
        )
        assert.deepStrictEqual(
            (output["extracted-font-size"] as any).$value,
            {
                value: 16,
                unit: "px",
            },
            "Font size should be extracted from typography token"
        )
        assert.strictEqual(
            (output["extracted-line-height"] as any).$value,
            1.5,
            "Line height should be extracted from typography token"
        )
    })

    it("resolves nested property references in composite values", () => {
        const input = loadFixture(
            "valid/references",
            "typography-property-refs.json"
        )
        const output = resolveReferences(input)

        const typographyValue = (output["typography-inheriting-parts"] as any)
            .$value

        // Check that nested references were resolved
        assert.deepStrictEqual(
            typographyValue.fontFamily,
            ["Helvetica Neue", "Arial", "sans-serif"],
            "Font family reference should be resolved"
        )
        assert.deepStrictEqual(
            typographyValue.letterSpacing,
            {
                value: 0,
                unit: "px",
            },
            "Letter spacing reference should be resolved"
        )
        assert.strictEqual(
            typographyValue.lineHeight,
            1.5,
            "Line height reference should be resolved"
        )
        // Check that non-referenced values are preserved
        assert.deepStrictEqual(
            typographyValue.fontSize,
            {
                value: 24,
                unit: "px",
            },
            "Non-referenced font size should be preserved"
        )
    })

    it("resolves deeply nested references", () => {
        const input = loadFixture(
            "valid/references",
            "nested-composite-refs.json"
        )
        const output = resolveReferences(input)

        // Check that nested object reference was resolved
        assert.deepStrictEqual(
            (output["stroke-from-border"] as any).$value,
            {
                dashArray: [
                    {
                        value: 10,
                        unit: "px",
                    },
                    {
                        value: 5,
                        unit: "px",
                    },
                ],
                lineCap: "round",
            },
            "Stroke style should be extracted from border"
        )

        // Check that array element reference was resolved
        assert.deepStrictEqual(
            (output["dimension-from-dash-array"] as any).$value,
            {
                value: 10,
                unit: "px",
            },
            "Dimension should be extracted from dash array element"
        )

        // Check transition property extraction
        assert.deepStrictEqual(
            (output["duration-from-transition"] as any).$value,
            {
                value: 300,
                unit: "ms",
            },
            "Duration should be extracted from transition"
        )

        assert.deepStrictEqual(
            (output["easing-from-transition"] as any).$value,
            [0.25, 0.1, 0.25, 1],
            "Cubic bezier should be extracted from transition"
        )
    })

    it("copies type from referenced token when not explicitly set", () => {
        const input = loadFixture("valid/references", "curly-brace-alias.json")

        // Remove explicit $type from semantic.primary to test type copying
        const modifiedInput = JSON.parse(JSON.stringify(input))
        delete modifiedInput.semantic.primary.$type

        const output = resolveReferences(modifiedInput)

        // Check that type was copied from referenced token
        assert.strictEqual(
            (output.semantic as any).primary.$type,
            "color",
            "Type should be copied from referenced token"
        )
    })
})

describe("Type Inheritance", () => {
    it("adds inherited $type to tokens without explicit type", () => {
        const input = loadFixture("valid/group", "type-inheritance.json")
        const output = processTypeInheritance(input)

        // Check that type was inherited
        assert.strictEqual(
            (output.colors as any).primary.$type,
            "color",
            "Token should inherit type from parent group"
        )
        assert.strictEqual(
            (output.colors as any).secondary.$type,
            "color",
            "Token should inherit type from parent group"
        )
    })

    it("handles nested groups with type inheritance", () => {
        const input = loadFixture("valid/group", "nested-groups.json")
        const output = processTypeInheritance(input)

        // Check that type was inherited through deeply nested groups
        assert.strictEqual(
            (output.colors as any).nested.deep.veryDeep.primary.$type,
            "color",
            "Type should be inherited through nested groups"
        )
    })
})

describe("Reference Resolver - Error Handling", () => {
    it("throws on circular references", () => {
        const input = loadFixture(
            "invalid/references",
            "circular-reference-chain.json"
        )

        assert.throws(
            () => resolveReferences(input),
            /Circular reference detected/,
            "Should throw error for circular references"
        )
    })

    it("throws on self-reference", () => {
        const input = loadFixture("invalid/references", "self-reference.json")

        assert.throws(
            () => resolveReferences(input),
            /Circular reference detected/,
            "Should throw error for self-reference"
        )
    })

    it("throws on nonexistent reference", () => {
        const input = loadFixture(
            "invalid/references",
            "reference-nonexistent.json"
        )

        assert.throws(
            () => resolveReferences(input),
            /does not point to a valid token/,
            "Should throw error for nonexistent reference"
        )
    })

    it("throws on nonexistent JSON Pointer reference", () => {
        const input = loadFixture(
            "invalid/references",
            "json-pointer-nonexistent.json"
        )

        assert.throws(
            () => resolveReferences(input),
            /could not be resolved/,
            "Should throw error for nonexistent JSON Pointer reference"
        )
    })
})

describe("Type Inheritance - Error Handling", () => {
    it("throws on token with no inherited type", () => {
        const input: DesignTokenObject = {
            tokens: {
                orphan: {
                    $value: "some-value",
                },
            },
        }

        assert.throws(
            () => processTypeInheritance(input),
            /has no \$type and no inherited type/,
            "Should throw error for token without type"
        )
    })
})

describe("Combined Preprocessing", () => {
    it("handles complex scenario with references and inheritance", () => {
        const input = loadFixture(
            "valid/references",
            "composite-with-refs.json"
        )

        // Process: references first, then inheritance
        const afterReferences = resolveReferences(input)
        const final = processTypeInheritance(afterReferences)

        // Check that references in shadow were resolved
        const shadowValue = (final.shadows as any).default.$value
        assert.deepStrictEqual(
            shadowValue.color,
            {
                colorSpace: "srgb",
                components: [0, 0, 0],
                alpha: 0.2,
            },
            "Color reference should be resolved"
        )

        // Check that all tokens have explicit types after preprocessing
        assert.strictEqual(
            (final.colors as any).black.$type,
            "color",
            "Color token should have type"
        )
        assert.strictEqual(
            (final.spacing as any).small.$type,
            "dimension",
            "Dimension token should have type"
        )
        assert.strictEqual(
            (final.shadows as any).default.$type,
            "shadow",
            "Shadow token should have type"
        )
    })
})
