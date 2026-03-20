from __future__ import annotations

import argparse
import json
import shutil
import zipfile
from pathlib import Path


def load_presets(presets_path: Path) -> dict:
    if not presets_path.exists():
        return {}
    return json.loads(presets_path.read_text(encoding="utf-8"))


def iter_model_asset_paths(presets: dict, models: set[str] | None = None):
    for model, spec in presets.items():
        if models and model.lower() not in models:
            continue
        for link_name, link in (spec.get("links") or {}).items():
            mesh_path = link.get("mesh_path")
            fallback_path = link.get("fallback_mesh_path")
            if mesh_path:
                yield model, link_name, mesh_path
            if fallback_path:
                yield model, link_name, fallback_path


def verify_assets(dest: Path, presets_path: Path, models: set[str] | None = None) -> int:
    presets = load_presets(presets_path)
    if not presets:
        print(f"No presets found at: {presets_path}")
        return 0

    missing: list[tuple[str, str, str]] = []
    checked = 0
    for model, link_name, rel_path in iter_model_asset_paths(presets, models):
        checked += 1
        path = dest / rel_path
        if not path.exists():
            missing.append((model, link_name, rel_path))

    print(f"Verified asset references: {checked}")
    if not missing:
        print("All preset mesh references are available.")
        return 0

    print("Missing asset files:")
    for model, link_name, rel_path in missing:
        print(f"  - {model} / {link_name}: {rel_path}")
    return 1


def extract_assets(zip_path: Path, dest: Path, wanted: set[str] | None) -> None:
    with zipfile.ZipFile(zip_path) as bundle:
        for info in bundle.infolist():
            name = info.filename
            if not name or name.endswith('/'):
                continue
            if wanted and name.startswith('meshes/'):
                parts = Path(name).parts
                if len(parts) >= 2 and parts[1].lower() not in wanted:
                    continue
            target = dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(info) as src, target.open('wb') as dst:
                shutil.copyfileobj(src, dst)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract UR mesh assets from meshes.zip into robot_assets/ and verify model coverage.")
    parser.add_argument("--zip", dest="zip_path", default="meshes.zip")
    parser.add_argument("--dest", dest="dest", default="robot_assets")
    parser.add_argument("--models", nargs="*", default=None, help="Optional model list, e.g. ur20 ur30 ur10e")
    parser.add_argument(
        "--presets",
        dest="presets",
        default=str(Path(__file__).resolve().parents[1] / "frontend" / "assets" / "ur_mesh_presets.json"),
        help="Path to ur_mesh_presets.json used by the web twin",
    )
    parser.add_argument("--check-only", action="store_true", help="Only verify assets, do not extract")
    args = parser.parse_args()

    wanted = {m.lower() for m in args.models} if args.models else None
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)

    if not args.check_only:
        zip_path = Path(args.zip_path)
        if not zip_path.exists():
            raise SystemExit(f"Asset bundle not found: {zip_path}")
        extract_assets(zip_path, dest, wanted)
        print(f"Installed assets into: {dest.resolve()}")

    presets_path = Path(args.presets)
    return verify_assets(dest, presets_path, wanted)


if __name__ == '__main__':
    raise SystemExit(main())
