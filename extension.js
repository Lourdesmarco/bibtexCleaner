
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");


/*
 * ============================================================
 * Configuration
 * ============================================================
 */

const CITE_COMMANDS = [
    "cite",
    "citep",
    "citet",
    "citealp",
    "citealt",
    "citeauthor",
    "citeyear",
    "parencite",
    "textcite",
    "autocite",
    "footcite",
    "smartcite",
    "supercite"
];


/*
 * ============================================================
 * File utilities
 * ============================================================
 */

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch {
        return fs.readFileSync(filePath, "latin1");
    }
}


function writeFile(filePath, text) {
    fs.writeFileSync(filePath, text, "utf8");
}


function removeLatexComments(text) {
    return text
        .split(/\r?\n/)
        .map(line => {

            const match = line.match(/(?<!\\)%/);

            if (match) {
                return line.substring(0, match.index);
            }

            return line;
        })
        .join("\n");
}


/*
 * ============================================================
 * Find main TEX file
 * ============================================================
 */

function findMainTex(root) {

    const config =
        vscode.workspace.getConfiguration(
            "bibtexCleaner"
        );

    const configured =
        config.get("mainFile");


    if (
        configured &&
        configured.trim() !== ""
    ) {

        const configuredPath =
            path.isAbsolute(configured)
                ? configured
                : path.join(root, configured);

        if (!fs.existsSync(configuredPath)) {
            throw new Error(
                `Configured main TEX file does not exist: ${configuredPath}`
            );
        }

        return configuredPath;
    }


    // Preferred filenames.
    const candidates = [
        "main.tex",
        "thesis.tex"
    ];


    for (const filename of candidates) {

        const filePath =
            path.join(root, filename);

        if (fs.existsSync(filePath)) {
            return filePath;
        }
    }


    // Look for a TEX file containing \documentclass.
    const texFiles =
        fs.readdirSync(root)
            .filter(file =>
                file.toLowerCase().endsWith(".tex")
            );


    for (const filename of texFiles) {

        const filePath =
            path.join(root, filename);

        const text =
            readFile(filePath);

        if (text.includes("\\documentclass")) {
            return filePath;
        }
    }


    throw new Error(
        "Could not find the main TEX file."
    );
}


/*
 * ============================================================
 * Find all TEX files referenced with \input / \include
 * ============================================================
 */

function findTexFiles(mainFile) {

    const found = new Set();
    const queue = [
        path.resolve(mainFile)
    ];


    while (queue.length > 0) {

        const texFile = queue.pop();

        if (found.has(texFile)) {
            continue;
        }

        if (!fs.existsSync(texFile)) {
            continue;
        }

        found.add(texFile);


        const text =
            removeLatexComments(
                readFile(texFile)
            );


        const pattern =
            /\\(?:input|include)\{([^}]+)\}/g;


        let match;

        while (
            (match = pattern.exec(text)) !== null
        ) {

            let included =
                match[1].trim();


            if (path.isAbsolute(included)) {
                continue;
            }


            let includedPath =
                path.resolve(
                    path.dirname(texFile),
                    included
                );


            // LaTeX allows omitting .tex.
            if (!path.extname(includedPath)) {
                includedPath += ".tex";
            }


            if (!found.has(includedPath)) {
                queue.push(includedPath);
            }
        }
    }


    return [...found];
}


/*
 * ============================================================
 * Extract citations
 * ============================================================
 */

function extractCitations(texFiles) {

    const citations = new Set();


    const escapedCommands =
        CITE_COMMANDS
            .map(command =>
                command.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                )
            )
            .join("|");


    const citationPattern =
        new RegExp(
            `\\\\(?:${escapedCommands})` +
            `(?:\\[[^\\]]*\\]){0,2}` +
            `\\{([^}]+)\\}`,
            "g"
        );


    const nocitePattern =
        /\\nocite(?:\[[^\]]*\])?\{([^}]+)\}/g;


    for (const texFile of texFiles) {

        const text =
            removeLatexComments(
                readFile(texFile)
            );


        let match;


        // Normal citation commands.
        while (
            (match = citationPattern.exec(text)) !== null
        ) {

            for (
                const key of match[1].split(",")
            ) {

                const trimmed =
                    key.trim();

                if (trimmed) {
                    citations.add(trimmed);
                }
            }
        }


        // \nocite
        while (
            (match = nocitePattern.exec(text)) !== null
        ) {

            const keys = match[1];


            // \nocite{*} means every reference is used.
            if (keys.includes("*")) {
                return null;
            }


            for (
                const key of keys.split(",")
            ) {

                const trimmed =
                    key.trim();

                if (trimmed) {
                    citations.add(trimmed);
                }
            }
        }
    }


    return citations;
}


