const playButton = document.getElementById('play');
const stopButton = document.getElementById('stop');
const addTrackButton = document.getElementById('add-track');
const recordButton = document.getElementById('record');
const downloadButton = document.getElementById('download');
const playhead = document.getElementById('playhead');
const tracksContainer = document.getElementById('tracks-container');
const tracksContent = tracksContainer.querySelector('.tracks-content');

let isPlaying = false;
let isRecording = false;
let playheadPosition = 0;
let playInterval;
let mediaRecorder;
let audioChunks = [];
let selectedClip = null;
let recordedAudio = null;

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const destination = audioContext.createMediaStreamDestination();
const audioBuffers = {};
let audioSources = {};

// Load audio files
async function loadAudio(instrumentType, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBuffers[instrumentType] = audioBuffer;
    } catch (error) {
        console.error(`Error loading audio for ${instrumentType}:`, error);
    }
}

// Load all audio files
async function loadAllAudio() {
    const audioFiles = {
        piano: 'audio/piano.mp3',
        guitar: 'audio/guitar.mp3',
        drums: 'audio/drum.mp3',
        bass: 'audio/bass.mp3',
        violin: 'audio/violin.mp3',
        silence: 'audio/silence.mp3',
        'strange-beat': 'audio/strange-beat.mp3'
    };

    for (const [instrument, url] of Object.entries(audioFiles)) {
        try {
            await loadAudio(instrument, url);
        } catch (error) {
            console.error(`Failed to load audio for ${instrument}: ${error.message}`);
        }
    }
}

// Call this function when the page loads
loadAllAudio();

function createTrack() {
    const track = document.createElement('div');
    track.className = 'track';

    const trackControls = document.createElement('div');
    trackControls.className = 'track-controls';

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = 0;
    volumeSlider.max = 1;
    volumeSlider.step = 0.01;
    volumeSlider.value = 1;
    volumeSlider.className = 'volume-slider';

    const loopToggle = document.createElement('div');
    loopToggle.className = 'loop-toggle';
    loopToggle.title = 'Toggle Loop';

    const loopIcon = document.createElement('div');
    loopIcon.className = 'loop-icon';
    loopToggle.appendChild(loopIcon);

    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '&times;';
    deleteButton.className = 'delete-button';
    deleteButton.title = 'Delete Track';
    deleteButton.onclick = () => track.remove();

    trackControls.appendChild(volumeSlider);
    trackControls.appendChild(loopToggle);
    trackControls.appendChild(deleteButton);

    const trackContent = document.createElement('div');
    trackContent.className = 'track-content';

    track.appendChild(trackControls);
    track.appendChild(trackContent);

    tracksContent.appendChild(track);

    volumeSlider.addEventListener('input', () => {
        track.volume = volumeSlider.value;
        updateVolumeSlider(volumeSlider);
        track.querySelectorAll('.clip').forEach(clip => {
            if (audioSources[clip.id]) {
                audioSources[clip.id].gainNode.gain.setValueAtTime(clip.volume * track.volume, audioContext.currentTime);
            }
        });
    });

    loopToggle.addEventListener('click', () => {
        loopToggle.classList.toggle('active');
        track.isLooping = loopToggle.classList.contains('active');
    });

    track.addEventListener('click', (e) => {
        if (e.target === trackContent) {
            document.querySelectorAll('.track').forEach(t => t.classList.remove('selected'));
            track.classList.add('selected');
        }
    });
    updateVolumeSlider(volumeSlider);
    updatePlayheadHeight();
    return track;
}

function updatePlayheadHeight() {
    const tracks = document.querySelectorAll('.track');
    const totalHeight = Array.from(tracks).reduce((sum, track) => sum + track.offsetHeight, 0);
    playhead.style.height = `${totalHeight}px`;
}

// Replace the DOMNodeRemoved event listener with a MutationObserver
const tracksObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
            for (let node of mutation.removedNodes) {
                if (node.classList && node.classList.contains('track')) {
                    updatePlayheadHeight();
                    break;
                }
            }
        }
    });
});

tracksObserver.observe(tracksContent, { childList: true });

const micRecordButton = document.getElementById('mic-record');
let isRecordingMic = false;
let micMediaRecorder;
let micAudioChunks = [];

micRecordButton.addEventListener('click', () => {
    if (!isRecordingMic) {
        startMicRecording();
    } else {
        stopMicRecording();
    }
});

async function startMicRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micMediaRecorder = new MediaRecorder(stream);
        micMediaRecorder.start();

        micMediaRecorder.addEventListener("dataavailable", event => {
            micAudioChunks.push(event.data);
        });

        micMediaRecorder.addEventListener("stop", () => {
            const audioBlob = new Blob(micAudioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            addMicRecordingToTrack(audioUrl);
            micAudioChunks = [];
        });

        isRecordingMic = true;
        micRecordButton.classList.add('recording');
    } catch (err) {
        console.error("Error accessing the microphone", err);
    }
}

