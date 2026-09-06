// ESLint 9 flat config. `eslint-config-next` only ships legacy `.eslintrc`-style
// configs (`next/core-web-vitals`), so we bridge them into flat config via
// `@eslint/eslintrc`'s FlatCompat — the same pattern `create-next-app` generates
// for Next.js 15 projects on ESLint 9. Previously there was no eslint.config.* file
// at all, so `pnpm lint` / `eslint .` failed immediately with "couldn't find a
// configuration file" before linting a single file.
import { FlatCompat } from "@eslint/eslintrc"
import { dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "prisma/migrations/**",
      "next-env.d.ts",
    ],
  },
]

export default eslintConfig
