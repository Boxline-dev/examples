"""Runs in the session's shell: combines the screenshots given as arguments into output/report.pdf, one page each,
with Pillow (installed in the shell). Prints the number of pages."""
import sys

from PIL import Image

pages = [Image.open(path).convert("RGB") for path in sys.argv[1:]]
pages[0].save("output/report.pdf", save_all=True, append_images=pages[1:], resolution=96)
print(len(pages))