function stopMicRecording() {
    if (micMediaRecorder && isRecordingMic) {
        micMediaRecorder.stop();
        isRecordingMic = false;
        micRecordButton.classList.remove('recording');
    }
}

function addMicRecordingToTrack(audioUrl) {
    const selectedTrack = document.querySelector('.track.selected') || createTrack();
    const newClip = createClip('mic-recording', playheadPosition);
    newClip.style.width = '100px';
    
    const audio = new Audio(audioUrl);
    audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration;
        const pixelsPerSecond = 10;
        const width = duration * pixelsPerSecond;
        newClip.style.width = `${width}px`;
    });

    newClip.audio = audio;
    selectedTrack.querySelector('.track-content').appendChild(newClip);
}

function createClip(instrumentType, left) {
    const clip = document.createElement('div');
    clip.className = 'clip';
    clip.draggable = true;
    clip.id = `clip-${Date.now()}-${Math.random()}`;
    
    clip.dataset.instrument = instrumentType;
    clip.style.boxSizing = 'content-box';

    const clipLabel = document.createElement('div');
    clipLabel.className = 'clip-label';
    clipLabel.textContent = instrumentType === 'mic-recording' ? 'Mic' : instrumentType;

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = 0;
    volumeSlider.max = 1;
    volumeSlider.step = 0.01;
    volumeSlider.value = 1;
    volumeSlider.className = 'volume-slider';

    const clipContent = document.createElement('div');
    clipContent.className = 'clip-content';
    clipContent.appendChild(clipLabel);
    clipContent.appendChild(volumeSlider);
    clip.appendChild(clipContent);

    clip.style.left = `${left}px`;
    clip.volume = 1;

    if (instrumentType === 'mic-recording') {
        clip.audio = clip.audio; // This will be set when adding the clip to the track
    } else if (audioBuffers[instrumentType]) {
        const duration = audioBuffers[instrumentType].duration;
        const clipWidth = duration * 20; // 20px width per second, adjust as needed
        clip.style.width = `${clipWidth}px`;
    }

    // Update volume slider appearance
    updateVolumeSlider(volumeSlider);

    // Adjust volume
    volumeSlider.addEventListener('input', () => {
        clip.volume = volumeSlider.value;
        updateVolumeSlider(volumeSlider);
        if (audioSources[clip.id]) {
            audioSources[clip.id].gainNode.gain.setValueAtTime(clip.volume, audioContext.currentTime);
        }
    });

    clip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
            id: clip.id,
            instrument: instrumentType,
            left: clip.style.left,
            width: clip.style.width
        }));
    });

    clip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedClip) {
            selectedClip.classList.remove('selected');
        }
        clip.classList.add('selected');
        selectedClip = clip;
    });

    // Add right-click event listener
    clip.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        volumeSlider.style.display = 'block';
    });

    // Add mouse leave event listener
    clip.addEventListener('mouseleave', () => {
        volumeSlider.style.display = 'none';
    });

    return clip;
}

function getTimelineDuration() {
    // Get the maximum duration of all audio elements
    const maxDuration = Math.max(
        ...Object.values(audioBuffers).map(buffer => buffer.duration || 0)
    );
    
    // Add an extra buffer time (e.g., 10 seconds) to prevent the timeline from ending too soon
    const additionalBuffer = 10;
    
    return maxDuration + additionalBuffer;
}

