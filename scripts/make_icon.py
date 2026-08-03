# -*- coding: utf-8 -*-
"""LEXICA アイコン生成 v2: 藍のグラデ地に剣と単語カード、金彩のきらめき。
   透過角丸をやめ全面塗り(iOSのapple-touch-iconで四隅が黒くならない)。"""
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 512


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def bg_layer():
    """全面: 藍→深藍の斜めグラデ+左上のやわらかい光"""
    img = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(img)
    top, bottom = (108, 124, 255), (36, 42, 110)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(top, bottom, y / S) + (255,))
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-180, -180, 320, 320], fill=(255, 255, 255, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    img.alpha_composite(glow)
    return img


def one_sword():
    """縦向きの剣1本(あとで±45°回転して交差させる)"""
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = S / 2
    tip, guard_y, pom_y = 2, 386, 494
    bw = 27  # 刃の半幅
    d.polygon([(cx - bw, 96), (cx, tip), (cx + bw, 96), (cx + bw, guard_y), (cx - bw, guard_y)],
              fill=(228, 234, 248, 255))
    d.polygon([(cx - bw, 96), (cx, tip), (cx, guard_y)], fill=(196, 206, 230, 255))  # 陰面
    d.line([(cx, 48), (cx, guard_y - 6)], fill=(255, 255, 255, 230), width=5)
    d.rounded_rectangle([cx - 78, guard_y, cx + 78, guard_y + 26], radius=13, fill=(245, 185, 66, 255))
    d.rounded_rectangle([cx - 15, guard_y + 24, cx + 15, pom_y - 22], radius=12, fill=(58, 47, 96, 255))
    d.ellipse([cx - 24, pom_y - 34, cx + 24, pom_y + 14], fill=(245, 185, 66, 255))
    return layer


def sword_layer():
    """カードの後ろに交差する2本の剣"""
    sw = one_sword()
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.alpha_composite(sw.rotate(45, resample=Image.BICUBIC, center=(S / 2, S / 2)))
    layer.alpha_composite(sw.rotate(-45, resample=Image.BICUBIC, center=(S / 2, S / 2)))
    # 落ち影
    sh = layer.split()[3].point(lambda a: a * 0.45)
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow.paste((20, 24, 60, 160), (10, 14), sh)
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.alpha_composite(shadow)
    out.alpha_composite(layer)
    return out


def card_layer():
    """主役の単語カード: 白地+金縁+L"""
    pad = 60
    cw, ch = 252, 322
    card = Image.new("RGBA", (cw + pad * 2, ch + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    # 落ち影
    d.rounded_rectangle([pad + 10, pad + 18, pad + cw + 10, pad + ch + 18], radius=34,
                        fill=(20, 24, 60, 130))
    card = card.filter(ImageFilter.GaussianBlur(9))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([pad, pad, pad + cw, pad + ch], radius=34, fill=(246, 248, 253, 255),
                        outline=(245, 185, 66, 255), width=11)
    d.rounded_rectangle([pad + 20, pad + 20, pad + cw - 20, pad + ch - 20], radius=20,
                        outline=(214, 222, 240, 255), width=3)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/georgiab.ttf", 190)
    except OSError:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 180)
    d.text((pad + cw / 2, pad + ch / 2 - 26), "L", font=font, fill=(76, 88, 220, 255), anchor="mm")
    # 辞書の項目らしい2本線
    d.rounded_rectangle([pad + 52, pad + ch - 76, pad + cw - 52, pad + ch - 64], radius=6,
                        fill=(200, 209, 232, 255))
    d.rounded_rectangle([pad + 72, pad + ch - 52, pad + cw - 72, pad + ch - 42], radius=5,
                        fill=(214, 222, 240, 255))
    card = card.rotate(-8, resample=Image.BICUBIC, expand=True)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.alpha_composite(card, (int(S / 2 - card.width / 2), int(S / 2 - card.height / 2) + 6))
    return layer


def sparkle(d, cx, cy, r, fill):
    """4条のきらめき"""
    w = r * 0.24
    d.polygon([(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
               (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)], fill=fill)


img = bg_layer()
img.alpha_composite(sword_layer())
img.alpha_composite(card_layer())
d = ImageDraw.Draw(img)
sparkle(d, 462, 244, 36, (255, 220, 120, 255))
sparkle(d, 430, 322, 17, (255, 232, 160, 220))
sparkle(d, 52, 210, 26, (200, 210, 255, 235))
sparkle(d, 92, 142, 14, (210, 220, 255, 200))

img.convert("RGB").save("icon-512.png")
img.resize((192, 192), Image.LANCZOS).convert("RGB").save("icon-192.png")
print("icons written")
