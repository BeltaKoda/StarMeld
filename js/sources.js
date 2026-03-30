/**
 * Pre-populated GitHub source definitions for StarMeld.
 * Each source points to a raw.githubusercontent.com URL for a global.ini file.
 */

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

const STOCK_SOURCE = {
    id: 'stock-beltakoda',
    name: 'Stock global.ini',
    description: 'Vanilla unmodified global.ini from the current LIVE patch',
    repo: 'BeltaKoda/ScCompLangPackRemix',
    branch: 'main',
    path: 'LIVE/stock-global.ini',
    get url() {
        return `${GITHUB_RAW_BASE}/${this.repo}/${this.branch}/${this.path}`;
    },
    defaultEnabled: true
};

const LANGUAGE_PACK_SOURCES = [
    {
        id: 'beltakoda-remix',
        name: 'BeltaKoda Remix',
        description: 'Ship component names with Type/Size/Grade prefixes (e.g., M2A QuadraCell MT)',
        repo: 'BeltaKoda/ScCompLangPackRemix',
        branch: 'main',
        path: 'LIVE/data/Localization/english/global.ini',
        get url() {
            return `${GITHUB_RAW_BASE}/${this.repo}/${this.branch}/${this.path}`;
        },
        defaultEnabled: false
    },
    {
        id: 'exoae-original',
        name: 'ExoAE ScCompLangPack',
        description: 'Original component naming pack with size/grade info',
        repo: 'ExoAE/ScCompLangPack',
        branch: 'main',
        path: 'ScCompLangPack/data/Localization/english/global.ini',
        get url() {
            return `${GITHUB_RAW_BASE}/${this.repo}/${this.branch}/${this.path}`;
        },
        defaultEnabled: false
    },
    {
        id: 'exoae-remix2',
        name: 'ExoAE Remix2',
        description: 'ExoAE\'s alternative remix variant for component naming',
        repo: 'ExoAE/ScCompLangPack',
        branch: 'main',
        path: 'ScCompLangPackRemix2/data/Localization/english/global.ini',
        get url() {
            return `${GITHUB_RAW_BASE}/${this.repo}/${this.branch}/${this.path}`;
        },
        defaultEnabled: false
    },
    {
        id: 'mrkraken-starstrings',
        name: 'MrKraken StarStrings',
        description: 'Mission text, blueprint pools, commodity fixes, and UI overflow corrections',
        repo: 'MrKraken/SCLocalizationMergeTool',
        branch: 'master',
        path: 'src/global.ini',
        get url() {
            return `${GITHUB_RAW_BASE}/${this.repo}/${this.branch}/${this.path}`;
        },
        defaultEnabled: false
    }
];

export { STOCK_SOURCE, LANGUAGE_PACK_SOURCES, GITHUB_RAW_BASE };
