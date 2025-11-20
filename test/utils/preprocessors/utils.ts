/**
 * Shared utility functions for design token preprocessors
 */

import type { Token, Group, DesignTokenObject } from "./types.js"

/**
 * Check if an object is a design token (has a $value or $ref property)
 */
export function isToken(obj: unknown): obj is Token {
    return (
        obj !== null &&
        typeof obj === "object" &&
        ("$value" in obj || "$ref" in obj)
    )
}

/**
 * Check if an object is a group (doesn't have $value or $ref property)
 */
export function isGroup(obj: unknown): obj is Group {
    return (
        obj !== null &&
        typeof obj === "object" &&
        !("$value" in obj) &&
        !("$ref" in obj)
    )
}

/**
 * Navigate through an object using path segments
 * @param root - The root object to navigate from
 * @param segments - Array of property names to traverse
 * @returns The value at the path, or undefined if not found
 */
export function navigateToPath(
    root: DesignTokenObject,
    segments: readonly string[]
): unknown {
    let current: unknown = root

    for (const segment of segments) {
        if (current === null || current === undefined) {
            return undefined
        }

        if (typeof current !== "object") {
            return undefined
        }

        const currentObj = current as Record<string, unknown>

        if (!(segment in currentObj)) {
            return undefined
        }

        current = currentObj[segment]
    }

    return current
}

/**
 * Resolve inherited $type by walking up the path segments
 * @param root - The root object to search in
 * @param segments - Path segments to the current token
 * @returns The inherited type, or undefined if not found
 */
export function resolveInheritedType(
    root: DesignTokenObject,
    segments: readonly string[]
): string | undefined {
    // Walk up the path to find inherited type
    for (let i = segments.length - 1; i > 0; i--) {
        const parentSegments = segments.slice(0, i)
        const parent = navigateToPath(root, parentSegments)

        if (parent && typeof parent === "object" && "$type" in parent) {
            const parentObj = parent as Record<string, unknown>
            if (typeof parentObj.$type === "string") {
                return parentObj.$type
            }
        }
    }

    return undefined
}

/**
 * Check if a value is a plain object (not null, not array)
 */
export function isPlainObject(
    value: unknown
): value is Record<string, unknown> {
    return (
        value !== null && typeof value === "object" && !Array.isArray(value)
    )
}
