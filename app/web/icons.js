/* File icons for the explorer: one per file type, VS Code style. Each is a 16 x 16 SVG: a pictogram for media,
   keys, data and config, or a coloured language badge for code. Folders are tinted by their name. */
"use strict";

const FI_SVG = {
  folder: '<path d="M1.5 4.2a1.2 1.2 0 0 1 1.2-1.2h3.4l1.5 1.6h5.7a1.2 1.2 0 0 1 1.2 1.2v6.5a1.2 1.2 0 0 1-1.2 1.2H2.7a1.2 1.2 0 0 1-1.2-1.2z" fill="currentColor" fill-opacity=".9"/>',
  folderOpen: '<path d="M1.5 4.2a1.2 1.2 0 0 1 1.2-1.2h3.4l1.5 1.6h5a1.2 1.2 0 0 1 1.2 1.2v1H4.6a1.3 1.3 0 0 0-1.2.8L1.5 11.8z" fill="currentColor" fill-opacity=".55"/><path d="M3.3 7.6a1 1 0 0 1 .95-.7h10.3a.7.7 0 0 1 .66.92l-1.6 4.9a1 1 0 0 1-.95.68H1.9z" fill="currentColor" fill-opacity=".95"/>',
  image: '<rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="currentColor" fill-opacity=".18" stroke="currentColor"/><circle cx="5.5" cy="6" r="1.3" fill="currentColor"/><path d="m2.5 12.5 3.8-3.8 2.4 2.4 1.8-1.8 3 3" stroke="currentColor" fill="none" stroke-width="1.2" stroke-linejoin="round"/>',
  video: '<rect x="1.5" y="3" width="13" height="10" rx="2" fill="currentColor" fill-opacity=".18" stroke="currentColor"/><path d="M6.5 5.8v4.4L10.3 8z" fill="currentColor"/>',
  audio: '<path d="M6 11.5V3.8l7-1.3v7.4" stroke="currentColor" fill="none" stroke-width="1.3"/><circle cx="4.4" cy="11.6" r="1.9" fill="currentColor"/><circle cx="11.4" cy="10" r="1.9" fill="currentColor"/>',
  archive: '<rect x="2.5" y="1.5" width="11" height="13" rx="1.8" fill="currentColor" fill-opacity=".18" stroke="currentColor"/><path d="M8 1.5v2M8 4.5v1.5M8 7v1.5" stroke="currentColor" stroke-width="1.4"/><rect x="6.6" y="9" width="2.8" height="3" rx=".6" fill="currentColor"/>',
  pdf: '<path d="M3 1.5h6.5L13 5v9.5H3z" fill="currentColor" fill-opacity=".18" stroke="currentColor"/><text x="8" y="12" text-anchor="middle" font-size="4.6" font-weight="800" fill="currentColor" font-family="sans-serif">PDF</text>',
  db: '<ellipse cx="8" cy="3.8" rx="5.2" ry="2" fill="currentColor"/><path d="M2.8 3.8v8.2c0 1.1 2.3 2 5.2 2s5.2-.9 5.2-2V3.8" fill="currentColor" fill-opacity=".25" stroke="currentColor"/><path d="M2.8 8c0 1.1 2.3 2 5.2 2s5.2-.9 5.2-2" fill="none" stroke="currentColor"/>',
  key: '<circle cx="5.5" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8.7 8h5.6M12.2 8v2.4M14.3 8v1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  lock: '<rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" fill-opacity=".3" stroke="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  gear: '<circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  docker: '<path d="M1.5 8.2h11.6c.6 0 1.2-.5 1.6-1 .3 1-.4 2.2-1.2 2.4-.9 2.6-3.5 4-6.6 4-3.6 0-5.2-2.5-5.4-5.4z" fill="currentColor"/><path d="M3.4 5.4h2v2h-2zM5.8 5.4h2v2h-2zM8.2 5.4h2v2h-2zM5.8 3h2v2h-2z" fill="currentColor" fill-opacity=".7"/>',
  git: '<circle cx="4.5" cy="3.8" r="1.6" fill="currentColor"/><circle cx="4.5" cy="12.2" r="1.6" fill="currentColor"/><circle cx="11.5" cy="6.2" r="1.6" fill="currentColor"/><path d="M4.5 5.4v5.2M11.5 7.8c0 2.6-7 1.4-7 3" stroke="currentColor" fill="none" stroke-width="1.3"/>',
  term: '<rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="currentColor" fill-opacity=".14" stroke="currentColor"/><path d="m4.3 6.2 2.2 1.8-2.2 1.8M8 10.5h3.6" stroke="currentColor" fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  text: '<path d="M3 1.5h6.5L13 5v9.5H3z" fill="currentColor" fill-opacity=".12" stroke="currentColor"/><path d="M5.2 7.5h5.6M5.2 9.7h5.6M5.2 11.9h3.6" stroke="currentColor" stroke-width="1.1"/>',
  readme: '<path d="M2 3c2.2-.8 4.3-.6 6 .8 1.7-1.4 3.8-1.6 6-.8v10.2c-2.2-.8-4.3-.6-6 .8-1.7-1.4-3.8-1.6-6-.8z" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-linejoin="round"/><path d="M8 3.8v10.2" stroke="currentColor"/>',
  license: '<path d="M8 2v11.5M4 13.5h8M2.5 5.5h11M4.2 5.5 2.4 9.6h3.6zM11.8 5.5 10 9.6h3.6z" stroke="currentColor" fill="none" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="2.5" r="1" fill="currentColor"/>',
  font: '<text x="8" y="12.2" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor" font-family="Georgia,serif">Aa</text>',
  sheet: '<rect x="2" y="2" width="12" height="12" rx="1.8" fill="currentColor" fill-opacity=".18" stroke="currentColor"/><path d="M2 6h12M2 10h12M6.5 2v12" stroke="currentColor"/>',
  cert: '<rect x="1.5" y="3" width="13" height="8.5" rx="1.5" fill="currentColor" fill-opacity=".18" stroke="currentColor"/><circle cx="10.8" cy="10.8" r="2.2" fill="currentColor"/><path d="M4 6h5M4 8.2h3.5" stroke="currentColor"/>',
  binary: '<text x="8" y="7" text-anchor="middle" font-size="5" font-weight="700" fill="currentColor" font-family="monospace">01</text><text x="8" y="13" text-anchor="middle" font-size="5" font-weight="700" fill="currentColor" font-family="monospace">10</text>',
  npm: '<rect x="1.5" y="4" width="13" height="8" rx="1" fill="currentColor"/><text x="8" y="10.4" text-anchor="middle" font-size="5" font-weight="800" fill="#0F1013" font-family="sans-serif">npm</text>',
  python: '<path d="M7.9 1.5c-3.4 0-3.2 1.5-3.2 1.5v1.6h3.3v.5H3.4S1.5 4.9 1.5 8.3s1.7 3.3 1.7 3.3h1v-1.6s0-1.7 1.7-1.7h3.3s1.6 0 1.6-1.6V3.1s.3-1.6-2.9-1.6z" fill="#4C8BD6"/><path d="M8.1 14.5c3.4 0 3.2-1.5 3.2-1.5v-1.6H8v-.5h4.6s1.9.2 1.9-3.2-1.7-3.3-1.7-3.3h-1v1.6s0 1.7-1.7 1.7H6.8s-1.6 0-1.6 1.6v3.6s-.3 1.6 2.9 1.6z" fill="#F2C94C"/><circle cx="5.9" cy="3" r=".6" fill="#0F1013"/><circle cx="10.1" cy="13" r=".6" fill="#0F1013"/>',
};
// code badges: [label, colour]
const FI_BADGE = {
  js: ["JS", "#F2D24C"], mjs: ["JS", "#F2D24C"], cjs: ["JS", "#F2D24C"], jsx: ["JSX", "#61DAFB"], ts: ["TS", "#4C8BF5"], tsx: ["TSX", "#4C8BF5"],
  json: ["{}", "#E8C66A"], jsonc: ["{}", "#E8C66A"], md: ["M↓", "#9DB4FF"], markdown: ["M↓", "#9DB4FF"], html: ["<>", "#F07A4A"], htm: ["<>", "#F07A4A"],
  css: ["#", "#5AA9F0"], scss: ["#", "#E06C9F"], less: ["#", "#6A8CD0"], yml: ["Y", "#C27BF0"], yaml: ["Y", "#C27BF0"], toml: ["T", "#B8A08A"],
  sql: ["SQL", "#E8A44A"], go: ["GO", "#5AC8E0"], rs: ["RS", "#E07A4A"], c: ["C", "#7FA6D8"], h: ["H", "#A08BD8"], cpp: ["C++", "#5A8BD8"], cc: ["C++", "#5A8BD8"],
  hpp: ["H+", "#A08BD8"], java: ["JV", "#E0844A"], kt: ["KT", "#A97BF0"], php: ["PHP", "#8A93D8"], rb: ["RB", "#E05A5A"], swift: ["SW", "#F07A4A"],
  cs: ["C#", "#7BC47F"], lua: ["LUA", "#5A7BD8"], r: ["R", "#5AA9E0"], vue: ["V", "#5AC88A"], svelte: ["S", "#F0643C"], xml: ["</>", "#E8A44A"],
  ini: ["INI", "#9A9DA4"], conf: ["CFG", "#9A9DA4"], cfg: ["CFG", "#9A9DA4"], diff: ["±", "#7BD6A3"], patch: ["±", "#7BD6A3"], ipynb: ["NB", "#F09A3C"],
  dart: ["DT", "#5AC8E0"], ex: ["EX", "#A97BF0"], zig: ["ZIG", "#F0A43C"], nix: ["NIX", "#7FA6D8"], tf: ["TF", "#A97BF0"], graphql: ["GQL", "#E05AA8"],
};
const FI_EXT = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", bmp: "image", ico: "image", svg: "image", heic: "image", jfif: "image",
  mp4: "video", mkv: "video", mov: "video", webm: "video", m4v: "video", avi: "video", ogv: "video",
  mp3: "audio", m4a: "audio", flac: "audio", wav: "audio", ogg: "audio", opus: "audio", aac: "audio",
  zip: "archive", tar: "archive", gz: "archive", tgz: "archive", xz: "archive", bz2: "archive", "7z": "archive", rar: "archive", zst: "archive", deb: "archive", iso: "archive",
  pdf: "pdf", db: "db", sqlite: "db", sqlite3: "db", "db-wal": "db", "db-shm": "db",
  pem: "key", key: "key", pub: "key", token: "key", gpg: "key", crt: "cert", cer: "cert", p12: "cert",
  lock: "lock", sh: "term", bash: "term", zsh: "term", fish: "term", ps1: "term", service: "gear", timer: "gear", env: "gear",
  txt: "text", log: "text", out: "text", ttf: "font", otf: "font", woff: "font", woff2: "font", csv: "sheet", tsv: "sheet", xlsx: "sheet", xls: "sheet",
  py: "python", pyc: "binary", so: "binary", bin: "binary", exe: "binary", o: "binary", wasm: "binary", gguf: "binary",
};
const FI_NAME = {
  dockerfile: "docker", "docker-compose.yml": "docker", "docker-compose.yaml": "docker", "compose.yml": "docker", "compose.yaml": "docker",
  ".dockerignore": "docker", ".gitignore": "git", ".gitattributes": "git", ".gitmodules": "git", "package.json": "npm", "package-lock.json": "npm",
  "requirements.txt": "python", "pyproject.toml": "python", makefile: "term", caddyfile: "gear", ".env": "gear", known_hosts: "key",
  authorized_keys: "key", host_key: "key", id_rsa: "key", id_ed25519: "key", license: "license", "license.md": "license", "license.txt": "license",
  readme: "readme", "readme.md": "readme", "readme.txt": "readme", ".bashrc": "term", ".profile": "term", ".zshrc": "term", "yarn.lock": "lock",
};
const FI_COLOR = { image: "#8FC9D6", video: "#C7A6FF", audio: "#F2B37C", archive: "#E8C66A", pdf: "#FF7A70", db: "#E3B1C8", key: "#E8C66A",
  lock: "#9A9DA4", gear: "#9A9DA4", docker: "#4CA6E8", git: "#F0643C", term: "#7BD6A3", text: "#9A9DA4", readme: "#9DB4FF", license: "#E8C66A",
  font: "#E3B1C8", sheet: "#7BD6A3", cert: "#E8C66A", binary: "#6C6F78", npm: "#E05A5A", python: "#4C8BD6" };
