/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    // src/lib/tokens.ts reads tokens.css with ?raw; Vitest blanks CSS unless told otherwise.
    css: { include: [/tokens\.css/] },
  },
});
