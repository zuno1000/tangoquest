# -*- coding: utf-8 -*-
"""TangoQuest アイコン生成: 単語カード+剣+星(ダークファンタジー基調)"""
import math
from PIL import Image, ImageDraw, ImageFont

S = 512

def rounded_gradient_bg():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    grad = Image.new("RGBA", (S, S))
    top, bottom = (44, 50, 92), (18, 20, 31)
    for y in range(S):
        t = y / S
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(S):
            grad.putpixel((x, y), c)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=100, fill=255)
    img.paste(grad, (0, 0), mask)
    return img

def card_layer():
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = 150, 120, 372, 420
    d.rounded_rectangle([x0, y0, x1, y1], radius=28, fill=(233, 236, 248, 255),
                        outline=(245, 185, 66, 255), width=10)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 170)
    except OSError:
        font = ImageFont.load_default()
    d.text(((x0 + x1) / 2, (y0 + y1) / 2 + 8), "A", font=font,
           fill=(79, 70, 229, 255), anchor="mm")
    return layer.rotate(-10, resample=Image.BICUBIC, center=(S / 2, S / 2))

def star(d, cx, cy, r, fill):
    pts = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * 0.45
        a = -math.pi / 2 + i * math.pi / 5
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=fill)

img = rounded_gradient_bg()
img.alpha_composite(card_layer())
d = ImageDraw.Draw(img)
star(d, 390, 130, 58, (245, 185, 66, 255))
star(d, 128, 400, 34, (108, 123, 255, 255))

img.save("icon-512.png")
img.resize((192, 192), Image.LANCZOS).save("icon-192.png")
print("icons written")
