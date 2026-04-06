from PIL import Image
import os

def crop_people(image_path, output_dir):
    if not os.path.exists(image_path):
        print(f"Error: {image_path} not found.")
        return
    
    img = Image.open(image_path)
    width, height = img.size
    
    # Relative crop boxes (normalized to a 1000x1000 reference grid)
    crops = [
        {"name": "Prakash Chand Mandil", "box": (380, 5, 615, 275)},
        {"name": "Praveen Mandil", "box": (45, 510, 240, 830)},
        {"name": "Suresh Chand Gupta", "box": (285, 510, 480, 830)},
        {"name": "Rajesh Goyal", "box": (520, 510, 715, 830)},
        {"name": "Madan Mohan Goyal", "box": (760, 510, 955, 830)}
    ]
    
    os.makedirs(output_dir, exist_ok=True)
    
    for i, person in enumerate(crops, 1):
        left, top, right, bottom = person["box"]
        # Scale relative coordinates to actual image dimensions
        p_left = left / 1000 * width
        p_top = top / 1000 * height
        p_right = right / 1000 * width
        p_bottom = bottom / 1000 * height
        
        output_path = os.path.join(output_dir, f"person{i}.jpeg")
        img.crop((p_left, p_top, p_right, p_bottom)).save(output_path)
        print(f"Saved {person['name']} to {output_path}")

if __name__ == "__main__":
    IMAGE_PATH = r"c:\Users\astit\Desktop\samaj\context\footer.jpeg"
    ASSETS_DIR = r"c:\Users\astit\Desktop\samaj\assets"
    crop_people(IMAGE_PATH, ASSETS_DIR)
