import Logo from "@/components/Logo";
import { List, Section, Table } from "../RefParts";
import "../ref.css";

const fileRows = [
  [
    "app/_editorData/browserEditorStorage.js",
    "Client-side localStorage mirror for editable data on deployed/public domains.",
  ],
  [
    "app/_editorData/projectFileWrites.js",
    "Server-side guard for project-file writes. Vercel and W3_DISABLE_FILE_WRITES block file writes.",
  ],
  [
    "data/editor",
    "Local development editable data root for wallets, coins, cookie/off settings, and defi entries.",
  ],
];

const modeRows = [
  [
    "local dev",
    "Local/private hosts write to data/editor files when project file writes are allowed.",
  ],
  [
    "deployed/public",
    "Vercel and normal public domains use localStorage because the deployed project filesystem is read-only.",
  ],
  [
    "same shape",
    "localStorage keys mimic data/editor paths so wallet, coin, cookie, and defi flows can share the same structure.",
  ],
];

const browserStorageRows = [
  [
    "host detection",
    "localhost, .local, .ts.net, private IPs, and Tailscale 100.x addresses are treated as local editor hosts.",
  ],
  [
    "editor files",
    "Stores editable .json, .txt, and .js files using data/editor-style relative paths.",
  ],
  [
    "storage event",
    "localEditorStorageEvent tells wallet, navbar, editor, and trade UI to reload local editable data.",
  ],
  [
    "nav favorites",
    "Navbar favorite links also use this storage layer on deployed/public domains.",
  ],
];

const projectWriteRows = [
  [
    "projectFileWritesDisabled",
    "Returns true on Vercel or when W3_DISABLE_FILE_WRITES is set.",
  ],
  [
    "assertProjectFileWrites",
    "Throws before a server action attempts to write local project files on read-only deployments.",
  ],
  [
    "projectFileWriteBlockedResult",
    "Returns a consistent blocked-write response for wallet, coin, chain, and editor actions.",
  ],
];

const editorDataFolders = [
  ["coins", "custom coin JSON entries staged by add coin or discovery flows"],
  ["wallets", "wallet address JSON files and folders"],
  ["cookie", "server/localStorage off-chain, off-coin, and off-address settings"],
  ["defi", "editable DeFi metadata such as Hyperliquid vaults"],
];

const notes = [
  "The underscore folder marks this as private app support code, not a route.",
  "These files are not generic helpers, so they live under app/_editorData rather than fn.",
  "Clear data in the settings card deletes data/editor locally or the equivalent localStorage editor files remotely.",
  "Cookies and localStorage are separate. Clearing browser cookies does not clear editor data.",
  "The /editor page is one UI for these files, but wallet, trade, navbar, and settings also use the same storage layer.",
];

function EditorDataRefPage() {
  return (
    <div className="refPage">
      <Logo page="ref" />
      <h1 className="refTitle">Editor data storage</h1>
      <p className="refIntro">
        How editable app data switches between local project files and
        deployed-browser localStorage.
      </p>

      <Section title="files">
        <Table rows={fileRows} />
      </Section>

      <Section title="runtime mode">
        <Table rows={modeRows} />
      </Section>

      <Section title="browser storage">
        <Table rows={browserStorageRows} />
      </Section>

      <Section title="project writes">
        <Table rows={projectWriteRows} />
      </Section>

      <Section title="data/editor folders">
        <Table rows={editorDataFolders} />
      </Section>

      <Section title="notes">
        <List items={notes} />
      </Section>
    </div>
  );
}

export default EditorDataRefPage;
