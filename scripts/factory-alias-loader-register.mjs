// Registers the "@/..." alias resolve hook for the full-run driver.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./factory-alias-loader.mjs', pathToFileURL('./scripts/'));
