"""
copy_icons.py — copies the generated icon into the icons/ folder
Run: python copy_icons.py
"""
import shutil, os

src  = r"C:\Users\Jolly\.gemini\antigravity\brain\d0ff3470-6177-4172-8367-af88247ff8c6\icon_512_1782395430312.png"
base = r"C:\Users\Jolly\Desktop\Travel Assistant\icons"

os.makedirs(base, exist_ok=True)

shutil.copy2(src, os.path.join(base, "icon-512.png"))
shutil.copy2(src, os.path.join(base, "icon-192.png"))
print("Icons copied successfully!")
