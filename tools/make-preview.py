"""生成插件详情页的预览图（640×300，无文字）。

把 sprite.png 以 base64 内嵌：这张螃蟹是作者自己的资产，允许随包分发。
画面：一只螃蟹站在软垫上，旁边浮着记忆卡、日记本和一轮小月亮，
配上几道声波弧——把「记忆 / 日记做梦 / 会说话」三件事一眼讲清楚。

不需要任何字体：全部几何图形，深浅色主题下都清晰。
输出：docs/preview.svg
"""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(r"D:\Code\dsh-yyz-kaka")
SPRITE = ROOT / "sprite.png"
OUT = ROOT / "docs" / "preview.svg"

CORAL = "#E4573C"
DEEP = "#2E2A28"
CREAM = "#F7EFE6"
SAGE = "#7C9A8E"
MOON = "#F4E3B2"


def b64_png(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    sprite = b64_png(SPRITE)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300" viewBox="0 0 640 300" role="img" aria-label="一只红色小螃蟹，旁边浮着记忆卡、日记本、月亮和声波">
  <defs>
    <radialGradient id="kaka-glow" cx="30%" cy="45%" r="70%">
      <stop offset="0%" stop-color="{CORAL}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="{CORAL}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="kaka-card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{CREAM}" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="{CREAM}" stop-opacity="0.86"/>
    </linearGradient>
    <linearGradient id="kaka-stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{DEEP}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="{DEEP}" stop-opacity="0.06"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="640" height="300" fill="none"/>
  <ellipse cx="200" cy="140" rx="200" ry="150" fill="url(#kaka-glow)"/>

  <!-- 落脚的石台 -->
  <ellipse cx="190" cy="246" rx="126" ry="22" fill="url(#kaka-stone)"/>

  <!-- 螃蟹本体（内嵌位图） -->
  <image x="86" y="98" width="200" height="200" href="data:image/png;base64,{sprite}"/>

  <!-- 声波 -->
  <g fill="none" stroke="{CORAL}" stroke-linecap="round">
    <path d="M 292 168 q 18 -14 36 0" stroke-width="5" opacity="0.85"/>
    <path d="M 300 190 q 26 -22 52 0" stroke-width="4" opacity="0.55"/>
    <path d="M 308 212 q 34 -30 68 0" stroke-width="3" opacity="0.30"/>
  </g>

  <!-- 记忆卡 -->
  <g transform="translate(392 84)">
    <rect x="0" y="0" width="120" height="76" rx="14" fill="url(#kaka-card)" stroke="{DEEP}" stroke-opacity="0.12"/>
    <rect x="14" y="16" width="22" height="16" rx="4" fill="{CORAL}" opacity="0.85"/>
    <rect x="14" y="40" width="60" height="6" rx="3" fill="{DEEP}" opacity="0.22"/>
    <rect x="14" y="52" width="44" height="6" rx="3" fill="{DEEP}" opacity="0.16"/>
    <rect x="86" y="16" width="20" height="40" rx="6" fill="{SAGE}" opacity="0.55"/>
  </g>

  <!-- 日记本 -->
  <g transform="translate(408 182)">
    <rect x="0" y="0" width="108" height="72" rx="12" fill="url(#kaka-card)" stroke="{DEEP}" stroke-opacity="0.12"/>
    <rect x="0" y="0" width="14" height="72" rx="12" fill="{SAGE}" opacity="0.45"/>
    <rect x="26" y="18" width="66" height="5" rx="2.5" fill="{DEEP}" opacity="0.22"/>
    <rect x="26" y="32" width="52" height="5" rx="2.5" fill="{DEEP}" opacity="0.16"/>
    <rect x="26" y="46" width="60" height="5" rx="2.5" fill="{DEEP}" opacity="0.12"/>
  </g>

  <!-- 月亮与梦 -->
  <g transform="translate(522 74)">
    <circle cx="0" cy="0" r="26" fill="{MOON}"/>
    <circle cx="12" cy="-7" r="24" fill="#F7EFE6" opacity="0.92"/>
    <circle cx="20" cy="26" r="3" fill="{SAGE}" opacity="0.7"/>
    <circle cx="32" cy="34" r="2.2" fill="{SAGE}" opacity="0.55"/>
    <circle cx="42" cy="40" r="1.6" fill="{SAGE}" opacity="0.4"/>
  </g>

  <!-- 虚线：三件事连到螃蟹 -->
  <g fill="none" stroke="{DEEP}" stroke-opacity="0.18" stroke-dasharray="4 7" stroke-width="1.6">
    <path d="M 296 132 q 40 -10 88 -12"/>
    <path d="M 300 216 q 44 6 100 -6"/>
    <path d="M 300 150 q 90 -56 196 -58"/>
  </g>
</svg>
'''
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(svg, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