const FOLDER_COLOR = { src: "#7BD6A3", source: "#7BD6A3", lib: "#7BD6A3", app: "#9DB4FF", server: "#9DB4FF", api: "#9DB4FF", web: "#5AC8E0",
  public: "#5AC8E0", static: "#5AC8E0", assets: "#C7A6FF", images: "#C7A6FF", img: "#C7A6FF", media: "#C7A6FF", docs: "#9DB4FF", doc: "#9DB4FF",
  test: "#E8C66A", tests: "#E8C66A", __tests__: "#E8C66A", spec: "#E8C66A", node_modules: "#5C7A5C", ".git": "#F0643C", ".github": "#9A9DA4",
  dist: "#6C6F78", build: "#6C6F78", out: "#6C6F78", __pycache__: "#5C6470", ".venv": "#5C6470", venv: "#5C6470", data: "#E8A44A", config: "#9A9DA4",
  ".config": "#9A9DA4", scripts: "#7BD6A3", bin: "#7BD6A3", downloads: "#5AC8E0", music: "#F2B37C", videos: "#C7A6FF", pictures: "#8FC9D6",
  photos: "#8FC9D6", movies: "#C7A6FF", projects: "#FF8A52", artifacts: "#FF8A52", backups: "#E3B1C8", ".ssh": "#E8C66A", ".local": "#6C6F78", ".cache": "#5C6470" };

