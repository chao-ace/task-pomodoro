import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const isProduction = process.argv.includes("production");

const buildOptions = {
	entryPoints: ["./src/main.ts"],
	bundle: true,
	external: [
			"obsidian",
			"@codemirror/autocomplete",
			"@codemirror/collab",
			"@codemirror/commands",
			"@codemirror/language",
			"@codemirror/lint",
			"@codemirror/search",
			"@codemirror/state",
			"@codemirror/view",
			"@lezer/common",
			"@lezer/highlight",
			"@lezer/lr",
			...builtins
		],
	format: "cjs",
	treeShaking: true,
	outfile: "main.js",
	minify: isProduction,
	sourcemap: !isProduction ? "inline" : false,
	define: {
		"process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
	},
};

if (isProduction) {
	esbuild.build(buildOptions).catch(() => process.exit(1));
} else {
	esbuild
		.context(buildOptions)
		.then((context) => {
			console.log("Watching for changes...");
			context.watch();
		})
		.catch(() => process.exit(1));
}
