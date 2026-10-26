The app mark is a lavender deck of cards with a play cutout. `icon.svg` is the source; `logo.svg` and `src/brand/mark.svg` use the same artwork. The established wordmark remains separate.

Regenerate `icon.png` with `node scripts/render-icon.cjs /path/to/sharp`. It is a transparent 1024 px PNG used by Electron and the Mac packager. Create `icon.ico` from that PNG using Pillow:

```python
from PIL import Image
Image.open('build/icon.png').save('build/icon.ico', sizes=[(s,s) for s in (16,20,24,32,40,48,64,128,256)])
```

Windows packaging embeds `icon.ico` into the executable and installer. Keep all platform variants in sync when changing the mark.
