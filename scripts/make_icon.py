# -*- coding: utf-8 -*-
"""LEXICA アイコン生成 v3: アプリと同じSoft UI(白×青ニューモーフィズム)。
   #E8EDF5の地に、浮き出た単語カード(白影+青灰影)と藍の「L」、金のきらめき。"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 512
BG = (232, 237, 245)        # --bg
CARD = (244, 247, 252)      # --card2
SH_D = (136, 152, 184)      # --shd
INK = (91, 108, 255)        # --accent2
GOLD = (222, 154, 14)       # --accent
LINE = (211, 220, 236)      # --line


def soft_shadow(base, box, radius, offset, blur, color):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([box[0] + offset[0], box[1] + offset[1],
                         box[2] + offset[0], box[3] + offset[1]], radius=radius, fill=color)
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


img = Image.new("RGBA", (S, S), BG + (255,))

# 浮き出たカード: 左上=白ハイライト / 右下=青灰シャドウ(Soft UIの2レシピ)
card_box = (92, 86, 420, 426)
soft_shadow(img, card_box, 84, (-22, -22), 28, (255, 255, 255, 250))
soft_shadow(img, card_box, 84, (22, 26), 34, SH_D + (95,))

d = ImageDraw.Draw(img)
d.rounded_rectangle(card_box, radius=84, fill=CARD + (255,))
# ごく薄い内枠(カードらしさ)
d.rounded_rectangle([card_box[0] + 20, card_box[1] + 20, card_box[2] - 20, card_box[3] - 20],
                    radius=64, outline=LINE + (170,), width=3)

# 藍の「L」(レキシカのレターマーク)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", 220)
except OSError:
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 210)
cx = (card_box[0] + card_box[2]) / 2
cy = (card_box[1] + card_box[3]) / 2
d.text((cx, cy - 24), "L", font=font, fill=INK + (255,), anchor="mm")

# 窪んだピル(辞書の項目線・アプリのinsetモチーフ)
py = card_box[3] - 74
d.rounded_rectangle([cx - 84, py, cx + 84, py + 16], radius=8, fill=(221, 228, 239, 255))
d.rounded_rectangle([cx - 84, py + 10, cx + 84, py + 16], radius=8, fill=(250, 252, 255, 255))
d.rounded_rectangle([cx - 84, py, cx + 84, py + 14], radius=8, fill=(221, 228, 239, 255))

# 金のきらめき(4条)を右上に1つだけ ─ ラベリング最小限・アクセントは一点
def sparkle(cx_, cy_, r, fill):
    w = r * 0.26
    d.polygon([(cx_, cy_ - r), (cx_ + w, cy_ - w), (cx_ + r, cy_), (cx_ + w, cy_ + w),
               (cx_, cy_ + r), (cx_ - w, cy_ + w), (cx_ - r, cy_), (cx_ - w, cy_ - w)], fill=fill)

sparkle(400, 122, 40, GOLD + (255,))
sparkle(438, 178, 16, (240, 190, 80, 220))

img.convert("RGB").save("icon-512.png")
img.resize((192, 192), Image.LANCZOS).convert("RGB").save("icon-192.png")
print("icons written")
