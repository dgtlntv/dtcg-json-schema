/**
 * Design Token Reference Resolver
 *
 * This module provides functionality to resolve design token references, converting
 * alias tokens into their resolved values. This should be run BEFORE type inheritance
 * to ensure tokens get their types from the correct source.
 *
 * Supports all reference syntaxes from the DTCG specification:
 * - Curly brace references: "{group.token}" in $value
 * - JSON Pointer references: "$ref": "#/path/to/value"
 * - Group extensions: "$extends": "{group}" for group inheritance
 *
 * Handles:
 * - Chained references (references to references)
 * - Circular reference detection
 * - Property-level references (JSON Pointer only)
 * - Group extension with deep merge
 */

import type {
    DesignTokenObject,
    Group,
    ResolveResult,
    Token,
} from "./types.js"
import { hasRefProperty } from "./types.js"
import {
    isGroup,
    isPlainObject,
    isToken,
    navigateToPath,
    resolveInheritedType,
} from "./utils.js"

/**
 * Check if a value is a curly brace reference (e.g., "{group.token}")
 */
export function isCurlyBraceReference(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.startsWith("{") &&
        value.endsWith("}") &&
        value.length > 2
    )
}

/**
 * Check if a token uses JSON Pointer reference ($ref property)
 */
export function isJsonPointerReference(token: Token): boolean {
    return typeof token.$ref === "string" && token.$ref.length > 0
}

/**
 * Parse a curly brace reference into path segments
 * Example: "{colors.primary}" -> ["colors", "primary"]
 */
export function parseCurlyBraceReference(reference: string): string[] {
    // Remove curly braces
    const path = reference.slice(1, -1)
    // Split by dots
    return path.split(".")
}

/**
 * Parse a JSON Pointer reference into path segments
 * Example: "#/colors/primary/$value" -> ["colors", "primary", "$value"]
 */
export function parseJsonPointer(pointer: string): string[] {
    // Remove leading # or #/
    let path = pointer
    if (path.startsWith("#/")) {
        path = path.slice(2)
    } else if (path.startsWith("#")) {
        path = path.slice(1)
    }

    if (path === "") {
        return []
    }

    // Split by / and handle escaping
    return path.split("/").map((segment) => {
        // Unescape ~1 to / and ~0 to ~
        return segment.replace(/~1/g, "/").replace(/~0/g, "~")
    })
}

/**
 * Resolve a curly brace reference to its value
 * Curly brace references always resolve to the $value of the target token
 */
export function resolveCurlyBraceReference(
    root: DesignTokenObject,
    reference: string,
    visitedRefs: Set<string> = new Set()
): ResolveResult | null {
    // Check for circular reference
    if (visitedRefs.has(reference)) {
        throw new Error(
            `Circular reference detected: ${Array.from(visitedRefs).join(
                " -> "
            )} -> ${reference}`
        )
    }

    visitedRefs.add(reference)

    const segments = parseCurlyBraceReference(reference)
    const target = navigateToPath(root, segments)

    if (!isToken(target)) {
        throw new Error(
            `Curly brace reference "${reference}" does not point to a valid token`
        )
    }

    // If the target is also a reference, resolve it recursively
    if (isCurlyBraceReference(target.$value)) {
        return resolveCurlyBraceReference(
            root,
            target.$value as string,
            new Set(visitedRefs)
        )
    }

    if (isJsonPointerReference(target)) {
        return resolveJsonPointerReference(
            root,
            target.$ref as string,
            new Set(visitedRefs)
        )
    }

    // Get the type - either explicit on token or inherited from parent groups
    const resolvedType = target.$type ?? resolveInheritedType(root, segments)

    // Return the resolved value and type
    return {
        value: target.$value,
        type: resolvedType,
    }
}

/**
 * Resolve a JSON Pointer reference to its value
 * JSON Pointer references can point to any location in the document
 */
