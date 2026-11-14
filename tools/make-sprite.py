"""把 AgentHub 的螃蟹图标整理成宠物精灵图。

做三件事：
  1. 只保留与主体相连的像素（去掉周围散落的小圆点装饰）；
  2. 裁到内容包围盒，再补成正方形并留一点呼吸边距；
  3. 顺手把描边加粗半像素（80px 显示时更清楚）。

输出：sprite.png（200×200 以内的正方形 RGBA）
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter

SRC = Path(r"D:\Code\AgentHubSolution\Depends\Templates\res\icon_crab.png")
DST = Path(r"D:\Code\dsh-yyz-kaka\sprite.png")


def main() -> None:
    image = Image.open(SRC).convert("RGBA")
    alpha = image.getchannel("A")

    # 1) 连通域：只保留最大的那块（螃蟹本体），其余是装饰点
    width, height = image.size
    pixels = alpha.load()
    visited = [[False] * width for _ in range(height)]
    best: list[tuple[int, int]] = []

    for y in range(height):
        for x in range(width):
            if visited[y][x] or pixels[x, y] < 16:
                continue
            stack = [(x, y)]
            visited[y][x] = True
            current: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                current.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < width and 0 <= ny < height and not visited[ny][nx] and pixels[nx, ny] >= 16:
                        visited[ny][nx] = True
                        stack.append((nx, ny))
            if len(current) > len(best):
                best = current

    keep = Image.new("L", (width, height), 0)
    keep_pixels = keep.load()
    for x, y in best:
        keep_pixels[x, y] = 255

    # 略微膨胀，避免把与主体贴着的细节割掉
    keep = keep.filter(ImageFilter.MaxFilter(5))
    cleaned = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cleaned.paste(image, (0, 0), keep)

    # 2) 裁到内容包围盒
    bbox = cleaned.getbbox()
    if not bbox:
        raise SystemExit("没有找到主体像素")
    cropped = cleaned.crop(bbox)
    cw, ch = cropped.size

    side = max(cw, ch)
    padding = int(side * 0.06)
    canvas_side = side + padding * 2
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    canvas.paste(cropped, ((canvas_side - cw) // 2, (canvas_side - ch) // 2), cropped)

    # 3) 描边加粗：把 alpha 做一点点膨胀后与原图合成（视觉上更结实）
    alpha_boost = canvas.getchannel("A").filter(ImageFilter.MaxFilter(3))
    canvas.putalpha(Image.eval(alpha_boost, lambda v: v))

    canvas.save(DST, "PNG", optimize=True)
    print(f"wrote {DST} ({canvas.size[0]}x{canvas.size[1]}, {DST.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
