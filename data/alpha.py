import json

# Load JSON data
with open("data.json", "r", encoding="utf-8") as file:
    data = json.load(file)

# Sort anime names
sorted_anime_list = {anime: data["anime_list"][anime] for anime in sorted(data["anime_list"])}

# Update the JSON structure
sorted_data = {"anime_list": sorted_anime_list}

# Save the sorted JSON back to file
with open("sorted_data.json", "w", encoding="utf-8") as file:
    json.dump(sorted_data, file, indent=4, ensure_ascii=False)

print("JSON sorted and saved as sorted_data.json")
