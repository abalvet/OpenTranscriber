# OpenTranscriber

A standalone, browser-based transcription tool for linguists and researchers. Designed with the help of coding AIs as a modern, open-source replacement for legacy transcription software like [Transcriber](http://trans.sourceforge.net/). This applet is meant as the first tool in a corpus transcription and annotation pipeline. As such, its purpose and features are voluntarily limited, the idea being that more complex annotations will be performed with other tooles, such as [ELAN](https://archive.mpi.nl/tla/elan), [PRAAT](https://www.fon.hum.uva.nl/praat/), or other transcription/annotation tools. This applet relies heavily on [Wavesurfer](https://wavesurfer.xyz/) for sound segments management and visualization.  

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-7.0.0-green.svg)
![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow.svg)

This applet is meant as a companion tool for UMR STL's ["DOC-STL" corpus project](https://www.ortolang.fr/market/corpora/doc-stl/).

## Features

### Core Functionality

- **Multi-speaker annotation** with individual speaker tracks, more speakers can be added as necessary
- **Waveform visualization** with synchronized playback across all tracks
- **Spectrogram display** (formants) for acoustic analysis
- **Multiple segmentation methods**:
  - Manual marking with `S` key
  - Mouse drag segment selection
  - Automatic silence detection
  - F0-based speaker clustering

### Editing & Navigation

- **Inline transcription editor** with keyboard-focused workflow
- **Segment loop playback** for detailed transcription
- **Speaker filtering** on master track (useful for overlapping speech): toggle speakers to edit specific zones, particularly when overlaps occur 
- **Undo/Redo support** (Ctrl+Z / Ctrl+Y), limited to auto-segmentation in this version

### Audio Processing

- **Highpass/Lowpass filters** to isolate vocal frequencies
- **Playback speed control** (0.5× to 2×) without pitch alteration
- **Volume and zoom controls**

### Import/Export

- **Project save/load** with timestamped JSON files
- **Export formats**:
  - ELAN (.eaf)
  - Praat TextGrid
  - SRT subtitles
  - JSON
  - CSV

## Quick Start

### Option 1: Direct Use (No Server)
1. Download or clone the repository
2. Open `index.html` in a modern browser (Chrome, Firefox, Safari), or use the applet from Github/Gitlab pages
3. Load an audio file and start transcribing

### Option 2: Local Server (Recommended)
```bash
cd opentranscriber
python3 -m http.server 8000
# Open http://localhost:8000
```

## Keyboard Shortcuts

### Playback
| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `←` / `→` | Skip ±5 seconds |
| `Home` | Go to start |
| `End` | Go to end |

### Segmentation
| Key | Action |
|-----|--------|
| `S` | Mark start (first press) |
| `S` | Mark end (second press) |
| Mouse drag | Create segment by selection |
| Double-click | Edit segment |

### Editing
| Key | Action |
|-----|--------|
| `Enter` | Save transcription & next |
| `Page Up` | Assign to previous speaker |
| `Page Down` | Assign to next speaker |
| `Delete` | Delete selected segment |
| `L` | Toggle loop playback |

### Navigation & History
| Key | Action |
|-----|--------|
| `N` | Next segment |
| `P` | Previous segment |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Escape` | Deselect |
| `?` | Show help |

## Auto-Segmentation Strategies

### 1. Silence Detection (Simple)

Fast and reliable segmentation based on pause detection.

- Best for: clean recordings with clear pauses
- Parameters: silence threshold, minimum pause/segment duration

### 2. Silence + F0 (Medium)

Combines silence detection with fundamental frequency analysis for automatic speaker attribution.

- Best for: 2-3 speakers with distinct voice pitches
- Parameters: F0 range, number of speakers

### 3. VAD + Clustering (Advanced)

Voice Activity Detection with spectral feature clustering.

- Best for: noisy recordings, complex conversations
- Uses: energy, ZCR, spectral centroid

Caveat: does not work properly in the current version

## Export Formats

### ELAN (.eaf)

Standard XML format for [ELAN](https://archive.mpi.nl/tla/elan) software.

- Time-aligned tiers per speaker
- Full Unicode support

### Praat TextGrid
Compatible with [Praat](https://www.fon.hum.uva.nl/praat/) for acoustic analysis.
- IntervalTier per speaker
- Precise timestamps

### SRT Subtitles
Standard subtitle format for video playback.

### JSON
Machine-readable format for further processing.
```json
{
  "version": "7.0",
  "savedAt": "2025-01-15T14:30:00Z",
  "audio": {"filename": "interview.mp3", "duration": 1847.5},
  "speakers": [
    {"id": 1, "name": "Interviewer"},
    {"id": 2, "name": "Participant"}
  ],
  "segments": [
    {"id": "seg_123", "start": 12.5, "end": 18.3, "speaker": 1, "transcription": "..."}
  ]
}
```

### CSV

Spreadsheet-compatible format for data analysis.

## Workflow Tips

### Overlapping Speech
1. Use speaker filter radio buttons to show one speaker at a time
2. Adjust segment boundaries for that speaker
3. Switch to next speaker and repeat
4. Use "All" to review the complete annotation

### Voice Discrimination

1. Apply highpass filter (~120 Hz) to hear high-pitched voices better
2. Apply lowpass filter (~2500 Hz) for deeper voices
3. Reset filters before final transcription

### Efficient Transcription

1. Auto-segment the audio
2. Click first segment, type transcription
3. Press `Enter` to save and move to next
4. Use `Page Up/Down` to reassign speakers
5. Save regularly with timestamped files

## Technical Requirements

- **Browser**: Chrome 80+, Firefox 75+, Safari 14+, Edge 80+
- **Audio formats**: MP3, WAV, OGG, FLAC, M4A (browser-dependent)
- **Recommended file size**: < 100 MB for optimal performance

## Architecture

```
opentranscriber/
├── index.html      # Main interface
├── app.js          # Application logic (~2100 lines)
├── styles.css      # Styling
└── README.md       # This file
```

### Dependencies

- [WaveSurfer.js 7.x](https://wavesurfer.xyz/) - Waveform visualization
  - Regions plugin: segment management
  - Spectrogram plugin: formant display
  - Timeline plugin: time axis

All dependencies are loaded from CDN (unpkg.com).

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

### Development Setup

1. Clone the repository
2. Serve with any HTTP server
3. Edit files and refresh browser

### Code Style

- ES6+ JavaScript
- JSDoc comments for public methods
- Consistent naming: camelCase for variables, PascalCase for classes

## Roadmap

- [ ] Waveform-level zoom sync across speaker tracks
- [ ] Sound pre-processing to help better discriminate speakers
- [ ] Sound pre-processing to help better discriminate speech vs noise
- [ ] Merge adjacent segments
- [ ] Split segment at cursor
- [ ] Find & replace in transcriptions
- [ ] Auto-complete features
- [ ] Auto-save to localStorage
- [ ] STT integration (Whisper or other API)
- [ ] Multi-language interface

## License

MIT License - See [LICENSE](LICENSE) file for details.
This tool 


## Acknowledgments

- Inspired by [Transcriber](http://trans.sourceforge.net/) by DGA
- Built with [WaveSurfer.js](https://wavesurfer.xyz/)
- Developed for the linguistics research community


 ## Caveats
 
 This tool is provided "as is". Be aware that this is not a full-fledged speech transcription/annotation platform, just a simple, lightweight and frictionless tool to help humans (linguists) transcribe audio recordings with multiple speakers.

---

**Questions?** Open an issue on GitHub or GitLab.
