
# BibTeX Cleaner

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22902740.svg)]
(https://doi.org/10.5281/zenodo.22902740)

A **VS Code** extension that analyzes LaTeX projects to **find unused BibTeX references** and lets you **comment them out or delete them** safely.

## Install

<!-- Install BibTeX Cleaner from the [Visual Studio Code Marketplace](URL) or [Open VSX Registry](URL). -->

Install BibTeX Cleaner from the [Open VSX Registry](https://open-vsx.org/extension/loumarco/bibtex-cleaner).
If you use VSCodium or another Open VSX-compatible editor, you can install the extension directly from its Extensions view.


## Why BibTeX Cleaner?

Large LaTeX projects often accumulate bibliography entries that are no longer cited. Manually identifying them can be tedious, especially when citations are distributed across multiple `.tex` files.

BibTeX Cleaner analyzes the project structure and identifies bibliography entries that are not referenced by the document, allowing users to review and safely comment or remove them.

## What it does

- Automatically detects the project's main `.tex` file (or uses the one you configure).
- Follows all `\input{}` / `\include{}` includes to find every TeX file in the project.
- Extracts cited references from the most common citation commands (`\cite`, `\citep`, `\citet`, `\textcite`, `\footcite`, etc.).
- Compares those citations against the entries in the `.bib` file to compute which ones are **unused**.
- Lets you select which references you want to act on.
- Comments or deletes the selected references, creating a **backup** first.

## Usage

1. Open the LaTeX project folder in VS Code.
2. Open a `.bib` file.
3. Click the **BibTeX Cleaner** icon (book icon) in the editor title bar, or run the `BibTeX Cleaner` command from the command palette.

Then:

1. The project is analyzed and the **unused references** are shown in a multi-select list (you can pick them one by one or use "Select all unused references").
2. Choose an action:
   - **Comment selected** — wraps the entries in `@comment{...}`.
   - **Delete selected** — removes the entries entirely.
   - **Comment all unused** / **Delete all unused** — applies the operation to all unused references.
3. Confirm the operation in the modal dialog.
4. Before modifying the file, a backup with the `.bak` extension is created next to the `.bib`.

## How it analyzes the project

### Main `.tex` file

The main file is determined in this order:

1. The path configured in `bibtexCleaner.mainFile` (if it exists).
2. `main.tex` or `thesis.tex` in the workspace root.
3. Any `.tex` in the root that contains `\documentclass`.

### Included `.tex` files

All files imported with `\input{...}` or `\include{...}` are explored recursively (omitting the `.tex` extension is supported). LaTeX comments (`%`) are ignored during the analysis.

### Recognized citation commands

`\cite`, `\citep`, `\citet`, `\citealp`, `\citealt`, `\citeauthor`, `\citeyear`, `\parencite`, `\textcite`, `\autocite`, `\footcite`, `\smartcite` and `\supercite`, plus `\nocite{...}`.

> **Note:** if the document contains `\nocite{*}`, all references are considered used and the extension will not make any changes.

### `.bib` file

The `.bib` file is chosen in this order:

1. The path configured in `bibtexCleaner.bibFile` (if it exists).
2. The currently open `.bib` file.
3. If there is a single `.bib` in the root, it is used automatically.
4. If there are several, you are asked to pick one.

The parser handles nested braces `{}`, parentheses `()`, quoted strings and escape sequences. The `@comment`, `@string` and `@preamble` directives are not treated as entries.

## Configuration

| Setting                  | Type   | Description                                                        |
| ------------------------ | ------ | ------------------------------------------------------------------ |
| `bibtexCleaner.mainFile` | string | Main LaTeX file (optional). Leave empty for auto-detection.        |
| `bibtexCleaner.bibFile`  | string | BibTeX file (optional). Leave empty to use the open `.bib`.        |

## Safety

- A `.bak` copy of the `.bib` file is created automatically before any modification.
- Operations require **explicit confirmation** in a modal dialog showing the affected references.
- When **commenting**, entries are preserved wrapped in `@comment{...}` and can be restored manually.


## Limitations

BibTeX Cleaner does not compile the LaTeX project. Instead, it analyzes the source files and identifies bibliography entries referenced by recognized citation commands.

Complex or custom citation commands not included in the supported list
may require manual verification.


## License

MIT — see the [LICENSE](./LICENSE) file.