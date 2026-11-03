# Minimal qora/oq icon (1024x1024). Pillow kerak: pip install pillow
from PIL import Image, ImageDraw
S = 1024
img = Image.new("RGBA", (S, S), (10, 10, 10, 255))
d = ImageDraw.Draw(img)
d.ellipse((192, 192, 832, 832), outline=(250, 250, 250, 255), width=28)
d.line((512, 512, 512, 330), fill=(250, 250, 250, 255), width=28)
d.line((512, 512, 640, 580), fill=(250, 250, 250, 255), width=28)
img.save("app-icon.png")