/*
 * ============================================================
 * Parse BibTeX entries
 * ============================================================
 */

function findBibEntries(text) {

    const entries = [];


    const pattern =
        /^[ \t]*@([A-Za-z]+)\s*[\{\(]\s*([^,\s\{\(]+)/gm;


    let match;


    while (
        (match = pattern.exec(text)) !== null
    ) {

        const type =
            match[1].toLowerCase();

        const key =
            match[2].trim();


        // These are not bibliography entries.
        if (
            type === "comment" ||
            type === "string" ||
            type === "preamble"
        ) {
            continue;
        }


        /*
         * Find the opening { or (
         */
        let openingPos =
            match.index;


        while (
            openingPos < text.length &&
            text[openingPos] !== "{" &&
            text[openingPos] !== "("
        ) {
            openingPos++;
        }


        if (openingPos >= text.length) {
            continue;
        }


        const openingChar =
            text[openingPos];

        const closingChar =
            openingChar === "{"
                ? "}"
                : ")";


        let depth = 0;
        let inString = false;
        let escaped = false;
        let endPos = null;


        /*
         * Count brackets until the complete
         * BibTeX entry has been found.
         */
        for (
            let i = openingPos;
            i < text.length;
            i++
        ) {

            const char = text[i];


            if (escaped) {
                escaped = false;
                continue;
            }


            if (char === "\\") {
                escaped = true;
                continue;
            }


            if (char === '"') {
                inString = !inString;
                continue;
            }


            if (inString) {
                continue;
            }


            if (char === openingChar) {
                depth++;
            }
            else if (char === closingChar) {

                depth--;

                if (depth === 0) {
                    endPos = i + 1;
                    break;
                }
            }
        }


        if (endPos !== null) {

            entries.push({
                key,
                start: match.index,
                end: endPos
            });
        }
    }


    return entries;
}


/*
 * ============================================================
 * Comment a BibTeX entry
 * ============================================================
 */

function commentEntry(entry) {

    return (
        "@comment{\n" +
        entry +
        "\n}\n"
    );
}


/*
 * ============================================================
 * Find workspace
 * ============================================================
 */

function getWorkspaceRoot(document) {

    const workspaceFolder =
        vscode.workspace.getWorkspaceFolder(
            document.uri
        );


    if (!workspaceFolder) {

        throw new Error(
            "Please open a LaTeX project folder in VS Code."
        );
    }


    return workspaceFolder.uri.fsPath;
}


/*
 * ============================================================
 * Find BIB file
 * ============================================================
 */

async function findBibFile(
    root,
    currentDocument
) {

    const config =
        vscode.workspace.getConfiguration(
            "bibtexCleaner"
        );


    const configured =
        config.get("bibFile");


    if (
        configured &&
        configured.trim() !== ""
    ) {

        const configuredPath =
            path.isAbsolute(configured)
                ? configured
                : path.join(root, configured);


        if (!fs.existsSync(configuredPath)) {

            throw new Error(
                `Configured BIB file does not exist: ${configuredPath}`
            );
        }


        return configuredPath;
    }


    /*
     * If a .bib file is currently open,
     * use that file.
     */
    if (
        currentDocument &&
        currentDocument.fileName
            .toLowerCase()
            .endsWith(".bib")
    ) {

        return currentDocument.fileName;
    }


    /*
     * Otherwise search the workspace root.
     */
    const bibFiles =
        fs.readdirSync(root)
            .filter(file =>
                file.toLowerCase().endsWith(".bib")
            );


    if (bibFiles.length === 0) {

        throw new Error(
            "Could not find a .bib file."
        );
    }


    if (bibFiles.length === 1) {

        return path.join(
            root,
            bibFiles[0]
        );
    }


    /*
     * Multiple BIB files.
     * Ask the user which one to use.
     */
    const items =
        bibFiles.map(file => ({
            label: file,
            description:
                path.join(root, file)
        }));


    const selected =
        await vscode.window.showQuickPick(
            items,
            {
                title: "Select BibTeX file",
                placeHolder:
                    "Choose the bibliography file"
            }
        );


    if (!selected) {
        throw new Error(
            "No BIB file selected."
        );
    }


    return selected.description;
}


/*
 * ============================================================
 * Analyze project
 * ============================================================
 */

async function analyzeProject(document) {

    const root =
        getWorkspaceRoot(document);


    const mainFile =
        findMainTex(root);


    const texFiles =
        findTexFiles(mainFile);


    const usedKeys =
        extractCitations(texFiles);


    /*
     * \nocite{*}
     */
    if (usedKeys === null) {

        return {
            root,
            mainFile,
            texFiles,
            bibFile: null,
            bibText: null,
            entries: [],
            usedKeys: null,
            unusedKeys: []
        };
    }


    const bibFile =
        await findBibFile(
            root,
            document
        );


    const bibText =
        readFile(bibFile);


    const entries =
        findBibEntries(bibText);


    const bibKeys =
        new Set(
            entries.map(entry =>
                entry.key
            )
        );


    const unusedKeys =
        [...bibKeys]
            .filter(key =>
                !usedKeys.has(key)
            );


    return {
        root,
        mainFile,
        texFiles,
        bibFile,
        bibText,
        entries,
        usedKeys,
        unusedKeys
    };
}


/*
 * ============================================================
 * Create backup
 * ============================================================
 */

function createBackup(bibFile) {

    const backup =
        bibFile + ".bak";


    fs.copyFileSync(
        bibFile,
        backup
    );


    return backup;
}


/*
 * ============================================================
 * Modify selected entries
 * ============================================================
 */

function modifyBibFile(
    result,
    selectedKeys,
    mode
) {

    const selectedSet =
        new Set(selectedKeys);


    let newText =
        result.bibText;


    /*
     * Work backwards so that the original
     * positions remain valid.
     */
    for (
        let i = result.entries.length - 1;
        i >= 0;
        i--
    ) {

        const entry =
            result.entries[i];


        if (
            !selectedSet.has(
                entry.key
            )
        ) {
            continue;
        }


        const original =
            result.bibText.substring(
                entry.start,
                entry.end
            );


        let replacement;


        if (mode === "comment") {

            replacement =
                commentEntry(original);

        }
        else if (mode === "delete") {

            replacement = "";

        }
        else {

            throw new Error(
                `Unknown operation: ${mode}`
            );
        }


        newText =
            newText.substring(
                0,
                entry.start
            ) +
            replacement +
            newText.substring(
                entry.end
            );
    }


    const backup =
        createBackup(
            result.bibFile
        );


    writeFile(
        result.bibFile,
        newText
    );


    return backup;
}


/*
 * ============================================================
 * Select unused references
 * ============================================================
 */

async function selectUnusedReferences(
    unusedKeys
) {

    const items = [
        {
            label:
                "$(check-all)  Select all unused references",
            description:
                `${unusedKeys.length} references`,
            key: "__SELECT_ALL__"
        },
        ...unusedKeys.map(key => ({
            label: key,
            description: "Unused reference",
            key
        }))
    ];


    const quickPick =
        vscode.window.createQuickPick();


    quickPick.title =
        "BibTeX Cleaner — Select unused references";


    quickPick.placeholder =
        "Select one or more references";


    quickPick.canSelectMany = true;


    quickPick.items =
        items.map(item => ({
            label: item.label,
            description: item.description,
            picked: false,
            key: item.key
        }));


    quickPick.ignoreFocusOut = true;


    const selected =
        await new Promise(resolve => {

            let finished = false;


            const finish = value => {

                if (finished) {
                    return;
                }

                finished = true;

                quickPick.hide();

                resolve(value);
            };


            quickPick.onDidAccept(() => {

                const selectedItems =
                    quickPick.selectedItems;


                /*
                 * "Select all" was selected.
                 */
                const selectAll =
                    selectedItems.some(
                        item =>
                            item.key === "__SELECT_ALL__"
                    );


                if (selectAll) {

                    finish(
                        [...unusedKeys]
                    );

                    return;
                }


                finish(
                    selectedItems.map(
                        item => item.key
                    )
                );
            });


            quickPick.onDidHide(() => {

                finish(null);
            });


            quickPick.show();
        });


    return selected;
}


/*
 * ============================================================
 * Choose operation
 * ============================================================
 */

async function chooseOperation(
    selectedCount,
    totalCount
) {

    const items = [
        {
            label:
                `$(comment-discussion)  Comment selected (${selectedCount})`,
            description:
                "Wrap selected entries in @comment{...}.",
            action: "comment-selected"
        },
        {
            label:
                `$(trash)  Delete selected (${selectedCount})`,
            description:
                "Remove the selected entries.",
            action: "delete-selected"
        },
        {
            label:
                `$(comment-discussion)  Comment all unused (${totalCount})`,
            description:
                "Comment every unused reference.",
            action: "comment-all"
        },
        {
            label:
                `$(trash)  Delete all unused (${totalCount})`,
            description:
                "Delete every unused reference.",
            action: "delete-all"
        }
    ];


    return vscode.window.showQuickPick(
        items,
        {
            title:
                "BibTeX Cleaner — Choose an action",
            placeHolder:
                "What would you like to do?"
        }
    );
}


/*
 * ============================================================
 * Confirmation
 * ============================================================
 */

async function confirmOperation(
    mode,
    keys
) {

    const count =
        keys.length;


    const operation =
        mode === "comment"
            ? "Comment"
            : "Delete";


    const details =
        keys.length <= 10
            ? keys.join(", ")
            : `${keys.slice(0, 10).join(", ")} and ${keys.length - 10} more`;


    const message =
        `${operation} ${count} unused reference(s)?`;


    const detail =
        mode === "comment"
            ? `The selected entries will be wrapped in @comment{...}.\n\n${details}\n\nA backup will be created first.`
            : `The selected entries will be permanently removed from the BIB file.\n\n${details}\n\nA backup will be created first.`;


    const button =
        operation;


    const result =
        await vscode.window.showWarningMessage(
            message,
            {
                modal: true,
                detail
            },
            button
        );


    return result === button;
}


/*
 * ============================================================
 * Main workflow
 * ============================================================
 */

async function runCleaner(document) {

    try {

        /*
         * Analyze the project.
         */
        const result =
            await analyzeProject(
                document
            );


        /*
         * Handle \nocite{*}.
         */
        if (result.usedKeys === null) {

            vscode.window.showInformationMessage(
                "BibTeX Cleaner: \\nocite{*} was found. All references are considered used."
            );

            return;
        }


        /*
         * No unused references.
         */
        if (
            result.unusedKeys.length === 0
        ) {

            vscode.window.showInformationMessage(
                "BibTeX Cleaner: no unused references found."
            );

            return;
        }


        /*
         * Let the user select references.
         */
        const selectedKeys =
            await selectUnusedReferences(
                result.unusedKeys
            );


        /*
         * User cancelled.
         */
        if (
            !selectedKeys ||
            selectedKeys.length === 0
        ) {
            return;
        }


        /*
         * Choose operation.
         */
        const operation =
            await chooseOperation(
                selectedKeys.length,
                result.unusedKeys.length
            );


        if (!operation) {
            return;
        }


        /*
         * Determine actual keys.
         */
        let keys;


        if (
            operation.action ===
            "comment-all" ||
            operation.action ===
            "delete-all"
        ) {

            keys =
                [...result.unusedKeys];

        }
        else {

            keys =
                [...selectedKeys];
        }


        /*
         * Determine operation mode.
         */
        const mode =
            operation.action
                .startsWith("comment")
                ? "comment"
                : "delete";


        /*
         * Confirm.
         */
        const confirmed =
            await confirmOperation(
                mode,
                keys
            );


        if (!confirmed) {
            return;
        }


        /*
         * Modify BIB.
         */
        const backup =
            modifyBibFile(
                result,
                keys,
                mode
            );


        /*
         * Refresh the currently opened editor.
         */
        const activeEditor =
            vscode.window.activeTextEditor;


        if (
            activeEditor &&
            activeEditor.document.fileName ===
                result.bibFile
        ) {

            await activeEditor.document.save();
        }


        /*
         * Final notification.
         */
        const actionText =
            mode === "comment"
                ? "Commented"
                : "Deleted";


        vscode.window.showInformationMessage(
            `${actionText} ${keys.length} reference(s). Backup created: ${path.basename(backup)}`
        );

    }
    catch (error) {

        vscode.window.showErrorMessage(
            `BibTeX Cleaner: ${error.message}`
        );
    }
}


/*
 * ============================================================
 * Extension activation
 * ============================================================
 */

function activate(context) {

    const command =
        vscode.commands.registerCommand(
            "bibtexCleaner.menu",
            async () => {

                const editor =
                    vscode.window.activeTextEditor;


                if (!editor) {

                    vscode.window.showErrorMessage(
                        "BibTeX Cleaner: no active editor."
                    );

                    return;
                }


                if (
                    !editor.document.fileName
                        .toLowerCase()
                        .endsWith(".bib")
                ) {

                    vscode.window.showErrorMessage(
                        "BibTeX Cleaner: please open a .bib file."
                    );

                    return;
                }


                await runCleaner(
                    editor.document
                );
            }
        );


    context.subscriptions.push(
        command
    );
}


function deactivate() {}


module.exports = {
    activate,
    deactivate
};

