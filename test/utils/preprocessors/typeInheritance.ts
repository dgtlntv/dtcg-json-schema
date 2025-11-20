/**
 * Design Token $type Inheritance Preprocessor
 *
 * This module provides functionality to process design token objects and add
 * explicit $type properties to tokens that inherit their type from parent groups.
 *
 * According to the DTCG specification, tokens inherit $type from their closest
 * parent group if they don't have an explicit $type property.
 */

import type { DesignTokenObject, Group } from "./types.js"
import { isGroup, isToken } from "./utils.js"

/**
 * Process design tokens recursively, adding inherited $type properties
 *
 * This function walks through a design token object and adds explicit $type
 * properties to tokens that would otherwise inherit their type from parent groups.
 * This makes the tokens ready for JSON Schema validation which cannot validate
 * based on types set on parent objects.
 *
 * @param obj - The design token object to process (can be a root object, group, or token)
 * @param inheritedType - The $type inherited from parent groups (internal use)
 * @returns A new object with explicit $type on all tokens
 *
 * @example
 * ```typescript
 * const input = {
 *   colors: {
 *     $type: 'color',
 *     primary: {
 *       $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8] }
 *     }
 *   }
 * };
 *
 * const output = processTypeInheritance(input);
 * // output.colors.primary now has explicit $type: 'color'
 * ```
 */
export function processTypeInheritance(
    obj: DesignTokenObject,
    inheritedType: string | null = null
): DesignTokenObject {
    if (!obj || typeof obj !== "object") {
        return obj
    }

    // Create a new object to avoid mutations
    const processed: Record<string, unknown> = {}

    // Check if this object defines a $type at this level
    const currentType = (obj as Group).$type || inheritedType

    // Process each property
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith("$")) {
            // Copy all $ properties as-is
            processed[key] = value
        } else if (isToken(value)) {
            // This is a token - add inherited $type if not already present
            const token = { ...value }

            if (!token.$type && currentType) {
                // Add the inherited type
                token.$type = currentType
            } else if (!token.$type && !currentType) {
                // Token has no type and no inherited type - this is invalid
                throw new Error(
                    `Token "${key}" has no $type and no inherited type from parent groups`
                )
            }

            processed[key] = token
        } else if (isGroup(value)) {
            // This is a group - process recursively with current type context
            processed[key] = processTypeInheritance(value, currentType)
        } else {
            // Other values (primitives, etc.) - copy as-is
            processed[key] = value
        }
    }

    return processed
}

/**
 * Alias for processTypeInheritance for convenience
 */
export const addTypeInheritance = processTypeInheritance

/**
 * Default export
 */
export default {
    processTypeInheritance,
    addTypeInheritance,
}
