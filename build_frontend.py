#!/usr/bin/env python3
"""
DocuMind - Frontend Build & Backend Static Asset Sync
Compiles the Next.js frontend into a static export and synchronizes
the output into backend/public/ for single-service deployment.
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def main():
    root_dir = Path(__file__).resolve().parent
    frontend_dir = root_dir / "frontend"
    backend_dir = root_dir / "backend"
    out_dir = frontend_dir / "out"
    public_dir = backend_dir / "public"

    if not frontend_dir.is_dir():
        print(f"Error: frontend directory not found at {frontend_dir}", file=sys.stderr)
        sys.exit(1)

    print("=== Step 1: Installing frontend dependencies (npm ci) ===")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    if not shutil.which(npm_cmd):
        npm_cmd = "npm"

    # Attempt npm ci first, with fallback to legacy-peer-deps
    ci_cmd = [npm_cmd, "ci"]
    try:
        subprocess.run(ci_cmd, cwd=str(frontend_dir), check=True, shell=(sys.platform == "win32"))
    except subprocess.CalledProcessError:
        print("[WARN] 'npm ci' failed. Retrying with --legacy-peer-deps...", file=sys.stderr)
        try:
            subprocess.run([npm_cmd, "ci", "--legacy-peer-deps"], cwd=str(frontend_dir), check=True, shell=(sys.platform == "win32"))
        except subprocess.CalledProcessError:
            print("[WARN] 'npm ci --legacy-peer-deps' failed. Retrying with 'npm install --legacy-peer-deps'...", file=sys.stderr)
            subprocess.run([npm_cmd, "install", "--legacy-peer-deps"], cwd=str(frontend_dir), check=True, shell=(sys.platform == "win32"))

    print("\n=== Step 2: Building static frontend (npm run build) ===")
    subprocess.run([npm_cmd, "run", "build"], cwd=str(frontend_dir), check=True, shell=(sys.platform == "win32"))

    index_html = out_dir / "index.html"
    if not index_html.is_file():
        print(f"FATAL: Build output missing expected file: {index_html}", file=sys.stderr)
        sys.exit(1)

    print("\n=== Step 3: Copying export to backend/public/ ===")
    if public_dir.exists():
        shutil.rmtree(public_dir)

    shutil.copytree(out_dir, public_dir)

    # Count files copied
    file_count = sum(len(files) for _, _, files in os.walk(public_dir))

    print(f"\nSUCCESS: Frontend built and exported! Copied {file_count} files into {public_dir}")

if __name__ == "__main__":
    main()