export function resolveJsonPointerReference(
    root: DesignTokenObject,
    pointer: string,
    visitedRefs: Set<string> = new Set()
): ResolveResult | null {
    // Check for circular reference
    if (visitedRefs.has(pointer)) {
        throw new Error(
            `Circular reference detected: ${Array.from(visitedRefs).join(
                " -> "
            )} -> ${pointer}`
        )
    }

    visitedRefs.add(pointer)

    const segments = parseJsonPointer(pointer)
    const target = navigateToPath(root, segments)

    if (target === undefined) {
        throw new Error(
            `JSON Pointer reference "${pointer}" could not be resolved`
        )
    }

    // If the target is a token with a reference, resolve it recursively
    if (isToken(target)) {
        if (isCurlyBraceReference(target.$value)) {
            return resolveCurlyBraceReference(
                root,
                target.$value as string,
                new Set(visitedRefs)
            )
        }

        if (isJsonPointerReference(target)) {
            return resolveJsonPointerReference(
                root,
                target.$ref as string,
                new Set(visitedRefs)
            )
        }

        // JSON Pointer should explicitly point to /$value, not the token object
        // This is different from curly brace syntax which automatically accesses $value
        throw new Error(
            `JSON Pointer reference "${pointer}" points to a token object. ` +
                `Use "${pointer}/$value" to reference the token's value, or use curly brace syntax.`
        )
    }

    // For non-token targets (e.g., property-level references), return the value directly
    // However, if the pointer ends with /$value, we can get the type from the parent token
    // This makes "$ref": "#/colors/blue/$value" equivalent to "{colors.blue}" per the spec
    let inferredType: string | undefined = undefined

    if (segments.length > 0 && segments[segments.length - 1] === "$value") {
        // Get the parent token (remove the last segment which is "$value")
        const parentSegments = segments.slice(0, -1)
        const parentToken = navigateToPath(root, parentSegments)

        if (isToken(parentToken)) {
            // Get explicit type or walk up to find inherited type
            inferredType =
                parentToken.$type ?? resolveInheritedType(root, parentSegments)
        }
    }

    return {
        value: target,
        type: inferredType,
    }
}

/**
 * Deep merge two objects for $extends resolution
 * Local properties override inherited properties at the same path
 */
function deepMerge(
    inherited: DesignTokenObject,
    local: DesignTokenObject
): DesignTokenObject {
    const result: Record<string, unknown> = {}

    // Start with all inherited properties
    for (const [key, value] of Object.entries(inherited)) {
        result[key] = value
    }

    // Override with local properties
    for (const [key, value] of Object.entries(local)) {
        if (key === "$extends") {
            // Don't copy $extends to the result
            continue
        }

        if (key.startsWith("$")) {
            // $ properties completely override
            result[key] = value
        } else if (
            isGroup(value) &&
            isGroup(result[key] as DesignTokenObject)
        ) {
            // Both are groups - merge recursively
            result[key] = deepMerge(
                result[key] as DesignTokenObject,
                value as DesignTokenObject
            )
        } else {
            // Complete replacement for tokens and other values
            result[key] = value
        }
    }

    return result
}

/**
 * Resolve a value that might contain references
 * Handles nested objects and arrays with references
 */
export function resolveValue(
    root: DesignTokenObject,
    value: unknown,
    visitedRefs: Set<string> = new Set()
): unknown {
    // Handle curly brace references
    if (isCurlyBraceReference(value)) {
        const result = resolveCurlyBraceReference(
            root,
            value,
            new Set(visitedRefs)
        )
        return result?.value
    }

    // Handle arrays (for composite types)
    if (Array.isArray(value)) {
        return value.map((item) => resolveValue(root, item, visitedRefs))
    }

    // Handle objects with $ref property
    if (hasRefProperty(value)) {
        const result = resolveJsonPointerReference(
            root,
            value.$ref,
            new Set(visitedRefs)
        )
        return result?.value
    }

    // Handle nested objects (for composite types)
    if (isPlainObject(value)) {
        const resolved: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(value)) {
            resolved[key] = resolveValue(root, val, visitedRefs)
        }
        return resolved
    }

    // Return primitive values as-is
    return value
}

/**
 * Resolve all references in a design token object
 *
 * This function walks through a design token object and resolves all references,
 * replacing them with their actual values. This makes the tokens ready for
 * type inheritance and validation.
 *
 * @param obj - The design token object to process (can be a root object, group, or token)
 * @param root - The root object for resolving references (defaults to obj)
 * @returns A new object with all references resolved
 *
 * @example
 * ```typescript
 * const input = {
 *   colors: {
 *     blue: {
 *       $type: 'color',
 *       $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8] }
 *     }
 *   },
 *   semantic: {
 *     primary: {
 *       $value: '{colors.blue}'
 *     }
 *   }
 * };
 *
 * const output = resolveReferences(input);
 * // output.semantic.primary.$value now contains the actual color object
 * // output.semantic.primary.$type is 'color' (copied from referenced token)
 * ```
 */
