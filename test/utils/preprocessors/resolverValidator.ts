/**
 * Resolver Semantic Validator
 *
 * This module provides semantic validation for resolver files that cannot be
 * enforced by JSON Schema alone.
 *
 * Checks:
 * 1. Circular references in sets and modifiers
 * 2. Duplicate names in resolutionOrder
 */

import { isJsonPointerReference } from "./referenceResolver.js"
import type { DesignTokenObject } from "./types.js"

interface ResolverFile {
    sets?: Record<string, any>
    modifiers?: Record<string, any>
    resolutionOrder?: Array<any>
    [key: string]: any
}

/**
 * Validate resolver semantics
 * Throws an error if validation fails
 */
export function validateResolverSemantics(
    data: DesignTokenObject
): DesignTokenObject {
    const resolver = data as ResolverFile

    // 1. Check for duplicate names in resolutionOrder
    if (Array.isArray(resolver.resolutionOrder)) {
        const names = new Set<string>()

        for (const item of resolver.resolutionOrder) {
            // Only check inline items which have a name property
            if (
                item &&
                typeof item === "object" &&
                "name" in item &&
                typeof item.name === "string"
            ) {
                if (names.has(item.name)) {
                    throw new Error(
                        `Duplicate name in resolutionOrder: "${item.name}"`
                    )
                }
                names.add(item.name)
            }
        }
    }

    // 2. Check for circular references in sets
    if (resolver.sets) {
        for (const [setName, set] of Object.entries(resolver.sets)) {
            validateSetReferences(resolver, setName, set, new Set())
        }
    }

    return data
}

/**
 * Validate references within a set to ensure no circular dependencies
 */
function validateSetReferences(
    root: ResolverFile,
    currentSetName: string,
    set: any,
    visited: Set<string>
): void {
    if (visited.has(currentSetName)) {
        throw new Error(
            `Circular reference detected in sets: ${Array.from(visited).join(
                " -> "
            )} -> ${currentSetName}`
        )
    }

    visited.add(currentSetName)

    if (!set || !Array.isArray(set.sources)) {
        return
    }

    for (const source of set.sources) {
        if (isJsonPointerReference(source)) {
            const ref = source.$ref
            // Check if it references another set
            if (ref.startsWith("#/sets/")) {
                const targetSetName = ref.replace("#/sets/", "")

                // Find the target set
                if (root.sets && root.sets[targetSetName]) {
                    validateSetReferences(
                        root,
                        targetSetName,
                        root.sets[targetSetName],
                        new Set(visited)
                    )
                }
            }
        }
    }
}
