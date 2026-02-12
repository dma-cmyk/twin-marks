import os
from PIL import Image

# 入力ファイルパス
input_path = "public/Whisk_5e6bbe242133923a5d44834e6368ed79dr.jpeg"
output_dir = "public"

# 生成するサイズ
sizes = [16, 48, 128]

try:
    with Image.open(input_path) as img:
        # 画像を正方形にトリミング（中央寄せ）
        width, height = img.size
        new_size = min(width, height)
        
        left = (width - new_size) / 2
        top = (height - new_size) / 2
        right = (width + new_size) / 2
        bottom = (height + new_size) / 2
        
        img_cropped = img.crop((left, top, right, bottom))

        for size in sizes:
            # リサイズ
            img_resized = img_cropped.resize((size, size), Image.Resampling.LANCZOS)
            
            # 保存
            output_filename = f"icon{size}.png"
            output_path = os.path.join(output_dir, output_filename)
            img_resized.save(output_path, "PNG")
            print(f"Generated: {output_path}")

except Exception as e:
    print(f"Error: {e}")
