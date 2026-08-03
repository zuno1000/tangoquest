# -*- coding: utf-8 -*-
"""LEXICA アイコン生成 v4: todaybgm と同系のジオメトリック・ミニマリズム。

白〜ごく淡いクールグレーのグラデ地に、青バイオレットのグラデーションで
描いたセリフ体の「L」を1つ置くだけ。陰影(ニューモーフィズムの影)は使わない。
アクセントは金のきらめき1点のみ。フル塗り(角丸なし)=iOSが自動で角丸マスク。
スーパーサンプリング(2048→512)でエッジを滑らかに。
"""
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

SS = 2048          # スーパーサンプリング解像度
K = SS / 512       # 512グリッド → SS への倍率

BG_TOP = (255, 255, 255)      # #FFFFFF
BG_BOTTOM = (242, 245, 250)   # #F2F5FA
GLYPH_TOP = (107, 123, 255)   # #6B7BFF
GLYPH_BOTTOM = (67, 83, 232)  # #4353E8
SHADOW = (67, 83, 232)        # 足元のごく薄い青の落ち影(todaybgmと同レシピ)
GOLD_TOP = (255, 196, 87)     # 金のきらめき(上→下)
GOLD_BOTTOM = (222, 154, 14)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        d.line([(0, y), (size, y)], fill=lerp(top, bottom, y / (size - 1)))
    return img


def text_mask():
    """セリフ体「L」のマスク(maskableセーフゾーン=中央80%に収める)"""
    mask = Image.new("L", (SS, SS), 0)
    d = ImageDraw.Draw(mask)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", round(400 * K))
    except OSError:
        font = ImageFont.truetype("C:/Windows/Fonts/timesbd.ttf", round(400 * K))
    d.text((252 * K, 268 * K), "L", font=font, fill=255, anchor="mm")
    return mask


def sparkle_mask():
    """4条のきらめき(Lの右上に1点だけ)"""
    mask = Image.new("L", (SS, SS), 0)
    d = ImageDraw.Draw(mask)
    def spark(cx, cy, r):
        w = r * 0.26
        d.polygon([(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
                   (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)],
                  fill=255)
    spark(352 * K, 138 * K, 42 * K)
    spark(396 * K, 190 * K, 17 * K)
    return mask


img = vertical_gradient(SS, BG_TOP, BG_BOTTOM).convert("RGBA")
lmask = text_mask()

# 足元にわずかな青の落ち影(浮遊感。立体の陰影ではなく平面的な一枚影)
shadow = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
tint = Image.new("RGBA", (SS, SS), SHADOW + (46,))
shadow.paste(tint, (0, round(10 * K)), lmask)
shadow = shadow.filter(ImageFilter.GaussianBlur(round(14 * K)))
img = Image.alpha_composite(img, shadow)

# グリフ本体(縦グラデをマスク越しに)
img.paste(vertical_gradient(SS, GLYPH_TOP, GLYPH_BOTTOM).convert("RGBA"), (0, 0), lmask)
img.paste(vertical_gradient(SS, GOLD_TOP, GOLD_BOTTOM).convert("RGBA"), (0, 0), sparkle_mask())

img = img.convert("RGB")
for size in (512, 192):
    img.resize((size, size), Image.LANCZOS).save(f"icon-{size}.png", "PNG")
print("icons written")
