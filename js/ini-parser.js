/**
 * INI file parser for Star Citizen's global.ini format.
 * Handles UTF-8-SIG (BOM) encoding and key=value pairs.
 */

const BOM = '\uFEFF';

/**
 * Parse a global.ini file into a Map of key-value pairs.
 * @param {string} text - Raw file text content
 * @returns {Map<string, string>} Parsed key-value pairs
 */
function parseIni(text) {
    const entries = new Map();

    // Strip BOM if present
    if (text.startsWith(BOM)) {
        text = text.slice(1);
    }

    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.substring(0, eqIndex);
        const value = trimmed.substring(eqIndex + 1);
        entries.set(key, value);
    }

    return entries;
}

/**
 * Serialize a Map of key-value pairs back to global.ini format.
 * Output is sorted by key with UTF-8-SIG BOM prefix.
 * @param {Map<string, string>} entries - Key-value pairs to serialize
 * @returns {string} Serialized INI content with BOM
 */
function serializeIni(entries) {
    const sortedKeys = [...entries.keys()].sort();
    const lines = sortedKeys.map(key => `${key}=${entries.get(key)}`);
    return BOM + lines.join('\n') + '\n';
}

/**
 * Read a File object and return its text content.
 * @param {File} file - File object from input element
 * @returns {Promise<string>} File text content
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
        reader.readAsText(file);
    });
}

/**
 * Trigger a browser download of the merged INI file.
 * @param {string} content - File content to download
 * @param {string} filename - Suggested filename
 */
function downloadIni(content, filename = 'global.ini') {
    // Encode as UTF-8 with BOM
    const encoder = new TextEncoder();
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    // Remove the JS BOM char if present, we'll add the real byte BOM
    const textWithoutBom = content.startsWith(BOM) ? content.slice(1) : content;
    const encoded = encoder.encode(textWithoutBom);

    const blob = new Blob([bom, encoded], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export { parseIni, serializeIni, readFileAsText, downloadIni, BOM };
