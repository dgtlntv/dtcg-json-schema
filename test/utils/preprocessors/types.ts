/**
 * Shared type definitions for design token preprocessors
 */

/**
 * A design token object with either $value or $ref
 */
export interface Token {
    $value?: unknown
    $ref?: string
    $type?: string
    [key: string]: unknown
}

/**
 * A design token group object
 */
export interface Group {
    $type?: string
    $description?: string
    $extensions?: Record<string, unknown>
    $deprecated?: boolean | string
    $extends?: string
    [key: string]: unknown
}

/**
 * Generic design token object (can be a token or group)
 */
export type DesignTokenObject = Token | Group | Record<string, unknown>

/**
 * Result of a reference resolution
 */
export interface ResolveResult {
    value: unknown
    type?: string
}

/**
 * An object with a $ref property for JSON Pointer references
 */
export interface RefObject {
    $ref: string
    [key: string]: unknown
}

/**
 * Type guard to check if an object has a $ref property
 */
export function hasRefProperty(obj: unknown): obj is RefObject {
    return (
        obj !== null &&
        typeof obj === "object" &&
        "$ref" in obj &&
        typeof (obj as Record<string, unknown>).$ref === "string"
    )
}