/* fileIcon(name, isDir, open) -> HTML for a 16 x 16 icon */
function fileIcon(name, isDir, open) {
  const n = String(name || "").toLowerCase();
  if (isDir) {
    const c = FOLDER_COLOR[n] || (n.startsWith(".") ? "#6C6F78" : "#E8A070");
    return `<span class="fico" style="color:${c}"><svg viewBox="0 0 16 16">${open ? FI_SVG.folderOpen : FI_SVG.folder}</svg></span>`;
  }
  const ext = n.includes(".") ? n.split(".").pop() : "";
  let kind = FI_NAME[n] || (n.startsWith("readme") ? "readme" : n.startsWith("license") ? "license" : n.startsWith(".env") ? "gear"
    : n.startsWith("dockerfile") ? "docker" : null) || FI_EXT[ext];
  if (!kind && FI_BADGE[ext]) {
    const [label, c] = FI_BADGE[ext];
    return `<span class="fico badge" style="--c:${c}"><b style="font-size:${label.length > 2 ? 6.2 : label.length > 1 ? 7.4 : 9}px">${label}</b></span>`;
  }
  kind = kind || "text";
  const svg = FI_SVG[kind] || FI_SVG.text;
  return `<span class="fico" style="color:${FI_COLOR[kind] || "#9A9DA4"}"><svg viewBox="0 0 16 16">${svg}</svg></span>`;
}
