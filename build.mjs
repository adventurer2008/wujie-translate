import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const folder = new URL('./dist/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url)));
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
if (manifest.id !== pkg.name || manifest.version !== pkg.version) throw new Error('Manifest/package mismatch');
const destination = new URL(manifest.id + '/', folder);
await mkdir(destination, { recursive: true });
const { outputFiles } = await build({
	entryPoints: [fileURLToPath(new URL('./src/main.cjs', import.meta.url))],
	bundle: true,
	format: 'cjs',
	platform: 'browser',
	target: 'es2022',
	external: ['obsidian', '@codemirror/view'],
	write: false,
});
await writeFile(new URL('main.js', destination), outputFiles[0].contents);
for (const name of ['manifest.json', 'styles.css', 'LICENSE'])
	await cp(new URL('./' + name, import.meta.url), new URL(name, destination));
const files = ['main.js', 'manifest.json', 'styles.css'];
const lines = await Promise.all(files.map(async name =>
	createHash('sha256').update(await readFile(new URL(name, destination))).digest('hex') + '  ' + name));
await writeFile(new URL('SHA256SUMS', folder), lines.join('\n') + '\n');