export function resolveReferences(
    obj: DesignTokenObject,
    root?: DesignTokenObject,
    visitedExtends: Set<string> = new Set(),
    currentPath: string = ""
): DesignTokenObject {
    if (!obj || typeof obj !== "object") {
        return obj
    }

    // Use the provided root, or use obj as root for top-level calls
    const resolveRoot = root || obj

    // Check if this group has $extends
    const extendsRef = (obj as Group).$extends
    let workingObj = obj

    if (extendsRef) {
        // Detect circular reference
        if (visitedExtends.has(currentPath)) {
            throw new Error(
                `Circular $extends reference detected at path: ${currentPath}`
            )
        }

        // Mark current path as visited
        const newVisited = new Set(visitedExtends)
        newVisited.add(currentPath)

        // Parse the reference
        let targetPath: string[]
        if (typeof extendsRef === "string") {
            if (extendsRef.startsWith("{") && extendsRef.endsWith("}")) {
                targetPath = parseCurlyBraceReference(extendsRef)
            } else if (extendsRef.startsWith("#")) {
                targetPath = parseJsonPointer(extendsRef)
            } else {
                throw new Error(
                    `Invalid $extends reference format: ${extendsRef}`
                )
            }
        } else if (typeof extendsRef === "object" && "$ref" in extendsRef) {
            targetPath = parseJsonPointer((extendsRef as any).$ref)
        } else {
            throw new Error(`Invalid $extends reference: ${extendsRef}`)
        }

        // Find the target group
        const targetGroup = navigateToPath(resolveRoot, targetPath)

        if (!targetGroup) {
            throw new Error(
                `$extends reference "${extendsRef}" could not be resolved at path: ${currentPath}`
            )
        }

        if (!isGroup(targetGroup)) {
            throw new Error(
                `$extends reference "${extendsRef}" points to a token, not a group at path: ${currentPath}`
            )
        }

        // Resolve $extends in the target group first (for chained extends)
        const resolvedTarget = resolveReferences(
            targetGroup,
            resolveRoot,
            newVisited,
            targetPath.join(".")
        )

        // Deep merge: inherited properties + local overrides
        workingObj = deepMerge(resolvedTarget, obj)
    }

    // Create a new object to avoid mutations
    const processed: Record<string, unknown> = {}

    // Process each property
    for (const [key, value] of Object.entries(workingObj)) {
        if (
            key.startsWith("$") &&
            key !== "$value" &&
            key !== "$ref" &&
            key !== "$extends"
        ) {
            // Copy all $ properties as-is (except $value, $ref, and $extends which we handle specially)
            processed[key] = value
        } else if (isToken(value)) {
            // This is a token - resolve its references
            const token: Token = { ...value }

            try {
                // Validate that token doesn't have both $ref and $value
                if (
                    isJsonPointerReference(token) &&
                    token.$value !== undefined
                ) {
                    throw new Error(
                        `Token "${key}" has both $ref and $value properties. These are mutually exclusive.`
                    )
                }

                // Handle $ref property (JSON Pointer reference)
                if (isJsonPointerReference(token)) {
                    const result = resolveJsonPointerReference(
                        resolveRoot,
                        token.$ref as string
                    )

                    if (result) {
                        token.$value = result.value
                        // Copy type from referenced token if not already set
                        if (!token.$type && result.type) {
                            token.$type = result.type
                        }
                    }

                    // Remove $ref after resolving
                    delete token.$ref
                }
                // Handle curly brace reference in $value
                else if (isCurlyBraceReference(token.$value)) {
                    const result = resolveCurlyBraceReference(
                        resolveRoot,
                        token.$value as string
                    )

                    if (result) {
                        token.$value = result.value
                        // Copy type from referenced token if not already set
                        if (!token.$type && result.type) {
                            token.$type = result.type
                        }
                    }
                }
                // Handle nested references in composite values
                else if (
                    token.$value !== null &&
                    typeof token.$value === "object"
                ) {
                    token.$value = resolveValue(resolveRoot, token.$value)
                }
            } catch (error) {
                if (error instanceof Error) {
                    throw new Error(
                        `Error resolving references in token "${key}": ${error.message}`
                    )
                }
                throw error
            }

            processed[key] = token
        } else if (isGroup(value)) {
            // This is a group - process recursively
            const nestedPath = currentPath ? `${currentPath}.${key}` : key
            processed[key] = resolveReferences(
                value,
                resolveRoot,
                new Set(), // Reset visited extends for nested groups
                nestedPath
            )
        } else {
            // Other values (primitives, etc.) - copy as-is
            processed[key] = value
        }
    }

    return processed
}

/**
 * Default export
 */
export default {
    resolveReferences,
    resolveCurlyBraceReference,
    resolveJsonPointerReference,
    resolveValue,
    isCurlyBraceReference,
    isJsonPointerReference,
    isToken,
    isGroup,
    parseCurlyBraceReference,
    parseJsonPointer,
    navigateToPath,
}
