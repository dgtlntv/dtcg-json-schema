# DTCG JSON schema

This repository implements the DTCG technical report as a JSON schema that can be used for validating design token json files and design token resolver files.
The main schema for validating design token files is `schemas/format/format.json` and the main schema for validating design token resolver files is `schemas/resolver/resolver.json`.

## Limitations

-   Type inheritance validation
    -   JSON Schema cannot properly validate `$value` content when `$type` is inherited from parent groups. (Would need preprocessing)
-   Token reference validation
    -   JSON Schema cannot follow or validate token references (curly brace syntax), `$ref` (JSON Pointer) or `$extends` to verify they resolve to valid tokens of the correct type. (Would need preprocessing)

## Deviations from spec

-   Color component count
    -   The schema requires exactly 3 components for all color values, though the specification states "the number of components depends on the color space."
-   $schema property
    -   Added $schema as an allowed property so this schema can be easily linked
-   Version string in resolver spec
    -   Require `2025.10`as the version string in the resolver spec instead of the `2025-11-01`or `2025-10-01` mentioned in the spec because it seems that is what is going to be its proper form. See: https://github.com/design-tokens/community-group/pull/352

## Assumptions

-   The root of a design token file is a group and therefore has the same properties. See: https://github.com/design-tokens/community-group/issues/249

## Usage

-   `npm run build`: Compiles TypeScript files.
-   `npm test`: Runs all tests.
-   `npm run test:format-validation`: Runs format validation tests.
-   `npm run test:resolver-validation`: Runs resolver validation tests.
-   `npm run compile:format`: Compiles the format schema to check for errors.
-   `npm run compile:resolver`: Compiles the resolver schema to check for errors.
-   `npm run validate:format`: Validates a JSON file against the format schema. Usage: `npm run validate:format <path-to-json-file>`
-   `npm run validate:resolver`: Validates a JSON file against the resolver schema. Usage: `npm run validate:resolver <path-to-json-file>`
