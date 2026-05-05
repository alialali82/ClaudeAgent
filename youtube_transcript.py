import re

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except ImportError:
    raise ImportError(
        "youtube-transcript-api is not installed.\n"
        "Install it via the PythonAnywhere Bash console:\n"
        "  pip install --user youtube-transcript-api"
    )

def extract_video_id(url):
    patterns = [
        r'youtube\.com/watch\?v=([^&\n?#]+)',
        r'youtu\.be/([^&\n?#]+)',
        r'youtube\.com/embed/([^&\n?#]+)',
        r'youtube\.com/shorts/([^&\n?#]+)',
        r'youtube\.com/v/([^&\n?#]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def format_transcript(transcript_list):
    lines = []
    total_duration = 0.0
    for entry in transcript_list:
        text = entry['text'].replace('\n', ' ').strip()
        if text:
            lines.append(text)
        total_duration = max(total_duration, entry.get('start', 0) + entry.get('duration', 0))
    return ' '.join(lines), total_duration

def main(input_data):
    try:
        video_url = (
            input_data.get('url') or
            input_data.get('video_url') or
            input_data.get('link') or
            ''
        ).strip()

        if not video_url:
            return {'error': 'No video URL provided', 'transcript': ''}

        video_id = extract_video_id(video_url)
        if not video_id:
            return {'error': 'Could not extract video ID from URL', 'transcript': ''}

        preferred_languages = input_data.get('languages', ['en', 'en-US', 'en-GB'])

        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=preferred_languages)
        except Exception:
            try:
                # Fall back to any available transcript
                transcripts = YouTubeTranscriptApi.list_transcripts(video_id)
                transcript_list = transcripts.find_generated_transcript(
                    transcripts._manually_created_transcripts or
                    list(transcripts._generated_transcripts.keys())
                ).fetch()
            except Exception as e:
                return {'error': f'Transcript extraction failed: {str(e)}', 'transcript': ''}

        formatted_transcript, duration = format_transcript(transcript_list)
        word_count = len(formatted_transcript.split())

        return {
            'success': True,
            'video_id': video_id,
            'transcript': formatted_transcript,
            'word_count': word_count,
            'duration_seconds': round(duration, 2),
        }

    except Exception as e:
        return {'error': f'Unexpected error: {str(e)}', 'transcript': ''}


# Example usage
if __name__ == '__main__':
    result = main({'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'})
    if result.get('success'):
        print(f"Video ID   : {result['video_id']}")
        print(f"Words      : {result['word_count']}")
        print(f"Duration   : {result['duration_seconds']}s")
        print(f"Transcript :\n{result['transcript'][:500]}...")
    else:
        print(f"Error: {result['error']}")
