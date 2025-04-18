import json
import re

# Function to parse video data from the text file
def parse_video_data(txt_file, anime_name, anime_code):
    anime_data = {
        "anime_list": {}
    }

    # Prompt for anime name and anime code
    anime_data["anime_list"][anime_name] = {
        "anime_id": anime_code,
        "Season 1": {
            "season_id": "s1",
            "episodes": {}
        }
    }

    with open(txt_file, 'r') as file:
        content = file.read()
        # Split the content by file entries
        entries = content.strip().split('\n\n')

        for entry in entries:
            data = {}
            # Extracting File Name, File ID, File Unique ID, and File Size using regex
            name_match = re.search(r"File Name: (.+)", entry)
            file_id_match = re.search(r"File ID: (.+)", entry)
            unique_id_match = re.search(r"File Unique ID: (.+)", entry)
            size_match = re.search(r"File Size: (\d+)", entry)

            if name_match and file_id_match and unique_id_match and size_match:
                file_name = name_match.group(1)
                file_id = file_id_match.group(1)
                file_unique_id = unique_id_match.group(1)
                file_size = int(size_match.group(1))

                # Extract episode and quality from file name
                episode, quality = parse_file_name(file_name)

                if episode and quality:
                    # Format episode name as "Episode 1"
                    episode_name = f"Episode {episode}"

                    # Add episode details to the data structure
                    episode_data = {
                        "ep_name": episode_name,
                        "ep_number": episode,
                        "qualities": {
                            quality: {
                                "file_url": "n/a",
                                "file_id": file_id,
                                "file_unique_id": file_unique_id,
                                "file_size": f"{file_size / (1024 * 1024):.2f} MB"  # Convert size to MB
                            }
                        }
                    }

                    # If episode already exists, append the quality
                    if episode_name in anime_data["anime_list"][anime_name]["Season 1"]["episodes"]:
                        anime_data["anime_list"][anime_name]["Season 1"]["episodes"][episode_name]["qualities"][quality] = episode_data["qualities"][quality]
                    else:
                        anime_data["anime_list"][anime_name]["Season 1"]["episodes"][episode_name] = episode_data

    return anime_data


# Function to parse episode and quality from file name
def parse_file_name(file_name):
    match = re.match(r"(\d+)\[(\d+p)\]", file_name)
    if match:
        episode = match.group(1)
        quality = match.group(2)
        return episode, quality
    return None, None


# Main function
def main():
    # Prompt user for anime name and code
    anime_name = input("Enter the anime name: ")
    anime_code = input("Enter the anime code: ")

    txt_file = 'video_data.txt'  # Replace with the correct path if needed

    # Parse the video data and get formatted output
    anime_data = parse_video_data(txt_file, anime_name, anime_code)

    # Save the parsed data to a JSON file
    with open('data.json', 'w') as json_file:
        json.dump(anime_data, json_file, indent=4)

    print("Data successfully saved to data.json.")


if __name__ == "__main__":
    main()
