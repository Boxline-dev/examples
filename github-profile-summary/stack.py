"""Runs in the session's shell: clones each repository in REPOS (comma-separated https URLs, shallow) and measures what
it is really made of: lines of code per language (by file type), frameworks and libraries from its manifest files,
and tools (CI, containers, infrastructure). Writes /workspace/stack.json."""
import json
import os
import re
import subprocess
from collections import Counter
from pathlib import Path

LANG = {
    ".py": "Python", ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
    ".cjs": "JavaScript", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".rb": "Ruby", ".php": "PHP", ".c": "C",
    ".h": "C", ".cc": "C++", ".cpp": "C++", ".hpp": "C++", ".cs": "C#", ".swift": "Swift", ".m": "Objective-C", ".scala": "Scala",
    ".sh": "Shell", ".html": "HTML", ".css": "CSS", ".scss": "CSS", ".vue": "Vue", ".svelte": "Svelte", ".dart": "Dart",
    ".ex": "Elixir", ".exs": "Elixir", ".lua": "Lua", ".r": "R", ".jl": "Julia", ".zig": "Zig", ".sql": "SQL",
}
# Libraries worth naming when a manifest lists them (the rest are counted, not named).
KNOWN = {
    "react", "next", "vue", "nuxt", "svelte", "@sveltejs/kit", "angular", "@angular/core", "express", "fastify", "koa", "nestjs",
    "@nestjs/core", "electron", "vite", "webpack", "jest", "vitest", "mocha", "playwright", "@playwright/test", "puppeteer",
    "tailwindcss", "prisma", "typeorm", "django", "flask", "fastapi", "pandas", "numpy", "torch", "tensorflow", "scikit-learn",
    "pytest", "requests", "sqlalchemy", "pydantic", "rails", "sinatra", "rspec", "laravel/framework", "symfony/symfony",
    "spring-boot", "gin-gonic/gin", "gorilla/mux", "tokio", "serde", "actix-web", "axum", "clap",
}
SKIP = {".git", "node_modules", "vendor", "dist", "build", ".venv", "venv", "__pycache__", "target"}


def files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP]
        for f in filenames:
            yield Path(dirpath) / f


def deps(path):
    name, text = path.name, path.read_text(errors="ignore")
    if name == "package.json":
        try:
            j = json.loads(text)
            return [*j.get("dependencies", {}), *j.get("devDependencies", {})]
        except ValueError:
            return []
    if name in ("requirements.txt", "requirements-dev.txt"):
        return [re.split(r"[<>=~!\[ ;]", line.strip())[0].lower() for line in text.splitlines() if line.strip() and not line.startswith(("#", "-"))]
    if name == "pyproject.toml":
        return [m.lower() for m in re.findall(r'^\s*"?([A-Za-z0-9_.-]+)\s*[<>=~!"\[]', text, re.M)]
    if name == "go.mod":
        return [m.split("/", 1)[1] if m.startswith("github.com/") else m for m in re.findall(r"^\s*(?:require\s+)?([\w.\-/]+)\s+v\d", text, re.M)]
    if name == "Cargo.toml":
        block = text.split("[dependencies]", 1)[1].split("\n[", 1)[0] if "[dependencies]" in text else ""
        return re.findall(r"^\s*([A-Za-z0-9_-]+)\s*=", block, re.M)
    if name == "Gemfile":
        return re.findall(r"""^\s*gem\s+['"]([^'"]+)""", text, re.M)
    if name == "composer.json":
        try:
            return list(json.loads(text).get("require", {}))
        except ValueError:
            return []
    return []


repos = []
for url in [u.strip() for u in os.environ.get("REPOS", "").split(",") if u.strip()]:
    name = url.rstrip("/").split("/")[-1].removesuffix(".git")
    dest = Path("/workspace/repos") / name
    r = subprocess.run(["git", "clone", "--depth", "1", "--quiet", url, str(dest)], capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        repos.append({"url": url, "name": name, "error": r.stderr.strip()[-300:]})
        continue
    lines, libs, tools, manifests = Counter(), set(), set(), []
    for f in files(dest):
        rel = f.relative_to(dest)
        lang = LANG.get(f.suffix.lower())
        if lang and f.stat().st_size < 2_000_000:
            lines[lang] += sum(1 for line in f.open(errors="ignore") if line.strip())
        if f.name in ("package.json", "requirements.txt", "requirements-dev.txt", "pyproject.toml", "go.mod", "Cargo.toml", "Gemfile", "composer.json") and "node_modules" not in rel.parts:
            manifests.append(str(rel))
            libs |= {d for d in deps(f) if d.lower() in KNOWN}
        if rel.parts[:2] == (".github", "workflows"):
            tools.add("GitHub Actions")
        if f.name in ("Dockerfile", "docker-compose.yml", "compose.yaml"):
            tools.add("Docker")
        if f.suffix == ".tf":
            tools.add("Terraform")
        if f.name == "Makefile":
            tools.add("Make")
    repos.append({"url": url, "name": name, "linesByLanguage": dict(lines.most_common()), "frameworks": sorted(libs), "tools": sorted(tools), "manifests": manifests})

total = Counter()
for r in repos:
    total.update(r.get("linesByLanguage", {}))
json.dump({"repos": repos, "linesByLanguage": dict(total.most_common())}, open("/workspace/stack.json", "w"), indent=1)
for r in repos:
    print(f"{r['name']}: {r.get('error') or ', '.join(f'{k} {v}' for k, v in list(r['linesByLanguage'].items())[:4]) or 'no code files'}")