playButton.addEventListener('click', async () => {
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    if (!isPlaying) {
        isPlaying = true;
        playheadPosition = 120;
        playhead.style.left = '120px';

        const startTime = audioContext.currentTime;
        let maxEndTime = 0;
        let isLooping = false;

        document.querySelectorAll('.track').forEach(track => {
            const trackVolume = track.querySelector('.volume-slider').value;
            if (track.isLooping) {
                isLooping = true;
            }
            track.querySelectorAll('.clip').forEach(clip => {
                const instrumentType = clip.dataset.instrument;
                const leftPosition = parseFloat(clip.style.left);
                const trackWidth = tracksContainer.offsetWidth;
                const clipStartTime = (leftPosition / trackWidth) * getTimelineDuration();

                if (instrumentType === 'mic-recording') {
                    if (clip.audio) {
                        const source = audioContext.createMediaElementSource(clip.audio);
                        const gainNode = audioContext.createGain();
                        source.connect(gainNode);
                        gainNode.connect(audioContext.destination);
                        gainNode.gain.setValueAtTime(clip.volume * trackVolume, audioContext.currentTime);
                        
                        const delay = clipStartTime - (audioContext.currentTime - startTime);
                        setTimeout(() => {
                            clip.audio.currentTime = 0;
                            clip.audio.play();
                            if (track.isLooping) {
                                clip.audio.loop = true;
                            }
                        }, Math.max(delay * 1000, 0));

                        audioSources[clip.id] = { source, gainNode };
                        
                        // Update maxEndTime for mic recordings
                        const clipEndTime = clipStartTime + clip.audio.duration;
                        if (clipEndTime > maxEndTime) {
                            maxEndTime = clipEndTime;
                        }
                    }
                } else if (audioBuffers[instrumentType]) {
                    const source = audioContext.createBufferSource();
                    source.buffer = audioBuffers[instrumentType];
                    const gainNode = audioContext.createGain();
                    source.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    gainNode.gain.setValueAtTime(clip.volume * trackVolume, audioContext.currentTime);
                    
                    const delay = clipStartTime - (audioContext.currentTime - startTime);
                    source.start(audioContext.currentTime + Math.max(delay, 0));
                    if (track.isLooping) {
                        source.loop = true;
                    }
                    audioSources[clip.id] = { source, gainNode };

                    // Update maxEndTime for other instruments
                    const clipEndTime = clipStartTime + source.buffer.duration;
                    if (clipEndTime > maxEndTime) {
                        maxEndTime = clipEndTime;
                    }
                }
            });
        });

        // Update playhead position until all audio finishes playing
        playInterval = setInterval(() => {
            const elapsedTime = audioContext.currentTime - startTime;
            const playheadLeft = 120 + (elapsedTime / getTimelineDuration()) * (tracksContainer.offsetWidth - 120);
            playhead.style.left = `${playheadLeft}px`;

            if (!isLooping && elapsedTime >= maxEndTime) {
                clearInterval(playInterval);
                isPlaying = false;
                playheadPosition = 120 + (maxEndTime / getTimelineDuration()) * (tracksContainer.offsetWidth - 120);  
                playhead.style.left = `${playheadPosition}px`;
            }
        }, 50);
    } else {
        clearInterval(playInterval);
        isPlaying = false;
    }
});

stopButton.addEventListener('click', () => {
    clearInterval(playInterval);
    playheadPosition = 120;
    playhead.style.left = '120px';
    isPlaying = false;
    stopAudio();
});

function stopAudio() {
    
    Object.values(audioSources).forEach(({ source, gainNode }) => {
        if (source.stop) {
            source.stop();
        }
        gainNode.disconnect();
    });
    
    document.querySelectorAll('.clip[data-instrument="mic-recording"]').forEach(clip => {
        if (clip.audio) {
            clip.audio.pause();
            clip.audio.currentTime = 0;
        }
    });
    
    audioSources = {};
    
    clearInterval(playInterval);
    playheadPosition = 120;
    playhead.style.left = '120px';
    isPlaying = false;
}

addTrackButton.addEventListener('click', createTrack);

recordButton.addEventListener('click', () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    isRecording = true;
    recordButton.textContent = '⏹️';
    
    const destination = audioContext.createMediaStreamDestination();
    
    document.querySelectorAll('.track').forEach(track => {
        track.querySelectorAll('.clip').forEach(clip => {
            const instrumentType = clip.dataset.instrument;
            if (instrumentType === 'mic-recording') {
                if (clip.audio) {
                    const source = audioContext.createMediaElementSource(clip.audio);
                    source.connect(destination);
                }
            } else if (audioBuffers[instrumentType]) {
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffers[instrumentType];
                source.connect(destination);
                source.start();
            }
        });
    });

    mediaRecorder = new MediaRecorder(destination.stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        recordedAudio = URL.createObjectURL(blob);
    };

    mediaRecorder.start();
}

function stopRecording() {
    if (isRecording) {
        isRecording = false;
        recordButton.textContent = '🔴';
        mediaRecorder.stop();
    }
}

downloadButton.addEventListener('click', () => {
    if (recordedAudio) {
        const a = document.createElement('a');
        a.href = recordedAudio;
        a.download = 'final-mix.mp3';
        a.click();
    } else {
        alert('No recorded audio available. Please record first.');
    }
});

document.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('instrument')) {
        e.dataTransfer.setData('text/plain', e.target.dataset.instrument);
    }
});

tracksContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    const track = e.target.closest('.track');
    if (track) {
        const rect = track.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        e.dataTransfer.dropEffect = 'move';
    }
});

tracksContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    const target = e.target.closest('.track-content');
    if (target) {
        const instrumentType = e.dataTransfer.getData('text/plain');
        const clipData = e.dataTransfer.getData('application/json');

        if (clipData) {
            // Moving existing clip
            const data = JSON.parse(clipData);
            let clip = document.getElementById(data.id);
            if (!clip) {
                clip = createClip(data.instrument, e.offsetX);
            }
            clip.style.left = `${e.offsetX}px`;
            target.appendChild(clip);
        } else if (instrumentType) {
            // Creating new clip
            const clip = createClip(instrumentType, e.offsetX);
            target.appendChild(clip);
        }
        document.querySelectorAll('.track').forEach(t => t.classList.remove('selected'));
        target.closest('.track').classList.add('selected');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete') {
        if (selectedClip) {
            selectedClip.remove();
            selectedClip = null;
        } else {
            const selectedTrack = document.querySelector('.track.selected');
            if (selectedTrack) {
                selectedTrack.remove();
            }
        }
    } else if (e.key === ' ') {
        e.preventDefault();
        if (isPlaying) {
            stopButton.click();
        } else {
            playButton.click();
        }
    } else if (e.key === 'r') {
        recordButton.click();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const tracks = Array.from(document.querySelectorAll('.track'));
        const selectedTrack = document.querySelector('.track.selected');
        if (selectedTrack) {
            const currentIndex = tracks.indexOf(selectedTrack);
            let newIndex;
            if (e.key === 'ArrowUp') {
                newIndex = (currentIndex - 1 + tracks.length) % tracks.length;
            } else {
                newIndex = (currentIndex + 1) % tracks.length;
            }
            selectedTrack.classList.remove('selected');
            tracks[newIndex].classList.add('selected');
        }
    }
});

function generateTimelineMarkers() {
    const timelineContent = document.querySelector('.timeline-content');
    timelineContent.innerHTML = '';
    const totalSeconds = 300; // 5 minutes
    const pixelsPerSecond = 20; // 20 pixels per second
    const offset = 100; // 5 seconds * 20 pixels per second

    for (let i = 0; i <= totalSeconds; i += 10) {
        const marker = document.createElement('div');
        marker.className = 'timeline-marker';
        marker.style.left = `${i * pixelsPerSecond + offset}px`;
        marker.textContent = formatTime(i);
        timelineContent.appendChild(marker);
    }
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Synchronize timeline and tracks scrolling
const timeline = document.querySelector('.timeline');
tracksContainer.addEventListener('scroll', () => {
    timeline.scrollLeft = tracksContainer.scrollLeft;
});

timeline.addEventListener('scroll', () => {
    tracksContainer.scrollLeft = timeline.scrollLeft;
});

function initializeCategories() {
    document.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
            const content = header.nextElementSibling;
            content.classList.toggle('expanded');
        });
    });
}

function updateVolumeSlider(slider) {
    const value = slider.value * 100;
    slider.style.background = `linear-gradient(to right, #b19cd9 0%, #b19cd9 ${value}%, #3a3a3a ${value}%, #3a3a3a 100%)`;
}

document.querySelectorAll('.instrument').forEach(instrument => {
    instrument.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', instrument.textContent);
        e.dataTransfer.setData('instrument-id', instrument.dataset.instrument);
    });
});

document.querySelectorAll('.category-header, .category-content').forEach(dropZone => {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Allow drop
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const instrumentName = e.dataTransfer.getData('text/plain');
        const instrumentId = e.dataTransfer.getData('instrument-id');
        const draggedInstrument = document.querySelector(`[data-instrument="${instrumentId}"]`);

        // Get the corresponding category-content area
        let categoryContent;
        if (dropZone.classList.contains('category-header')) {
            // If dropped on category header, find the next sibling (category-content)
            categoryContent = dropZone.nextElementSibling;
        } else if (dropZone.classList.contains('category-content')) {
            // If dropped on category content area, use it directly
            categoryContent = dropZone;
        }

        // If the dragged instrument exists and is not in the current category
        if (draggedInstrument && categoryContent !== draggedInstrument.parentElement) {
            // Remove the instrument from its original category
            draggedInstrument.parentElement.removeChild(draggedInstrument);
            // Add to the new category
            categoryContent.appendChild(draggedInstrument);
            // Ensure the category is expanded
            categoryContent.classList.add('expanded');
        }
    });
});

function initializeTracks() {
    for (let i = 0; i < 4; i++) {
        createTrack();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeCategories();
    initializeTracks();
    generateTimelineMarkers();
    updatePlayheadHeight();
    playheadPosition = 120;
    playhead.style.left = '120px';
    document.querySelectorAll('.volume-slider').forEach(slider => {
        updateVolumeSlider(slider);
        slider.addEventListener('input', () => updateVolumeSlider(slider));
    });
});